# Jet Rush

A jetpack side-scroller for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Run and fly through an endless lab corridor. Hold A to fire the jetpack and rise, let go to fall back to the floor. Dodge electric zappers (standing, hanging, floating, diagonal and spinning ones) and missiles: a blinking warning at the right edge follows your height for about a second, turns red and locks, then the missile streaks across. Grab coins laid out in lines, arcs, blocks and waves. Every metre is a point and every coin adds 5; the corridor keeps speeding up and one hit ends the run.

| Button | Action |
|---|---|
| A (hold), or UP | Fly up; let go to fall |
| A | Start, play again |
| START | Pause / resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, scoring, camera and loop), `src/hero.js` (jetpack physics, animation, tumble), `src/hazards.js` (zappers and missiles), `src/coins.js`, `src/level.js` (pattern generator), `src/world.js` (corridor scenery and parallax), `src/particles.js` (flames, smoke, sparks), `src/hud.js`, `src/shared.js` (constants and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.

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
