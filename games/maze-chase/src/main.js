// Maze Chase: eat every dot in a neon maze while four drones hunt you down.
// Power cores turn the tables for a few seconds: frightened drones can be
// eaten for 200, 400, 800 and 1600 points. The D-pad moves (taps are kept
// until the next junction that allows the turn), START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { MAZES, START_X, START_Y, W } from './mazes.js';
import { BG, BUTTON, DX, DY, NONE, worldX, worldZ } from './shared.js';
import { createMaze } from './maze.js';
import { createPlayer } from './player.js';
import { COLORS, COUNT, ROAMING, WISP, createDrones } from './drones.js';
import { createBonus } from './bonus.js';
import { createFx } from './fx.js';
import { createAutopilot } from './autopilot.js';
import { createCamera } from './camera.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const SAVE_KEY = 'maze-chase';
const START_LIVES = 3;
const MAX_LIVES = 5;
const EXTRA_LIFE_AT = 10000;
const DOT_POINTS = 10;
const CORE_POINTS = 50;
const DRONE_POINTS = [200, 400, 800, 1600];
const BUFFER = 0.75; // a tapped direction waits this long for a junction

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
const ZOOM_IN_AT = 0.75; // s into a new level's READY: the close view swoops in
const EAT_PAUSE = 0.55; // the world holds still for a moment when a drone is eaten
const CLEAR_TIME = 2.8;
const DEMO_LEVEL = 2;

// The drone eaten sound climbs C minor (in semitones) with every drone eaten
// during one fright.
const CHAIN_STEPS = [0, 3, 5, 7];

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const sound = createSound(hh, {
  sfx: [
    'dot', 'dot2', 'core', 'fright', 'home', 'eat', 'revive', 'death', 'clear', 'life', 'ready',
    'retry', 'gem_on', 'gem', 'tunnel', 'over', 'record', 'move', 'select', 'back', 'pause', 'start',
  ],
  music: 'theme',
});
const frightLoop = sound.loop('fright');
const homeLoop = sound.loop('home');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 50, 72);

// Tilted overhead view: the whole maze under the HUD row, or the close view
// that follows the robot (see camera.js).
const view = createCamera(hh);
const { camera } = view;

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
let newLevel = false; // this READY starts a level (not a retry)
let demo = true;
let demoMaze = 0;
let level = 1;
let score = 0;
let lives = 0;
let extraGiven = false;
let dotsEaten = 0;
let want = NONE;
let wantAlt = NONE; // the other half of a diagonal on the D-pad
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
let menuSel = 0;
let startAt = 1; // the level a new game starts on (title menu)
let dotFlip = false; // the two dot sounds take turns
let lastX = START_X; // to hear the robot pass through a side tunnel
let revivedSeen = 0;
let dronesEaten = 0; // this game, for the game over panel
let bonusEaten = 0;
let passedBest = false; // the NEW BEST callout shows once a game
const saved = hh.load(SAVE_KEY, null);
let best = saved?.best || 0;
let furthest = saved?.level || 1; // highest level number reached
let close = saved?.view !== 'full'; // the close view follows the robot
let bestAtStart = best;

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

// A small random pitch change, so repeated sounds do not machine-gun.
function wobble() {
  return 0.96 + Math.random() * 0.08;
}

// Stereo position from a column of the maze.
function pan(cx) {
  return (worldX(cx) / (W / 2)) * 0.5;
}

function sfx(name, options) {
  if (!demo) sound.play(name, options);
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
  wantAlt = NONE;
  wantHold = 0;
  fright = 0;
  chain = 0;
  phaseIndex = 0;
  phaseClock = 0;
  ctx.chase = false;
  lastX = player.x;
}

function loadMaze(index) {
  maze.load(index);
  dotsEaten = 0;
  fx.clear();
  resetRound();
  intro = 1;
  view.snap(0, worldX(START_X), worldZ(START_Y));
}

// delay: when the ready tune starts (later after the start sound).
function startLevel(n, delay = 0.1) {
  level = n;
  setupLevel(n);
  loadMaze(n - 1);
  setPhase('ready');
  readyTime = READY_TIME;
  newLevel = true;
  hud.level(n);
  const index = (n - 1) % MAZES.length;
  hud.levelCard(n, maze.name, index, MAZES.length, Math.floor((n - 1) / MAZES.length));
  hud.ready('READY!');
  // The ready tune plays over quieter music.
  sound.duck(true);
  sound.play('ready', { delay });
  if (n > furthest) {
    furthest = n;
    save();
  }
}

