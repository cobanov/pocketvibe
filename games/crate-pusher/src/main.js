// Crate Pusher: a box-pushing warehouse puzzle. Push every crate onto a
// marked spot; the worker pushes one crate at a time and can never pull.
// D-pad walks and pushes, B undoes, X restarts, L / R switch levels, START
// pauses. Forty-five levels, each with a par: the fewest moves that solve it.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, BUTTONS, DOWN, DX, DZ } from './shared.js';
import { LEVELS } from './levels.js';
import { createPuzzle } from './puzzle.js';
import { createWorld } from './world.js';
import { createCrates } from './crates.js';
import { createWorker } from './worker.js';
import { createFx } from './fx.js';
import { SWAY, createView } from './view.js';
import { COLUMNS, TILE_ROW, createHud } from './hud.js';
import { createSound } from './sound.js';

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
const SPOT_SCALE = [0, 2, 4, 7, 9, 12, 14, 16]; // semitones up B-flat major as crates find spots

const SFX = [
  'step_a', 'step_b', 'push', 'bump', 'block', 'home', 'off', 'stuck', 'undo', 'restart', 'restore',
  'drop', 'start', 'clear', 'perfect', 'best', 'unlock', 'move', 'select', 'back', 'pause', 'deny',
];

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;
const sound = createSound(hh, { sfx: SFX, music: 'theme' });

// The title menu shows three rows of level tiles, more on taller screens.
const hud = createHud(hh.hud, LEVELS.length, 3 + Math.max(0, Math.floor((hh.height - 480) / TILE_ROW)));
const MENU_H = 272 + (hud.rows - 3) * TILE_ROW; // the title menu's height from the bottom of the screen, in px
hh.hud.style.setProperty('--menu-h', `${MENU_H}px`);

// The board fits here while playing (x, y, w, h in px): under the bar and
// above the hint. On the title screen it fits above the menu.
const PLAY_RECT = [18, 60, hh.width - 36, hh.height - 94];
const TITLE_RECT = [30, 8, hh.width - 60, hh.height - MENU_H - 8];

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 20, 40);
const camera = new THREE.PerspectiveCamera(36, hh.aspect, 0.5, 60);
// view.js frames every board inside a rectangle of the screen itself, so the
// camera keeps its designed fov on every shape (minAspect: the screen's own).
hh.fitCamera(camera, { minAspect: hh.aspect });

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

// Progress is saved per level id, not per place in the list, so levels can
// be added anywhere without mixing up anyone's best moves.
const PARS = LEVELS.map((l) => l.par);
const SLOTS = LEVELS.map((l) => l.id - 1);
const best = LEVELS.map(() => 0);
let last = 0;
{
  const data = hh.load(SAVE_KEY, null);
  const list = Array.isArray(data?.best) ? data.best : [];
  for (let i = 0; i < LEVELS.length; i++) {
    const v = Math.floor(Number(list[SLOTS[i]]));
    best[i] = v > 0 ? v : 0;
  }
  last = Math.max(0, SLOTS.indexOf(Math.floor(Number(data?.last))));
}

function save() {
  const list = [];
  for (let s = 0; s <= Math.max(...SLOTS); s++) list.push(0);
  for (let i = 0; i < LEVELS.length; i++) list[SLOTS[i]] = best[i];
  hh.save(SAVE_KEY, { best: list, last: SLOTS[last] });
}

function isOpen(i) {
  return i < FREE_LEVELS || best[i] > 0 || best[i - 1] > 0;
}

// Menus: the pause menu while playing and the options from the title.
const PAUSE_ITEMS = ['resume', 'sfx', 'music', 'quit'];
const OPTION_ITEMS = ['sfx', 'music', 'back'];

let state = 'title'; // title | options | play | paused | clear
let stateTime = 0;
let time = 0;
let selected = last; // a level, or LEVELS.length for the Options tile
let lastColumn = 0; // the grid column the cursor came from, for leaving the Options tile
let menuDir = -1; // the D-pad direction held on the level grid
let menuHeld = 0;
let menuSel = 0;
const queue = new Int8Array(QUEUE);
let queued = 0;
let holdDir = -1; // the D-pad direction held while playing
let holdTime = 0;
let holdBumped = false; // the held direction has already bumped into something
let blockedFor = 0;
let undoHeld = 0;
let undoRun = 0; // undos in a row while B is held, for a rising rewind
let clearPending = false;
let clearShown = false;
let record = false; // the level just cleared beat the best (or was a first clear)
let beaten = false; // ... and there was a best to beat
let opened = false; // ... and it opened the next level
let stuckCount = 0;
let shake = 0;
let footstep = 0;
let strollWait = 1; // seconds until the title-screen worker takes his next step
let strollDir = DOWN;
const fresh = new Uint8Array(8); // per crate: its slide is a push that may land it on a spot
const screenPos = new THREE.Vector3();

