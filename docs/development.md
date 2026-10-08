# Development

## The pieces

| Folder | What it is |
|---|---|
| `app/` | The handheld app. `PocketVibe.sh` is the Ports entry: it runs the first-run setup, starts the local service and the browser, and restarts the browser after an update. |
| `app/pocketvibe/pocketvibed.py` | The local service on `127.0.0.1:8730`: Library, Store, downloads, saves, app updates, and Start + Select. Python standard library only. |
| `app/pocketvibe/runtime.py` | Runs Cog inside the runtime (a Debian root with WPE WebKit) in its own mount namespace, so WebKit's sandbox works. |
| `app/pocketvibe/setup.sh` | The first-run download of the runtime, drawn with `dialog`. |
| `app/pocketvibe/launcher/` | The launcher: plain HTML, CSS and JavaScript, no build step. |
| `template/` | The starter project. `packages/create-pocketvibe` copies it; `packages/pocketvibe` is the command line tool. |
| `store/worker/` | The store: a Cloudflare Worker with D1 (catalog, uploads, download counts) and R2 (zips, covers). |
| `site/` | The website, with the launcher running in the browser. |
| `bench/` | The performance measurements behind the rules in `template/AGENTS.md`. |
| `device/` | Scripts for working on a handheld over SSH. |
| `games/` | Games made with the starter project. They are in the store. |

## Run the launcher on your computer

```sh
POCKETVIBE_HOME=/tmp/pocketvibe python3 app/pocketvibe/pocketvibed.py
```

Open http://127.0.0.1:8730 at 720×480. The keyboard stands in for the buttons (arrows, X for A,
Z for B, S for X, A for Y, Q and W for L and R, Enter for Start, Shift for Select). Games from the
store download into `$POCKETVIBE_HOME/games`.

`tools/ui-shots.mjs` drives it in headless Chrome and saves screenshots:

```sh
FONTS=<folder with DejaVuSans.ttf and DejaVuSans-Bold.ttf> \
  node tools/ui-shots.mjs http://127.0.0.1:8730/ shots wait:1500 shot:library key:KeyW shot:store
```

## Work on a handheld

Turn on SSH in ROCKNIX and note the handheld's address. `HANDHELD` defaults to
`root@192.168.8.197`.

```sh
HANDHELD=root@<address> sh device/install-app.sh   # copy this checkout's app to the handheld
HANDHELD=root@<address> sh device/play.sh dist     # put a built game in the Library and start it
```

To start the app as the Ports menu does: `curl -d /storage/roms/ports/PocketVibe.sh http://127.0.0.1:1234/launch`
on the handheld. Its files live in `/storage/pocketvibe` (`app`, `runtime`, `games`,
`settings.json`, `backups`); the logs are `/tmp/pocketvibed.log` and `/tmp/pocketvibe-cog.log`.

Two things to know:

- `pkill -f <pattern>` over SSH also matches the SSH command that contains the pattern and ends
  your own session. Kill by PID, or write the pattern so it cannot match itself (`serve[r]`).
- The browser is ended with SIGKILL on purpose: Cog 0.18 crashes in its own shutdown code.
  Saves are written by WebKit's network process and are not lost.

## The store

```sh
cd store/worker
npm install
cf dev       # local, with local D1 and R2
cf deploy    # https://pocketvibe-store.mertcobanov.workers.dev
```

The schema is in `migrations/0001_init.sql`. `GET /catalog.json` is what handhelds read.
`POST /api/publish` takes a game zip from a signed-in GitHub user; uploads from anyone but the
admin (`ADMIN_LOGIN`) wait in `pocketvibe pending` until `pocketvibe approve` or `reject`.

## The website

```sh
cd site
npm install
npm run dev      # also copies the launcher and unpacks the store's games
npm run deploy   # https://pocketvibe.cobanov.dev
```

`public/sw.js` answers the launcher's `/api` calls the way `pocketvibed.py` does, so keep the two
in step when the service's answers change.

## Releasing the app

1. Raise `version` in `app/pocketvibe/config.json`.
2. `NOTES="What changed" sh app/release.sh --publish`

This makes the GitHub release `v<version>` with two files: `PocketVibe.zip`, which people install
and the website links to, and `pocketvibe-app-<version>.zip`, which installed apps download. Apps
look for a newer release every six hours and offer it in Settings; the checksum is in the notes.
Run it without `--publish` to only build the zips into `dist/`.

## The runtime

The runtime is a Debian trixie arm64 root with WPE WebKit 2.48, Cog 0.18 and Mesa, released once
as `runtime-v1`. `config.json` names its address, size and sha256. It was made by hand from the
root that `device/debian-chroot.sh fetch` creates, with Cog installed through apt; a script that
rebuilds it is still to do.
