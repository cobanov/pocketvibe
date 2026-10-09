# Crate Pusher

A box-pushing warehouse puzzle for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Walk a little worker around a toy warehouse and push every wooden crate onto a pink spot. He pushes one crate at a time and can never pull, so a crate shoved into a corner is lost (it blushes red, and B takes the move back). There are 45 original levels, from one-crate tutorials to five-crate brain-teasers, each with a par: the fewest moves that solve it, found by the solver in `tools/solve.mjs`. The first three levels are open and solving a level opens the next. The title screen's level grid keeps your best move count for every level and a star where it matches par; it scrolls through the rows, and its last tile opens the Options. Undo is unlimited (pushes too), quick taps are buffered and holding the D-pad keeps walking, so fast play feels smooth.

Sound effects for every step, scrape, bump and crate on its spot (the chime climbs the scale as the spots fill), undo and restart, a cosy electric piano theme, and Sound and Music switches in the pause menu and under Options on the title.

| Button | Action |
|---|---|
| D-pad | Walk; walk into a crate to push it (hold to keep going). On the title screen and in menus: choose |
| A | Play the chosen level (or open the Options); next level after a clear; select in menus |
| B | Undo (unlimited, hold to rewind; right after a restart it brings the moves back). Resume from the pause menu; level select from the level-clear panel |
| X | Restart the level; replay it after a clear |
| L / R | Previous / next open level |
| START | Pause menu (Resume, Sound, Music, Level select) |

Code: `src/main.js` (states, menus, input buffering, undo, progress saving, sounds), `src/puzzle.js` (the rules, move history and stuck-crate detection), `src/levels.js` (the 45 maps and their pars; each level keeps a fixed id for its save slot, so levels can be added anywhere in the list), `src/world.js` (board, wall blocks and warehouse props merged into one mesh without the faces and props the camera can never see, pulsing spots), `src/crates.js` (crates, shadows and glows as InstancedMeshes), `src/worker.js` (walk cycle, push pose and celebration), `src/models.js` (low-poly geometry), `src/view.js` (camera that frames each level), `src/fx.js` (pooled particles), `src/hud.js`, `src/shared.js`, `src/sound.js` (the shared PocketVibe sound module); `tools/solve.mjs` (move-optimal A* solver that checks every level and its par: `node tools/solve.mjs`). The effects are made by `tools/sfx/games/crate-pusher.py`. `src/handheld.js` is the unchanged device layer from the template.
