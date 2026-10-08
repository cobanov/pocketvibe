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

import hashlib
import json
import os
import re
import select
import shutil
import struct
import subprocess
import threading
import time
import urllib.request
import zipfile
import zlib
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

APP = Path(__file__).resolve().parent
HOME = Path(os.environ.get('POCKETVIBE_HOME', '/storage/pocketvibe'))
GAMES = HOME / 'games'
CACHE = HOME / 'cache'
PORT = 8730
CONFIG = json.loads((APP / 'config.json').read_text())
STORE_URL = os.environ.get('POCKETVIBE_STORE', CONFIG['store_url'])
LAUNCHER_URL = f'http://127.0.0.1:{PORT}/'
GAME_ID = re.compile(r'[a-z0-9][a-z0-9-]{0,63}')
CHROOT = HOME.parent / 'debian'
SESSION_BUS = 'unix:path=/run/0-runtime-dir/bus'
QUIT_FLAG = Path('/tmp/pocketvibe-quit')  # tells PocketVibe.sh not to restart the browser

EV_KEY = 1
BTN_SELECT, BTN_START = 314, 315
HOME_HOLD = 0.4  # seconds holding Start + Select to return to the launcher
QUIT_HOLD = 3.0  # seconds to quit the app, in case the launcher itself hangs

jobs = {}  # game id -> {'state', 'progress', 'error'}
game_servers = {}  # game id -> (server, port)
lock = threading.Lock()
launcher_server = None
in_game = False


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


def library():
    if not GAMES.is_dir():
        return []
    games = [read_manifest(d) for d in sorted(GAMES.iterdir()) if d.is_dir() and not d.name.startswith('.')]
    return sorted(games, key=lambda g: g['title'].lower())


def fetch_catalog():
    """Store catalog, falling back to the last copy when offline."""
    cached = CACHE / 'catalog.json'
    try:
        with urllib.request.urlopen(STORE_URL, timeout=10) as r:
            data = json.loads(r.read())
        CACHE.mkdir(parents=True, exist_ok=True)
        cached.write_text(json.dumps(data))
        return data, True
    except (OSError, ValueError):
        if cached.exists():
            return json.loads(cached.read_text()), False
        return {'games': []}, False


def store():
    catalog, online = fetch_catalog()
    installed = {g['id']: g for g in library()}
    games = []
    for entry in catalog.get('games', []):
        if not valid_id(entry.get('id')):
            continue
        local = installed.get(entry['id'])
        games.append({
            **entry,
            'installed': local is not None,
            'update': local is not None and local.get('version') != entry.get('version'),
        })
    return {'online': online, 'games': games}


def find_catalog_entry(gid):
    catalog, _ = fetch_catalog()
    return next((g for g in catalog.get('games', []) if g.get('id') == gid), None)


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
    return f'http://127.0.0.1:{port}/{meta["entry"]}?handheld'


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

    def do_POST(self):
        parts = self.path.split('?', 1)[0].strip('/').split('/')
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
    launcher_server = ThreadingHTTPServer(('127.0.0.1', PORT), LauncherHandler)
    launcher_server.serve_forever()


if __name__ == '__main__':
    main()
