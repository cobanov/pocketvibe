// Crate Pusher: a box-pushing warehouse puzzle. Push every crate onto a
// marked spot; the worker pushes one crate at a time and can never pull.
// D-pad walks and pushes, B undoes, X restarts, L / R switch levels, START
// pauses. Thirty levels, each with a par: the fewest moves that solve it.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, BUTTONS, DOWN, DX, DZ } from './shared.js';
import { LEVELS } from './levels.js';
import { createPuzzle } from './puzzle.js';
import { createWorld } from './world.js';
import { createCrates } from './crates.js';
import { createWorker } from './worker.js';
import { createFx } from './fx.js';
import { createView } from './view.js';
import { COLUMNS, createHud } from './hud.js';

const SAVE_KEY = 'crate-pusher';
const FREE_LEVELS = 3; // open from the start
const WALK_TIME = 0.11; // seconds per step
const PUSH_TIME = 0.14;
const UNDO_TIME = 0.08;
const CHAIN_AT = 0.7; // a buffered move may start once a step is this far along
const QUEUE = 8; // buffered presses
const HURRY = 0.6; // steps play this much faster while presses are piling up
const REPEAT_DELAY = 0.18; // hold the D-pad this long and the worker keeps going
const BLOCK_PAUSE = 0.22; // a held direction tries a blocked way again after this
const UNDO_DELAY = 0.35; // hold B this long and undo repeats
const UNDO_REPEAT = 0.075;
const MENU_DELAY = 0.32; // held D-pad on the level grid
const MENU_REPEAT = 0.09;
const CLEAR_DELAY = 1.1; // the party runs a moment before the panel
const STROLL_TIME = 0.2; // the worker's steps when he wanders on the title screen
const PLAY_RECT = [18, 60, 684, 386]; // the board fits here while playing: x, y, w, h
const TITLE_RECT = [30, 8, 660, 200]; // and here above the title menu

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 20, 40);
const camera = new THREE.PerspectiveCamera(36, hh.width / hh.height, 0.5, 60);

scene.add(new THREE.HemisphereLight(0xfff4e0, 0x4a5580, 1.45));
const sun = new THREE.DirectionalLight(0xffffff, 1.55);
sun.position.set(-5, 12, 7);
scene.add(sun);

const puzzle = createPuzzle();
const world = createWorld(scene);
const crates = createCrates(scene);
const worker = createWorker(scene);
const fx = createFx(scene);
const view = createView(camera, scene, hh.width, hh.height);
const hud = createHud(hh.hud, LEVELS.length);

const PARS = LEVELS.map((l) => l.par);
const best = LEVELS.map(() => 0);
let last = 0;
{
  const data = hh.load(SAVE_KEY, null);
  const list = Array.isArray(data?.best) ? data.best : [];
  for (let i = 0; i < LEVELS.length; i++) {
    const v = Math.floor(Number(list[i]));
    best[i] = v > 0 ? v : 0;
  }
  const l = Math.floor(Number(data?.last));
  last = l >= 0 && l < LEVELS.length ? l : 0;
}

function save() {
  hh.save(SAVE_KEY, { best, last });
}

function isOpen(i) {
  return i < FREE_LEVELS || best[i] > 0 || best[i - 1] > 0;
}

let state = 'title'; // title | play | paused | clear
let stateTime = 0;
let time = 0;
let selected = last;
let menuDir = -1; // the D-pad direction held on the level grid
let menuHeld = 0;
const queue = new Int8Array(QUEUE);
let queued = 0;
let holdDir = -1; // the D-pad direction held while playing
let holdTime = 0;
let blockedFor = 0;
let undoHeld = 0;
let undoing = false; // the last step was an undo: no sparkles for crates pulled back
let clearPending = false;
let clearShown = false;
let stuckCount = 0;
let shake = 0;
let strollWait = 1; // seconds until the title-screen worker takes his next step
let strollDir = DOWN;
const screenPos = new THREE.Vector3();

// Loads level i onto the board, crates dropping in, the camera framing it.
function loadBoard(i, rect, snap) {
  puzzle.load(i);
  world.build(puzzle);
  crates.load(puzzle, true);
  worker.place(puzzle.x(puzzle.player), puzzle.z(puzzle.player), DOWN);
  fx.clear();
  view.fit(puzzle.W, puzzle.H, rect[0], rect[1], rect[2], rect[3], snap);
  stuckCount = 0;
}

