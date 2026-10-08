#!/usr/bin/env python3
"""Adds (or refreshes) PocketVibe's entry in the Ports gamelist.xml, keeping
any other ports already listed there. Run on the handheld by install-app.sh."""

import xml.etree.ElementTree as ET
from pathlib import Path

GAMELIST = Path('/storage/roms/ports/gamelist.xml')
ENTRY = {
    'path': './PocketVibe.sh',
    'name': 'PocketVibe',
    'desc': 'Web games made for this handheld. Get games from the Store and play them full screen. '
            'Hold Start + Select to leave a game.',
    'image': './images/pocketvibe-image.png',
    'developer': 'Mert Cobanov',
    'publisher': 'PocketVibe',
    'genre': 'Launcher',
}

root = ET.parse(GAMELIST).getroot() if GAMELIST.exists() else ET.Element('gameList')
for game in root.findall('game'):
    if game.findtext('path') == ENTRY['path']:
        root.remove(game)
game = ET.SubElement(root, 'game')
for key, value in ENTRY.items():
    ET.SubElement(game, key).text = value
ET.indent(root)
GAMELIST.write_text('<?xml version="1.0"?>\n' + ET.tostring(root, encoding='unicode') + '\n')
print(f'PocketVibe listed in {GAMELIST}')
