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
DEFAULT_STORE = os.environ.get('POCKETVIBE_STORE', CONFIG['store_url'])
SETTINGS_FILE = HOME / 'settings.json'
PLAYS_FILE = HOME / 'plays.json'  # when each game was last played, for "Recently played"
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
CHROOT = HOME.parent / 'debian'
SESSION_BUS = 'unix:path=/run/0-runtime-dir/bus'
QUIT_FLAG = Path('/tmp/pocketvibe-quit')  # tells PocketVibe.sh not to restart the browser
BUSY_FLAG = Path('/tmp/pocketvibe-busy')  # PocketVibe.sh waits for it to go before reopening the browser
WEB_DATA = CHROOT / 'root' / '.local' / 'share' / 'wpe'  # WebKit's data; storage/ holds every game's saves
BACKUPS = HOME / 'backups'
BACKUP_NAME = re.compile(r'saves-\d{8}-\d{6}\.zip')

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
launcher_server = None
in_game = False
notice = None  # a message for the launcher to show the next time it loads


def load_settings():
    try:
        saved = json.loads(SETTINGS_FILE.read_text())
    except (OSError, ValueError):
        saved = {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in saved.items() if k in DEFAULT_SETTINGS}}


def save_settings(changes):
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
    HOME.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))
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
    meta.setdefault('id', game_dir.name)
    meta.setdefault('title', game_dir.name.replace('-', ' ').title())
    meta.setdefault('entry', 'index.html')
    return meta


def load_plays():
    try:
        return json.loads(PLAYS_FILE.read_text())
    except (OSError, ValueError):
        return {}


def record_play(gid):
    plays = load_plays()
    entry = plays.get(gid, {'count': 0})
    plays[gid] = {'count': entry.get('count', 0) + 1, 'last': time.time()}
    PLAYS_FILE.write_text(json.dumps(plays))


def library():
    if not GAMES.is_dir():
        return []
    plays = load_plays()
    games = []
    for game_dir in sorted(GAMES.iterdir()):
        if game_dir.is_dir() and not game_dir.name.startswith('.'):
            meta = read_manifest(game_dir)
            played = plays.get(meta['id'], {})
            meta['lastPlayed'] = played.get('last', 0)
            meta['plays'] = played.get('count', 0)
            games.append(meta)
    return sorted(games, key=lambda g: g['title'].lower())


def fetch_catalog(url):
    """One store's catalog, falling back to the last copy when offline."""
    cached = CACHE / f'catalog-{hashlib.sha1(url.encode()).hexdigest()[:12]}.json'
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = json.loads(r.read())
        CACHE.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(data))
        return data, True
    except (OSError, ValueError):
        if cached.exists():
            return json.loads(cached.read_text()), False
        return {'games': []}, False


def merged_catalog():
    """Games from every store in the settings; on a clash the first store wins."""
    urls = load_settings()['stores']
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch_catalog, urls))
    games, stores = {}, []
    for url, (data, online) in zip(urls, results):
        name = data.get('name') or urllib.parse.urlparse(url).hostname or url
        entries = [g for g in data.get('games', []) if valid_id(g.get('id'))]
        stores.append({'url': url, 'name': name, 'online': online, 'count': len(entries)})
        for entry in entries:
            games.setdefault(entry['id'], {**entry, 'store': name})
    return list(games.values()), stores


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
    catalog, _ = merged_catalog()
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
        with urllib.request.urlopen(entry['download'], timeout=30) as r, open(download, 'wb') as out:
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
    with zipfile.ZipFile(BACKUPS / name, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in storage.rglob('*') if storage.exists() else []:
            if path.is_file():
                archive.write(path, path.relative_to(WEB_DATA))
    return name


def restore_saves(name):
    """Replace all saved data with a backup. The browser is closed meanwhile,
    so it cannot write over the restored files; PocketVibe.sh reopens it."""
    global notice
    BUSY_FLAG.touch()
    try:
        subprocess.run(['pkill', '-x', 'cog'], check=False)
        for _ in range(50):
            if subprocess.run(['pgrep', '-x', 'cog'], capture_output=True).returncode != 0:
                break
            time.sleep(0.2)
        staging = WEB_DATA / '.restore'
        shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True)
        with zipfile.ZipFile(BACKUPS / name) as archive:
            safe_extract(archive, staging)
        shutil.rmtree(WEB_DATA / 'storage', ignore_errors=True)
        (staging / 'storage').rename(WEB_DATA / 'storage')
        shutil.rmtree(staging, ignore_errors=True)
        notice = 'restored'
    except Exception as e:  # reported to the launcher on its next load
        notice = f'restore-failed:{e}'
    finally:
        BUSY_FLAG.unlink(missing_ok=True)


