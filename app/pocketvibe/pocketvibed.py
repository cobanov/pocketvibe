#!/usr/bin/env python3
"""pocketvibed: the handheld app's local service.

Serves the launcher UI, serves each installed game on its own port (so every
game has its own origin and its own localStorage) and talks to the store:
catalog, covers, downloads and installs. The launcher in the browser engine
only ever talks to this process on 127.0.0.1.

It also owns the way out of a game: it reads the gamepad straight from the
kernel, so holding Start + Select works whatever the game does, even if the
game has hung.
"""

import fcntl
import hashlib
import json
import os
import re
import select
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP = Path(__file__).resolve().parent
HOME = Path(os.environ.get('POCKETVIBE_HOME', '/storage/pocketvibe'))
GAMES = HOME / 'games'
CACHE = HOME / 'cache'
PORT = 8730
CONFIG = json.loads((APP / 'config.json').read_text())
VERSION = CONFIG.get('version', '0.1.0')
# Where new versions of the app are announced: GitHub's "latest release" API.
# A file named dev-update-url in HOME overrides it, for testing updates.
UPDATE_URL = os.environ.get('POCKETVIBE_UPDATES') or CONFIG.get('update_url', '')
UPDATE_CHECK_EVERY = 6 * 3600  # seconds between checks, so GitHub is not asked on every start
DEFAULT_STORE = os.environ.get('POCKETVIBE_STORE', CONFIG['store_url'])
SETTINGS_FILE = HOME / 'settings.json'
PLAYS_FILE = HOME / 'plays.json'  # when each game was last played, for "Recently played"
PORTS_FILE = HOME / 'ports.json'  # the port each game is served on, kept for good
DEFAULT_SETTINGS = {
    'language': 'en',
    'music': True,
    'musicVolume': 0.5,
    'uiSounds': True,
    'showFps': False,
    'stores': [DEFAULT_STORE],
}
LAUNCHER_URL = f'http://127.0.0.1:{PORT}/'
GAME_ID = re.compile(r'[a-z0-9][a-z0-9-]{0,63}')
RUNTIME = HOME / 'runtime'  # the Debian root with WPE WebKit; runtime.py runs things in it
QUIT_FLAG = Path('/tmp/pocketvibe-quit')  # tells PocketVibe.sh not to restart the browser
RESTART_FLAG = Path('/tmp/pocketvibe-restart')  # tells PocketVibe.sh to start again (after an update)
BUSY_FLAG = Path('/tmp/pocketvibe-busy')  # PocketVibe.sh waits for it to go before reopening the browser
WEB_DATA = RUNTIME / 'root' / '.local' / 'share' / 'wpe'  # WebKit's data; storage/ holds every game's saves
BACKUPS = HOME / 'backups'
BACKUP_NAME = re.compile(r'saves-\d{8}-\d{6}\.zip')
AUDIO_CACHE = CACHE / 'audio'  # audio the launcher rendered once (menu music)
AUDIO_NAME = re.compile(r'[a-z0-9-]{1,64}\.wav')

EV_SYN, EV_KEY = 0, 1
BTN_SELECT, BTN_START = 314, 315
KEY_F13 = 183
UI_SET_EVBIT, UI_SET_KEYBIT = 0x40045564, 0x40045565
UI_DEV_SETUP, UI_DEV_CREATE = 0x405C5503, 0x5501
HOME_HOLD = 0.4  # seconds holding Start + Select to return to the launcher
QUIT_HOLD = 3.0  # seconds to quit the app, in case the launcher itself hangs

jobs = {}  # game id -> {'state', 'progress', 'error'}
game_servers = {}  # game id -> (server, port)
lock = threading.Lock()
files_lock = threading.Lock()  # settings.json, plays.json and ports.json are read, changed and written under it
launcher_server = None
in_game = False
notice = None  # a message for the launcher to show the next time it loads


def open_url(url, timeout=10):
    """GET a URL as PocketVibe. Cloudflare turns away Python's default User-Agent."""
    request = urllib.request.Request(url, headers={'User-Agent': f'PocketVibe/{VERSION}'})
    return urllib.request.urlopen(request, timeout=timeout)


def read_json(path, fallback):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return fallback


