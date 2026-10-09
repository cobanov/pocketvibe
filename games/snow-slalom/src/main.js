// Snow Slalom: a downhill slalom, endless or against the clock.
// The D-pad carves left and right, DOWN tucks for speed, UP brakes into a
// snowplough, and A spins in the air off a kicker. Pass between the flags of
// every gate. In the endless run clean passes build a combo, while a missed
// gate or a crash costs one of three strikes; the time trial is a fixed
// course of 36 gates to a finish line, and a missed gate adds three seconds.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { SKY, clamp, createView, lerp, slopeY } from './shared.js';
import { createWorld } from './world.js';
import { FENCE, MISSED, PASSED, ROCK, SKIPPED, TREE, createCourse } from './course.js';
import { createSkier } from './skier.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const START_SPEED = 9;
const STEEP_START = 3.2; // pull of gravity along the slope at the start...
const STEEP_END = 7.5; // ...and once the course is at its hardest
const GATE_POINTS = 20; // times the combo
const MAX_COMBO = 10;
const STRIKES = 3;
const AIR_MIN = 0.45; // shorter hops (moguls) earn nothing
const SPIN_POINTS = [0, 150, 400, 800]; // one, two or three spins in a jump
const SPIN_NAMES = ['', '360!', '720!', '1080!'];
const BONUS_POINTS = 100;
const TRICK_BUFFER = 0.15; // s: A pressed just before take-off still spins
// A gate counts while any part of the skier is between the poles, so one
// passed right on its edge (brushing the pole) is a clean pass.
const EDGE_TOL = 0.3;
const MILESTONE = 500; // metres between distance callouts
const DEMO_LEVEL = 0.45; // how hard the course behind the title is
const TRIAL_GATES = 36;
const TRIAL_SEED = 1207;
const PENALTY = 3; // seconds added for a gate missed in the time trial
const SPLITS = [12, 24]; // gates timed against the best run
const COUNT_STEP = 0.6; // seconds between 3, 2, 1 and GO
const SAVE_KEY = 'snow-slalom';

const CAM_BACK = 7;
const CAM_UP = 3.4;
const LOOK_AHEAD = 9;
const FOV = 50;
const FOG_NEAR = 38;
const FOG_FAR = 96;

const SFX = [
  'carve', 'wind', 'ice', 'gate', 'brush', 'miss', 'takeoff', 'land', 'spin', 'trick', 'air', 'bonus',
  'crash_tree', 'crash_rock', 'crash_fence', 'wipeout', 'warn', 'milestone', 'best', 'beep', 'go', 'split',
  'finish', 'record', 'over', 'move', 'select', 'back', 'pause',
];
const CRASH_SOUNDS = ['crash_tree', 'crash_rock', 'crash_fence'];
// The gate chime climbs the C-sharp minor pentatonic scale with the combo.
const COMBO_STEPS = [0, 0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;
const sound = createSound(hh, { sfx: SFX, music: 'theme' });
const carveLoop = sound.loop('carve');
const windLoop = sound.loop('wind');
const iceLoop = sound.loop('ice');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, FOG_NEAR, FOG_FAR);

const camera = new THREE.PerspectiveCamera(FOV, hh.aspect, 0.5, 220);
hh.fitCamera(camera);
const view = createView();
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

// Menus: the title's modes, its options and the pause menu.
const MODES = [
  { id: 'endless', label: 'Endless', about: 'Three strikes: how far down can you go?' },
  { id: 'trial', label: 'Time Trial', about: `${TRIAL_GATES} gates to the finish · a missed gate +${PENALTY} s` },
  { id: 'options', label: 'Options', about: 'Sound and music' },
];
const PAUSE_MENU = { title: 'PAUSED', items: ['resume', 'sfx', 'music', 'quit'], hint: 'D-pad choose · A select · B resume' };
const OPTIONS_MENU = { title: 'OPTIONS', items: ['sfx', 'music', 'back'], hint: 'D-pad choose · A select · B back' };
const ITEM_LABELS = { resume: 'Resume', quit: 'Quit to title', back: 'Back' };
const PLAY_HINT = '◀ ▶ carve · ▼ tuck · ▲ brake · A spin off a kicker · START pause';
const TRIAL_HINT = '◀ ▶ carve · ▼ tuck · ▲ brake · START pause';

