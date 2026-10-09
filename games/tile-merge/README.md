# Tile Merge

A sliding number puzzle for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Chunky 3D number tiles sit in a tray on a little round table. Every press of the D-pad slides all of them as far as they go; two equal tiles that meet merge into one with their sum (a tile merges at most once per move, and in a row of three equal tiles the two nearest the wall merge), and after every move that changed the board a new 2 (sometimes a 4) appears. Each merge scores the value of the new tile. Make the goal tile to win, then keep going for bigger tiles until the board is full and no slide is possible. The board fills faster as the tiles grow, so keeping the big ones together in a corner matters more and more.

Three boards, picked on the title screen, each with its own best score, biggest tile and saved game:

- **4×4**, the classic: make 2048.
- **3×3**, tight: make 256 (nine cells barely hold a 512).
- **5×5**, roomy: make 4096.

X takes back the last move (one step; a goal tile taken back can be made again), a move pressed while the tiles are still sliding waits its turn (up to three, played at double speed), and the game is saved after every move, so it can be continued from the title screen. Starting a new game over a saved one asks first. While playing, the left side shows the score, the best (it glows once the game beats the best that stood when it began) and the goal tile, then after the goal the next doubling.

The title menu has Continue (with a saved game), New game, the board and Options (Sound and Music on or off); START also pauses the game with the same toggles. Sound effects and music: tiles swish across the tray, merges ring a kalimba note that climbs A-flat major with the merged value, new tiles pop, and the big tiles on the way to the goal, the goal itself, a new best and the end of a game each have their own jingle over calm piano and kalimba music.

| Button | Action |
|---|---|
| D-pad | Slide the tiles / choose in menus (LEFT / RIGHT change the board) |
| X | Undo the last move |
| A | Select / keep going / play again |
| B | Back / resume / title after the goal or game over |
| START | Pause menu / resume |

Code: `src/main.js` (states, menus, saving, sounds, effects and camera), `src/game.js` (rules for every board size: sliding, merging, spawning, undo, the title screen's self-playing demo), `src/tiles.js` (tile bodies and number labels as two InstancedMeshes, the number atlas, slide, pop and spawn animations), `src/table.js` (a tray for each board size, table and room as merged meshes), `src/fx.js` (particles and the merge ring), `src/hud.js`, `src/shared.js` (board sizes, tile colours and geometry helpers), `src/sound.js` (the shared PocketVibe sound module). The effects are made by `tools/sfx/games/tile-merge.py`. `src/handheld.js` is the unchanged device layer from the template.
