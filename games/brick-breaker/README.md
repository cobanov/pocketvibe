# Brick Breaker

A breakout game for handheld consoles running ROCKNIX (first target: Anbernic RG SP), built on the PocketVibe template.

Bounce the ball off your paddle and smash every brick on the table, seen from a slightly tilted camera. Where the ball hits the paddle sets its angle: the edges send it out wide. Coloured bricks break in one hit, steel bricks take two or three and lighten as they crack, gold bricks never break. Some bricks drop power-ups: **W** wide paddle, **M** multi-ball (up to three balls), **S** slow ball and **+** extra life. Breaking bricks in a row without touching the paddle builds a combo bonus. There are seven hand-made levels; after the last one they loop with a faster ball. You have three lives.

| Button | Action |
|---|---|
| D-pad left / right | Move the paddle (hold to speed up) |
| A | Launch the ball; start / play again |
| START | Pause and resume |
| B | Back to title (paused or game over) |

Code: `src/main.js` (states, scoring and loop), `src/ball.js` (ball physics with sub-steps), `src/bricks.js` (brick grid, one InstancedMesh), `src/levels.js` (level maps), `src/paddle.js`, `src/powerups.js`, `src/effects.js` (pooled debris), `src/world.js` (the table and scenery), `src/hud.js`. `src/handheld.js` is the unchanged device layer from the template.

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
