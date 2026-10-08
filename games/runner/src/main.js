// Lane Runner: an endless runner on a three-lane road.
// D-pad left/right changes lanes, A jumps, DOWN slides, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { SKY } from './shared.js';
import { createWorld } from './world.js';
import { createTrack } from './track.js';
import { createPlayer } from './player.js';
import { createHud } from './hud.js';

const START_SPEED = 14;
const MAX_SPEED = 30;
const ACCEL = 0.3; // speed gained per second of running
const TITLE_SPEED = 8;
const COIN_POINTS = 25;

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 28, 62);

const camera = new THREE.PerspectiveCamera(62, hh.width / hh.height, 0.1, 72);
const lookAt = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 10, 6);
scene.add(sun);

const world = createWorld(scene);
const track = createTrack(scene);
const player = createPlayer(scene);
const hud = createHud(hh.hud);

let state = 'title'; // title | play | paused | over
let speed = 0;
let runTime = 0;
let distance = 0;
let coins = 0;
let overTime = 0;
let shake = 0;
let best = hh.load('lane-runner', { best: 0 }).best;

const HINT = '◀ ▶ change lane · A jump · ▼ slide';

function score() {
  return Math.floor(distance) + coins * COIN_POINTS;
}

function toTitle() {
  state = 'title';
  track.clear();
  player.reset();
  hud.showStats(false);
  hud.message(
    `<div class="title">LANE RUNNER</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best}</div>` : ''),
  );
}

function start() {
  state = 'play';
  speed = START_SPEED;
  runTime = 0;
  distance = 0;
  coins = 0;
  track.reset();
  player.reset();
  hud.showStats(true);
  hud.score(0);
  hud.coins(0);
  hud.message('');
}

function crash() {
  state = 'over';
  overTime = 0;
  shake = 0.35;
  player.crash();
  const final = score();
  const record = final > best;
  if (record) {
    best = final;
    hh.save('lane-runner', { best });
  }
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'CRASH!'}</div>` +
      `<div>Score ${final}</div>` +
      `<div class="small">${coins} coins · ${Math.floor(distance)} m · Best ${best}</div>` +
      `<div>Press A to run again</div>` +
      `<div class="small">B title</div>`,
  );
}

toTitle();

hh.run((dt) => {
  let move = 0;

  if (state === 'title') {
    move = TITLE_SPEED * dt;
    player.update(dt, null);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      state = 'paused';
      hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
    } else {
      runTime += dt;
      speed = Math.min(MAX_SPEED, START_SPEED + runTime * ACCEL);
      move = speed * dt;
      distance += move;
      player.update(dt, input);
      track.update(move, (speed - START_SPEED) / (MAX_SPEED - START_SPEED), dt);
      coins += track.collect(player);
      if (track.hits(player)) crash();
      hud.score(score());
      hud.coins(coins);
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    overTime += dt;
    // A short delay so a button mashed during the crash does not restart at once.
    if (overTime > 0.6 && input.pressed('A')) start();
    else if (overTime > 0.6 && input.pressed('B')) toTitle();
  }

  world.update(move);

  shake = Math.max(0, shake - dt);
  const jitter = shake * 0.6;
  camera.position.set(
    player.x * 0.6 + (Math.random() - 0.5) * jitter,
    3.4 + player.y * 0.35 + (Math.random() - 0.5) * jitter,
    6.2,
  );
  lookAt.set(player.x * 0.4, 1.2, -8);
  camera.lookAt(lookAt);

  renderer.render(scene, camera);
});
