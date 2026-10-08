// Jet Rush: a jetpack side-scroller through an endless lab corridor.
// Hold A (or UP) to fly, let go to fall; dodge zappers, missiles and lasers,
// grab coins.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { createSound } from './sound.js';
import { BG, CAM_X, CAM_Z, FOV, HERO_X, MID_Y, VIEW_HALF_W } from './shared.js';
import { createWorld } from './world.js';
import { createParticles } from './particles.js';
import { createHero } from './hero.js';
import { createMissiles, createZappers } from './hazards.js';
import { createLasers } from './lasers.js';
import { createCoins } from './coins.js';
import { createLevel } from './level.js';
import { createHud } from './hud.js';

const START_SPEED = 9;
const MAX_SPEED = 17.5;
const RAMP = 1500; // metres to full speed and every kind of pattern
const LATE = 1500; // metres after that until the hardest mix
const TITLE_SPEED = 7;
const COIN_BONUS = 5; // points per coin on top of the metres
const MILESTONE = 250; // metres between distance toasts
const SAVE_KEY = 'jet-rush';

// Coins picked up in quick succession climb the E minor scale (semitones),
// then rock between the top two notes.
const COIN_STEPS = [0, 2, 3, 5, 7, 8, 10, 12];
const CHAIN_GAP = 0.45; // s

// Loaded one at a time in this order: the title menu's sounds first.
const SFX = [
  'menu_move', 'menu_select', 'menu_back', 'start', 'jet', 'jet_on', 'step', 'land', 'coin', 'warn', 'lock',
  'launch', 'flyby', 'zap_hum', 'zapped', 'explode', 'thud', 'bump', 'scrape', 'laser_hum', 'laser_fire',
  'milestone', 'best', 'gameover', 'record', 'pause',
];

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;
const sound = createSound(hh, { sfx: SFX, music: 'theme' });

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 15, 34);

const camera = new THREE.PerspectiveCamera(FOV, hh.aspect, 0.5, 36);
hh.fitCamera(camera); // the corridor stays whole; wide screens see more ahead and behind
const lookAt = new THREE.Vector3();
// How much further than on the 3:2 screen the view reaches to each side at
// z = 0: hazards start and missiles launch that much further out.
const SIDE_ROOM = Math.max(0, CAM_Z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * hh.aspect - VIEW_HALF_W);

scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7fa3, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-3, 8, 10);
scene.add(sun);

const world = createWorld(scene);
const particles = createParticles(scene);
const hero = createHero(scene, particles, sound);
const zappers = createZappers(scene, particles);
const missiles = createMissiles(scene, particles, sound, SIDE_ROOM);
const lasers = createLasers(scene, particles, sound, SIDE_ROOM);
const coinField = createCoins(scene, particles, zappers, SIDE_ROOM);
const level = createLevel(zappers, coinField, missiles, lasers, SIDE_ROOM);
const hud = createHud(hh.hud);

// Continuous sounds, shaped every frame by what is going on.
const loops = {
  jet: sound.loop('jet'),
  scrape: sound.loop('scrape'),
  zap: sound.loop('zap_hum'),
  laser: sound.loop('laser_hum'),
};
const loopOn = { jet: false, scrape: false, zap: false, laser: false };

let state = 'title'; // title | play | paused | dying | over
let menu = 'title'; // the menu shown: title | options (on the title), pause
let cursor = 0;
let speed = 0;
let distance = 0;
let coins = 0;
let stateTime = 0;
let time = 0;
let shake = 0;
let camY = MID_Y;
let nextMilestone = MILESTONE;
let toastAge = 9;
let passedBest = false;
let deathKind = 'zap';
let chain = 0;
let lastCoin = -9;
const saved = hh.load(SAVE_KEY, {});
let best = saved.best ?? 0; // best score
let bestDist = saved.bestDist ?? 0;
let bestCoins = saved.bestCoins ?? 0;

const MENUS = {
  title: ['play', 'options'],
  options: ['sound', 'music', 'back'],
  pause: ['resume', 'sound', 'music', 'quit'],
};
const DEATH = { zap: 'ZAPPED!', boom: 'KABOOM!', laser: 'FRIED!' };

function label(id) {
  if (id === 'sound') return `Sound: ${sound.sfxOn ? 'On' : 'Off'}`;
  if (id === 'music') return `Music: ${sound.musicOn ? 'On' : 'Off'}`;
  if (id === 'quit') return 'Quit to title';
  return id[0].toUpperCase() + id.slice(1);
}

function menuHtml() {
  return (
    `<div class="menu">` +
    MENUS[menu].map((id, i) => `<div class="item${i === cursor ? ' on' : ''}">${label(id)}</div>`).join('') +
    `</div>`
  );
}

function recordsHtml() {
  if (bestDist <= 0) return '';
  return (
    `<div class="records">` +
    `<div><b>${bestDist} m</b><span>Best distance</span></div>` +
    `<div><b>${best}</b><span>Best score</span></div>` +
    `<div><b>${bestCoins}</b><span>Most coins</span></div>` +
    `</div>`
  );
}

