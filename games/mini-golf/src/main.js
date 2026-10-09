// Mini Golf: two courses of nine hand-made holes with borders, slopes,
// bumpers, water, moving obstacles and a windmill. LEFT / RIGHT aim, UP /
// DOWN fine-tune, hold A to charge the swinging power meter and release to
// putt, X switches between the full and the short putting range, Y shows the
// whole hole and START pauses. Par, strokes and a scorecard; the best total
// of each course is saved.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { COURSES } from './holes.js';
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
  safeSpot,
  shoot,
  shotSpeed,
  step,
  uphill,
} from './physics.js';
import { createBumpers, createFlag, createWorld, poseMovers } from './world.js';
import { createBallView } from './ball.js';
import { createAim, suggestAim } from './aim.js';
import { createFx } from './fx.js';
import { createHud, relative, resultName, scorecard } from './hud.js';
import { createSound } from './sound.js';
import { GROUND_Y, SKY, angleDiff, clamp } from './shared.js';

const SAVE_KEY = 'mini-golf';
const MAX_STROKES = 8;
const AIM_SLOW = 0.45; // radians per second when LEFT / RIGHT is first held...
const AIM_FAST = 2.3; // ...and after holding it for AIM_RAMP seconds
const AIM_RAMP = 0.7;
const FINE_STEP = 0.004; // one tap of UP / DOWN
const FINE_RATE = 0.09; // UP / DOWN held
const FINE_DELAY = 0.25;
const SWEEP = 1.4; // seconds for the meter to go from empty to full...
const TOP_HOLD = 0.12; // ...where it rests a moment, so a full putt can be timed
// Shot power is the meter to this power: short putts get finer control.
const POWER_CURVE = 1.4;
// The short range for putts near the cup: a full meter is this much power
// (about 7 units of level green), so the meter covers short putts slowly.
const PUTT_SCALE = 0.3;
const PUTT_NEED = 4.5; // it comes on by itself when the cup is this close (level units, climbs included)
const ROLL_LIMIT = 25; // a ball still rolling after this long is stopped
const HAZARD_TIME = 1.3;
const SUNK_TIME = 2.4;
const PICKUP_TIME = 1.8;
const INTRO_TIME = 2.6;
const DEMO_FIRST = [4, 2]; // the hole of each course behind the title at first
const DEMO_CHARGE = 0.8; // seconds the demo draws the putter back
const DEMO_VOLUME = 0.4; // the title demo's putts are quieter
const WATER_DROP = 0.2;
const CONFETTI = [0xff5a5f, 0xffc23d, 0x4d8dff, 0x4fe08a, 0xff6fc8, 0xffffff];
const RESULT_DELAY = 0.45; // the result's jingle follows the rattle in the cup
// Bumpers ring out the notes of a G major chord (G, B, D, high G).
const BUMPER_NOTES = [1, 1.26, 1.498, 2];

const CHASE_BACK = 4.3;
const CHASE_UP = 2.5;
const CHASE_AHEAD = 2.8;
const OVERVIEW_TILT = 1.08; // radians below the horizon

const SFX = [
  'putt', 'putt_hard', 'roll', 'wall', 'stone', 'bumper', 'mover', 'ramp', 'sand', 'splash', 'fall', 'thud',
  'cup', 'lip', 'ace', 'under', 'par', 'over', 'pickup', 'place', 'intro', 'record', 'final', 'start',
  'charge', 'range', 'move', 'select', 'back', 'pause',
];

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;
const sound = createSound(hh, { sfx: SFX, music: 'theme' });
const rollLoop = sound.loop('roll');
const chargeLoop = sound.loop('charge');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 24, 50);
const camera = new THREE.PerspectiveCamera(50, hh.aspect, 0.1, 75);
// Wider screens show more at the sides, taller ones more above and below;
// the overview of a hole fits on every shape.
hh.fitCamera(camera);

scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8a50, 1.35));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-5, 12, 6);
scene.add(sun);

// Every hole of every course, built once; a course's holes follow each other.
const world = createWorld(scene, COURSES.flatMap((c) => c.holes));
const firstHole = [];
for (let i = 0, n = 0; i < COURSES.length; n += COURSES[i].holes.length, i++) firstHole.push(n);
const flag = createFlag(scene);
const bumpers = createBumpers(scene);
const fx = createFx(scene);
const view = createBallView(scene);
const aim = createAim(scene);
const hud = createHud(hh.hud, hh.width, hh.height);
const ball = createBall();

const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const wantPos = new THREE.Vector3();
const wantLook = new THREE.Vector3();
const fromPos = new THREE.Vector3();
const fromLook = new THREE.Vector3();
const screenPos = new THREE.Vector3();
const slope = [0, 0];
const drop = [0, 0];

// Menus: the pause menu during a round and the options from the title.
const PAUSE_MENU = { title: 'PAUSED', items: ['resume', 'sfx', 'music', 'quit'], hint: 'D-pad choose · A select · B resume' };
const OPTIONS_MENU = { title: 'OPTIONS', items: ['sfx', 'music', 'back'], hint: 'D-pad choose · A select · B back' };
const ITEM_LABELS = { resume: 'Resume', quit: 'Quit to title', back: 'Back' };

let state = 'title'; // title | options | intro | play | card | final | paused
let pausedFrom = 'play';
let phase = 'aim'; // the ball on the current hole: aim | roll | hazard | sunk | pickup
let demo = true; // the title screen plays by itself
let stateT = 0;
let phaseT = 0;
let courseNo = 0; // the course being played, or picked on the title
let holes = COURSES[0].holes; // its hole definitions
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
let range = 0; // 0 the full range, 1 the short putting range
let lastPower = -1; // the power of the last putt on this hole
let overview = false;
let restX = 0; // where the last shot was played from, for penalties
let restZ = 0;
let knocked = false; // a mover set the resting ball rolling: no stroke was played
let hazardWater = false;
let shake = 0;
let titleT = 0;
let titleSel = 0;
let demoShot = 0;
let menu = null;
let menuSel = 0;
let onSlope = false; // the ball is on a ramp or a hill, for the ramp sound
let onSand = false;

const saved = hh.load(SAVE_KEY, null);
const bests = COURSES.map((c, i) => saved?.bests?.[i] || (i === 0 ? saved?.best : 0) || 0);
titleSel = courseNo = clamp(saved?.course | 0, 0, COURSES.length - 1);
holes = COURSES[courseNo].holes;

// The animated ball while it drops into the cup, the water or off an edge.
let animX = 0;
let animY = 0;
let animZ = 0;
let animVX = 0;
let animVY = 0;
let animVZ = 0;
let landed = false;

const HINT_AIM = 'D-pad aim · hold A putt · X range · Y overview';

function parTotal(c) {
  let n = 0;
  for (let i = 0; i < COURSES[c].holes.length; i++) n += COURSES[c].holes[i].par;
  return n;
}

function toPar() {
  let n = 0;
  for (let i = 0; i < scores.length; i++) n += scores[i] - holes[i].par;
  return n;
}

function save() {
  hh.save(SAVE_KEY, { best: bests[0], bests, course: courseNo });
}

// An effect of the ball on the course; quieter under the title.
function sfx(name, volume = 1, rate = 1, delay = 0) {
  sound.play(name, { volume: demo ? volume * DEMO_VOLUME : volume, rate, delay });
}

// About +-4 % around 1, so repeated sounds do not all sound the same.
function vary() {
  return 0.96 + Math.random() * 0.08;
}

function popupAt(text, x, y, z, cls) {
  screenPos.set(x, y, z).project(camera);
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, cls);
}

// The suggested aim, as an angle close to the camera's so it does not spin.
function defaultAim() {
  return camYaw + angleDiff(suggestAim(course, ball.x, ball.z), camYaw);
}

