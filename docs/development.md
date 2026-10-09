# Development

## The pieces

| Folder | What it is |
|---|---|
| `app/` | The handheld app. `PocketVibe.sh` is the Ports entry: it runs the first-run setup, starts the local service and the browser, and restarts the browser after an update. |
| `app/pocketvibe/pocketvibed.py` | The local service on `127.0.0.1:8730`: Library, Store, downloads, saves, app updates, and Start + Select. Python standard library only. |
| `app/pocketvibe/runtime.py` | Runs Cog inside the runtime (a Debian root with WPE WebKit) in its own mount namespace, so WebKit's sandbox works. |
| `app/pocketvibe/setup.sh` | The first-run download of the runtime, drawn with `dialog`. |
| `app/pocketvibe/launcher/` | The launcher: plain HTML, CSS and JavaScript, no build step. `play.html` is the game shell (see below). |
| `android/` | PocketVibe for Android handhelds and phones: the same launcher in a WebView, with a Kotlin version of the local service. |
| `ios/` | PocketVibe for the iPhone: the same launcher in a WKWebView, with a Swift version of the local service. |
| `app/pocketvibe/screens.py` | The handheld's screens, read from Sway: turns a second screen on while PocketVibe runs and spreads the browser's window over both. |
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

`POCKETVIBE_PORT` moves the service off 8730, to run a second copy beside one that is running.

## Screens

The launcher fills whatever screen it gets: its cards take as many columns as the width holds
(three from 640 to 720 pixels), and on a big screen it is enlarged by quarters. It is drawn in
720×480 pixels, so on the RG34XX SP it looks exactly as it always has.

