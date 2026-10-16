# Architecture

```
LG TV
 ├─ app  com.pocketvibe.app (web app, file://)
 │    index.html   diagnostic screen, starts the service, then opens http://127.0.0.1:8730/
 └─ service  com.pocketvibe.app.service (Node.js, Luna JS service)
      pocketvibed.js   port of app/pocketvibe/pocketvibed.py: library, store, install, settings, game servers
      launcher/        upstream launcher + webOS shim, pointer support, gamepad setup page
      bundled/         a few games, already rewritten for the TV
      bin/esbuild.gz   ARM esbuild, unpacked on first use
      ca.pem           CA list used if the TV's own list fails
```

## Why not the handheld's runtime?

On ROCKNIX the app runs WPE WebKit from a 150 MB Debian root. A TV already has a web engine, and the games are plain HTML/JS/WebGL, so the port serves them to that engine and replaces only the Python service.

## The service (`webos/service/pocketvibed.js`)

- Same HTTP API the launcher already speaks (`/api/library`, `/api/store`, `/api/launch/<id>`, ...), so the launcher needs no changes for it.
- Every game is served from its own port on `127.0.0.1`, so each game keeps its own `localStorage` (saves), as on the handheld.
- Written for **Node 8** (webOS 5): no optional chaining, `fs.rmSync`, or `https.get(url, options, cb)`. A zip reader and an installer with sha256 checks are built in; there are no npm dependencies.
- `/api/info` reports `platform: "webos"`, so the launcher hides the save backup and app update rows (the build patches those two checks).

## Making new JavaScript run on Chromium 68

Chromium 68 predates `?.`, `??`, top-level `await`, `aspect-ratio`, `min()` and flex `gap`.

- **At build time** `tools/build.py` rewrites the launcher and the bundled games with esbuild (`--target=chrome68`), patches `play.js` (top-level await), and replaces the CSS that Chromium 68 does not know.
- **On the TV**, games installed from the store arrive untouched; the service runs the ARM esbuild over each game's `.js`/`.css` once (one file at a time, to save RAM) and marks the game with `.pv-lowered-1`.
- `webos-shim.js` adds small polyfills (`Array.prototype.at`, `structuredClone`, `Object.hasOwn`, ...).

## Input

`webos-shim.js` is injected into every page the service serves:

- maps remote key codes to the `KeyboardEvent.code` values PocketVibe reads;
- wraps `navigator.getGamepads()` to present all pads in the standard layout (saved mappings come from `padmap.json`, injected as `window.__PV_PAD`);
- leaves a game on Back held / INFO / START+SELECT, keeps keyboard focus in the game frame, and resumes suspended audio contexts;
- shows errors on screen and posts them to `/__pvlog`.

`pointer.js` is appended to the launcher for Magic Remote pointer support.

## Build

`webos/build.sh` -> `tools/build.py`: copy `app/pocketvibe/launcher`, apply asserted patches, rewrite, bundle games, add ARM esbuild + CA list, `ares-package`. The patches fail the build when the text they expect has changed upstream.
