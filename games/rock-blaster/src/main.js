// Rock Blaster: an asteroids-style shooter on a wrap-around starfield.
// D-pad LEFT/RIGHT turns, UP thrusts, A fires, B jumps to hyperspace, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, HALF_H, HALF_W, rand } from './shared.js';
import { createFrame, createSpace } from './space.js';
import { createFx } from './fx.js';
import { SIZES, createRocks } from './rocks.js';
import { createShots } from './shots.js';
import { SHIP_HIT, createShip } from './ship.js';
import { createSaucer } from './saucer.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const START_LIVES = 3;
const EXTRA_LIFE = 10000; // points per extra ship
const MAX_ROCKS = 12; // large rocks in the biggest waves
const RESPAWN_DELAY = 1.5; // seconds after a crash before the ship may return
const WAVE_DELAY = 2.4; // seconds between clearing a wave and the next one
const BULLET_HIT = 0.16;
const SMALL_SAUCER_SCORE = 40000; // from here on every saucer is the small one
const BEAT_SLOW = 1.0; // seconds between heartbeats with the whole wave still there
const BEAT_FAST = 0.26; // and with one small rock left
const SEMITONE_DOWN = 2 ** (-1 / 12);
const SAVE_KEY = 'rock-blaster';

const BREAK_SOUND = ['break_l', 'break_m', 'break_s'];
// A line under the wave banner the first time a new threat turns up.
const WAVE_NOTES = { 2: 'Saucers sighted', 3: 'Small saucers aim true' };

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const sound = createSound(hh, {
  sfx: [
    'move', 'select', 'back', 'pause', 'start',
    'shot', 'thrust', 'beat', 'break_l', 'break_m', 'break_s',
    'explode', 'respawn', 'hyper_in', 'hyper_out',
    'siren_big', 'siren_small', 'ufo_shot', 'ufo_boom',
    'wave', 'clear', 'life', 'best', 'over', 'record',
  ],
  music: 'theme',
});

const scene = new THREE.Scene();
// The play plane sits 30 units from the camera; only the star layers behind it
// reach into the fog, which dims the farther ones.
scene.fog = new THREE.Fog(BG, 30, 62);

// Orthographic top-down view that maps the field exactly onto the 3:2
// screen. Other shapes keep the field whole at the same scale and show a
// frame around it (see createFrame).
const camera = new THREE.OrthographicCamera(-HALF_W, HALF_W, HALF_H, -HALF_H, 1, 55);
camera.position.set(0, 0, 30);
hh.fitCamera(camera);

// The hemisphere's sky side faces the camera, so faces turned to the viewer read brightest.
const hemi = new THREE.HemisphereLight(0xd8e4ff, 0x3a2a5c, 1.5);
hemi.position.set(0, 0.35, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-6, 8, 10);
scene.add(sun);

const space = createSpace(scene);
createFrame(scene, camera.right - camera.left, camera.top - camera.bottom);
const fx = createFx(scene);
const rocks = createRocks(scene, fx);
const shots = createShots(scene);
const saucer = createSaucer(scene, fx);
const ship = createShip(scene, fx, findSpot, () => sound.play('hyper_out', { pan: pan(ship.x) }));
const hud = createHud(hh.hud);

// Continuous sounds, shaped every frame by what is going on.
const loops = {
  thrust: sound.loop('thrust'),
  sirenBig: sound.loop('siren_big'),
  sirenSmall: sound.loop('siren_small'),
};
const loopOn = { thrust: false, sirenBig: false, sirenSmall: false };

