// Brick Breaker: clear every brick with the ball and keep it from falling off
// the bottom edge. D-pad moves the paddle, A launches the ball, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, PADDLE_Z } from './shared.js';
import { createWorld } from './world.js';
import { createBricks } from './bricks.js';
import { createPaddle } from './paddle.js';
import { MAX_ALIVE, createBalls } from './ball.js';
import { KINDS, LIFE, MULTI, SLOW, WIDE, createPowerups } from './powerups.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { LEVELS } from './levels.js';

const START_LIVES = 3;
const MAX_LIVES = 5;
const BASE_SPEED = 10; // ball speed on level 1, units per second
const LEVEL_SPEED = 0.45; // added for each level
const LOOP_SPEED = 0.15; // speed multiplier added each time the levels loop
const RAMP = 0.04; // speed gained per second of play within a level
const RAMP_MAX = 2.5;
const MAX_SPEED = 19;
const SLOW_FACTOR = 0.62;
const WIDE_TIME = 15;
const SLOW_TIME = 10;
const DROP_CHANCE = 0.16;
const MAX_PILLS_FALLING = 2;
const BRICK_POINTS = 50;
const COMBO_POINTS = 10; // extra per brick broken in a row without touching the paddle
const CLEAR_BONUS = 1000;
const PILL_POINTS = 100;
const DEMO_LEVEL = 3; // the heart plays itself behind the title
const DEMO_SPEED = 10;
const SAVE_KEY = 'brick-breaker';

const CAM_Y = 23;
const CAM_Z = 9.6;
const LOOK_Z = 0.7;

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 34, 60);
const camera = new THREE.PerspectiveCamera(44, hh.width / hh.height, 1, 64);

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a4a9a, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-4, 12, 7);
scene.add(sun);

createWorld(scene);
const bricks = createBricks(scene);
const paddle = createPaddle(scene);
const effects = createEffects(scene);
const powerups = createPowerups(scene);
const hud = createHud(hh.hud);

let state = 'title'; // title | play | lost | clear | paused | over
let demo = true; // the title screen plays by itself and scores nothing
let level = 0;
let score = 0;
let lives = 0;
let combo = 0;
let levelTime = 0;
let wideTime = 0;
let slowTime = 0;
let speed = BASE_SPEED;
let stateTime = 0;
let demoWait = 0;
let shake = 0;
let aiOffset = 0;
let titleTime = 0;
let best = hh.load(SAVE_KEY, { best: 0 }).best;

const HINT = '◀ ▶ move · A launch · START pause';

// Called by the ball physics.
const events = {
  // Returns what bricks.hit returned: 0 gold, 1 cracked, 2 broken.
  brick(cell) {
    const result = bricks.hit(cell);
    const x = bricks.cellX(cell);
    const z = bricks.cellZ(cell);
    if (result === 2) {
      effects.burst(x, z, bricks.colorOf(cell), 9);
      shake = Math.max(shake, 0.07);
      if (!demo) {
        score += BRICK_POINTS * bricks.maxHp(cell) + Math.min(combo, 20) * COMBO_POINTS;
        combo++;
        maybeDrop(x, z);
      }
    } else if (result === 1) {
      effects.sparks(x, z, 5, 0xffffff);
      if (!demo) score += 10;
    } else {
      effects.sparks(x, z, 4, 0xffd84a);
    }
    return result;
  },

  wall(ball) {
    effects.sparks(ball.x, ball.z, 2, 0xbff6ff);
  },

  paddle(ball) {
    paddle.bump();
    combo = 0;
    effects.sparks(ball.x, ball.z + 0.2, 4, 0x8fe9ff);
    // The demo aims somewhere new after every hit.
    aiOffset = (Math.random() - 0.5) * paddle.halfW * 1.5;
  },

  fell() {
    shake = Math.max(shake, 0.12);
  },
};

const balls = createBalls(scene, bricks, paddle, events);

function maybeDrop(x, z) {
  if (Math.random() > DROP_CHANCE || powerups.falling() >= MAX_PILLS_FALLING) return;
  const r = Math.random();
  let kind = r < 0.32 ? WIDE : r < 0.62 ? MULTI : r < 0.86 ? SLOW : LIFE;
  if (kind === LIFE && lives >= MAX_LIVES) kind = WIDE;
  if (kind === MULTI && balls.alive() >= MAX_ALIVE) kind = SLOW;
  powerups.spawn(x, z, kind);
}

function applyPower(kind) {
  score += PILL_POINTS;
  paddle.bump();
  effects.sparks(paddle.x, PADDLE_Z, 10, 0xffffff);
  hud.callout(KINDS[kind].name, KINDS[kind].color);
  if (kind === WIDE) {
    wideTime = WIDE_TIME;
    paddle.setWide(true);
  } else if (kind === MULTI) {
    balls.split();
  } else if (kind === SLOW) {
    slowTime = SLOW_TIME;
    balls.setSlowLook(true);
  } else if (kind === LIFE) {
    lives = Math.min(MAX_LIVES, lives + 1);
  }
}

function clearPowers() {
  wideTime = 0;
  slowTime = 0;
  paddle.setWide(false);
  balls.setSlowLook(false);
  powerups.clear();
}

// Faster on later levels, faster each loop, and a little faster the longer a
// level lasts.
function targetSpeed() {
  if (demo) return DEMO_SPEED;
  const loop = Math.floor(level / LEVELS.length);
  const base = (BASE_SPEED + (level % LEVELS.length) * LEVEL_SPEED) * (1 + loop * LOOP_SPEED);
  const s = Math.min(MAX_SPEED, base + Math.min(RAMP_MAX, levelTime * RAMP));
  return slowTime > 0 ? s * SLOW_FACTOR : s;
}