def write_json(path, data):
    """Write a file whole or not at all: a full card or a power cut never
    leaves it empty."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f'.{path.name}.tmp')
    temp.write_text(json.dumps(data, indent=2))
    os.replace(temp, path)


def load_settings():
    saved = read_json(SETTINGS_FILE, {})
    if not isinstance(saved, dict):
        saved = {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in saved.items() if k in DEFAULT_SETTINGS}}


def save_settings(changes):
    with files_lock:
        return _save_settings(changes if isinstance(changes, dict) else {})


def _save_settings(changes):
    settings = load_settings()
    for key, value in changes.items():
        default = DEFAULT_SETTINGS.get(key)
        if default is None:
            continue
        if isinstance(default, bool) and isinstance(value, bool):
            settings[key] = value
        elif isinstance(default, float) and isinstance(value, (int, float)) and not isinstance(value, bool):
            settings[key] = min(max(float(value), 0.0), 1.0)
        elif isinstance(default, str) and isinstance(value, str):
            settings[key] = value
        elif key == 'stores' and isinstance(value, list):
            urls = [u.strip() for u in value if isinstance(u, str) and re.match(r'https?://\S+$', u.strip())]
            settings[key] = list(dict.fromkeys(urls))[:10]
    write_json(SETTINGS_FILE, settings)
    return settings


def valid_id(gid):
    return bool(GAME_ID.fullmatch(gid or ''))


def read_manifest(game_dir):
    meta = {}
    # openboy.json is the manifest's name from before the project was renamed.
    for name in ('pocketvibe.json', 'openboy.json'):
        try:
            meta = json.loads((game_dir / name).read_text())
            break
        except (OSError, ValueError):
            continue
    if not isinstance(meta, dict):
        meta = {}
    meta.setdefault('id', game_dir.name)
    meta.setdefault('title', game_dir.name.replace('-', ' ').title())
    meta.setdefault('entry', 'index.html')
    return meta


def load_plays():
    plays = read_json(PLAYS_FILE, {})
    return plays if isinstance(plays, dict) else {}


def record_play(gid):
    """Best effort: a full card must not stop a game from starting."""
    try:
        with files_lock:
            plays = load_plays()
            entry = plays.get(gid, {'count': 0})
            plays[gid] = {'count': entry.get('count', 0) + 1, 'last': time.time()}
            write_json(PLAYS_FILE, plays)
    except OSError:
        pass


def library():
    if not GAMES.is_dir():
        return []
    plays = load_plays()
    games = []
    for game_dir in sorted(GAMES.iterdir()):
        if game_dir.is_dir() and not game_dir.name.startswith('.'):
            meta = read_manifest(game_dir)
            for key in ('id', 'title', 'entry'):
                meta[key] = str(meta[key])
            played = plays.get(meta['id'], {})
            if not isinstance(played, dict):
                played = {}
            meta['lastPlayed'] = played.get('last', 0)
            meta['plays'] = played.get('count', 0)
            games.append(meta)
    return sorted(games, key=lambda g: g['title'].lower())


MAX_CATALOG = 4 << 20  # bytes; a store's catalog is a few KB
TEXT_FIELDS = ('title', 'author', 'version', 'description', 'genre', 'entry', 'download', 'cover', 'sha256', 'updated')


def catalog_entries(data):
    """The usable games of one store's catalog. Anything malformed is left
    out, so one broken store cannot break the others."""
    if not isinstance(data, dict) or not isinstance(data.get('games'), list):
        return []
    entries = []
    for game in data['games']:
        if not isinstance(game, dict) or not isinstance(game.get('id'), str) or not valid_id(game['id']):
            continue
        if not isinstance(game.get('title'), str) or not isinstance(game.get('download'), str):
            continue
        entry = {k: v for k, v in game.items() if k not in TEXT_FIELDS or isinstance(v, str)}
        if not isinstance(entry.get('controls', {}), dict):
            del entry['controls']
        for key in ('size', 'downloads'):
            if not isinstance(entry.get(key, 0), int) or isinstance(entry.get(key), bool):
                del entry[key]
        entries.append(entry)
    return entries


def fetch_catalog(url):
    """One store's catalog, falling back to the last copy when offline."""
    cached = CACHE / f'catalog-{hashlib.sha1(url.encode()).hexdigest()[:12]}.json'
    try:
        with open_url(url) as r:
            body = r.read(MAX_CATALOG + 1)
        if len(body) > MAX_CATALOG:
            raise ValueError('catalog too large')
        data = json.loads(body)
        if not isinstance(data, dict):
            raise ValueError('not a catalog')
        CACHE.mkdir(parents=True, exist_ok=True)
        write_json(cached, data)
        return data, True
    except (OSError, ValueError):
        data = read_json(cached, {'games': []})
        return (data if isinstance(data, dict) else {'games': []}), False


catalog_cache = (0.0, [], [])  # (when, games, stores) from the last merged_catalog


