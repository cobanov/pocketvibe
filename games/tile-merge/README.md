# Tile Merge

A sliding number puzzle for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Chunky 3D number tiles sit in a 4×4 tray on a little round table. Every press of the D-pad slides all of them as far as they go; two equal tiles that meet merge into one with their sum (a tile merges at most once per move), and after every move that changed the board a new 2 (sometimes a 4) appears. Each merge scores the value of the new tile. Make a 2048 to win, then keep going for bigger tiles until the board is full and no slide is possible. The board fills faster as the tiles grow, so keeping the big ones together in a corner matters more and more. X takes back the last move (one step), a move pressed while the tiles are still sliding is queued, and the game is saved after every move, so it can be continued from the title screen.

| Button | Action |
|---|---|
| D-pad | Slide the tiles |
| X | Undo the last move |
| A | Start / continue / keep going / play again |
| Y | New game (title screen) |
| START | Pause / resume |
| B | Back to title (paused, 2048 or game over) |

Code: `src/main.js` (states, saving, effects and camera), `src/game.js` (rules: sliding, merging, spawning, undo, the title screen's self-playing demo), `src/tiles.js` (tile bodies and number labels as two InstancedMeshes, the number atlas, slide, pop and spawn animations), `src/table.js` (board, table and room as two merged meshes), `src/fx.js` (particles and the merge ring), `src/hud.js`, `src/shared.js` (board constants, tile colours and geometry helpers). `src/handheld.js` is the unchanged device layer from the template.
