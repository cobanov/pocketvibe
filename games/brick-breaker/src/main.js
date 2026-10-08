// Brick Breaker: clear every brick with the ball and keep it from falling off
// the bottom edge. D-pad moves the paddle, A launches the ball, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, FIELD_R, PADDLE_Z } from './shared.js';
import { createWorld } from './world.js';
import { createBricks } from './bricks.js';
import { createPaddle } from './paddle.js';
import { MAX_ALIVE, createBalls } from './ball.js';
import { KINDS, LIFE, MULTI, SLOW, WIDE, createPowerups } from './powerups.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';
import { LEVELS } from './levels.js';

const START_LIVES = 3;
const MAX_LIVES = 5;
const BASE_SPEED = 11; // ball speed on level 1, units per second
const LEVEL_SPEED = 0.25; // added for each level
const LOOP_SPEED = 0.15; // speed multiplier added each time the levels loop
const RAMP = 0.04; // speed gained per second of play within a level
const RAMP_MAX = 2.5;
const MAX_SPEED = 19;
const SLOW_FACTOR = 0.62;
const WIDE_TIME = 15;
const SLOW_TIME = 10;
const DROP_CHANCE = 0.15;
const MAX_PILLS_FALLING = 2;
const BRICK_POINTS = 50;
const COMBO_POINTS = 10; // extra per brick broken in a row without touching the paddle
const CLEAR_BONUS = 1000;
const PILL_POINTS = 100;
const CLEAR_TIME = 2.2; // seconds between a cleared level and the next one
const FIZZ_TIME = 0.22; // seconds between sparks from the bombs' fuses
const DEMO_LEVEL = LEVELS.findIndex((l) => l.name === 'Heart'); // plays itself behind the title
const DEMO_SPEED = 10;
const SAVE_KEY = 'brick-breaker';

// The brick sound climbs the D minor pentatonic scale (in semitones) with
// every brick hit before the ball touches the paddle again.
const CHAIN_STEPS = [0, 3, 5, 7, 10, 12, 15, 17, 19];

const CAM_Y = 23;
const CAM_Z = 9.6;
const LOOK_Z = 0.7;
// The part of the view that must stay on screen (width / height): the table
// and the score columns beside it. Taller screens zoom in on it.
const VIEW_ASPECT = 1.3;

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const sound = createSound(hh, {
  sfx: [
    'paddle', 'wall', 'brick', 'dent', 'clank', 'break', 'boom', 'fall', 'lose', 'launch',
    'pill', 'catch', 'wide', 'multi', 'slow', 'life', 'expire', 'combo', 'ready', 'clear',
    'over', 'record', 'move', 'select', 'back', 'pause', 'start',
  ],
  music: 'theme',
});

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 34, 60);
const camera = new THREE.PerspectiveCamera(44, hh.aspect, 1, 64);
hh.fitCamera(camera, { minAspect: VIEW_ASPECT });

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a4a9a, 1.3));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-4, 12, 7);
scene.add(sun);

createWorld(scene);
const bricks = createBricks(scene, onBlast);
const paddle = createPaddle(scene);
const effects = createEffects(scene);
const powerups = createPowerups(scene);
const hud = createHud(hh.hud);

let state = 'title'; // title | play | lost | clear | paused | over
let pausedFrom = 'play'; // the state to go back to after a pause
let demo = true; // the title screen plays by itself, silently, and scores nothing
let level = 0;
let startAt = 0; // the level a new game starts on (title menu)
let score = 0;
let lives = 0;
let combo = 0; // bricks broken since the paddle last touched a ball
let chain = 0; // bricks hit (broken or dented) since then, for the rising pitch
let levelTime = 0;
let wideTime = 0;
let slowTime = 0;
let speed = BASE_SPEED;
let stateTime = 0;
let demoWait = 0;
let shake = 0;
let aiOffset = 0;
let titleTime = 0;
let fizz = 0;
let menuSel = 0;
let bricksBroken = 0; // this game, for the game over panel
let bestCombo = 0;
let passedBest = false; // the NEW BEST callout shows once a game
const saved = hh.load(SAVE_KEY, null);
let best = saved?.best || 0;
let furthest = saved?.level || 1; // highest level number reached
let bestAtStart = best;

const CONFETTI = [0xff5d73, 0xff9f45, 0xffdc4a, 0x6fdc6a, 0x34d6c4, 0x4d9dff, 0xa66bff, 0xff6fc8];

