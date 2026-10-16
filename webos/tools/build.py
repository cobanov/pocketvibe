#!/usr/bin/env python3
"""Builds the PocketVibe LG webOS app (.ipk) from this repository.

    ./webos/build.sh                      (installs esbuild + ares-package, then runs this)
    python3 webos/tools/build.py [options]

What it does:
  1. takes the launcher from app/pocketvibe/ (the same one the handheld uses), so merging upstream brings its new features;
  2. patches it for a TV (remote/pointer/gamepad shim, two small launcher tweaks) and lowers JS/CSS to Chromium 68;
  3. bundles a few games (downloaded from the store, or from --games-dir), lowered the same way;
  4. adds the ARM esbuild binary the TV uses to lower games installed later, and a CA list;
  5. packs everything with ares-package into webos/dist/com.pocketvibe.app_<version>_all.ipk.

Every patch asserts that the text it replaces is still there: if upstream changes the launcher, the build fails loudly
instead of silently shipping a half-patched app.
"""
import argparse, gzip, hashlib, json, os, pathlib, re, shutil, subprocess, sys, urllib.request, zipfile

HERE = pathlib.Path(__file__).resolve().parent
WEBOS = HERE.parent
ROOT = WEBOS.parent
SRC = ROOT / 'app' / 'pocketvibe'
BUILD = WEBOS / 'build'
DIST = WEBOS / 'dist'
TARGET = '--target=chrome68'
STORE = 'https://pocketvibe-store.mertcobanov.workers.dev/catalog.json'
ESBUILD_VERSION = os.environ.get('ESBUILD_VERSION', '0.28.2')


def die(msg):
    sys.exit('build failed: ' + msg)


def find_tool(env, names):
    if os.environ.get(env): return os.environ[env]
    for n in names:
        p = shutil.which(n)
        if p: return p
        p = BUILD / 'node' / 'node_modules' / '.bin' / n
        if p.exists(): return str(p)
    die(f'{names[0]} not found (run webos/build.sh, or set ${env})')


def esbuild(args, text):
    r = subprocess.run([ESB, *args], input=text.encode(), capture_output=True)
    if r.returncode: die('esbuild: ' + r.stderr.decode()[:500])
    return r.stdout.decode()


def replace_once(text, old, new, what):
    if old not in text: die(f'upstream changed: cannot find {what!r}; update webos/tools/build.py')
    return text.replace(old, new, 1)


# ---------- launcher ----------
def fix_css(text):
    """Chromium 68 lacks aspect-ratio, min(), multi-value inset and flex gap."""
    text = re.sub(r'aspect-ratio:\s*16\s*/\s*9;', '', text)
    text = text.replace('.side-cover {', '.side-cover {\n  height: 113px;').replace('.splash-cover {', '.splash-cover {\n  height: 189px;')
    text += '\n.cover::before { content: ""; flex: none; width: 0; padding-top: 56.25%; }\n'

    def split_min(m):
        i, depth = m.end(), 1
        while depth:
            depth += {'(': 1, ')': -1}.get(text[i], 0); i += 1
        inner, d, parts, cur = text[m.end():i - 1], 0, [], ''
        for ch in inner:
            if ch == ',' and d == 0: parts.append(cur.strip()); cur = ''; continue
            d += {'(': 1, ')': -1}.get(ch, 0); cur += ch
        parts.append(cur.strip())
        return i, parts

    out, pos = '', 0
    for m in re.finditer(r'(?<![-\w])(width|max-width|max-height):\s*min\(', text):
        if m.start() < pos: continue
        end, parts = split_min(m)
        end = text.index(';', end) + 1
        prop = m.group(1)
        rep = f'{prop}: {parts[0]};' if prop != 'width' else f'width: {parts[0]};\n  max-width: {parts[1]};'
        out += text[pos:m.start()] + rep; pos = end
    text = out + text[pos:]
    # flex gap -> margin fallback, switched on by the shim's .pv-nogap class
    plain = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    extra = []
    for m in re.finditer(r'(?:^|})\s*([^{}@]+)\{([^{}]*)\}', plain):
        sel, body = m.group(1).strip(), m.group(2)
        g = re.search(r'(?<![-\w])gap:\s*([^;]+);', body)
        if not g or not re.search(r'display:\s*(inline-)?flex', body): continue
        vals, col = g.group(1).split(), re.search(r'flex-direction:\s*column', body)
        for s in sel.split(','):
            extra.append(f'.pv-nogap {s.strip()} > * + * {{ {"margin-top" if col else "margin-left"}: {vals[0] if col else vals[-1]}; }}')
    text += '\n/* flex gap fallback */\n' + '\n'.join(extra) + '\n'
    text = esbuild([TARGET, '--loader=css'], text)
    return re.sub(r'inset:\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+);', r'top: \1; right: \2; bottom: \3; left: \4;', text)


