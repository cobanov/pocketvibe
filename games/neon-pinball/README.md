# Neon Pinball

A single pinball table for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Pull back the plunger, launch the ball and keep it on the table with the flippers. Pop bumpers, slingshots and two banks of drop targets score points; roll through all three lanes at the top to raise the scoring multiplier (up to 5X, and the table plays a little faster with each step). Land the blinking top lane straight off the plunger for a skill shot; the power lamps beside the plunger lane show how far you have pulled. You get three balls, and each ball has a short ball save after launch. The best score is saved.

| Button | Action |
|---|---|
| L or D-pad LEFT | Left flipper |
| R or A | Right flipper |
| D-pad DOWN | Hold to pull the plunger, release to launch |
| START | Pause |
| B | Back to title (paused or game over) |
| A | Start / play again |

The flipper buttons also shift the lit top lanes left and right, as on a real table.

Code: `src/main.js` (states, scoring and the loop), `src/physics.js` (hand-written 2D ball physics with fixed sub-steps: capsule walls, round bumpers and posts, rotating flippers, plunger), `src/table.js` (the table layout as plain data, shared by physics and view), `src/view.js` (three.js scene: merged static walls, instanced bumpers, targets, lamps and glows), `src/floor.js` (the playfield artwork painted into one canvas texture), `src/hud.js`, `src/shared.js` (palette and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.

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
