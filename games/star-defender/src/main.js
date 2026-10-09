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
import { createPlayer, SHIP_COLORS, SHIP_HALF_D, SHIP_HALF_W } from './player.js';
import { createShots } from './shots.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';
import { waveInfo } from './waves.js';

const START_LIVES = 3;
const MAX_LIVES = 5;
const EXTRA_LIFE_EVERY = 2500;
const FIRE_HOLD = 0.3; // seconds between shots while A is held
const FIRE_TAP = 0.14; // a fresh press may fire once this much is left of FIRE_HOLD
const RESPAWN_TIME = 1.6;
const CLEAR_TIME = 1.6; // the warp between two waves
const SAVE_KEY = 'star-defender';
// The march: four notes down A minor (A G F E), one per step, as playback
// rates of the recorded A.
const MARCH_RATES = [1, 2 ** (-2 / 12), 2 ** (-4 / 12), 2 ** (-5 / 12)];
// The explosion is pitched by kind: stingers high, jellies low.
const KILL_RATES = [1.12, 1, 0.9];

const hh = createHandheld({ clearColor: SPACE });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SPACE, 34, 88);

const camera = new THREE.PerspectiveCamera(44, hh.aspect, 0.5, 92);
// The whole field stays in view on every screen shape: wider screens show
// more space at the sides, taller ones more above and below.
hh.fitCamera(camera);
const CAM_Y = 23.5;
const CAM_Z = 13.5;
const LOOK_Z = -0.2;
const lookAt = new THREE.Vector3();
const popAt = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a2a66, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(4, 10, 9);
scene.add(sun);

const sound = createSound(hh, {
  sfx: [
    'shoot', 'march', 'explode', 'armor', 'bomb', 'chip', 'cancel', 'boom', 'saucer', 'saucer_hit', 'dive',
    'warn', 'life', 'ready', 'clear', 'over', 'record', 'move', 'select', 'back', 'pause', 'start',
  ],
  music: 'theme',
});
const saucerHum = sound.loop('saucer');

// What the shots run into, for sound and score pops. The title's demo plays
// silently under the music.
const events = {
  kill(slot, points, x, diving) {
    if (state !== 'play') return;
    kills++;
    sound.play('explode', { rate: KILL_RATES[aliens.typeOf(slot)] * wobble(), volume: 0.85, pan: pan(x) });
    if (diving) pop(`+${points}`, x, 1.2, aliens.az[slot], 'bonus');
  },
  armor(slot, x) {
    if (state === 'play') sound.play('armor', { rate: wobble(), pan: pan(x) });
  },
  chip(x, bomb) {
    if (state === 'play') sound.play('chip', { rate: wobble() * (bomb ? 0.9 : 1.1), volume: bomb ? 0.9 : 0.6, pan: pan(x) });
  },
  cancel(x) {
    if (state === 'play') sound.play('cancel', { rate: wobble(), pan: pan(x) });
  },
  saucer(bonus, x) {
    if (state !== 'play') return;
    saucers++;
    pop(`+${bonus}`, x, 1, saucer.z, 'bonus');
    shake = Math.max(shake, 0.3);
    sound.play('saucer_hit', { pan: pan(x) });
  },
};

const background = createBackground(scene);
const shields = createShields(scene);
const aliens = createAliens(scene);
const saucer = createSaucer(scene);
const fx = createFx(scene);
const player = createPlayer(scene);
const shots = createShots(scene, { aliens, shields, saucer, fx, events });
const hud = createHud(hh.hud);

let state = 'title'; // title | play | paused | over
let score = 0;
let lives = 0;
let wave = 1;
let info = waveInfo(1);
let nextLife = EXTRA_LIFE_EVERY;
let fireCd = 0;
let bombTimer = 0;
let diveTimer = 0;
let respawnTimer = 0; // > 0 while the ship is gone between lives
let clearTimer = 0; // > 0 during the warp to the next wave
let overTime = 0;
let overPanel = '';
let overRecord = false;
let shake = 0;
let warp = 0;
let demoTime = 0;
let demoFire = 0;
let marchNote = 0;
let warned = false; // the formation reached the bunkers this wave
let humOn = false;
let menuSel = 0;
let kills = 0;
let saucers = 0;
let bestAtStart = 0;
let passedBest = false;
const saved = hh.load(SAVE_KEY, { best: 0, bestWave: 0 });
let best = saved.best ?? 0;
let bestWave = saved.bestWave ?? 0;

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const TABLE =
  `<div class="table">` +
  `<span><i class="dot" style="background:${hex(ROW_COLORS[0])}"></i>30</span>` +
  `<span><i class="dot" style="background:${hex(ROW_COLORS[1])}"></i>20</span>` +
  `<span><i class="dot" style="background:${hex(ROW_COLORS[3])}"></i>10</span>` +
  `<span><i class="dot" style="background:#ff4466"></i>???</span>` +
  `</div>`;

