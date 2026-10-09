# Snake

Classic snake for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Steer a snake around a 24×16 toy board seen from above. Every apple is worth 10 points and makes the snake one segment longer. After every fifth apple a golden star appears for 44 steps of the snake (six seconds at the start, less as the snake speeds up): the quicker you grab it, the more it is worth (30 to 80 points). Once the star is gone, caught or not, the snake gets a notch faster, up to speed 10. Hitting a wall, a block or your own body ends the run. Quick taps are buffered (up to two turns), so a fast U-turn works, turning straight back into your neck is ignored, and a diagonal on the D-pad turns only once.

Pick the board on the title screen; each keeps its own best score:

- **Classic**: the open board.
- **Pillars**: six toy-block pillars.
- **Tunnels**: two long walls with a gap in the middle.
- **Fort**: a walled square in the middle with a gate on every side.

The title's Options and the pause menu (START) switch the sound effects and the music on and off.

| Button | Action |
|---|---|
| D-pad | Steer / choose in menus (LEFT and RIGHT change the board) |
| A | Select / play again |
| START | Pause menu / resume |
| B | Back / title after game over |

Code: `src/main.js` (states, menus, ticks, speed, scoring, sounds, camera), `src/snake.js` (grid logic, turn queue and the drawn snake), `src/food.js` (apple and bonus star), `src/boards.js` (the board layouts), `src/board.js` (board, walls and scenery as one merged mesh, the checker floor, each board's blocks), `src/fx.js` (particles), `src/hud.js`, `src/shared.js` (grid constants and mesh helpers). `src/sound.js` is the shared PocketVibe sound module; the effects in `public/sfx/` are made by `tools/sfx/games/snake.py` in the PocketVibe repository, and `public/music/theme.ogg` is the music. `src/handheld.js` is the unchanged device layer from the template.

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
