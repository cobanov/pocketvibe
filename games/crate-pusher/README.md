# Crate Pusher

A box-pushing warehouse puzzle for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Walk a little worker around a toy warehouse and push every wooden crate onto a pink spot. He pushes one crate at a time and can never pull, so a crate shoved into a corner is lost (it blushes red, and B takes the move back). There are 30 original levels, from one-crate tutorials to five-crate brain-teasers, each with a par: the fewest moves that solve it, found by the solver in `tools/solve.mjs`. The first three levels are open and solving a level opens the next. The title screen's level grid keeps your best move count for every level and a star where it matches par. Undo is unlimited, quick taps are buffered and holding the D-pad keeps walking, so fast play feels smooth.

| Button | Action |
|---|---|
| D-pad | Walk; walk into a crate to push it (hold to keep going). On the title screen: choose a level |
| A | Play the chosen level; next level after a clear |
| B | Undo (unlimited, hold to rewind; right after a restart it brings the moves back). Level select from the pause or level-clear panel |
| X | Restart the level; replay it after a clear |
| L / R | Previous / next open level |
| START | Pause / resume |

Code: `src/main.js` (states, input buffering, undo, progress saving), `src/puzzle.js` (the rules, move history and stuck-crate detection), `src/levels.js` (the 30 maps and their pars), `src/world.js` (board, wall blocks and warehouse props merged into one mesh, pulsing spots), `src/crates.js` (crates, shadows and glows as InstancedMeshes), `src/worker.js` (walk cycle, push pose and celebration), `src/models.js` (low-poly geometry), `src/view.js` (camera that frames each level), `src/fx.js` (pooled particles), `src/hud.js`, `src/shared.js`; `tools/solve.mjs` (move-optimal A* solver that checks every level and its par: `node tools/solve.mjs`). `src/handheld.js` is the unchanged device layer from the template.
