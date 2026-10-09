# Neon Pinball

A single pinball table for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Pull back the plunger, launch the ball and keep it on the table with the flippers. Pop bumpers, slingshots, the spinner in the left lane and two banks of drop targets score points; roll through all three lanes at the top to raise the scoring multiplier (up to 5X, and the table plays a little faster with each step). Land the blinking top lane straight off the plunger for a skill shot; the power lamps beside the plunger lane show how far you have pulled. Clearing a target bank lights one of the two MULTIBALL lamps; with both lit the table kicks out a second ball: everything scores double while two balls are in play, and a cleared bank is a 25,000 jackpot. After each ball the bonus (targets, lanes, bumpers and spins) is counted up and multiplied. Hold a flipper up to cradle the ball. Nudge the table with UP to save a ball, but nudge too often and it tilts: the flippers go dead and the ball's bonus is lost. You get three balls, each ball has a short ball save after launch, and multiball starts with one too. The best score is saved.

The title menu starts a game and turns sound effects and music on or off; the pause menu (START) has the same switches and the way back to the title.

| Button | Action |
|---|---|
| L or D-pad LEFT | Left flipper |
| R or A | Right flipper |
| D-pad DOWN | Hold to pull the plunger, release to launch |
| D-pad UP | Nudge the table |
| START | Pause menu (Resume, Sound, Music, Quit to title) / resume |
| B | Resume (pause menu), back to title (game over) |
| D-pad, A | Choose and select in menus; A also plays again |

The flipper buttons also shift the lit top lanes left and right, as on a real table.

Code: `src/main.js` (states, menus, scoring, sounds and the loop), `src/physics.js` (hand-written 2D ball physics with fixed sub-steps for up to two balls: capsule walls, round bumpers and posts, rotating flippers, the spinner, plunger and nudge), `src/table.js` (the table layout as plain data, shared by physics and view), `src/view.js` (three.js scene: merged static walls, instanced bumpers, targets, lamps and glows), `src/floor.js` (the playfield artwork painted into one canvas texture), `src/hud.js`, `src/shared.js` (palette and geometry helpers). `src/handheld.js` is the unchanged device layer from the template, `src/sound.js` the shared PocketVibe sound module.

Sound: the effects in `public/sfx/` are synthesised by `tools/sfx/games/neon-pinball.py` in the PocketVibe repository (E minor, to sit with the music); `public/music/theme.ogg` is the music.

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
