# Handheld game rules

This project is a three.js game for a handheld game console (Anbernic RG34XX SP, running ROCKNIX). The game runs full screen in an embedded browser engine (WPE WebKit) on low-end hardware: 4× Cortex-A53 CPU, Mali-G31 MP2 GPU, 1 GB RAM (the browser engine uses most of it, so keep the game's own assets well under 150 MB), 720×480 screen. PocketVibe also runs on handhelds with other screen shapes (see Screen shapes). There is no mouse, no touch screen and no keyboard; only the buttons below.

Follow these rules whenever you write or change code here. They are what keeps the game smooth on the device. Measured on the real handheld: typical three.js code (one mesh per object, `MeshStandardMaterial`, shadows, point lights, antialias) ran at 3 to 6 fps, while the same scenes written with these rules ran at a steady 60 fps.

## Structure

- `src/handheld.js` is the device layer. Do not rewrite it; use what it exports.
- `src/main.js` is the game. Split it into more files under `src/` as it grows.
- Assets (textures, sounds, models) go in `public/` and are loaded with relative paths, e.g. `'./textures/grass.png'`.

## Screen and loop

- Create everything through `createHandheld()`:
  ```js
  import { createHandheld } from './handheld.js';
  const hh = createHandheld({ clearColor: 0x000000 });
  const { renderer, input, hud } = hh;
  hh.run((dt) => {
    // update game state using dt (seconds)
    renderer.render(scene, camera);
  });
  ```
- Never resize the renderer to the window, never call `setPixelRatio`, never enable antialias, never listen to `resize`. To draw the 3D scene at half resolution, pass `resolution: 0.5` to `createHandheld` (see the graphics budget).
- All game logic goes inside `hh.run`. Move things with `dt`, never per frame. Render once per frame.
- Do not use `requestAnimationFrame`, `setInterval` or `setTimeout` for the game loop.

## Screen shapes

The game is designed for a 720×480 screen (3:2, the RG34XX SP), but PocketVibe also runs on 4:3 handhelds (720×540), 16:9 ones (854×480) and square ones (720×720). The game gets the screen's shape, at least 720×480: `hh.width` and `hh.height` are its size, `hh.aspect` its shape. Make every part of the game work on all four:

- Set up each camera with `hh.fitCamera(camera)` after creating it (and again if its designed view changes). Give the view as designed for 720×480 (`fov` for a perspective camera, `height` for an orthographic one); wider screens then show more at the sides and taller ones more above and below, and the designed view always stays whole. For a board or a playfield that must fill the screen, pass `minAspect` (its own width / height) so taller screens zoom in on it.
- Never write `720`, `480` or `1.5` in the game. Use `hh.width`, `hh.height` and `hh.aspect`.
- Lay out the HUD with CSS that adapts: anchor things to edges (`left`, `right`, `top`, `bottom`) and center with `left: 50%; transform: translateX(-50%)` or flexbox, never at fixed coordinates computed for 720×480. The HUD's coordinate space is `hh.width` × `hh.height`.
- Gameplay must not depend on the shape: a wider screen may show more of the level, but must not let the player see or reach what a 3:2 screen hides in a way that changes the game.
- Try every shape in the browser with the links under the screen (or `?aspect=4:3`, `16:9`, `1:1`). When the game works on all four, set `"responsive": true` in `pocketvibe.json`; without it, PocketVibe shows the game at 720×480 with black bars on other screens.

## Input

- Read buttons only through `input`. Buttons: `UP`, `DOWN`, `LEFT`, `RIGHT`, `A`, `B`, `X`, `Y`, `L`, `R`, `START`, `SELECT`.
  - `input.down('A')`: held right now.
  - `input.pressed('A')`: pressed this frame (use for jump, confirm, menu).
  - `input.released('A')`: released this frame.
  - `input.dpad.x`, `input.dpad.y`: -1, 0 or 1 (`y` is -1 for UP).
- Never use mouse, pointer, touch or keyboard events, and never show "click" or "press Space" in text. Refer to the button names above.
- Conventions: `A` confirm or jump, `B` back or cancel, `START` pause menu. Holding `START` + `SELECT` together leaves the game for the PocketVibe launcher, so never use that combination in the game, and do not add a quit option: the system handles it.

## UI

- Put HUD, menus and text in the `hud` element as HTML and CSS. Its coordinate space is the game's screen (`hh.width` × `hh.height`, 720×480 on the RG34XX SP), so use `px`, anchored to the edges (see Screen shapes).
- Text must be readable on a 3.4" screen: at least 18px, bold, with a dark outline or shadow.
- Update the DOM only when a value changes, never every frame. Ten elements changing in one frame is fine; fifty drop the game to 30 fps.
- Static panels, bars, dimmed backgrounds and CSS animations over the game cost nothing. Never use `backdrop-filter` (blur dropped the game to 40 fps).
- Never draw the HUD on a canvas and upload it as a texture: redrawing even a 256×256 canvas texture every frame dropped the game to 24 fps.

## Graphics budget

Measured on the handheld (`bench/results/2026-10-08-limits.md` in the PocketVibe repository; explained for people in https://github.com/cobanov/pocketvibe/blob/main/docs/performance.md). The game has 16.7 ms per frame for 60 fps. The perf overlay (top right, toggle with `P` in the browser) shows fps, draw calls and triangles, and turns red when the game is over budget or below 55 fps. Stay under it at all times:

- **Triangles on screen: 10,000 or fewer.** This is the hardest limit: about 1 ms per 1,000 visible triangles (15k: 48 fps, 20k: 39 fps, 30k: 28 fps). Triangles outside the view cost almost nothing, so use `scene.fog` with a short camera `far`, and low-poly models (a few hundred triangles for a character, tens for props).
- **Draw calls: 100 or fewer.** Each costs 30 to 70 µs of CPU.
- **Large meshes must not be indexed.** WebKit spends about 0.6 µs per triangle every frame on an indexed mesh (a 20,000-triangle level costs 13 ms). After `mergeGeometries` (from `three/addons/utils/BufferGeometryUtils.js`), call `.toNonIndexed()` on the result. This applies to any geometry over about 2,000 triangles, instanced or not; smaller ones are fine indexed.

How to stay under it:

- Materials: use `MeshLambertMaterial`, `MeshBasicMaterial` or `MeshToonMaterial`. `MeshPhongMaterial` costs about 10%; never use `MeshStandardMaterial` (37 fps on a simple scene) or `MeshPhysicalMaterial`.
- Lights: one `HemisphereLight` or `AmbientLight` plus at most one `DirectionalLight`. Avoid point lights; one costs about 3 ms, four drop the game to 37 fps. No spot lights.
- No shadows: never enable `renderer.shadowMap`, `castShadow` or `receiveShadow`; even the cheapest shadow map drops a simple scene to 36 fps. Fake shadows with a dark transparent circle under objects.
- No post-processing (`EffectComposer`, bloom, FXAA, SSAO, outlines). Bloom alone costs 20 fps.
- Repeated objects (coins, trees, enemies, bullets) use one `InstancedMesh` per kind. Rewriting up to about 5,000 instance matrices per frame is fine.
- Merge static level geometry into one mesh per material, then `.toNonIndexed()` (see above).
- Create each geometry and material once and share it.
- Particles: `THREE.Points` with up to about 1,000 small points or 250 large soft ones. Never `THREE.Sprite` for many objects; each sprite is a draw call.
- Transparency: at most one transparent layer covering the whole screen (each costs about 3 ms); keep transparent objects small.
- Textures: PNG files, 256×256 to 512×512, at most 1024×1024, power-of-two sizes. For pixel art set `magFilter` and `minFilter` to `THREE.NearestFilter`.
- Custom shaders: keep fragment shaders that cover the screen to a few operations; a loop of a dozen `sin`/`cos` per pixel already drops the game to 35 fps.
- 2D games: use three.js too (an `OrthographicCamera`, with `InstancedMesh` or `Points` for sprites). A 2D canvas is far slower here: 250 `drawImage` sprites per frame drop it to 25 fps.
- Game code: keep your own JavaScript under about 8 ms per frame (the device's CPU is roughly ten times slower than a laptop's).
- If a scene still does not fit, draw it at half resolution: `createHandheld({ clearColor, resolution: 0.5 })`. A scene with 20,000 visible triangles went from 27 to 60 fps. The HUD stays sharp.

## Loading

The first use of anything new costs a long frame, so do it all while the game loads, never during play:

- Shaders compile when a material is first drawn: 40 ms for Basic, 90 ms for Lambert, up to 300 ms with shadows. While loading, put one of every kind of object the game will show (enemies, bullets, effects, pickups) in the scene, call `renderer.compile(scene, camera)` once, then hide or pool them.
- Textures upload when first used: about 30 ms for a 512×512 PNG, 100 ms for 1024×1024. Call `renderer.initTexture(texture)` for each texture while loading.
- Create geometries while loading too; a 50,000-triangle geometry takes 130 ms to upload.

## Memory

- Do not create objects inside `hh.run`: no `new THREE.Vector3()`, no new meshes, materials or arrays per frame. Create temporary vectors once at the top of the file and reuse them.
- Reuse objects with pools (bullets, enemies, particles) instead of creating and removing them.
- When something is removed for good, call `dispose()` on its geometry, material and textures.

## Saving and offline

- Save progress with `hh.save('key', value)` and load it with `hh.load('key', fallback)`.
- The game must work offline: import `three` from npm (`import * as THREE from 'three'`), never from a CDN, and do not load fonts, scripts or data from the internet.

## Store listing

`pocketvibe.json` at the project root is the game's entry in the PocketVibe store. When you start a new game, fill it in:

- `id`: unique, lowercase letters, digits and dashes (e.g. `star-defender`).
- `title`, `author`, `version` (start at `1.0.0`), `description` (one or two sentences).
- `genre`: one of `Arcade`, `Shooter`, `Racing`, `Puzzle`, `Platformer`, `Sports`. The store groups games by it.
- `controls`: what each button does, e.g. `{ "D-pad": "Move", "A": "Jump", "START": "Pause" }`.
- `responsive`: `true` once the game works on every screen shape (see Screen shapes).

Add a `cover.png` (480×270) at the project root; a screenshot of the title screen works well.

## Before you finish

Run `npm run dev`, play the game with the keyboard, and check that:

1. The perf overlay is not red anywhere in the game.
2. The game looks right and plays the same on every screen shape (the links under the screen).
3. Every action works with the buttons above and every on-screen hint names those buttons.
4. Nothing is created per frame inside `hh.run`, and nothing new is compiled or uploaded during play (see Loading).