def merged_catalog(max_age=0):
    """Games from every store in the settings; on a clash the first store wins.
    With max_age, a copy fetched less than that many seconds ago will do."""
    global catalog_cache
    if max_age and time.monotonic() - catalog_cache[0] < max_age:
        return catalog_cache[1], catalog_cache[2]
    urls = load_settings()['stores']
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch_catalog, urls))
    games, stores = {}, []
    for url, (data, online) in zip(urls, results):
        name = data.get('name') if isinstance(data.get('name'), str) else None
        name = name or urllib.parse.urlparse(url).hostname or url
        entries = catalog_entries(data)
        stores.append({'url': url, 'name': name, 'online': online, 'count': len(entries)})
        for entry in entries:
            games.setdefault(entry['id'], {**entry, 'store': name})
    catalog_cache = (time.monotonic(), list(games.values()), stores)
    return catalog_cache[1], catalog_cache[2]


def store():
    catalog, stores = merged_catalog()
    installed = {g['id']: g for g in library()}
    games = []
    for entry in catalog:
        local = installed.get(entry['id'])
        games.append({
            **entry,
            'installed': local is not None,
            'update': local is not None and local.get('version') != entry.get('version'),
        })
    return {'online': any(s['online'] for s in stores), 'games': games, 'stores': stores}


def find_catalog_entry(gid):
    catalog, _ = merged_catalog(max_age=60)
    return next((g for g in catalog if g['id'] == gid), None)


def set_job(gid, **fields):
    with lock:
        jobs.setdefault(gid, {'state': 'queued', 'progress': 0, 'error': None}).update(fields)


def safe_extract(archive, target):
    """Extract a zip, refusing absolute paths and '..' components."""
    root = target.resolve()
    for member in archive.infolist():
        dest = (target / member.filename).resolve()
        if root != dest and root not in dest.parents:
            raise ValueError(f'unsafe path in archive: {member.filename}')
    archive.extractall(target)


def install(entry):
    gid = entry['id']
    GAMES.mkdir(parents=True, exist_ok=True)
    download = GAMES / f'.{gid}.zip'
    staging = GAMES / f'.{gid}.new'
    try:
        set_job(gid, state='downloading', progress=0, error=None)
        digest = hashlib.sha256()
        with open_url(entry['download'], timeout=30) as r, open(download, 'wb') as out:
            total = int(r.headers.get('Content-Length') or entry.get('size') or 0)
            done = 0
            while chunk := r.read(1 << 16):
                out.write(chunk)
                digest.update(chunk)
                done += len(chunk)
                if total:
                    set_job(gid, progress=min(done / total, 1))
        if entry.get('sha256') and digest.hexdigest() != entry['sha256']:
            raise ValueError('download is corrupted (checksum mismatch)')

        set_job(gid, state='installing', progress=1)
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir()
        with zipfile.ZipFile(download) as archive:
            safe_extract(archive, staging)
        # Accept zips that wrap the game in a single top-level folder.
        entries = [p for p in staging.iterdir() if not p.name.startswith('__MACOSX')]
        root = entries[0] if len(entries) == 1 and entries[0].is_dir() else staging
        if not (root / entry.get('entry', 'index.html')).exists():
            raise ValueError('archive has no index.html')
        manifest = read_manifest(root)
        for key in ('id', 'title', 'author', 'version', 'description', 'entry'):
            if key in entry:
                manifest[key] = entry[key]
        (root / 'pocketvibe.json').write_text(json.dumps(manifest, indent=2))

        target = GAMES / gid
        old = GAMES / f'.{gid}.old'
        shutil.rmtree(old, ignore_errors=True)
        if target.exists():
            target.rename(old)
        root.rename(target)
        shutil.rmtree(old, ignore_errors=True)
        set_job(gid, state='done')
    except Exception as e:  # reported to the launcher, never crashes the service
        set_job(gid, state='error', error=str(e))
    finally:
        download.unlink(missing_ok=True)
        shutil.rmtree(staging, ignore_errors=True)


def remove(gid):
    with lock:
        server = game_servers.pop(gid, None)
    if server:
        server[0].shutdown()
    shutil.rmtree(GAMES / gid, ignore_errors=True)


# ROCKNIX's battery service (batteryplus) estimates the charge from the
# battery's voltage and writes it here; EmulationStation shows this number.
# The kernel's own figure can be far off on handhelds whose fuel gauge was
# never calibrated (the RG34XX SP said 12% when ROCKNIX said 41%).
BATTERY_ESTIMATE = Path('/tmp/battery.percent')