def cover_path(gid):
    """Cover image for a game: from the installed game, else cached from the store."""
    for name in ('cover.png', 'cover.jpg', 'cover.webp'):
        local = GAMES / gid / name
        if local.exists():
            return local
    cached = CACHE / 'covers' / gid
    if cached.exists():
        return cached
    entry = find_catalog_entry(gid)
    if not entry or not entry.get('cover'):
        return None
    try:
        with urllib.request.urlopen(entry['cover'], timeout=10) as r:
            data = r.read()
    except OSError:
        return None
    cached.parent.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(data)
    return cached


class GameHandler(SimpleHTTPRequestHandler):
    """Serves one game's files."""

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def game_url(gid):
    """Start (once) the game's own server and return its address."""
    game_dir = GAMES / gid
    meta = read_manifest(game_dir)
    with lock:
        if gid not in game_servers:
            # A stable port per game id keeps the game's origin, and so its
            # saved data, the same across runs.
            port = 20000 + zlib.crc32(gid.encode()) % 20000
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


def quit_app():
    # Closing the browser engine ends the launch script, which stops this service.
    QUIT_FLAG.touch()
    subprocess.run(['pkill', '-x', 'cog'], check=False)
    threading.Thread(target=launcher_server.shutdown, daemon=True).start()


def go_home():
    """Leave the running game and show the launcher."""
    global in_game
    in_game = False
    try:
        # Ask the running browser to open the launcher (fast, keeps it running).
        done = subprocess.run(
            ['chroot', str(CHROOT), '/usr/bin/env', f'DBUS_SESSION_BUS_ADDRESS={SESSION_BUS}',
             'cogctl', 'open', LAUNCHER_URL],
            capture_output=True, timeout=3,
        ).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        done = False
    if not done:
        # Restart the browser instead; PocketVibe.sh reopens it on the launcher.
        subprocess.run(['pkill', '-x', 'cog'], check=False)


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
    """Start + Select, read straight from the kernel's input events."""
    fds = [os.open(path, os.O_RDONLY | os.O_NONBLOCK) for path in gamepad_devices()]
    event = struct.Struct('llHHi')  # struct input_event on 64-bit Linux
    held = set()
    since = None
    fired = None
    while True:
        ready, _, _ = select.select(fds, [], [], 0.05)
        for fd in ready:
            try:
                data = os.read(fd, event.size * 64)
            except BlockingIOError:
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
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP / 'launcher'), **kwargs)

    def log_message(self, *args):
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
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

    def do_POST(self):
        route = self.path.split('?', 1)[0]
        if route == '/api/settings':
            return self.send_json(save_settings(self.read_json()))
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
            global in_game
            in_game = True
            record_play(gid)
            return self.send_json({'url': game_url(gid)})
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


def main():
    global launcher_server
    GAMES.mkdir(parents=True, exist_ok=True)
    QUIT_FLAG.unlink(missing_ok=True)
    threading.Thread(target=watch_buttons, daemon=True).start()
    audio_key.open()
    launcher_server = ThreadingHTTPServer(('127.0.0.1', PORT), LauncherHandler)
    launcher_server.serve_forever()


if __name__ == '__main__':
    main()
