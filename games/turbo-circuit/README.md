# Turbo Circuit

An arcade lap racer for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Three laps around a sunny low-poly circuit against three rival cars. You start at the back of the grid; after the 3-2-1-GO countdown, hold A to accelerate, brake into the hairpin with B, cut across the curbs and hit the glowing boost pads for a turbo burst. The grass slows you down, cars bump and spin each other, cones go flying. Rivals follow their own racing line at slightly different paces, and ease off or push harder depending on how far ahead or behind you they are. Once the winner crosses the line you have 40 seconds to finish. Your best total time is saved.

| Button | Action |
|---|---|
| A | Accelerate (title, results: start a race) |
| B | Brake, then reverse; brake while steering to slide (results: back to title) |
| D-pad left / right | Steer |
| START | Pause (paused: START resumes, B quits to the title) |

Code: `src/main.js` (states, chase camera and loop), `src/track.js` (the spline circuit, lap tracking, AI racing line, road and boost pad meshes), `src/car.js` (arcade car physics, AI driver, car-to-car bumps, car model), `src/race.js` (grid, standings, lap times, effects), `src/scenery.js` (sky, grass, trees, arch, grandstand, boards, knockable cones), `src/fx.js` (pooled particles), `src/hud.js` (position, lap, time, speed, minimap, banners and menus), `src/shared.js` (constants and helpers). `src/handheld.js` is the unchanged device layer from the template.

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
