// Sky Hopper: flap through the gaps between the pipes.
// A (or UP) flaps, START pauses. Medals at 10, 25, 50 and 100 points; from
// 30 points on some of the gaps bob up and down.

import * as THREE from 'three';
import { SCREEN, createHandheld } from './handheld.js';
import { BIRD_X, HORIZON } from './shared.js';
import { createWorld } from './world.js';
import { createPipes } from './pipes.js';
import { BIRD_R, createBird } from './bird.js';
import { createParticles } from './particles.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const START_SPEED = 4.6; // world units per second
const MAX_SPEED = 6.2;
const HARDEST_AT = 60; // score at which speed and gaps stop getting harder
const MOVE_FROM = 30; // score from which some gaps bob up and down
const MOVE_CHANCE = 0.25; // how many of the new gaps bob at MOVE_FROM
const MOVE_CHANCE_MAX = 0.5; // reached 50 points later
const OVER_WAIT = 0.7; // s before the game-over screen takes a button
const SAVE_KEY = 'sky-hopper';

const MEDALS = [
  { at: 100, name: 'PLATINUM', kind: 'platinum' },
  { at: 50, name: 'GOLD', kind: 'gold' },
  { at: 25, name: 'SILVER', kind: 'silver' },
  { at: 10, name: 'BRONZE', kind: 'bronze' },
];

const hh = createHandheld({ clearColor: HORIZON });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON, 30, 110);

// A side view with a slight upward tilt, so the horizon sits low and the
// pipes stand out against the sky.
const FOV = 40;
const camera = new THREE.PerspectiveCamera(FOV, hh.aspect, 1, 110);
hh.fitCamera(camera); // the 40 degree view stays whole; wide screens see more at the sides
const CAM_Y = 4.2;
const CAM_Z = 22;
const LOOK_Y = 6.6;
const EYE = new THREE.Vector3(0, CAM_Y, CAM_Z); // where the camera stands, before any shake
const lookAt = new THREE.Vector3();

// How much wider than on the 3:2 screen the view is, as a factor and in world
// units at the pipes (measured a little behind them, where their shadows lie).
// On wide screens pipes appear and vanish that much further out and the
// scenery layers are that much wider, so nothing pops in or out in view. The
// pipes keep their spacing and gaps, so the game plays the same.
const halfWidth = (fov, aspect) => Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect;
const WIDEN = halfWidth(camera.fov, hh.aspect) / halfWidth(FOV, SCREEN.width / SCREEN.height);
const SIDE_ROOM = (WIDEN - 1) * halfWidth(FOV, SCREEN.width / SCREEN.height) * (CAM_Z + 2);

scene.add(new THREE.HemisphereLight(0xffffff, 0xc2b08a, 1.4));
const sun = new THREE.DirectionalLight(0xfff2dc, 1.7);
sun.position.set(-6, 12, 9);
scene.add(sun);

const world = createWorld(scene, WIDEN, EYE);
const pipes = createPipes(scene, SIDE_ROOM, EYE);
const bird = createBird(scene);
const particles = createParticles(scene);
const hud = createHud(hh.hud);
const sound = createSound(hh, {
  // Loaded in this order: what a run needs first, the menus and jingles after.
  sfx: [
    'flap',
    'point',
    'hit',
    'thud',
    'fall',
    'start',
    'move',
    'select',
    'back',
    'pause',
    'swoosh',
    'medal',
    'best',
    'record',
    'gameover',
  ],
  music: 'theme',
});

let state = 'title'; // title | ready | play | paused | dying | over
let resumeTo = 'play'; // the state a pause returns to
let menu = 'main'; // the title's menu: main | options
let sel = 0; // the highlighted entry of the menu on screen
let score = 0;
let speed = START_SPEED;
let stateTime = 0;
let shake = 0;
let best = hh.load(SAVE_KEY, null)?.best || 0;
let runBest = 0; // the best score when this run began
let warnedMoving = false; // the first bobbing gap of a run gets a warning
const gapCenter = { y: 0 }; // written by pipes.passed()

