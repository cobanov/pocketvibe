// Star Defender: hold the line against a marching alien formation.
// D-pad left/right moves the ship, A fires, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { PLAYER_Z, SPACE, rand } from './shared.js';
import { createBackground } from './background.js';
import { createShields, SHIELD_MIN_Z, SHIELD_X } from './shields.js';
import { createAliens, ROW_COLORS } from './aliens.js';
import { createSaucer } from './saucer.js';
import { createFx } from './fx.js';
import { createPlayer, SHIP_COLORS } from './player.js';
import { createShots } from './shots.js';
import { createHud } from './hud.js';

const START_LIVES = 3;
const MAX_LIVES = 5;
const EXTRA_LIFE_EVERY = 2500;
const FIRE_HOLD = 0.3; // seconds between shots while A is held
const FIRE_TAP = 0.14; // a fresh press may fire once this much is left of FIRE_HOLD
const RESPAWN_TIME = 1.6;
const CLEAR_TIME = 1.6; // the warp between two waves
const SAVE_KEY = 'star-defender';

const hh = createHandheld({ clearColor: SPACE });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SPACE, 34, 88);

const camera = new THREE.PerspectiveCamera(44, hh.width / hh.height, 0.5, 92);
const CAM_Y = 23.5;
const CAM_Z = 13.5;
const LOOK_Z = -0.2;
const lookAt = new THREE.Vector3();
const popAt = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a2a66, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(4, 10, 9);
scene.add(sun);

const background = createBackground(scene);
const shields = createShields(scene);
const aliens = createAliens(scene);
const saucer = createSaucer(scene);
const fx = createFx(scene);
const player = createPlayer(scene);
const shots = createShots(scene, { aliens, shields, saucer, fx });
const hud = createHud(hh.hud);

let state = 'title'; // title | play | paused | over
let score = 0;
let lives = 0;
let wave = 1;
let nextLife = EXTRA_LIFE_EVERY;
let fireCd = 0;
let bombTimer = 0;
let respawnTimer = 0; // > 0 while the ship is gone between lives
let clearTimer = 0; // > 0 during the warp to the next wave
let overTime = 0;
let overPanel = '';
let shake = 0;
let warp = 0;
let demoTime = 0;
let demoFire = 0;
let best = hh.load(SAVE_KEY, { best: 0 }).best;

const HINT = '◀ ▶ move · A fire · START pause';
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const TABLE =
  `<div class="table">` +
  `<span><i class="dot" style="background:${hex(ROW_COLORS[0])}"></i>30</span>` +
  `<span><i class="dot" style="background:${hex(ROW_COLORS[1])}"></i>20</span>` +
  `<span><i class="dot" style="background:${hex(ROW_COLORS[3])}"></i>10</span>` +
  `<span><i class="dot" style="background:#ff4466"></i>???</span>` +
  `</div>`;

function resetField() {
  aliens.reset(wave);
  shields.reset();
  shots.clear();
  saucer.reset(rand(14, 22));
  bombTimer = 1;
}