let state = 'title'; // title | options | play | paused | ending | over
let mode = 'endless'; // endless | trial
let stateT = 0;
let distance = 0;
let gatePoints = 0;
let airPoints = 0;
let score = 0;
let combo = 0;
let maxCombo = 0;
let strikes = STRIKES;
let gates = 0; // gates passed cleanly
let settled = 0; // gates crossed, clean or not (the time trial's count)
let missed = 0;
let nextMilestone = MILESTONE;
let passedBest = false;
let record = false;
let runTime = 0; // s since GO
let penalty = 0; // s added for missed gates
let countdown = 0; // s left before GO in the time trial
let splitTimes = [];
let finishTime = 0;
let recordGain = 0; // how much the trial record improved by
let trickBuffer = 0;
let shownTenths = -1; // the trial clock on the HUD, in tenths of a second
let shownGates = -1;
let shake = 0;
let camX = 0;
let camZ = CAM_BACK;
let fov = FOV;
let fittedFov = FOV; // the designed fov the camera was last fitted to
let sprayAcc = 0;
let demoTuck = false;
let menu = null;
let menuSel = 0;
let titleSel = 0;

// Saved: the endless run's best score, and the time trial's best time with
// its split times. A damaged save is ignored.
const saved = hh.load(SAVE_KEY, null);
let best = Math.max(0, Math.floor(Number(saved?.best) || 0));
let bestTime = Math.max(0, Number(saved?.time) || 0);
let bestSplits = Array.isArray(saved?.splits) ? saved.splits.map((t) => Number(t) || 0) : [];

function save() {
  hh.save(SAVE_KEY, { best, time: bestTime, splits: bestSplits });
}

// 83.456 -> "1:23.45", or "1:23.4" with tenths only.
function formatTime(t, tenths = false) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const text = tenths ? (Math.floor(s * 10) / 10).toFixed(1) : (Math.floor(s * 100) / 100).toFixed(2);
  return `${m}:${s < 10 ? '0' : ''}${text}`;
}

// A signed gap in seconds: "-0.42" ahead, "+1.20" behind.
function formatGap(t) {
  return `${t < 0 ? '-' : '+'}${Math.abs(t).toFixed(2)}`;
}

// A floating text over a point of the slope.
function popupAt(text, x, y, z, kind) {
  screenPos.set(x, y, z).project(camera);
  if (screenPos.z > 1) return;
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, kind);
}

function newRun(demo) {
  if (demo) course.reset(0, { level: DEMO_LEVEL, bonus: true });
  else if (mode === 'trial') course.reset(0, { trial: TRIAL_GATES, seed: TRIAL_SEED });
  else course.reset(0, { bonus: true });
  world.reset(CAM_BACK);
  skier.reset(0, 0, demo ? 12 : mode === 'trial' ? 0 : START_SPEED);
  fx.clear();
  camX = 0;
  camZ = CAM_BACK;
  shake = 0;
  sprayAcc = 0;
  trickBuffer = 0;
}

// ---------------------------------------------------------------- menus

function itemLabel(item) {
  if (item === 'sfx') return `Sound: ${sound.sfxOn ? 'On' : 'Off'}`;
  if (item === 'music') return `Music: ${sound.musicOn ? 'On' : 'Off'}`;
  return ITEM_LABELS[item];
}

function recordsHtml() {
  let html = '';
  if (best > 0) html += `<span>BEST ${best}</span>`;
  if (bestTime > 0) html += `<span>TRIAL ${formatTime(bestTime)}</span>`;
  return html ? `<div class="records">${html}</div>` : '';
}

