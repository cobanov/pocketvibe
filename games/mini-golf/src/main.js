// Mini Golf: nine hand-made holes with borders, slopes, bumpers, water and
// moving obstacles. LEFT / RIGHT aim, UP / DOWN fine-tune, hold A to charge
// the swinging power meter and release to putt, Y shows the whole hole and
// START pauses. Par, strokes and a scorecard; the best total is saved.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { HOLES } from './holes.js';
import { DEMO } from './demo.js';
import {
  BALL_R,
  EV_CUP,
  EV_LIP,
  EV_NONE,
  EV_OUT,
  EV_STOP,
  EV_WATER,
  HIT_BUMPER,
  HIT_MOVER,
  HIT_NONE,
  HIT_STONE,
  STEP,
  createBall,
  shoot,
  step,
} from './physics.js';
import { createBumpers, createFlag, createWorld, poseMovers } from './world.js';
import { createBallView } from './ball.js';
import { createAim, suggestAim } from './aim.js';
import { createFx } from './fx.js';
import { createHud, relative, resultName, scorecard } from './hud.js';
import { GROUND_Y, SKY, angleDiff, clamp } from './shared.js';

const SAVE_KEY = 'mini-golf';
const MAX_STROKES = 8;
const AIM_SLOW = 0.45; // radians per second when LEFT / RIGHT is first held...
const AIM_FAST = 2.3; // ...and after holding it for AIM_RAMP seconds
const AIM_RAMP = 0.7;
const FINE_STEP = 0.004; // one tap of UP / DOWN
const FINE_RATE = 0.09; // UP / DOWN held
const FINE_DELAY = 0.25;
const SWEEP = 1.05; // seconds for the meter to go from empty to full
// Shot power is the meter to this power: short putts get finer control.
const POWER_CURVE = 1.4;
const ROLL_LIMIT = 25; // a ball still rolling after this long is stopped
const HAZARD_TIME = 1.3;
const SUNK_TIME = 2.4;
const PICKUP_TIME = 1.8;
const INTRO_TIME = 2.6;
const DEMO_FIRST = 4; // the hole behind the title at first
const DEMO_CHARGE = 0.8; // seconds the demo draws the putter back
const WATER_DROP = 0.2;
const CONFETTI = [0xff5a5f, 0xffc23d, 0x4d8dff, 0x4fe08a, 0xff6fc8, 0xffffff];

const CHASE_BACK = 4.3;
const CHASE_UP = 2.5;
const CHASE_AHEAD = 2.8;
const OVERVIEW_TILT = 1.08; // radians below the horizon

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 24, 50);
const camera = new THREE.PerspectiveCamera(50, hh.width / hh.height, 0.1, 75);

scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a50, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-5, 12, 6);
scene.add(sun);

const world = createWorld(scene, HOLES);
const holes = world.holes;
const flag = createFlag(scene);
const bumpers = createBumpers(scene);
const fx = createFx(scene);
const view = createBallView(scene);
const aim = createAim(scene);
const hud = createHud(hh.hud);
const ball = createBall();

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const wantPos = new THREE.Vector3();
const wantLook = new THREE.Vector3();
const fromPos = new THREE.Vector3();
const fromLook = new THREE.Vector3();
const screenPos = new THREE.Vector3();

let state = 'title'; // title | intro | play | card | final | paused
let pausedFrom = 'play';
let phase = 'aim'; // the ball on the current hole: aim | roll | hazard | sunk | pickup
let demo = true; // the title screen plays by itself
let stateT = 0;
let phaseT = 0;
let index = 0;
let hole = null;
let course = null;
let tick = 0; // simulation ticks on this hole; movers follow it
let acc = 0;
let strokes = 0;
let scores = [];
let aimAngle = 0;
let camYaw = 0;
let turnHeld = 0;
let fineHeld = 0;
let charging = false;
let chargeT = 0;
let meter = 0;
let lastMeter = -1; // the meter at the last shot on this hole
let overview = false;
let restX = 0; // where the last shot was played from, for penalties
let restZ = 0;
let hazardWater = false;
let shake = 0;
let titleT = 0;
let demoShot = 0;
let best = hh.load(SAVE_KEY, null)?.best || 0;