def device_status():
    """Clock, battery and Wi-Fi for the launcher's header (local time zone)."""
    battery, charging = None, False
    for supply in Path('/sys/class/power_supply').glob('*'):
        try:
            if (supply / 'type').read_text().strip() != 'Battery':
                continue
            battery = int((supply / 'capacity').read_text())
            charging = (supply / 'status').read_text().strip() in ('Charging', 'Full')
            break
        except (OSError, ValueError):
            continue
    try:
        if battery is not None and time.time() - BATTERY_ESTIMATE.stat().st_mtime < 600:
            battery = max(0, min(100, int(BATTERY_ESTIMATE.read_text())))
    except (OSError, ValueError):
        pass
    wifi = False
    for iface in Path('/sys/class/net').glob('wl*'):
        try:
            wifi = wifi or (iface / 'operstate').read_text().strip() == 'up'
        except OSError:
            pass
    return {'time': time.strftime('%H:%M'), 'battery': battery, 'charging': charging, 'wifi': wifi}


def network_address():
    """The address other devices on the network can reach (no packet is sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(('192.0.2.1', 80))
            return sock.getsockname()[0]
    except OSError:
        return None


def device_info():
    usage = shutil.disk_usage(HOME if HOME.exists() else '/')
    games_size = sum(f.stat().st_size for f in GAMES.rglob('*') if f.is_file()) if GAMES.exists() else 0
    return {'version': VERSION, 'free': usage.free, 'total': usage.total, 'games': games_size, 'ip': network_address()}


def list_backups():
    if not BACKUPS.is_dir():
        return []
    files = [p for p in BACKUPS.iterdir() if BACKUP_NAME.fullmatch(p.name)]
    return [{'name': p.name, 'size': p.stat().st_size} for p in sorted(files, reverse=True)]


def backup_saves():
    """Zip every game's saved data (WebKit's storage folder)."""
    BACKUPS.mkdir(parents=True, exist_ok=True)
    name = time.strftime('saves-%Y%m%d-%H%M%S.zip')
    storage = WEB_DATA / 'storage'
    temp = BACKUPS / f'.{name}.part'  # a full card leaves no half backup in the list
    try:
        with zipfile.ZipFile(temp, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in storage.rglob('*') if storage.exists() else []:
                if path.is_file():
                    archive.write(path, path.relative_to(WEB_DATA))
        os.replace(temp, BACKUPS / name)
    finally:
        temp.unlink(missing_ok=True)
    return name


def restore_saves(name):
    """Replace all saved data with a backup. The browser is closed meanwhile,
    so it cannot write over the restored files; PocketVibe.sh reopens it."""
    global notice
    BUSY_FLAG.touch()
    try:
        close_browser()
        # Wait for WebKit's helpers too: the network process writes the saves.
        # (Process names are cut to 15 characters.)
        for _ in range(50):
            running = subprocess.run(['pgrep', '-x', 'cog|WPENetworkProce|WPEWebProcess'], capture_output=True)
            if running.returncode != 0:
                break
            time.sleep(0.2)
        staging = WEB_DATA / '.restore'
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        with zipfile.ZipFile(BACKUPS / name) as archive:
            safe_extract(archive, staging)
        if not (staging / 'storage').is_dir():
            raise ValueError('the backup has no saves')
        # Swap, then delete: the current saves are kept until the new ones are in place.
        current, previous = WEB_DATA / 'storage', WEB_DATA / '.storage-old'
        shutil.rmtree(previous, ignore_errors=True)
        if current.exists():
            current.rename(previous)
        (staging / 'storage').rename(current)
        shutil.rmtree(previous, ignore_errors=True)
        shutil.rmtree(staging, ignore_errors=True)
        notice = 'restored'
    except Exception as e:  # reported to the launcher on its next load
        notice = f'restore-failed:{e}'
    finally:
        BUSY_FLAG.unlink(missing_ok=True)


MAX_COVER = 2 << 20  # bytes
cover_misses = {}  # game id -> when no cover was found, so it is not looked up on every load


def cover_path(gid):
    """Cover image for a game: from the installed game, else cached from the
    store. The cache is per cover address, so a new version's cover replaces
    the old one."""
    for name in ('cover.png', 'cover.jpg', 'cover.webp'):
        local = GAMES / gid / name
        if local.exists():
            return local
    if time.monotonic() - cover_misses.get(gid, -600) < 600:
        return None
    entry = find_catalog_entry(gid)
    if not entry or not entry.get('cover'):
        cover_misses[gid] = time.monotonic()
        return None
    cached = CACHE / 'covers' / f'{gid}-{hashlib.sha1(entry["cover"].encode()).hexdigest()[:12]}'
    if cached.exists():
        return cached
    try:
        with open_url(entry['cover']) as r:
            data = r.read(MAX_COVER + 1)
        if len(data) > MAX_COVER:
            raise ValueError('cover too large')
    except (OSError, ValueError):
        cover_misses[gid] = time.monotonic()
        return None
    cached.parent.mkdir(parents=True, exist_ok=True)
    for old in cached.parent.glob(f'{gid}-*'):
        old.unlink(missing_ok=True)
    cached.write_bytes(data)
    return cached


class GameHandler(SimpleHTTPRequestHandler):
    """Serves one game's files."""

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def version_tuple(text):
    return tuple(int(n) for n in re.findall(r'\d+', text or '')[:3])