function toTitle() {
  state = 'title';
  wave = 1;
  demoTime = 0;
  resetField();
  fx.clear();
  player.reset();
  hud.showStats(false);
  hud.message(
    `<div class="title">STAR DEFENDER</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      TABLE +
      (best > 0 ? `<div class="small">Best ${best}</div>` : ''),
  );
}

function start() {
  state = 'play';
  score = 0;
  lives = START_LIVES;
  wave = 1;
  nextLife = EXTRA_LIFE_EVERY;
  fireCd = 0;
  respawnTimer = 0;
  clearTimer = 0;
  resetField();
  fx.clear();
  player.reset();
  hud.showStats(true);
  hud.score(0);
  hud.wave(wave);
  hud.lives(lives);
  hud.message('');
  hud.banner('WAVE 1');
}

function nextWave() {
  wave++;
  resetField();
  hud.wave(wave);
  hud.banner(`WAVE ${wave}`);
  if (!player.alive && lives > 0) {
    respawnTimer = 0;
    player.respawn();
  }
}

// Shows a floating text at a point of the playfield.
function pop(text, x, y, z, cls) {
  popAt.set(x, y, z).project(camera);
  hud.pop(text, (popAt.x + 1) * 0.5 * hh.width, (1 - popAt.y) * 0.5 * hh.height, cls);
}

function addScore(points) {
  score += points;
  hud.score(score);
  if (score >= nextLife) {
    nextLife += EXTRA_LIFE_EVERY;
    if (lives < MAX_LIVES) {
      lives++;
      hud.lives(lives);
      pop('1UP', player.x, 1, PLAYER_Z - 1.5, 'life');
    }
  }
}

function destroyShip(invaded) {
  player.explode();
  lives = invaded ? 0 : lives - 1;
  hud.lives(lives);
  fx.burst(player.x, 0.5, PLAYER_Z, SHIP_COLORS[0], 26, 13, 0.26);
  fx.burst(player.x, 0.5, PLAYER_Z, SHIP_COLORS[1], 14, 10, 0.22);
  fx.burst(player.x, 0.5, PLAYER_Z, 0xffa62e, 16, 8, 0.2);
  shake = 0.6;
  hud.flash('hit');
  if (lives > 0) {
    respawnTimer = RESPAWN_TIME;
    return;
  }

  state = 'over';
  overTime = 0;
  const record = score > best;
  if (record) {
    best = score;
    hh.save(SAVE_KEY, { best });
  }
  overPanel =
    `<div class="title">${record ? 'NEW BEST!' : invaded ? 'INVADED!' : 'GAME OVER'}</div>` +
    `<div>Score ${score}</div>` +
    `<div class="small">Wave ${wave} · Best ${best}</div>` +
    `<div>Press A to play again</div>` +
    `<div class="small">B title</div>`;
}

function updatePlay(dt) {
  const holding = !player.alive || clearTimer > 0; // the formation waits

  player.update(dt, player.alive ? input.dpad.x : 0);
  fireCd -= dt;
  if (player.alive && clearTimer <= 0) {
    const tap = input.pressed('A') && fireCd <= FIRE_TAP;
    if ((tap || (input.down('A') && fireCd <= 0)) && shots.fire(player.x, PLAYER_Z - 0.9)) {
      fireCd = FIRE_HOLD;
      player.kick();
      fx.burst(player.x, 0.6, PLAYER_Z - 0.9, 0xfff7b0, 3, 3, 0.1);
    }
  }

  aliens.update(dt, !holding, shields);
  if (aliens.stepped) background.pulse(0.6);

  // Bombs: more of them, faster and more often on later waves.
  if (!holding && !aliens.entering) {
    bombTimer -= dt;
    if (bombTimer <= 0) {
      bombTimer = rand(0.6, 1.6) * Math.max(0.45, 1 - 0.07 * (wave - 1));
      if (shots.bombs() < Math.min(6, 2 + Math.floor(wave / 2))) {
        const i = aliens.shooter(player.x, Math.random() < 0.4);
        if (i >= 0) shots.drop(aliens.ax[i], aliens.az[i] + 0.5, Math.min(9.5, 6 + 0.4 * (wave - 1)));
      }
    }
  }

  saucer.update(dt, !holding && !aliens.entering && aliens.living >= 8, 18, 30);
  shots.update(dt, player.alive ? player : null);

  if (shots.points > 0) addScore(shots.points);
  if (shots.kills > 0) shake = Math.max(shake, 0.12);
  if (shots.bonus > 0) {
    pop(`+${shots.bonus}`, shots.bonusX, 1, saucer.z, 'bonus');
    shake = Math.max(shake, 0.3);
  }
  if (shots.shipHit) {
    destroyShip(false);
    return;
  }
  if (player.alive && aliens.frontZ > PLAYER_Z - 1.1) {
    destroyShip(true);
    return;
  }

  if (aliens.living === 0 && clearTimer <= 0) {
    clearTimer = CLEAR_TIME;
    shots.clear();
    hud.flash('clear');
    hud.banner('WAVE CLEAR');
  }
  if (clearTimer > 0) {
    clearTimer -= dt;
    if (clearTimer <= 0) nextWave();
  }

  if (respawnTimer > 0) {
    respawnTimer -= dt;
    if (respawnTimer <= 0) {
      shots.clearBombs();
      player.respawn();
    }
  }
}

// Behind the title the ship plays by itself.
function updateDemo(dt) {
  demoTime += dt;
  const target = Math.sin(demoTime * 0.55) * 8;
  player.update(dt, target > player.x + 0.3 ? 1 : target < player.x - 0.3 ? -1 : 0);

  // Fire only from the gaps between the bunkers.
  let clear = true;
  for (let i = 0; i < SHIELD_X.length; i++) {
    if (Math.abs(player.x - SHIELD_X[i]) < 1.9) clear = false;
  }
  demoFire -= dt;
  if (clear && demoFire <= 0 && !aliens.entering && shots.fire(player.x, PLAYER_Z - 0.9)) {
    player.kick();
    demoFire = rand(0.4, 0.9);
  }

  aliens.update(dt, true, shields);
  if (aliens.stepped) background.pulse(0.6);
  saucer.update(dt, true, 6, 12);
  shots.update(dt, null);
  if (aliens.living === 0 || aliens.frontZ > SHIELD_MIN_Z - 1.5) {
    aliens.reset(1);
    shields.reset();
  }
}

toTitle();

hh.run((dt) => {
  if (state === 'title') {
    updateDemo(dt);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      state = 'paused';
      hud.paused(true);
      hud.message(
        `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`,
      );
    } else {
      updatePlay(dt);
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.paused(false);
      hud.message('');
    } else if (input.pressed('B')) {
      hud.paused(false);
      toTitle();
    }
  } else if (state === 'over') {
    overTime += dt;
    player.update(dt, 0);
    aliens.update(dt, false, shields);
    saucer.update(dt, false, 0, 0);
    shots.update(dt, null);
    // Let the explosion play before the panel; then a short delay so a
    // button mashed during the crash does not restart at once.
    if (overPanel && overTime > 1.0) {
      hud.message(overPanel);
      overPanel = '';
    }
    if (overTime > 1.5 && input.pressed('A')) start();
    else if (overTime > 1.5 && input.pressed('B')) toTitle();
  }

  if (state !== 'paused') {
    shields.update();
    fx.update(dt);
    const target = clearTimer > 0 && clearTimer < CLEAR_TIME - 0.3 ? 1 : 0;
    warp += (target - warp) * Math.min(1, dt * 3);
    background.update(dt, warp);
    shake = Math.max(0, shake - dt);
  }

  const jitter = state === 'paused' ? 0 : shake * 1.3;
  camera.position.set(
    player.x * 0.08 + (Math.random() - 0.5) * jitter,
    CAM_Y + (Math.random() - 0.5) * jitter,
    CAM_Z,
  );
  lookAt.set(player.x * 0.05, 0, LOOK_Z);
  camera.lookAt(lookAt);

  renderer.render(scene, camera);
});