// The animated ball while it drops into the cup, the water or off an edge.
let animX = 0;
let animY = 0;
let animZ = 0;
let animVX = 0;
let animVY = 0;
let animVZ = 0;
let landed = false;

const HINT_AIM = '◀ ▶ aim · ▲ ▼ fine · hold A putt · Y overview';
const HINT_TITLE = '◀ ▶ aim · hold A putt · Y overview · START pause';

function parTotal() {
  let n = 0;
  for (let i = 0; i < HOLES.length; i++) n += HOLES[i].par;
  return n;
}

function toPar() {
  let n = 0;
  for (let i = 0; i < scores.length; i++) n += scores[i] - HOLES[i].par;
  return n;
}

function popupAt(text, x, y, z, cls) {
  screenPos.set(x, y, z).project(camera);
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, cls);
}

// The suggested aim, as an angle close to the camera's so it does not spin.
function defaultAim() {
  return camYaw + angleDiff(suggestAim(course, ball.x, ball.z), camYaw);
}

function placeBall(x, z) {
  ball.x = x;
  ball.z = z;
  ball.vx = 0;
  ball.vz = 0;
  ball.moving = false;
  ball.inCup = false;
  restX = x;
  restZ = z;
}

function loadHole(i) {
  if (hole) hole.group.visible = false;
  index = i;
  hole = holes[i];
  course = hole.course;
  hole.group.visible = true;
  flag.place(course.cup.x, course.height(course.cup.x, course.cup.z), course.cup.z, hole.def.flag);
  bumpers.show(course);
  fx.clear();
  tick = 0;
  acc = 0;
  strokes = 0;
  lastMeter = -1;
  charging = false;
  overview = false;
  demoShot = 0;
  placeBall(course.tee.x, course.tee.z);
  camYaw = 0;
  aimAngle = defaultAim();
  camYaw = aimAngle;
  phase = 'aim';
  phaseT = 0;
  view.clearTrail();
  view.resetPutter();
}

function titleHtml() {
  return (
    `<div class="title">MINI GOLF</div>` +
    `<div>Press A to start</div>` +
    `<div class="small">${HINT_TITLE}</div>` +
    (best > 0 ? `<div class="small">Best ${best} (${relative(best - parTotal())})</div>` : '')
  );
}

function toTitle() {
  state = 'title';
  demo = true;
  titleT = 0;
  loadHole(DEMO_FIRST);
  hud.freeze(false);
  hud.showStats(false);
  hud.power(-1, -1);
  hud.banner('');
  hud.hint('');
  hud.message(titleHtml(), 'high');
  cameraTarget(0);
  camPos.copy(wantPos);
  camLook.copy(wantLook);
}

function nextDemoHole() {
  loadHole((index + 1) % holes.length);
  hud.flash('cut');
  cameraTarget(0);
  camPos.copy(wantPos);
  camLook.copy(wantLook);
}

function updateStats() {
  hud.hole(index + 1, HOLES.length, HOLES[index].par);
  hud.stroke(strokes);
  hud.total(relative(toPar()));
}

function startRound() {
  scores = [];
  demo = false;
  hud.showStats(true);
  hud.message('');
  startHole(0);
}

function startHole(i) {
  loadHole(i);
  state = 'intro';
  stateT = 0;
  hud.banner(`HOLE ${i + 1}`, `Par ${HOLES[i].par} · ${HOLES[i].name}`);
  hud.hint('A skip');
  hud.flash('cut');
  updateStats();
  cameraTarget(0);
  camPos.copy(wantPos);
  camLook.copy(wantLook);
}