// The short range when the cup is close enough by walking distance, counting
// what a climb to it costs.
function autoRange() {
  const climb = course.height(course.cup.x, course.cup.z) - course.height(ball.x, ball.z);
  return course.pathDistance(ball.x, ball.z) + Math.max(0, uphill(climb)) < PUTT_NEED ? 1 : 0;
}

function rangeScale() {
  return range ? PUTT_SCALE : 1;
}

function meterPower(m) {
  return Math.max(0.004, rangeScale() * Math.pow(m, POWER_CURVE));
}

// Where the last putt's power sits on the meter in the current range.
function lastMark() {
  return lastPower < 0 ? -1 : Math.pow(lastPower / rangeScale(), 1 / POWER_CURVE);
}

// The meter goes up, rests at full, comes down and starts over.
function meterAt(t) {
  const k = t % (2 * SWEEP + TOP_HOLD);
  if (k < SWEEP) return k / SWEEP;
  if (k < SWEEP + TOP_HOLD) return 1;
  return 1 - (k - SWEEP - TOP_HOLD) / SWEEP;
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
  knocked = false;
  range = autoRange();
}

function loadHole(i) {
  if (hole) hole.group.visible = false;
  index = i;
  hole = world.holes[firstHole[courseNo] + i];
  course = hole.course;
  hole.group.visible = true;
  flag.place(course.cup.x, course.height(course.cup.x, course.cup.z), course.cup.z, hole.def.flag);
  bumpers.show(course);
  fx.clear();
  tick = 0;
  acc = 0;
  strokes = 0;
  lastPower = -1;
  charging = false;
  overview = false;
  demoShot = 0;
  placeBall(course.tee.x, course.tee.z);
  camYaw = 0;
  aimAngle = defaultAim();
  camYaw = aimAngle;
  phase = 'aim';
  phaseT = 0;
  onSlope = false;
  onSand = false;
  view.clearTrail();
  view.resetPutter();
}

function useCourse(c) {
  courseNo = c;
  holes = COURSES[c].holes;
}

function titleHtml() {
  let items = '';
  for (let i = 0; i < COURSES.length; i++) {
    const b = bests[i];
    const info = b > 0 ? `Best ${b} (${relative(b - parTotal(i))})` : `Par ${parTotal(i)}`;
    items += `<div class="item course${i === titleSel ? ' sel' : ''}"><span>${COURSES[i].name.toUpperCase()}</span><small>${info}</small></div>`;
  }
  items += `<div class="item${titleSel === COURSES.length ? ' sel' : ''}">Options</div>`;
  const hint = titleSel < COURSES.length ? 'D-pad choose · A play' : 'D-pad choose · A select';
  return `<div class="title">MINI GOLF</div><div class="menu">${items}</div><div class="small">${hint}</div>`;
}

// Shows the first demo hole of course c behind the title.
function showDemoCourse(c) {
  useCourse(c);
  demo = true;
  titleT = 0;
  loadHole(DEMO_FIRST[c]);
  cameraTarget(0);
  camPos.copy(wantPos);
  camLook.copy(wantLook);
}

function toTitle() {
  state = 'title';
  titleSel = courseNo;
  showDemoCourse(courseNo);
  hud.freeze(false);
  hud.showStats(false);
  hud.meter(0);
  hud.banner('');
  hud.hint('');
  hud.message(titleHtml(), 'high');
  sound.duck(false);
}

function nextDemoHole() {
  loadHole((index + 1) % holes.length);
  hud.flash('cut');
  cameraTarget(0);
  camPos.copy(wantPos);
  camLook.copy(wantLook);
}

function updateStats() {
  hud.hole(index + 1, holes.length, holes[index].par);
  hud.stroke(strokes);
  hud.total(relative(toPar()));
}