// Loads level i onto the board, crates dropping in, the camera framing it.
function loadBoard(i, rect, snap) {
  puzzle.load(i);
  view.fit(puzzle.W, puzzle.H, rect[0], rect[1], rect[2], rect[3], snap);
  world.build(puzzle, view);
  crates.load(puzzle, true);
  worker.place(puzzle.x(puzzle.player), puzzle.z(puzzle.player), DOWN);
  fx.clear();
  fresh.fill(0);
  stuckCount = 0;
}

function selectLevel(i, snap) {
  selected = i;
  if (i >= LEVELS.length) {
    hud.select(i, 'Sound and music on or off', 'Press A for options');
    return;
  }
  lastColumn = i % COLUMNS;
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
  hud.select(i, html, isOpen(i) ? 'Press A to play' : 'Locked');
}

function toTitle(snap = false) {
  state = 'title';
  stateTime = 0;
  hud.showPlay(false);
  hud.message('');
  hud.banner('');
  hud.callout('');
  hud.tiles(best, PARS, isOpen);
  hud.showMenu(true);
  menuDir = -1;
  sound.duck(false);
  // Back from a level, the cursor shows that level; the Options tile stays put.
  if (selected < LEVELS.length) selectLevel(selected, snap);
  else selectLevel(last, snap);
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
  sound.duck(false);
  sound.play('start');
}

function itemLabel(item) {
  if (item === 'sfx') return `Sound: ${sound.sfxOn ? 'On' : 'Off'}`;
  if (item === 'music') return `Music: ${sound.musicOn ? 'On' : 'Off'}`;
  return { resume: 'Resume', quit: 'Level select', back: 'Back' }[item];
}

function showPause() {
  hud.menu('<div class="title">PAUSED</div>', PAUSE_ITEMS.map(itemLabel), menuSel, '<div class="small">D-pad choose · A select · B resume</div>');
}

function showOptions() {
  hud.menu('<div class="title">OPTIONS</div>', OPTION_ITEMS.map(itemLabel), menuSel, '<div class="small">D-pad choose · A select · B back</div>');
}

// The D-pad moves through a panel's items. Returns the item chosen with A,
// 'back' for B, or null.
function menuInput(items, show) {
  const n = items.length;
  if (input.pressed('UP') || input.pressed('DOWN')) {
    menuSel = (menuSel + (input.pressed('UP') ? n - 1 : 1)) % n;
    sound.play('move');
    show();
    return null;
  }
  if (input.pressed('A')) return items[menuSel];
  if (input.pressed('B')) return 'back';
  return null;
}

// Sound effects or music on or off; returns true if item was one of them.
function toggle(item, show) {
  if (item === 'sfx') sound.setSfx(!sound.sfxOn);
  else if (item === 'music') sound.setMusic(!sound.musicOn);
  else return false;
  sound.play('select');
  show();
  return true;
}

function pause() {
  state = 'paused';
  menuSel = 0;
  hud.callout('');
  showPause();
  sound.play('pause');
  sound.duck(true);
}

function resume() {
  state = 'play';
  hud.message('');
  sound.play('back');
  sound.duck(false);
}

// An effect with its pitch varied a little, so repeats do not sound canned.
function vary(name, volume = 1, spread = 0.04, rate = 1) {
  sound.play(name, { volume, rate: rate * (1 + (Math.random() * 2 - 1) * spread) });
}

// One step of the worker in direction d: a walk, a push or a bump. held is
// true for steps repeated by holding the D-pad.
function step(d, held) {
  const result = puzzle.move(d);
  if (result === 0) {
    const k = puzzle.crateAt[puzzle.player + puzzle.step(d)];
    worker.bumpInto(d, k >= 0);
    if (k >= 0) crates.jiggle(k);
    blockedFor = BLOCK_PAUSE;
    // Holding into a wall bumps once, not over and over.
    if (!held || !holdBumped) vary(k >= 0 ? 'block' : 'bump', 0.8);
    holdBumped = true;
    return;
  }
  const pushed = result === 2;
  const t = (pushed ? PUSH_TIME : WALK_TIME) * (queued > 0 ? HURRY : 1);
  worker.stepTo(puzzle.x(puzzle.player), puzzle.z(puzzle.player), d, t, pushed);
  footstep ^= 1;
  if (pushed) {
    const k = puzzle.lastCrate;
    // The worker now stands where the crate was: was it resting on a spot?
    const left = puzzle.goal[puzzle.player] && !puzzle.goal[puzzle.crates[k]] && crates.settled(k);
    // Dust kicks up where the crate scrapes away.
    fx.dust(puzzle.x(puzzle.player), puzzle.z(puzzle.player), DX[d], DZ[d]);
    crates.slide(k, puzzle, t);
    fresh[k] = 1;
    vary('push', 0.9);
    if (left) sound.play('off', { volume: 0.7, delay: 0.04 });
    const stuck = countStuck();
    if (stuck > stuckCount) {
      hud.callout('Stuck! B undo', 'warn');
      shake = Math.max(shake, 0.12);
      sound.play('stuck', { delay: 0.1 });
    }
    stuckCount = stuck;
    clearPending = puzzle.solved();
  } else {
    vary(footstep ? 'step_a' : 'step_b', 0.55);
  }
  hud.moves(puzzle.moves);
}