const HINT = 'A or UP flap · START pause';

// Difficulty from 0 (the first pipe) to 1 (HARDEST_AT points and up) on an S
// curve: a gentle start to learn the flaps, the climb in the middle, and no
// sudden stop at the top.
function difficulty() {
  const k = Math.min(1, score / HARDEST_AT);
  return k * k * (3 - 2 * k);
}

function moveChance() {
  if (score < MOVE_FROM) return 0;
  return Math.min(MOVE_CHANCE_MAX, MOVE_CHANCE + ((MOVE_CHANCE_MAX - MOVE_CHANCE) * (score - MOVE_FROM)) / 50);
}

function medalFor(value) {
  for (let i = 0; i < MEDALS.length; i++) if (value >= MEDALS[i].at) return MEDALS[i];
  return null;
}

// The medal still to win above this score, or null after the last one.
function nextMedal(value) {
  for (let i = MEDALS.length - 1; i >= 0; i--) if (value < MEDALS[i].at) return MEDALS[i];
  return null;
}

// A little random spread for repeated sounds, so they do not machine-gun.
function vary(k) {
  return 1 + (Math.random() * 2 - 1) * k;
}

// Menus. Entries are picked with A; the D-pad moves up and down, and LEFT /
// RIGHT also flip an On / Off entry.
function onOff(on) {
  return on ? 'On' : 'Off';
}

function optionItems() {
  return [`Sound: ${onOff(sound.sfxOn)}`, `Music: ${onOff(sound.musicOn)}`];
}

// Moves the highlight through n entries; true if it moved.
function menuMove(n) {
  const d = input.pressed('DOWN') - input.pressed('UP');
  if (!d) return false;
  sel = (sel + d + n) % n;
  sound.play('move');
  return true;
}

function flipPressed() {
  return input.pressed('A') || input.pressed('LEFT') || input.pressed('RIGHT');
}

// Sound effects (0) or music (1) on or off.
function toggle(which) {
  if (which === 0) sound.setSfx(!sound.sfxOn);
  else sound.setMusic(!sound.musicOn);
  sound.play('select');
}

function bestLine() {
  if (best <= 0) return '';
  const medal = medalFor(best);
  return `<div class="best">${medal ? `<span class="pip ${medal.kind}"></span>` : ''}Best ${best}</div>`;
}

// The title's menu in place, so the panel does not slide in again.
function titleMenu() {
  if (menu === 'main') {
    hud.items(['Play', 'Options'], sel);
    hud.foot(`<div class="small">${HINT}</div>${bestLine()}`);
  } else {
    hud.items([...optionItems(), 'Back'], sel);
    hud.foot('<div class="small">A change · B back</div>');
  }
}

function pauseMenu() {
  hud.items(['Resume', ...optionItems(), 'Quit to title'], sel);
}

function toTitle() {
  state = 'title';
  menu = 'main';
  sel = 0;
  pipes.clear();
  particles.clear();
  bird.reset();
  hud.pause(false);
  hud.showScore(false);
  hud.toast('');
  hud.banner('SKY HOPPER');
  hud.message('<div class="menu"></div><div class="foot"></div>', 'bottom');
  titleMenu();
  sound.duck(false);
}

function showReady() {
  hud.banner('GET READY!', 'ready');
  hud.message(
    `<div class="big">Press <span class="btn">A</span> to flap</div>` +
      `<div class="small">Fly through the gaps · touch nothing</div>` +
      `<div class="small">B title</div>`,
    'bottom',
  );
}

function toReady() {
  state = 'ready';
  score = 0;
  speed = START_SPEED;
  runBest = best;
  warnedMoving = false;
  pipes.clear();
  particles.clear();
  bird.reset();
  hud.showScore(false);
  hud.score(0);
  showReady();
  sound.duck(false);
  sound.play('start');
}

