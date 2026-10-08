// Maze Chase: eat every dot in a neon maze while four drones hunt you down.
// Power cores turn the tables for a few seconds: frightened drones can be
// eaten for 200, 400, 800 and 1600 points. The D-pad moves (taps are kept
// until the next junction that allows the turn), START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { MAZES, START_X, START_Y } from './mazes.js';
import { BG, BUTTON, NONE, worldX, worldZ } from './shared.js';
import { createMaze } from './maze.js';
import { createPlayer } from './player.js';
import { COLORS, COUNT, WISP, createDrones } from './drones.js';
import { createBonus } from './bonus.js';
import { createFx } from './fx.js';
import { createAutopilot } from './autopilot.js';
import { createHud } from './hud.js';

const SAVE_KEY = 'maze-chase';
const START_LIVES = 3;
const MAX_LIVES = 5;
const EXTRA_LIFE_AT = 10000;
const DOT_POINTS = 10;
const CORE_POINTS = 50;
const DRONE_POINTS = [200, 400, 800, 1600];
const BUFFER = 0.6; // a tapped direction waits this long for a junction

// Speeds in cells per second; both creep up over the first levels.
const PLAYER_SPEED = 6.6;
const DRONE_SPEED = 5.8;
const WISP_SPEED = 14;
const FRIGHT_TIMES = [7, 6, 5, 4.5, 4, 3.5, 3, 2.5, 2]; // seconds, by level
const FLASH_TIME = 2; // frightened drones blink for the last seconds

// Scatter and chase alternate on a clock; even entries are scatter.
const PHASES_1 = [7, 20, 7, 20, 5, 20, 5, Infinity];
const PHASES_2 = [7, 20, 7, 20, 5, 40, 3, Infinity];
const PHASES_5 = [5, 20, 5, 20, 5, 45, 2, Infinity];

const READY_TIME = 2.2; // before a new level
const RETRY_TIME = 1.7; // after losing a life
const DEMO_READY = 0.6;
const EAT_PAUSE = 0.55; // the world holds still for a moment when a drone is eaten
const CLEAR_TIME = 2.8;
const DEMO_LEVEL = 2;

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 50, 72);

// Tilted overhead view that keeps the whole maze on screen under the HUD row.
// Wider screens show more of the grid at the sides, taller ones more above
// and below; the maze stays whole and the same size on every shape.
const CAM_Y = 40.3;
const CAM_Z = 18.1;
const LOOK_Z = -0.7;
const camera = new THREE.PerspectiveCamera(30, hh.aspect, 10, 75);
hh.fitCamera(camera);
camera.position.set(0, CAM_Y, CAM_Z);
camera.lookAt(0, 0, LOOK_Z);

