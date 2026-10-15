// Runs the loaded game for BENCH_FRAMES frames as fast as it can, pressing A
// every 25 frames (start, flap, restart), and prints how long the game's
// JavaScript took per frame. Simulated time advances 1/60 s per frame.

(() => {
  const N = globalThis.BENCH_FRAMES ?? 1200;
  const WARMUP = 60;
  const pad = {
    id: 'bench', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  globalThis.__pads = () => [pad];

  const times = [];
  let t = __now();
  for (let i = 0; i < N; i++) {
    pad.buttons[1].pressed = i % 25 === 0;
    t += 1000 / 60;
    const start = __now();
    __frame(t);
    times.push(__now() - start);
  }

  const run = times.slice(WARMUP).sort((a, b) => a - b);
  const pct = (p) => run[Math.min(run.length - 1, Math.floor(run.length * p))];
  const avg = run.reduce((a, b) => a + b, 0) / run.length;
  console.log(`BENCH ${JSON.stringify({
    frames: run.length,
    firstFramesMs: times.slice(0, 3).map((x) => +x.toFixed(1)),
    avgMs: +avg.toFixed(2), p50Ms: +pct(0.5).toFixed(2), p95Ms: +pct(0.95).toFixed(2),
    p99Ms: +pct(0.99).toFixed(2), maxMs: +run[run.length - 1].toFixed(2),
    drawsPerFrame: +(__gl.draws / N).toFixed(1),
  })}`);
})();
