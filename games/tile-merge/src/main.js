// Tile Merge: slide numbered tiles around a square board; two equal tiles that
// meet merge into their sum. Three boards: 3x3 (make 256), the classic 4x4
// (make 2048) and 5x5 (make 4096), each with its own best and its own saved
// game, and after the goal a game goes on as long as the board has room. The
// D-pad slides, X undoes one move, START pauses. A game is saved after every
// move, so it can be continued from the title screen.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import {
  AREA, BG, CELLS, DX, DZ, DOWN, GOAL_EXP, LEFT, RIGHT, SIZE, SIZES, TILE_H, TILE_SCALE, UP,
  cellX, cellZ, setBoardSize,
} from './shared.js';
import { createGame } from './game.js';
import { createTiles } from './tiles.js';
import { createTable } from './table.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const SAVE_KEY = 'tile-merge';
const HINT = '<div class="small">D-pad slide · X undo</div><div class="small">START pause</div>';
const DEMO_STEP = 0.36; // seconds between the title demo's moves
const DEMO_WARMUP = 300; // most moves played unseen, so the title board looks lived-in
// The title demo plays unseen until it has made the first tile and starts
// over once it has made the second (exponents, per board size). The warm-up
// runs when the title opens or the board changes, so the roomy 5x5 board
// stops at 128 to keep that short on the handheld's CPU.
const DEMO_FROM = { 3: 5, 4: 8, 5: 7 };
const DEMO_UNTIL = { 3: 7, 4: 10, 5: 10 };
const WIN_DELAY = 0.8; // the celebration plays before the message
const OVER_DELAY = 0.9; // the board turns grey before the message
const QUEUE = 3; // moves pressed while the tiles still slide, played in turn
const CONFETTI = [0xffc46b, 0xff8a6b, 0xf2d272, 0x8dcf80, 0x58bfae, 0xffffff];
// The merge note climbs A-flat major with the merged value: one scale step
// (semitones above the recorded Ab4) per doubling, from the 4 tile up.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];

// Play view: almost straight down with a slight tilt. The title view is
// lower and further out, slowly swinging around the table, and the picture
// is shifted right (a lens shift, in px) to make room for the menu.
const CAM_Y = 9.45;
const CAM_Z = 4.75;
const LOOK_Z = 0.2;
const TITLE_Y = 12.5;
const TITLE_R = 9.6;
const TITLE_LOOK_Z = -0.5; // just past the board's middle, so it turns in place
const TITLE_SHIFT = 170;

const LABELS = {
  continue: 'Continue',
  new: 'New game',
  play: 'Play',
  options: 'Options',
  back: 'Back',
  resume: 'Resume',
  quit: 'Quit to title',
  restart: 'Start over',
};
const OPTIONS_MENU = ['sfx', 'music', 'back'];
const CONFIRM_MENU = ['restart', 'back'];
const PAUSE_MENU = ['resume', 'sfx', 'music', 'quit'];

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 17, 36);

const camera = new THREE.PerspectiveCamera(32, hh.aspect, 1, 38);
// The whole designed view stays in view, so the board never runs under the
// score and undo boxes beside it; taller screens show more table.
hh.fitCamera(camera);

// Only the table and its things are lit; the board and tiles have baked shading.
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x9a6a4a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-5, 10, 4);
scene.add(sun);

const table = createTable(scene);
const tiles = createTiles(scene);
const fx = createFx(scene);
const hud = createHud(hh.hud);
const game = createGame(); // the player's game
const demo = createGame(); // the one that plays itself behind the title
const sound = createSound(hh, {
  // Loaded in this order: the sounds of every move first.
  sfx: [
    'slide', 'merge', 'spawn', 'bump', 'merge_hi', 'undo', 'move', 'select', 'back', 'start', 'pause', 'board',
    'milestone', 'best', 'win', 'gameover', 'record',
  ],
  music: 'theme',
});

let state = 'title'; // title | play | paused | won | over
let stateTime = 0;
let titleTime = 0;
let demoWait = 0;
let menu = null; // the items of the open menu
let menuSel = 0;
const queue = new Int8Array(QUEUE); // moves pressed while the tiles were sliding
let queued = 0;
let shake = 0;
let pushX = 0; // the camera leans after the tiles
let pushZ = 0;
let leanX = 0;
let leanZ = 0;
let panelShown = false;
let view = 0; // 0 title view .. 1 play view
let shownShift = -1;

