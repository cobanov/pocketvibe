// Snake: classic snake on a 3D toy board.
// The D-pad steers, START pauses. Apples grow the snake; every fifth one
// brings out a golden star that is worth more the quicker it is caught, and
// once the star is gone (caught or not) the snake gets a notch faster. Four
// boards: the classic open one and three with toy blocks, each with its own
// best score.

import * as THREE from 'three';
import { SCREEN, createHandheld } from './handheld.js';
import { COLS, DIR_X, DIR_Z, SKY, cellX, cellZ } from './shared.js';
import { BOARDS } from './boards.js';
import { createBoard } from './board.js';
import { createSnake } from './snake.js';
import { HURRY, createFood } from './food.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const START_TICK = 0.145; // seconds per cell at speed 1
const SPEEDUP = 0.936; // tick multiplier per speed level
const MAX_SPEED = 10; // 0.08 s per cell
const START_DELAY = 0.4; // a beat before the first move
const DEMO_TICK = 0.11; // the snake on the title screen
const DEMO_MAX_LEN = 26;
const APPLE_POINTS = 10;
const BONUS_EVERY = 5; // a star appears after every 5th apple
const STAR_STEPS = 44; // the star stays this many steps: 6.4 s at speed 1, 3.5 s at 10
const OVER_DELAY = 0.8; // the game-over panel waits for the crash to play out
const SAVE_KEY = 'snake';
// G minor pentatonic in semitones: the apple's note climbs it as the snake
// grows, from G4 to D6.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19];
const APPLES_PER_NOTE = 4;
// D-pad buttons by direction (shared.js: right, down, left, up).
const DIR_BUTTONS = ['RIGHT', 'DOWN', 'LEFT', 'UP'];

const SFX = [
  'move', 'select', 'back', 'pause', 'start', 'turn', 'eat', 'pop', 'star', 'hurry', 'grab', 'vanish',
  'faster', 'best', 'crash', 'over', 'record',
];

// Menus: the title's, its options and the pause menu during a run.
const TITLE_MENU = ['play', 'board', 'options'];
const OPTIONS_MENU = ['sfx', 'music', 'back'];
const PAUSE_MENU = ['resume', 'sfx', 'music', 'quit'];
const LABELS = { play: 'Play', options: 'Options', back: 'Back', resume: 'Resume', quit: 'Quit to title' };

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;
const sound = createSound(hh, { sfx: SFX, music: 'theme' });

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 40, 62);

// Angled top-down view that fits the whole board under the HUD row.
const CAM_Y = 28.8;
const CAM_Z = 14.3;
const camera = new THREE.PerspectiveCamera(36, hh.aspect, 1, 64);
camera.position.set(0, CAM_Y, CAM_Z);
camera.lookAt(0, 0, 0.2);
// The whole designed view stays in view: taller screens show more grass
// above and below the board, wider ones more at the sides.
hh.fitCamera(camera);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(6, 14, 8);
scene.add(sun);

const board = createBoard(scene, { taller: hh.viewScale() > 1, wider: hh.aspect > SCREEN.width / SCREEN.height }, BOARDS);
const snake = createSnake(scene);
const food = createFood(scene, snake);
const fx = createFx(scene);
const hud = createHud(hh.hud);

// Saved: the best score on each board and the board last played. 1.1.0
// kept one best, from the open board.
const saved = hh.load(SAVE_KEY, null);
const bests = {};
for (const b of BOARDS) bests[b.id] = saved?.bests?.[b.id] | 0;
if (typeof saved?.best === 'number') bests.classic = Math.max(bests.classic, saved.best);
let boardIndex = Math.min(Math.max(saved?.board | 0, 0), BOARDS.length - 1);

let state = 'title'; // title | options | play | paused | over
let acc = 0; // time since the last step
let tick = START_TICK;
let level = 1; // speed level
let score = 0;
let apples = 0;
let overTime = 0;
let overShown = false;
let record = false;
let full = false; // the run ended with the board full of snake
let cheered = false; // passing the best was cheered this run
let bestAtStart = 0;
let hurryStep = 0; // the star's last hurry tick
let shake = 0;
let menu = TITLE_MENU; // the items of the open menu
let menuSel = 0;

const screenPos = new THREE.Vector3();

function save() {
  hh.save(SAVE_KEY, { bests, board: boardIndex });
}

// Stereo position of a point on the board: a little left or right.
function panAt(x) {
  return (x / (COLS / 2)) * 0.4;
}

