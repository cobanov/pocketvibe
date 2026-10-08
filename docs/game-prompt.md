# Handheld three.js game

You are helping me build a three.js game that will run on a handheld game console. Follow every rule below, then build the game I describe in the last section.

The rules are not style preferences. Measured on the real handheld: typical three.js code (one mesh per object, MeshStandardMaterial, shadows, point lights, antialias) ran at 3 to 6 fps, while the same scenes written with these rules ran at a steady 60 fps.

## Target device

- Anbernic RG SP handheld running ROCKNIX (Linux).
- The game runs full screen in an embedded browser engine (WPE WebKit), not in a desktop browser.
- CPU: 4x ARM Cortex-A53 at 1.5 GHz (slow, in-order cores).
- GPU: Mali-G31 MP2 (entry level), WebGL 2.
- RAM: 1 GB in total. The browser engine itself uses most of it; keep the game's own textures, models and audio small (well under 150 MB).
- Screen: 3.4 inch, 720x480 pixels.
- Input: buttons only. D-pad, A, B, X, Y, L, R, Start, Select. No analog sticks, no touch, no mouse, no keyboard.

## Project setup

- Vite (vanilla JavaScript) with three.js installed from npm: `import * as THREE from 'three'`.
- No CDN and no network access at runtime; the game must work offline. No web fonts.
- `vite.config.js` sets `base: './'` so the build runs from any folder.
- The page is exactly 720x480: one 720x480 canvas plus an absolutely positioned HTML overlay of the same size for HUD and menus. In a desktop browser, center it on a dark background.

## Input

Write a small module `src/input.js` and read input only through it:

- Buttons: UP, DOWN, LEFT, RIGHT, A, B, X, Y, L, R, START, SELECT.
- API: `poll()` once per frame, `down(button)`, `pressed(button)` (only on the frame it was pressed), `released(button)`, and `dpad.x` / `dpad.y` (-1, 0 or 1, y is -1 for UP).
- Read both sources and merge them:
  - Gamepad API, standard mapping, as measured on the handheld: button 0 = B, 1 = A, 2 = X, 3 = Y, 4 = L, 5 = R, 8 = SELECT, 9 = START, 12 to 15 = UP, DOWN, LEFT, RIGHT. Also treat axes 0 and 1 beyond 0.5 as the d-pad.
  - Keyboard (for testing on a computer): arrows = d-pad, X = A, Z = B, S = X, A = Y, Q = L, W = R, Enter = START, Shift = SELECT.
- Conventions: A confirm or jump, B back or cancel, START pause menu.
- START + SELECT together quits to the console menu, so never use that combination.
- On-screen text names the handheld buttons ("Press A"), never mouse, click, touch or keyboard keys.

## Rendering rules

- `new THREE.WebGLRenderer({ antialias: false })`, `setPixelRatio(1)`, `setSize(720, 480)`. Never resize to the window.
- One game loop with `renderer.setAnimationLoop`. Move things with delta time in seconds; clamp it between 0 and 1/20. Render once per frame.
- Per-frame budget: at most 100 draw calls and 60,000 triangles. Add a small debug overlay (toggle with the P key) showing fps, `renderer.info.render.calls` and triangles, and turn it red when over budget.
- Materials: only MeshLambertMaterial, MeshBasicMaterial or MeshToonMaterial. Never MeshStandardMaterial or MeshPhysicalMaterial.
- Lights: one HemisphereLight or AmbientLight plus at most one DirectionalLight. No point lights or spot lights.
- No shadows (no shadowMap, castShadow or receiveShadow); fake them with a dark transparent circle under objects.
- No post-processing (EffectComposer, bloom, SSAO, outlines).
- Repeated objects (coins, trees, enemies, bullets, particles) use one InstancedMesh per kind.
- Merge static level geometry with BufferGeometryUtils.mergeGeometries. Create each geometry and material once and share it. Keep models low-poly.
- Textures at most 512x512, power-of-two sizes; NearestFilter for pixel art.
- Use fog and a short camera far distance so distant objects are not drawn.
- Avoid many overlapping transparent objects.

## Code rules

- No allocations inside the game loop: no `new THREE.Vector3()` or new meshes per frame. Reuse temporary objects and pool bullets, enemies and particles.
- Call dispose() on geometries, materials and textures that are removed for good.
- Update the HTML HUD only when a value changes. HUD text at least 18px, bold, with a dark outline or shadow.
- Save progress in localStorage as JSON.
- Keep the code in a few small ES modules under src/.

## Done when

- `npm run dev` runs the game and it is fully playable with the button mapping above.
- The debug overlay is never red during play.
- `npm run build` produces a dist/ folder that works offline.

## My game

Lane Runner, an endless runner on a three-lane road. The player runs forward on its own; D-pad left/right changes lane, A jumps, DOWN slides (and drops to the ground when in the air), START pauses. Three obstacle kinds: low hurdles (jump), bars at head height (slide), tall walls (change lane). Every row leaves at least one lane open. Coins in lines and arcs over hurdles. Speed rises over time. Score is distance plus 25 per coin; the best score is saved. Screens: title, play, pause (B back to title), game over (A run again). Implemented in `games/runner/`.
