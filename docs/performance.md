# Making games that run well

A PocketVibe game runs in a browser engine on a small handheld: four slow ARM cores, an
entry-level Mali-G31 GPU and 1 GB of memory shared with the system. Code that is instant on a
laptop can run at 5 fps there. This guide gives the handheld's measured limits and the ways to
stay inside them. Your AI tool already follows the short version in `AGENTS.md`; this is the
long one, for you.

Every number here was measured on an Anbernic RG34XX SP running PocketVibe, by raising one cost
at a time until the frame rate fell
([full results](../bench/results/2026-10-08-limits.md)). The game has 16.7 ms per frame for 60 fps.

## The budget

| What | For 60 fps | What happens past it |
|---|---|---|
| Triangles inside the view | 10,000 | 15,000: 48 fps, 20,000: 39 fps, 30,000: 28 fps |
| Draw calls | 100 | about 30 µs each; 300 is the limit with nothing else going on |
| Point lights | none, at most 1 | each costs about 3 ms; 4 lights: 37 fps |
| Shadows | none | the cheapest shadow map: 36 fps |
| Materials | Lambert, Basic, Toon | Phong 54 fps, Standard 37 fps, Physical 29 fps |
| Transparent layers covering the screen | 1 | 2: 52 fps, 4: 41 fps |
| Particles | 1,000 small or 250 large | 5,000 small: 39 fps |
| Post-processing | none | FXAA 45 fps, bloom 40 fps |
| Your own JavaScript | 8 ms per frame | the CPU is roughly ten times slower than a laptop's |
| Memory for the game | 150 MB | the system starts to struggle past about 300 MB |

The triangle limit is the one games hit first, and it is lower than most people expect. It
counts only triangles inside the camera's view: triangles behind the camera, outside its sides
or past its far plane cost almost nothing (100,000 extra off-screen triangles still ran at
60 fps).

These limits come from the current version of PocketVibe's engine. A newer graphics driver draws
geometry many times faster, and the triangle limit should rise a lot when PocketVibe moves to it.

## Draw less

**Keep the view small.** A short camera `far` and fog to hide the cut are the cheapest way to
draw fewer triangles:

```js
scene.fog = new THREE.Fog(skyColor, 30, 70);
const camera = new THREE.PerspectiveCamera(60, 720 / 480, 0.1, 75);
```

**Use low-poly models.** A few hundred triangles for a character, tens for a prop. A sphere
with the default segments is 960 triangles; `new THREE.IcosahedronGeometry(1, 1)` is 80 and
looks fine at this size.

**Draw repeated things in one call.** Coins, trees, enemies and bullets each become one
`InstancedMesh`:

```js
const coins = new THREE.InstancedMesh(coinGeometry, coinMaterial, 200);
const m = new THREE.Matrix4();
for (let i = 0; i < 200; i++) {
  coins.setMatrixAt(i, m.makeTranslation(x[i], 1, z[i]));
}
coins.instanceMatrix.needsUpdate = true; // after changing matrices
```

Rewriting a few thousand instance matrices every frame is fine.

**Merge the level, then un-index it.** Static scenery merged into one mesh per material is one
draw call. But in this browser engine, a large *indexed* mesh costs CPU time every frame,
about 0.6 µs per triangle (a 20,000-triangle level: 13 ms). `toNonIndexed()` removes that cost:

```js
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const level = mergeGeometries(pieces).toNonIndexed();
```

Do this for any geometry over about 2,000 triangles, instanced or not.

## Shade cheaply

- `MeshLambertMaterial` for lit surfaces, `MeshBasicMaterial` for unlit ones, `MeshToonMaterial` for a cartoon look.
- Light with one `HemisphereLight` and one `DirectionalLight`. Fake glows with an unlit, additive sprite instead of a point light.
- No real-time shadows. A dark, transparent circle under a character reads as a shadow.
- Small textures: 256×256 to 512×512 PNGs, never more than 1024×1024.

## Be careful with transparency and effects

