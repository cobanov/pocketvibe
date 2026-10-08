# Lane Runner

An endless runner for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Run down a three-lane road for as long as you can. Hurdles: jump. Yellow bars: slide under. Red walls: change lanes. Coins are worth 25 points, every metre is 1 point, and the road keeps speeding up.

| Button | Action |
|---|---|
| D-pad left / right | Change lane |
| A (or UP) | Jump |
| DOWN | Slide (in the air: drop to the ground) |
| START | Pause |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states and loop), `src/player.js`, `src/track.js` (obstacles and coins), `src/world.js` (road and trees), `src/hud.js`. `src/handheld.js` is the unchanged device layer from the template.

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