function startRound(c) {
  useCourse(c);
  save();
  scores = [];
  demo = false;
  hud.showStats(true);
  hud.message('');
  sound.duck(false);
  sound.play('start');
  startHole(0);
}

function startHole(i) {
  loadHole(i);
  state = 'intro';
  stateT = 0;
  hud.banner(`HOLE ${i + 1}`, `Par ${holes[i].par} · ${holes[i].name}`);
  hud.hint('A skip');
  hud.flash('cut');
  updateStats();
  cameraTarget(0);
  camPos.copy(wantPos);
  camLook.copy(wantLook);
  sound.duck(false);
  if (i > 0) sound.play('intro', { delay: 0.15 });
}

function beginPlay() {
  state = 'play';
  phase = 'aim';
  phaseT = 0;
  hud.banner('');
}

function itemLabel(item) {
  if (item === 'sfx') return `Sound: ${sound.sfxOn ? 'On' : 'Off'}`;
  if (item === 'music') return `Music: ${sound.musicOn ? 'On' : 'Off'}`;
  return ITEM_LABELS[item];
}

function showMenu() {
  let html = `<div class="title">${menu.title}</div><div class="menu">`;
  for (let i = 0; i < menu.items.length; i++) {
    html += `<div class="item${i === menuSel ? ' sel' : ''}">${itemLabel(menu.items[i])}</div>`;
  }
  html += `</div><div class="small">${menu.hint}</div>`;
  hud.message(html, menu === OPTIONS_MENU ? 'high' : 'dim');
}

function openMenu(which) {
  menu = which;
  menuSel = 0;
  showMenu();
}

// The D-pad moves through the open menu. Returns the item chosen with A,
// 'back' for B, or null.
function menuInput() {
  const n = menu.items.length;
  if (input.pressed('UP') || input.pressed('DOWN')) {
    menuSel = (menuSel + (input.pressed('UP') ? n - 1 : 1)) % n;
    sound.play('move');
    showMenu();
    return null;
  }
  if (input.pressed('A')) return menu.items[menuSel];
  if (input.pressed('B')) return 'back';
  return null;
}

// Sound and music on or off; returns true if item was one of them.
function toggle(item) {
  if (item === 'sfx') sound.setSfx(!sound.sfxOn);
  else if (item === 'music') sound.setMusic(!sound.musicOn);
  else return false;
  sound.play('select');
  showMenu();
  return true;
}

function pause() {
  pausedFrom = state;
  state = 'paused';
  charging = false;
  view.charge(0);
  hud.meter(0);
  hud.freeze(true);
  openMenu(PAUSE_MENU);
  sound.play('pause');
  sound.duck(true);
}

function resume() {
  state = pausedFrom;
  hud.freeze(false);
  hud.message('');
  sound.play('back');
  sound.duck(false);
}