// Everything that is saved: the board size last played, and per size the
// best score, the biggest tile ever made and the game in progress (written
// after every move into reused objects, so leaving and coming back resumes
// it). Version 1.1.0 kept one 4x4 game and its best.
const store = { size: 4, best: {}, top: {}, games: {} };
{
  const saved = hh.load(SAVE_KEY, null) || {};
  if (SIZES.includes(saved.size)) store.size = saved.size;
  for (const n of SIZES) {
    store.best[n] = Number(saved.best?.[n]) || 0;
    store.top[n] = Number(saved.top?.[n]) || 0;
    store.games[n] = saved.games?.[n] ?? null;
  }
  if (typeof saved.best === 'number') {
    store.best[4] = saved.best;
    store.games[4] = saved.game ?? null;
  }
}
const snapshots = {};
for (const n of SIZES) {
  setBoardSize(n);
  const cells = n * n;
  snapshots[n] = { cells: new Array(cells).fill(0), score: 0, undo: new Array(cells).fill(0), undoScore: 0 };
  if (game.restore(store.games[n])) {
    store.best[n] = Math.max(store.best[n], game.score);
    store.top[n] = Math.max(store.top[n], 2 ** game.biggest());
  } else {
    store.games[n] = null;
  }
}
let hasGame = false;
useSize(store.size);

function saveStore() {
  hh.save(SAVE_KEY, store);
}

function persist() {
  store.size = SIZE;
  store.games[SIZE] = hasGame ? game.snapshot(snapshots[SIZE]) : null;
  saveStore();
}

// Switches to the n x n board: its tray, and its saved game if there is one.
function useSize(n) {
  setBoardSize(n);
  table.show(n);
  hasGame = game.restore(store.games[n]);
}

const screenPos = new THREE.Vector3();

// A floating word over the tile at (x, z).
function popupAt(text, x, z) {
  screenPos.set(x, TILE_H * TILE_SCALE + 0.5, z).project(camera);
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height);
}

function push(dir, amount) {
  pushX = DX[dir] * amount;
  pushZ = DZ[dir] * amount;
}

function vary(k) {
  return 1 + (Math.random() * 2 - 1) * k;
}

// Stereo position of a cell: a little left or right.
function panAt(cell) {
  return (cellX(cell) / (AREA / 2)) * 0.35;
}

function goalValue() {
  return 2 ** GOAL_EXP[SIZE];
}

// ---------------------------------------------------------------- menus

function itemLabel(item) {
  if (item === 'sfx') return `Sound: ${sound.sfxOn ? 'On' : 'Off'}`;
  if (item === 'music') return `Music: ${sound.musicOn ? 'On' : 'Off'}`;
  if (item === 'board') return `Board <span class="arrows">◀</span> ${SIZE}×${SIZE} <span class="arrows">▶</span>`;
  return LABELS[item];
}

function titleMenu() {
  return hasGame ? ['continue', 'new', 'board', 'options'] : ['play', 'board', 'options'];
}

// The lines under the title menu: the goal and best of the board picked, and
// the saved game or the biggest tile ever made on it.
function titleInfo() {
  const best = store.best[SIZE];
  const top = store.top[SIZE];
  let second = '&nbsp;';
  if (hasGame) second = `Saved game ${game.score} points`;
  else if (top > 0) second = `Top tile ${top}`;
  return (
    `<div class="small gold">Goal ${goalValue()}${best > 0 ? ` · Best ${best}` : ''}</div>` +
    `<div class="small">${second}</div>`
  );
}

function showMenu() {
  const items = menu.map(itemLabel);
  if (state === 'paused') {
    hud.menu('<div class="title">PAUSED</div>', items, menuSel, '<div class="small">B or START resume</div>');
  } else if (menu === OPTIONS_MENU) {
    hud.menu('<div class="title">OPTIONS</div>', items, menuSel, '<div class="small">A change · B back</div>', 'side');
  } else if (menu === CONFIRM_MENU) {
    hud.menu(
      '<div class="title">NEW GAME?</div>',
      items,
      menuSel,
      `<div class="small">The saved ${SIZE}×${SIZE} game</div><div class="small">(${game.score} points) is lost</div>`,
      'side',
    );
  } else {
    hud.menu('<div class="title">TILE MERGE</div>', items, menuSel, titleInfo() + HINT, 'side');
  }
}

