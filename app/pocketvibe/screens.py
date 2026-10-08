#!/usr/bin/env python3
"""The handheld's screens, read from Sway.

Most handhelds have one screen. Some (the Anbernic RG DS) have two, and
EmulationStation keeps the second one off. While PocketVibe runs it turns the
second screen on and makes the browser's window span both, so one page can
draw on each; PocketVibe.sh turns it off again on the way out:

    screens.py restore

layout() gives every screen's place inside the browser's window. Outside Sway
(on a computer) it is None, unless POCKETVIBE_SCREENS sets one for testing:
POCKETVIBE_SCREENS=640x480+0+0,640x480+640+0 (the first is the main screen).
"""

import json
import os
import subprocess
import sys
from pathlib import Path

BROWSER = '[app_id="com.igalia.Cog"]'
TURNED_ON = Path('/tmp/pocketvibe-screens')  # the screens PocketVibe turned on, to turn off again
# Connectors for a TV or monitor: never spread the launcher onto one.
EXTERNAL = ('HDMI', 'DP-', 'VGA', 'DVI')


def sway(*args):
    try:
        result = subprocess.run(['swaymsg', *args], capture_output=True, text=True, timeout=3)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return result.stdout if result.returncode == 0 else None


def outputs():
    """Sway's active outputs, built-in screens only when there are any."""
    raw = sway('-t', 'get_outputs', '-r')
    if raw is None:
        return None
    try:
        active = [o for o in json.loads(raw) if o.get('active')]
    except ValueError:
        return None
    builtin = [o for o in active if not o['name'].startswith(EXTERNAL)]
    return builtin or active


def from_env(text):
    screens = []
    for part in text.split(','):
        size, x, y = part.strip().split('+')
        width, height = size.split('x')
        screens.append({'name': f'screen-{len(screens) + 1}', 'x': int(x), 'y': int(y), 'width': int(width), 'height': int(height)})
    return {'screens': screens, 'primary': 0}


def main_index(found):
    """The screen EmulationStation was on (Sway's focused output), else the
    first one SDL is told to prefer, else the first."""
    for i, o in enumerate(found):
        if o.get('focused'):
            return i
    names = [o['name'] for o in found]
    for name in os.environ.get('SDL_VIDEO_DISPLAY_PRIORITY', '').split(','):
        if name in names:
            return names.index(name)
    return 0


def layout():
    """{'screens': [{name, x, y, width, height}], 'primary': index}, with
    positions inside the box that holds all the screens (the window when it
    spans them), or None when the screens are unknown."""
    if os.environ.get('POCKETVIBE_SCREENS'):
        try:
            return from_env(os.environ['POCKETVIBE_SCREENS'])
        except ValueError:
            return None
    found = outputs()
    if not found:
        return None
    left = min(o['rect']['x'] for o in found)
    top = min(o['rect']['y'] for o in found)
    screens = [
        {'name': o['name'], 'x': o['rect']['x'] - left, 'y': o['rect']['y'] - top,
         'width': o['rect']['width'], 'height': o['rect']['height']}
        for o in found
    ]
    return {'screens': screens, 'primary': main_index(found)}


def span():
    """Turn every screen on and spread the browser's window over them. Called
    each time the launcher loads, so a restarted browser spans again."""
    if os.environ.get('POCKETVIBE_SCREENS'):
        return
    found = outputs()
    if not found or len(found) < 2:
        return
    off = [o['name'] for o in found if o.get('power') is False or o.get('dpms') is False]
    if off:
        before = TURNED_ON.read_text().split() if TURNED_ON.exists() else []
        TURNED_ON.write_text(' '.join(sorted(set(before + off))))
        for name in off:
            sway('output', name, 'power', 'on')
    sway(BROWSER, 'fullscreen', 'enable', 'global')


def restore():
    """Turn off the screens span() turned on."""
    if not TURNED_ON.exists():
        return
    for name in TURNED_ON.read_text().split():
        sway('output', name, 'power', 'off')
    TURNED_ON.unlink(missing_ok=True)


if __name__ == '__main__':
    if sys.argv[1:] == ['restore']:
        restore()
    else:
        print(json.dumps(layout()))
