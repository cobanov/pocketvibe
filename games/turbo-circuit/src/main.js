// Turbo Circuit: an arcade lap racer. Three laps against three rivals.
// A accelerates, B brakes and reverses, D-pad left/right steers, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { KMH, LAPS, SKY, TOP_SPEED, angleDiff, formatTime, ordinal } from './shared.js';
import { buildCircuit, createTrackMeshes } from './track.js';
import { createScenery, createSky } from './scenery.js';
import { createFx } from './fx.js';
import { CAR_COLORS, createRace } from './race.js';
import { SURFACE_GRASS } from './car.js';
import { createHud } from './hud.js';

const COUNTDOWN = 3; // seconds of 3-2-1 before GO
const FINISH_GRACE = 40; // seconds left to finish once the winner is home
const RESULTS_DELAY = 1.6; // the FINISH banner plays before the results
const SAVE_KEY = 'turbo-circuit';

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 60, 140);

const camera = new THREE.PerspectiveCamera(64, hh.aspect, 0.3, 160);
hh.fitCamera(camera);
const lookAt = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a7a4a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(30, 60, 20);
scene.add(sun);

const sky = createSky(scene, SKY);
const track = buildCircuit();
const trackMeshes = createTrackMeshes(scene, track);
const fx = createFx(scene);
const scenery = createScenery(scene, track);
const race = createRace(scene, track, fx, scenery);
const hud = createHud(hh.hud, track, CAR_COLORS, hh.second);
const { player, events } = race;

let state = 'title'; // title | countdown | race | paused | finish
let pausedFrom = 'race';
let countdown = 0;
let stateTime = 0;
let time = 0;
let finishLeft = 0;
let finishSecs = -1;
let finishText = '';
let wrongWay = 0;
let shake = 0;
let speedTimer = 0;
let dnf = false;
let resultsShown = false;
let best = hh.load(SAVE_KEY, { best: 0 }).best;

// Chase camera: its yaw trails the car's heading, distance and field of view
// grow with speed.
let camYaw = 0;
let camDist = 7;
let camHeight = 3;
let fov = 64;
let fittedFov = 64; // the designed fov the camera was last fitted to

const HINT = 'A gas · B brake · ◀ ▶ steer';

function toTitle() {
  state = 'title';
  race.reset();
  hud.reset();
  hud.showStats(false);
  hud.message(
    `<div class="title">TURBO<br><span>CIRCUIT</span></div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best time ${formatTime(best)}</div>` : ''),
  );
}

function start() {
  state = 'countdown';
  countdown = COUNTDOWN + 0.7; // a short beat before "3"
  stateTime = 0;
  finishLeft = FINISH_GRACE;
  finishSecs = -1;
  wrongWay = 0;
  dnf = false;
  resultsShown = false;
  race.reset();
  hud.reset();
  hud.showStats(true);
  hud.message('');
  hud.place(race.placeOf(player));
  hud.lap(1);
  hud.time(0);
  hud.speed(0, false);
  // Start high above the grid and swoop down behind the car.
  camYaw = player.heading;
  camDist = 18;
  camHeight = 11;
}

function pause() {
  pausedFrom = state;
  state = 'paused';
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
}

function finish(timeUp) {
  state = 'finish';
  stateTime = 0;
  dnf = timeUp;
  resultsShown = false;
  hud.alert('');
  hud.banner(timeUp ? 'TIME UP' : 'FINISH!', timeUp ? 'final' : 'finish');
  shake = Math.max(shake, 0.25);
}

function showResults() {
  resultsShown = true;
  hud.showStats(false);
  if (dnf) {
    hud.message(
      `<div class="title">TIME UP</div>` +
        `<div>The winner was home ${FINISH_GRACE} seconds ago</div>` +
        `<div>Press A to race again</div>` +
        `<div class="small">B title</div>`,
    );
    return;
  }
  const total = player.finishTime;
  const record = best === 0 || total < best;
  if (record) {
    best = total;
    hh.save(SAVE_KEY, { best });
  }
  const place = player.place;
  hud.message(
    `<div class="title place${place}">${place === 1 ? 'YOU WIN!' : `${ordinal(place).toUpperCase()} PLACE`}</div>` +
      `<div>Time ${formatTime(total)}${record ? ' <em>NEW RECORD!</em>' : ''}</div>` +
      `<div class="small">Best lap ${formatTime(player.bestLap)} · Best time ${formatTime(best)}</div>` +
      `<div>Press A to race again</div>` +
      `<div class="small">B title</div>`,
  );
}

// Warnings under the stats: driving the wrong way, or the time left to
// finish once the winner is home.
function updateAlert(dt) {
  const i = player.idx;
  const backwards = player.fx * track.tx[i] + player.fz * track.tz[i] < -0.3 && player.fwd > 3;
  wrongWay = backwards ? wrongWay + dt : 0;
  if (wrongWay > 1) {
    hud.alert('WRONG WAY');
  } else if (race.leaderFinished() && !player.finished) {
    const secs = Math.ceil(finishLeft);
    if (secs !== finishSecs) {
      finishSecs = secs;
      finishText = `FINISH IN ${secs}`;
    }
    hud.alert(finishText);
  } else {
    hud.alert('');
  }
}

