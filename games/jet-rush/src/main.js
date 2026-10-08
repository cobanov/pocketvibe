// Jet Rush: a jetpack side-scroller through an endless lab corridor.
// Hold A (or UP) to fly, let go to fall; dodge zappers and missiles, grab coins.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, CAM_X, CAM_Z, FOV, HERO_X, MID_Y } from './shared.js';
import { createWorld } from './world.js';
import { createParticles } from './particles.js';
import { createHero } from './hero.js';
import { createMissiles, createZappers } from './hazards.js';
import { createCoins } from './coins.js';
import { createLevel } from './level.js';
import { createHud } from './hud.js';

const START_SPEED = 9;
const MAX_SPEED = 17.5;
const ACCEL = 0.075; // speed gained per second of flight
const TITLE_SPEED = 7;
const COIN_BONUS = 5; // points per coin on top of the metres
const MILESTONE = 250; // metres between distance toasts
const SAVE_KEY = 'jet-rush';

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 15, 34);

const camera = new THREE.PerspectiveCamera(FOV, hh.width / hh.height, 0.5, 36);
const lookAt = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7fa3, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-3, 8, 10);
scene.add(sun);

const world = createWorld(scene);
const particles = createParticles(scene);
const hero = createHero(scene, particles);
const zappers = createZappers(scene, particles);
const missiles = createMissiles(scene, particles);
const coinField = createCoins(scene, particles, zappers);
const level = createLevel(zappers, coinField, missiles);
const hud = createHud(hh.hud);

let state = 'title'; // title | play | paused | dying | over
let speed = 0;
let runTime = 0;
let distance = 0;
let coins = 0;
let stateTime = 0;
let time = 0;
let shake = 0;
let camY = MID_Y;
let nextMilestone = MILESTONE;
let passedBest = false;
let deathKind = 'zap';
const saved = hh.load(SAVE_KEY, { best: 0, bestDist: 0 });
let best = saved.best;
let bestDist = saved.bestDist;

const HINT = 'Hold A to fly · let go to fall';

function score() {
  return Math.floor(distance) + coins * COIN_BONUS;
}

function clearAll() {
  zappers.clear();
  missiles.clear();
  coinField.clear();
  particles.clear();
}

function toTitle() {
  state = 'title';
  clearAll();
  hero.reset();
  world.setBest(null);
  hud.showStats(false);
  hud.message(
    `<div class="logo">JET<span>RUSH</span></div>` +
      `<div class="blink">Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small best">Best ${best}</div>` : ''),
  );
}

function start() {
  state = 'play';
  speed = START_SPEED;
  runTime = 0;
  distance = 0;
  coins = 0;
  nextMilestone = MILESTONE;
  passedBest = false;
  clearAll();
  level.reset();
  hero.reset();
  hud.showStats(true);
  hud.distance(0);
  hud.coins(0);
  hud.message('');
}

function die(kind, x, y) {
  state = 'dying';
  stateTime = 0;
  deathKind = kind;
  hero.die(kind);
  missiles.cancelWarnings();
  speed *= 0.8; // the tumble slides on at this speed and slows down
  if (kind === 'zap') {
    shake = 0.3;
    hud.flash('rgba(160, 245, 255, 0.55)');
    particles.burst(HERO_X, hero.centerY(), 16, 7, 0.45, 0.22, 0xffffff, 0x2fc8ff, 0);
  } else {
    shake = 0.55;
    hud.flash('rgba(255, 170, 60, 0.65)');
    particles.burst(x, y, 22, 8, 0.55, 0.5, 0xfff07a, 0xff3d1f, 0);
    particles.burst(x, y, 12, 4, 0.9, 0.6, 0xb9c2d0, 0x3a4052, -3);
  }
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  const meters = Math.floor(distance);
  const final = score();
  const record = final > best;
  if (record) best = final;
  if (meters > bestDist) bestDist = meters;
  hh.save(SAVE_KEY, { best, bestDist });
  const title = record ? 'NEW BEST!' : deathKind === 'zap' ? 'ZAPPED!' : 'KABOOM!';
  hud.message(
    `<div class="title">${title}</div>` +
      `<div class="stats">` +
      `<span>Distance</span><b>${meters} m</b>` +
      `<span>Coins</span><b>${coins} × ${COIN_BONUS}</b>` +
      `<span>Score</span><b class="score">${final}</b>` +
      `</div>` +
      `<div class="small">Best ${best}</div>` +
      `<div class="blink">Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

toTitle();

hh.run((dt) => {
  time += dt;
  stateTime += dt;
  let move = 0;

  if (state === 'title') {
    move = TITLE_SPEED * dt;
    hero.updateTitle(dt, time);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      state = 'paused';
      hud.message(
        `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`,
      );
    } else {
      runTime += dt;
      speed = Math.min(MAX_SPEED, START_SPEED + runTime * ACCEL);
      const difficulty = (speed - START_SPEED) / (MAX_SPEED - START_SPEED);
      move = speed * dt;
      distance += move;

      hero.update(dt, input.down('A') || input.down('UP'), speed);
      level.update(move, difficulty, speed, hero.centerY());
      zappers.update(dt, move);
      missiles.update(dt, move, hero.centerY());
      coinField.update(dt, move);

      const got = coinField.collect(hero);
      if (got > 0) {
        coins += got;
        hud.coins(coins);
      }

      if (zappers.hit(hero)) {
        die('zap', 0, 0);
      } else {
        const missile = missiles.hit(hero);
        if (missile) die('boom', missile.x, missile.y);
      }

      const meters = Math.floor(distance);
      hud.distance(meters);
      if (bestDist > 0 && !passedBest && meters > bestDist) {
        passedBest = true;
        hud.toast('NEW BEST!');
      } else if (meters >= nextMilestone) {
        hud.toast(`${nextMilestone} m`);
        nextMilestone += MILESTONE;
      }
    }
  } else if (state === 'dying') {
    // Hit stop while the hero is electrocuted, then the slide slows down.
    if (hero.freeze <= 0) speed *= Math.exp(-dt * 1.8);
    move = hero.freeze > 0 ? 0 : speed * dt;
    hero.updateDead(dt);
    zappers.update(hero.freeze > 0 ? 0 : dt, move);
    missiles.update(dt, move, 0);
    coinField.update(dt, move);
    if ((hero.settled && stateTime > 1.3) || stateTime > 3.5) gameOver();
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    // A short delay so a button mashed during the crash does not restart at once.
    if (stateTime > 0.6 && input.pressed('A')) start();
    else if (stateTime > 0.6 && input.pressed('B')) toTitle();
  }

  if (state !== 'paused') {
    if (state === 'over') move = 0;
    world.update(move);
    particles.update(dt, move);
  }
  if (state !== 'title' && bestDist > 30) world.setBest(HERO_X + bestDist - distance);

  // Camera: fixed side view that follows the hero's height a little.
  const heroY = hero.dead ? hero.cy : hero.centerY();
  camY += (MID_Y + (heroY - MID_Y) * 0.12 - camY) * Math.min(1, dt * 4);
  const jolt = state === 'paused' ? 0 : shake;
  shake = Math.max(0, shake - (state === 'paused' ? 0 : dt));
  const jx = (Math.random() - 0.5) * jolt;
  const jy = (Math.random() - 0.5) * jolt;
  camera.position.set(CAM_X + jx, camY + jy, CAM_Z);
  lookAt.set(CAM_X + jx * 0.5, camY, 0);
  camera.lookAt(lookAt);

  renderer.render(scene, camera);
});