// The title screen plays the game by itself, a new maze after every round.
function nextDemo() {
  demoMaze = (demoMaze + 1) % MAZES.length;
  setupLevel(DEMO_LEVEL);
  loadMaze(demoMaze);
  setPhase('ready');
  readyTime = DEMO_READY;
  newLevel = false;
}

function save() {
  hh.save(SAVE_KEY, { best, level: furthest, view: close ? 'close' : 'full' });
}

// Keeps a new best score, also when the game ends early.
function keepBest() {
  if (score <= best) return false;
  best = score;
  save();
  return true;
}

// ---------------------------------------------------------------- menus

const ON_OFF = (on) => (on ? 'ON' : 'OFF');
const KEY = (button) => `<span class="key">${button}</span>`;

function menuRows(items, labels) {
  let html = '<div class="menu">';
  for (let i = 0; i < items.length; i++) {
    html += `<div class="item${i === menuSel ? ' sel' : ''}">${labels(items[i])}</div>`;
  }
  return html + '</div>';
}

// The levels a game may start on: any level of the first round reached.
function startLevels() {
  return Math.min(furthest, MAZES.length);
}

// Title menu: start a game (on any level already reached), the camera and
// the sound options.
function titleItems() {
  return startLevels() > 1 ? ['play', 'level', 'view', 'sound', 'music'] : ['play', 'view', 'sound', 'music'];
}

function titleLabel(item) {
  if (item === 'play') return 'PLAY';
  if (item === 'level') {
    return `START AT LEVEL <span class="arrows">◀</span> ${startAt} <span class="arrows">▶</span> <small>${MAZES[startAt - 1].name}</small>`;
  }
  if (item === 'view') return `VIEW <b>${close ? 'CLOSE' : 'FULL'}</b>`;
  if (item === 'sound') return `SOUND <b>${ON_OFF(sound.sfxOn)}</b>`;
  return `MUSIC <b>${ON_OFF(sound.musicOn)}</b>`;
}

function showTitle() {
  hud.message(
    `<div class="title">MAZE CHASE</div>` +
      menuRows(titleItems(), titleLabel) +
      (best > 0 ? `<div class="small best">Best <b>${best}</b> · Level ${furthest} reached</div>` : '') +
      `<div class="small keys">D-pad move · ${KEY('A')} select · ${KEY('START')} pause</div>`,
    'title-panel',
  );
}

function pauseItems() {
  return ['resume', 'sound', 'music', 'quit'];
}

function pauseLabel(item) {
  if (item === 'resume') return 'RESUME';
  if (item === 'sound') return `SOUND <b>${ON_OFF(sound.sfxOn)}</b>`;
  if (item === 'music') return `MUSIC <b>${ON_OFF(sound.musicOn)}</b>`;
  return 'QUIT TO TITLE';
}

function showPause() {
  hud.message(
    `<div class="title">PAUSED</div>` +
      menuRows(pauseItems(), pauseLabel) +
      `<div class="small keys">${KEY('A')} select · ${KEY('B')} or ${KEY('START')} resume</div>`,
  );
}

// Up / down moves through the items; returns the item A chose, 'redraw', or
// null. Left / right flip a switch or change the start level.
function menuInput(items) {
  const dy = input.pressed('DOWN') ? 1 : input.pressed('UP') ? -1 : 0;
  if (dy) {
    menuSel = (menuSel + dy + items.length) % items.length;
    sound.play('move');
    return 'redraw';
  }
  const item = items[menuSel];
  const dx = input.pressed('RIGHT') ? 1 : input.pressed('LEFT') ? -1 : 0;
  if (dx && item === 'level') {
    const max = startLevels();
    startAt = ((startAt - 1 + dx + max) % max) + 1;
    sound.play('move', { rate: 1 + (startAt - 1) * 0.03 });
    return 'redraw';
  }
  if ((dx && (item === 'sound' || item === 'music' || item === 'view')) || input.pressed('A')) return item;
  return null;
}