function loadLevel(n) {
  level = n;
  bricks.load(LEVELS[n % LEVELS.length].map);
  balls.reset();
  clearPowers();
  balls.serve();
  levelTime = 0;
  combo = 0;
  speed = targetSpeed();
}

function startLevel(n) {
  loadLevel(n);
  const name = LEVELS[n % LEVELS.length].name;
  hud.banner(`LEVEL ${n + 1}`, n >= LEVELS.length ? `${name} · faster ball` : name);
  hud.callout('');
}

function toTitle() {
  state = 'title';
  demo = true;
  paddle.reset();
  effects.clear();
  loadLevel(DEMO_LEVEL);
  demoWait = 0;
  hud.showStats(false);
  hud.banner('');
  hud.callout('');
  hud.hint('');
  hud.message(
    `<div class="title">BRICK BREAKER</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best}</div>` : ''),
  );
}

function start() {
  state = 'play';
  demo = false;
  score = 0;
  lives = START_LIVES;
  paddle.reset();
  effects.clear();
  hud.showStats(true);
  hud.message('');
  startLevel(0);
}

function pause() {
  state = 'paused';
  hud.message(
    `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`,
  );
}

function loseLife() {
  lives--;
  state = 'lost';
  stateTime = 0;
  shake = 0.45;
  hud.hurt();
  hud.hint('');
  clearPowers();
}

function levelClear() {
  state = 'clear';
  stateTime = 0;
  score += CLEAR_BONUS;
  // The balls still in play burst into sparkles.
  for (let i = 0; i < balls.list.length; i++) {
    const b = balls.list[i];
    if (b.active && b.falling <= 0) effects.burst(b.x, b.z, 0xffffff, 8);
  }
  balls.reset();
  powerups.clear();
  hud.banner('CLEAR!', `+${CLEAR_BONUS} bonus`);
  hud.hint('');
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  const record = score > best;
  if (record) {
    best = score;
    hh.save(SAVE_KEY, { best });
  }
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${score}</div>` +
      `<div class="small">Level ${level + 1} · Best ${best}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

function updatePlay(dt) {
  paddle.update(dt, input.dpad.x);
  if (balls.hasAttached()) {
    const ready = bricks.ready();
    hud.hint(ready ? 'Press A to launch' : '');
    if (ready && input.pressed('A')) balls.launch();
  } else {
    hud.hint('');
    levelTime += dt;
  }

  if (wideTime > 0) {
    wideTime = Math.max(0, wideTime - dt);
    if (wideTime === 0) paddle.setWide(false);
  }
  if (slowTime > 0) {
    slowTime = Math.max(0, slowTime - dt);
    if (slowTime === 0) balls.setSlowLook(false);
  }
  speed += (targetSpeed() - speed) * Math.min(1, dt * 3);

  balls.update(dt, speed);
  const caught = powerups.update(dt, paddle);
  if (caught >= 0) applyPower(caught);

  if (bricks.remaining() === 0) levelClear();
  else if (balls.alive() === 0) loseLife();
}

// The title screen plays the game by itself.
function updateDemo(dt) {
  const b = balls.lowest();
  paddle.autopilot(dt, b ? (b.dz > 0 ? b.x - aiOffset : b.x * 0.5) : 0);
  if (balls.hasAttached()) {
    if (bricks.ready()) demoWait += dt;
    if (demoWait > 0.8) {
      demoWait = 0;
      balls.launch();
    }
  }
  balls.update(dt, DEMO_SPEED);
  if (bricks.remaining() === 0) loadLevel((level + 1) % LEVELS.length);
  else if (balls.alive() === 0) balls.serve();
}

toTitle();

hh.run((dt) => {
  stateTime += dt;

  if (state === 'title') {
    titleTime += dt;
    updateDemo(dt);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else updatePlay(dt);
  } else if (state === 'lost') {
    // A short beat to see the ball drop, then serve again or end the game.
    paddle.update(dt, input.dpad.x);
    balls.update(dt, speed);
    if (stateTime > 1.0) {
      if (lives > 0) {
        state = 'play';
        balls.serve();
      } else {
        gameOver();
      }
    }
  } else if (state === 'clear') {
    paddle.update(dt, input.dpad.x);
    if (stateTime > 1.8) {
      state = 'play';
      startLevel(level + 1);
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    // A short delay so a button mashed while losing does not restart at once.
    if (stateTime > 0.6 && input.pressed('A')) start();
    else if (stateTime > 0.6 && input.pressed('B')) toTitle();
  }

  if (state !== 'paused') {
    bricks.update(dt);
    effects.update(dt);
    shake = Math.max(0, shake - dt);
  }

  hud.score(score);
  hud.best(Math.max(best, score));
  hud.level(level + 1);
  hud.lives(lives);
  hud.powers(Math.ceil(wideTime), Math.ceil(slowTime));

  // Fixed camera with a hint of parallax, a slow sway on the title screen and
  // a shake on hits.
  const jitter = shake * 0.7;
  const sway = state === 'title' ? Math.sin(titleTime * 0.4) * 1.2 : 0;
  camera.position.set(
    paddle.x * 0.05 + sway + (Math.random() - 0.5) * jitter,
    CAM_Y + (Math.random() - 0.5) * jitter,
    CAM_Z,
  );
  camera.lookAt(paddle.x * 0.03, 0, LOOK_Z);

  renderer.render(scene, camera);
});