function selectLevel(i, snap) {
  selected = i;
  loadBoard(i, TITLE_RECT, snap);
  strollWait = 0.8;
  const name = LEVELS[i].name;
  let html;
  if (!isOpen(i)) {
    html = `${i + 1} · ${name} <small>· Locked: solve level ${i} first</small>`;
  } else if (best[i] > 0) {
    const star = best[i] <= PARS[i] ? ' ★' : '';
    html = `${i + 1} · ${name} <small>· Par ${PARS[i]} · Best</small> <span class="gold">${best[i]}${star}</span>`;
  } else {
    html = `${i + 1} · ${name} <small>· Par ${PARS[i]}</small>`;
  }
  hud.select(i, html);
}

function toTitle() {
  state = 'title';
  stateTime = 0;
  hud.showPlay(false);
  hud.message('');
  hud.banner('');
  hud.callout('');
  hud.tiles(best, PARS, isOpen);
  hud.showMenu(true);
  menuDir = -1;
  selectLevel(selected, false);
}

function startLevel(i) {
  state = 'play';
  stateTime = 0;
  selected = i;
  last = i;
  save();
  loadBoard(i, PLAY_RECT, false);
  queued = 0;
  holdDir = -1;
  undoHeld = 0;
  clearPending = false;
  hud.showMenu(false);
  hud.message('');
  hud.callout('');
  hud.showPlay(true);
  hud.level(i + 1, LEVELS[i].name, PARS[i], best[i]);
  hud.moves(0);
  hud.banner(`LEVEL ${i + 1}`, LEVELS[i].name);
}

function pause() {
  state = 'paused';
  hud.callout('');
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
}

// One step of the worker in direction d: a walk, a push or a bump.
function step(d) {
  const result = puzzle.move(d);
  if (result === 0) {
    const k = puzzle.crateAt[puzzle.player + puzzle.step(d)];
    worker.bumpInto(d, k >= 0);
    if (k >= 0) crates.jiggle(k);
    blockedFor = BLOCK_PAUSE;
    return;
  }
  undoing = false;
  const pushed = result === 2;
  const t = (pushed ? PUSH_TIME : WALK_TIME) * (queued > 0 ? HURRY : 1);
  worker.stepTo(puzzle.x(puzzle.player), puzzle.z(puzzle.player), d, t, pushed);
  if (pushed) {
    const k = puzzle.lastCrate;
    // Dust kicks up where the crate scrapes away.
    fx.dust(puzzle.x(puzzle.player), puzzle.z(puzzle.player), DX[d], DZ[d]);
    crates.slide(k, puzzle, t);
    const stuck = countStuck();
    if (stuck > stuckCount) {
      hud.callout('Stuck! B undo', 'warn');
      shake = Math.max(shake, 0.12);
    }
    stuckCount = stuck;
    clearPending = puzzle.solved();
  }
  hud.moves(puzzle.moves);
}

function undo() {
  queued = 0;
  const d = puzzle.undo();
  if (d < 0) {
    if (puzzle.undoRestart()) {
      crates.load(puzzle, false);
      worker.place(puzzle.x(puzzle.player), puzzle.z(puzzle.player), puzzle.history[puzzle.history.length - 1] & 3);
      hud.callout('Moves back', 'gold');
      hud.moves(puzzle.moves);
      stuckCount = countStuck();
      clearPending = false;
    }
    return;
  }
  undoing = true;
  const k = puzzle.lastCrate;
  // He backs up still facing the way he went, pulling the crate along.
  worker.stepTo(puzzle.x(puzzle.player), puzzle.z(puzzle.player), d, UNDO_TIME, k >= 0);
  if (k >= 0) crates.slide(k, puzzle, UNDO_TIME);
  stuckCount = countStuck();
  clearPending = false;
  hud.moves(puzzle.moves);
}

// A crate just settled on a spot: sparkles and a "2/4" over it.
function crateHome(i) {
  const x = crates.x(i);
  const z = crates.z(i);
  fx.sparkle(x, z);
  screenPos.set(x, 1.1, z).project(camera);
  const all = puzzle.solved();
  hud.popup(`${puzzle.onGoal}/${crates.count}`, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, all);
}