function openMenu(items, sel = 0) {
  menu = items;
  menuSel = sel;
  showMenu();
}

// UP / DOWN move through the open menu, LEFT / RIGHT flip a toggle or change
// the board. Returns the item chosen with A, 'back' for B, or null.
function menuInput() {
  const dy = input.pressed('DOWN') ? 1 : input.pressed('UP') ? -1 : 0;
  if (dy) {
    menuSel = (menuSel + dy + menu.length) % menu.length;
    sound.play('move');
    showMenu();
    return null;
  }
  const item = menu[menuSel];
  const dx = input.pressed('RIGHT') ? 1 : input.pressed('LEFT') ? -1 : 0;
  if (dx && item === 'board') {
    changeSize(dx);
    return null;
  }
  if (dx && (item === 'sfx' || item === 'music')) return item;
  if (input.pressed('A')) return item;
  if (input.pressed('B')) return 'back';
  return null;
}

// Sound and music on or off; returns true if item was one of them.
function toggle(item) {
  if (item === 'sfx') sound.setSfx(!sound.sfxOn);
  else if (item === 'music') sound.setMusic(!sound.musicOn);
  else return false;
  sound.play('select'); // heard only when effects are (still) on
  showMenu();
  return true;
}

// The next board size (dx 1) or the one before (-1), on the title.
function changeSize(dx) {
  const i = SIZES.indexOf(SIZE);
  const n = SIZES[(i + dx + SIZES.length) % SIZES.length];
  useSize(n);
  store.size = n;
  saveStore();
  resetDemo();
  sound.play('board', { rate: n === 3 ? 1.12 : n === 5 ? 0.9 : 1 });
  const items = titleMenu();
  openMenu(items, items.indexOf('board'));
}

// ---------------------------------------------------------------- title

// A fresh demo board that has already been played for a while.
function resetDemo() {
  for (let tries = 0; tries < 4; tries++) {
    demo.newGame();
    for (let i = 0; i < DEMO_WARMUP; i++) {
      const dir = demo.autoMove();
      if (dir < 0 || demo.biggest() >= DEMO_FROM[SIZE]) break;
      demo.move(dir);
    }
    if (demo.canMove()) break;
  }
  tiles.snap(demo.cells, 1);
  demoWait = -0.4;
}

function updateDemo(dt) {
  if (tiles.sliding) return;
  demoWait += dt;
  if (demoWait < DEMO_STEP) return;
  demoWait = 0;
  const dir = demo.autoMove();
  if (dir < 0 || demo.biggest() >= DEMO_UNTIL[SIZE]) {
    resetDemo();
    return;
  }
  demo.move(dir);
  tiles.slide(demo, dir);
  push(dir, 0.6);
}

function toTitle() {
  state = 'title';
  stateTime = 0;
  queued = 0;
  fx.clear();
  tiles.setGrey(0);
  resetDemo();
  hud.showStats(false);
  openMenu(titleMenu());
  sound.duck(false);
}

function titleChoose(item) {
  if (item === 'continue') {
    sound.play('start');
    play();
  } else if (item === 'play' || item === 'restart') {
    newGame();
  } else if (item === 'new') {
    // A saved game is only thrown away after a second A; Back is preselected.
    sound.play('select');
    openMenu(CONFIRM_MENU, 1);
  } else if (item === 'board') {
    changeSize(1);
  } else if (item === 'options') {
    sound.play('select');
    openMenu(OPTIONS_MENU);
  } else if (item === 'back') {
    if (menu !== OPTIONS_MENU && menu !== CONFIRM_MENU) return; // B on the title menu
    const from = menu === OPTIONS_MENU ? 'options' : 'new';
    sound.play('back');
    const items = titleMenu();
    openMenu(items, Math.max(0, items.indexOf(from)));
  } else {
    toggle(item);
  }
}

