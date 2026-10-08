// Feasibility benchmark for the handheld.
//
// Renders each scene in two ways (naive and lean, see strategies.js) at the
// handheld's 720x480 resolution, flies the camera through it hands-free and
// reports frame rate and render statistics.
//
// URL parameters:
//   ?scene=runner&mode=lean   run one benchmark
//   ?suite=all                run every scene in both modes, one page load each
//   &seconds=20               measured duration per run (after a warm-up)

import * as THREE from 'three';
import { buildLean, buildNaive } from './strategies.js';
import runner from './scenes/runner.js';
import racing from './scenes/racing.js';
import platformer from './scenes/platformer.js';

const SCENES = { runner, racing, platformer };
const MODES = ['naive', 'lean'];
const SUITE = Object.keys(SCENES).flatMap((scene) => MODES.map((mode) => ({ scene, mode })));
const WARMUP = 2; // seconds rendered before measuring
const STORE = 'handheld-bench-suite';

const params = new URLSearchParams(location.search);
const seconds = Number(params.get('seconds') ?? 20);
const status = document.getElementById('status');

// Small seeded random generator, so every run builds the same world.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function runBench(sceneName, mode) {
  const def = SCENES[sceneName];
  const renderer = new THREE.WebGLRenderer({
    antialias: mode === 'naive',
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(mode === 'naive' ? devicePixelRatio : 1);
  renderer.setSize(720, 480);
  renderer.info.autoReset = false;
  document.getElementById('stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(def.sky);
  scene.fog = new THREE.Fog(def.sky, def.fog[0], def.fog[1]);
  const camera = new THREE.PerspectiveCamera(65, 720 / 480, 0.1, def.fog[1] + 10);

  const instances = def.build(mulberry32(1));
  const dynamic = instances.filter((inst) => inst.update);
  const world = mode === 'naive' ? buildNaive(def, instances, scene, renderer) : buildLean(def, instances, scene);
  const target = new THREE.Vector3();

  const frameTimes = new Float32Array(Math.ceil((seconds + 1) * 240));
  let count = 0;
  let start = null;
  let last = 0;
  let firstFrameMs = 0;
  let sumCalls = 0;
  let sumTriangles = 0;
  let maxCalls = 0;
  let maxTriangles = 0;
  let lastStatus = 0;

  return new Promise((resolve) => {
    renderer.setAnimationLoop((now) => {
      if (start === null) {
        start = now;
        firstFrameMs = now; // milliseconds since the page started loading
      }
      const t = (now - start) / 1000;

      def.camera(t, camera, target);
      camera.lookAt(target);
      for (const inst of dynamic) inst.update(t);
      world.sync(target);

      renderer.info.reset();
      renderer.render(scene, camera);

      if (t > WARMUP && count < frameTimes.length) {
        const { calls, triangles } = renderer.info.render;
        frameTimes[count++] = now - last;
        sumCalls += calls;
        sumTriangles += triangles;
        maxCalls = Math.max(maxCalls, calls);
        maxTriangles = Math.max(maxTriangles, triangles);
      }
      last = now;

      if (now - lastStatus > 500) {
        lastStatus = now;
        const phase = t < WARMUP ? 'warming up' : `${Math.max(0, WARMUP + seconds - t).toFixed(0)}s left`;
        status.textContent = `${sceneName} / ${mode} · ${phase}`;
      }

      if (t >= WARMUP + seconds) {
        renderer.setAnimationLoop(null);
        const times = Array.from(frameTimes.subarray(0, count)).sort((a, b) => a - b);
        const mean = times.reduce((a, b) => a + b, 0) / count;
        resolve({
          scene: sceneName,
          mode,
          objects: instances.length,
          avgFps: +(1000 / mean).toFixed(1),
          low1Fps: +(1000 / percentile(times, 99)).toFixed(1),
          over33ms: times.filter((ms) => ms > 33.4).length,
          frames: count,
          avgDrawCalls: Math.round(sumCalls / count),
          maxDrawCalls: maxCalls,
          avgTriangles: Math.round(sumTriangles / count),
          maxTriangles,
          firstFrameMs: Math.round(firstFrameMs),
          userAgent: navigator.userAgent,
        });
      }
    });
  });
}

function showResults(results) {
  const columns = ['scene', 'mode', 'avgFps', 'low1Fps', 'over33ms', 'avgDrawCalls', 'avgTriangles', 'firstFrameMs'];
  const rows = results.map((r) => `<tr>${columns.map((c) => `<td>${r[c]}</td>`).join('')}</tr>`).join('');
  document.getElementById('results').innerHTML =
    `<table><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr>${rows}</table>`;
}

function showMenu() {
  const links = SUITE.map(({ scene, mode }) => `<a href="?scene=${scene}&mode=${mode}">${scene} / ${mode}</a>`);
  document.getElementById('menu').innerHTML =
    `<a href="?suite=all"><b>Run all (${SUITE.length} × ${WARMUP + seconds}s)</b></a>${links.join('')}`;
  status.textContent = 'Pick a benchmark.';
}

async function main() {
  if (params.get('suite') === 'all') {
    const index = Number(params.get('i') ?? 0);
    const done = index === 0 ? [] : JSON.parse(localStorage.getItem(STORE) ?? '[]');
    if (index < SUITE.length) {
      const { scene, mode } = SUITE[index];
      const result = await runBench(scene, mode);
      console.log(`BENCH ${JSON.stringify(result)}`);
      done.push(result);
      localStorage.setItem(STORE, JSON.stringify(done));
      // A fresh page load per run, so GPU memory from the last run is gone.
      location.replace(`?suite=all&i=${index + 1}&seconds=${seconds}`);
      return;
    }
    console.log(`BENCH_SUMMARY ${JSON.stringify(done)}`);
    status.textContent = 'Suite finished.';
    document.getElementById('stage').hidden = true;
    showResults(done);
    return;
  }

  const scene = params.get('scene');
  const mode = params.get('mode');
  if (!SCENES[scene] || !MODES.includes(mode)) {
    document.getElementById('stage').hidden = true;
    showMenu();
    return;
  }
  const result = await runBench(scene, mode);
  console.log(`BENCH ${JSON.stringify(result)}`);
  status.textContent = 'Finished.';
  showResults([result]);
}

main();
