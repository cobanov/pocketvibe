# Jet Rush

A jetpack side-scroller for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Run and fly through an endless lab corridor. Hold A to fire the jetpack and rise, let go to fall back to the floor. Dodge electric zappers (standing, hanging, floating, diagonal, spinning ones, and elevators riding up and down a rail) and missiles: a blinking, beeping warning at the right edge follows your height for about a second, turns red and locks, then the missile streaks across. Laser emitters slide in at both edges of the screen, show a thin blinking aim line, then fire a beam across the whole corridor for a second, sometimes in two or three waves: find the gap and stay in it. Grab coins laid out in lines, arcs, blocks, waves, zigzags, rings, arrows and diamonds; coins grabbed in quick succession climb the scale. Every metre is a point and every coin adds 5; one hit ends the run.

The corridor speeds up over the first 1,500 m, and new hazards join as it does, each shown on its own the first time: missiles, gates, lasers, combos, spinning zappers, elevators, slaloms, tunnels, S-bends and, late on, missiles fired into a slalom. Past full speed the mix keeps getting harder. The best distance, best score and most coins in a run are saved and shown on the title screen; a yellow BEST sign marks your best distance in the corridor.

| Button | Action |
|---|---|
| A (hold), or UP | Fly up; let go to fall |
| D-pad, A | Choose and select in menus (Play, Options with Sound and Music) |
| A or START | Play again after a run |
| START | Pause menu (Resume, Sound, Music, Quit to title) / resume |
| B | Back in menus, resume when paused, title from game over |

Sound effects and music: `src/sound.js` (the shared PocketVibe sound module, unchanged) plays the WAV effects in `public/sfx/` and the music in `public/music/theme.ogg`. The effects are made by code: `tools/sfx/games/jet-rush.py` in the PocketVibe repository writes them (all tonal ones in E minor, the music's key).

Code: `src/main.js` (states, menus, scoring, sound, camera and loop), `src/hero.js` (jetpack physics, animation, footsteps, tumble), `src/hazards.js` (zappers and missiles), `src/lasers.js` (laser walls), `src/coins.js`, `src/level.js` (pattern generator and difficulty), `src/world.js` (corridor scenery and parallax), `src/particles.js` (flames, smoke, sparks), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.

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