scene.add(new THREE.HemisphereLight(0xd8e4ff, 0x2a2840, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-5, 14, 9);
scene.add(sun);

const maze = createMaze(scene);
const player = createPlayer(scene, maze);
const drones = createDrones(scene, maze);
const bonus = createBonus(scene);
const fx = createFx(scene);
const autopilot = createAutopilot(maze, drones);
const hud = createHud(hh.hud);

let state = 'title'; // title | game | paused | over
let phase = 'ready'; // the round, also played by the demo: ready | play | eat | dying | clear
let phaseTime = 0;
let readyTime = READY_TIME;
let demo = true;
let demoMaze = 0;
let level = 1;
let score = 0;
let lives = 0;
let extraGiven = false;
let dotsEaten = 0;
let want = NONE;
let wantHold = 0;
let fright = 0; // seconds of fright left
let chain = 0; // drones eaten during this fright
let phaseIndex = 0; // position in the scatter / chase table
let phaseClock = 0;
let phases = PHASES_1;
let playerSpeed = PLAYER_SPEED;
let frightTime = FRIGHT_TIMES[0];
let releaseScale = 1;
let overTime = 0;
let shake = 0;
let titleTime = 0;
let wispClock = 0;
let intro = 0; // 1 -> 0: the camera drops in when a maze comes up
const saved = hh.load(SAVE_KEY, null);
let best = saved?.best || 0;
let bestLevel = saved?.level || 0;

// Handed to the drones every frame; filled in place, never reallocated.
const ctx = {
  chase: false,
  speed: DRONE_SPEED,
  frightSpeed: DRONE_SPEED * 0.58,
  tunnelSpeed: DRONE_SPEED * 0.5,
  wispSpeed: WISP_SPEED,
  elroy: 1,
  px: START_X,
  py: START_Y,
  pdir: 0,
};

const HINT = 'D-pad move · START pause';
const screenPos = new THREE.Vector3();

function project(x, y, z) {
  screenPos.set(x, y, z).project(camera);
  screenPos.x = (screenPos.x + 1) * 0.5 * hh.width;
  screenPos.y = (1 - screenPos.y) * 0.5 * hh.height;
  return screenPos;
}

function popupAt(text, x, y, z, color) {
  const p = project(x, y, z);
  hud.popup(text, p.x, p.y, color);
}

// Speeds, fright time, phase table and base waits for a level.
function setupLevel(n) {
  const k = Math.min(n - 1, 6);
  playerSpeed = PLAYER_SPEED * (1 + 0.025 * k);
  const speed = DRONE_SPEED * (1 + 0.04 * k);
  ctx.speed = speed;
  ctx.frightSpeed = speed * 0.58;
  ctx.tunnelSpeed = speed * 0.5;
  frightTime = FRIGHT_TIMES[Math.min(n - 1, FRIGHT_TIMES.length - 1)];
  phases = n === 1 ? PHASES_1 : n < 5 ? PHASES_2 : PHASES_5;
  releaseScale = Math.max(0.35, 1 - 0.13 * (n - 1));
}

function setPhase(p) {
  phase = p;
  phaseTime = 0;
}

// Everyone back to their start; the dots stay as they are.
function resetRound() {
  player.reset();
  drones.reset(releaseScale);
  bonus.clear();
  autopilot.reset();
  want = NONE;
  wantHold = 0;
  fright = 0;
  chain = 0;
  phaseIndex = 0;
  phaseClock = 0;
  ctx.chase = false;
}

function loadMaze(index) {
  maze.load(index);
  dotsEaten = 0;
  fx.clear();
  resetRound();
  intro = 1;
}

function startLevel(n) {
  level = n;
  setupLevel(n);
  loadMaze(n - 1);
  setPhase('ready');
  readyTime = READY_TIME;
  hud.level(n);
  hud.banner(`LEVEL ${n}`, n > MAZES.length ? `${maze.name} · faster` : maze.name);
  hud.ready('READY!');
}

// The title screen plays the game by itself, a new maze after every round.
function nextDemo() {
  demoMaze = (demoMaze + 1) % MAZES.length;
  setupLevel(DEMO_LEVEL);
  loadMaze(demoMaze);
  setPhase('ready');
  readyTime = DEMO_READY;
}

function toTitle() {
  state = 'title';
  demo = true;
  hud.showStats(false);
  hud.banner('');
  hud.callout('');
  hud.ready('');
  maze.flash(0);
  nextDemo();
  hud.message(
    `<div class="title">MAZE CHASE</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best}${bestLevel > 1 ? ` · Level ${bestLevel}` : ''}</div>` : ''),
  );
}

function start() {
  state = 'game';
  demo = false;
  score = 0;
  lives = START_LIVES;
  extraGiven = false;
  hud.message('');
  hud.callout('');
  hud.showStats(true);
  hud.score(0);
  hud.lives(lives);
  maze.flash(0);
  startLevel(1);
}

function saveBest() {
  const record = score > best;
  if (record) best = score;
  bestLevel = Math.max(bestLevel, level);
  hh.save(SAVE_KEY, { best, level: bestLevel });
  return record;
}

function pause() {
  state = 'paused';
  hud.message(
    `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`,
  );
}

