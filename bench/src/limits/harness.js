// Finds the handheld's limits: runs the tests in tests.js one step per page
// load and reports frame rate, frame times and the CPU time of each frame.
//
// Address parameters:
//   ?run=all                 every test; ?run=all&tests=a,b only those
//   ?test=<id>&value=<v>     one step
//   &seconds=4 &warmup=1.5   how long each step measures, after warming up
//   &collect=<url>           also POST each result to the collector
//                            (bench/tools/collector.py), which the memory
//                            test needs
//
// Each result is printed as `LIMIT {...}`; the run ends with `LIMITS_DONE`.

import * as THREE from 'three';
import { TESTS } from './tests.js';
import { H, W, sway } from './scene.js';

const params = new URLSearchParams(location.search);
const SECONDS = Number(params.get('seconds') ?? 4);
const WARMUP = Number(params.get('warmup') ?? 1.5);
const COLLECT = params.get('collect');
const ONLY = params.get('tests');
const STOP_BELOW = 12; // fps: the rest of a test's steps are skipped
const KEY = 'pv-limits';

const status = document.getElementById('status');
const stageEl = document.getElementById('stage');
const hud = document.getElementById('hud');

const tests = TESTS.filter((t) => !ONLY || ONLY.split(',').includes(t.id));
const plan = tests.flatMap((t) => t.values.map((value) => ({ test: t, value })));

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function makeContext(test, value) {
  const ctx = { hud, collect: COLLECT };
  if (test.kind === '2d') {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    stageEl.appendChild(canvas);
    ctx.g = canvas.getContext('2d');
    return ctx;
  }
  const opts = test.renderer?.(value) ?? {};
  const scale = opts.scale ?? 1;
  const renderer = new THREE.WebGLRenderer({ antialias: !!opts.antialias, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(Math.round(W * scale), Math.round(H * scale), false);
  Object.assign(renderer.domElement.style, { width: `${W}px`, height: `${H}px` });
  renderer.info.autoReset = false;
  stageEl.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.5, 120);
  Object.assign(ctx, { renderer, scene: new THREE.Scene(), camera });
  sway(ctx, 0);
  return ctx;
}

function measure(ctx, test, frame) {
  return new Promise((resolve) => {
    const times = [];
    const cpu = [];
    let calls = 0;
    let triangles = 0;
    let start = null;
    let last = 0;
    const tick = (now) => {
      if (start === null) start = last = now;
      const t = (now - start) / 1000;
      const dt = Math.min(Math.max(now - last, 0) / 1000, 0.1);
      const c0 = performance.now();
      const info = frame(t, dt);
      const c1 = performance.now();
      if (t > WARMUP) {
        times.push(now - last);
        cpu.push(c1 - c0);
        calls += info.calls;
        triangles += info.triangles;
      }
      last = now;
      if (t < WARMUP + SECONDS) requestAnimationFrame(tick);
      else {
        const n = times.length;
        const sorted = [...times].sort((a, b) => a - b);
        const mean = times.reduce((a, b) => a + b, 0) / n;
        resolve({
          fps: +(1000 / mean).toFixed(1),
          low1Fps: +(1000 / percentile(sorted, 99)).toFixed(1),
          p50Ms: +percentile(sorted, 50).toFixed(1),
          maxMs: +sorted[n - 1].toFixed(1),
          over20ms: times.filter((ms) => ms > 20).length,
          frames: n,
          cpuMs: +(cpu.reduce((a, b) => a + b, 0) / n).toFixed(2),
          cpuMaxMs: +Math.max(...cpu).toFixed(1),
          calls: Math.round(calls / n),
          triangles: Math.round(triangles / n),
        });
      }
    };
    requestAnimationFrame(tick);
  });
}

// The last step's renderer, released before the next page load: WebKit
// otherwise keeps old WebGL contexts and their GPU memory for a while.
let current = null;
function release() {
  if (!current?.renderer) return;
  current.renderer.dispose();
  current.renderer.forceContextLoss();
}

async function runStep(test, value) {
  const ctx = makeContext(test, value);
  current = ctx;
  if (test.kind === 'once') return test.once(ctx, value);
  const step = (await test.setup(ctx, value)) ?? {};
  let frame;
  if (test.kind === '2d') {
    frame = (t, dt) => {
      step.update?.(t, dt);
      return { calls: 0, triangles: 0 };
    };
  } else {
    const { renderer, scene, camera } = ctx;
    frame = (t, dt) => {
      if (!step.fixed) sway(ctx, t);
      step.update?.(t, dt);
      renderer.info.reset();
      if (step.render) step.render();
      else renderer.render(scene, camera);
      return renderer.info.render;
    };
  }
  status.hidden = true;
  const result = await measure(ctx, test, frame);
  return { ...result, ...(ctx.extra?.() ?? {}) };
}

async function report(record) {
  console.log(`LIMIT ${JSON.stringify(record)}`);
  if (!COLLECT) return;
  try {
    await fetch(`${COLLECT}/result`, { method: 'POST', body: JSON.stringify(record), mode: 'no-cors' });
  } catch {
    // The console line is enough.
  }
}

function label(test, value) {
  return test.label ? test.label(value) : String(value);
}

async function runAll() {
  const i = Number(params.get('i') ?? 0);
  const state = i === 0 ? { slow: [] } : JSON.parse(localStorage.getItem(KEY) ?? '{"slow":[]}');
  if (i >= plan.length) {
    console.log(`LIMITS_DONE ${plan.length}`);
    status.textContent = 'Finished.';
    return;
  }
  const { test, value } = plan[i];
  if (!state.slow.includes(test.id)) {
    status.textContent = `${i + 1}/${plan.length} ${test.id} ${label(test, value)}`;
    try {
      const result = await runStep(test, value);
      await report({ test: test.id, value: label(test, value), ts: Date.now(), ...result });
      if (result.fps !== undefined && result.fps < STOP_BELOW) state.slow.push(test.id);
    } catch (e) {
      await report({ test: test.id, value: label(test, value), ts: Date.now(), error: String(e) });
    }
  }
  localStorage.setItem(KEY, JSON.stringify(state));
  // A fresh page per step, so nothing from the last step stays in memory.
  release();
  const next = new URLSearchParams(params);
  next.set('i', String(i + 1));
  location.replace(`?${next}`);
}

function showMenu() {
  status.hidden = true;
  stageEl.hidden = true;
  const menu = document.getElementById('menu');
  menu.innerHTML =
    `<a href="?run=all"><b>Run all (${plan.length} steps)</b></a>` +
    TESTS.map((t) => `<a href="?run=all&tests=${t.id}">${t.id}</a> <span>${t.about}</span>`).join('<br>');
}

async function main() {
  if (params.get('run') === 'all') return runAll();
  const test = TESTS.find((t) => t.id === params.get('test'));
  if (!test) return showMenu();
  const raw = params.get('value');
  const value = test.values.find((v) => String(v) === raw || label(test, v) === raw) ?? (raw === null ? test.values[0] : Number.isNaN(Number(raw)) ? raw : Number(raw));
  const result = await runStep(test, value);
  await report({ test: test.id, value: label(test, value), ts: Date.now(), ...result });
  status.hidden = false;
  status.textContent = JSON.stringify(result);
}

main();