// Draws the panel of the current state's menu.
function showMenu() {
  if (menu === 'title') {
    hud.message(
      `<div class="logo">JET<span>RUSH</span></div>` +
        menuHtml() +
        recordsHtml() +
        `<div class="small">Hold A to fly · let go to fall</div>` +
        `<div class="small dim">D-pad choose · A select</div>`,
    );
  } else if (menu === 'options') {
    hud.message(
      `<div class="title">OPTIONS</div>` + menuHtml() + `<div class="small dim">D-pad choose · A switch · B back</div>`,
    );
  } else {
    hud.message(
      `<div class="title">PAUSED</div>` + menuHtml() + `<div class="small dim">D-pad choose · A select · B resume</div>`,
    );
  }
}

function openMenu(name, at = 0) {
  menu = name;
  cursor = at;
  showMenu();
}

// D-pad up and down move the cursor. Returns the item chosen with A, 'back'
// for B, or null.
function menuInput() {
  const items = MENUS[menu];
  const dir = (input.pressed('DOWN') ? 1 : 0) - (input.pressed('UP') ? 1 : 0);
  if (dir !== 0) {
    cursor = (cursor + dir + items.length) % items.length;
    sound.play('menu_move');
    showMenu();
  }
  if (input.pressed('A')) return items[cursor];
  if (input.pressed('B')) return 'back';
  return null;
}

// Sound and music switches, shared by the options and pause menus.
function toggle(id) {
  if (id === 'sound') sound.setSfx(!sound.sfxOn);
  else sound.setMusic(!sound.musicOn);
  sound.play('menu_select');
  showMenu();
}

function drive(name, volume, rate) {
  if (volume > 0.001) {
    loops[name].set(volume, rate);
    loopOn[name] = true;
  } else if (loopOn[name]) {
    loops[name].stop(0.12);
    loopOn[name] = false;
  }
}

function updateLoops() {
  const live = state === 'play';
  drive('jet', live && hero.thrusting ? 0.42 : 0, 0.92 + Math.max(0, hero.vy) * 0.012);
  drive('scrape', live && hero.scraping ? 0.45 : 0, 1);
  let zap = 0;
  if (live) {
    const near = zappers.nearest(HERO_X, hero.centerY());
    if (near < 5) zap = 0.55 * (1 - near / 5) ** 2;
  }
  drive('zap', zap, 1);
  drive('laser', state === 'paused' ? 0 : lasers.humVolume, lasers.humRate);
}

function score() {
  return Math.floor(distance) + coins * COIN_BONUS;
}

function clearAll() {
  zappers.clear();
  missiles.clear();
  lasers.clear();
  coinField.clear();
  particles.clear();
}

function toTitle() {
  state = 'title';
  clearAll();
  hero.reset();
  hero.sfx = false;
  world.setBest(null);
  hud.showStats(false);
  sound.duck(false);
  openMenu('title');
}

function start() {
  state = 'play';
  speed = START_SPEED;
  distance = 0;
  coins = 0;
  chain = 0;
  nextMilestone = MILESTONE;
  toastAge = 9;
  passedBest = false;
  clearAll();
  level.reset();
  hero.reset();
  hero.sfx = true;
  hud.showStats(true);
  hud.distance(0);
  hud.coins(0);
  hud.message('');
  sound.play('start');
  sound.startMusic();
  sound.duck(false);
}

function pause() {
  state = 'paused';
  sound.play('pause');
  sound.duck(true);
  openMenu('pause');
}

function resume() {
  state = 'play';
  sound.play('menu_select');
  sound.duck(false);
  hud.message('');
}

