# Rock Blaster

An asteroids-style shooter for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Pilot a small ship over a wrap-around starfield and blast the tumbling rocks. Large rocks split into two medium ones, medium into two small ones. Every wave starts with more and faster rocks, and from wave 2 a saucer crosses the screen and takes shots at you, aiming better each wave. The ship drifts with inertia, so use thrust sparingly. When things get tight, B jumps to hyperspace. After a crash you come back in the centre once it is clear, blinking and shielded for a few seconds. Large rocks are worth 20 points, medium 50, small 100 and the saucer 500. You start with 3 ships and get another every 10,000 points.

| Button | Action |
|---|---|
| D-pad left / right | Turn (tap for fine aim, hold to turn faster) |
| D-pad up | Thrust |
| A | Fire (tap for rapid fire, or hold) |
| B | Hyperspace (in play); back to title (paused or game over) |
| START | Pause / resume |

Code: `src/main.js` (states, collisions and the loop), `src/ship.js`, `src/rocks.js`, `src/saucer.js`, `src/shots.js` (pooled bullets), `src/fx.js` (particles, shock rings, flashes), `src/space.js` (nebula and parallax stars), `src/hud.js`, `src/shared.js`. `src/handheld.js` is the unchanged device layer from the template.

## Start

```sh
npm install
npm run dev
```

Open the address it prints. The game shows in a 720×480 frame, the size of the handheld's screen; the links under it try the other screen shapes (4:3, 16:9 and 1:1).

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
