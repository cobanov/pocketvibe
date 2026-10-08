# Road Hopper

An endless hopper for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Guide a voxel chicken as far as it can go. Every D-pad press is one hop on the grid. Grass rows have trees and rocks in the way and the odd coin; roads have lanes of cars and trucks (further on, some lanes come in convoys or mix a truck in among the cars); rivers must be crossed on drifting logs and still lily pads (the water is deadly, and a log will carry you off the edge); railways ring and flash red before a very fast train comes through; farm tracks have slow tractors towing long trailers of hay. The camera creeps forward on its own: dawdle, fall behind the bottom of the screen or stand still too long and a hawk swoops down. Your score is the furthest row you reach; a flag stands beside the row of your best run, and passing it is cheered. Coins add to a counter that is kept between runs. The world gets faster and busier the further you go.

Sound effects and music play throughout; the pause menu (START) and the options on the title screen (SELECT) turn each on or off.

| Button | Action |
|---|---|
| D-pad | Hop one cell (UP forward, DOWN back, LEFT / RIGHT sideways). Hold to keep hopping. In menus, choose. |
| A | Start / play again / choose in menus |
| START | Pause menu: resume, sound, music, quit to title |
| B | Back in menus (resumes from the pause menu); back to title from game over |
| SELECT | Options on the title screen |

Code: `src/main.js` (states, menus, loop and camera), `src/world.js` (the recycled row pool, level generation, cars, tractors, logs and trains, view culling, collision queries and the world's sounds), `src/player.js` (hopping, riding logs, deaths), `src/fx.js` (particles and the hawk), `src/models.js` (voxel models merged into single geometries), `src/hud.js`, `src/shared.js` (constants and paint/box helpers), `src/sound.js` (effects and music, shared by the PocketVibe games). `src/handheld.js` is the unchanged device layer from the template.

The sound effects in `public/sfx/` are synthesised by `tools/sfx/games/road-hopper.py` in the PocketVibe repository; the music is `public/music/theme.ogg`.

## Start

```sh
npm install
npm run dev
```

Open the address it prints. The game shows in a 720×480 frame, the size of the handheld's screen.

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