def update_url():
    override = HOME / 'dev-update-url'
    return override.read_text().strip() if override.exists() else UPDATE_URL


def check_update(force=False):
    """The newest app release, compared with this one. Cached for a while."""
    cached = CACHE / 'update.json'
    if not force and cached.exists() and time.time() - cached.stat().st_mtime < UPDATE_CHECK_EVERY:
        release = json.loads(cached.read_text())
    else:
        request = urllib.request.Request(update_url(), headers={
            'Accept': 'application/vnd.github+json', 'User-Agent': f'PocketVibe/{VERSION}'})
        with urllib.request.urlopen(request, timeout=10) as r:
            data = json.loads(r.read())
        # GitHub lists releases newest first; app releases are tagged v1.2.3
        # (others, like the runtime, are skipped). A single release works too.
        def app_asset(release):
            return next((a for a in release.get('assets', [])
                         if a.get('name', '').startswith('pocketvibe-app-') and a['name'].endswith('.zip')), None)
        releases = data if isinstance(data, list) else [data]
        data = next((r for r in releases if str(r.get('tag_name', '')).startswith('v')
                     and not r.get('draft') and not r.get('prerelease') and app_asset(r)), None)
        if not data:
            raise ValueError('no app release yet')
        asset = app_asset(data)
        # The checksum comes from GitHub's asset digest, or a "sha256: ..." line in the notes.
        digest = (asset.get('digest') or '').removeprefix('sha256:')
        noted = re.search(r'sha256:\s*([0-9a-f]{64})', data.get('body') or '')
        release = {
            'version': data.get('tag_name', '').lstrip('v'),
            'notes': re.sub(r'\s*sha256:\s*[0-9a-f]{64}\s*', '', data.get('body') or '').strip(),
            'url': asset['browser_download_url'],
            'size': asset.get('size', 0),
            'sha256': digest or (noted.group(1) if noted else ''),
        }
        CACHE.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(release))
    return {**release, 'current': VERSION,
            'available': version_tuple(release['version']) > version_tuple(VERSION)}


def install_update():
    """Download the new app, check it, swap it in and restart PocketVibe."""
    package = HOME / '.app-update.zip'
    try:
        release = check_update()
        if not release['available']:
            raise ValueError('already up to date')
        if not re.fullmatch(r'[0-9a-f]{64}', release['sha256']):
            raise ValueError('the release has no checksum')
        set_job('__app__', state='downloading', progress=0, error=None)
        digest = hashlib.sha256()
        with open_url(release['url'], timeout=30) as r, open(package, 'wb') as out:
            total = int(r.headers.get('Content-Length') or release['size'] or 0)
            done = 0
            while chunk := r.read(1 << 16):
                out.write(chunk)
                digest.update(chunk)
                done += len(chunk)
                if total:
                    set_job('__app__', progress=min(done / total, 1))
        if digest.hexdigest() != release['sha256']:
            raise ValueError('download is corrupted (checksum mismatch)')

        set_job('__app__', state='installing', progress=1)
        staging = HOME / '.app-update'
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir()
        with zipfile.ZipFile(package) as archive:
            safe_extract(archive, staging)
        package.unlink()
        if not (staging / 'app' / 'pocketvibed.py').exists():
            raise ValueError('the package has no app')

        # Swap the app folder; the previous one stays as app.old for a rollback.
        shutil.rmtree(HOME / 'app.old', ignore_errors=True)
        (HOME / 'app').rename(HOME / 'app.old')
        (staging / 'app').rename(HOME / 'app')
        ports = Path('/storage/roms/ports')
        if (staging / 'PocketVibe.sh').exists() and ports.is_dir():
            shutil.copy(staging / 'PocketVibe.sh', ports / 'PocketVibe.sh')
            os.chmod(ports / 'PocketVibe.sh', 0o755)  # zips do not keep the executable bit
        if (staging / 'ports' / 'pocketvibe-image.png').exists() and (ports / 'images').is_dir():
            shutil.copy(staging / 'ports' / 'pocketvibe-image.png', ports / 'images' / 'pocketvibe-image.png')
        shutil.rmtree(staging, ignore_errors=True)
        set_job('__app__', state='done')
        (CACHE / 'update.json').unlink(missing_ok=True)
        global notice
        notice = f'updated:{release["version"]}'
        (HOME / 'notice').write_text(notice)  # survives the restart
        # Until the new version's service starts, PocketVibe.sh may roll back to app.old.
        (HOME / 'update-pending').touch()

        # PocketVibe.sh sees the flag when the browser closes and starts over.
        RESTART_FLAG.touch()
        time.sleep(1.5)  # let the launcher see "done"
        close_browser()
        threading.Thread(target=launcher_server.shutdown, daemon=True).start()
    except Exception as e:  # reported to the launcher
        set_job('__app__', state='error', error=str(e))
    finally:
        package.unlink(missing_ok=True)
        shutil.rmtree(HOME / '.app-update', ignore_errors=True)