function gameOver() {
  state = 'over';
  overTime = 0;
  const record = saveBest();
  hud.ready('');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${score}</div>` +
      `<div class="small">Level ${level} · Best ${best}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

function addScore(points) {
  if (demo) return;
  score += points;
  if (!extraGiven && score >= EXTRA_LIFE_AT) {
    extraGiven = true;
    lives = Math.min(MAX_LIVES, lives + 1);
    hud.lives(lives);
    hud.callout('EXTRA LIFE!', '#7dffb6');
  }
  hud.score(score);
}

// The D-pad direction to steer towards. A tap is remembered for a moment, so
// pressing before a junction turns there.
function readWant(dt) {
  for (let d = 0; d < 4; d++) {
    if (input.pressed(BUTTON[d])) {
      want = d;
      wantHold = BUFFER;
    }
  }
  if (want !== NONE) {
    if (input.down(BUTTON[want])) wantHold = BUFFER;
    else {
      wantHold -= dt;
      if (wantHold <= 0) want = NONE;
    }
  }
  if (want === NONE) {
    for (let d = 0; d < 4; d++) {
      if (input.down(BUTTON[d])) {
        want = d;
        wantHold = BUFFER;
      }
    }
  }
  return want;
}

function eatDot(kind) {
  dotsEaten++;
  const x = worldX(player.x);
  const z = worldZ(player.y);
  if (kind === 1) {
    addScore(DOT_POINTS);
    player.munch(0.55);
    fx.sparks(x, 0.35, z, 0xffd9a6, 2, 1.6);
  } else {
    addScore(CORE_POINTS);
    player.munch(1);
    fright = frightTime;
    chain = 0;
    drones.frighten();
    fx.wave(x, z, 0xffb347, 1.6);
    fx.burst(x, 0.45, z, 0xffd27a, 14, 4.5);
    shake = Math.max(shake, 0.14);
  }
  // The gem comes out when 30% and again when 70% of the maze is eaten.
  const total = maze.dotsTotal;
  if (dotsEaten === Math.floor(total * 0.3) || dotsEaten === Math.floor(total * 0.7)) {
    bonus.spawn(demo ? DEMO_LEVEL : level);
  }
  if (maze.dotsLeft === 0) {
    setPhase('clear');
    bonus.clear();
    drones.hidden = true;
    fright = 0;
    hud.callout('');
  }
}

function eatDrone(i) {
  const d = drones.list[i];
  const points = DRONE_POINTS[Math.min(chain, DRONE_POINTS.length - 1)];
  chain++;
  addScore(points);
  drones.eat(i);
  const x = worldX(d.x);
  const z = worldZ(d.y);
  fx.burst(x, 0.5, z, COLORS[i], 14, 5);
  fx.burst(x, 0.5, z, 0xffffff, 6, 4);
  fx.wave(x, z, COLORS[i], 1.3);
  if (!demo) popupAt(`${points}`, x, 0.9, z, '#8ff0ff');
  if (!demo && chain === COUNT) hud.callout('ALL FOUR!', '#ffd84a');
  player.munch(1);
  shake = Math.max(shake, 0.2);
  setPhase('eat');
}

function eatGem() {
  const x = worldX(bonus.cx);
  const z = worldZ(bonus.cy);
  addScore(bonus.points);
  fx.burst(x, 0.6, z, bonus.color, 16, 5);
  fx.burst(x, 0.6, z, 0xffffff, 6, 4);
  fx.wave(x, z, bonus.color, 1.3);
  if (!demo) popupAt(`${bonus.points}`, x, 1.1, z, '#ffe27a');
  bonus.on = false;
  player.munch(1);
  shake = Math.max(shake, 0.1);
}

function caught() {
  setPhase('dying');
  shake = 0.35;
  if (!demo) hud.hurt();
}

function updatePlay(dt) {
  const steer = demo ? autopilot.steer(dt, player) : readWant(dt);
  player.update(dt, steer, playerSpeed * (fright > 0 ? 1.06 : 1));
  const kind = maze.eat(player.cx, player.cy);
  if (kind > 0) eatDot(kind);
  if (phase !== 'play') return;

  // The scatter / chase clock stops while the drones are frightened.
  if (fright > 0) {
    fright -= dt;
    if (fright <= 0) {
      fright = 0;
      drones.calm();
    }
  } else {
    phaseClock += dt;
    if (phaseClock >= phases[phaseIndex]) {
      phaseClock = 0;
      phaseIndex++;
      ctx.chase = phaseIndex % 2 === 1;
      drones.reverse();
    }
  }

  ctx.px = player.cx;
  ctx.py = player.cy;
  ctx.pdir = player.dir;
  // Rook gets angry when few dots are left.
  ctx.elroy = maze.dotsLeft <= 12 ? 1.12 : maze.dotsLeft <= 30 ? 1.06 : 1;
  drones.update(dt, ctx);

  const hit = drones.touching(player.x, player.y);
  if (hit >= 0) {
    if (drones.list[hit].fright) eatDrone(hit);
    else caught();
    return;
  }

  if (bonus.update(dt)) fx.sparks(worldX(bonus.cx), 0.6, worldZ(bonus.cy), bonus.color, 10, 2.5);
  if (bonus.on && player.cx === bonus.cx && player.cy === bonus.cy) eatGem();

  // Eaten drones leave a trail of sparks on their way home.
  wispClock -= dt;
  if (wispClock <= 0) {
    wispClock = 0.05;
    for (let i = 0; i < COUNT; i++) {
      const d = drones.list[i];
      if (d.mode === WISP) fx.sparks(worldX(d.x), 0.3, worldZ(d.y), COLORS[i], 1, 0.6);
    }
  }
}

function updateRound(dt) {
  phaseTime += dt;
  if (phase === 'ready') {
    if (phaseTime >= readyTime) {
      setPhase('play');
      hud.ready('');
    }
  } else if (phase === 'play') {
    updatePlay(dt);
  } else if (phase === 'eat') {
    if (phaseTime >= EAT_PAUSE) phase = 'play';
  } else if (phase === 'dying') {
    // A beat of stillness, the drones vanish, the bot spins and pops.
    if (phaseTime >= 0.5 && player.alive) {
      drones.hidden = true;
      for (let i = 0; i < COUNT; i++) {
        const d = drones.list[i];
        fx.sparks(worldX(d.x), 0.5, worldZ(d.y), COLORS[i], 6, 2);
      }
      bonus.clear();
      player.die();
    }
    if (phaseTime >= 1.4 && !player.hidden) {
      player.hidden = true;
      const x = worldX(player.x);
      const z = worldZ(player.y);
      fx.burst(x, 0.5, z, 0xffffff, 16, 5.5);
      fx.burst(x, 0.5, z, 0x56f2ff, 12, 4.5);
      fx.wave(x, z, 0x56f2ff, 1.4);
      shake = Math.max(shake, 0.25);
    }
    if (phaseTime >= 2.3) afterDeath();
  } else if (phase === 'clear') {
    // The walls flash, then on to the next maze.
    const t = phaseTime - 0.7;
    maze.flash(t > 0 && t < 1.6 && Math.floor(t / 0.2) % 2 === 0 ? 1 : 0);
    if (t > 0 && t - dt <= 0) {
      for (let i = 0; i < 8; i++) {
        const x = (Math.random() - 0.5) * 26;
        const z = (Math.random() - 0.5) * 14;
        fx.burst(x, 0.6, z, i % 2 ? maze.hue : 0xffffff, 8, 5);
      }
    }
    if (phaseTime >= CLEAR_TIME) {
      maze.flash(0);
      if (demo) nextDemo();
      else startLevel(level + 1);
    }
  }
}

function afterDeath() {
  if (demo) {
    nextDemo();
    return;
  }
  lives--;
  hud.lives(lives);
  if (lives <= 0) {
    gameOver();
    return;
  }
  resetRound();
  setPhase('ready');
  readyTime = RETRY_TIME;
  hud.ready('READY!');
}

// "READY!" sits on the row under the base.
camera.updateMatrixWorld();
const readyPos = project(0, 0.5, worldZ(START_Y - 2));
hh.hud.querySelector('#ready').style.top = `${Math.round(readyPos.y - 18)}px`;

// Loading: put one of every kind of object on screen (the gem, a wisp,
// particles and the ring) and draw every maze layout once, so every
// material is compiled and every geometry uploaded before play; a new maze
// or the first gem never stalls a frame. toTitle() resets them.
function warmUp() {
  bonus.spawn(1);
  bonus.draw();
  drones.reset(1);
  drones.eat(1);
  drones.draw(0, false);
  fx.burst(0, 0.5, 0, 0xffffff, 4, 3);
  fx.wave(0, 0, 0xffffff, 1);
  fx.update(0.01);
  for (let i = 0; i < MAZES.length; i++) {
    maze.load(i);
    if (i === 0) renderer.compile(scene, camera);
    renderer.render(scene, camera);
  }
  bonus.clear();
}

warmUp();
toTitle();

hh.run((dt) => {
  if (state === 'title') {
    titleTime += dt;
    updateRound(dt);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'game') {
    if (input.pressed('START')) pause();
    else {
      updateRound(dt);
      // Directions pressed while the round holds still are kept for the restart.
      if (state === 'game' && phase !== 'play') readWant(dt);
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'game';
      hud.message('');
    } else if (input.pressed('B')) {
      saveBest();
      toTitle();
    }
  } else if (state === 'over') {
    overTime += dt;
    // A short delay so a button mashed while dying does not restart at once.
    if (overTime > 0.6 && input.pressed('A')) start();
    else if (overTime > 0.6 && input.pressed('B')) toTitle();
  }

  // Everything below is drawing; while paused it stays frozen.
  const animDt = state === 'paused' ? 0 : dt;
  maze.update(animDt);
  player.draw(animDt);
  drones.draw(animDt, fright > 0 && fright < FLASH_TIME && Math.floor(fright * 5) % 2 === 0);
  bonus.draw();
  fx.update(animDt);

  // Fixed camera with a drop-in when a maze comes up, a slow sway on the
  // title screen and a shake on hits.
  shake = Math.max(0, shake - animDt);
  intro = Math.max(0, intro - animDt * 1.4);
  const back = 1 + intro * intro * intro * 0.25;
  const jitter = state === 'paused' ? 0 : shake * 0.8;
  const sway = state === 'title' ? Math.sin(titleTime * 0.35) * 0.3 : 0;
  camera.position.set(
    sway + (Math.random() - 0.5) * jitter,
    CAM_Y * back + (Math.random() - 0.5) * jitter,
    LOOK_Z + (CAM_Z - LOOK_Z) * back + (Math.random() - 0.5) * jitter,
  );
  camera.lookAt(sway, 0, LOOK_Z);

  renderer.render(scene, camera);
});