const wobble = () => 1 + (Math.random() - 0.5) * 0.08;
const pan = (x) => Math.max(-1, Math.min(1, x / 12)) * 0.7;

function save() {
  hh.save(SAVE_KEY, { best, bestWave });
}

// Keeps a new best score and wave, also when a game is quit early. Returns
// true for a new best score.
function keepBest() {
  const record = score > best;
  if (record) best = score;
  if (wave > bestWave) bestWave = wave;
  save();
  return record;
}

function bestLine() {
  return best > 0 ? `<div class="small">Best ${best} · Wave ${bestWave}</div>` : '';
}

// ---------------------------------------------------------------- menus

const ON_OFF = (on) => (on ? 'ON' : 'OFF');
const KEY = (button) => `<span class="key">${button}</span>`;
const TITLE_ITEMS = ['play', 'sound', 'music'];
const PAUSE_ITEMS = ['resume', 'sound', 'music', 'quit'];
const LABELS = {
  play: () => 'PLAY',
  resume: () => 'RESUME',
  quit: () => 'QUIT TO TITLE',
  sound: () => `SOUND <b>${ON_OFF(sound.sfxOn)}</b>`,
  music: () => `MUSIC <b>${ON_OFF(sound.musicOn)}</b>`,
};

function menuRows(items) {
  let html = '<div class="menu">';
  for (let i = 0; i < items.length; i++) {
    html += `<div class="item${i === menuSel ? ' sel' : ''}">${LABELS[items[i]]()}</div>`;
  }
  return html + '</div>';
}

function showTitle() {
  hud.message(
    `<div class="title">STAR DEFENDER</div>` +
      menuRows(TITLE_ITEMS) +
      TABLE +
      bestLine() +
      `<div class="small keys">D-pad move · ${KEY('A')} fire · ${KEY('START')} pause</div>`,
    'title-panel',
  );
}

function showPause() {
  hud.message(
    `<div class="title">PAUSED</div>` +
      menuRows(PAUSE_ITEMS) +
      `<div class="small keys">${KEY('A')} select · ${KEY('B')} or ${KEY('START')} resume</div>`,
  );
}

