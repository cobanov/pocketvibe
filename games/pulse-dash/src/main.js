// Pulse Dash: a rhythm auto-runner. The cube slides right in time with the
// level's track; A or UP jumps (hold to keep jumping on the beat), a press in
// the air over a ring jumps again, pads launch it high. One touch of a spike
// or a wall ends the attempt, and A starts the level again at once.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { LEVELS } from './levels.js';
import { buildLevel } from './level.js';
import { solve } from './solver.js';
import { DIE, DONE, JUMP, LAND, PAD, RING, SUB, X0, createState, resetState, step } from './sim.js';
import { createAudio } from './music.js';
import { createWorld } from './world.js';
import { createBackdrop } from './backdrop.js';
import { createCube } from './cube.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { CAM_AHEAD, CAM_Y, CAM_Z, CUBE_COLOR, FOV, PAD_COLOR, RING_COLOR, beatPulse, clamp } from './shared.js';

const SAVE_KEY = 'pulse-dash';
const PRESS_STEPS = 10; // a press waits this many steps (1.25 cells) for the ground or a ring
const DEMO_FROM_BAR = 2; // the title demo skips the empty first bars
const DEAD_PANEL = 0.4; // seconds before the death panel shows
const RETRY_DELAY = 0.15; // a button mashed in the crash does not restart at once
const DONE_PANEL = 1.7; // after the COMPLETE! toast
const LOADING_SHOW = 0.15; // "Loading" only shows if it takes longer than this
const AUDIO_WAIT = 0.8; // a start waits this long for the audio to come up
const MAX_STEPS = 400; // physics steps per frame at most, after a long hitch
const TRAIL_EVERY = 0.22; // cells between trail particles

const HINT = '◀ ▶ level · A / ▲ jump · START pause';
const HINT2 = 'Hold A to keep jumping · press A on rings';
const PAUSED = `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`;
const CONFETTI = [0xff4fd8, 0x2de2ff, 0xffe14a, 0xc6ff3a, 0xff6a2b, 0xb45cff];

const levels = LEVELS.map(buildLevel);
const demos = levels.map(solve); // the title screen's autopilot, one move list per level

const hh = createHandheld({ clearColor: LEVELS[0].palette.bg });
const { renderer, input } = hh;

// Everything is drawn with MeshBasicMaterial (neon needs no shading), so the
// scene has no lights; depth comes from fog and baked vertex colours.
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(LEVELS[0].palette.bg, 18, 44);
const camera = new THREE.PerspectiveCamera(FOV, hh.aspect, 0.5, 70);
hh.fitCamera(camera); // wide screens see more of the track, tall ones more above and below
const lookAt = new THREE.Vector3();
// Tan of half the horizontal view, for the scenery that must reach the sides.
const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * hh.aspect;

const world = createWorld(scene, halfTan);
const backdrop = createBackdrop(scene, halfTan);
const cube = createCube(scene);
const fx = createFx(scene);
const hud = createHud(hh.hud);
const audio = createAudio();

const saved = hh.load(SAVE_KEY, null);
const best = LEVELS.map((_, i) => clamp(Math.floor(Number(saved?.best?.[i]) || 0), 0, 100));

const sim = createState();
let state = 'title'; // title | loading | play | paused | dead | complete
let levelIndex = clamp(Math.floor(Number(saved?.level) || 0), 0, LEVELS.length - 1);
let L = levels[levelIndex];
let stateTime = 0;
let attempts = 0;
let songT = 0; // song time in seconds; drives everything while playing
let cubeX = X0; // where the cube is drawn: the clock's position, between physics steps
let pressLeft = 0;
let armed = false; // A must be let go once after the press that started the attempt
let shake = 0;
let pulse = 0;
let camY = CAM_Y;
let pct = 0;
let record = false;
let panelShown = false;
let trail = 0;
let selectTime = 0;

function save() {
  hh.save(SAVE_KEY, { best, level: levelIndex });
}

