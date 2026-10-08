# Block Drop

A falling-block puzzle for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Seven kinds of pieces fall into a 10×20 well of chunky bevelled 3D blocks. Slide and rotate them so they fill whole rows: a full row flashes and bursts, and everything above drops down. Pieces come from a 7-bag (every seven pieces hold one of each), rotate with SRS wall kicks, and wait half a second on the stack before locking, so there is time for a last slide or spin. A ghost shows where the piece will land, the next three wait on the right and one piece can be kept in the hold box. Clearing 1, 2, 3 or 4 rows scores 100, 300, 500 or 800 points times the level, quads in a row earn a back-to-back bonus and clears in a row a combo bonus. Every 10 lines the level goes up, the pieces fall faster and the sky changes colour. Soft drops score 1 point per row, hard drops 2.

| Button | Action |
|---|---|
| D-pad left / right | Move (hold to slide across) |
| DOWN | Soft drop |
| UP | Hard drop |
| A | Rotate clockwise; start / play again |
| B | Rotate counter-clockwise; back to title (paused or game over) |
| L or R | Hold the piece (once per piece) |
| START | Pause / resume |

Code: `src/main.js` (states, camera and loop), `src/game.js` (rules: movement with auto-repeat, rotation, lock delay, line clears, scoring), `src/pieces.js` (shapes and SRS kick tables), `src/well.js` (well, side panels, every block as one InstancedMesh, ghost piece), `src/fx.js` (particles), `src/backdrop.js` (sky and drifting blocks), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.

## Start

```sh
npm install
npm run dev
```

Open the address it prints. The game shows in a 720×480 frame, the size of the handheld's screen; the links under it try the other screen shapes.

## Controls in the browser

| Handheld | Keyboard |
|---|---|
| D-pad | Arrow keys |
| A | X |
| B | Z |
| X | S |
| Y | A |
| L / R | Q / W |
| Start | Enter |
| Select | Shift |

`P` toggles the performance overlay (fps, draw calls, triangles). It turns red when the game is too heavy for the handheld.
