// Snake: classic snake on a 3D toy board.
// The D-pad steers, START pauses. Apples grow the snake and speed it up; the
// golden star that shows up after every fifth apple is worth extra points but
// vanishes after a few seconds.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { DIR_X, DIR_Z, DOWN, LEFT, RIGHT, SKY, UP, cellX, cellZ } from './shared.js';
import { createBoard } from './board.js';
import { createSnake } from './snake.js';
import { createFood } from './food.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';

const START_TICK = 0.14; // seconds per cell at the start
const MIN_TICK = 0.072; // top speed
const SPEEDUP = 0.975; // tick multiplier per apple
const START_DELAY = 0.4; // a beat before the first move
const DEMO_TICK = 0.11; // the snake on the title screen
const DEMO_MAX_LEN = 26;
const APPLE_POINTS = 10;
const BONUS_EVERY = 5; // a star appears after every 5th apple
const OVER_DELAY = 0.8; // the game-over panel waits for the crash to play out

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 40, 62);

// Angled top-down view that fits the whole board under the HUD row.
const CAM_Y = 28.8;
const CAM_Z = 14.3;
const camera = new THREE.PerspectiveCamera(36, hh.width / hh.height, 1, 64);
camera.position.set(0, CAM_Y, CAM_Z);
camera.lookAt(0, 0, 0.2);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(6, 14, 8);
scene.add(sun);

createBoard(scene);
const snake = createSnake(scene);
const food = createFood(scene, snake);
const fx = createFx(scene);
const hud = createHud(hh.hud);

let state = 'title'; // title | play | paused | over
let acc = 0; // time since the last step
let tick = START_TICK;
let score = 0;
let apples = 0;
let overTime = 0;
let overShown = false;
let record = false;
let shake = 0;
let best = hh.load('snake', { best: 0 }).best;

const HINT = 'D-pad steer · START pause';
const screenPos = new THREE.Vector3();

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

function toTitle() {
  state = 'title';
  resetBoard();
  acc = 0;
  hud.showStats(false);
  hud.message(
    `<div class="title">SNAKE</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best}</div>` : ''),
  );
}

function start() {
  state = 'play';
  resetBoard();
  acc = -START_DELAY;
  tick = START_TICK;
  score = 0;
  apples = 0;
  hud.showStats(true);
  hud.score(0);
  hud.length(snake.len);
  hud.message('');
}

function eatApple() {
  const x = cellX(food.appleX);
  const z = cellZ(food.appleZ);
  apples++;
  score += APPLE_POINTS;
  snake.eat(1);
  tick = Math.max(MIN_TICK, tick * SPEEDUP);
  fx.burst(x, 0.4, z, 0xe8403a, 10, 4);
  fx.burst(x, 0.4, z, 0x4bbf4b, 3, 4);
  fx.wave(x, z, 0xffffff);
  popupAt(`+${APPLE_POINTS}`, x, 0.9, z, false);
  food.spawnApple();
  if (apples % BONUS_EVERY === 0 && !food.bonusOn) food.spawnBonus();
  hud.score(score);
  hud.length(snake.len + snake.grow);
}

function eatBonus() {
  const x = cellX(food.bonusX);
  const z = cellZ(food.bonusZ);
  // The quicker the star is caught, the more it is worth: 30 to 80.
  const points = 20 + 10 * Math.ceil(food.bonusLeft);
  score += points;
  food.bonusOn = false;
  snake.eat(0);
  fx.burst(x, 0.6, z, 0xffd23f, 16, 5);
  fx.burst(x, 0.6, z, 0xffffff, 6, 5);
  fx.wave(x, z, 0xffd23f);
  popupAt(`+${points}`, x, 1.1, z, true);
  shake = Math.max(shake, 0.12);
  hud.score(score);
}

function die() {
  state = 'over';
  overTime = 0;
  overShown = false;
  shake = 0.4;
  snake.die();
  const x = snake.x + DIR_X[snake.dir] * 0.45;
  const z = snake.z + DIR_Z[snake.dir] * 0.45;
  fx.burst(x, 0.5, z, 0xffffff, 10, 5);
  fx.burst(x, 0.5, z, 0x5fe06a, 8, 4);
  record = score > best;
  if (record) {
    best = score;
    hh.save('snake', { best });
  }
}

function showOver() {
  overShown = true;
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${score}</div>` +
      `<div class="small">Length ${snake.len} · Best ${best}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

// One step of the game: eat what the head just reached, then move on.
function playTick() {
  const hx = snake.headX;
  const hz = snake.headZ;
  if (food.appleOn && hx === food.appleX && hz === food.appleZ) eatApple();
  if (food.bonusOn && hx === food.bonusX && hz === food.bonusZ) eatBonus();
  if (!snake.step()) die();
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

function readTurns() {
  if (input.pressed('UP')) snake.turn(UP);
  if (input.pressed('DOWN')) snake.turn(DOWN);
  if (input.pressed('LEFT')) snake.turn(LEFT);
  if (input.pressed('RIGHT')) snake.turn(RIGHT);
}

toTitle();

hh.run((dt) => {
  let step = tick;

  if (state === 'title') {
    step = DEMO_TICK;
    acc += dt;
    if (acc >= DEMO_TICK) {
      acc -= DEMO_TICK;
      demoTick();
    }
    food.update(dt, false);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      state = 'paused';
      hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
    } else {
      readTurns();
      acc += dt;
      if (acc >= tick) {
        acc -= tick;
        playTick();
      }
      if (food.update(dt, true)) {
        // The star ran out: a little puff where it was.
        fx.burst(cellX(food.bonusX), 0.5, cellZ(food.bonusZ), 0xfff1b8, 8, 2.5);
      }
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    overTime += dt;
    food.update(dt, false);
    if (!overShown && overTime > OVER_DELAY) showOver();
    else if (overShown && input.pressed('A')) start();
    else if (overShown && input.pressed('B')) toTitle();
  }

  // Everything below is drawing; while paused it stays frozen.
  const animDt = state === 'paused' ? 0 : dt;
  const t = state === 'over' ? 1 : Math.min(1, Math.max(0, acc / step));
  snake.draw(t, animDt);
  const reaching = snake.alive && food.appleOn && snake.headX === food.appleX && snake.headZ === food.appleZ;
  food.draw(reaching ? t : 0);
  fx.update(animDt);

  shake = Math.max(0, shake - dt);
  const jitter = shake * 0.9;
  camera.position.set(
    (Math.random() - 0.5) * jitter,
    CAM_Y + (Math.random() - 0.5) * jitter,
    CAM_Z + (Math.random() - 0.5) * jitter,
  );

  renderer.render(scene, camera);
});