// Called by the ball physics.
const events = {
  // Returns what bricks.hit returned: 0 gold, 1 cracked, 2 broken.
  brick(cell) {
    const result = bricks.hit(cell);
    const x = bricks.cellX(cell);
    const z = bricks.cellZ(cell);
    if (result > 0 && !demo) {
      const step = CHAIN_STEPS[Math.min(chain, CHAIN_STEPS.length - 1)];
      chain++;
      sound.play('brick', { rate: 2 ** (step / 12), volume: 0.8, pan: pan(x) });
    }
    if (result === 2) {
      broke(cell, x, z);
      if (!demo) sound.play('break', { rate: wobble(), volume: 0.75, pan: pan(x) });
    } else if (result === 1) {
      effects.sparks(x, z, 5, 0xffffff);
      if (!demo) {
        score += 10;
        sound.play('dent', { rate: wobble() * (bricks.maxHp(cell) === 3 ? 0.94 : 1), pan: pan(x) });
      }
    } else {
      effects.sparks(x, z, 4, 0xffd84a);
      if (!demo) sound.play('clank', { rate: wobble(), volume: 0.8, pan: pan(x) });
    }
    return result;
  },

  wall(ball) {
    effects.sparks(ball.x, ball.z, 2, 0xbff6ff);
    if (!demo) sound.play('wall', { rate: wobble(), volume: 0.7, pan: pan(ball.x) });
  },

  paddle(ball) {
    paddle.bump();
    combo = 0;
    chain = 0;
    effects.sparks(ball.x, ball.z + 0.2, 4, 0x8fe9ff);
    // The demo aims somewhere new after every hit.
    aiOffset = (Math.random() - 0.5) * paddle.halfW * 1.5;
    if (!demo) sound.play('paddle', { rate: wobble(), pan: pan(ball.x) });
  },

  fell(ball) {
    shake = Math.max(shake, 0.12);
    // The last ball gets the big sound when the life is lost.
    if (!demo && balls.alive() > 0) sound.play('fall', { pan: pan(ball.x) });
  },
};

const balls = createBalls(scene, bricks, paddle, events);

// A small random pitch change, so repeated sounds do not machine-gun.
function wobble() {
  return 0.96 + Math.random() * 0.08;
}

// Stereo position from a spot on the table.
function pan(x) {
  return (x / FIELD_R) * 0.6;
}

// A brick broke, from the ball or from a bomb's blast.
function broke(cell, x, z) {
  const bomb = bricks.isBomb(cell);
  effects.burst(x, z, bricks.colorOf(cell), bomb ? 16 : 9);
  shake = Math.max(shake, bomb ? 0.3 : 0.07);
  if (bomb) {
    effects.sparks(x, z, 10, 0xffd84a);
    if (!demo) sound.play('boom', { rate: wobble(), pan: pan(x) });
  }
  if (demo) return;
  score += BRICK_POINTS * bricks.maxHp(cell) + Math.min(combo, 20) * COMBO_POINTS;
  combo++;
  bricksBroken++;
  bestCombo = Math.max(bestCombo, combo);
  if (combo % 5 === 0) {
    hud.callout(`COMBO ×${combo}`, '#ffd84a');
    sound.play('combo', { rate: combo >= 15 ? 1.12 : combo >= 10 ? 1.06 : 1 });
  }
  maybeDrop(x, z);
}

// A bomb's blast hit a brick.
function onBlast(cell, result) {
  const x = bricks.cellX(cell);
  const z = bricks.cellZ(cell);
  if (result === 2) {
    broke(cell, x, z);
    if (!demo) sound.play('break', { rate: wobble() * 0.92, volume: 0.6, pan: pan(x) });
  } else {
    effects.sparks(x, z, 5, 0xffffff);
    if (!demo) {
      score += 10;
      sound.play('dent', { rate: wobble(), volume: 0.7, pan: pan(x) });
    }
  }
}

function maybeDrop(x, z) {
  if (Math.random() > DROP_CHANCE || powerups.falling() >= MAX_PILLS_FALLING) return;
  const r = Math.random();
  let kind = r < 0.32 ? WIDE : r < 0.62 ? MULTI : r < 0.88 ? SLOW : LIFE;
  if (kind === LIFE && lives >= MAX_LIVES) kind = WIDE;
  if (kind === MULTI && balls.alive() >= MAX_ALIVE) kind = SLOW;
  powerups.spawn(x, z, kind);
  sound.play('pill', { rate: wobble(), volume: 0.8, pan: pan(x) });
}