function countStuck() {
  let n = 0;
  for (let i = 0; i < puzzle.stuck.length; i++) if (puzzle.stuck[i]) n++;
  return n;
}

function restart() {
  if (puzzle.moves === 0) return;
  for (let i = 0; i < crates.count; i++) fx.poof(crates.x(i), crates.z(i));
  puzzle.restart();
  crates.load(puzzle, true);
  worker.place(puzzle.x(puzzle.player), puzzle.z(puzzle.player), DOWN);
  queued = 0;
  clearPending = false;
  stuckCount = 0;
  hud.moves(0);
  hud.callout('Restart · B brings the moves back');
}

// L / R: the nearest open level before or after this one.
function switchLevel(dir) {
  let i = puzzle.index + dir;
  while (i >= 0 && i < LEVELS.length && !isOpen(i)) i += dir;
  if (i < 0) {
    hud.callout('This is the first level');
  } else if (i >= LEVELS.length) {
    hud.callout(puzzle.index + 1 < LEVELS.length ? `Solve level ${puzzle.index + 1} to open the next` : 'This is the last level', 'warn');
  } else {
    startLevel(i);
  }
}

function levelClear() {
  state = 'clear';
  stateTime = 0;
  clearShown = false;
  queued = 0;
  crates.party();
  worker.celebrate();
  shake = 0.18;
  hud.callout('');
  for (let i = 0; i < crates.count; i++) fx.confetti(crates.x(i), crates.z(i), 10, 3);
  fx.confetti(0, 0, 24, 5);
}

function showClear() {
  clearShown = true;
  const i = puzzle.index;
  const moves = puzzle.moves;
  const par = PARS[i];
  const opened = i + 1 < LEVELS.length && !isOpen(i + 1);
  const record = best[i] === 0 || moves < best[i];
  if (record) best[i] = moves;
  save();
  hud.level(i + 1, LEVELS[i].name, par, best[i]);
  const perfect = moves <= par;
  const lastLevel = i + 1 >= LEVELS.length;
  hud.message(
    `<div class="title">${perfect ? 'PERFECT!' : 'LEVEL CLEAR!'}</div>` +
      `<div>Moves ${moves} · Par ${par}${perfect ? ' <span class="gold">★</span>' : ''}</div>` +
      `<div class="small">${record ? '<span class="gold">NEW BEST!</span>' : `Best ${best[i]}${best[i] <= par ? ' ★' : ''}`}` +
      `${perfect ? '' : ` · par is ${par} moves`}</div>` +
      (opened ? `<div class="gold">Level ${i + 2} unlocked!</div>` : '') +
      (lastLevel ? '<div class="gold">Every level done!</div>' : '') +
      `<div>${lastLevel ? 'A or B level select' : 'A next level · B level select'}</div>` +
      `<div class="small">X replay</div>`,
  );
}

// Behind the menu the worker strolls about the preview, never touching a
// crate, so the level stays as it will be played.
function stroll(dt) {
  strollWait -= dt;
  if (strollWait > 0 || worker.moving()) return;
  let d = strollDir;
  if (!canStroll(d) || Math.random() < 0.3) {
    d = Math.floor(Math.random() * 4);
    for (let k = 0; k < 4 && !canStroll(d); k++) d = (d + 1) % 4;
  }
  strollWait = Math.random() < 0.15 ? 1 + Math.random() * 1.5 : 0;
  if (!canStroll(d)) return;
  strollDir = d;
  puzzle.player += puzzle.step(d); // no history: the level reloads before it is played
  worker.stepTo(puzzle.x(puzzle.player), puzzle.z(puzzle.player), d, STROLL_TIME, false);
}

function canStroll(d) {
  const to = puzzle.player + puzzle.step(d);
  return puzzle.floor[to] === 1 && puzzle.crateAt[to] < 0;
}