// ---------------------------------------------------------------- playing

// The best box, and the goal box: the goal tile until it is made, then the
// next doubling.
function updateStats() {
  const best = store.best[SIZE];
  hud.score(game.score);
  hud.best(best, game.startBest > 0 && game.score > game.startBest && game.score >= best);
  if (game.won) hud.goal('NEXT', 2 ** (Math.max(GOAL_EXP[SIZE], game.biggest()) + 1));
  else hud.goal('GOAL', goalValue());
  hud.undo(game.canUndo);
}

// Starts playing game as it is now (new or continued).
function play() {
  state = 'play';
  stateTime = 0;
  queued = 0;
  fx.clear();
  tiles.setGrey(0);
  tiles.snap(game.cells, 1);
  hud.showStats(true);
  updateStats();
  hud.message('');
  sound.duck(false);
  // A saved board can already be stuck.
  if (!game.canMove()) gameOver();
}

function newGame() {
  game.newGame();
  game.startBest = store.best[SIZE];
  hasGame = true;
  persist();
  sound.play('start');
  play();
}

function tryMove(dir) {
  const before = game.score;
  if (!game.move(dir)) {
    tiles.nudge(dir);
    push(dir, 0.3);
    sound.play('bump', { pan: DX[dir] * 0.4, rate: vary(0.04) });
    return false;
  }
  tiles.slide(game, dir);
  push(dir, 1);
  // The swish is louder when more tiles travel further.
  let travel = 0;
  for (let c = 0; c < CELLS; c++) {
    const d = game.dest[c];
    if (game.before[c] === 0 || d === c) continue;
    travel += Math.abs((d % SIZE) - (c % SIZE)) + Math.abs(Math.floor(d / SIZE) - Math.floor(c / SIZE));
  }
  sound.play('slide', { volume: Math.min(1, 0.4 + travel * 0.06), rate: vary(0.04), pan: DX[dir] * 0.35 });
  if (game.gained > 0) hud.gain(game.gained);
  if (game.score > store.best[SIZE]) store.best[SIZE] = game.score;
  if (game.grew) store.top[SIZE] = Math.max(store.top[SIZE], 2 ** game.grew);
  // Passing the best that stood when this game began.
  const old = game.startBest;
  if (old > 0 && before <= old && game.score > old) sound.play('best', { delay: 0.16 });
  updateStats();
  persist();
  return true;
}

function enqueue(dir) {
  if (queued < QUEUE) queue[queued++] = dir;
}

// Plays the moves pressed during the slide in turn, until one of them moves
// the tiles (the rest wait for that slide).
function playQueued() {
  while (queued > 0 && !tiles.sliding) {
    const dir = queue[0];
    queue.copyWithin(0, 1);
    queued--;
    tryMove(dir);
  }
}

function undo() {
  if (!game.canUndo) {
    sound.play('bump', { volume: 0.6 });
    return;
  }
  tiles.finish();
  queued = 0;
  game.undo();
  tiles.snap(game.cells, 2);
  updateStats();
  persist();
  sound.play('undo');
}

function pause() {
  state = 'paused';
  sound.duck(true);
  sound.play('pause');
  openMenu(PAUSE_MENU);
}

function resume() {
  state = 'play';
  hud.message('');
  sound.duck(false);
  sound.play('select');
}

function win() {
  state = 'won';
  stateTime = 0;
  panelShown = false;
  queued = 0;
  shake = 0.5;
  for (let i = 0; i < 12; i++) {
    fx.confetti(cellX(i % CELLS), cellZ((i * 7) % CELLS), CONFETTI[i % CONFETTI.length], 9);
  }
  sound.play('win', { delay: 0.12 });
}

function showWin() {
  panelShown = true;
  hud.message(
    `<div class="title">You made ${goalValue()}!</div>` +
      `<div>Score ${game.score}</div>` +
      `<div class="small">Keep going for ${goalValue() * 2}</div>` +
      `<div>A keep going · B title</div>`,
  );
  sound.duck(true);
}