function setLevel(i) {
  levelIndex = i;
  L = levels[i];
  const bg = L.def.palette.bg;
  renderer.setClearColor(bg);
  scene.fog.color.setHex(bg);
  world.setLevel(L);
  backdrop.setLevel(L);
  hud.accent(L.def.palette.main);
}

// ---------------------------------------------------------------- title

function showTitle() {
  const d = L.def;
  const status = best[levelIndex] >= 100 ? 'Complete!' : best[levelIndex] > 0 ? `Best ${best[levelIndex]}%` : 'New';
  hud.message(
    `<div class="logo">PULSE<span>DASH</span></div>` +
      `<div class="select"><span class="arrow">◀</span><span class="name">${d.name}</span><span class="arrow">▶</span></div>` +
      `<div class="small"><span class="diff d${levelIndex}">${d.difficulty}</span> · ${d.bpm} BPM · ${status}</div>` +
      `<div class="blink">Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      `<div class="small dim">${HINT2}</div>`,
    'high',
  );
}

// The title screen plays the selected level by itself, silently, from a
// couple of bars in.
function startDemo() {
  resetState(sim);
  const acts = demos[levelIndex];
  if (acts) {
    while (sim.x < X0 + DEMO_FROM_BAR * 16) step(sim, L, acts[sim.n] === 1, acts[sim.n] === 1);
  }
  songT = (sim.x - X0) / L.speed;
  cubeX = sim.x;
  cube.reset();
  fx.clear();
  world.clearFlashes();
  camY = CAM_Y;
}

function toTitle() {
  state = 'title';
  stateTime = 0;
  selectTime = 0;
  audio.stop(0.15);
  audio.resume(); // after quitting from the pause menu: ticks on the title need sound
  hud.showProgress(false);
  startDemo();
  showTitle();
}

function updateTitle(dt) {
  const dir = input.pressed('RIGHT') ? 1 : input.pressed('LEFT') ? -1 : 0;
  if (dir !== 0) {
    setLevel((levelIndex + dir + LEVELS.length) % LEVELS.length);
    startDemo();
    showTitle();
    audio.sound('tick');
    selectTime = 0;
    save();
  }
  // Render the track of the level the player settles on, ahead of time.
  selectTime += dt;
  if (selectTime > 0.5) audio.prepare(levelIndex, L);

  const acts = demos[levelIndex];
  songT += dt;
  advance(acts);
  if (!acts || sim.done || sim.dead) startDemo();
  if (input.pressed('A') || input.pressed('START')) start();
}

// ---------------------------------------------------------------- playing

function start() {
  audio.unlock();
  audio.prepare(levelIndex, L);
  attempts = 0;
  state = 'loading';
  stateTime = 0;
  panelShown = false;
  resetState(sim);
  cubeX = X0;
  songT = -1; // no beat pulse while it loads
  cube.reset();
  fx.clear();
  hud.message('');
}

function updateLoading() {
  if (audio.ready(levelIndex) && (audio.live || stateTime > AUDIO_WAIT)) {
    beginAttempt();
  } else if (!panelShown && stateTime > LOADING_SHOW) {
    panelShown = true;
    hud.message(`<div class="title">Loading</div><div class="small">${L.name}</div>`);
  } else if (input.pressed('B')) {
    toTitle();
  }
}

function beginAttempt() {
  attempts++;
  state = 'play';
  stateTime = 0;
  resetState(sim);
  pressLeft = 0;
  armed = false;
  trail = 0;
  fx.clear();
  world.clearFlashes();
  cube.reset();
  audio.play(levelIndex);
  songT = audio.time(0);
  cubeX = X0;
  camY = CAM_Y;
  shake = 0;
  pct = 0;
  hud.message('');
  hud.showProgress(true);
  hud.progress(0);
  hud.bestMark(best[levelIndex]);
  hud.toast(`ATTEMPT ${attempts}`);
}

// Steps the physics up to the clock's position. acts: the autopilot's
// move list on the title screen, or null for the player.
function advance(acts) {
  const target = X0 + songT * L.speed;
  const hold = !acts && armed && (input.down('A') || input.down('UP'));
  let steps = 0;
  while (sim.x + SUB <= target && steps < MAX_STEPS && !sim.dead && !sim.done) {
    steps++;
    const a = acts ? acts[sim.n] === 1 : false;
    const ev = step(sim, L, acts ? a : hold, acts ? a : pressLeft > 0);
    if (ev === JUMP || ev === RING) pressLeft = 0;
    else if (pressLeft > 0) pressLeft--;
    if (ev === JUMP) {
      cube.jump();
    } else if (ev === LAND) {
      cube.land();
      fx.burst(sim.x - 0.3, sim.y + 0.05, 5, 2.2, 0.35, 0.16, CUBE_COLOR, 6);
    } else if (ev === RING) {
      cube.jump();
      world.flashRing(sim.ring);
      fx.burst(sim.x, sim.y + 0.5, 12, 4, 0.45, 0.2, RING_COLOR, 0);
    } else if (ev === PAD) {
      cube.jump();
      world.flashPad(sim.pad);
      fx.burst(sim.x, sim.y + 0.1, 10, 3.5, 0.45, 0.18, PAD_COLOR, 4);
    } else if (ev === DIE) {
      if (!acts) die();
    } else if (ev === DONE) {
      if (!acts) complete();
    }
  }
  // Draw the cube where the clock says, but never past the physics.
  cubeX = sim.dead ? sim.x : Math.min(target, sim.x + SUB);
}

function updatePlay(dt) {
  if (input.pressed('START')) {
    state = 'paused';
    audio.pause();
    hud.message(PAUSED);
    return;
  }
  if (!input.down('A') && !input.down('UP')) armed = true;
  if (input.pressed('A') || input.pressed('UP')) pressLeft = PRESS_STEPS;
  songT = audio.time(dt);
  advance(null);
  if (state !== 'play') return;
  const p = Math.floor(clamp((sim.x - X0) / (L.endX - X0), 0, 1) * 100);
  if (p !== pct) {
    pct = p;
    hud.progress(pct);
  }
}

function die() {
  state = 'dead';
  stateTime = 0;
  panelShown = false;
  audio.stop(0.04);
  audio.sound('crash');
  cube.die();
  const x = sim.x;
  const y = sim.y + 0.5;
  fx.burst(x, y, 34, 9, 0.8, 0.3, CUBE_COLOR, 7);
  fx.burst(x, y, 14, 6, 0.6, 0.22, 0xffffff, 4);
  fx.burst(x, y, 10, 4, 0.9, 0.4, L.def.palette.spike, 2);
  fx.shockwave(x, y, CUBE_COLOR);
  shake = 0.5;
  hud.flash('rgba(255, 255, 255, 0.45)');
  record = pct > best[levelIndex];
  if (record) {
    best[levelIndex] = pct;
    save();
  }
}

function showDeathPanel() {
  panelShown = true;
  hud.message(
    `<div class="big">${pct}%</div>` +
      (record ? `<div class="record">NEW BEST!</div>` : `<div class="small">Best ${best[levelIndex]}%</div>`) +
      `<div>Attempt ${attempts}</div>` +
      `<div class="small">A retry · B title</div>`,
  );
}

function complete() {
  state = 'complete';
  stateTime = 0;
  panelShown = false;
  best[levelIndex] = 100;
  save();
  hud.progress(100);
  audio.sound('complete');
  for (let i = 0; i < CONFETTI.length; i++) {
    fx.burst(sim.x + 2 + i * 1.2, 2 + Math.random() * 3, 10, 6, 1.1, 0.26, CONFETTI[i], 5);
  }
  fx.shockwave(L.endX, 2.5, L.def.palette.main);
  hud.flash('rgba(255, 255, 255, 0.35)');
  hud.toast('COMPLETE!');
}

function showCompletePanel() {
  panelShown = true;
  const last = levelIndex === LEVELS.length - 1;
  hud.message(
    `<div class="title">LEVEL COMPLETE!</div>` +
      `<div class="name">${L.name}</div>` +
      `<div>${attempts === 1 ? 'First try!' : `Attempts ${attempts}`}</div>` +
      `<div class="small">${last ? 'A play again' : 'A next level'} · B title</div>`,
  );
}

// After the finish the cube runs on with the music while the panel shows.
function updateComplete(dt) {
  songT = audio.time(dt);
  const target = X0 + songT * L.speed;
  let steps = 0;
  while (sim.x + SUB <= target && steps < MAX_STEPS) {
    steps++;
    if (step(sim, L, false, false) === LAND) cube.land();
  }
  cubeX = Math.min(target, sim.x + SUB);
  if (!panelShown && stateTime > DONE_PANEL) showCompletePanel();
  else if (panelShown && input.pressed('A')) {
    if (levelIndex < LEVELS.length - 1) setLevel(levelIndex + 1);
    save();
    start();
  } else if (panelShown && input.pressed('B')) toTitle();
}

// ---------------------------------------------------------------- loop

setLevel(levelIndex);
toTitle();
// Upload the textures and build every shader now (all kinds of objects are in
// the scene, even if hidden or empty), so nothing stalls mid-run.
scene.traverse((object) => {
  if (object.material?.map) renderer.initTexture(object.material.map);
});
renderer.compile(scene, camera);

hh.run((dt) => {
  stateTime += dt;
  const prevX = cubeX;

  if (state === 'title') {
    updateTitle(dt);
  } else if (state === 'loading') {
    updateLoading();
  } else if (state === 'play') {
    updatePlay(dt);
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      audio.resume();
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'dead') {
    if (!panelShown && stateTime > DEAD_PANEL) showDeathPanel();
    if (stateTime > RETRY_DELAY && input.pressed('A')) beginAttempt();
    else if (stateTime > RETRY_DELAY && input.pressed('B')) toTitle();
  } else if (state === 'complete') {
    updateComplete(dt);
  }

  // Everything below is drawing; while paused it all stays frozen.
  const paused = state === 'paused';
  const animDt = paused ? 0 : dt;
  if (state === 'dead') pulse *= Math.exp(-dt * 4);
  else if (!paused) pulse = beatPulse(L, songT);

  const moved = Math.max(0, cubeX - prevX);
  if (state !== 'dead' && state !== 'loading' && !paused) {
    // The trail: sparks off the back edge on the ground, a fading wake in the air.
    trail += moved;
    while (trail > TRAIL_EVERY) {
      trail -= TRAIL_EVERY;
      if (sim.grounded) {
        fx.emit(cubeX - 0.5, sim.y + 0.06, 0.35, -1 - Math.random() * 2, 0.5 + Math.random() * 1.5, 0.3, 0.13, CUBE_COLOR, 7);
      } else {
        fx.emit(cubeX - 0.2, sim.y + 0.5, -0.2, -0.4, (Math.random() - 0.5) * 0.4, 0.32, 0.55, 0x6f9c1c, 0);
      }
    }
  }

  cube.update(animDt, cubeX, sim.y, sim.grounded, moved, pulse);
  world.update(animDt, cubeX + CAM_AHEAD, pulse);
  fx.update(animDt);

  // Camera: a side view that follows the cube, rising when it climbs high.
  const camTarget = CAM_Y + Math.max(0, sim.y - 1.4) * 0.75;
  if (!paused) camY += (camTarget - camY) * Math.min(1, dt * 3);
  shake = paused ? shake : Math.max(0, shake - dt);
  const jolt = paused ? 0 : shake;
  const jx = (Math.random() - 0.5) * jolt;
  const jy = (Math.random() - 0.5) * jolt;
  const cx = cubeX + CAM_AHEAD;
  camera.position.set(cx + jx, camY + 1.1 + jy, CAM_Z);
  lookAt.set(cx + jx * 0.5, camY, 0);
  camera.lookAt(lookAt);
  backdrop.update(animDt, cx, camY, pulse);

  renderer.render(scene, camera);
});