function undo(held) {
  queued = 0;
  const d = puzzle.undo();
  if (d < 0) {
    if (puzzle.undoRestart()) {
      crates.load(puzzle, false);
      fresh.fill(0);
      worker.place(puzzle.x(puzzle.player), puzzle.z(puzzle.player), puzzle.history[puzzle.history.length - 1] & 3);
      hud.callout('Moves back', 'gold');
      hud.moves(puzzle.moves);
      stuckCount = countStuck();
      clearPending = false;
      sound.play('restore');
    } else if (!held) {
      sound.play('deny', { volume: 0.6 });
    }
    return;
  }
  const k = puzzle.lastCrate;
  // He backs up still facing the way he went, pulling the crate along.
  worker.stepTo(puzzle.x(puzzle.player), puzzle.z(puzzle.player), d, UNDO_TIME, k >= 0);
  if (k >= 0) {
    crates.slide(k, puzzle, UNDO_TIME);
    fresh[k] = 0; // pulled back onto a spot: no sparkles for that
  }
  stuckCount = countStuck();
  clearPending = false;
  hud.moves(puzzle.moves);
  // Held, the rewind rises in pitch.
  undoRun = held ? undoRun + 1 : 0;
  vary('undo', k >= 0 ? 0.75 : 0.55, 0.03, 1 + Math.min(undoRun, 12) * 0.02);
}

// A crate just settled on a spot: sparkles, a chime up the scale and a
// "2/4" over it.
function crateHome(i) {
  const x = crates.x(i);
  const z = crates.z(i);
  fx.sparkle(x, z);
  screenPos.set(x, 1.1, z).project(camera);
  const all = puzzle.solved();
  hud.popup(`${puzzle.onGoal}/${crates.count}`, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, all);
  const semis = SPOT_SCALE[Math.min(SPOT_SCALE.length - 1, puzzle.onGoal - 1)];
  sound.play('home', { volume: 0.85, rate: 2 ** (semis / 12) });
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
  fresh.fill(0);
  worker.place(puzzle.x(puzzle.player), puzzle.z(puzzle.player), DOWN);
  queued = 0;
  clearPending = false;
  stuckCount = 0;
  hud.moves(0);
  hud.callout('Restart · B brings the moves back');
  sound.play('restart');
}

// L / R: the nearest open level before or after this one.
function switchLevel(dir) {
  let i = puzzle.index + dir;
  while (i >= 0 && i < LEVELS.length && !isOpen(i)) i += dir;
  if (i < 0) {
    hud.callout('This is the first level');
    sound.play('deny');
  } else if (i >= LEVELS.length) {
    hud.callout(puzzle.index + 1 < LEVELS.length ? `Solve level ${puzzle.index + 1} to open the next` : 'This is the last level', 'warn');
    sound.play('deny');
  } else {
    startLevel(i);
  }
}

// The last crate is home. The result is saved straight away; the panel
// follows once the party has run a moment.
function levelClear() {
  state = 'clear';
  stateTime = 0;
  clearShown = false;
  queued = 0;
  const i = puzzle.index;
  const moves = puzzle.moves;
  opened = i + 1 < LEVELS.length && !isOpen(i + 1);
  beaten = best[i] > 0 && moves < best[i];
  record = best[i] === 0 || moves < best[i];
  if (record) best[i] = moves;
  save();
  crates.party();
  worker.celebrate();
  shake = 0.18;
  hud.callout('');
  for (let k = 0; k < crates.count; k++) fx.confetti(crates.x(k), crates.z(k), 10, 3);
  fx.confetti(0, 0, 24, 5);
  sound.duck(true);
  sound.play(moves <= PARS[i] ? 'perfect' : 'clear', { delay: 0.2 });
}