let state = 'title'; // title | play | paused | over
let menu = 'title'; // the menu shown: title | options (on the title), pause
let cursor = 0;
let score = 0;
let lives = 0;
let wave = 0;
let nextLife = EXTRA_LIFE;
let respawnTimer = 0;
let respawnWait = 0;
let waveTimer = -1; // counting down to the next wave when >= 0
let waveMass = 1; // the rocks' mass when the wave began, for the heartbeat
let beatTimer = 0;
let beatLow = false;
let saucerTimer = 0;
let overTimer = -1; // counting down to the game over screen when >= 0
let overTime = 0;
let toastTimer = 0;
let shake = 0;
let slowMo = 0; // seconds of slow motion left after a big hit
let fireLock = false; // the A press that started the game must be released before firing
let rocksShot = 0; // this game, for the game over panel
let saucersShot = 0;
let passedBest = false; // the NEW BEST banner shows once a game
let bestAtStart = 0;
const saved = hh.load(SAVE_KEY, { best: 0 });
let best = saved.best || 0;
let bestWave = saved.wave || 0;

const MENUS = {
  title: ['play', 'options'],
  options: ['sound', 'music', 'back'],
  pause: ['resume', 'sound', 'music', 'quit'],
};
const HINT = 'D-pad ◀ ▶ turn · ▲ thrust · A fire · B hyperspace';

function speedMul() {
  return Math.min(1.7, 1 + (wave - 1) * 0.08);
}

// A small random pitch change, so repeated sounds do not machine-gun.
function wobble() {
  return 0.96 + Math.random() * 0.08;
}

// Stereo position from a spot on the field.
function pan(x) {
  return (x / HALF_W) * 0.6;
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

function showToast(html, cls, seconds, sub) {
  hud.toast(html, cls, sub);
  toastTimer = seconds;
}

// ---------------------------------------------------------------- menus

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

function bestLine() {
  if (best <= 0) return '';
  return `<div class="small best">Best ${best}${bestWave > 0 ? ` · Wave ${bestWave}` : ''}</div>`;
}

// Draws the panel of the current menu.
function showMenu() {
  if (menu === 'title') {
    hud.message(`<div class="title">ROCK BLASTER</div>` + menuHtml() + bestLine() + `<div class="small">${HINT}</div>`, 'title-panel');
  } else if (menu === 'options') {
    hud.message(`<div class="title">OPTIONS</div>` + menuHtml() + `<div class="small dim">D-pad choose · A switch · B back</div>`);
  } else {
    hud.message(`<div class="title">PAUSED</div>` + menuHtml() + `<div class="small dim">D-pad choose · A select · B resume</div>`);
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
    sound.play('move');
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
  // Heard only when effects are (still) on.
  sound.play('select');
  showMenu();
}

// ---------------------------------------------------------------- sound loops

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
  const thrusting = state === 'play' && ship.alive && ship.hyper <= 0 && ship.thrusting;
  const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
  drive('thrust', thrusting ? 0.5 : 0, 0.92 + speed * 0.012);
  // The siren swells as the saucer slides in and fades as it leaves.
  const live = state === 'play' && saucer.active;
  const edge = live ? Math.min(1, Math.max(0, (HALF_W + 1.4 - Math.abs(saucer.x)) / 2.5)) : 0;
  drive('sirenBig', live && !saucer.small ? 0.42 * edge : 0, 1);
  drive('sirenSmall', live && saucer.small ? 0.36 * edge : 0, 1);
}

// The two-note heartbeat under the play, faster as the rocks thin out.
function heartbeat(dt) {
  if (rocks.count === 0 || lives <= 0) return;
  beatTimer -= dt;
  if (beatTimer > 0) return;
  const left = Math.min(1, rocks.mass / waveMass);
  beatTimer = BEAT_FAST + (BEAT_SLOW - BEAT_FAST) * left;
  sound.play('beat', { rate: beatLow ? SEMITONE_DOWN : 1, volume: 0.85 });
  beatLow = !beatLow;
}

// ---------------------------------------------------------------- states

// Keeps a new best score and the furthest wave. Returns true for a new best.
function keepBest() {
  const record = score > best;
  if (record) best = score;
  bestWave = Math.max(bestWave, wave);
  hh.save(SAVE_KEY, { best, wave: bestWave });
  return record;
}

function toTitle() {
  state = 'title';
  rocks.clear();
  rocks.spawnAttract();
  shots.clear();
  saucer.hide();
  ship.hide();
  fx.clear();
  slowMo = 0;
  hud.showStats(false);
  hud.toast('');
  sound.duck(false);
  sound.startMusic();
  openMenu('title');
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
  rocksShot = 0;
  saucersShot = 0;
  passedBest = false;
  bestAtStart = best;
  slowMo = 0;
  beatLow = false;
  rocks.clear();
  shots.clear();
  saucer.hide();
  fx.clear();
  ship.reset();
  hud.showStats(true);
  hud.score(0);
  hud.lives(lives);
  hud.message('');
  sound.duck(false);
  sound.startMusic();
  sound.play('start');
  nextWave();
}

function pause() {
  state = 'paused';
  toastTimer = 0;
  hud.toast('');
  sound.play('pause');
  sound.duck(true);
  openMenu('pause');
}

function resume() {
  state = 'play';
  // An A that chose Resume must not fire as well.
  fireLock = true;
  hud.message('');
  sound.duck(false);
}

function nextWave() {
  wave++;
  const ax = ship.alive ? ship.x : 0;
  const ay = ship.alive ? ship.y : 0;
  rocks.spawnWave(Math.min(MAX_ROCKS, 3 + wave), ax, ay, speedMul());
  waveMass = Math.max(1, rocks.mass);
  beatTimer = 0.8; // the first beat after the wave's own sound
  // The saucer first shows up in wave 2.
  saucerTimer = wave >= 2 ? rand(7, 12) : Infinity;
  hud.wave(wave);
  showToast(`WAVE ${wave}`, 'wave', 1.8, WAVE_NOTES[wave]);
  if (wave > 1) sound.play('wave');
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
    sound.play('life');
  } else if (!passedBest && bestAtStart > 0 && score > bestAtStart) {
    passedBest = true;
    showToast('NEW BEST!', 'best', 1.6);
    sound.play('best');
  }
}