// What happened to the player this frame, turned into feel: shake, banners.
function react() {
  if (events.bump > 2) shake = Math.max(shake, Math.min(0.35, events.bump * 0.03));
  if (events.wall > 3) shake = Math.max(shake, Math.min(0.3, events.wall * 0.025));
  if (events.cones > 0) shake = Math.max(shake, 0.12);
  if (events.boost) {
    shake = Math.max(shake, 0.12);
    hud.banner('TURBO!', 'boost');
  }
  if (events.lap > 0 && events.lap < LAPS) {
    hud.banner(events.lap === LAPS - 1 ? 'FINAL LAP' : `LAP ${events.lap + 1}`, events.lap === LAPS - 1 ? 'final' : 'lap');
  }
  if (player.surface === SURFACE_GRASS && player.fwd > 8) shake = Math.max(shake, 0.05);
}

function chaseCamera(dt, rate) {
  const car = player;
  camYaw += angleDiff(car.heading, camYaw) * Math.min(1, dt * 4.5);
  const k = Math.max(0, Math.min(1.3, car.fwd / TOP_SPEED));
  const f = Math.min(1, dt * rate);
  camDist += (6.6 + k * 1.6 - camDist) * f;
  camHeight += (2.6 + k * 0.5 - camHeight) * f;
  const sx = Math.sin(camYaw);
  const sz = Math.cos(camYaw);
  camera.position.set(car.x - sx * camDist, camHeight, car.z - sz * camDist);
  lookAt.set(car.x + sx * 5, 1.0, car.z + sz * 5);
  return 62 + k * 10 + (car.boost > 0 ? 7 : 0);
}

function titleCamera() {
  // A slow orbit around the player's car while it drives itself.
  const a = time * 0.3;
  camera.position.set(player.x + Math.sin(a) * 9, 3.4, player.z + Math.cos(a) * 9);
  lookAt.set(player.x, 0.9, player.z);
  return 58;
}

toTitle();

// Compile every material and upload every texture now, while loading, so
// nothing stalls the first time it comes into view during the race.
scene.traverse((object) => {
  if (object.material?.map) renderer.initTexture(object.material.map);
});
renderer.compile(scene, camera);

hh.run((dt) => {
  time += dt;
  stateTime += dt;
  let targetFov = 64;

  if (state === 'title') {
    race.update(dt, input, 'attract');
    targetFov = titleCamera();
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'countdown') {
    if (input.pressed('START')) {
      pause();
    } else {
      countdown -= dt;
      race.draw(dt);
      if (countdown <= COUNTDOWN) hud.count(Math.max(0, Math.ceil(countdown)));
      if (countdown <= 0) {
        state = 'race';
        shake = 0.15;
      }
    }
    targetFov = chaseCamera(dt, 2.2);
  } else if (state === 'race') {
    if (input.pressed('START')) {
      pause();
    } else {
      race.update(dt, input, 'race');
      react();
      hud.place(race.placeOf(player));
      hud.lap(Math.max(1, Math.min(LAPS, player.laps + 1)));
      hud.time(race.clock);
      hud.best(player.bestLap);
      if (race.leaderFinished()) finishLeft -= dt;
      updateAlert(dt);
      if (events.finished) finish(false);
      else if (finishLeft <= 0) finish(true);
    }
    targetFov = chaseCamera(dt, 6);
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = pausedFrom;
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
    targetFov = fov;
  } else if (state === 'finish') {
    race.update(dt, input, 'cruise');
    targetFov = chaseCamera(dt, 3);
    if (!resultsShown && stateTime > RESULTS_DELAY) showResults();
    if (resultsShown && stateTime > RESULTS_DELAY + 0.5) {
      if (input.pressed('A')) start();
      else if (input.pressed('B')) toTitle();
    }
  }

  if (state === 'race' || state === 'countdown' || state === 'finish') {
    hud.map(race.cars);
    speedTimer -= dt;
    if (speedTimer <= 0) {
      speedTimer = 0.1;
      hud.speed(Math.round(Math.abs(player.fwd) * KMH), player.boost > 0);
    }
  }

  trackMeshes.update(time);

  if (state !== 'paused') {
    fov += (targetFov - fov) * Math.min(1, dt * 4);
    if (Math.abs(fittedFov - fov) > 0.05) {
      fittedFov = fov;
      hh.fitCamera(camera, { fov });
    }
    shake = Math.max(0, shake - dt);
    const jitter = shake * 0.9;
    camera.position.x += (Math.random() - 0.5) * jitter;
    camera.position.y += (Math.random() - 0.5) * jitter;
    camera.position.z += (Math.random() - 0.5) * jitter;
    camera.lookAt(lookAt);
    sky.update(camera);
  }

  renderer.render(scene, camera);
});
