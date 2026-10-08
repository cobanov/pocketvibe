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

## The device's limits

The scene bench above flatters the handheld: most of its triangles are off screen. `limits.html` measures
one cost at a time (triangles in and out of view, draw calls, materials, lights, shadows, transparency,
particles, post-processing, HTML over the game, a 2D canvas, JavaScript time, shader compiles, uploads and
memory), raising it step by step until the frame rate falls. The device draws about 10,000 triangles inside
the view at 60 fps, a big indexed mesh costs CPU every frame, and drawing at half resolution doubles what a
scene can afford. Results: [results/2026-10-08-limits.md](results/2026-10-08-limits.md).

On the handheld, `tools/collector.py` takes the results and reports free memory; open
`limits.html?run=all&collect=http://127.0.0.1:8799` in the PocketVibe app. Run each test in a freshly started
browser (`?run=all&tests=<id>`): WebKit keeps the GPU memory of earlier pages, and after many steps the
numbers go wrong. `node tools/limits-report.mjs results.jsonl` prints the tables.

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