function beginPlay() {
  state = 'play';
  phase = 'aim';
  phaseT = 0;
  hud.banner('');
}

function pause() {
  pausedFrom = state;
  state = 'paused';
  charging = false;
  view.charge(0);
  hud.power(-1, -1);
  hud.freeze(true);
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
}

function takeShot(angle, p) {
  charging = false;
  strokes++;
  restX = ball.x;
  restZ = ball.z;
  shoot(ball, angle, p);
  view.strike();
  phase = 'roll';
  phaseT = 0;
  // A little puff of grass from the tee-off.
  fx.burst(ball.x, course.height(ball.x, ball.z) + 0.05, ball.z, 0x9be07a, 4, 1.2, course.height(ball.x, ball.z));
  if (!demo) {
    hud.stroke(strokes);
    hud.power(-1, -1);
  }
}

function hitEffects() {
  const speed = ball.hitSpeed;
  const ground = course.height(ball.hitX, ball.hitZ);
  let nx = ball.x - ball.hitX;
  let nz = ball.z - ball.hitZ;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  if (ball.hitKind === HIT_BUMPER) {
    bumpers.hit(ball.hitIndex);
    fx.burst(ball.hitX, ground + 0.25, ball.hitZ, bumpers.colorOf(ball.hitIndex), 8, 2.2, ground);
    fx.ring(ball.hitX - nx * 0.3, ground + 0.03, ball.hitZ - nz * 0.3, 0xffffff, 0.9);
    view.squash(0.5);
    shake = Math.max(shake, 0.09);
  } else if (speed > 0.6) {
    const hex = ball.hitKind === HIT_STONE ? 0xffe9a8 : ball.hitKind === HIT_MOVER ? 0xff7a85 : 0xf0c08a;
    fx.chips(ball.hitX, ground + 0.15, ball.hitZ, nx, nz, hex, Math.min(9, 2 + Math.floor(speed * 0.8)), 1 + speed * 0.3);
    view.squash(Math.min(0.55, speed * 0.07));
    shake = Math.max(shake, Math.min(0.13, speed * 0.014));
  }
  if (ball.hitKind === HIT_MOVER && phase === 'aim') {
    // A spinner or slider knocked the resting ball: it rolls again, no
    // stroke counted.
    phase = 'roll';
    phaseT = 0;
    charging = false;
    view.hidePutter();
    hud.power(-1, -1);
  }
}

function stopped() {
  if (strokes >= MAX_STROKES && !demo) {
    pickUp();
    return;
  }
  phase = 'aim';
  phaseT = 0;
  restX = ball.x;
  restZ = ball.z;
  aimAngle = defaultAim();
  view.resetPutter();
}

function sunk() {
  phase = 'sunk';
  phaseT = 0;
  animX = ball.x;
  animZ = ball.z;
  const cx = course.cup.x;
  const cz = course.cup.z;
  const ground = course.height(cx, cz);
  flag.celebrate();
  fx.confetti(cx, ground + 0.4, cz, strokes === 1 ? 70 : 36, CONFETTI);
  fx.ring(cx, ground + 0.03, cz, 0xffffff, 1.3);
  shake = Math.max(shake, 0.12);
  if (demo) return;
  const par = HOLES[index].par;
  const ace = strokes === 1;
  hud.banner(resultName(strokes, par, false), `${strokes} ${ace ? 'stroke' : 'strokes'} · par ${par}`, ace ? 'ace' : strokes > par ? 'meh' : '');
  if (ace) {
    hud.flash('gold');
    shake = 0.3;
  }
}

function lipOut() {
  shake = Math.max(shake, 0.06);
  if (!demo) popupAt('LIP OUT!', ball.x, course.height(ball.x, ball.z) + 0.5, ball.z, 'warn');
}