function updateTitle(dt) {
  stroll(dt);
  // D-pad walks the grid; held, it repeats.
  let d = -1;
  for (let k = 0; k < 4; k++) if (input.pressed(BUTTONS[k])) d = k;
  if (d >= 0) {
    menuDir = d;
    menuHeld = 0;
  } else if (menuDir >= 0 && input.down(BUTTONS[menuDir])) {
    menuHeld += dt;
    if (menuHeld > MENU_DELAY) {
      menuHeld -= MENU_REPEAT;
      d = menuDir;
    }
  } else {
    menuDir = -1;
  }
  if (d >= 0) {
    let i = selected + DX[d] + DZ[d] * COLUMNS;
    if (i < 0 || i >= LEVELS.length) i = selected;
    if (i !== selected) selectLevel(i, false);
  }

  if (input.pressed('A') || input.pressed('START')) {
    if (isOpen(selected)) {
      startLevel(selected);
    } else {
      hud.deny(selected);
      hud.callout(`Solve level ${selected} to unlock`, 'warn');
    }
  }
}

function updatePlay(dt) {
  if (input.pressed('START')) {
    pause();
    return;
  }
  if (input.pressed('X')) restart();
  if (input.pressed('L')) switchLevel(-1);
  if (input.pressed('R')) switchLevel(1);
  if (state !== 'play') return;

  if (input.pressed('B')) {
    undoHeld = 0;
    undo();
  } else if (input.down('B')) {
    undoHeld += dt;
    if (undoHeld > UNDO_DELAY) {
      undoHeld -= UNDO_REPEAT;
      undo();
    }
  }

  // Every press is buffered, so quick taps are never lost.
  for (let k = 0; k < 4; k++) {
    if (!input.pressed(BUTTONS[k])) continue;
    if (queued < QUEUE) queue[queued++] = k;
    holdDir = k;
    holdTime = 0;
  }
  if (holdDir >= 0 && !input.down(BUTTONS[holdDir])) {
    // Let go: carry on with another direction still held, if any.
    holdDir = -1;
    for (let k = 0; k < 4; k++) {
      if (input.down(BUTTONS[k])) {
        holdDir = k;
        holdTime = REPEAT_DELAY;
      }
    }
  }
  if (holdDir >= 0) holdTime += dt;
  blockedFor = Math.max(0, blockedFor - dt);

  if (worker.t >= CHAIN_AT && !clearPending) {
    if (queued > 0) {
      const d = queue[0];
      for (let k = 1; k < queued; k++) queue[k - 1] = queue[k];
      queued--;
      step(d);
    } else if (!worker.moving() && holdDir >= 0 && holdTime >= REPEAT_DELAY && blockedFor <= 0) {
      step(holdDir);
    }
  }

  // The level is done once the last crate has settled on its spot.
  if (clearPending && !worker.moving()) levelClear();
}

function updateClear() {
  if (!clearShown && stateTime > CLEAR_DELAY) showClear();
  if (!clearShown) return;
  const i = puzzle.index;
  if (input.pressed('A')) {
    if (i + 1 < LEVELS.length) startLevel(i + 1);
    else toTitle();
  } else if (input.pressed('B')) {
    toTitle();
  } else if (input.pressed('X')) {
    startLevel(i);
  }
}

toTitle();
view.fit(puzzle.W, puzzle.H, TITLE_RECT[0], TITLE_RECT[1], TITLE_RECT[2], TITLE_RECT[3], true);

hh.run((dt) => {
  if (state !== 'paused') {
    stateTime += dt;
    time += dt;
  }

  if (state === 'title') {
    updateTitle(dt);
  } else if (state === 'play') {
    updatePlay(dt);
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'clear') {
    updateClear();
  }

  // Drawing; while paused everything holds still.
  const animDt = state === 'paused' ? 0 : dt;
  worker.update(animDt);
  crates.update(animDt, puzzle, time);
  for (let i = 0; i < crates.count; i++) {
    if (crates.landed(i) && !undoing && puzzle.goal[puzzle.crates[i]] && state !== 'title') crateHome(i);
  }
  world.update(puzzle, time);
  fx.update(animDt);

  shake = Math.max(0, shake - animDt);
  const jitter = state === 'paused' ? 0 : shake * 0.5;
  const sway = state === 'title' ? Math.sin(time * 0.35) * 0.14 : 0;
  view.update(animDt, sway, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter);

  renderer.render(scene, camera);
});