function killShip() {
  sound.play('explode', { pan: pan(ship.x) });
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
  const record = keepBest();
  hud.toast('');
  sound.duck(true);
  sound.play(record ? 'record' : 'over');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big-score">${score}</div>` +
      `<div class="stats"><span>Wave <b>${wave}</b></span><span>Rocks <b>${rocksShot}</b></span>` +
      `<span>Saucers <b>${saucersShot}</b></span></div>` +
      bestLine() +
      `<div class="blink">Press A to play again</div>` +
      `<div class="small dim">B title</div>`,
    record ? 'record' : '',
  );
}

// Rock i breaks, pushed along (dx, dy).
function hitRock(i, dx, dy) {
  const rock = rocks.get(i);
  const size = rock.size;
  sound.play(BREAK_SOUND[size], { rate: wobble(), pan: pan(rock.x) });
  addScore(rocks.destroy(i, dx, dy, speedMul()));
  rocksShot++;
  shake = Math.max(shake, SIZES[size].shake);
}

function hitSaucer() {
  sound.play('ufo_boom', { pan: pan(saucer.x) });
  addScore(saucer.points);
  saucersShot++;
  saucer.destroy();
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
    if (saucer.inField && near(b.x, b.y, saucer.x, saucer.y, saucer.hit + BULLET_HIT)) {
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
  if (saucer.active && near(ship.x, ship.y, saucer.x, saucer.y, saucer.hit + SHIP_HIT)) {
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
      if (centreClear(Math.max(3.2, 6 - respawnWait * 0.8))) {
        ship.reset();
        sound.play('respawn');
      }
    }
  }

  if (overTimer >= 0) {
    overTimer -= dt;
    if (overTimer < 0) gameOver();
  }

  if (rocks.count === 0 && lives > 0) {
    if (waveTimer < 0) {
      waveTimer = WAVE_DELAY;
      showToast(`WAVE ${wave} CLEAR`, 'clear', 1.8);
      sound.play('clear');
    }
    waveTimer -= dt;
    if (waveTimer <= 0) {
      waveTimer = -1;
      nextWave();
    }
  }

  if (!saucer.active && lives > 0) {
    // Sooner when only a few rocks are left, so nobody can wait the wave out.
    saucerTimer -= rocks.count <= 3 ? dt * 2.5 : dt;
    if (saucerTimer <= 0) {
      // Small saucers from wave 3, more of them each wave, and only them
      // once the score is high.
      const small = score >= SMALL_SAUCER_SCORE || (wave >= 3 && Math.random() < Math.min(0.85, (wave - 2) * 0.2));
      saucer.spawn(wave, small);
      // The next one comes a while after this one, sooner in later waves.
      saucerTimer = rand(14, 22) - Math.min(7, wave * 0.6);
    }
  }
}

