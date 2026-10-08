// Snow Slalom: an endless downhill slalom.
// The D-pad carves left and right, DOWN tucks for speed, UP brakes into a
// snowplough. Pass between the flags of every gate: clean passes build a
// combo, while a missed gate or a crash costs one of three strikes.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { SKY, clamp, lerp, slopeY } from './shared.js';
import { createWorld } from './world.js';
import { MISSED, PASSED, SKIPPED, TREE, createCourse, difficulty } from './course.js';
import { createSkier } from './skier.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';

const START_SPEED = 9;
const STEEP_START = 3.0; // pull of gravity along the slope at the start...
const STEEP_END = 4.8; // ...and once the course is at its hardest
const GATE_POINTS = 20; // times the combo
const MAX_COMBO = 10;
const STRIKES = 3;
const AIR_MIN = 0.45; // shorter hops (moguls) earn nothing
const MILESTONE = 500; // metres between distance callouts
const DEMO_LEVEL = 0.45; // how hard the course behind the title is
const SAVE_KEY = 'snow-slalom';

const CAM_BACK = 7;
const CAM_UP = 3.4;
const LOOK_AHEAD = 9;
const FOV = 50;

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 38, 96);

const camera = new THREE.PerspectiveCamera(FOV, hh.aspect, 0.5, 220);
hh.fitCamera(camera);
const lookAt = new THREE.Vector3();
const screenPos = new THREE.Vector3();
const ski = { x: 0, z: 0 };

// Bright light: snow has to read as white, with blue in the shade.
scene.add(new THREE.HemisphereLight(0xffffff, 0x9db4d6, 2.1));
const sun = new THREE.DirectionalLight(0xfff4e6, 1.35);
sun.position.set(-4, 10, 3);
scene.add(sun);

const world = createWorld(scene);
const course = createCourse(scene);
const skier = createSkier(scene);
const fx = createFx(scene);
const hud = createHud(hh.hud);

// Debris colors by obstacle kind: pine needles, rock chips, fence net.
const DEBRIS = [0x2f6b45, 0x7d8796, 0xff7a1a];
const FLAG_HEX = [0xe8323c, 0x2f6fe0];

let state = 'title'; // title | play | paused | ending | over
let stateT = 0;
let distance = 0;
let gatePoints = 0;
let airPoints = 0;
let score = 0;
let combo = 0;
let strikes = STRIKES;
let gates = 0;
let nextMilestone = MILESTONE;
let passedBest = false;
let record = false;
let shake = 0;
let camX = 0;
let camZ = CAM_BACK;
let fov = FOV;
let fittedFov = FOV; // the designed fov the camera was last fitted to
let sprayAcc = 0;
let demoTuck = false;
let best = hh.load(SAVE_KEY, null)?.best || 0;

const HINT = '◀ ▶ carve · ▼ tuck · ▲ brake · START pause';

// A floating text over a point of the slope.
function popupAt(text, x, y, z, kind) {
  screenPos.set(x, y, z).project(camera);
  if (screenPos.z > 1) return;
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, kind);
}

function newRun(demo) {
  course.reset(0, demo ? DEMO_LEVEL : -1);
  world.reset(0);
  skier.reset(0, 0, demo ? 12 : START_SPEED);
  fx.clear();
  camX = 0;
  camZ = CAM_BACK;
  shake = 0;
  sprayAcc = 0;
}

function toTitle() {
  state = 'title';
  newRun(true);
  hud.showStats(false);
  hud.clearFx();
  hud.freeze(false);
  hud.message(
    `<div class="title">SNOW <span>SLALOM</span></div>` +
      `<div class="blink">Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best}</div>` : ''),
    'high',
  );
}

function start() {
  state = 'play';
  stateT = 0;
  newRun(false);
  distance = 0;
  gatePoints = 0;
  airPoints = 0;
  score = 0;
  combo = 0;
  strikes = STRIKES;
  gates = 0;
  nextMilestone = MILESTONE;
  passedBest = false;
  hud.showStats(true);
  hud.message('');
  hud.clearFx();
  hud.score(0);
  hud.distance(0);
  hud.combo(0);
  hud.strikes(STRIKES);
  hud.callout('GO!', 'gold');
}

function pause() {
  state = 'paused';
  hud.freeze(true);
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
}

function resume() {
  state = 'play';
  hud.freeze(false);
  hud.message('');
}

function loseStrike(word) {
  strikes--;
  combo = 0;
  hud.combo(0);
  hud.strikes(strikes);
  hud.flash('hit');
  hud.callout(word, 'bad');
  shake = Math.max(shake, 0.25);
  if (strikes <= 0) endRun();
}

function endRun() {
  state = 'ending';
  stateT = 0;
  record = score > best;
  if (record) {
    best = score;
    hh.save(SAVE_KEY, { best });
  }
}

