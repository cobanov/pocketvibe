# Handheld game rules

This project is a three.js game for a handheld game console (Anbernic RG SP, running ROCKNIX). The game runs full screen in an embedded browser engine (WPE WebKit) on low-end hardware: 4× Cortex-A53 CPU, Mali-G31 MP2 GPU, 1 GB RAM (the browser engine uses most of it, so keep the game's own assets well under 150 MB), 720×480 screen. There is no mouse, no touch screen and no keyboard; only the buttons below.

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
- The screen is always 720×480 (`hh.width`, `hh.height`). Never resize the renderer to the window, never call `setPixelRatio`, never enable antialias, never listen to `resize`.
- All game logic goes inside `hh.run`. Move things with `dt`, never per frame. Render once per frame.
- Do not use `requestAnimationFrame`, `setInterval` or `setTimeout` for the game loop.

## Input

- Read buttons only through `input`. Buttons: `UP`, `DOWN`, `LEFT`, `RIGHT`, `A`, `B`, `X`, `Y`, `L`, `R`, `START`, `SELECT`.
  - `input.down('A')`: held right now.
  - `input.pressed('A')`: pressed this frame (use for jump, confirm, menu).
  - `input.released('A')`: released this frame.
  - `input.dpad.x`, `input.dpad.y`: -1, 0 or 1 (`y` is -1 for UP).
- Never use mouse, pointer, touch or keyboard events, and never show "click" or "press Space" in text. Refer to the button names above.
- Conventions: `A` confirm or jump, `B` back or cancel, `START` pause menu. `START` + `SELECT` together quits to the console menu, so never use that combination in the game.

## UI

- Put HUD, menus and text in the `hud` element as HTML and CSS. Its coordinate space is the 720×480 screen, so use `px`.
- Text must be readable on a 3.4" screen: at least 18px, bold, with a dark outline or shadow.
- Update the DOM only when a value changes, never every frame.

## Graphics budget

The perf overlay (top right, toggle with `P` in the browser) shows fps, draw calls and triangles. It turns red when the game is over budget. Stay under it at all times:

- Draw calls per frame: 100 or fewer.
- Triangles per frame: 60,000 or fewer.

How to stay under it:

- Materials: use `MeshLambertMaterial`, `MeshBasicMaterial` or `MeshToonMaterial`. Never use `MeshStandardMaterial` or `MeshPhysicalMaterial`.
- Lights: one `HemisphereLight` or `AmbientLight` plus at most one `DirectionalLight`. No point lights or spot lights.
- No shadows: never enable `renderer.shadowMap`, `castShadow` or `receiveShadow`. Fake shadows with a dark transparent circle under objects if needed.
- No post-processing (`EffectComposer`, bloom, SSAO, outlines).
- Repeated objects (coins, trees, enemies, bullets, particles) use one `InstancedMesh` per kind.
- Merge static level geometry with `BufferGeometryUtils.mergeGeometries` from `three/addons/utils/BufferGeometryUtils.js`.
- Create each geometry and material once and share it. Keep models low-poly.
- Textures: small (256×256, at most 512×512), power-of-two sizes. For pixel art set `magFilter` and `minFilter` to `THREE.NearestFilter`.
- Use `scene.fog` and a short camera `far` distance so distant objects are not drawn.
- Avoid many overlapping transparent objects; they are expensive on this GPU.

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

Add a `cover.png` (480×270) at the project root; a screenshot of the title screen works well.

## Before you finish

Run `npm run dev`, play the game with the keyboard, and check that:

1. The perf overlay is not red anywhere in the game.
2. Every action works with the buttons above and every on-screen hint names those buttons.
3. Nothing is created per frame inside `hh.run`.