function hazard(water) {
  phase = 'hazard';
  phaseT = 0;
  hazardWater = water;
  landed = false;
  animX = ball.x;
  animZ = ball.z;
  animY = course.height(ball.x, ball.z) + BALL_R;
  animVX = ball.vx * 0.7;
  animVZ = ball.vz * 0.7;
  animVY = 0.6;
  ball.moving = false;
  view.clearTrail();
  if (!demo) strokes++;
  const y = animY + 0.3;
  if (water) {
    const level = course.height(ball.x, ball.z) - WATER_DROP;
    fx.burst(ball.x, level + 0.05, ball.z, 0xffffff, 10, 2.6, level);
    fx.burst(ball.x, level + 0.05, ball.z, 0x6fd0ff, 8, 2.2, level);
    fx.ring(ball.x, level + 0.02, ball.z, 0xe6f8ff, 1.1);
    shake = Math.max(shake, 0.12);
    if (!demo) {
      hud.flash('water');
      popupAt('SPLASH! +1', ball.x, y, ball.z, 'bad');
    }
  } else if (!demo) {
    popupAt('OUT OF BOUNDS +1', ball.x, y, ball.z, 'bad');
  }
  if (!demo) hud.stroke(strokes);
}

function pickUp() {
  phase = 'pickup';
  phaseT = 0;
  strokes = MAX_STROKES;
  hud.stroke(strokes);
  hud.banner('PICKED UP', `${MAX_STROKES} strokes`, 'meh');
  fx.burst(ball.x, course.height(ball.x, ball.z) + 0.2, ball.z, 0xffffff, 8, 2, course.height(ball.x, ball.z));
}

function finishHole() {
  scores[index] = strokes;
  hud.banner('');
  if (index === HOLES.length - 1) {
    showFinal();
    return;
  }
  state = 'card';
  stateT = 0;
  const card = scorecard(HOLES, scores, index);
  const name = resultName(strokes, HOLES[index].par, strokes >= MAX_STROKES && phase === 'pickup');
  hud.total(relative(card.toPar));
  hud.message(
    `<div class="small">HOLE ${index + 1} · ${name}</div>` +
      card.html +
      `<div class="score">Total <b>${card.total}</b> · ${relative(card.toPar)}</div>` +
      `<div>Press A for hole ${index + 2}</div>`,
  );
}

