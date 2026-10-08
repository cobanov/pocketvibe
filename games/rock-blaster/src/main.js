// Rock Blaster: an asteroids-style shooter on a wrap-around starfield.
// D-pad LEFT/RIGHT turns, UP thrusts, A fires, B jumps to hyperspace, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, HALF_H, HALF_W, rand } from './shared.js';
import { createSpace } from './space.js';
import { createFx } from './fx.js';
import { SIZES, createRocks } from './rocks.js';
import { createShots } from './shots.js';
import { SHIP_HIT, createShip } from './ship.js';
import { SAUCER_HIT, SAUCER_POINTS, createSaucer } from './saucer.js';
import { createHud } from './hud.js';

const START_LIVES = 3;
const EXTRA_LIFE = 10000; // points per extra ship
const MAX_ROCKS = 12; // large rocks in the biggest waves
const RESPAWN_DELAY = 1.5; // seconds after a crash before the ship may return
const WAVE_DELAY = 2.0; // seconds between clearing a wave and the next one
const BULLET_HIT = 0.16;
const SAVE_KEY = 'rock-blaster';

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
// The play plane sits 30 units from the camera; only the star layers behind it
// reach into the fog, which dims the farther ones.
scene.fog = new THREE.Fog(BG, 30, 62);

// Orthographic top-down view that maps the field exactly onto the screen.
const camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, HALF_H, -HALF_H, 1, 55);
camera.position.set(0, 0, 30);

// The hemisphere's sky side faces the camera, so faces turned to the viewer read brightest.
const hemi = new THREE.HemisphereLight(0xd8e4ff, 0x3a2a5c, 1.5);
hemi.position.set(0, 0.35, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-6, 8, 10);
scene.add(sun);

const space = createSpace(scene);
const fx = createFx(scene);
const rocks = createRocks(scene, fx);
const shots = createShots(scene);
const saucer = createSaucer(scene, fx);
const ship = createShip(scene, fx, findSpot);
const hud = createHud(hh.hud);

let state = 'title'; // title | play | paused | over
let score = 0;
let lives = 0;
let wave = 0;
let nextLife = EXTRA_LIFE;
let respawnTimer = 0;
let respawnWait = 0;
let waveTimer = -1; // counting down to the next wave when >= 0
let saucerTimer = 0;
let overTimer = -1; // counting down to the game over screen when >= 0
let overTime = 0;
let toastTimer = 0;
let shake = 0;
let slowMo = 0; // seconds of slow motion left after a big hit
let fireLock = false; // the A press that started the game must be released before firing
let best = hh.load(SAVE_KEY, { best: 0 }).best;

const HINT = '◀ ▶ turn · ▲ thrust · A fire · B hyperspace';

function speedMul() {
  return Math.min(1.7, 1 + (wave - 1) * 0.08);
}

// Finds a spot for a hyperspace exit: random, but away from rocks and the
// saucer if one of a few tries allows it.
function findSpot(out) {
  for (let pass = 0; pass < 3; pass++) {
    const room = pass === 0 ? 4 : pass === 1 ? 2.6 : 1.4;
    for (let tries = 0; tries < 12; tries++) {
      out.x = rand(-HALF_W + 2, HALF_W - 2);
      out.y = rand(-HALF_H + 2, HALF_H - 2);
      if (!rocks.clearAt(out.x, out.y, room)) continue;
      if (saucer.active && (out.x - saucer.x) ** 2 + (out.y - saucer.y) ** 2 < 36) continue;
      return;
    }
  }
}

function showToast(html, cls, seconds) {
  hud.toast(html, cls);
  toastTimer = seconds;
}

function toTitle() {
  state = 'title';
  rocks.clear();
  rocks.spawnAttract();
  shots.clear();
  saucer.hide();
  ship.hide();
  fx.clear();
  hud.showStats(false);
  hud.toast('');
  hud.message(
    `<div class="title">ROCK BLASTER</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small best">Best ${best}</div>` : ''),
  );
}

function start() {
  state = 'play';
  score = 0;
  lives = START_LIVES;
  wave = 0;
  nextLife = EXTRA_LIFE;
  waveTimer = -1;
  overTimer = -1;
  fireLock = true;
  rocks.clear();
  shots.clear();
  saucer.hide();
  fx.clear();
  ship.reset();
  hud.showStats(true);
  hud.score(0);
  hud.lives(lives);
  hud.message('');
  nextWave();
}

function nextWave() {
  wave++;
  const ax = ship.alive ? ship.x : 0;
  const ay = ship.alive ? ship.y : 0;
  rocks.spawnWave(Math.min(MAX_ROCKS, 3 + wave), ax, ay, speedMul());
  // The saucer first shows up in wave 2.
  saucerTimer = wave >= 2 ? rand(7, 12) : Infinity;
  hud.wave(wave);
  showToast(`WAVE ${wave}`, 'wave', 1.6);
}

function addScore(points) {
  score += points;
  if (score >= nextLife) {
    nextLife += EXTRA_LIFE;
    lives++;
    hud.lives(lives);
    showToast('EXTRA SHIP!', 'bonus', 1.6);
    fx.flash(0x5cff9a, 0.16, 0.35);
    if (ship.alive) fx.ring(ship.x, ship.y, 0x5cff9a, 3.2, 0.5);
  }
}

function killShip() {
  ship.explode();
  lives--;
  hud.lives(lives);
  shake = 0.75;
  slowMo = 0.3;
  fx.flash(0xff5a3c, 0.26, 0.4);
  if (lives > 0) {
    respawnTimer = RESPAWN_DELAY;
    respawnWait = 0;
  } else {
    overTimer = 1.8; // let the explosion play out first
  }
}

