// Sky Hopper: flap through the gaps between the pipes.
// A (or UP) flaps, START pauses.

import * as THREE from 'three';
import { SCREEN, createHandheld } from './handheld.js';
import { BIRD_X, HORIZON } from './shared.js';
import { createWorld } from './world.js';
import { createPipes } from './pipes.js';
import { BIRD_R, createBird } from './bird.js';
import { createParticles } from './particles.js';
import { createHud } from './hud.js';

const START_SPEED = 4.6; // world units per second
const MAX_SPEED = 6.2;
const HARDEST_AT = 50; // score at which speed and gaps stop getting harder
const SAVE_KEY = 'sky-hopper';

const MEDALS = [
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

const world = createWorld(scene, WIDEN);
const pipes = createPipes(scene, SIDE_ROOM);
const bird = createBird(scene);
const particles = createParticles(scene);
const hud = createHud(hh.hud);

let state = 'title'; // title | ready | play | paused | dying | over
let resumeTo = 'play'; // the state a pause returns to
let score = 0;
let speed = START_SPEED;
let stateTime = 0;
let shake = 0;
let best = hh.load(SAVE_KEY, { best: 0 }).best;
const gapCenter = { y: 0 }; // written by pipes.passed()

const HINT = 'A or UP flap · START pause';

function difficulty() {
  return Math.min(1, score / HARDEST_AT);
}

function medalFor(value) {
  for (let i = 0; i < MEDALS.length; i++) if (value >= MEDALS[i].at) return MEDALS[i];
  return null;
}

function toTitle() {
  state = 'title';
  pipes.clear();
  particles.clear();
  bird.reset();
  hud.showScore(false);
  hud.message(
    `<div class="top"><div class="logo">SKY HOPPER</div></div>` +
      `<div class="bottom"><div class="panel">` +
      `<div class="big">Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="best">Best ${best}</div>` : '') +
      `</div></div>`,
    'split',
  );
}

function toReady() {
  state = 'ready';
  score = 0;
  speed = START_SPEED;
  pipes.clear();
  particles.clear();
  bird.reset();
  hud.showScore(false);
  hud.score(0);
  hud.message(
    `<div class="top"><div class="logo ready">GET READY!</div></div>` +
      `<div class="bottom"><div class="panel">` +
      `<div class="big">Press <span class="btn">A</span> to flap</div>` +
      `<div class="small">Fly through the gaps · touch nothing</div>` +
      `</div></div>`,
    'split',
  );
}

function flap() {
  bird.flap();
  // Two little puffs under the wing.
  particles.spawn(BIRD_X - 0.3, bird.y - 0.3, 0.5, -1.5, -2.5, 0.6, 0.35, 0.14, 0xffffff, 0);
  particles.spawn(BIRD_X - 0.5, bird.y - 0.1, 0.4, -2.5, -1.5, 0.3, 0.3, 0.11, 0xfff1b8, 0);
}

function startRun() {
  state = 'play';
  stateTime = 0;
  pipes.reset();
  hud.message('');
  hud.showScore(true);
  flap();
}

function pause() {
  resumeTo = state;
  state = 'paused';
  hud.message(
    `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`,
  );
}

function resume() {
  state = resumeTo;
  if (state === 'ready') toReady();
  else hud.message('');
}

function scored(n) {
  score += n;
  hud.score(score);
  particles.burst(BIRD_X + 0.6, gapCenter.y, 0.6, 8, 7, 0xffe14a, 0xffffff, 0.16, 0.5, 0.4);
  for (let i = 0; i < MEDALS.length; i++) {
    if (score === MEDALS[i].at) hud.toast(`${MEDALS[i].name} MEDAL!`, MEDALS[i].kind);
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
}

// Hit the ground: the run is over at once.
function hitGround() {
  shake = 0.4;
  bird.hit();
  bird.land();
  hud.flash();
  crashFeathers();
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
  hud.showScore(false);
  hud.message(
    `<div class="title">GAME OVER</div>` +
      `<div class="result">` +
      `<div class="medal ${medal ? medal.kind : 'none'}">${medal ? '★' : ''}</div>` +
      `<div class="nums"><div>Score <b>${score}</b></div>` +
      `<div>Best <b>${best}</b>${record && score > 0 ? ' <span class="new">NEW!</span>' : ''}</div></div>` +
      `</div>` +
      (medal
        ? `<div class="medal-name ${medal.kind}">${medal.name} MEDAL</div>`
        : `<div class="small">Bronze medal at 10</div>`) +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
    'center late',
  );
}

toTitle();
// Build every shader now instead of on first use, so nothing stalls mid-run.
renderer.compile(scene, camera);

hh.run((dt) => {
  let move = 0;
  stateTime += dt;

  if (state === 'title') {
    move = START_SPEED * dt;
    bird.hover(dt);
    if (input.pressed('A') || input.pressed('START')) toReady();
  } else if (state === 'ready') {
    move = START_SPEED * dt;
    bird.hover(dt);
    if (input.pressed('START')) pause();
    else if (input.pressed('A') || input.pressed('UP')) startRun();
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
      pipes.update(move, d);
      const n = pipes.passed(BIRD_X, gapCenter);
      if (n > 0) scored(n);
      if (pipes.hits(BIRD_X, bird.y, BIRD_R)) hitPipe();
      else if (bird.y - BIRD_R <= 0) hitGround();
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) resume();
    else if (input.pressed('B')) toTitle();
  } else if (state === 'dying') {
    if (bird.fall(dt)) {
      shake = Math.max(shake, 0.2);
      gameOver();
    }
  } else if (state === 'over') {
    // A short delay so a button mashed during the crash does not restart at once.
    if (stateTime > 0.7 && input.pressed('A')) toReady();
    else if (stateTime > 0.7 && input.pressed('B')) toTitle();
  }

  if (state !== 'paused') {
    bird.settle(dt);
    particles.update(dt, move);
    world.update(move);
  }

  shake = Math.max(0, shake - dt);
  const jitter = shake * 0.9;
  const sx = (Math.random() - 0.5) * jitter;
  const sy = (Math.random() - 0.5) * jitter;
  camera.position.set(sx, CAM_Y + sy, CAM_Z);
  lookAt.set(sx * 0.6, LOOK_Y + sy * 0.6, 0);
  camera.lookAt(lookAt);

  renderer.render(scene, camera);
});