// A floating "+N" over a point of the board.
function popupAt(text, x, y, z, gold) {
  screenPos.set(x, y, z).project(camera);
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, gold);
}

function resetBoard() {
  snake.reset();
  food.clear();
  food.spawnApple();
  fx.clear();
}

// ---------------------------------------------------------------- menus

function itemLabel(item) {
  if (item === 'sfx') return `Sound: ${sound.sfxOn ? 'On' : 'Off'}`;
  if (item === 'music') return `Music: ${sound.musicOn ? 'On' : 'Off'}`;
  if (item === 'board') return `Board <span class="arrows">◀</span> ${BOARDS[boardIndex].name} <span class="arrows">▶</span>`;
  return LABELS[item];
}

function showMenu() {
  let rows = '<div class="menu">';
  for (let i = 0; i < menu.length; i++) {
    rows += `<div class="item${i === menuSel ? ' sel' : ''}">${itemLabel(menu[i])}</div>`;
  }
  rows += '</div>';
  if (menu === TITLE_MENU) {
    const best = bests[BOARDS[boardIndex].id];
    hud.message(
      `<div class="title">SNAKE</div>` +
        rows +
        `<div class="small">${best > 0 ? `Best ${best}` : 'No best yet'}</div>` +
        `<div class="small">D-pad choose · A select · START play</div>`,
    );
  } else if (menu === OPTIONS_MENU) {
    hud.message(`<div class="title">OPTIONS</div>` + rows + `<div class="small">D-pad choose · A select · B back</div>`);
  } else {
    hud.message(
      `<div class="title">PAUSED</div>` + rows + `<div class="small">D-pad choose · A select · B resume</div>`,
      'dim',
    );
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
    chooseBoard((boardIndex + dx + BOARDS.length) % BOARDS.length);
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

function chooseBoard(i) {
  boardIndex = i;
  board.show(i);
  snake.setBlocks(BOARDS[i].blocks);
  resetBoard();
  acc = 0;
  save();
  sound.play('move', { rate: 2 ** (SCALE[i * 2] / 12) });
  showMenu();
}

// ---------------------------------------------------------------- states

function toTitle() {
  state = 'title';
  resetBoard();
  acc = 0;
  hud.showStats(false);
  openMenu(TITLE_MENU);
  sound.duck(false);
}

function start() {
  state = 'play';
  resetBoard();
  acc = -START_DELAY;
  level = 1;
  tick = START_TICK;
  score = 0;
  apples = 0;
  cheered = false;
  bestAtStart = bests[BOARDS[boardIndex].id];
  hud.showStats(true);
  hud.score(0);
  hud.best(bestAtStart);
  hud.speed(level);
  hud.length(snake.len);
  hud.message('');
  sound.duck(false);
  sound.play('start');
}

function pause() {
  state = 'paused';
  openMenu(PAUSE_MENU);
  sound.play('pause');
  sound.duck(true);
}

function resume(how) {
  state = 'play';
  hud.message('');
  sound.play(how);
  sound.duck(false);
}

// Keeps the run's score as the board's best if it is one; true if so.
function keepBest() {
  const id = BOARDS[boardIndex].id;
  if (score <= bests[id]) return false;
  bests[id] = score;
  save();
  return true;
}

function addScore(points) {
  score += points;
  hud.score(score);
  hud.best(Math.max(bestAtStart, score));
  if (!cheered && bestAtStart > 0 && score > bestAtStart) {
    cheered = true;
    hud.toast('NEW BEST!', 'best');
    sound.play('best');
  }
}

// Once a star is gone, caught or not, the snake gets a notch faster.
function speedUp() {
  if (level >= MAX_SPEED) return;
  level++;
  tick = START_TICK * SPEEDUP ** (level - 1);
  hud.speed(level);
  hud.toast('FASTER!');
  sound.play('faster', { delay: 0.25 });
}

function spawnStar() {
  // A number of steps at the current speed, so the star is as reachable at
  // any speed.
  if (!food.spawnBonus(STAR_STEPS * tick)) return;
  hurryStep = 0;
  sound.play('star', { pan: panAt(cellX(food.bonusX)) });
}

function eatApple() {
  const x = cellX(food.appleX);
  const z = cellZ(food.appleZ);
  apples++;
  addScore(APPLE_POINTS);
  snake.eat(1);
  fx.burst(x, 0.4, z, 0xe8403a, 10, 4);
  fx.burst(x, 0.4, z, 0x4bbf4b, 3, 4);
  fx.wave(x, z, 0xffffff);
  popupAt(`+${APPLE_POINTS}`, x, 0.9, z, false);
  const note = SCALE[Math.min(Math.floor(apples / APPLES_PER_NOTE), SCALE.length - 1)];
  sound.play('eat', { rate: 0.96 + Math.random() * 0.08, pan: panAt(x) });
  sound.play('pop', { volume: 0.8, rate: 2 ** (note / 12), pan: panAt(x) });
  hud.length(snake.len + snake.grow);
  food.spawnApple();
  if (!food.appleOn) {
    boardFull();
    return;
  }
  if (apples % BONUS_EVERY === 0 && !food.bonusOn) spawnStar();
}

function eatBonus() {
  const x = cellX(food.bonusX);
  const z = cellZ(food.bonusZ);
  // The quicker the star is caught, the more it is worth: 30 to 80.
  const points = 20 + 10 * Math.ceil((6 * food.bonusLeft) / food.bonusTime);
  addScore(points);
  food.bonusOn = false;
  snake.eat(0);
  fx.burst(x, 0.6, z, 0xffd23f, 16, 5);
  fx.burst(x, 0.6, z, 0xffffff, 6, 5);
  fx.wave(x, z, 0xffd23f);
  popupAt(`+${points}`, x, 1.1, z, true);
  shake = Math.max(shake, 0.12);
  sound.play('grab', { pan: panAt(x) });
  speedUp();
}

// The star's countdown: a soft tick four times over its last HURRY seconds,
// a puff when it runs out.
function updateStar(dt) {
  if (food.update(dt, true)) {
    const x = cellX(food.bonusX);
    fx.burst(x, 0.5, cellZ(food.bonusZ), 0xfff1b8, 8, 2.5);
    sound.play('vanish', { pan: panAt(x) });
    speedUp();
  } else if (food.bonusOn && food.bonusLeft < HURRY) {
    const k = 4 - Math.ceil((food.bonusLeft / HURRY) * 4); // 0 .. 3
    if (k >= hurryStep) {
      hurryStep = k + 1;
      sound.play('hurry', { volume: 0.7 + k * 0.1, pan: panAt(cellX(food.bonusX)) });
    }
  }
}

function die() {
  state = 'over';
  overTime = 0;
  overShown = false;
  full = false;
  shake = 0.4;
  snake.die();
  const x = snake.x + DIR_X[snake.dir] * 0.45;
  const z = snake.z + DIR_Z[snake.dir] * 0.45;
  fx.burst(x, 0.5, z, 0xffffff, 10, 5);
  fx.burst(x, 0.5, z, 0x5fe06a, 8, 4);
  sound.play('crash', { pan: panAt(x) });
  record = keepBest();
}

// No free cell is left for an apple: the run is won.
function boardFull() {
  state = 'over';
  overTime = 0;
  overShown = false;
  full = true;
  record = keepBest();
}

function showOver() {
  overShown = true;
  const title = full ? 'BOARD FULL!' : record ? 'NEW BEST!' : 'GAME OVER';
  hud.message(
    `<div class="title">${title}</div>` +
      `<div class="big">${score}</div>` +
      `<div class="small">Length ${snake.len + snake.grow} · ${BOARDS[boardIndex].name} best ${bests[BOARDS[boardIndex].id]}</div>` +
      `<div class="blink">Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
  sound.play(record || full ? 'record' : 'over');
  sound.duck(true);
}

// One step of the game: eat what the head just reached, then move on.
function playTick() {
  const hx = snake.headX;
  const hz = snake.headZ;
  if (food.appleOn && hx === food.appleX && hz === food.appleZ) {
    eatApple();
    if (state !== 'play') return;
  }
  if (food.bonusOn && hx === food.bonusX && hz === food.bonusZ) eatBonus();
  if (!snake.step()) die();
  else if (snake.turned) {
    sound.play('turn', { volume: 0.6, rate: 0.96 + Math.random() * 0.08, pan: panAt(cellX(snake.headX)) });
  }
}

// One step of the title-screen snake, which steers itself towards the apple.
function demoTick() {
  if (food.appleOn && snake.headX === food.appleX && snake.headZ === food.appleZ) {
    snake.eat(1);
    fx.burst(cellX(food.appleX), 0.4, cellZ(food.appleZ), 0xe8403a, 8, 4);
    food.spawnApple();
  }
  if (snake.len >= DEMO_MAX_LEN || !snake.think(food.appleX, food.appleZ) || !snake.step()) {
    resetBoard();
  }
}

function updateDemo(dt) {
  acc += dt;
  if (acc >= DEMO_TICK) {
    acc -= DEMO_TICK;
    demoTick();
  }
  food.update(dt, false);
}

// One new turn a frame at most: a diagonal on the D-pad (two directions in
// the same frame) turns once, the way that is neither ahead nor back.
function readTurns() {
  for (let d = 0; d < 4; d++) {
    if (input.pressed(DIR_BUTTONS[d]) && snake.turn(d)) return;
  }
}

board.show(boardIndex);
snake.setBlocks(BOARDS[boardIndex].blocks);
snake.reset();

// Compile every material and upload every geometry now, while loading: one
// of each kind of object in view for a frame (the apple, the star and its
// ring, the particles and the floor ring, every board's blocks), so nothing
// stalls the first time it shows during play.
board.warmUp(true);
food.warmUp(10, 3);
fx.warmUp(cellX(14), cellZ(3));
snake.draw(1, 0);
renderer.compile(scene, camera);
renderer.render(scene, camera);
board.warmUp(false);
fx.clear();
fx.update(0);

toTitle();
sound.startMusic();

hh.run((dt) => {
  let step = tick;

  if (state === 'title') {
    step = DEMO_TICK;
    updateDemo(dt);
    if (input.pressed('START')) start();
    else {
      const item = menuInput();
      if (item === 'play' || item === 'board') start();
      else if (item === 'options') {
        sound.play('select');
        state = 'options';
        openMenu(OPTIONS_MENU);
      }
    }
  } else if (state === 'options') {
    step = DEMO_TICK;
    updateDemo(dt);
    const item = menuInput();
    if (item === 'back') {
      sound.play('back');
      state = 'title';
      openMenu(TITLE_MENU, TITLE_MENU.indexOf('options'));
    } else if (item) toggle(item);
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else {
      readTurns();
      if (import.meta.env.DEV && window.__snake?.autopilot && acc + dt >= tick) {
        snake.think(food.bonusOn ? food.bonusX : food.appleX, food.bonusOn ? food.bonusZ : food.appleZ);
      }
      acc += dt;
      if (acc >= tick) {
        acc -= tick;
        playTick();
      }
      if (state === 'play') updateStar(dt);
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) resume('back');
    else {
      const item = menuInput();
      if (item === 'resume') resume('select');
      else if (item === 'back') resume('back');
      else if (item === 'quit') {
        sound.play('back');
        keepBest();
        toTitle();
      } else if (item) toggle(item);
    }
  } else if (state === 'over') {
    overTime += dt;
    food.update(dt, false);
    if (!overShown && overTime > OVER_DELAY) showOver();
    else if (overShown && (input.pressed('A') || input.pressed('START'))) start();
    else if (overShown && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }

  // Everything below is drawing; while paused it stays frozen.
  const animDt = state === 'paused' ? 0 : dt;
  const t = state === 'over' ? 1 : Math.min(1, Math.max(0, acc / step));
  snake.draw(t, animDt);
  const reaching = snake.alive && food.appleOn && snake.headX === food.appleX && snake.headZ === food.appleZ;
  food.draw(reaching ? t : 0);
  fx.update(animDt);

  shake = Math.max(0, shake - dt);
  const jitter = state === 'paused' ? 0 : shake * 0.9;
  camera.position.set(
    (Math.random() - 0.5) * jitter,
    CAM_Y + (Math.random() - 0.5) * jitter,
    CAM_Z + (Math.random() - 0.5) * jitter,
  );

  renderer.render(scene, camera);
});

if (import.meta.env.DEV) {
  // For headless checks: the game's parts and state, an autopilot that
  // steers for the apple or the star, and the names of the sounds played.
  window.__snake = {
    THREE, scene, camera, renderer, snake, food, sound, autopilot: false, sounds: [],
    get state() { return state; },
    get level() { return level; },
    get tick() { return tick; },
    get score() { return score; },
    get apples() { return apples; },
    get board() { return boardIndex; },
  };
  const play = sound.play;
  sound.play = (name, options) => {
    window.__snake.sounds.push(name);
    play(name, options);
  };
}