def game_port(gid):
    """The game's port, the same on every run: it is part of the game's origin,
    and so of where its saves are. A new game starts from a hash of its id
    (the ports games had before this registry) and moves on if that is taken,
    so no two games share an origin."""
    with files_lock:
        ports = read_json(PORTS_FILE, {})
        if not isinstance(ports, dict):
            ports = {}
        if gid not in ports:
            taken = set(ports.values())
            port = 20000 + zlib.crc32(gid.encode()) % 20000
            while port in taken:
                port = 20000 + (port - 20000 + 1) % 20000
            ports[gid] = port
            write_json(PORTS_FILE, ports)
        return ports[gid]


def game_url(gid):
    """Start (once) the game's own server and return its address."""
    game_dir = GAMES / gid
    meta = read_manifest(game_dir)
    port = game_port(gid)
    with lock:
        if gid not in game_servers:
            server = ThreadingHTTPServer(('127.0.0.1', port), partial(GameHandler, directory=str(game_dir)))
            threading.Thread(target=server.serve_forever, daemon=True).start()
            game_servers[gid] = (server, port)
        port = game_servers[gid][1]
    perf = '&perf' if load_settings()['showFps'] else ''
    return f'http://127.0.0.1:{port}/{meta["entry"]}?handheld{perf}'


class AudioKey:
    """A one-key virtual keyboard (uinput). WebKit only lets a page start
    audio after a real key press or touch; gamepad buttons do not count. A tap
    on this key (F13, which nothing uses) is a real key press for the browser,
    so the launcher can start its music."""

    def __init__(self):
        self.fd = None
        self.created = 0.0

    def open(self):
        if self.fd is not None:
            return True
        try:
            fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
            fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
            fcntl.ioctl(fd, UI_SET_KEYBIT, KEY_F13)
            # struct uinput_setup: bus, vendor, product, version, name, ff_effects_max
            fcntl.ioctl(fd, UI_DEV_SETUP, struct.pack('HHHH80sI', 0x03, 0x1209, 0x5056, 1, b'PocketVibe audio key', 0))
            fcntl.ioctl(fd, UI_DEV_CREATE)
        except OSError:
            return False
        self.fd, self.created = fd, time.monotonic()
        return True

    def tap(self):
        if not self.open():
            return False
        # A new input device takes a moment before the compositor picks it up.
        time.sleep(max(0.0, 1.0 - (time.monotonic() - self.created)))
        event = struct.Struct('llHHi')
        for kind, code, value in ((EV_KEY, KEY_F13, 1), (EV_SYN, 0, 0), (EV_KEY, KEY_F13, 0), (EV_SYN, 0, 0)):
            os.write(self.fd, event.pack(0, 0, kind, code, value))
        return True


audio_key = AudioKey()


def close_browser():
    """End the browser engine at once. Cog 0.18's Wayland code crashes while
    shutting down (SIGTERM and cogctl quit alike) and leaves a coredump entry;
    SIGKILL skips that code. Saves are safe: WebKit's network process writes
    localStorage, and it finishes on its own (tested on the handheld)."""
    subprocess.run(['pkill', '-KILL', '-x', 'cog'], check=False)


def quit_app():
    # Closing the browser engine ends the launch script, which stops this service.
    QUIT_FLAG.touch()
    close_browser()
    threading.Thread(target=launcher_server.shutdown, daemon=True).start()


def go_home():
    """Leave the running game and show the launcher."""
    global in_game
    in_game = False
    try:
        # Ask the running browser to open the launcher (fast, keeps it running).
        done = subprocess.run(
            [sys.executable, str(APP / 'runtime.py'), '--root', str(RUNTIME), '--', 'cogctl', 'open', LAUNCHER_URL],
            capture_output=True, timeout=3,
        ).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        done = False
    if not done:
        # Restart the browser instead; PocketVibe.sh reopens it on the launcher.
        close_browser()