function keepGoing() {
  state = 'play';
  hud.message('');
  sound.duck(false);
  sound.play('select');
  // The winning move can fill the board with nothing left to merge.
  if (!game.canMove()) gameOver();
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  panelShown = false;
  queued = 0;
  shake = Math.max(shake, 0.3);
  hasGame = false;
  persist();
}

function showOver() {
  panelShown = true;
  const record = game.score > game.startBest && game.score > 0;
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${game.score}</div>` +
      `<div class="small">Top tile ${2 ** game.biggest()} · Best ${store.best[SIZE]}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">${game.canUndo ? 'X undo · ' : ''}B title</div>`,
  );
  sound.duck(true);
  sound.play(record ? 'record' : 'gameover');
}

// One more chance from the game over panel: back to the move before the end.
function undoEnd() {
  hasGame = true;
  state = 'play';
  tiles.setGrey(0);
  hud.message('');
  sound.duck(false);
  undo();
}

// The merge note: the biggest merge of a slide on the tine that climbs
// A-flat major with its value (merge_hi from 512 up), panned to its cell.
function mergeNote(e, cell, volume, delay) {
  const d = e - 2;
  const semis = 12 * Math.floor(d / 7) + MAJOR[d % 7];
  const pan = panAt(cell);
  if (semis < 12) sound.play('merge', { rate: 2 ** (semis / 12), volume: volume * (0.75 + semis * 0.02), pan, delay });
  else sound.play('merge_hi', { rate: 2 ** (Math.min(12, semis - 12) / 12), volume, pan, delay });
}

// Effects and sounds for the merges of the slide that just landed.
function burstMerges(playing) {
  let top = -1; // the cell of the biggest merge
  let second = -1; // and of the next biggest
  for (let c = 0; c < CELLS; c++) {
    if (!tiles.merged[c]) continue;
    const e = tiles.shown[c];
    fx.burst(cellX(c), cellZ(c), e, Math.min(16, 2 + e), Math.min(2, 0.5 + e * 0.12));
    if (top < 0 || e > tiles.shown[top]) {
      second = top;
      top = c;
    } else if (second < 0 || e > tiles.shown[second]) {
      second = c;
    }
  }
  if (playing) {
    if (top >= 0) mergeNote(tiles.shown[top], top, 1, 0);
    if (second >= 0) mergeNote(tiles.shown[second], second, 0.5, 0.05);
    if (game.spawned >= 0) sound.play('spawn', { delay: 0.04, rate: vary(0.03), pan: panAt(game.spawned) });
  }
  if (top < 0) return;
  const e = tiles.shown[top];
  if (e >= 7) {
    // 128 and up: a ring, a shake and the new value floating up.
    const x = cellX(top);
    const z = cellZ(top);
    fx.wave(x, z, 0xfff1d6, (0.7 + (e - 7) * 0.12) * TILE_SCALE);
    shake = Math.max(shake, playing ? 0.12 + (e - 7) * 0.05 : 0.06);
    if (playing) popupAt(`${2 ** e}!`, x, z);
  }
}

// A new biggest tile on the way to the goal (a quarter and half of it) and
// every new one after it rings the milestone jingle, a step higher each time.
function milestone() {
  const e = game.grew;
  const goal = GOAL_EXP[SIZE];
  if (!e || e === goal) return;
  if (e === goal - 2) sound.play('milestone', { delay: 0.1 });
  else if (e === goal - 1) sound.play('milestone', { delay: 0.1, rate: 2 ** (5 / 12) });
  else if (e > goal) sound.play('milestone', { delay: 0.1, rate: 2 ** (7 / 12) });
}

function onLanded() {
  if (state === 'title') {
    burstMerges(false);
    return;
  }
  burstMerges(true);
  if (state !== 'play') return;
  milestone();
  if (game.justWon) {
    game.justWon = false;
    win();
    return;
  }
  playQueued();
  if (!tiles.sliding && !game.canMove()) gameOver();
}

