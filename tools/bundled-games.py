#!/usr/bin/env python3
"""Downloads the games a new install starts with from the store into a folder,
as <id>.zip, each checked against the catalog's sha256. The handheld release
(app/release.sh) and the Android one (android/release.sh) both bundle them;
the app unpacks them once, on its first start.

    python3 tools/bundled-games.py <folder>
"""
import hashlib
import json
import sys
import urllib.request

GAMES = ['brick-breaker', 'turbo-circuit', 'jet-rush', 'tower-stack', 'road-hopper']
STORE = 'https://pocketvibe-store.mertcobanov.workers.dev/catalog.json'


def get(url):
    # The mirror header keeps these copies out of the games' download counts.
    request = urllib.request.Request(url, headers={'X-PocketVibe-Mirror': '1', 'User-Agent': 'PocketVibe-release'})
    return urllib.request.urlopen(request, timeout=60).read()


def main(out):
    catalog = {g['id']: g for g in json.loads(get(STORE))['games']}
    for gid in GAMES:
        game = catalog[gid]
        data = get(game['download'])
        if game.get('sha256') and hashlib.sha256(data).hexdigest() != game['sha256']:
            sys.exit(f'{gid}: checksum mismatch')
        with open(f'{out}/{gid}.zip', 'wb') as f:
            f.write(data)
        print(f'bundled {gid} {game["version"]}')


if __name__ == '__main__':
    main(sys.argv[1])
