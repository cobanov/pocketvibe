# Update for the game agents

The project is now called PocketVibe and games are published to its store. Apply these to every game you work on, and only touch files inside your own game's folder.

1. **Store manifest is `pocketvibe.json`** at the game's root. It replaces both `openboy.json` and `game.json`:
   - `id`: unique, lowercase letters, digits and dashes, normally the folder name (e.g. `star-defender`). It must never be `coin-rush`; that id belongs to the template's example game.
   - `title`, `author`, `version`, `description` (one or two sentences), `genre`.
   - `controls`: what each button does, e.g. `{ "D-pad": "Move", "A": "Jump", "START": "Pause" }`.
   - Move everything from your `game.json` into `pocketvibe.json`, then delete `game.json`.
   - Bump `version` whenever you change the game (`1.0.1`, `1.1.0`, ...); the store only offers an update when the version changes.
2. **Cover**: `cover.png` (480×270) at the game's root. One was generated from each game's title screen; replace it if you change the title screen.
3. **Refresh the rules**: copy `template/AGENTS.md` over your game's `AGENTS.md`. The new version adds the store listing rules and the measured performance numbers.
4. **Leaving a game is handled by the system**: holding Start + Select returns to the PocketVibe launcher, whatever the game does. Do not implement a quit option, and never use Start + Select together in the game.
5. **Building for the store**: do not change `vite.config.js` (`base: './'` is required) and keep the game working offline.

## Current state (2026-10-08)

- **The rename is finished.** Nothing is called openboy any more on the handheld or in the app: `/storage/pocketvibe`, `app/PocketVibe.sh`, `app/pocketvibe/pocketvibed.py`. Do not ask about it or rename anything.
- **The store is live on Cloudflare**: https://pocketvibe-store.mertcobanov.workers.dev (catalog at `/catalog.json`). The handheld app reads it.
- **All 11 games are already published** at the versions in their manifests (1.0.1, snake 1.0.2), plus the template's Coin Rush 1.0.0. Nothing needs republishing until a game changes.
- **`store/publish.mjs` and `store/public/` are the old local test store.** Do not use them.
- **To publish a changed game**: bump `version` in its `pocketvibe.json`, then from the repo root run `node packages/pocketvibe/cli.js publish games/<folder>`. It builds into a temporary folder (your `dist/` is untouched), zips with the cover and uploads, signed in through `gh auth token`. The store refuses a version it already has.
- `node packages/pocketvibe/cli.js status` lists the published games and uploads.