function die(kind, x, y) {
  state = 'dying';
  stateTime = 0;
  deathKind = kind;
  hero.die(kind);
  missiles.cancelWarnings();
  lasers.cancel();
  sound.duck(true);
  speed *= 0.8; // the tumble slides on at this speed and slows down
  if (kind === 'zap') {
    shake = 0.3;
    hud.flash('rgba(160, 245, 255, 0.55)');
    particles.burst(HERO_X, hero.centerY(), 16, 7, 0.45, 0.22, 0xffffff, 0x2fc8ff, 0);
    sound.play('zapped');
  } else if (kind === 'laser') {
    shake = 0.35;
    hud.flash('rgba(255, 120, 90, 0.55)');
    particles.burst(HERO_X, hero.centerY(), 16, 7, 0.45, 0.22, 0xffffff, 0xff4a2a, 0);
    sound.play('zapped', { rate: 0.88 });
  } else {
    shake = 0.55;
    hud.flash('rgba(255, 170, 60, 0.65)');
    particles.burst(x, y, 22, 8, 0.55, 0.5, 0xfff07a, 0xff3d1f, 0);
    particles.burst(x, y, 12, 4, 0.9, 0.6, 0xb9c2d0, 0x3a4052, -3);
    sound.play('explode');
  }
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  const meters = Math.floor(distance);
  const final = score();
  // The first run sets the records quietly; later ones are celebrated.
  const firstRun = bestDist <= 0;
  const newDist = meters > bestDist;
  const newScore = final > best;
  const newCoins = coins > bestCoins;
  if (newDist) bestDist = meters;
  if (newScore) best = final;
  if (newCoins) bestCoins = coins;
  hh.save(SAVE_KEY, { best, bestDist, bestCoins });
  const record = !firstRun && (newDist || newScore);
  const tag = (on) => (on && !firstRun ? `<i class="new">NEW</i>` : '');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : DEATH[deathKind]}</div>` +
      `<div class="stats">` +
      `<span>Distance</span><b>${meters} m${tag(newDist)}</b>` +
      `<span>Coins</span><b>${coins}${tag(newCoins)}</b>` +
      `<span>Score</span><b class="score">${final}${tag(newScore)}</b>` +
      `</div>` +
      `<div class="small">Best ${bestDist} m · ${best} points</div>` +
      `<div class="blink">Press A to play again</div>` +
      `<div class="small dim">B title</div>`,
  );
  sound.play(record ? 'record' : 'gameover');
}

toTitle();
sound.startMusic();
// Upload every texture and build every shader now (all kinds of objects are
// in the scene, even if hidden or empty), so nothing stalls mid-run.
scene.traverse((object) => {
  if (object.material?.map) renderer.initTexture(object.material.map);
});
renderer.compile(scene, camera);

hh.run((dt) => {
  time += dt;
  stateTime += dt;
  let move = 0;

  if (state === 'title') {
    move = TITLE_SPEED * dt;
    hero.updateTitle(dt, time);
    const choice = menuInput();
    if (menu === 'title') {
      if (choice === 'play' || input.pressed('START')) start();
      else if (choice === 'options') {
        sound.play('menu_select');
        openMenu('options');
      }
    } else if (choice === 'back' || input.pressed('START')) {
      sound.play('menu_back');
      openMenu('title', 1);
    } else if (choice === 'sound' || choice === 'music') {
      toggle(choice);
    }
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
    } else {
      const d = Math.min(1, distance / RAMP);
      const late = Math.min(1, Math.max(0, (distance - RAMP) / LATE));
      speed = START_SPEED + (MAX_SPEED - START_SPEED) * d;
      move = speed * dt;
      distance += move;

      hero.update(dt, input.down('A') || input.down('UP'), speed);
      level.update(move, d, late, speed, hero.centerY());
      zappers.update(dt, move);
      missiles.update(dt, move, hero.centerY());
      lasers.update(dt);
      coinField.update(dt, move);

      const got = coinField.collect(hero);
      if (got > 0) {
        coins += got;
        hud.coins(coins);
        chain = time - lastCoin < CHAIN_GAP ? Math.min(chain + got, 99) : 0;
        lastCoin = time;
        const top = COIN_STEPS.length - 1;
        const step = chain <= top ? COIN_STEPS[chain] : COIN_STEPS[top - ((chain - top) % 2)];
        sound.play('coin', { volume: 0.7, rate: 2 ** (step / 12) });
      }

      if (zappers.hit(hero)) {
        die('zap', 0, 0);
      } else if (lasers.hit(hero)) {
        die('laser', 0, 0);
      } else {
        const missile = missiles.hit(hero);
        if (missile) die('boom', missile.x, missile.y);
      }

      const meters = Math.floor(distance);
      hud.distance(meters);
      toastAge += dt;
      if (bestDist > 0 && !passedBest && meters > bestDist) {
        passedBest = true;
        toastAge = 0;
        hud.toast('NEW BEST!');
        sound.play('best');
      } else if (meters >= nextMilestone && toastAge > 1.2) {
        toastAge = 0;
        hud.toast(`${nextMilestone} m`);
        sound.play('milestone', { volume: 0.85 });
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
    lasers.update(dt);
    coinField.update(dt, move);
    if ((hero.settled && stateTime > 1.3) || stateTime > 3.5) gameOver();
  } else if (state === 'paused') {
    const choice = menuInput();
    if (choice === 'resume' || choice === 'back' || input.pressed('START')) resume();
    else if (choice === 'sound' || choice === 'music') toggle(choice);
    else if (choice === 'quit') {
      sound.play('menu_back');
      toTitle();
    }
  } else if (state === 'over') {
    // A short delay so a button mashed during the crash does not restart at once.
    if (stateTime > 0.6 && (input.pressed('A') || input.pressed('START'))) start();
    else if (stateTime > 0.6 && input.pressed('B')) {
      sound.play('menu_back');
      toTitle();
    }
  }

  if (state !== 'paused') {
    if (state === 'over') move = 0;
    world.update(move);
    particles.update(dt, move);
  }
  if (state !== 'title' && bestDist > 30) world.setBest(HERO_X + bestDist - distance);
  updateLoops();

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