function takeShot(angle, p) {
  charging = false;
  strokes++;
  restX = ball.x;
  restZ = ball.z;
  knocked = false;
  lastPower = p;
  shoot(ball, angle, p);
  view.strike();
  phase = 'roll';
  phaseT = 0;
  // A little puff of grass from the tee-off.
  fx.burst(ball.x, course.height(ball.x, ball.z) + 0.05, ball.z, 0x9be07a, 4, 1.2, course.height(ball.x, ball.z));
  // A soft tap for a short putt, a solid knock for a long one.
  const k = Math.min(1, p);
  sfx('putt', 0.45 + 0.55 * Math.sqrt(k), (1.08 - k * 0.12) * vary());
  if (k > 0.3) sfx('putt_hard', (k - 0.3) / 0.7, vary());
  if (!demo) hud.stroke(strokes);
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
    sfx('bumper', 0.6 + Math.min(0.4, speed * 0.06), BUMPER_NOTES[ball.hitIndex % BUMPER_NOTES.length]);
  } else if (speed > 0.6) {
    const hex = ball.hitKind === HIT_STONE ? 0xffe9a8 : ball.hitKind === HIT_MOVER ? 0xff7a85 : 0xf0c08a;
    fx.chips(ball.hitX, ground + 0.15, ball.hitZ, nx, nz, hex, Math.min(9, 2 + Math.floor(speed * 0.8)), 1 + speed * 0.3);
    view.squash(Math.min(0.55, speed * 0.07));
    shake = Math.max(shake, Math.min(0.13, speed * 0.014));
  }
  if (ball.hitKind === HIT_MOVER) sfx('mover', Math.min(1, 0.45 + speed * 0.1), vary());
  else if (ball.hitKind !== HIT_BUMPER && speed > 0.25) {
    // Harder knocks are louder and a touch lower.
    const loud = Math.min(1, 0.12 + speed * 0.15);
    sfx(ball.hitKind === HIT_STONE ? 'stone' : 'wall', loud, (1.04 - loud * 0.08) * vary());
  }
  if (ball.hitKind === HIT_MOVER && phase === 'aim') {
    // A spinner, slider or windmill knocked the resting ball: it rolls
    // again, no stroke counted.
    phase = 'roll';
    phaseT = 0;
    charging = false;
    knocked = true;
    view.hidePutter();
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
  knocked = false;
  range = autoRange();
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
  sfx('cup', 1, vary());
  if (demo) return;
  const par = holes[index].par;
  const ace = strokes === 1;
  hud.banner(resultName(strokes, par, false), `${strokes} ${ace ? 'stroke' : 'strokes'} · par ${par}`, ace ? 'ace' : strokes > par ? 'meh' : '');
  sound.play(ace ? 'ace' : strokes < par ? 'under' : strokes === par ? 'par' : 'over', { delay: RESULT_DELAY });
  if (ace) {
    hud.flash('gold');
    shake = 0.3;
  }
}

function lipOut() {
  shake = Math.max(shake, 0.06);
  sfx('lip', 1, vary());
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
  // A ball a mover knocked in is dropped again for free, clear of every
  // mover, so it cannot be knocked in over and over; otherwise it is a
  // stroke, played again from where the last one was.
  const free = knocked;
  if (free) safeSpot(course, restX, restZ, drop);
  else {
    drop[0] = restX;
    drop[1] = restZ;
  }
  if (!demo && !free) strokes++;
  const y = animY + 0.3;
  const note = free ? 'FREE DROP' : water ? 'SPLASH! +1' : 'OUT OF BOUNDS +1';
  if (water) {
    const level = course.height(ball.x, ball.z) - WATER_DROP;
    fx.burst(ball.x, level + 0.05, ball.z, 0xffffff, 10, 2.6, level);
    fx.burst(ball.x, level + 0.05, ball.z, 0x6fd0ff, 8, 2.2, level);
    fx.ring(ball.x, level + 0.02, ball.z, 0xe6f8ff, 1.1);
    shake = Math.max(shake, 0.12);
    sfx('splash', 1, vary());
    if (!demo) hud.flash('water');
  } else {
    sfx('fall', 1, vary());
  }
  if (!demo) {
    popupAt(note, ball.x, y, ball.z, free ? 'warn' : 'bad');
    hud.stroke(strokes);
  }
}

function pickUp() {
  phase = 'pickup';
  phaseT = 0;
  strokes = MAX_STROKES;
  hud.stroke(strokes);
  hud.banner('PICKED UP', `${MAX_STROKES} strokes`, 'meh');
  fx.burst(ball.x, course.height(ball.x, ball.z) + 0.2, ball.z, 0xffffff, 8, 2, course.height(ball.x, ball.z));
  sound.play('pickup');
}

function finishHole() {
  scores[index] = strokes;
  hud.banner('');
  if (index === holes.length - 1) {
    showFinal();
    return;
  }
  state = 'card';
  stateT = 0;
  const card = scorecard(holes, scores, index);
  const name = resultName(strokes, holes[index].par, strokes >= MAX_STROKES && phase === 'pickup');
  hud.total(relative(card.toPar));
  hud.message(
    `<div class="small">HOLE ${index + 1} · ${name}</div>` +
      card.html +
      `<div class="score">Total <b>${card.total}</b> · ${relative(card.toPar)}</div>` +
      `<div class="blink">Press A for hole ${index + 2}</div>`,
  );
  sound.duck(true);
}

