# Changelog (webOS port)

The `.ipk` version follows the upstream PocketVibe version in `app/pocketvibe/config.json`.

## 0.7.4

First public version of the webOS port, built on PocketVibe 0.7.4.

- LG webOS TV app with the upstream launcher and store, running on the TV's own web engine (Chromium 68+, WebGL2).
- Node.js service replacing `pocketvibed.py`; games are rewritten for Chromium 68 when they are installed.
- Magic Remote: keys, colour buttons, pointer (hover, click, wheel); hold Back or press INFO to leave a game.
- USB and Bluetooth gamepads with Xbox/Nintendo layouts, a setup page and START+SELECT to leave a game.
- Start screen with a Chromium/WebGL2 check; errors logged to `/media/developer/pocketvibe/log.txt`.
- App icon is the PocketVibe logo (`site/public/favicon.svg`).