// Up / down moves through the items; returns the item A chose, 'redraw'
// after a move, or null. Left / right also flip a toggle.
function menuInput(items) {
  const dy = input.pressed('DOWN') ? 1 : input.pressed('UP') ? -1 : 0;
  if (dy) {
    menuSel = (menuSel + dy + items.length) % items.length;
    sound.play('move');
    return 'redraw';
  }
  const item = items[menuSel];
  const dx = input.pressed('LEFT') || input.pressed('RIGHT');
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

function resetField() {
  info = waveInfo(wave);
  aliens.reset(wave, info.layout, info.speed, info.diveSpeed);
  shields.reset();
  shots.clear();
  saucer.reset(rand(14, 22));
  bombTimer = 1;
  diveTimer = info.diveWait * 0.5;
  marchNote = 0;
  warned = false;
}

function toTitle() {
  state = 'title';
  wave = 1;
  demoTime = 0;
  menuSel = 0;
  resetField();
  fx.clear();
  player.reset();
  hud.showStats(false);
  hud.banner('');
  hud.paused(false);
  sound.duck(false);
  sound.startMusic();
  showTitle();
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
  kills = 0;
  saucers = 0;
  bestAtStart = best;
  passedBest = false;
  resetField();
  fx.clear();
  player.reset();
  hud.showStats(true);
  hud.score(0);
  hud.best(best);
  hud.wave(wave);
  hud.lives(lives);
  hud.message('');
  hud.banner('WAVE 1', info.note);
  sound.duck(false);
  sound.startMusic();
  sound.play('start');
}

function nextWave() {
  wave++;
  resetField();
  hud.wave(wave);
  hud.banner(`WAVE ${wave}`, info.note);
  sound.duck(false);
  sound.play('ready');
  if (!player.alive && lives > 0) {
    respawnTimer = 0;
    player.respawn();
  }
}

function pause() {
  state = 'paused';
  menuSel = 0;
  hud.paused(true);
  sound.play('pause');
  sound.duck(true);
  showPause();
}

function resume() {
  state = 'play';
  hud.paused(false);
  hud.message('');
  // The wave-clear jingle keeps the music down until the next wave.
  sound.duck(clearTimer > 0);
}

// Shows a floating text at a point of the playfield.
function pop(text, x, y, z, cls) {
  popAt.set(x, y, z).project(camera);
  hud.pop(text, (popAt.x + 1) * 0.5 * hh.width, (1 - popAt.y) * 0.5 * hh.height, cls);
}

function addScore(points) {
  score += points;
  hud.score(score);
  hud.best(Math.max(best, score));
  if (score >= nextLife) {
    nextLife += EXTRA_LIFE_EVERY;
    if (lives < MAX_LIVES) {
      lives++;
      hud.lives(lives);
      pop('1UP', player.x, 1, PLAYER_Z - 1.5, 'life');
      sound.play('life', { delay: 0.05 });
    }
  }
  if (!passedBest && bestAtStart > 0 && score > bestAtStart) {
    passedBest = true;
    hud.pop('NEW BEST!', 130, 78, 'record');
    sound.play('record', { volume: 0.55 });
  }
}

function dropBomb(i, zigzag) {
  if (shots.drop(aliens.ax[i], aliens.az[i] + 0.5, info.bombSpeed * (zigzag ? 0.85 : 1), zigzag)) {
    sound.play('bomb', { rate: wobble() * (zigzag ? 1.12 : 1), volume: 0.7, pan: pan(aliens.ax[i]) });
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
  sound.play('boom', { pan: pan(player.x) });
  if (lives > 0) {
    respawnTimer = RESPAWN_TIME;
    return;
  }

  state = 'over';
  overTime = 0;
  overRecord = keepBest();
  overPanel =
    `<div class="title">${overRecord ? 'NEW BEST!' : invaded ? 'INVADED!' : 'GAME OVER'}</div>` +
    `<div class="big-score">${score}</div>` +
    `<div class="stats"><span>Wave <b>${wave}</b></span><span>Aliens <b>${kills}</b></span><span>Saucers <b>${saucers}</b></span></div>` +
    bestLine() +
    `<div class="keys">${KEY('A')} play again · ${KEY('B')} title</div>`;
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
      sound.play('shoot', { rate: wobble(), volume: 0.75, pan: pan(player.x) });
    }
  }

  aliens.update(dt, !holding, shields, player.alive ? player : null);
  if (aliens.stepped) {
    background.pulse(0.6);
    sound.play('march', { rate: MARCH_RATES[marchNote], volume: warned ? 0.95 : 0.75 });
    marchNote = (marchNote + 1) % MARCH_RATES.length;
  }

  if (!holding && !aliens.entering) {
    // Bombs: more of them, faster and more often on later waves.
    bombTimer -= dt;
    if (bombTimer <= 0) {
      bombTimer = rand(0.6, 1.6) * info.bombWait;
      if (shots.bombs() < info.maxBombs) {
        const i = aliens.shooter(player.x, Math.random() < 0.4);
        if (i >= 0) dropBomb(i, info.zigzag && Math.random() < 0.5);
      }
    }
    // Divers peel off the front of the formation now and then.
    if (info.divers > 0) {
      diveTimer -= dt;
      if (diveTimer <= 0) {
        diveTimer = rand(0.7, 1.3) * info.diveWait;
        if (aliens.diving < info.divers && aliens.startDive() >= 0) {
          sound.play('dive', { rate: wobble(), pan: pan(aliens.ax[aliens.dived]) });
        }
      }
    }
  }
  if (aliens.diveBomb >= 0) dropBomb(aliens.diveBomb, false);

  saucer.update(dt, !holding && !aliens.entering && aliens.living >= 8, 18, 30);
  shots.update(dt, player.alive ? player : null);

  if (shots.points > 0) addScore(shots.points);
  if (shots.kills > 0) shake = Math.max(shake, 0.12);
  if (shots.shipHit) {
    destroyShip(false);
    return;
  }
  // A diver that reaches the ship takes it down with it.
  if (player.vulnerable) {
    const r = aliens.rammed(player.x, PLAYER_Z, SHIP_HALF_W, SHIP_HALF_D);
    if (r >= 0) {
      fx.burst(aliens.ax[r], 0.6, aliens.az[r], aliens.colorOf(r), 18, 11, 0.24);
      kills++;
      addScore(aliens.kill(r));
      destroyShip(false);
      return;
    }
  }
  if (player.alive && aliens.frontZ > PLAYER_Z - 1.1) {
    destroyShip(true);
    return;
  }
  if (!warned && aliens.frontZ > SHIELD_MIN_Z - 1.4) {
    warned = true;
    hud.flash('warn');
    sound.play('warn');
  }

  if (aliens.living === 0 && clearTimer <= 0) {
    clearTimer = CLEAR_TIME;
    shots.clear();
    hud.flash('clear');
    hud.banner('WAVE CLEAR');
    sound.duck(true);
    sound.play('clear');
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
    aliens.reset(1, info.layout, info.speed);
    shields.reset();
  }
}

