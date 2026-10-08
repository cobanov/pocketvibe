# Brick Breaker

A breakout game for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Bounce the ball off your paddle and smash every brick on the table, seen from a slightly tilted camera. Where the ball hits the paddle sets its angle: the edges send it out wide. Coloured bricks break in one hit, steel bricks take two or three and lighten as they crack, gold bricks never break, and bomb bricks (dark cap, fizzing fuse) blow up every brick around them. Some bricks drop power-ups: **W** wide paddle, **M** multi-ball (up to three balls), **S** slow ball and **+** extra life. Breaking bricks in a row without touching the paddle builds a combo bonus, and each brick hit in a row plays a note higher up the scale. There are fourteen hand-made levels; after the last one they loop with a faster ball. You have three lives.

The title menu starts a game on any level you have already reached, and turns sound effects and music on or off; the pause menu has the same switches. The game keeps your best score and the furthest level you reached.

| Button | Action |
|---|---|
| D-pad left / right | Move the paddle (hold to speed up) |
| D-pad | Choose in menus (left / right change the start level and switches) |
| A | Launch the ball; select |
| START | Pause menu and resume |
| B | Resume from the pause menu; back to title after game over |

Code: `src/main.js` (states, menus, scoring, sounds and loop), `src/ball.js` (ball physics with sub-steps), `src/bricks.js` (brick grid and bomb blasts, one InstancedMesh), `src/levels.js` (level maps), `src/paddle.js`, `src/powerups.js`, `src/effects.js` (pooled debris), `src/world.js` (the table and scenery), `src/hud.js`. `src/handheld.js` is the unchanged device layer from the template, `src/sound.js` the shared PocketVibe sound module.

Sound: the effects in `public/sfx/` are synthesised by `tools/sfx/games/brick-breaker.py` in the PocketVibe repository (D minor, to sit with the music); `public/music/theme.ogg` is the music.

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
