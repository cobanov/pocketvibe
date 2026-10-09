# Lane Runner

An endless runner for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Run down a three-lane road for as long as you can. Hurdles: jump. Yellow bars: slide under. Red walls: change lanes. Blue vans drive at you, faster than the road: get out of their lane. The obstacles come in hand-made patterns that combine the lanes (gates, corridors, zigzags, staircases of hurdles, vans on both sides), and every pattern is timed in seconds of running, so each move gets a fair amount of time at any speed. A jump pressed just before landing still happens, and DOWN in the air drops you to the ground into a slide. Running into the side of something while changing lanes bounces you back instead of ending the run; dodging a wall or van at the last moment is a close call worth 10 points.

Coins are worth 25 points and every metre is 1 point. Coin trails show a way through each pattern, arcing over hurdles and running low under bars; coins grabbed in quick succession climb the scale. Now and then a power-up waits on the trail: the magnet pulls in every coin ahead for 8 seconds, the shield takes one hit for you within 10 seconds. Every 400 m the road speeds up and harder patterns join, up to full speed at 4,800 m. The best distance, best score and most coins in a run are saved and shown on the title screen; a BEST banner across the road marks your best distance.

| Button | Action |
|---|---|
| D-pad left / right | Change lane |
| A (or UP) | Jump |
| DOWN | Slide (in the air: drop to the ground) |
| D-pad, A | Choose and select in menus (Play, Options with Sound and Music) |
| A or START | Run again after a crash |
| START | Pause menu (Resume, Sound, Music, Quit to title) / resume |
| B | Back in menus, resume when paused, title from game over |

Sound effects and music: `src/sound.js` (the shared PocketVibe sound module, unchanged) plays the WAV effects in `public/sfx/` and the music in `public/music/theme.ogg`. The effects are made by code: `tools/sfx/games/lane-runner.py` in the PocketVibe repository writes them (all tonal ones in F-sharp minor, the music's key).

Code: `src/main.js` (states, menus, scoring, power-ups, sound, camera and loop), `src/player.js` (running, jumping, sliding, the crash), `src/track.js` (obstacles, coins and power-ups, collisions), `src/patterns.js` (the obstacle patterns and the speed of each stage), `src/models.js`, `src/world.js` (road, trees and the BEST banner), `src/fx.js` (dust, sparkles, debris), `src/hud.js`, `src/shared.js`. `src/autopilot.js` plays the game for testing and is only loaded by the dev server. `src/handheld.js` is the unchanged device layer from the template.

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
