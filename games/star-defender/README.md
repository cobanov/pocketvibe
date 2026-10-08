# Star Defender

A fixed-screen shooter for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the OpenBoy template.

Fifty aliens in five rows march sideways across a tilted neon playfield, drop a row at every edge and speed up as their numbers thin. Slide your ship along the bottom, fire up through the gaps and hide behind four bunkers that crumble block by block under bombs and stray shots. Pink stingers are worth 30, blue crabs 20 and yellow jellies 10; the mystery saucer that crosses the far end now and then is worth up to 300. Shooting a bomb cancels it. You have three ships and earn another every 2,500 points; every cleared wave warps you to a faster formation that starts a little closer. If the aliens reach your line, the game is over.

| Button | Action |
|---|---|
| D-pad left / right | Move |
| A | Fire (hold for auto fire, tap for faster shots; two shots on screen at most) |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, waves, scoring and the loop), `src/aliens.js` (the formation), `src/shots.js` (bullets, bombs and what they hit), `src/shields.js` (bunkers), `src/player.js` (the ship), `src/saucer.js`, `src/fx.js` (explosion particles), `src/background.js` (stars, planet, grid and rails), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.

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
