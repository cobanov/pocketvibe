# Snake

Classic snake for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Steer a snake around a 24×16 toy board seen from above. Every apple is worth 10 points, makes the snake one segment longer and the game a little faster. After every fifth apple a golden star appears for six seconds: the quicker you grab it, the more it is worth (30 to 80 points). Hitting a wall or your own body ends the run. Quick taps are buffered (up to two turns), so a fast U-turn works, and turning straight back into your neck is ignored.

| Button | Action |
|---|---|
| D-pad | Steer |
| A | Start / play again |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, ticks, scoring, camera), `src/snake.js` (grid logic, turn queue and the drawn snake), `src/food.js` (apple and bonus star), `src/board.js` (board, walls and scenery as one merged mesh), `src/fx.js` (particles), `src/hud.js`, `src/shared.js` (grid constants and mesh helpers). `src/handheld.js` is the unchanged device layer from the template.

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

## Making your game with AI

`AGENTS.md` (also read through `CLAUDE.md`) tells AI coding tools how to write code for the handheld: the screen, the buttons and the performance rules. Describe your game to your AI tool and it will follow those rules.

## Putting it on the handheld

Coming soon.