function titleMessage() {
  let modes = '';
  for (let i = 0; i < MODES.length; i++) modes += `<div class="item${i === titleSel ? ' sel' : ''}">${MODES[i].label}</div>`;
  hud.message(
    `<div class="title">SNOW <span>SLALOM</span></div>` +
      `<div class="modes">${modes}</div>` +
      `<div class="small">${MODES[titleSel].about}</div>` +
      recordsHtml(),
    'high',
  );
  hud.hint('D-pad choose · A select');
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

function titleInput() {
  const step = (input.pressed('RIGHT') || input.pressed('DOWN') ? 1 : 0) - (input.pressed('LEFT') || input.pressed('UP') ? 1 : 0);
  if (step !== 0) {
    titleSel = (titleSel + step + MODES.length) % MODES.length;
    sound.play('move');
    titleMessage();
  } else if (input.pressed('A') || input.pressed('START')) {
    const choice = MODES[titleSel].id;
    if (choice === 'options') {
      state = 'options';
      hud.hint('');
      openMenu(OPTIONS_MENU);
      sound.play('select');
    } else {
      mode = choice;
      start();
    }
  }
}

// ---------------------------------------------------------------- states

function toTitle() {
  state = 'title';
  newRun(true);
  hud.showStats(false);
  hud.clearFx();
  hud.freeze(false);
  titleMessage();
  sound.duck(false);
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
  maxCombo = 0;
  strikes = STRIKES;
  gates = 0;
  settled = 0;
  missed = 0;
  nextMilestone = MILESTONE;
  passedBest = false;
  runTime = 0;
  penalty = 0;
  splitTimes = [];
  shownTenths = -1;
  shownGates = -1;
  hud.showStats(true);
  hud.message('');
  hud.hint(mode === 'trial' ? TRIAL_HINT : PLAY_HINT, true);
  hud.clearFx();
  hud.combo(0);
  hud.strikes(STRIKES);
  hud.trial(mode === 'trial', bestTime > 0 ? formatTime(bestTime) : '');
  sound.duck(false);
  if (mode === 'trial') {
    // Standing in the start gate: 3, 2, 1, GO.
    countdown = COUNT_STEP * 3;
    hud.time(formatTime(0, true));
    hud.sub(`Gate 0/${TRIAL_GATES}`);
    hud.callout('3', '');
    sound.play('beep');
  } else {
    countdown = 0;
    hud.score(0);
    hud.distance(0);
    hud.callout('GO!', 'gold');
    sound.play('go');
  }
}

function pause() {
  state = 'paused';
  hud.freeze(true);
  hud.hint('');
  openMenu(PAUSE_MENU);
  sound.play('pause');
  sound.duck(true);
}

function resume() {
  state = 'play';
  hud.freeze(false);
  hud.message('');
  sound.play('back');
  sound.duck(false);
}

// A missed gate or a crash: in the endless run it costs a strike and the
// combo; in the time trial the clock is punishment enough.
function fault(word, delay) {
  combo = 0;
  hud.combo(0);
  hud.flash('hit');
  shake = Math.max(shake, 0.25);
  if (mode === 'trial') {
    hud.callout(word, 'bad');
    return;
  }
  strikes--;
  hud.strikes(strikes);
  hud.callout(word, 'bad');
  if (strikes === 1) sound.play('warn', { delay });
  if (strikes <= 0) endRun();
}

function endRun() {
  state = 'ending';
  stateT = 0;
  record = score > best;
  if (record) {
    best = score;
    save();
  }
}

// The time trial's finish line.
function finishRun() {
  state = 'ending';
  stateT = 0;
  finishTime = runTime + penalty;
  hud.time(formatTime(finishTime));
  record = bestTime === 0 || finishTime < bestTime;
  recordGain = bestTime > 0 ? bestTime - finishTime : 0;
  if (record) {
    bestTime = finishTime;
    bestSplits = splitTimes.slice();
    save();
  }
  hud.callout('FINISH!', 'gold');
  hud.flash('white');
  sound.play('finish');
  fx.burst(skier.x, slopeY(skier.z) + 2, skier.z, 24, 0xffd84a, 5, 6, 0.14, 0.9, 8, 1.2);
}

function gameOver() {
  state = 'over';
  stateT = 0;
  if (mode === 'trial') {
    const misses = missed > 0 ? `${missed} missed (+${missed * PENALTY} s)` : 'clean run!';
    let line;
    if (record && recordGain > 0) line = `<div class="record">NEW RECORD! ${formatGap(-recordGain)}</div>`;
    else if (record) line = `<div class="record">NEW RECORD!</div>`;
    else line = `<div class="small">Best ${formatTime(bestTime)} (${formatGap(finishTime - bestTime)})</div>`;
    hud.message(
      `<div class="title">FINISH</div>` +
        `<div class="big">${formatTime(finishTime)}</div>` +
        line +
        `<div class="small">${TRIAL_GATES} gates · ${misses}</div>` +
        `<div class="blink">Press A to race again</div>` +
        `<div class="small">B title</div>`,
    );
  } else {
    hud.message(
      `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
        `<div class="big">${score}</div>` +
        (record ? '' : `<div class="small">Best ${best}</div>`) +
        `<div class="small">${Math.floor(distance)} m · ${gates} gate${gates === 1 ? '' : 's'}` +
        `${maxCombo > 1 ? ` · best combo ×${maxCombo}` : ''}</div>` +
        `<div class="blink">Press A to play again</div>` +
        `<div class="small">B title</div>`,
    );
  }
  sound.play(record ? 'record' : 'over');
  sound.duck(true);
}

// ---------------------------------------------------------------- the run

// The skier crossed the line of the next gate this frame: between the
// flags or not? It is judged where the line was crossed, not where the
// skier is at the end of the frame.
function checkGate(demo) {
  const g = course.nextGate;
  if (!g || skier.z > g.z) return;
  const dz = skier.pz - skier.z;
  const cx = dz > 0 ? skier.px + ((skier.x - skier.px) * (skier.pz - g.z)) / dz : skier.x;
  const between = Math.abs(cx - g.x) <= g.half + EDGE_TOL;
  // Tumbling through a gate in the endless run costs nothing more (the crash
  // already did); the time trial judges it like any other.
  if (skier.crashed && (demo || mode === 'endless')) {
    course.settle(SKIPPED, cx);
    return;
  }
  const gx = g.x;
  const gz = g.z;
  const half = g.half;
  const top = slopeY(gz) + 1.6;
  if (!demo) settled++;
  if (between) {
    course.settle(PASSED, cx);
    fx.burst(gx - half, top, gz, 6, FLAG_HEX[g.color], 3, 3, 0.13, 0.6, 8, 1.5);
    fx.burst(gx + half, top, gz, 6, FLAG_HEX[g.color], 3, 3, 0.13, 0.6, 8, 1.5);
    fx.burst(cx, top - 0.4, gz, 8, 0xffd84a, 3.5, 4, 0.11, 0.6, 8, 1.5);
    if (demo) return;
    gates++;
    const pan = clamp((gx - camX) / 12, -0.6, 0.6);
    if (course.poleGap < 0.6) sound.play('brush', { rate: 0.95 + Math.random() * 0.1, pan });
    if (mode === 'trial') {
      sound.play('gate', { volume: 0.8, rate: 2 ** (COMBO_STEPS[2] / 12) });
      timeSplit();
      return;
    }
    combo = Math.min(MAX_COMBO, combo + 1);
    maxCombo = Math.max(maxCombo, combo);
    const points = GATE_POINTS * combo;
    gatePoints += points;
    popupAt(`+${points}`, gx, top + 0.8, gz, combo >= 5 ? 'gold' : '');
    hud.combo(combo);
    hud.bumpScore();
    sound.play('gate', { rate: 2 ** (COMBO_STEPS[combo] / 12), pan });
    if (combo === 5 || combo === MAX_COMBO) hud.callout(`COMBO ×${combo}!`, 'gold');
  } else {
    course.settle(MISSED, cx);
    if (demo) return;
    missed++;
    sound.play('miss', { pan: clamp((gx - camX) / 12, -0.6, 0.6) });
    if (mode === 'trial') {
      penalty += PENALTY;
      fault(`MISSED +${PENALTY} s`, 0);
      timeSplit();
    } else {
      fault('MISSED!', 0.3);
    }
  }
}

// At the split gates of the time trial: ahead of the best run or behind?
function timeSplit() {
  const k = SPLITS.indexOf(settled);
  if (k < 0) return;
  const t = runTime + penalty;
  splitTimes[k] = t;
  const ref = bestSplits[k];
  if (!(ref > 0)) return;
  const gap = t - ref;
  hud.callout(formatGap(gap), gap <= 0 ? 'good' : 'bad');
  sound.play('split', { rate: gap <= 0 ? 1.12 : 0.84, delay: 0.12 });
}

function checkCrash(demo) {
  if (skier.crashed || skier.safe > 0) return;
  const i = course.hit(skier.px, skier.pz, skier.x, skier.z, skier.y);
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
  sound.play(CRASH_SOUNDS[kind], { rate: 0.96 + Math.random() * 0.08 });
  fault(kind === FENCE ? 'IN THE NET!' : kind === ROCK ? 'ON THE ROCKS!' : 'CRASH!', 0.45);
}

// A gold flag off the line: bonus points for going out of the way.
function checkBonus(demo) {
  if (skier.crashed || !course.collect(skier.px, skier.pz, skier.x, skier.z)) return;
  const x = course.bonusX;
  const z = course.bonusZ;
  fx.burst(x, slopeY(z) + 1.6, z, 14, 0xffd84a, 3.5, 4, 0.12, 0.7, 8, 1.5);
  if (demo) return;
  airPoints += BONUS_POINTS;
  popupAt(`BONUS +${BONUS_POINTS}`, x, slopeY(z) + 2.4, z, 'gold');
  hud.bumpScore();
  sound.play('bonus', { rate: 0.98 + Math.random() * 0.04 });
}

function onLanding(demo) {
  const big = skier.lastAir > AIR_MIN;
  const y = slopeY(skier.z) + skier.ground;
  fx.burst(skier.x, y + 0.1, skier.z, big ? 14 : 5, 0xffffff, 3, 2.5, 0.12, 0.5, 9, 2);
  if (skier.wipeout) {
    // Came down halfway through a spin: down it goes.
    skier.crash(skier.x - skier.spinDir);
    fx.burst(skier.x, y + 0.6, skier.z, 20, 0xffffff, 4.5, 6, 0.17, 0.9, 12, 1.5);
    shake = 0.45;
    if (demo) return;
    sound.play('wipeout');
    fault('WIPEOUT!', 0.45);
    return;
  }
  if (!demo) sound.play('land', { volume: big ? Math.min(1, 0.45 + skier.lastAir * 0.5) : 0.3, rate: big ? 0.92 : 1.1 });
  if (!big) return;
  shake = Math.max(shake, 0.12);
  if (demo || mode === 'trial') return;
  let points = 50 + Math.round(skier.lastAir * 10) * 10;
  let text = `AIR +${points}`;
  const spins = Math.min(3, skier.landedSpins);
  if (spins > 0) {
    points += SPIN_POINTS[spins];
    text = `${SPIN_NAMES[spins]} +${points}`;
    hud.callout(SPIN_NAMES[spins], 'gold');
    sound.play('trick', { rate: 1 + (spins - 1) * 0.06 });
  } else {
    sound.play('air', { volume: 0.8 });
    if (skier.lastAir > 1) hud.callout('BIG AIR!', 'gold');
  }
  airPoints += points;
  popupAt(text, skier.x, y + 2.2, skier.z, 'gold');
  hud.bumpScore();
}

// Ski tracks, and snow spray when carving hard, ploughing or in deep snow.
// The skis cut no track and throw no snow on ice.
function snowFx(dt) {
  const onSnow = !skier.air && !skier.crashed && !skier.ice;
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
  checkBonus(demo);
  if (skier.landed) onLanding(demo);
  if (state === 'ending') return;
  if (skier.launched) {
    fx.burst(skier.x, slopeY(skier.z) + skier.y, skier.z, 10, 0xffffff, 2.5, 3, 0.12, 0.5, 9, 2);
    if (!demo) sound.play('takeoff', { rate: 0.95 + skier.v * 0.004 });
  }
  if (!demo && mode === 'trial' && skier.z <= course.finishZ) finishRun();
  snowFx(dt);
}

function updateScore() {
  distance = Math.max(distance, -skier.z);
  if (mode === 'trial') {
    // New text only when what is shown changes.
    const tenths = Math.floor((runTime + penalty) * 10);
    if (tenths !== shownTenths) {
      shownTenths = tenths;
      hud.time(formatTime(runTime + penalty, true));
    }
    if (settled !== shownGates) {
      shownGates = settled;
      hud.sub(`Gate ${settled}/${TRIAL_GATES}`);
    }
    return;
  }
  score = Math.floor(distance) + gatePoints + airPoints;
  hud.score(score);
  hud.distance(Math.floor(distance));
  if (best > 0 && !passedBest && score > best) {
    passedBest = true;
    hud.callout('NEW BEST!', 'gold');
    sound.play('best');
  } else if (distance >= nextMilestone) {
    hud.callout(`${nextMilestone} m`, '');
    sound.play('milestone');
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

// The time trial's start: the skier waits in the gate, then pushes off.
function countIn(dt) {
  const shown = Math.ceil(countdown / COUNT_STEP);
  countdown -= dt;
  skier.update(dt, 0, false, true, 0, course);
  if (countdown <= 0) {
    countdown = 0;
    skier.v = START_SPEED * 0.6;
    hud.callout('GO!', 'gold');
    sound.play('go');
  } else if (Math.ceil(countdown / COUNT_STEP) !== shown) {
    hud.callout(String(Math.ceil(countdown / COUNT_STEP)), '');
    sound.play('beep');
  }
}

function playFrame(dt) {
  runTime += dt;
  const tuck = input.down('DOWN');
  let steer = input.dpad.x;
  let tuckOn = tuck;
  if (import.meta.env.DEV && window.__ss?.autopilot) {
    steer = demoSteer();
    tuckOn = demoTuck;
  }
  const steep = lerp(STEEP_START, STEEP_END, course.levelAt(-skier.z));
  skier.update(dt, steer, tuckOn, input.down('UP') && !tuck, steep, course);
  // A spin off a kicker; a press just before take-off counts too.
  if (mode === 'endless') {
    if (input.pressed('A')) trickBuffer = TRICK_BUFFER;
    else trickBuffer = Math.max(0, trickBuffer - dt);
    const dir = input.dpad.x !== 0 ? input.dpad.x : skier.edge < 0 ? -1 : 1;
    if (trickBuffer > 0 && skier.trick(dir)) {
      trickBuffer = 0;
      sound.play('spin', { rate: 0.97 + Math.random() * 0.06 });
    }
  }
  afterMove(dt, false);
  if (state === 'play') updateScore();
}

// The continuous sounds: the skis on the snow, the wind and the scrape of
// ice, all following speed. Quiet behind the title, silent when paused.
function loopSounds(live) {
  let level = 0;
  if (live && (state === 'play' || state === 'ending')) level = 1;
  else if (live && (state === 'title' || state === 'options')) level = 0.35;
  const v = skier.v;
  const speed = Math.min(1, v / 26);
  const onSnow = !skier.air && !skier.crashed && v > 0.5;
  const carve = onSnow && !skier.ice ? speed * (0.35 + 0.45 * Math.abs(skier.edge)) + 0.4 * skier.brake * speed + (skier.deep ? 0.3 : 0) : 0;
  carveLoop.set(level * Math.min(1, carve), 0.8 + 0.45 * speed + 0.12 * Math.abs(skier.edge) - (skier.deep ? 0.15 : 0));
  iceLoop.set(level * (onSnow && skier.ice ? 0.3 + 0.6 * speed : 0), 0.85 + 0.35 * speed);
  windLoop.set(level * (0.08 + 0.6 * speed * speed + (skier.air ? 0.15 : 0)), 0.7 + 0.6 * speed);
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

// Compile every material, upload every texture and draw one of every kind
// of object now, while loading: kickers, fences, ice, bonus flags and the
// finish only show up far into a run, so without this their first
// appearance could stall the game.
world.reset(CAM_BACK);
course.warmUp(0);
skier.reset(0, 0, 0);
fx.burst(0, 1, -6, 4, 0xffffff, 1, 1, 0.2, 0.5, 8, 1);
fx.update(0.01);
fx.track(0, 0, -2, true, 0.1);
fx.track(0, 0, -3, true, 0.1);
updateCamera(0, true);
view.update(camera, FOG_FAR);
world.cull(view);
course.cull(view);
scene.traverse((object) => {
  if (object.material?.map) renderer.initTexture(object.material.map);
});
renderer.compile(scene, camera);
renderer.render(scene, camera);

toTitle();
sound.startMusic();

hh.run((dt) => {
  stateT += dt;
  let live = true; // false while paused: nothing moves

  if (state === 'title' || state === 'options') {
    const steer = demoSteer();
    skier.update(dt, steer, demoTuck, false, lerp(STEEP_START, STEEP_END, DEMO_LEVEL), course);
    afterMove(dt, true);
    if (state === 'title') titleInput();
    else {
      const item = menuInput();
      if (item === 'back') {
        state = 'title';
        titleMessage();
        sound.play('back');
      } else if (item) toggle(item);
    }
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
      live = false;
    } else if (countdown > 0) countIn(dt);
    else playFrame(dt);
  } else if (state === 'paused') {
    live = false;
    const item = input.pressed('START') ? 'resume' : menuInput();
    if (item === 'resume' || item === 'back') resume();
    else if (item === 'quit') {
      // A score fairly earned still counts as the best.
      if (mode === 'endless' && score > best) {
        best = score;
        save();
      }
      toTitle();
      sound.play('back');
    } else if (item) toggle(item);
  } else if (state === 'ending') {
    // The run is over: tumble out or snowplough to a stop.
    skier.update(dt, 0, false, true, 0, course);
    if (stateT > 1.6) gameOver();
  } else if (state === 'over') {
    skier.update(dt, 0, false, true, 0, course);
    // A short delay so a button mashed at the end does not restart at once.
    if (stateT > 0.5 && input.pressed('A')) start();
    else if (stateT > 0.5 && input.pressed('B')) {
      toTitle();
      sound.play('back');
    }
  }

  if (live) {
    course.update(dt, skier.z, camZ);
    world.update(camZ);
    fx.update(dt);
    skier.draw();
    hud.speed(Math.round(skier.v * 3.6));
    shake = Math.max(0, shake - dt);
  }
  updateCamera(dt, live);
  // Only what the camera can see is drawn.
  view.update(camera, FOG_FAR);
  world.cull(view);
  course.cull(view);
  loopSounds(live);

  renderer.render(scene, camera);
});

if (import.meta.env.DEV) {
  window.__ss = {
    renderer,
    scene,
    camera,
    skier,
    course,
    hh,
    sound,
    autopilot: false,
    setStrikes(n) {
      strikes = n;
    },
    get state() {
      return state;
    },
    get mode() {
      return mode;
    },
    get run() {
      return { score, distance, strikes, combo, gates, settled, missed, runTime, penalty, countdown };
    },
  };
}
