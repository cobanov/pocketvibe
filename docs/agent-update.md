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
