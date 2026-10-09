# Maze Chase

An arcade maze chase for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Roll a little robot through a neon maze seen from a tilted camera and eat every dot (10 points) while four drones hunt you, each in its own way: Rook (red) chases you straight on, Vex (violet) cuts you off a few cells ahead, Glint (green) flanks you using Rook, and Moth (amber) closes in but turns shy when it gets near. They spread to their corners and come back hunting on a timer. The four power cores (50) frighten them for a few seconds: frightened drones turn dark blue and flee, and eating them in a row scores 200, 400, 800 and 1600 before they fly home as a wisp. Twice per maze a bonus pickup appears below the base, a different one on every level (nut, battery, chip, gem, star, bell, crown and key, from 100 up to 5000 points). Side tunnels wrap around, and you start with three lives and get an extra one at 10,000 points.

There are five mazes, played in order: Circuit, Twin Gates, Lattice, Orbit and Sunspot. A card shows each one as it comes up; every level the drones get faster, leave their base sooner and stay frightened for less time, and after the fifth maze the mazes come round again. The camera starts each maze on the whole layout, then comes closer and follows the robot, so the robot, the drones and the dots are easy to read on a small screen; arrows at the screen's edges point at drones out of view. VIEW on the title menu keeps the whole maze in view instead.

The title menu starts a game on any maze you have already reached, sets the view, and turns sound effects and music on or off; the pause menu has the same sound switches. The game keeps your best score and the furthest level you reached.

| Button | Action |
|---|---|
| D-pad | Move (a turn pressed early is taken at the next junction); choose in menus (left / right change the start level and switches) |
| A | Select; play again |
| START | Pause menu and resume |
| B | Resume from the pause menu; back to title after game over |

Code: `src/main.js` (states, menus, rounds, scoring, sounds and the level ramp), `src/camera.js` (the full and close views), `src/maze.js` (the grid, merged walls with glowing edges, the floor glow baked into a small texture, instanced dots and cores), `src/mazes.js` (the five layouts), `src/player.js` (grid movement with buffered and cut corners, the robot), `src/drones.js` (drone AI, scatter / chase targets, wisps and the instanced drones), `src/autopilot.js` (the title-screen player), `src/bonus.js` (the bonus pickups), `src/fx.js` (particles), `src/hud.js`, `src/shared.js` (directions, grid helpers and mesh helpers). `src/handheld.js` is the unchanged device layer from the template, `src/sound.js` the shared PocketVibe sound module.

Sound: the effects in `public/sfx/` are synthesised by `tools/sfx/games/maze-chase.py` in the PocketVibe repository (C minor, to sit with the music); `public/music/theme.ogg` is the music.