function gameOver() {
  state = 'over';
  stateT = 0;
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big">${score}</div>` +
      `<div class="small">${Math.floor(distance)} m · ${gates} gates · Best ${best}</div>` +
      `<div class="blink">Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

// The skier crossed the line of the next gate: between the flags or not?
function checkGate(demo) {
  const g = course.nextGate;
  if (!g || skier.z > g.z) return;
  if (skier.crashed) {
    course.settle(SKIPPED, skier.x);
    return;
  }
  const gx = g.x;
  const gz = g.z;
  const half = g.half;
  const top = slopeY(gz) + 1.6;
  if (Math.abs(skier.x - gx) <= half) {
    course.settle(PASSED, skier.x);
    fx.burst(gx - half, top, gz, 6, FLAG_HEX[g.color], 3, 3, 0.13, 0.6, 8, 1.5);
    fx.burst(gx + half, top, gz, 6, FLAG_HEX[g.color], 3, 3, 0.13, 0.6, 8, 1.5);
    fx.burst(skier.x, top - 0.4, gz, 8, 0xffd84a, 3.5, 4, 0.11, 0.6, 8, 1.5);
    if (demo) return;
    combo = Math.min(MAX_COMBO, combo + 1);
    const points = GATE_POINTS * combo;
    gatePoints += points;
    gates++;
    popupAt(`+${points}`, gx, top + 0.8, gz, combo >= 5 ? 'gold' : '');
    hud.combo(combo);
    hud.bumpScore();
    if (combo === 5 || combo === MAX_COMBO) hud.callout(`COMBO ×${combo}!`, 'gold');
  } else {
    course.settle(MISSED, skier.x);
    if (!demo) loseStrike('MISSED!');
  }
}

function checkCrash(demo) {
  if (skier.crashed || skier.safe > 0) return;
  const i = course.hit(skier.x, skier.z, skier.y);
  if (i < 0) return;
  const kind = course.hitKind;
  const ox = course.obstacleX(i);
  skier.crash(ox);
  const y = slopeY(skier.z) + skier.y + 0.6;
  fx.burst(skier.x, y, skier.z, 20, 0xffffff, 4.5, 6, 0.17, 0.9, 12, 1.5);
  fx.burst(skier.x, y, skier.z, 8, DEBRIS[kind], 3.5, 5, 0.12, 0.8, 12, 1.2);
  // Snow shaken off the pine's branches.
  if (kind === TREE) fx.burst(ox, slopeY(skier.z) + 2.4, skier.z, 12, 0xffffff, 1.2, 0.6, 0.18, 1.1, 5, 0.6);
  shake = 0.45;
  if (demo) return;
  loseStrike('CRASH!');
}

function onLanding(demo) {
  const big = skier.lastAir > AIR_MIN;
  const y = slopeY(skier.z) + skier.ground;
  fx.burst(skier.x, y + 0.1, skier.z, big ? 14 : 5, 0xffffff, 3, 2.5, 0.12, 0.5, 9, 2);
  if (!big) return;
  shake = Math.max(shake, 0.12);
  if (demo) return;
  const points = 50 + Math.round(skier.lastAir * 10) * 10;
  airPoints += points;
  popupAt(`AIR +${points}`, skier.x, y + 2.2, skier.z, 'gold');
  hud.bumpScore();
  if (skier.lastAir > 1) hud.callout('BIG AIR!', 'gold');
}

// Ski tracks, and snow spray when carving hard, ploughing or in deep snow.
function snowFx(dt) {
  const onSnow = !skier.air && !skier.crashed;
  const w = 0.1 + 0.06 * Math.abs(skier.edge) + 0.08 * skier.brake;
  skier.skiAt(-1, ski);
  fx.track(0, ski.x, ski.z, onSnow, w);
  skier.skiAt(1, ski);
  fx.track(1, ski.x, ski.z, onSnow, w);
  if (!onSnow) return;
  const carve = Math.abs(skier.edge) * skier.v;
  const rate = Math.max(0, carve - 4) * 5 + skier.brake * skier.v * 3 + (skier.deep ? skier.v * 3 : 0);
  sprayAcc += rate * dt;
  if (sprayAcc < 1) return;
  const n = Math.floor(sprayAcc);
  sprayAcc -= n;
  // Out of the turn: carving right throws the snow to the left.
  const side = skier.edge >= 0 ? -1 : 1;
  const ca = Math.cos(skier.ang);
  const sa = Math.sin(skier.ang);
  skier.skiAt(side, ski);
  const x = ski.x - sa * 0.5;
  const z = ski.z + ca * 0.5;
  fx.spray(x, slopeY(z), z, side * ca, side * sa, n, 2 + skier.v * 0.18);
}

function afterMove(dt, demo) {
  checkCrash(demo);
  if (state === 'ending') return;
  checkGate(demo);
  if (skier.landed) onLanding(demo);
  if (skier.launched) fx.burst(skier.x, slopeY(skier.z) + skier.y, skier.z, 10, 0xffffff, 2.5, 3, 0.12, 0.5, 9, 2);
  snowFx(dt);
}

function updateScore() {
  distance = Math.max(distance, -skier.z);
  score = Math.floor(distance) + gatePoints + airPoints;
  hud.score(score);
  hud.distance(Math.floor(distance));
  if (best > 0 && !passedBest && score > best) {
    passedBest = true;
    hud.callout('NEW BEST!', 'gold');
  } else if (distance >= nextMilestone) {
    hud.callout(`${nextMilestone} m`, '');
    nextMilestone += MILESTONE;
  }
}

// The title demo skis the course by itself: aim for the inside of the next
// gate, turn early for the one after, and swerve round anything in the way.
function demoSteer() {
  const g = course.nextGate;
  demoTuck = false;
  if (!g) return 0;
  let tx = g.x;
  let tz = g.z;
  const ahead = skier.z - g.z;
  const g2 = course.gateAfter;
  if (g2) {
    tx = g.x + clamp(g2.x - g.x, -1, 1) * g.half * 0.45;
    if (ahead < 1 + skier.v * 0.22 && Math.abs(skier.x - g.x) < g.half * 0.75) {
      tx = g2.x;
      tz = g2.z;
    }
  }
  const want = clamp(Math.atan2(tx - skier.x, Math.max(3, skier.z - tz)), -1, 1);
  let steer = clamp((want - skier.ang) * 2.5, -1, 1);
  const dodge = course.avoid(skier.x, skier.z, Math.tan(skier.ang), 8, tx);
  if (dodge !== 0) steer = dodge;
  demoTuck = Math.abs(want) < 0.12 && ahead > 14;
  return steer;
}

function updateCamera(dt, live) {
  if (live) {
    camX += (skier.x * 0.65 - camX) * Math.min(1, dt * 3);
    camZ += (skier.z + CAM_BACK - camZ) * Math.min(1, dt * 6);
    fov += (FOV + skier.v * 0.3 + skier.tuck * 3 - fov) * Math.min(1, dt * 2);
  }
  const j = live ? shake * 0.6 : 0;
  camera.position.set(camX + (Math.random() - 0.5) * j, slopeY(camZ) + CAM_UP + (Math.random() - 0.5) * j, camZ);
  lookAt.set(camX * 0.4 + skier.x * 0.6, slopeY(skier.z - LOOK_AHEAD) + 0.3, skier.z - LOOK_AHEAD);
  camera.lookAt(lookAt);
  if (Math.abs(fittedFov - fov) > 0.01) {
    fittedFov = fov;
    hh.fitCamera(camera, { fov });
  }
  world.placeBackdrop(camera);
}

toTitle();

// Compile every material and upload every texture now, while loading:
// kickers, fences and moguls only show up far into a run, so without this
// their first appearance could stall the game.
scene.traverse((object) => {
  if (object.material?.map) renderer.initTexture(object.material.map);
});
renderer.compile(scene, camera);

hh.run((dt) => {
  stateT += dt;
  let live = true; // false while paused: nothing moves

  if (state === 'title') {
    const steer = demoSteer();
    skier.update(dt, steer, demoTuck, false, lerp(STEEP_START, STEEP_END, DEMO_LEVEL), course);
    afterMove(dt, true);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
      live = false;
    } else {
      const tuck = input.down('DOWN');
      const steep = lerp(STEEP_START, STEEP_END, difficulty(-skier.z));
      skier.update(dt, input.dpad.x, tuck, input.down('UP') && !tuck, steep, course);
      afterMove(dt, false);
      if (state === 'play') updateScore();
    }
  } else if (state === 'paused') {
    live = false;
    if (input.pressed('START')) resume();
    else if (input.pressed('B')) toTitle();
  } else if (state === 'ending') {
    // The run is over: tumble out or snowplough to a stop.
    skier.update(dt, 0, false, true, 0, course);
    if (stateT > 1.5) gameOver();
  } else if (state === 'over') {
    skier.update(dt, 0, false, true, 0, course);
    // A short delay so a button mashed at the end does not restart at once.
    if (stateT > 0.5 && input.pressed('A')) start();
    else if (stateT > 0.5 && input.pressed('B')) toTitle();
  }

  if (live) {
    course.update(dt, skier.z);
    world.update(skier.z);
    fx.update(dt);
    skier.draw();
    hud.speed(Math.round(skier.v * 3.6));
    shake = Math.max(0, shake - dt);
  }
  updateCamera(dt, live);

  renderer.render(scene, camera);
});
