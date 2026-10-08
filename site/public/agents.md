# Make a PocketVibe game: a brief for AI coding agents

You are helping someone make a game for PocketVibe. Read this whole brief before you write
any code; it is short, and the numbers in it decide whether the game runs well.

PocketVibe is a launcher and game store for handheld game consoles: Linux handhelds running
ROCKNIX (such as the Anbernic RG34XX SP) and Android handhelds (such as the Anbernic RG Rotate).
A PocketVibe game is a web page made with three.js and Vite. It runs full screen in the
handheld's browser engine and is played with the handheld's buttons: there is no mouse, no
touch screen and no keyboard.

Website: https://pocketvibe.cobanov.dev · Source: https://github.com/cobanov/pocketvibe

## 1. Start from the starter project

You need Node.js 22 or newer.

```sh
npm create pocketvibe@latest my-game
cd my-game
npm install
npm run dev
```

The project already has everything the handheld needs. Use it; do not start from scratch.

- `src/handheld.js` is the device layer: the screen, the buttons, the game loop, saving and a
  performance overlay. Do not rewrite it; use what it exports.
- `src/main.js` is a small example game. Replace it with the game you are asked for, and split
  the game into more files under `src/` as it grows.
- `AGENTS.md` (also read through `CLAUDE.md`) holds the full rules for the code, with examples.
  Read it now, and follow it for every change. This brief is the summary.
- `pocketvibe.json` is the game's listing in the store, and `cover.png` its picture.

`npm run dev` shows the game at the handheld's size in the browser, with the keyboard standing
in for the buttons: arrows for the d-pad, X for A, Z for B, S for X, A for Y, Q and W for L and
R, Enter for Start, Shift for Select. **P** shows the performance overlay.

## 2. The handheld, and what it can draw

Write for the weakest handheld PocketVibe runs on: an Allwinner H700 with four Cortex-A53 cores,
a Mali-G31 MP2 GPU and 1 GB of memory shared with the system, behind a 720×480 screen. Code that
is instant on a laptop can run at 5 fps here. The game has 16.7 ms per frame for 60 fps.

These limits were measured on an Anbernic RG34XX SP running PocketVibe, raising one cost at a
time until the frame rate fell:

| What | For 60 fps | Past it |
|---|---|---|
| Triangles inside the camera's view | 10,000 | 15,000: 48 fps; 20,000: 39 fps; 30,000: 28 fps |
| Draw calls | 100 | about 30 µs each |
| Materials | Lambert, Basic, Toon | Phong 54 fps; Standard 37 fps; Physical 29 fps |
| Lights | 1 hemisphere or ambient + 1 directional | each point light about 3 ms; 4 of them: 37 fps |
| Shadows | none | the cheapest shadow map: 36 fps |
| Transparent layers covering the screen | 1 | 2: 52 fps; 4: 41 fps |
| Particles | 1,000 small or 250 large `Points` | 5,000 small: 39 fps |
| Post-processing | none | FXAA 45 fps; bloom 40 fps |
| Your own JavaScript | 8 ms per frame | the CPU is about ten times slower than a laptop's |
| Memory for the game's assets | 150 MB | the system struggles past about 300 MB |

The first use of anything costs a long frame, so it must happen while the game loads:

| First use of | Costs |
|---|---|
| A material (shader compile) | 40 ms (Basic) to 120 ms (Standard); 300 ms with shadows |
| A 512×512 / 1024×1024 PNG texture | 30 ms / 100 ms |
| A 50,000-triangle geometry | 130 ms |

How to stay inside the budget:

- Triangles outside the view cost almost nothing: keep the camera's `far` short and hide the
  cut with `scene.fog`. Use low-poly models: a few hundred triangles for a character, tens for
  a prop.
- Draw repeated things (coins, trees, enemies, bullets) with one `InstancedMesh` per kind.
- Merge static scenery into one mesh per material with `mergeGeometries`, then call
  `.toNonIndexed()` on it: this browser engine spends about 0.6 µs per triangle every frame on
  a large indexed mesh. Do the same for any geometry over about 2,000 triangles.
- Create each geometry and material once and share it. Pool objects instead of creating and
  removing them during play.
- While loading, put one of every kind of object into the scene, call
  `renderer.compile(scene, camera)` and `renderer.initTexture(texture)` for every texture, and
  render one frame. Then hide or pool them.
- Put the HUD, menus and text in the `hud` element as HTML, and update an element only when
  its value changes. Never use `backdrop-filter`, and never draw the HUD on a canvas texture.
- Make 2D games with three.js too (an `OrthographicCamera`, sprites as an `InstancedMesh` of
  quads or as `Points`): a plain 2D canvas is slow in this engine.
