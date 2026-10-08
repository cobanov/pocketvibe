# Sky Hopper

A flappy-bird-style game for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the OpenBoy template.

Keep a little low-poly bird in the air above a grassy ledge in the clouds. Each flap kicks it upward, gravity pulls it back down, and pairs of green pipes scroll in from the right with a gap at a random height. Fly through a gap for 1 point; touching a pipe or the ground ends the run. The gaps slowly get narrower and the pipes faster as the score climbs. Reach 10 points for a bronze medal, 25 for silver and 50 for gold.

| Button | Action |
|---|---|
| A (or UP) | Flap (the first flap starts the run) |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states and loop), `src/bird.js` (flight and model), `src/pipes.js` (pipe pool, gaps, scoring, hits), `src/world.js` (sky, parallax layers and the scrolling ledge), `src/particles.js` (feathers and sparkles), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.

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