function toggle(item) {
  if (item === 'sound') sound.setSfx(!sound.sfxOn);
  else if (item === 'music') sound.setMusic(!sound.musicOn);
  else {
    close = !close;
    save();
  }
  // Heard only when effects are (still) on.
  sound.play('select');
}

// ---------------------------------------------------------------- states

function toTitle() {
  state = 'title';
  demo = true;
  menuSel = 0;
  startAt = Math.min(startAt, startLevels());
  hud.showStats(false);
  hud.banner('');
  hud.callout('');
  hud.ready('');
  hideMarkers();
  maze.flash(0);
  frightLoop.stop();
  homeLoop.stop();
  nextDemo();
  sound.duck(false);
  sound.startMusic();
  showTitle();
}

function start() {
  state = 'game';
  demo = false;
  score = 0;
  lives = START_LIVES;
  extraGiven = false;
  dronesEaten = 0;
  bonusEaten = 0;
  passedBest = false;
  bestAtStart = best;
  hud.message('');
  hud.callout('');
  hud.showStats(true);
  hud.score(0);
  hud.lives(lives);
  maze.flash(0);
  sound.startMusic();
  sound.play('start');
  startLevel(startAt, 0.45);
}

function pause() {
  state = 'paused';
  menuSel = 0;
  frightLoop.stop();
  homeLoop.stop();
  sound.play('pause');
  sound.duck(true);
  showPause();
}

function resume() {
  state = 'game';
  hud.message('');
  // The music stays down while a round holds still (ready, dying, clear).
  sound.duck(phase !== 'play' && phase !== 'eat');
}

function gameOver() {
  state = 'over';
  overTime = 0;
  const record = keepBest();
  hud.ready('');
  hideMarkers();
  frightLoop.stop();
  homeLoop.stop();
  sound.duck(true);
  sound.play(record ? 'record' : 'over');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big-score">${score}</div>` +
      `<div class="stats"><span>Level <b>${level}</b></span><span>Drones <b>${dronesEaten}</b></span>` +
      `<span>Bonus <b>${bonusEaten}</b></span></div>` +
      `<div class="small best">Best <b>${best}</b> · Level ${furthest} reached</div>` +
      `<div class="keys">${KEY('A')} play again · ${KEY('B')} title</div>`,
    record ? 'record' : '',
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
    sound.play('life', { delay: 0.05 });
  } else if (!passedBest && bestAtStart > 0 && score > bestAtStart) {
    passedBest = true;
    hud.callout('NEW BEST!', '#8ff0ff');
    sound.play('record', { volume: 0.5, delay: 0.05 });
  }
  hud.score(score);
}

// The D-pad direction to steer towards. A tap is remembered for a moment, so
// pressing before a junction turns there. On a diagonal the most recent
// press leads and the other held direction is kept in wantAlt.
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
  wantAlt = NONE;
  if (want !== NONE) {
    for (let d = 0; d < 4; d++) {
      if ((d & 1) !== (want & 1) && input.down(BUTTON[d])) wantAlt = d;
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
    dotFlip = !dotFlip;
    sfx(dotFlip ? 'dot' : 'dot2', { volume: 0.8, rate: 0.985 + Math.random() * 0.03, pan: pan(player.x) });
  } else {
    addScore(CORE_POINTS);
    player.munch(1);
    fright = frightTime;
    chain = 0;
    drones.frighten();
    fx.wave(x, z, 0xffb347, 1.6);
    fx.burst(x, 0.45, z, 0xffd27a, 14, 4.5);
    shake = Math.max(shake, 0.14);
    sfx('core', { rate: wobble(), pan: pan(player.x) });
  }
  // The bonus comes out when 30% and again when 70% of the maze is eaten.
  const total = maze.dotsTotal;
  if (dotsEaten === Math.floor(total * 0.3) || dotsEaten === Math.floor(total * 0.7)) {
    bonus.spawn(demo ? DEMO_LEVEL : level);
    sfx('gem_on', { delay: 0.05 });
  }
  if (maze.dotsLeft === 0) {
    setPhase('clear');
    bonus.clear();
    drones.hidden = true;
    fright = 0;
    hud.callout('');
    if (!demo) {
      sound.duck(true);
      sound.play('clear', { delay: 0.1 });
      hud.banner('CLEAR!', maze.name);
    }
  }
}