function showFinal() {
  state = 'final';
  stateT = 0;
  const card = scorecard(HOLES, scores, -1);
  const record = best === 0 || card.total < best;
  if (record) {
    best = card.total;
    hh.save(SAVE_KEY, { best });
  }
  hud.total(relative(card.toPar));
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'FINAL SCORE'}</div>` +
      card.html +
      `<div class="score">Total <b>${card.total}</b> · ${relative(card.toPar)} · Best ${best}</div>` +
      `<div>A play again · B title</div>`,
  );
}

// The physics runs in fixed ticks; the demo putts at exact ticks.
function simulate(dt) {
  acc += dt;
  while (acc >= STEP) {
    acc -= STEP;
    if (demo && phase === 'aim') demoTick();
    if (phase === 'aim' || phase === 'roll') {
      const ev = step(ball, course, tick);
      if (ev !== EV_NONE) handle(ev);
    }
    tick++;
  }
}

function handle(ev) {
  if (ball.hitKind !== HIT_NONE) hitEffects();
  if (ev === EV_STOP) stopped();
  else if (ev === EV_CUP) sunk();
  else if (ev === EV_LIP) lipOut();
  else if (ev === EV_WATER) hazard(true);
  else if (ev === EV_OUT) hazard(false);
}

function demoTick() {
  const shots = DEMO[index];
  if (!shots || demoShot >= shots.length) return;
  const s = shots[demoShot];
  if (tick === s[0]) {
    ball.x = s[1];
    ball.z = s[2];
    aimAngle = s[3];
    demoShot++;
    takeShot(s[3], s[4]);
  }
}

// What the demo does each frame while the ball rests: turn to the next
// shot, draw the putter back, or give up on a hole that went off script.
function demoAim() {
  const shots = DEMO[index];
  const s = shots && demoShot < shots.length ? shots[demoShot] : null;
  if (!s || tick > s[0]) {
    if (phaseT > 1.4) nextDemoHole();
    return;
  }
  const lead = (s[0] - tick) * STEP;
  aimAngle += angleDiff(s[3], aimAngle) * 0.12;
  view.charge(lead < DEMO_CHARGE ? Math.pow(s[4], 1 / POWER_CURVE) * (1 - lead / DEMO_CHARGE) : 0);
}

function playAim(dt) {
  if (input.pressed('Y')) overview = !overview;
  if (charging) {
    chargeT += dt;
    const k = (chargeT / SWEEP) % 2;
    meter = k < 1 ? k : 2 - k;
    view.charge(meter);
    hud.power(meter, lastMeter);
    if (input.pressed('B')) {
      charging = false;
      view.charge(0);
      hud.power(-1, -1);
    } else if (!input.down('A')) {
      lastMeter = meter;
      takeShot(aimAngle, Math.max(0.01, Math.pow(meter, POWER_CURVE)));
    }
    return;
  }
  const turn = input.dpad.x;
  if (turn !== 0) {
    turnHeld += dt;
    aimAngle += turn * (AIM_SLOW + (AIM_FAST - AIM_SLOW) * Math.min(1, turnHeld / AIM_RAMP)) * dt;
  } else {
    turnHeld = 0;
  }
  const fine = input.dpad.y; // UP turns left, DOWN right
  if (fine !== 0) {
    if (fineHeld === 0) aimAngle += fine * FINE_STEP;
    fineHeld += dt;
    if (fineHeld > FINE_DELAY) aimAngle += fine * FINE_RATE * dt;
  } else {
    fineHeld = 0;
  }
  if (input.pressed('A') && phaseT > 0.15) {
    charging = true;
    chargeT = 0;
    meter = 0;
  }
}

// One frame of the ball on the current hole, in the title demo or in play.
function updateHole(dt) {
  phaseT += dt;
  if (phase === 'aim') {
    if (demo) demoAim();
    else playAim(dt);
  } else if (phase === 'roll') {
    if (!demo && input.pressed('Y')) overview = !overview;
    if (phaseT > ROLL_LIMIT) {
      ball.moving = false;
      stopped();
    }
  } else if (phase === 'hazard') {
    if (!demo && input.pressed('Y')) overview = !overview;
    if (phaseT > HAZARD_TIME) {
      if (strokes >= MAX_STROKES && !demo) {
        pickUp();
      } else {
        placeBall(restX, restZ);
        phase = 'aim';
        phaseT = 0;
        view.squash(0.6);
        view.resetPutter();
        fx.ring(restX, course.height(restX, restZ) + 0.03, restZ, 0xffffff, 0.6);
      }
    }
  } else if (phase === 'sunk') {
    if (phaseT > SUNK_TIME) {
      if (demo) nextDemoHole();
      else finishHole();
    }
  } else if (phase === 'pickup') {
    if (phaseT > PICKUP_TIME) finishHole();
  }
  if (phase === 'aim' || phase === 'roll') simulate(dt);
  else advanceClock(dt);
}

// Movers keep turning while the ball is not simulated.
function advanceClock(dt) {
  acc += dt;
  while (acc >= STEP) {
    acc -= STEP;
    tick++;
  }
}

// Where the ball is drawn, including its drop into the cup, the water or
// off an edge.
function drawBall(dt) {
  let x = ball.x;
  let z = ball.z;
  let ground = course.height(x, z);
  let y = ground + BALL_R;
  let shadowOn = true;
  if (phase === 'sunk') {
    const k = Math.min(1, phaseT / 0.3);
    x = animX + (course.cup.x - animX) * k;
    z = animZ + (course.cup.z - animZ) * k;
    ground = course.height(x, z);
    y = ground + BALL_R - k * k * 0.5;
    shadowOn = k < 0.4;
  } else if (phase === 'hazard') {
    animVY -= 14 * dt;
    animX += animVX * dt;
    animY += animVY * dt;
    animZ += animVZ * dt;
    if (hazardWater) {
      const level = course.height(animX, animZ) - WATER_DROP;
      if (animY < level + BALL_R * 0.5) {
        // Under water: slow down and sink.
        animVX *= 1 - Math.min(1, dt * 5);
        animVZ *= 1 - Math.min(1, dt * 5);
        animVY = Math.max(animVY, -0.4);
      }
    } else if (animY < GROUND_Y + BALL_R) {
      animY = GROUND_Y + BALL_R;
      animVY = -animVY * 0.35;
      animVX *= 0.6;
      animVZ *= 0.6;
      if (!landed) {
        landed = true;
        fx.burst(animX, GROUND_Y + 0.05, animZ, 0xc9b48a, 6, 1.4, GROUND_Y);
      }
    }
    x = animX;
    z = animZ;
    y = animY;
    shadowOn = false;
  } else if (phase === 'pickup') {
    y = ground + BALL_R + Math.min(1, phaseT * 2) * 1.2;
    shadowOn = false;
  }
  view.place(x, y, z, ground, shadowOn);
  view.mesh.visible = phase !== 'pickup' || phaseT < 0.5;
  if (phase === 'roll') view.roll(ball.vx, ball.vz, dt);
  view.update(dt, Math.hypot(ball.vx, ball.vz), phase === 'roll');

  if (phase === 'aim') view.showPutter(x, y, z, aimAngle);
  else if (phase !== 'roll') view.hidePutter();

  flag.lift(phase === 'roll' && Math.hypot(ball.x - course.cup.x, ball.z - course.cup.z) < 2.4);
}

// Sets wantPos / wantLook for the current camera mode.
function cameraTarget(dt) {
  const cx = course.cup.x;
  const cz = course.cup.z;
  if (state === 'title') {
    // A slow orbit high over the hole, the course low on screen under the
    // title.
    const r = Math.max(course.cols, course.rows) * 0.55 + 5;
    const a = titleT * 0.13 + index * 1.7;
    wantPos.set(Math.cos(a) * r, r * 0.95, Math.sin(a) * r + 2);
    wantLook.set(ball.x * 0.35, 1.2, ball.z * 0.35 - 1);
    return;
  }
  if (state === 'card' || state === 'final') {
    const a = stateT * 0.3 + 0.8;
    const h = course.height(cx, cz);
    wantPos.set(cx + Math.cos(a) * 3.4, h + 2.6, cz + Math.sin(a) * 3.4);
    wantLook.set(cx, h + 1.1, cz);
    return;
  }
  if (overview && state !== 'intro') {
    const dist = Math.max(course.rows * 0.95, course.cols * 0.7) + 3;
    wantPos.set(0, dist * Math.sin(OVERVIEW_TILT), dist * Math.cos(OVERVIEW_TILT));
    wantLook.set(0, 0, 0);
    return;
  }

  // Chase: behind the ball, along the aim while aiming and along the roll
  // while it moves.
  if (phase === 'aim') {
    camYaw += angleDiff(aimAngle, camYaw) * Math.min(1, dt * 7);
  } else if (phase === 'roll') {
    const speed = Math.hypot(ball.vx, ball.vz);
    if (speed > 1) camYaw += angleDiff(Math.atan2(ball.vz, ball.vx), camYaw) * Math.min(1, dt * 1.3);
  }
  const bx = phase === 'hazard' ? animX : ball.x;
  const bz = phase === 'hazard' ? animZ : ball.z;
  const ground = course.height(ball.x, ball.z);
  const dx = Math.cos(camYaw);
  const dz = Math.sin(camYaw);
  const back = phase === 'aim' ? CHASE_BACK : CHASE_BACK + 1.2;
  wantPos.set(bx - dx * back, ground + CHASE_UP + (phase === 'aim' ? 0 : 0.6), bz - dz * back);
  wantPos.y = Math.max(wantPos.y, course.height(wantPos.x, wantPos.z) + 1.6);
  wantLook.set(bx + dx * CHASE_AHEAD, ground, bz + dz * CHASE_AHEAD);

  if (state === 'intro') {
    // Fly from high over the cup down to the tee.
    const k = clamp(stateT / (INTRO_TIME * 0.8), 0, 1);
    const e = k * k * (3 - 2 * k);
    const h = course.height(cx, cz);
    fromPos.set(cx + 1.5, h + 7.5, cz + 5.5);
    fromLook.set(cx, h, cz);
    wantPos.lerpVectors(fromPos, wantPos, e);
    wantLook.lerpVectors(fromLook, wantLook, e);
  }
}

function updateCamera(dt, live) {
  cameraTarget(dt);
  const rate = state === 'title' ? 2 : overview ? 3.5 : state === 'intro' ? 8 : 5;
  const k = 1 - Math.exp(-dt * rate);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  // Wider fog for the high views.
  const far = state === 'title' || overview ? 64 : 48;
  scene.fog.far += (far - scene.fog.far) * k;
  scene.fog.near = scene.fog.far * 0.5;

  shake = live ? Math.max(0, shake - dt) : shake;
  const jitter = live ? shake * 0.6 : 0;
  camera.position.set(
    camPos.x + (Math.random() - 0.5) * jitter,
    camPos.y + (Math.random() - 0.5) * jitter,
    camPos.z + (Math.random() - 0.5) * jitter,
  );
  camera.lookAt(camLook);
}

function updateHint() {
  if (state === 'intro') hud.hint('A skip');
  else if (state !== 'play') hud.hint('');
  else if (phase === 'aim' && charging) hud.hint('Release A to putt · B cancel');
  else if (phase === 'aim') hud.hint(overview ? 'Y back to ball · hold A putt' : HINT_AIM);
  else if (phase === 'roll' || phase === 'hazard') hud.hint(overview ? 'Y back to ball' : 'Y overview');
  else hud.hint('');
}

toTitle();

hh.run((dt) => {
  let live = true; // false while paused: nothing moves
  if (state !== 'paused') stateT += dt;

  if (state === 'title') {
    titleT += dt;
    updateHole(dt);
    if (input.pressed('A') || input.pressed('START')) startRound();
  } else if (state === 'intro') {
    if (input.pressed('START')) pause();
    else {
      advanceClock(dt);
      if (stateT > INTRO_TIME || (stateT > 0.3 && input.pressed('A'))) beginPlay();
    }
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else updateHole(dt);
  } else if (state === 'card') {
    advanceClock(dt);
    if (stateT > 0.5 && (input.pressed('A') || input.pressed('START'))) {
      hud.message('');
      startHole(index + 1);
    }
  } else if (state === 'final') {
    advanceClock(dt);
    if (stateT > 0.6 && input.pressed('A')) startRound();
    else if (stateT > 0.6 && input.pressed('B')) toTitle();
  } else if (state === 'paused') {
    live = false;
    if (input.pressed('START')) {
      state = pausedFrom;
      hud.freeze(false);
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  }

  const animDt = live ? dt : 0;
  poseMovers(hole, tick * STEP);
  drawBall(animDt);
  if (phase === 'aim' && (state === 'play' || state === 'title')) aim.update(animDt, course, ball.x, ball.z, aimAngle);
  else aim.hide();
  flag.update(animDt);
  bumpers.update(animDt);
  fx.update(animDt);
  world.update(animDt);
  updateHint();
  updateCamera(dt, live);

  renderer.render(scene, camera);
});