def gamepad_devices():
    """Input devices that have both Start and Select buttons."""
    devices = []
    for block in Path('/proc/bus/input/devices').read_text().split('\n\n'):
        handler = re.search(r'H: Handlers=.*?(event\d+)', block)
        keys = re.search(r'B: KEY=([0-9a-f ]+)', block)
        if not handler or not keys:
            continue
        bits = int(''.join(word.rjust(16, '0') for word in keys.group(1).split()), 16)
        if bits >> BTN_SELECT & 1 and bits >> BTN_START & 1:
            devices.append('/dev/input/' + handler.group(1))
    return devices


def watch_buttons():
    """Start + Select, read straight from the kernel's input events. Gamepads
    that come and go (USB, Bluetooth) are picked up every few seconds."""
    event = struct.Struct('llHHi')  # struct input_event on 64-bit Linux
    fds = {}  # device path -> open file descriptor
    scanned = 0.0
    held = set()
    since = None
    fired = None
    while True:
        if time.monotonic() - scanned > 5:
            scanned = time.monotonic()
            for path in gamepad_devices():
                if path not in fds:
                    try:
                        fds[path] = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
                    except OSError:
                        pass
        ready, _, _ = select.select(list(fds.values()), [], [], 0.05)
        for fd in ready:
            try:
                data = os.read(fd, event.size * 64)
            except BlockingIOError:
                continue
            except OSError:  # unplugged
                os.close(fd)
                fds = {path: f for path, f in fds.items() if f != fd}
                held.clear()
                continue
            for offset in range(0, len(data) - event.size + 1, event.size):
                _, _, kind, code, value = event.unpack_from(data, offset)
                if kind == EV_KEY and code in (BTN_SELECT, BTN_START):
                    if value:
                        held.add(code)
                    else:
                        held.discard(code)
        if len(held) < 2:
            since = None
            continue
        now = time.monotonic()
        if since is None:
            since, fired = now, None
        if now - since >= QUIT_HOLD and fired != 'quit':
            fired = 'quit'
            quit_app()
        elif now - since >= HOME_HOLD and fired is None and in_game:
            fired = 'home'
            go_home()


