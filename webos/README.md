# PocketVibe for LG webOS TV

A port of [PocketVibe](https://github.com/cobanov/pocketvibe) (launcher, game store and three.js games) to **LG webOS TVs**.
Play with the Magic Remote, or with a USB or Bluetooth gamepad.

> This is a community port inside a fork of `cobanov/pocketvibe`. It is not an official release.
> The launcher and the games are the upstream ones; this folder only adds what a TV needs.
> The other platforms in this repository are untouched. Türkçe: [README.tr.md](README.tr.md).

## What you get

- The real PocketVibe launcher and store (taken from `app/pocketvibe/`, so upstream features arrive with a merge), 1080p on the TV.
- Games open and play on the TV's own web engine (Chromium + WebGL2): no Debian/WPE runtime, nothing to unpack at first start.
- **Magic Remote:** D-pad, OK, Back, colour keys, and the pointer (hover, click, scroll wheel).
- **USB / Bluetooth gamepads:** any pad the TV exposes to the browser, in the layout PocketVibe expects, with a setup page for pads it does not know.
- **Store games just work:** games from the store use newer JavaScript than the TV understands; the app rewrites them once, when they are installed.

## Requirements

| | |
|---|---|
| TV | LG webOS TV with **Chromium 68 or newer and WebGL2** (webOS 5 / 2020 models and later). webOS 4.x (Chromium 53) cannot run these games. |
| TV setup | [Developer Mode](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) turned on, the TV reachable from your computer |
| Computer | Node.js + npm, Python 3 (to build), `ares-install` from [`@webos-tools/cli`](https://www.npmjs.com/package/@webos-tools/cli) (the build installs it for you) |
| Network | The TV needs internet for the store |

**Tested on** one LG TV with a Chromium 68 web engine (ARMv7, Mali GPU, about 1.1 GB of RAM) that has root access.
Other models, and stock TVs without root, are untested: the app runs a small Node.js service and unpacks one native helper
binary, which Developer Mode may or may not allow on every model. Reports are welcome.

## Install (ready-made .ipk)

1. Download `com.pocketvibe.app_<version>_all.ipk` from this fork's **Releases**.
2. Register your TV once (name it `tv`; the passphrase is shown in the Developer Mode app):

   ```sh
   npm install -g @webos-tools/cli
   ares-setup-device --add tv --info "{'host':'<tv-ip>','port':'9922','username':'prisoner'}"
   ares-novacom --device tv --getkey
   ```
3. Install and start:

   ```sh
   ares-install --device tv com.pocketvibe.app_<version>_all.ipk
   ares-launch  --device tv com.pocketvibe.app
   ```

   Updating: install the new `.ipk` over the old one; if that fails, `ares-install --device tv --remove com.pocketvibe.app` first.
   Your games and settings live on the TV in `/media/developer/pocketvibe` and survive a reinstall.

On first start the app shows a short diagnostic (Chromium version, WebGL2, ...) and then opens the launcher with two games installed.
Open the **Store** tab for the rest.

## Build it yourself

```sh
./webos/build.sh                      # -> webos/dist/com.pocketvibe.app_<version>_all.ipk
./webos/build.sh --games jet-rush     # bundle other store games (comma separated)
./webos/build.sh --games-dir DIR      # bundle <id>.zip files from DIR instead of downloading them
```

The version of the `.ipk` is the version in `app/pocketvibe/config.json`. A GitHub Actions workflow
(`.github/workflows/webos-build.yml`) builds the same file on a tag such as `webos-v0.7.4` and attaches it to a release.

## Controls

See [docs/CONTROLS.md](docs/CONTROLS.md). In short:

| Remote | Does |
|---|---|
| D-pad, OK | move, A |
| Back | B (hold 0.5 s: back to the launcher) |
| Red / Green | X / Y |
| Yellow / Blue, Rewind / Fast-forward | L / R |
| Play / Pause, Stop | START, SELECT |
| INFO | in a game: back to the launcher; in the launcher: gamepad setup |

Gamepads: pair Bluetooth pads in the TV's settings (or plug a USB pad in) and press a button. Hold **START + SELECT** to leave a game.

## How it works, and what is different

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the parts. Differences from the handheld app:

- No save backup/restore and no in-app app update (a new `.ipk` is the update).
- Menu music starts off (the TV has little spare RAM); switch it on in Settings.
- Games run in the TV's browser, so their performance depends on the TV's GPU; the 3D games are lighter at the launcher's 720x480 design size.

Problems? See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md). The app writes a log to `/media/developer/pocketvibe/log.txt` on the TV.

## Keeping up with upstream

```sh
git remote add upstream https://github.com/cobanov/pocketvibe.git   # once
git fetch upstream && git merge upstream/main
./webos/build.sh
```

If upstream changes the launcher in a way the port patches no longer match, the build stops with a message naming the text it could not find;
fix the patch in `webos/tools/build.py`.

## License

MIT, like upstream (see the repository's `LICENSE`). Third-party pieces are listed in [NOTICE.md](NOTICE.md).