function flap() {
  bird.flap();
  // A little higher the higher the bird flies, and never twice the same.
  sound.play('flap', { rate: vary(0.04) * (0.96 + Math.min(1, bird.y / 14) * 0.1), volume: 0.9 });
  // Two little puffs under the wing.
  particles.spawn(BIRD_X - 0.3, bird.y - 0.3, 0.5, -1.5, -2.5, 0.6, 0.35, 0.14, 0xffffff, 0);
  particles.spawn(BIRD_X - 0.5, bird.y - 0.1, 0.4, -2.5, -1.5, 0.3, 0.3, 0.11, 0xfff1b8, 0);
}

function startRun() {
  state = 'play';
  stateTime = 0;
  pipes.reset();
  hud.banner('');
  hud.message('');
  hud.showScore(true);
  flap();
}

function pause() {
  resumeTo = state;
  state = 'paused';
  sel = 0;
  hud.pause(true);
  hud.banner('');
  hud.message(
    '<div class="title">PAUSED</div><div class="menu"></div><div class="small">B or START resume</div>',
    'center',
  );
  pauseMenu();
  sound.duck(true);
  sound.play('pause');
}

function resume() {
  state = resumeTo;
  hud.pause(false);
  if (state === 'ready') showReady();
  else hud.message('');
  sound.duck(false);
  sound.play('select');
}

function scored(n) {
  score += n;
  hud.score(score);
  particles.burst(BIRD_X + 0.6, gapCenter.y, 0.6, 8, 7, 0xffe14a, 0xffffff, 0.16, 0.5, 0.4);
  sound.play('point');
  let medal = null;
  for (let i = 0; i < MEDALS.length; i++) if (score === MEDALS[i].at) medal = MEDALS[i];
  if (medal) {
    hud.toast(`${medal.name} MEDAL!`, medal.kind);
    sound.play('medal', { delay: 0.06 });
    particles.burst(BIRD_X, bird.y, 0.6, 18, 9, 0xffe14a, 0xfff6c0, 0.2, 0.8, 0.3);
  } else if (runBest > 0 && score === runBest + 1) {
    hud.toast('NEW BEST!', 'best');
    sound.play('best', { delay: 0.06 });
    particles.burst(BIRD_X, bird.y, 0.6, 12, 8, 0xff8a5c, 0xffffff, 0.16, 0.6, 0.3);
  }
}

function crashFeathers() {
  particles.burst(BIRD_X, bird.y, 0.6, 14, 9, 0xffc63a, 0xfff6dc, 0.2, 0.9, 0.8);
}

// Hit a pipe: flash, shake, then the bird drops to the ledge.
function hitPipe() {
  state = 'dying';
  stateTime = 0;
  shake = 0.35;
  bird.hit();
  hud.flash();
  crashFeathers();
  sound.play('hit', { rate: vary(0.03) });
  sound.play('fall', { delay: 0.14 });
}

// Hit the ground: the run is over at once.
function hitGround() {
  shake = 0.4;
  bird.hit();
  bird.land();
  hud.flash();
  crashFeathers();
  sound.play('hit', { rate: vary(0.03), volume: 0.7 });
  sound.play('thud');
  gameOver();
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  const record = score > best;
  if (record) {
    best = score;
    hh.save(SAVE_KEY, { best });
  }
  const medal = medalFor(score);
  const next = nextMedal(score);
  hud.showScore(false);
  hud.toast(''); // a medal won just before the crash would show through the panel
  hud.message(
    `<div class="title">GAME OVER</div>` +
      `<div class="result">` +
      `<div class="medal ${medal ? medal.kind : 'none'}">${medal ? '★' : ''}</div>` +
      `<div class="nums"><div>Score <b>${score}</b></div>` +
      `<div>Best <b>${best}</b>${record && score > 0 ? ' <span class="new">NEW!</span>' : ''}</div></div>` +
      `</div>` +
      (medal ? `<div class="medal-name ${medal.kind}">${medal.name} MEDAL</div>` : '') +
      (next ? `<div class="small">Next: ${next.name.toLowerCase()} at ${next.at}</div>` : '') +
      `<div>A play again</div>` +
      `<div class="small">B title</div>`,
    'center late',
  );
  sound.duck(true);
  // The panel slides in a moment later (see #message.late in the CSS).
  sound.play('swoosh', { delay: 0.28 });
  sound.play(record && score > 0 ? 'record' : 'gameover', { delay: 0.55 });
}