class LauncherHandler(SimpleHTTPRequestHandler):
    """The launcher's files and its /api. Games run on other 127.0.0.1 ports,
    and the browser lets their pages send requests here, so every /api call
    must carry the X-PocketVibe header: a page on another origin can only add
    it after a CORS preflight, which this server never answers. Covers and
    cached audio, which change nothing, are the exceptions. A Host check
    stops pages that point their own domain at 127.0.0.1."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP / 'launcher'), **kwargs)

    def log_message(self, *args):
        pass

    def end_headers(self):
        # The launcher must never run cached files from before an update.
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def allowed(self):
        route = self.path.split('?', 1)[0]
        if self.headers.get('Host') not in (f'127.0.0.1:{PORT}', f'localhost:{PORT}'):
            return False
        if not route.startswith('/api/'):
            return True
        if self.headers.get('Origin') not in (None, f'http://127.0.0.1:{PORT}'):
            return False
        if self.command == 'GET' and route.startswith(('/api/cover/', '/api/cache/')):
            return True
        return self.headers.get('X-PocketVibe') == '1'

    def refuse(self):
        self.send_json({'error': 'not allowed'}, 403)

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.allowed():
            return self.refuse()
        route = self.path.split('?', 1)[0]
        if route == '/api/library':
            # The launcher asks for the library when it loads: no game is running.
            global in_game
            in_game = False
            return self.send_json(library())
        if route == '/api/store':
            return self.send_json(store())
        if route == '/api/status':
            return self.send_json(device_status())
        if route == '/api/settings':
            return self.send_json(load_settings())
        if route == '/api/info':
            return self.send_json(device_info())
        if route == '/api/saves':
            return self.send_json(list_backups())
        if route.startswith('/api/cache/'):
            path = AUDIO_CACHE / route.rsplit('/', 1)[1]
            if not AUDIO_NAME.fullmatch(path.name) or not path.exists():
                return self.send_json({'error': 'not cached'}, 404)
            data = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'audio/wav')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return None
        if route == '/api/update':
            try:
                return self.send_json(check_update(force='force' in self.path))
            except (OSError, ValueError, KeyError) as e:
                return self.send_json({'current': VERSION, 'available': False, 'error': str(e)})
        if route == '/api/notice':
            global notice
            message, notice = notice, None
            return self.send_json({'notice': message})
        if route == '/api/jobs':
            with lock:
                return self.send_json(dict(jobs))
        if route.startswith('/api/cover/'):
            gid = route.rsplit('/', 1)[1]
            path = cover_path(gid) if valid_id(gid) else None
            if not path:
                return self.send_json({'error': 'no cover'}, 404)
            data = path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'image/png' if data[:4] == b'\x89PNG' else 'image/jpeg')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return None
        return super().do_GET()

    def read_json(self):
        length = int(self.headers.get('Content-Length') or 0)
        try:
            return json.loads(self.rfile.read(length) or b'{}')
        except ValueError:
            return {}

    def do_PUT(self):
        if not self.allowed():
            return self.refuse()
        route = self.path.split('?', 1)[0]
        name = route.rsplit('/', 1)[1]
        length = int(self.headers.get('Content-Length') or 0)
        if not route.startswith('/api/cache/') or not AUDIO_NAME.fullmatch(name) or not 0 < length <= 8 << 20:
            return self.send_json({'error': 'not allowed'}, 400)
        AUDIO_CACHE.mkdir(parents=True, exist_ok=True)
        (AUDIO_CACHE / name).write_bytes(self.rfile.read(length))
        return self.send_json({'ok': True})

    def do_POST(self):
        if not self.allowed():
            return self.refuse()
        route = self.path.split('?', 1)[0]
        if route == '/api/settings':
            return self.send_json(save_settings(self.read_json()))
        if route == '/api/update/install':
            with lock:
                busy = jobs.get('__app__', {}).get('state') in ('queued', 'downloading', 'installing')
            if not busy:
                set_job('__app__', state='queued', progress=0, error=None)
                threading.Thread(target=install_update, daemon=True).start()
            return self.send_json({'ok': True})
        if route == '/api/unlock-audio':
            return self.send_json({'ok': audio_key.tap()})
        if route == '/api/saves/backup':
            return self.send_json({'name': backup_saves()})
        if route.startswith('/api/saves/restore/'):
            name = route.rsplit('/', 1)[1]
            if not BACKUP_NAME.fullmatch(name) or not (BACKUPS / name).exists():
                return self.send_json({'error': 'no such backup'}, 404)
            self.send_json({'ok': True})
            return threading.Thread(target=restore_saves, args=(name,), daemon=True).start()
        parts = route.strip('/').split('/')
        action, gid = (parts + [None, None])[1:3]
        if action == 'quit':
            self.send_json({'ok': True})
            return quit_app()
        if not valid_id(gid):
            return self.send_json({'error': 'bad game id'}, 400)
        if action == 'launch':
            if not (GAMES / gid).is_dir():
                return self.send_json({'error': 'not installed'}, 404)
            try:
                url = game_url(gid)
            except OSError as e:
                return self.send_json({'error': str(e)}, 500)
            global in_game
            in_game = True
            record_play(gid)
            return self.send_json({'url': url})
        if action == 'install':
            entry = find_catalog_entry(gid)
            if not entry:
                return self.send_json({'error': 'not in the store'}, 404)
            with lock:
                busy = jobs.get(gid, {}).get('state') in ('queued', 'downloading', 'installing')
            if not busy:
                set_job(gid, state='queued', progress=0, error=None)
                threading.Thread(target=install, args=(entry,), daemon=True).start()
            return self.send_json({'ok': True})
        if action == 'remove':
            remove(gid)
            return self.send_json({'ok': True})
        return self.send_json({'error': 'unknown action'}, 404)


def clean_up():
    """Leftovers of work that was cut off (power, crash, quitting mid-download)."""
    BUSY_FLAG.unlink(missing_ok=True)
    package = HOME / '.app-update.zip'
    package.unlink(missing_ok=True)
    shutil.rmtree(HOME / '.app-update', ignore_errors=True)
    if not GAMES.is_dir():
        return
    for path in GAMES.glob('.*'):
        # A game being replaced when the power went: put the old one back.
        if path.name.endswith('.old') and path.is_dir() and not (GAMES / path.name[1:-4]).exists():
            path.rename(GAMES / path.name[1:-4])
        elif path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        else:
            path.unlink(missing_ok=True)


def main():
    global launcher_server, notice
    saved_notice = HOME / 'notice'
    if saved_notice.exists():
        notice = saved_notice.read_text()
        saved_notice.unlink()
    GAMES.mkdir(parents=True, exist_ok=True)
    QUIT_FLAG.unlink(missing_ok=True)
    clean_up()
    threading.Thread(target=watch_buttons, daemon=True).start()
    audio_key.open()
    launcher_server = ThreadingHTTPServer(('127.0.0.1', PORT), LauncherHandler)
    (HOME / 'update-pending').unlink(missing_ok=True)  # this version starts
    launcher_server.serve_forever()


if __name__ == '__main__':
    main()