function placeCamera(dt) {
  // Glide between the title and play views.
  const target = state === 'title' ? 0 : 1;
  view += (target - view) * Math.min(1, dt * 3.5);
  const v = view * view * (3 - 2 * view);

  // The camera leans a little after every slide and eases back.
  const decay = Math.exp(-dt * 6);
  pushX *= decay;
  pushZ *= decay;
  const k = Math.min(1, dt * 14);
  leanX += (pushX - leanX) * k;
  leanZ += (pushZ - leanZ) * k;

  const angle = Math.sin(titleTime * 0.25) * 0.42;
  const x = Math.sin(angle) * TITLE_R * (1 - v) + leanX * 0.34;
  const y = TITLE_Y + (CAM_Y - TITLE_Y) * v;
  const z = Math.cos(angle) * TITLE_R + (CAM_Z - Math.cos(angle) * TITLE_R) * v + leanZ * 0.3;
  shake = Math.max(0, shake - dt);
  const j = shake * shake * 1.6;
  camera.position.set(x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j, z);
  camera.lookAt(leanX * 0.14, 0, TITLE_LOOK_Z + (LOOK_Z - TITLE_LOOK_Z) * v + leanZ * 0.12);

  // The title's lens shift, only recomputed while it changes.
  const shift = Math.round(TITLE_SHIFT * (1 - v) * 4) / 4;
  if (shift !== shownShift) {
    shownShift = shift;
    if (shift > 0) camera.setViewOffset(hh.width, hh.height, -shift, 0, hh.width, hh.height);
    else camera.clearViewOffset();
  }
}

// Compile every material and upload every geometry and texture now, with one
// of each kind of object in the scene (every tray, a crumb and the ring
// included), so nothing stalls the first time it shows during play.
function warmUp() {
  table.show(0);
  fx.burst(0, 0, 3, 1, 0.5);
  fx.wave(0, 0, 0xffffff, 1);
  fx.update(0.001);
  scene.traverse((o) => {
    const m = o.material;
    if (!m) return;
    if (m.map) renderer.initTexture(m.map);
    for (const key in m.uniforms) {
      if (m.uniforms[key].value?.isTexture) renderer.initTexture(m.uniforms[key].value);
    }
  });
  placeCamera(0);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  fx.clear();
  table.show(SIZE);
}

toTitle();
warmUp();
sound.startMusic(); // plays from the title on, once loaded and allowed

const DIRS = [LEFT, RIGHT, UP, DOWN];
const DIR_BUTTONS = ['LEFT', 'RIGHT', 'UP', 'DOWN'];

hh.run((dt) => {
  if (state !== 'paused') stateTime += dt;

  if (state === 'title') {
    titleTime += dt;
    updateDemo(dt);
    const onTitleMenu = menu !== OPTIONS_MENU && menu !== CONFIRM_MENU;
    if (onTitleMenu && input.pressed('START')) {
      if (hasGame) titleChoose('continue');
      else newGame();
    } else {
      const item = menuInput();
      if (item) titleChoose(item);
    }
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
    } else if (input.pressed('X')) {
      undo();
    } else {
      // Every press counts: one made while the tiles still slide waits its turn.
      for (let i = 0; i < 4; i++) {
        if (!input.pressed(DIR_BUTTONS[i])) continue;
        if (tiles.sliding) enqueue(DIRS[i]);
        else tryMove(DIRS[i]);
      }
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      resume();
    } else {
      const item = menuInput();
      if (item === 'resume' || item === 'back') resume();
      else if (item === 'quit') {
        sound.play('back');
        toTitle();
      } else if (item) toggle(item);
    }
  } else if (state === 'won') {
    if (!panelShown && stateTime > WIN_DELAY) {
      showWin();
    } else if (panelShown && (input.pressed('A') || input.pressed('START'))) {
      keepGoing();
    } else if (panelShown && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  } else if (state === 'over') {
    tiles.setGrey(Math.min(1, stateTime / OVER_DELAY));
    if (!panelShown && stateTime > OVER_DELAY) {
      showOver();
    } else if (panelShown && input.pressed('A')) {
      newGame();
    } else if (panelShown && input.pressed('B')) {
      sound.play('back');
      toTitle();
    } else if (panelShown && input.pressed('X') && game.canUndo) {
      undoEnd();
    }
  }

  // Everything below animates; while paused it all stays frozen.
  if (state !== 'paused') {
    if (tiles.update(dt, queued > 0)) onLanded();
    fx.update(dt);
    placeCamera(dt);
  }

  renderer.render(scene, camera);
});
