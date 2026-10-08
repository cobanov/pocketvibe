<h1 align="center">PocketVibe bench</h1>

<p align="center">
  <strong>How fast three.js runs on the handheld, written two ways.</strong><br>
  The numbers behind the performance rules in <a href="../template/AGENTS.md">template/AGENTS.md</a>.
</p>

The bench draws three typical game scenes (an endless runner, a race and a platformer) at
720×480 and measures frame rate and drawing statistics. Each scene is drawn two ways from the
same scene description, so the only difference is how it is drawn:

- **naive** is three.js as AI tools write it by default: a mesh per object, `MeshStandardMaterial`, real-time shadows and point lights.
- **lean** follows the rules: one `InstancedMesh` per kind of object, a shared Lambert material and no shadows.

## What it found

On an Anbernic RG34XX SP (Allwinner H700, Mali-G31 MP2) with WPE WebKit 2.48, every lean scene
held 60 fps, and every naive scene ran at 3.6 to 5.6 fps. Full results:
[results/2026-10-08-rg-sp.md](results/2026-10-08-rg-sp.md).

## Try it

```sh
npm install
npm run dev      # try it on your computer
npm run build    # dist/ for the handheld
```

The page opens on a menu with each measurement and "Run all". Address parameters run it
directly:

- `?suite=all` runs all six measurements, each in its own page load.
- `?scene=racing&mode=lean` runs one.
- `&seconds=20` sets how long each one measures after warming up.

Each measurement prints a `BENCH {...}` line to the console, a suite ends with
`BENCH_SUMMARY [...]`, and the results show as a table on screen:

| Field | Meaning |
|---|---|
| `avgFps` | Average frame rate |
| `low1Fps` | Frame rate of the slowest 1% of frames, which shows stutter |
| `over33ms` | Frames slower than 30 fps |
| `avgDrawCalls`, `avgTriangles` | Average draw calls and triangles per frame |
| `firstFrameMs` | Time from the start of the page load to the first frame |

---

[MIT](../LICENSE)