function eatDrone(i) {
  const d = drones.list[i];
  const points = DRONE_POINTS[Math.min(chain, DRONE_POINTS.length - 1)];
  sfx('eat', { rate: 2 ** (CHAIN_STEPS[Math.min(chain, CHAIN_STEPS.length - 1)] / 12), pan: pan(d.x) });
  chain++;
  addScore(points);
  if (!demo) dronesEaten++;
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
  if (!demo) bonusEaten++;
  fx.burst(x, 0.6, z, bonus.color, 16, 5);
  fx.burst(x, 0.6, z, 0xffffff, 6, 4);
  fx.wave(x, z, bonus.color, 1.3);
  if (!demo) popupAt(`${bonus.points}`, x, 1.1, z, '#ffe27a');
  sfx('gem', { rate: wobble(), pan: pan(bonus.cx) });
  bonus.on = false;
  player.munch(1);
  shake = Math.max(shake, 0.1);
}

function caught() {
  setPhase('dying');
  shake = 0.35;
  if (!demo) {
    hud.hurt();
    sound.duck(true);
    sound.play('death');
  }
}

function updatePlay(dt) {
  const auto = demo || (import.meta.env.DEV && window.__mc?.autopilot);
  const steer = auto ? autopilot.steer(dt, player) : readWant(dt);
  player.update(dt, steer, playerSpeed * (fright > 0 ? 1.06 : 1), auto ? NONE : wantAlt);
  // A jump of more than half the maze is the side tunnel.
  if (Math.abs(player.x - lastX) > W / 2) sfx('tunnel', { volume: 0.7, rate: wobble(), pan: player.x < W / 2 ? -0.5 : 0.5 });
  lastX = player.x;
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
  if (drones.revived !== revivedSeen) {
    revivedSeen = drones.revived;
    sfx('revive', { volume: 0.7, rate: wobble() });
  }

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
      if (!demo) sound.duck(false);
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
  newLevel = false;
  hud.ready('READY!');
  sound.play('retry', { delay: 0.2 });
}

// The sounds that run while something lasts: the frightened drones' warble
// (faster when the fright runs out) and the wisps flying home.
function updateLoops() {
  const live = !demo && state === 'game' && phase === 'play';
  if (live && fright > 0 && drones.anyFrightened()) frightLoop.set(0.55, fright < FLASH_TIME ? 1.12 : 1);
  else frightLoop.stop();
  if (live && drones.anyWisp()) homeLoop.set(0.4);
  else homeLoop.stop();
}

function hideMarkers() {
  for (let i = 0; i < COUNT; i++) hud.marker(i, false);
}

// Arrows at the screen's edges for roaming drones the close view leaves out.
const MARGIN = 18;
const TOP_EDGE = 58; // under the score row
function updateMarkers() {
  const live = state === 'game' && (phase === 'play' || phase === 'eat') && view.zoom > 0.9;
  for (let i = 0; i < COUNT; i++) {
    const d = drones.list[i];
    if (!live || d.mode !== ROAMING) {
      hud.marker(i, false);
      continue;
    }
    const p = project(worldX(d.x), 0.5, worldZ(d.y));
    if (p.x > 0 && p.x < hh.width && p.y > TOP_EDGE - 20 && p.y < hh.height) {
      hud.marker(i, false);
      continue;
    }
    const x = Math.max(MARGIN, Math.min(hh.width - MARGIN, p.x));
    const y = Math.max(TOP_EDGE, Math.min(hh.height - MARGIN, p.y));
    const angle = (Math.atan2(p.y - y, p.x - x) * 180) / Math.PI;
    hud.marker(i, true, x, y, angle, d.fright);
  }
}

// Where the camera wants to be: the full view on the title screen, at the
// start of a level and on a cleared maze, else the close view (if chosen).
function viewTarget() {
  if (!close || state === 'title' || state === 'over') return 0;
  if (phase === 'clear') return phaseTime > 0.3 ? 0 : 1;
  if (phase === 'ready' && newLevel && phaseTime < ZOOM_IN_AT) return 0;
  return 1;
}

// ---------------------------------------------------------------- input per state