const POWER_SOUND = ['wide', 'multi', 'slow', 'life'];

function applyPower(kind) {
  score += PILL_POINTS;
  paddle.bump();
  effects.sparks(paddle.x, PADDLE_Z, 10, 0xffffff);
  hud.callout(KINDS[kind].name, KINDS[kind].color);
  sound.play('catch', { pan: pan(paddle.x) });
  sound.play(POWER_SOUND[kind], { delay: 0.05 });
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
  chain = 0;
  speed = targetSpeed();
}

function startLevel(n) {
  loadLevel(n);
  const { name, tip } = LEVELS[n % LEVELS.length];
  const loop = Math.floor(n / LEVELS.length);
  hud.levelCard(n + 1, name, loop === 0 ? tip : '', n % LEVELS.length, LEVELS.length, loop);
  hud.callout('');
  sound.play('ready', { delay: 0.15 });
  if (n + 1 > furthest) {
    furthest = n + 1;
    save();
  }
}

function save() {
  hh.save(SAVE_KEY, { best, level: furthest });
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

// Title menu: start a game (on any level already reached) and the sound options.
function titleItems() {
  return furthest > 1 ? ['play', 'level', 'sound', 'music'] : ['play', 'sound', 'music'];
}

function titleLabel(item) {
  if (item === 'play') return 'PLAY';
  if (item === 'level') return `START AT LEVEL <span class="arrows">◀</span> ${startAt + 1} <span class="arrows">▶</span>`;
  if (item === 'sound') return `SOUND <b>${ON_OFF(sound.sfxOn)}</b>`;
  return `MUSIC <b>${ON_OFF(sound.musicOn)}</b>`;
}

function showTitle() {
  hud.message(
    `<div class="title">BRICK BREAKER</div>` +
      menuRows(titleItems(), titleLabel) +
      (best > 0 ? `<div class="small">Best ${best} · Level ${furthest} reached</div>` : '') +
      `<div class="small keys">D-pad move · ${KEY('A')} launch · ${KEY('START')} pause</div>`,
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

// Up / down moves through the items; returns the item A chose, or null.
// Left / right flip a toggle or change the start level.
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
    const max = Math.min(furthest, LEVELS.length);
    startAt = (startAt + dx + max) % max;
    sound.play('move', { rate: 1 + startAt * 0.02 });
    return 'redraw';
  }
  if ((dx && (item === 'sound' || item === 'music')) || input.pressed('A')) return item;
  return null;
}

function toggle(item) {
  if (item === 'sound') sound.setSfx(!sound.sfxOn);
  else sound.setMusic(!sound.musicOn);
  // Heard only when effects are (still) on.
  sound.play('select');
}

// ---------------------------------------------------------------- states

function toTitle() {
  state = 'title';
  demo = true;
  menuSel = 0;
  startAt = Math.min(startAt, Math.min(furthest, LEVELS.length) - 1);
  paddle.reset();
  effects.clear();
  loadLevel(DEMO_LEVEL);
  demoWait = 0;
  hud.showStats(false);
  hud.banner('');
  hud.callout('');
  hud.hint('');
  sound.duck(false);
  sound.startMusic();
  showTitle();
}

function start() {
  state = 'play';
  demo = false;
  score = 0;
  lives = START_LIVES;
  bricksBroken = 0;
  bestCombo = 0;
  passedBest = false;
  bestAtStart = best;
  paddle.reset();
  effects.clear();
  hud.showStats(true);
  hud.message('');
  sound.duck(false);
  sound.startMusic();
  sound.play('start');
  startLevel(startAt);
}

function pause() {
  pausedFrom = state;
  state = 'paused';
  menuSel = 0;
  hud.hint('');
  sound.play('pause');
  sound.duck(true);
  showPause();
}

function resume() {
  state = pausedFrom;
  hud.message('');
  sound.duck(false);
}

function loseLife() {
  lives--;
  state = 'lost';
  stateTime = 0;
  shake = 0.45;
  hud.hurt();
  hud.hint('');
  clearPowers();
  sound.play('lose');
}

function levelClear() {
  state = 'clear';
  stateTime = 0;
  score += CLEAR_BONUS;
  keepBest();
  // The balls still in play burst into sparkles.
  for (let i = 0; i < balls.list.length; i++) {
    const b = balls.list[i];
    if (b.active && b.falling <= 0) effects.burst(b.x, b.z, 0xffffff, 8);
  }
  balls.reset();
  clearPowers();
  for (let i = 0; i < CONFETTI.length; i++) {
    effects.burst(-6 + i * 1.7, -5 + Math.random() * 4, CONFETTI[i], 7);
  }
  shake = 0.2;
  hud.banner(`LEVEL ${level + 1} CLEAR!`, `+${CLEAR_BONUS} bonus`);
  hud.hint('');
  sound.duck(true);
  sound.play('clear');
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  const record = keepBest();
  sound.duck(true);
  sound.play(record ? 'record' : 'over');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big-score">${score}</div>` +
      `<div class="stats"><span>Level <b>${level + 1}</b></span><span>Bricks <b>${bricksBroken}</b></span>` +
      `<span>Combo <b>×${bestCombo}</b></span></div>` +
      `<div class="small">Best ${best} · Level ${furthest} reached</div>` +
      `<div class="keys">${KEY('A')} play again · ${KEY('B')} title</div>`,
    record ? 'record' : '',
  );
}