function gameOver() {
  state = 'over';
  overTime = 0;
  overTimer = -1;
  const record = score > best;
  if (record) {
    best = score;
    hh.save(SAVE_KEY, { best });
  }
  hud.toast('');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${score}</div>` +
      `<div class="small">Wave ${wave} · Best ${best}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

function hitRock(i, dx, dy) {
  const size = rocks.get(i).size;
  addScore(rocks.destroy(i, dx, dy, speedMul()));
  shake = Math.max(shake, SIZES[size].shake);
}

function hitSaucer() {
  saucer.destroy();
  addScore(SAUCER_POINTS);
  shake = Math.max(shake, 0.35);
  fx.flash(0xff5fd2, 0.22, 0.3);
}

function near(ax, ay, bx, by, d) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy < d * d;
}

function collide() {
  // Player bullets against rocks and the saucer, tested at the bullet and
  // halfway back along its last step so fast shots cannot skip a small rock.
  const list = shots.player;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!b.active) continue;
    let r = rocks.hit(b.x, b.y, BULLET_HIT);
    if (r < 0) r = rocks.hit((b.x + b.px) * 0.5, (b.y + b.py) * 0.5, BULLET_HIT);
    if (r >= 0) {
      b.active = false;
      hitRock(r, b.vx, b.vy);
      continue;
    }
    if (saucer.active && near(b.x, b.y, saucer.x, saucer.y, SAUCER_HIT + BULLET_HIT)) {
      b.active = false;
      hitSaucer();
    }
  }

  if (!ship.vulnerable) return;

  const r = rocks.hit(ship.x, ship.y, SHIP_HIT);
  if (r >= 0) {
    const rock = rocks.get(r);
    hitRock(r, rock.x - ship.x, rock.y - ship.y);
    killShip();
    return;
  }
  if (saucer.active && near(ship.x, ship.y, saucer.x, saucer.y, SAUCER_HIT + SHIP_HIT)) {
    hitSaucer();
    killShip();
    return;
  }
  const enemy = shots.enemy;
  for (let i = 0; i < enemy.length; i++) {
    const b = enemy[i];
    if (b.active && near(b.x, b.y, ship.x, ship.y, SHIP_HIT + BULLET_HIT)) {
      b.active = false;
      killShip();
      return;
    }
  }
}

// True if nothing dangerous is close to the centre of the screen.
function centreClear(radius) {
  if (!rocks.clearAt(0, 0, radius)) return false;
  if (saucer.active && near(0, 0, saucer.x, saucer.y, radius + 2)) return false;
  const enemy = shots.enemy;
  for (let i = 0; i < enemy.length; i++) {
    if (enemy[i].active && near(0, 0, enemy[i].x, enemy[i].y, radius)) return false;
  }
  return true;
}

// Everything that runs while a game is on, even after the ship is lost.
function playTimers(dt) {
  if (!ship.alive && lives > 0) {
    respawnTimer -= dt;
    if (respawnTimer <= 0) {
      // Wait for a clear centre, asking for a little less room the longer it takes.
      respawnWait += dt;
      if (centreClear(Math.max(3.2, 6 - respawnWait * 0.8))) ship.reset();
    }
  }

  if (overTimer >= 0) {
    overTimer -= dt;
    if (overTimer < 0) gameOver();
  }

  if (rocks.count === 0 && lives > 0) {
    if (waveTimer < 0) waveTimer = WAVE_DELAY;
    waveTimer -= dt;
    if (waveTimer <= 0) {
      waveTimer = -1;
      nextWave();
    }
  }

  if (!saucer.active && lives > 0) {
    saucerTimer -= dt;
    if (saucerTimer <= 0) {
      saucer.spawn(wave);
      // The next one comes a while after this one, sooner in later waves.
      saucerTimer = rand(14, 22) - Math.min(7, wave * 0.6);
    }
  }
}

toTitle();

hh.run((realDt) => {
  // A short slow motion sells the big hits.
  const dt = slowMo > 0 ? realDt * 0.3 : realDt;
  slowMo = Math.max(0, slowMo - realDt);

  if (state === 'title') {
    rocks.update(dt);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      state = 'paused';
      toastTimer = 0;
      hud.toast('');
      hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
    } else {
      // LEFT turns counter-clockwise, which is a positive angle.
      ship.update(dt, -input.dpad.x, input.down('UP'));
      if (fireLock && !input.down('A')) fireLock = false;
      if (input.down('A') && !fireLock) ship.fire(shots, input.pressed('A'));
      if (input.pressed('B')) ship.hyperspace();
      rocks.update(dt);
      saucer.update(dt, ship, shots);
      shots.update(dt);
      collide();
      playTimers(dt);
      hud.score(score);
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    overTime += realDt;
    rocks.update(dt);
    saucer.update(dt, ship, shots);
    shots.update(dt);
    // A short delay so a button mashed during the crash does not restart at once.
    if (overTime > 0.7 && input.pressed('A')) start();
    else if (overTime > 0.7 && input.pressed('B')) toTitle();
  }

  if (state !== 'paused') {
    fx.update(dt);
    space.update(dt, ship.alive ? ship.vx : 0, ship.alive ? ship.vy : 0);
    if (toastTimer > 0) {
      toastTimer -= realDt;
      if (toastTimer <= 0) hud.toast('');
    }
    shake = Math.max(0, shake - realDt * 1.8);
    const jitter = shake * 1.6; // world units; 1 unit is 20 pixels
    camera.position.x = (Math.random() - 0.5) * jitter;
    camera.position.y = (Math.random() - 0.5) * jitter;
  }

  renderer.render(scene, camera);
});