Every transparent pixel is drawn again on top of what is behind it. One full-screen fade or
tint is fine; stacking them is not. For sparks, smoke and stars use `THREE.Points` (one draw
call for thousands of points) rather than many `THREE.Sprite` objects (one draw call each).
Skip `EffectComposer`: bloom, FXAA and outlines each cost 15 to 20 fps. A custom shader that
covers the screen must stay tiny; a loop of a dozen `sin` calls per pixel already halves the
frame rate.

## Keep the HUD in HTML

Score, lives and menus belong in the `hud` element as HTML. Static panels, dimmed backgrounds
and CSS animations over the game cost nothing. Two things do cost:

- Changing text every frame. Update an element only when its value changes; even then, a few
  elements per frame is the limit (50 changing elements: 31 fps).
- `backdrop-filter: blur(...)`: 40 fps.

Never draw the HUD on a canvas and use it as a texture: redrawing even a 256×256 canvas texture
every frame drops the game to 24 fps.

## Make 2D games with three.js too

A plain 2D canvas is slow in this engine: 250 sprites drawn with `drawImage` run at 25 fps.
Use three.js with an `OrthographicCamera` and draw sprites with an `InstancedMesh` of quads or
with `THREE.Points`.

## Load everything before play

The first time something is drawn, the engine prepares it, and that frame takes long:

| First use of | Costs |
|---|---|
| A new material (shader compile) | 40 ms (Basic) to 120 ms (Standard), 300 ms with shadows |
| A 512×512 / 1024×1024 PNG texture | 30 ms / 100 ms |
| A 50,000-triangle geometry | 130 ms |

A new enemy type that first appears in the middle of a level freezes the game for several
frames. Prepare everything while the game loads instead:

```js
// Put one of every kind of object the game will show into the scene, then:
for (const texture of allTextures) renderer.initTexture(texture);
renderer.compile(scene, camera);
// Now hide them or move them into their pools.
```

Short-lived objects are cheaper than their reputation: 200,000 new vectors a frame did not
lower the frame rate. Reusing them is still good practice, but the real stalls come from new
geometries, materials and textures during play.

## If it still does not fit

Draw the 3D scene at half resolution. `createHandheld` takes a `resolution` option:

```js
const hh = createHandheld({ clearColor: SKY, resolution: 0.5 });
```

The scene is drawn at 360×240 and stretched to the screen; the HUD stays sharp. A scene with
20,000 visible triangles went from 27 to 60 fps. It looks softer, which suits a retro style.

## Measure

**In the browser**, press **P** for the performance overlay: frame rate, draw calls and
triangles. It turns red past 100 draw calls or 10,000 triangles, or below 55 fps. The overlay counts every
triangle drawn, also those outside the view, so a red triangle count with a steady 60 fps on the
handheld means they are off screen. The desktop's frame rate tells you nothing about the
handheld's.

**On a handheld**, turn on **Settings > Show FPS in games** in PocketVibe to see the same
overlay over every game. To read the numbers from your computer instead, put the game on the
handheld with `device/play.sh` (see [Get started](getting-started.md)) and start it with
`perflog`:

```sh
ssh root@<handheld> 'sh /storage/pocketvibe/run-game.sh <game-id> "&perflog"'
# play for a while, then:
ssh root@<handheld> 'grep PERF /tmp/pocketvibe-cog.log'
```

Every two seconds the game logs its frame rate, its longest frame, its draw calls and its
triangles:

```
PERF {"fps":59.8,"worstMs":21,"calls":42,"triangles":8320}
```

Aim for 60 fps in the busiest part of the game, not only on the title screen.

## Checklist

1. Fewer than 10,000 triangles in view and 100 draw calls, in the busiest moment.
2. Lambert, Basic or Toon materials; one hemisphere light and one directional light; no shadows.
3. Repeated objects instanced; merged geometry made non-indexed.
4. At most one full-screen transparent layer; particles as `Points`; no post-processing.
5. HUD in HTML, updated only on change; no `backdrop-filter`.
6. Every material compiled and every texture uploaded while loading.
7. Measured on a handheld: 60 fps, and no frame much over 33 ms during play.