// Loading: put one of every kind of object on screen (rocks of every size,
// the ship with its flame and shield, both saucers, both kinds of bullets,
// sparks, rings and the flash), compile every material and upload every
// geometry now, so nothing stalls the first time it appears in play.
// toTitle() clears them again.
function warmUp() {
  rocks.spawnAttract();
  ship.reset();
  ship.update(0, 0, true);
  saucer.showAll(-4, 4);
  shots.firePlayer(0, 2, 1, 0, 1);
  shots.fireEnemy(0, -2, 1, 0, 1);
  shots.update(0);
  fx.flash(0xffffff, 0.1, 0.1);
  fx.update(0);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  saucer.hideAll();
}

warmUp();
toTitle();

hh.run((realDt) => {
  // A short slow motion sells the big hits.
  const dt = slowMo > 0 ? realDt * 0.3 : realDt;

  if (state === 'title') {
    rocks.update(dt);
    const choice = menuInput();
    if (menu === 'title') {
      if (choice === 'play' || input.pressed('START')) start();
      else if (choice === 'options') {
        sound.play('select');
        openMenu('options');
      }
    } else if (choice === 'back' || input.pressed('START')) {
      sound.play('back');
      openMenu('title', 1);
    } else if (choice === 'sound' || choice === 'music') {
      toggle(choice);
    }
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
    } else {
      // LEFT turns counter-clockwise, which is a positive angle.
      ship.update(dt, -input.dpad.x, input.down('UP'));
      if (fireLock && !input.down('A')) fireLock = false;
      if (input.down('A') && !fireLock && ship.fire(shots, input.pressed('A'))) {
        sound.play('shot', { rate: wobble(), volume: 0.8, pan: pan(ship.x) });
      }
      if (input.pressed('B') && ship.hyperspace()) sound.play('hyper_in', { pan: pan(ship.x) });
      rocks.update(dt);
      if (saucer.update(dt, ship, shots)) {
        sound.play('ufo_shot', { rate: wobble() * (saucer.small ? 1.12 : 1), pan: pan(saucer.x) });
      }
      shots.update(dt);
      collide();
      playTimers(dt);
      heartbeat(dt);
      hud.score(score);
    }
  } else if (state === 'paused') {
    const choice = menuInput();
    if (choice === 'resume' || choice === 'back' || input.pressed('START')) {
      sound.play(choice === 'resume' ? 'select' : 'back');
      resume();
    } else if (choice === 'sound' || choice === 'music') {
      toggle(choice);
    } else if (choice === 'quit') {
      sound.play('back');
      keepBest();
      toTitle();
    }
  } else if (state === 'over') {
    overTime += realDt;
    rocks.update(dt);
    saucer.update(dt, ship, shots);
    shots.update(dt);
    // A short delay so a button mashed during the crash does not restart at once.
    if (overTime > 0.7 && (input.pressed('A') || input.pressed('START'))) start();
    else if (overTime > 0.7 && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }
  updateLoops();

  if (state !== 'paused') {
    slowMo = Math.max(0, slowMo - realDt);
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
