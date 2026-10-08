# Maze Chase

An arcade maze chase for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Roll a little robot through a neon maze seen from a tilted camera and eat every dot (10 points) while four drones hunt you, each in its own way: Rook (red) chases you straight on, Vex (violet) cuts you off a few cells ahead, Glint (green) flanks you using Rook, and Moth (amber) closes in but turns shy when it gets near. They spread to their corners and come back hunting on a timer. The four power cores (50) frighten them for a few seconds: frightened drones turn dark blue and flee, and eating them in a row scores 200, 400, 800 and 1600 before they fly home as a wisp. A gem worth more on every level appears twice per maze, side tunnels wrap around, and you start with three lives and get an extra one at 10,000 points. Three mazes come in rotation; every level the drones get faster, leave their base sooner and stay frightened for less time.

| Button | Action |
|---|---|
| D-pad | Move (a turn pressed early is taken at the next junction) |
| A | Start / play again |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, rounds, scoring, level ramp and camera), `src/maze.js` (the grid, merged walls with glowing edges, the glowing floor, instanced dots and cores), `src/mazes.js` (the three layouts), `src/player.js` (grid movement with buffered and cut corners, the robot), `src/drones.js` (drone AI, scatter / chase targets, wisps and the instanced drones), `src/autopilot.js` (the title-screen player), `src/bonus.js` (the gem), `src/fx.js` (particles), `src/hud.js`, `src/shared.js` (directions, grid helpers and mesh helpers). `src/handheld.js` is the unchanged device layer from the template.