function showFinal() {
  state = 'final';
  stateT = 0;
  const card = scorecard(holes, scores, -1);
  const record = bests[courseNo] === 0 || card.total < bests[courseNo];
  if (record) bests[courseNo] = card.total;
  save();
  const best = bests[courseNo];
  hud.total(relative(card.toPar));
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'FINAL SCORE'}</div>` +
      `<div class="small">${COURSES[courseNo].name.toUpperCase()} COURSE</div>` +
      card.html +
      `<div class="score">Total <b>${card.total}</b> · ${relative(card.toPar)} · Best ${best}</div>` +
      `<div>A play again · B title</div>`,
  );
  sound.play(record ? 'record' : 'final', { delay: 0.2 });
  sound.duck(true);
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
  const shots = DEMO[courseNo][index];
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
  const shots = DEMO[courseNo][index];
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
    meter = meterAt(chargeT);
    view.charge(meter);
    if (input.pressed('B')) {
      charging = false;
      view.charge(0);
      sound.play('back', { volume: 0.7 });
    } else if (!input.down('A')) {
      takeShot(aimAngle, meterPower(meter));
    }
    return;
  }
  if (input.pressed('X')) {
    range = 1 - range;
    sound.play('range', { rate: range ? 1.12 : 1 });
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
        placeBall(drop[0], drop[1]);
        phase = 'aim';
        phaseT = 0;
        aimAngle = defaultAim();
        view.squash(0.6);
        view.resetPutter();
        fx.ring(drop[0], course.height(drop[0], drop[1]) + 0.03, drop[1], 0xffffff, 0.6);
        sfx('place', 0.8);
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

// The rolling ball heard: a rumble that follows its speed, softer and lower
// on sand, a whoosh onto a ramp or a hill and a hiss into sand.
function ballSounds(live) {
  const rolling = live && phase === 'roll' && (state === 'play' || state === 'title' || state === 'options');
  const speed = Math.hypot(ball.vx, ball.vz);
  if (!rolling || !ball.moving) {
    rollLoop.set(0);
    onSlope = false;
    onSand = false;
    return;
  }
  const k = Math.min(1, speed / 7);
  const volume = Math.min(1, speed * 0.6) * (0.25 + 0.75 * Math.sqrt(k)) * (demo ? DEMO_VOLUME : 1);
  rollLoop.set(ball.onSand ? volume * 0.5 : volume, (ball.onSand ? 0.7 : 1) * (0.75 + k * 0.6));
  course.grad(ball.x, ball.z, slope);
  const steep = Math.hypot(slope[0], slope[1]);
  if (!onSlope && steep > 0.1 && speed > 1.2) {
    onSlope = true;
    const up = ball.vx * slope[0] + ball.vz * slope[1] > 0;
    sfx('ramp', 0.4 + Math.min(0.6, speed * 0.1), up ? 1.08 : 0.88);
  } else if (onSlope && steep < 0.04) {
    onSlope = false;
  }
  if (ball.onSand && !onSand && speed > 0.6) sfx('sand', Math.min(1, 0.3 + speed * 0.2), vary());
  onSand = ball.onSand;
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
        sfx('thud', 0.8, vary());
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

function onTitle() {
  return state === 'title' || state === 'options';
}

// Sets wantPos / wantLook for the current camera mode.
function cameraTarget(dt) {
  const cx = course.cup.x;
  const cz = course.cup.z;
  if (onTitle()) {
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
  const rate = onTitle() ? 2 : overview ? 3.5 : state === 'intro' ? 8 : 5;
  const k = 1 - Math.exp(-dt * rate);
  camPos.lerp(wantPos, k);
  camLook.lerp(wantLook, k);
  // Wider fog for the high views.
  const far = onTitle() || overview ? 64 : 48;
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

// The meter shows while aiming in play (empty until A is held), and the
// charge tone rises with it.
function updateMeter() {
  const aiming = state === 'play' && phase === 'aim';
  if (!aiming) hud.meter(0);
  else hud.meter(charging ? 2 : 1, charging ? meter : 0, lastMark(), range === 1);
  chargeLoop.set(aiming && charging ? 0.55 : 0, 0.7 + meter * 0.8);
}

// The title: the courses and Options. Moving onto a course shows its holes
// behind the menu.
function titleInput() {
  const n = COURSES.length + 1;
  if (input.pressed('UP') || input.pressed('DOWN')) {
    titleSel = (titleSel + (input.pressed('UP') ? n - 1 : 1)) % n;
    sound.play('move');
    if (titleSel < COURSES.length && titleSel !== courseNo) {
      showDemoCourse(titleSel);
      hud.flash('cut');
    }
    hud.message(titleHtml(), 'high');
  } else if (input.pressed('A') || input.pressed('START')) {
    if (titleSel < COURSES.length) {
      startRound(titleSel);
    } else {
      state = 'options';
      openMenu(OPTIONS_MENU);
      sound.play('select');
    }
  }
}

toTitle();
sound.startMusic();

// Draw every hole once while loading, so all their meshes are uploaded and
// every material is compiled now instead of when a hole first shows up, with
// the aim preview and a burst of particles on show too. The second render,
// with only the title hole, is the one that reaches the screen.
camera.position.copy(camPos);
camera.lookAt(camLook);
for (let i = 0; i < world.holes.length; i++) world.holes[i].group.visible = true;
aim.update(0, course, ball.x, ball.z, aimAngle, shotSpeed(0.4));
fx.burst(ball.x, 0.3, ball.z, 0xffffff, 4, 1, 0);
fx.ring(ball.x, 0.03, ball.z, 0xffffff, 1);
fx.update(0.01);
renderer.compile(scene, camera);
renderer.render(scene, camera);
for (let i = 0; i < world.holes.length; i++) world.holes[i].group.visible = world.holes[i] === hole;
fx.clear();
aim.hide();
renderer.render(scene, camera);

hh.run((dt) => {
  let live = true; // false while paused: nothing moves
  if (state !== 'paused') stateT += dt;

  if (state === 'title') {
    titleT += dt;
    updateHole(dt);
    titleInput();
  } else if (state === 'options') {
    titleT += dt;
    updateHole(dt);
    const item = menuInput();
    if (item === 'back') {
      state = 'title';
      hud.message(titleHtml(), 'high');
      sound.play('back');
    } else if (item) toggle(item);
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
    if (stateT > 0.6 && input.pressed('A')) startRound(courseNo);
    else if (stateT > 0.6 && input.pressed('B')) {
      toTitle();
      sound.play('back');
    }
  } else if (state === 'paused') {
    live = false;
    const item = input.pressed('START') ? 'resume' : menuInput();
    if (item === 'resume' || item === 'back') resume();
    else if (item === 'quit') {
      toTitle();
      sound.play('back');
    } else if (item) toggle(item);
  }

  const animDt = live ? dt : 0;
  poseMovers(hole, tick * STEP);
  drawBall(animDt);
  const aiming = phase === 'aim' && (state === 'play' || onTitle());
  if (aiming) aim.update(animDt, course, ball.x, ball.z, aimAngle, charging && state === 'play' ? shotSpeed(meterPower(meter)) : 0);
  else aim.hide();
  flag.update(animDt);
  bumpers.update(animDt);
  fx.update(animDt);
  world.update(animDt);
  ballSounds(live);
  updateMeter();
  updateHint();
  updateCamera(dt, live);

  renderer.render(scene, camera);
});