function updatePlay(dt) {
  paddle.update(dt, input.dpad.x);
  if (balls.hasAttached()) {
    const ready = bricks.ready();
    hud.hint(ready ? 'Press A to launch' : '');
    if (ready && input.pressed('A')) {
      balls.launch();
      sound.play('launch', { pan: pan(paddle.x) });
    }
  } else {
    hud.hint('');
    levelTime += dt;
  }

  if (wideTime > 0) {
    wideTime = Math.max(0, wideTime - dt);
    if (wideTime === 0) {
      paddle.setWide(false);
      sound.play('expire');
    }
  }
  if (slowTime > 0) {
    slowTime = Math.max(0, slowTime - dt);
    if (slowTime === 0) {
      balls.setSlowLook(false);
      sound.play('expire', { rate: 1.12 });
    }
  }
  speed += (targetSpeed() - speed) * Math.min(1, dt * 3);

  balls.update(dt, speed);
  const caught = powerups.update(dt, paddle);
  if (caught >= 0) applyPower(caught);

  if (!passedBest && bestAtStart > 0 && score > bestAtStart) {
    passedBest = true;
    hud.callout('NEW BEST!', '#8fe9ff');
    sound.play('record', { volume: 0.6 });
  }

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

function updateTitle() {
  const items = titleItems();
  if (input.pressed('START')) {
    start();
    return;
  }
  const item = menuInput(items);
  if (item === 'play' || item === 'level') start();
  else if (item === 'sound' || item === 'music') {
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

toTitle();

// Upload every texture and compile every material now, while loading: the
// power-up pills are not drawn until the first one drops, and that would
// otherwise stall the game in the middle of play.
scene.traverse((object) => {
  if (object.material?.map) renderer.initTexture(object.material.map);
});
renderer.compile(scene, camera);

hh.run((dt) => {
  if (state !== 'paused') stateTime += dt;

  if (state === 'title') {
    titleTime += dt;
    updateDemo(dt);
    updateTitle();
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else updatePlay(dt);
  } else if (state === 'lost') {
    // A short beat to see the ball drop, then serve again or end the game.
    if (input.pressed('START')) {
      pause();
    } else {
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
    }
  } else if (state === 'clear') {
    if (input.pressed('START')) {
      pause();
    } else {
      paddle.update(dt, input.dpad.x);
      if (stateTime > CLEAR_TIME) {
        state = 'play';
        sound.duck(false);
        startLevel(level + 1);
      }
    }
  } else if (state === 'paused') {
    updatePaused();
  } else if (state === 'over') {
    // A short delay so a button mashed while losing does not restart at once.
    if (stateTime > 0.6 && input.pressed('A')) start();
    else if (stateTime > 0.6 && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }

  if (state !== 'paused') {
    bricks.update(dt);
    // Live bombs fizz: a spark from one fuse after another.
    fizz -= dt;
    if (fizz <= 0 && bricks.ready()) {
      fizz = FIZZ_TIME;
      const cell = bricks.nextBomb();
      if (cell >= 0) effects.fuse(bricks.cellX(cell), bricks.cellZ(cell));
    }
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
  const jitter = state === 'paused' ? 0 : shake * 0.7;
  const sway = state === 'title' ? Math.sin(titleTime * 0.4) * 1.2 : 0;
  camera.position.set(
    paddle.x * 0.05 + sway + (Math.random() - 0.5) * jitter,
    CAM_Y + (Math.random() - 0.5) * jitter,
    CAM_Z,
  );
  camera.lookAt(paddle.x * 0.03, 0, LOOK_Z);

  renderer.render(scene, camera);
});