function showClear() {
  clearShown = true;
  const i = puzzle.index;
  const moves = puzzle.moves;
  const par = PARS[i];
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
  if (beaten) sound.play('best');
  else if (opened) sound.play('unlock');
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

// The grid cell the cursor moves to from tile i in direction d. The Options
// tile fills the end of the last row.
function gridMove(i, d) {
  const n = LEVELS.length;
  const optionsRow = Math.floor(n / COLUMNS);
  if (i === n) {
    if (d === 0) return Math.min(n - 1, (optionsRow - 1) * COLUMNS + Math.max(n % COLUMNS, lastColumn));
    if (d === 3) return n - 1;
    return n;
  }
  if (d === 1) return Math.min(n, i + 1);
  if (d === 3) return Math.max(0, i - 1);
  if (d === 0) return i >= COLUMNS ? i - COLUMNS : i;
  // Down: the tile below, or the Options tile when it is under this column.
  if (i + COLUMNS < n) return i + COLUMNS;
  return Math.floor(i / COLUMNS) === optionsRow - 1 ? n : i;
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
    const i = gridMove(selected, d);
    if (i !== selected) {
      selectLevel(i, false);
      sound.play('move');
    }
  }

  if (input.pressed('A') || input.pressed('START')) {
    if (selected >= LEVELS.length) {
      state = 'options';
      menuSel = 0;
      hud.showMenu(false);
      showOptions();
      sound.play('select');
    } else if (isOpen(selected)) {
      startLevel(selected);
    } else {
      hud.deny(selected);
      hud.callout(`Solve level ${selected} to unlock`, 'warn');
      sound.play('deny');
    }
  }
}

function updateOptions() {
  const item = menuInput(OPTION_ITEMS, showOptions);
  if (item === 'back') {
    state = 'title';
    hud.message('');
    hud.showMenu(true);
    sound.play('back');
  } else if (item) {
    toggle(item, showOptions);
  }
}

function updatePaused() {
  const item = input.pressed('START') ? 'resume' : menuInput(PAUSE_ITEMS, showPause);
  if (item === 'resume' || item === 'back') {
    resume();
  } else if (item === 'quit') {
    toTitle();
    sound.play('back');
  } else if (item) {
    toggle(item, showPause);
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
    undo(false);
  } else if (input.down('B')) {
    undoHeld += dt;
    if (undoHeld > UNDO_DELAY) {
      undoHeld -= UNDO_REPEAT;
      undo(true);
    }
  }

  // Every press is buffered, so quick taps are never lost.
  for (let k = 0; k < 4; k++) {
    if (!input.pressed(BUTTONS[k])) continue;
    if (queued < QUEUE) queue[queued++] = k;
    holdDir = k;
    holdTime = 0;
    holdBumped = false;
  }
  if (holdDir >= 0 && !input.down(BUTTONS[holdDir])) {
    // Let go: carry on with another direction still held, if any.
    holdDir = -1;
    for (let k = 0; k < 4; k++) {
      if (input.down(BUTTONS[k])) {
        holdDir = k;
        holdTime = REPEAT_DELAY;
        holdBumped = false;
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
      step(d, false);
    } else if (!worker.moving() && holdDir >= 0 && holdTime >= REPEAT_DELAY && blockedFor <= 0) {
      step(holdDir, true);
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
    else {
      toTitle();
      sound.play('back');
    }
  } else if (input.pressed('B')) {
    toTitle();
    sound.play('back');
  } else if (input.pressed('X')) {
    startLevel(i);
  }
}

// Compile every material and upload every texture now, with one of each
// kind of object in the scene (empty particle and glow pools included), so
// nothing stalls the first time it shows during play.
function warmUp() {
  scene.traverse((o) => {
    if (o.material?.map) renderer.initTexture(o.material.map);
  });
  view.update(0, 0, 0, 0);
  renderer.compile(scene, camera);
}

toTitle(true);
warmUp();
sound.startMusic();

hh.run((dt) => {
  if (state !== 'paused') {
    stateTime += dt;
    time += dt;
  }

  if (state === 'title') {
    updateTitle(dt);
  } else if (state === 'options') {
    updateOptions();
  } else if (state === 'play') {
    updatePlay(dt);
  } else if (state === 'paused') {
    updatePaused();
  } else if (state === 'clear') {
    updateClear();
  }

  // Drawing; while paused everything holds still.
  const animDt = state === 'paused' ? 0 : dt;
  worker.update(animDt);
  crates.update(animDt, puzzle, time);
  if (crates.dropped && state === 'play') vary('drop', 0.5 + 0.2 * Math.min(crates.dropped, 2), 0.05);
  for (let i = 0; i < crates.count; i++) {
    if (!crates.landed(i) || !fresh[i]) continue;
    fresh[i] = 0;
    if (puzzle.goal[puzzle.crates[i]] && state !== 'title') crateHome(i);
  }
  world.update(puzzle, time);
  fx.update(animDt);

  shake = Math.max(0, shake - animDt);
  const jitter = state === 'paused' ? 0 : shake * 0.5;
  const onTitle = state === 'title' || state === 'options';
  const sway = onTitle ? Math.sin(time * 0.35) * SWAY : 0;
  view.update(animDt, sway, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter);

  renderer.render(scene, camera);
});