function updateTitle() {
  if (input.pressed('START')) {
    start();
    return;
  }
  const item = menuInput(titleItems());
  if (item === 'play' || item === 'level') start();
  else if (item === 'sound' || item === 'music' || item === 'view') {
    toggle(item);
    showTitle();
  } else if (item === 'redraw') showTitle();
}

function updatePaused() {
  if (input.pressed('START') || input.pressed('B')) {
    sound.play('back');
    resume();
    return;
  }
  const item = menuInput(pauseItems());
  if (item === 'resume') {
    sound.play('select');
    resume();
  } else if (item === 'quit') {
    sound.play('back');
    keepBest();
    toTitle();
  } else if (item === 'sound' || item === 'music') {
    toggle(item);
    showPause();
  } else if (item === 'redraw') showPause();
}

// Loading: put one of every kind of object on screen (each bonus shape, a
// wisp, particles and the ring) and draw every maze layout once, so every
// material is compiled and every geometry and floor texture uploaded before
// play; a new maze or the first bonus never stalls a frame. toTitle() resets
// them.
function warmUp() {
  view.update(0, 0, 0, 0, 0, 0, 1, 0, 0);
  drones.reset(1);
  drones.eat(1);
  drones.draw(0, false);
  fx.burst(0, 0.5, 0, 0xffffff, 4, 3);
  fx.wave(0, 0, 0xffffff, 1);
  fx.update(0.01);
  for (let i = 0; i < Math.max(MAZES.length, bonus.shapes); i++) {
    maze.load(i % MAZES.length);
    bonus.spawn(1 + (i % bonus.shapes));
    bonus.age = 1;
    bonus.draw();
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
    updateTitle();
  } else if (state === 'game') {
    if (input.pressed('START')) pause();
    else {
      updateRound(dt);
      // Directions pressed while the round holds still are kept for the restart.
      if (state === 'game' && phase !== 'play') readWant(dt);
    }
  } else if (state === 'paused') {
    updatePaused();
  } else if (state === 'over') {
    overTime += dt;
    // A short delay so a button mashed while dying does not restart at once.
    if (overTime > 0.6 && input.pressed('A')) start();
    else if (overTime > 0.6 && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }
  updateLoops();

  // Everything below is drawing; while paused it stays frozen.
  const animDt = state === 'paused' ? 0 : dt;
  maze.update(animDt);
  player.draw(animDt);
  drones.draw(animDt, fright > 0 && fright < FLASH_TIME && Math.floor(fright * 5) % 2 === 0);
  bonus.draw();
  fx.update(animDt);

  // The camera: a drop-in when a maze comes up, a slow sway on the title
  // screen, a shake on hits, and the close view following the robot.
  shake = Math.max(0, shake - animDt);
  intro = Math.max(0, intro - animDt * 1.4);
  const back = 1 + intro * intro * intro * 0.25;
  const jitter = state === 'paused' ? 0 : shake * 0.8;
  const sway = state === 'title' ? Math.sin(titleTime * 0.35) * 0.3 : 0;
  const moving = player.alive && player.moving && phase === 'play';
  view.update(
    animDt,
    viewTarget(),
    worldX(player.x),
    worldZ(player.y),
    moving ? DX[player.dir] : 0,
    moving ? DY[player.dir] : 0,
    back,
    jitter,
    sway,
  );

  // "READY!" sits two rows above the robot's start.
  if (phase === 'ready' && state !== 'title') hud.ready('READY!', project(worldX(START_X), 0.5, worldZ(START_Y - 2)).y - 18);
  updateMarkers();

  renderer.render(scene, camera);
});

if (import.meta.env.DEV) {
  // For headless checks: the scene, the state, an autopilot that plays for
  // the player, and a shortcut that eats all but n dots.
  window.__mc = {
    THREE, scene, camera, renderer, maze, player, drones, bonus, sound, frightLoop, homeLoop, addScore, autopilot: false,
    get state() { return state; }, get phase() { return phase; }, get level() { return level; },
    get score() { return score; }, get lives() { return lives; }, get zoom() { return view.zoom; },
    eatAllBut(n) {
      const cells = new Int16Array(W * 19);
      const count = maze.forEachDot(cells);
      for (let i = 0; i < count - n; i++) {
        const c = cells[i];
        if (maze.eat(c % W, (c - (c % W)) / W) > 0) dotsEaten++;
      }
    },
  };
}