def build_launcher(svc):
    L = svc / 'launcher'
    shutil.copytree(SRC / 'launcher', L)
    shutil.copy(HERE / 'webos-shim.js', L / 'webos-shim.js')
    shutil.copy(HERE / 'gamepad.html', L / 'gamepad.html')

    js = (L / 'launcher.js').read_text()
    # a TV is not a phone, but it has the same limits: no save backups, no in-app updates (a new .ipk is the update)
    js = replace_once(js, "const mobile = info.platform === 'android' || info.platform === 'ios';",
                      "const mobile = ['android', 'ios', 'webos'].includes(info.platform);", 'mobile platform check')
    js = replace_once(js, "...(info.platform === 'ios' ? [] : [{ id: 'update'",
                      "...(['ios', 'webos'].includes(info.platform) ? [] : [{ id: 'update'", 'app update row')
    js += (HERE / 'pointer.js').read_text()   # Magic Remote pointer support
    (L / 'launcher.js').write_text(js)

    # play.js uses top-level await (Chromium 89+): wrap everything after the imports; the leave hint says BACK
    lines = (L / 'play.js').read_text().split('\n')
    last = max(i for i, l in enumerate(lines) if l.startswith('import '))
    play = '\n'.join(lines[:last + 1] + ['(async () => {'] + lines[last + 1:] + ['})();'])
    play = replace_once(play, '<b class="hint">START</b>+<b class="hint">SELECT</b>', '<b class="hint">BACK</b>', 'leave hint')
    (L / 'play.js').write_text(play)

    for f in L.glob('*.js'):
        if f.name != 'webos-shim.js':
            f.write_text(esbuild([TARGET, '--format=esm'], f.read_text()))
    for f in L.glob('*.css'):
        f.write_text(fix_css(f.read_text()))


# ---------- games ----------
def http_get(url):
    req = urllib.request.Request(url, headers={'X-PocketVibe-Mirror': '1', 'User-Agent': 'PocketVibe-webos-build'})
    return urllib.request.urlopen(req, timeout=60).read()


def collect_games(ids, games_dir, out):
    out.mkdir(parents=True)
    if games_dir:
        found = {p.stem: p for p in pathlib.Path(games_dir).glob('*.zip')}
        missing = [g for g in ids if g not in found]
        if missing: die(f'no zip for {missing} in {games_dir}')
        for g in ids: shutil.copy(found[g], out / f'{g}.zip')
        return
    catalog = {g['id']: g for g in json.loads(http_get(STORE))['games']}
    for g in ids:
        data = http_get(catalog[g]['download'])
        if catalog[g].get('sha256') and hashlib.sha256(data).hexdigest() != catalog[g]['sha256']:
            die(f'{g}: checksum mismatch')
        (out / f'{g}.zip').write_bytes(data)
        print('downloaded', g, catalog[g]['version'])


def lower_games(folder):
    for z in sorted(folder.glob('*.zip')):
        tmp = z.with_suffix('.tmp')
        with zipfile.ZipFile(z) as zi, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zo:
            for info in zi.infolist():
                data = zi.read(info)
                if info.filename.endswith(('.js', '.mjs')):
                    data = esbuild([TARGET, '--format=esm', '--minify-whitespace', '--legal-comments=none'], data.decode()).encode()
                elif info.filename.endswith('.css'):
                    data = esbuild([TARGET, '--loader=css', '--minify-whitespace'], data.decode()).encode()
                zo.writestr(info.filename, data)
        tmp.replace(z)
        print('lowered', z.name)


# ---------- ARM esbuild + CA list for the TV ----------
def arm_esbuild(svc):
    cache = BUILD / 'cache'; cache.mkdir(parents=True, exist_ok=True)
    gz = cache / f'esbuild-linux-arm-{ESBUILD_VERSION}.gz'
    if not gz.exists():
        tmp = cache / 'pack'; shutil.rmtree(tmp, ignore_errors=True); tmp.mkdir()
        subprocess.run(['npm', 'pack', f'@esbuild/linux-arm@{ESBUILD_VERSION}', '--silent'], cwd=tmp, check=True, capture_output=True)
        import tarfile
        with tarfile.open(next(tmp.glob('*.tgz'))) as t:
            data = t.extractfile('package/bin/esbuild').read()
        gz.write_bytes(gzip.compress(data, 9))
    (svc / 'bin').mkdir(exist_ok=True)
    shutil.copy(gz, svc / 'bin' / 'esbuild.gz')


def ca_list(svc):
    try:
        data = http_get('https://curl.se/ca/cacert.pem')
    except Exception:
        data = pathlib.Path('/etc/ssl/certs/ca-certificates.crt').read_bytes()
    (svc / 'ca.pem').write_bytes(data)


def main():
    global ESB
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--games', default='jet-rush,tower-stack', help='store games to bundle (default keeps the .ipk small)')
    ap.add_argument('--games-dir', help='use <id>.zip files from this folder instead of downloading')
    ap.add_argument('--no-package', action='store_true', help='stop before ares-package')
    a = ap.parse_args()
    if not (SRC / 'config.json').exists(): die(f'{SRC} not found: run this inside a PocketVibe checkout')
    ESB = find_tool('ESBUILD', ['esbuild'])
    version = json.loads((SRC / 'config.json').read_text())['version']

    shutil.rmtree(BUILD / 'app', ignore_errors=True); shutil.rmtree(BUILD / 'service', ignore_errors=True)
    shutil.copytree(WEBOS / 'app', BUILD / 'app')
    shutil.copytree(WEBOS / 'service', BUILD / 'service')
    info = BUILD / 'app' / 'appinfo.json'
    info.write_text(info.read_text().replace('@VERSION@', version))
    shutil.copy(SRC / 'config.json', BUILD / 'service' / 'config.json')

    svc = BUILD / 'service'
    build_launcher(svc)
    ids = [g for g in a.games.split(',') if g]
    if ids:
        collect_games(ids, a.games_dir, svc / 'bundled'); lower_games(svc / 'bundled')
    arm_esbuild(svc); ca_list(svc)
    print(f'launcher {version} ready in {svc}')
    if a.no_package: return
    DIST.mkdir(exist_ok=True)
    for old in DIST.glob('*.ipk'): old.unlink()
    ares = find_tool('ARES', ['ares-package'])
    subprocess.run([ares, str(BUILD / 'app'), str(svc), '-o', str(DIST), '--no-minify'], check=True)
    print('->', next(DIST.glob('*.ipk')))


if __name__ == '__main__':
    main()