// The camera at its spot, shaken while `shake` lasts.
function placeCamera() {
  const jitter = shake * 0.9;
  const sx = (Math.random() - 0.5) * jitter;
  const sy = (Math.random() - 0.5) * jitter;
  camera.position.set(EYE.x + sx, EYE.y + sy, EYE.z);
  lookAt.set(sx * 0.6, LOOK_Y + sy * 0.6, 0);
  camera.lookAt(lookAt);
}

// Draw one of everything once while loading (a pipe pair, its shadow and a
// particle beside the bird): it compiles every shader and uploads every
// geometry now, so nothing stalls the first time it shows up.
placeCamera();
pipes.warmUp(BIRD_X + 5);
particles.spawn(BIRD_X + 1, 7, 0, 0, 0, 0, 1, 0.3, 0xffffff, 0);
particles.update(0, 0);
renderer.compile(scene, camera);
renderer.render(scene, camera);
toTitle();
sound.startMusic(); // plays from the title on, once loaded and allowed

hh.run((dt) => {
  let move = 0;
  stateTime += dt;

  if (state === 'title') {
    move = START_SPEED * dt;
    bird.hover(dt);
    if (menu === 'main') {
      if (input.pressed('START') || (sel === 0 && input.pressed('A'))) toReady();
      else if (menuMove(2)) titleMenu();
      else if (input.pressed('A')) {
        menu = 'options';
        sel = 0;
        sound.play('select');
        titleMenu();
      }
    } else if (input.pressed('B') || (sel === 2 && input.pressed('A'))) {
      menu = 'main';
      sel = 1;
      sound.play('back');
      titleMenu();
    } else if (menuMove(3)) titleMenu();
    else if (sel < 2 && flipPressed()) {
      toggle(sel);
      titleMenu();
    }
  } else if (state === 'ready') {
    move = START_SPEED * dt;
    bird.hover(dt);
    if (input.pressed('START')) pause();
    else if (input.pressed('A') || input.pressed('UP')) startRun();
    else if (input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
    } else {
      const d = difficulty();
      // Ease towards the target speed so a new point never jerks the world.
      speed += (START_SPEED + (MAX_SPEED - START_SPEED) * d - speed) * Math.min(1, dt * 2);
      move = speed * dt;
      if (input.pressed('A') || input.pressed('UP')) flap();
      bird.update(dt);
      if (pipes.update(move, d, moveChance()) && !warnedMoving) {
        // The first bobbing gap of the run is still off screen: a warning.
        warnedMoving = true;
        hud.toast('MOVING PIPES!', 'warn');
      }
      const n = pipes.passed(BIRD_X, gapCenter);
      if (n > 0) scored(n);
      if (pipes.hits(BIRD_X, bird.y, BIRD_R)) hitPipe();
      else if (bird.y - BIRD_R <= 0) hitGround();
    }
  } else if (state === 'paused') {
    if (input.pressed('START') || input.pressed('B') || (sel === 0 && input.pressed('A'))) resume();
    else if (menuMove(4)) pauseMenu();
    else if ((sel === 1 || sel === 2) && flipPressed()) {
      toggle(sel - 1);
      pauseMenu();
    } else if (sel === 3 && input.pressed('A')) {
      sound.play('back');
      toTitle();
    }
  } else if (state === 'dying') {
    if (bird.fall(dt)) {
      shake = Math.max(shake, 0.2);
      sound.play('thud');
      gameOver();
    }
  } else if (state === 'over') {
    // A short delay so a button mashed during the crash does not restart at once.
    if (stateTime > OVER_WAIT && input.pressed('A')) toReady();
    else if (stateTime > OVER_WAIT && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }

  if (state !== 'paused') {
    bird.settle(dt);
    particles.update(dt, move);
    world.update(move);
    shake = Math.max(0, shake - dt);
  }
  placeCamera();

  renderer.render(scene, camera);
});