- If a scene still does not fit, draw it at half resolution:
  `createHandheld({ clearColor, resolution: 0.5 })`. 20,000 visible triangles went from 27 to
  60 fps. The HUD stays sharp.

## 3. Screen, buttons and saves

- **Screen.** Designed for 720×480, but PocketVibe also runs on 4:3, 16:9 and square screens.
  Never write `720`, `480` or `1.5` in the game: use `hh.width`, `hh.height` and `hh.aspect`,
  set up every camera with `hh.fitCamera(camera)`, and anchor the HUD to the screen's edges.
  Try every shape with the links under the screen in the browser; when all of them work, set
  `"responsive": true` in `pocketvibe.json`.
- **Two screens.** A game may use the second screen of a two-screen handheld (the Anbernic
  RG DS) for a map or a menu: `hh.second`, and `"screens": 2` in `pocketvibe.json`. The game
  must stay complete without it. This is optional.
- **Buttons.** Read them only through `input`: `UP`, `DOWN`, `LEFT`, `RIGHT`, `A`, `B`, `X`,
  `Y`, `L`, `R`, `START`, `SELECT`, with `input.down()`, `input.pressed()`,
  `input.released()` and `input.dpad`. `A` confirms or jumps, `B` goes back, `START` pauses.
  Holding `START` and `SELECT` together leaves the game; never use that combination, and do
  not add a quit option. On-screen hints name these buttons, never keys, clicks or taps.
- **Text** at least 18 px, bold, with a dark outline or shadow: the screen is 3.4 inches.
- **Saves.** `hh.save('key', value)` and `hh.load('key', fallback)`.
- **Offline.** The game must work with no internet: import `three` from npm, and never load
  scripts, fonts or data from the web.

## 4. Check it

Before you call the game done, run `npm run dev` and check, in the busiest moment of the game:

1. The performance overlay (**P**) is not red: under 10,000 triangles and 100 draw calls.
2. It looks right and plays the same on every screen shape.
3. Everything works with the buttons, and every hint names them.
4. Nothing new is created, compiled or uploaded during play, and nothing is created inside
   `hh.run` every frame.

The desktop's frame rate says nothing about the handheld's. Play it on a handheld when you can.

## 5. Play it on your own handheld

Tell the person to run this in the game's folder, with the handheld on the same network:

```sh
npx pocketvibe serve
```

It builds the game and prints an address such as `http://192.168.1.20:8740`. On the handheld,
in PocketVibe: **Settings > Stores > Add a store**, type that address, then open the **Store**
tab: the game is there as "(dev)", and **A** downloads it. Every change is built again, and the
Store then offers it as an update. Turning on **Settings > Show FPS in games** shows the
performance overlay on the handheld. This works on ROCKNIX and Android handhelds alike.

## 6. Send it to the PocketVibe store

1. Fill in `pocketvibe.json`: a unique `id` (lowercase letters, digits and dashes), `title`,
   `author`, `version` (start at `1.0.0`), a one or two sentence `description`, a `genre`
   (`Arcade`, `Shooter`, `Racing`, `Puzzle`, `Platformer` or `Sports`) and `controls` (what each
   button does, e.g. `{ "D-pad": "Move", "A": "Jump", "START": "Pause" }`).
2. Make `cover.png`, 480×270: a screenshot of the title screen works well.
3. Sign in to GitHub once with the GitHub CLI (`gh auth login`), or set `GITHUB_TOKEN`.
4. Run `npx pocketvibe publish`. It builds the game and uploads it for review.
   `npx pocketvibe status` shows where it is: waiting for review, published or turned down,
   with the reason.

Once it is approved, the game is in the store on every PocketVibe handheld. For a new version,
raise `version` and publish again; it is reviewed too.

## 7. What review checks

- It is a finished game, not a test or a demo: a title screen, a goal, a way to lose or win, and
  a way to play again.
- It plays smoothly on the handheld: steady near 60 fps in the busiest moment.
- Everything works with the buttons alone, and the hints name them.
- It works offline and loads nothing from the internet.
- Its listing is complete, with a cover that shows the game.
- It is suitable for everyone, and the person has the right to use every image, sound and model
  in it.
- The zip is under 50 MB (200 MB unpacked).

## Working with the person

- If the idea is vague, ask a few short questions, then build the smallest version that is fun
  to play. Polish after it works on the handheld.
- Keep the game inside the budget from the first scene, not at the end: it is far easier than
  slimming a slow game down.
- When you finish a step, tell the person how to try it: `npm run dev` in the browser, or
  `npx pocketvibe serve` on their handheld.
