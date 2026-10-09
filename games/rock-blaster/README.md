# Rock Blaster

An asteroids-style shooter for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Pilot a small ship over a wrap-around starfield and blast the tumbling rocks. Large rocks split into two medium ones, medium into two small ones. Every wave starts with more and faster rocks, and a low two-note heartbeat speeds up as they thin out. From wave 2 a big saucer crosses the screen and sprays shots at you; from wave 3 a small, fast saucer may come instead, which aims straight at you and in later waves leads its shots. Saucers come sooner while only a few rocks are left. The ship drifts with inertia, so use thrust sparingly. When things get tight, B jumps to hyperspace. After a crash you come back in the centre once it is clear, blinking and shielded for a few seconds. Large rocks are worth 20 points, medium 50, small 100, the big saucer 500 and the small one 1000. You start with 3 ships and get another every 10,000 points. The best score and the furthest wave are kept.

The title has Play and Options (Sound and Music on or off); START opens the pause menu (Resume, Sound, Music, Quit to title). Sound effects and music play through `src/sound.js` (the shared PocketVibe sound module); the effects are made by `tools/sfx/games/rock-blaster.py`.

| Button | Action |
|---|---|
| D-pad left / right | Turn (tap for fine aim, hold to turn faster) |
| D-pad up | Thrust |
| D-pad up / down | Choose in menus |
| A | Fire (tap for rapid fire, or hold); select |
| B | Hyperspace (in play); resume (pause menu); back to title (game over) |
| START | Pause menu / resume |

Code: `src/main.js` (states, menus, collisions, sound and the loop), `src/ship.js`, `src/rocks.js`, `src/saucer.js` (both saucers), `src/shots.js` (pooled bullets), `src/fx.js` (particles, shock rings, flashes), `src/space.js` (nebula and parallax stars), `src/hud.js`, `src/shared.js`, `src/sound.js` (effects and music). `src/handheld.js` is the unchanged device layer from the template.

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