Games are made for one 720×480 screen and stay that way. pocketvibed opens every game in the
game shell, `/__pocketvibe__/play.html` on the game's own port: the game runs in a 720×480 frame
fitted to the screen (or, if it is responsive, in a frame of the screen's shape), behind a splash
with its cover and name until it has drawn its first frames. The shell is on the game's origin,
so the game keeps its saves: a save made with the game opened on its own is there in the shell,
and the other way round (checked on the handheld). On the H700 the shell costs about 1.5 fps of
58 in Turbo Circuit. `&perflog` on the shell's address is handed on to the game.

A handheld with two screens (the Anbernic RG DS) gets both: `screens.py` turns the second one on,
which EmulationStation keeps off, and makes the browser's window span the two. The launcher draws
on the main screen and shows the focused game's details on the other; the game shell shows the
game's controls there. `PocketVibe.sh` turns the second screen off again on the way out.

To try a layout on the computer, give the launcher its screens in the address, and set the window
to their size:

```sh
SIZE=1280x480 node tools/ui-shots.mjs 'http://127.0.0.1:8730/?screens=0,0,640,480;640,0,640,480' shots ...
```

`POCKETVIBE_SCREENS=640x480+0+0,640x480+640+0` makes pocketvibed itself act as a two-screen
handheld, so games open in the shell.

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

To test without touching the handheld, `tools/handheld-pad.py` adds a virtual gamepad to it,
and `tools/handheld-run.sh` plays a file of button presses and screenshots on it (see the top of
`handheld-pad.py`). Screenshots come from `grim`, so they show exactly what the screen shows.

Two things to know:

- `pkill -f <pattern>` over SSH also matches the SSH command that contains the pattern and ends
  your own session. Kill by PID, or write the pattern so it cannot match itself (`serve[r]`).
- The browser is ended with SIGKILL on purpose: Cog 0.18 crashes in its own shutdown code.
  Saves are written by WebKit's network process and are not lost.

## Android

`android/` is PocketVibe for Android handhelds (Retroid Pocket 3+, Anbernic RG Rotate) and phones. It
shows the same launcher and game shell, copied from `app/pocketvibe/launcher` at build time, in
a full-screen WebView. `PocketVibe.kt` does pocketvibed's work: it serves the launcher and its
`/api` on 127.0.0.1, each game on its own port, and talks to the stores. Other apps can reach
127.0.0.1 too, so the API also wants a cookie that only the app's own page gets.
`MainActivity.kt` turns the handheld's buttons into the keyboard keys the pages already read and
watches Start + Select. Games always open in the shell; the launcher scales by the screen's
real pixels, so it looks the same on a 1334×750 screen as on a 720×720 one. A phone has no
buttons, so `TouchPad.kt` draws them: upright the page sits at the top in 3:2 with the buttons
below it, on its side the buttons sit either side of it. A connected gamepad (a handheld's own
buttons are one) hides them.

You need JDK 21 and the Android SDK (`brew install openjdk@21` and
`brew install --cask android-commandlinetools android-platform-tools`, then
`sdkmanager "platforms;android-35" "build-tools;35.0.0"`):

```sh
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`adb logcat -s PocketVibe` shows the pages' console. A debug build can be inspected from
`chrome://inspect` on the computer.

`android/release.sh` builds the signed APK; with `--publish` it creates the GitHub release
`android-v<version>`, never marked latest, so `releases/latest` stays the handheld app. The
release key is `~/.config/pocketvibe/android-release.keystore`, its password in the macOS
Keychain as `pocketvibe-android-keystore`. Keep a copy of both somewhere safe: an APK signed
with another key cannot update the installed app. A debug build is signed with another key, so
it has to be removed before the release can be installed.

## iPhone

`ios/` is PocketVibe for the iPhone, built like the Android app: the launcher and game shell,
copied from `app/pocketvibe/launcher` at build time (`scripts/copy-web.sh`), in a full-screen
WKWebView. `Service.swift` is the Swift version of `PocketVibe.kt` (`Http.swift` the server,
`Unzip.swift` the zips), `TouchPad.swift` the buttons on the screen, the same as on an Android
phone. They reach the page as key events sent by script. A gamepad needs nothing from the app:
the pages read it with the Gamepad API, and the buttons on the screen hide while one is
connected. The iPhone app has no Quit, no app update (TestFlight and the App Store do that) and
no save backups; the launcher leaves those out when `/api/info` says `"platform": "ios"`.

The Xcode project is generated (`brew install xcodegen`); the version is the handheld app's and
the build number the repository's commit count:

```sh
sh ios/scripts/generate.sh
open ios/PocketVibe.xcodeproj
```

Its UI test plays a game with the screen's buttons in the simulator and leaves screenshots in
`$TEST_RUNNER_SHOTS`. A debug build started with `POCKETVIBE_SILENT=1` stays silent (the
simulator's sound comes out of the Mac) and with `POCKETVIBE_TOUCH=1` shows the buttons even
though the simulator passes the Mac's gamepads on.

`ios/scripts/testflight.sh` builds, signs and uploads to TestFlight with an App Store Connect API
key (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `APPLE_TEAM_ID`). `ios/scripts/asc.swift` registers the bundle
id, makes the App Store profile, lists builds and adds the team as internal testers. The App
Store Connect API cannot create the app record; it was made once in the web page. App Store
Connect takes each build number once, so commit before uploading again.

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
and the website links to, and `pocketvibe-app-<version>.zip`, which installed apps download.
`PocketVibe.zip` also carries the store's current copies of the games a new install starts with
(`BUNDLED_GAMES` in `app/release.sh`); the app unpacks them into the Library on its first start. Apps
look for a newer release every six hours and offer it in Settings; the checksum is in the notes.
Run it without `--publish` to only build the zips into `dist/`.

## The runtime

The runtime is a Debian trixie arm64 root with WPE WebKit 2.48, Cog 0.18 and Mesa, released once
as `runtime-v1`. `config.json` names its address, size and sha256. It was made by hand from the
root that `device/debian-chroot.sh fetch` creates, with Cog installed through apt; a script that
rebuilds it is still to do.