function updateTitle() {
  if (input.pressed('START')) {
    start();
    return;
  }
  const item = menuInput(TITLE_ITEMS);
  if (item === 'play') start();
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
  const item = menuInput(PAUSE_ITEMS);
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

// The mystery saucer hums while it crosses, a little louder near the middle.
function updateHum() {
  if (state === 'play' && saucer.active) {
    saucerHum.set(0.45 - Math.min(1, Math.abs(saucer.x) / 26) * 0.25, 1);
    humOn = true;
  } else if (humOn) {
    saucerHum.stop();
    humOn = false;
  }
}

// Loading: put one of every kind of object on screen (saucer, bullet, bomb,
// debris), compile every material and upload every geometry now, so nothing
// stalls the first time it appears in play. toTitle() clears them again.
function warmUp() {
  saucer.active = true;
  saucer.update(0, false, 0, 0);
  shots.fire(0, 0);
  shots.drop(0, -4, 0);
  shots.draw();
  fx.burst(0, 1, 0, 0xffffff, 1, 0, 0.2);
  fx.update(0);
  camera.position.set(0, CAM_Y, CAM_Z);
  camera.lookAt(lookAt.set(0, 0, LOOK_Z));
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
}

warmUp();
toTitle();

hh.run((dt) => {
  if (state === 'title') {
    updateDemo(dt);
    updateTitle();
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else updatePlay(dt);
  } else if (state === 'paused') {
    updatePaused();
  } else if (state === 'over') {
    overTime += dt;
    player.update(dt, 0);
    aliens.update(dt, false, shields);
    saucer.update(dt, false, 0, 0);
    shots.update(dt, null);
    // Let the explosion play before the panel; then a short delay so a
    // button mashed during the crash does not restart at once.
    if (overPanel && overTime > 1.0) {
      hud.message(overPanel, overRecord ? 'record' : '');
      overPanel = '';
      sound.duck(true);
      sound.play(overRecord ? 'record' : 'over');
    }
    if (overTime > 1.5 && input.pressed('A')) start();
    else if (overTime > 1.5 && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }
  updateHum();

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

if (import.meta.env.DEV) {
  // For headless checks: the scene, the game's parts and its state.
  window.__sd = {
    THREE, scene, camera, renderer, aliens, shots, saucer, player, sound,
    get state() { return state; },
    get wave() { return wave; },
    get score() { return score; },
    get lives() { return lives; },
    set wave(n) { wave = n - 1; clearTimer = 0.01; },
    // Shoots down every alien still flying (for testing the wave clear).
    clearWave() {
      for (let i = 0; i < 50; i++) {
        const a = aliens.hit(aliens.ax[i], aliens.az[i], aliens.az[i]);
        if (a >= 0) addScore(aliens.kill(a));
      }
    },
  };
}
