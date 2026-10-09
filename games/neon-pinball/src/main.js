// Neon Pinball: one table with pop bumpers, slingshots, drop targets, a
// spinner and rollover lanes. L or LEFT flips the left flipper, R or A the
// right one, hold DOWN to pull the plunger and let go to launch, UP nudges
// the table. START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, BUMPER_COLORS, CYAN, LIME, MAGENTA, ORANGE, RED, YELLOW } from './shared.js';
import { DRAIN_Y, LAMP_COUNT, LAMP_LANE, LAMP_MB, LAMP_MULT, LAMP_POWER, LAMP_SAVE, LAMP_TARGET } from './table.js';
import {
  EV_BUMPER,
  EV_FLIPPER,
  EV_LANE,
  EV_LAUNCH,
  EV_SLING,
  EV_SPIN,
  EV_TARGET,
  EV_WALL,
  MAX_BALLS,
  createPhysics,
} from './physics.js';
import { createView } from './view.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const BALLS = 3;
const SAVE_TIME = [12, 9, 7]; // ball save seconds for balls 1, 2, 3
const MB_SAVE = 10; // ball save seconds when multiball starts
const SKILL_WINDOW = 4; // seconds after a launch in which a lane is a skill shot
const MAX_MULT = 5;

const POINTS_BUMPER = 250;
const POINTS_SLING = 50;
const POINTS_TARGET = 750;
const POINTS_BANK = 5000;
const POINTS_JACKPOT = 25000; // a bank cleared during multiball
const POINTS_LANE = 500;
const POINTS_LANES = 2500;
const POINTS_SKILL = 10000;
const POINTS_SPIN = 50; // every half turn of the spinner

// End-of-ball bonus, counted up after a drain and multiplied by the lanes'
// multiplier.
const BONUS_TARGET = 1000;
const BONUS_LANE = 1000;
const BONUS_BUMPER = 100;
const BONUS_SPIN = 20;

// Nudging: each nudge heats the table up, the heat cools down by itself.
// Too much at once is a warning, then a tilt (the ball is lost, no bonus).
const HEAT_COOL = 0.35; // per second
const HEAT_WARN = 2.5;
const HEAT_TILT = 3.5;

// The three pop bumpers sound E, G and B (the music is in E minor).
const BUMPER_RATE = [1, 2 ** (3 / 12), 2 ** (7 / 12)];
// Notes up E minor pentatonic for chains: targets in a bank, lit lanes,
// the bonus count.
const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
const rateOf = (step) => 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
const physics = createPhysics(onEvent);
const view = createView(scene, hh);
const hud = createHud(hh.hud);
const sound = createSound(hh, {
  sfx: [
    'flip_up', 'flip_down', 'rubber', 'wall', 'bumper', 'sling', 'target', 'bank', 'jackpot', 'lane', 'lanes',
    'spinner', 'pull', 'launch', 'skill', 'drain', 'save', 'multiball', 'bonus', 'total', 'ready', 'nudge',
    'warning', 'tilt', 'roll', 'start', 'over', 'record', 'move', 'select', 'back', 'pause',
  ],
  music: 'theme',
});
const rollLoop = sound.loop('roll');
const pullLoop = sound.loop('pull');
let rollOn = false;
let pullOn = false;

let state = 'title'; // title | play | paused | over
let phase = 'lane'; // during play: lane (waiting on the plunger) | live | drain | bonus
let score = 0;
let ball = 1;
let mult = 1;
let best = hh.load('neon-pinball', { best: 0 }).best;
let bestAtStart = 0;
let passedBest = false;
let saveTime = 0;
let saveUsed = false;
let skillLane = 0;
let skillTime = 0;
let untouched = false; // nothing hit since the launch (for the skill shot)
let lanesFlash = 0;
let phaseTime = 0;
let overTime = 0;
let clock = 0;
let multiball = false;
let kickPending = 0; // balls waiting to be kicked out of the plunger lane
let heat = 0;
let warned = false;
let tilted = false;
let bonus = 0; // this ball's bonus, before the multiplier
let bonusTotal = 0;
let bonusShown = 0;
let bonusTicks = 0;
let bonusDone = false;
let menuSel = 0;
const lanesLit = new Uint8Array(3);
const bankTimer = new Float32Array(2);
const mbLit = new Uint8Array(2); // banks cleared towards multiball
const flipHeld = new Uint8Array(2);
const levels = new Float32Array(LAMP_COUNT);
const stats = { targets: 0, spins: 0, multiballs: 0 };

// Attract mode: a demo ball played by a simple bot behind the title screen.
let botLeft = 0;
let botRight = 0;
let botPull = -1;

const fmt = (n) => n.toLocaleString('en-US');
const KEY = (button) => `<span class="key">${button}</span>`;
const pan = (x) => Math.max(-0.7, Math.min(0.7, x / 7));
const wobble = () => 0.96 + Math.random() * 0.08;

// Points times the multiplier, doubled while multiball runs (but not the
// jackpot, which is the multiball's own award).
function add(points, double = true) {
  if (tilted) return;
  score += points * mult * (multiball && double ? 2 : 1);
}

function bankDown(bank) {
  const up = physics.targetUp;
  return !up[bank * 3] && !up[bank * 3 + 1] && !up[bank * 3 + 2];
}

function targetsDown(bank) {
  const up = physics.targetUp;
  return 3 - up[bank * 3] - up[bank * 3 + 1] - up[bank * 3 + 2];
}

// Called by the physics for every contact worth a sound or points.
function onEvent(type, id, x, y, power) {
  const playing = state === 'play';
  if (type === EV_BUMPER) {
    view.bumperHit(id);
    view.burst(x, y, BUMPER_COLORS[id], 7, 6);
    view.shake(0.14);
    if (!playing) return;
    sound.play('bumper', { rate: BUMPER_RATE[id], volume: 0.85, pan: pan(x) });
    add(POINTS_BUMPER);
    bonus += BONUS_BUMPER;
    untouched = false;
  } else if (type === EV_SLING) {
    view.slingHit(id);
    view.burst(x, y, YELLOW, 5, 4);
    view.shake(0.1);
    if (!playing) return;
    sound.play('sling', { rate: wobble(), pan: pan(x) });
    add(POINTS_SLING);
    untouched = false;
  } else if (type === EV_TARGET) {
    view.targetHit(id);
    view.burst(x, y, LIME, 8, 5);
    view.shake(0.12);
    const bank = id < 3 ? 0 : 1;
    const cleared = bankDown(bank);
    if (cleared) bankTimer[bank] = 1.5;
    if (!playing) return;
    sound.play('target', { rate: rateOf(targetsDown(bank) - 1), pan: pan(x) });
    add(POINTS_TARGET);
    bonus += BONUS_TARGET;
    stats.targets++;
    untouched = false;
    if (cleared) bankCleared(bank);
  } else if (type === EV_LANE) {
    view.burst(x, y, CYAN, 6, 3);
    if (!playing) return;
    if (skillTime > 0 && untouched && id === skillLane) {
      add(POINTS_SKILL);
      hud.event('SKILL SHOT!', 'yellow');
      sound.play('skill');
      view.flash(YELLOW, 0.8);
      view.shake(0.25);
      view.burst(x, y, YELLOW, 16, 7);
    }
    skillTime = 0;
    if (lanesFlash > 0) {
      sound.play('lane', { volume: 0.5, rate: 0.75 });
      return;
    }
    const fresh = !lanesLit[id];
    add(fresh ? POINTS_LANE : POINTS_LANE / 5);
    if (fresh) bonus += BONUS_LANE;
    lanesLit[id] = 1;
    const lit = lanesLit[0] + lanesLit[1] + lanesLit[2];
    if (lit === 3) {
      add(POINTS_LANES);
      if (mult < MAX_MULT) mult++;
      physics.setGravity(1 + (mult - 1) * 0.04); // a higher multiplier plays a little faster
      hud.mult(mult);
      hud.event(`${mult}X SCORING`, 'cyan');
      sound.play('lanes', { rate: 2 ** ((mult - 2) / 12) });
      view.flash(CYAN, 0.6);
      view.shake(0.2);
      lanesFlash = 1.4;
    } else {
      sound.play('lane', { rate: fresh ? rateOf(lit + 1) : 0.75, volume: fresh ? 1 : 0.5, pan: pan(x) });
    }
  } else if (type === EV_LAUNCH) {
    view.burst(x, y + 0.3, ORANGE, 6, 3);
    view.shake(0.1);
    if (!playing) return;
    sound.play('launch', { volume: id === 1 ? 0.8 : 0.5 + power * 0.5, rate: id === 1 ? 1.06 : 0.94 + power * 0.1, pan: 0.6 });
    if (id === 0 && phase === 'lane') {
      skillTime = SKILL_WINDOW;
      untouched = true;
    }
  } else if (type === EV_SPIN) {
    if (!playing) return;
    sound.play('spinner', { rate: 0.8 + Math.min(0.45, power / 90), volume: 0.5 + Math.min(0.5, power / 60), pan: -0.6 });
    add(POINTS_SPIN);
    bonus += BONUS_SPIN;
    stats.spins++;
    untouched = false;
  } else if (type === EV_FLIPPER) {
    if (!playing) return;
    sound.play('rubber', { volume: Math.min(1, power / 24), rate: wobble(), pan: id === 0 ? -0.3 : 0.3 });
  } else if (type === EV_WALL) {
    if (!playing) return;
    sound.play('wall', { volume: Math.min(1, power / 28), rate: wobble(), pan: pan(x) });
  }
}

// A whole bank of drop targets is down: a step towards multiball, or the
// jackpot while multiball runs.
function bankCleared(bank) {
  view.shake(0.22);
  if (multiball) {
    add(POINTS_JACKPOT, false);
    hud.event('JACKPOT!', 'magenta');
    sound.play('jackpot');
    view.flash(MAGENTA, 0.9);
    return;
  }
  add(POINTS_BANK);
  view.flash(LIME, 0.5);
  mbLit[bank] = 1;
  if (mbLit[0] && mbLit[1]) {
    startMultiball();
  } else {
    hud.event('BANK CLEAR', 'lime');
    sound.play('bank', { rate: bank ? 2 ** (2 / 12) : 1 });
  }
}

function startMultiball() {
  multiball = true;
  mbLit.fill(0);
  stats.multiballs++;
  kickPending++;
  saveTime = Math.max(saveTime, MB_SAVE);
  hud.multiball(true);
  hud.event('MULTIBALL!', 'magenta');
  sound.play('multiball');
  view.flash(MAGENTA, 1);
  view.shake(0.3);
}

function endMultiball() {
  multiball = false;
  hud.multiball(false);
}

// Shifts the lit rollover lanes, as flipper buttons do on real tables.
function rotateLanes(dir) {
  if (dir > 0) {
    const last = lanesLit[2];
    lanesLit[2] = lanesLit[1];
    lanesLit[1] = lanesLit[0];
    lanesLit[0] = last;
  } else {
    const first = lanesLit[0];
    lanesLit[0] = lanesLit[1];
    lanesLit[1] = lanesLit[2];
    lanesLit[2] = first;
  }
}

function setTilt(on) {
  tilted = on;
  physics.setTilt(on);
}

function resetTable() {
  physics.raiseAll();
  bankTimer.fill(0);
  lanesLit.fill(0);
  mbLit.fill(0);
  lanesFlash = 0;
  mult = 1;
  multiball = false;
  kickPending = 0;
  setTilt(false);
  physics.setGravity(1);
  hud.multiball(false);
}

function stopLoops() {
  if (rollOn) rollLoop.stop();
  if (pullOn) pullLoop.stop();
  rollOn = false;
  pullOn = false;
}

// ---------------------------------------------------------------- menus

const ON_OFF = (on) => (on ? 'ON' : 'OFF');

function menuRows(items, labels) {
  let html = '<div class="menu">';
  for (let i = 0; i < items.length; i++) {
    html += `<div class="item${i === menuSel ? ' sel' : ''}">${labels(items[i])}</div>`;
  }
  return html + '</div>';
}

const TITLE_ITEMS = ['play', 'sound', 'music'];
const PAUSE_ITEMS = ['resume', 'sound', 'music', 'quit'];

function itemLabel(item) {
  if (item === 'play') return 'PLAY';
  if (item === 'resume') return 'RESUME';
  if (item === 'sound') return `SOUND <b>${ON_OFF(sound.sfxOn)}</b>`;
  if (item === 'music') return `MUSIC <b>${ON_OFF(sound.musicOn)}</b>`;
  return 'QUIT TO TITLE';
}

function showTitle() {
  hud.message(
    `<div class="title">NEON PINBALL</div>` +
      menuRows(TITLE_ITEMS, itemLabel) +
      (best > 0 ? `<div class="small">Best ${fmt(best)}</div>` : '') +
      `<div class="small keys">${KEY('L')} / ${KEY('◀')} left flipper · ${KEY('R')} / ${KEY('A')} right flipper</div>` +
      `<div class="small keys">hold ${KEY('▼')} launch · ${KEY('▲')} nudge · ${KEY('START')} pause</div>`,
    'title-panel',
  );
}

function showPause() {
  hud.message(
    `<div class="title">PAUSED</div>` +
      menuRows(PAUSE_ITEMS, itemLabel) +
      `<div class="small keys">${KEY('A')} select · ${KEY('B')} or ${KEY('START')} resume</div>`,
  );
}

// Up / down moves through the items; returns the item A chose, 'redraw', or
// null. Left / right flip a toggle too.
function menuInput(items) {
  const dy = input.pressed('DOWN') ? 1 : input.pressed('UP') ? -1 : 0;
  if (dy) {
    menuSel = (menuSel + dy + items.length) % items.length;
    sound.play('move');
    return 'redraw';
  }
  const item = items[menuSel];
  const dx = input.pressed('RIGHT') || input.pressed('LEFT');
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

function toTitle() {
  state = 'title';
  menuSel = 0;
  resetTable();
  physics.serve();
  botPull = -1;
  stopLoops();
  hud.showStats(false);
  hud.clearEvent();
  hud.bonus('');
  hud.hint('');
  sound.duck(false);
  sound.startMusic();
  showTitle();
}

function serveBall() {
  phase = 'lane';
  phaseTime = 0;
  saveUsed = false;
  saveTime = 0;
  skillTime = 0;
  skillLane = Math.floor(Math.random() * 3);
  mult = 1;
  bonus = 0;
  heat = 0;
  warned = false;
  setTilt(false);
  physics.setGravity(1);
  physics.serve();
  hud.mult(1);
  hud.balls(ball, BALLS);
  hud.bonus('');
}

function start() {
  state = 'play';
  score = 0;
  ball = 1;
  bestAtStart = best;
  passedBest = false;
  stats.targets = 0;
  stats.spins = 0;
  stats.multiballs = 0;
  resetTable();
  serveBall();
  hud.showStats(true);
  hud.score(0);
  hud.best(best);
  hud.message('');
  hud.event('BALL 1', 'cyan');
  sound.duck(false);
  sound.startMusic();
  sound.play('start');
}

function pause() {
  state = 'paused';
  menuSel = 0;
  stopLoops();
  sound.play('pause');
  sound.duck(true);
  hud.bonus('');
  hud.hint('');
  showPause();
}

function resume() {
  state = 'play';
  hud.message('');
  sound.duck(false);
  if (phase === 'bonus' && (bonusTotal > 0 || tilted)) showBonus();
}

function keepBest() {
  if (score <= best) return false;
  best = score;
  hh.save('neon-pinball', { best });
  return true;
}

// Ball i fell past the flippers.
function ballDrained(i) {
  const others = physics.activeCount() - 1 + kickPending;
  if (saveTime > 0 && !tilted) {
    hud.event('BALL SAVED', 'yellow');
    sound.play('save');
    view.flash(YELLOW, 0.4);
    if (others > 0 || multiball) {
      // During multiball the table kicks the ball straight back out.
      physics.park(i);
      kickPending++;
    } else {
      // The ball comes back to the plunger, once per ball.
      saveTime = 0;
      saveUsed = true;
      phase = 'lane';
      physics.serve();
    }
    return;
  }
  physics.park(i);
  if (others > 0) {
    // One of the multiball balls is gone; the game goes on with the other.
    if (others === 1) endMultiball();
    sound.play('drain', { volume: 0.6, rate: 1.12 });
    view.flash(RED, 0.3);
    return;
  }
  endMultiball();
  phase = 'drain';
  phaseTime = 0;
  saveTime = 0;
  skillTime = 0;
  if (pullOn) pullLoop.stop();
  pullOn = false;
  hud.event(ball < BALLS ? 'DRAIN' : 'LAST BALL', 'red');
  sound.play('drain');
  view.flash(RED, 0.7);
  view.shake(0.3);
}

// The bonus count after a drain: the bonus times the multiplier ticks up,
// then lands on the score. A flipper button or A hurries it.
function startBonus() {
  phase = 'bonus';
  phaseTime = 0;
  bonusTotal = tilted ? 0 : bonus * mult;
  bonusShown = 0;
  bonusTicks = 0;
  bonusDone = false;
  // Nothing scored this ball: no count to show.
  if (bonusTotal > 0 || tilted) showBonus();
}

function showBonus() {
  if (tilted) {
    hud.bonus(`<div class="bonus-title">TILT</div><div>No bonus</div>`);
    return;
  }
  hud.bonus(
    `<div class="bonus-title">BONUS</div>` +
      `<div>${fmt(bonus)} × ${mult}X</div>` +
      `<div class="bonus-total">${fmt(bonusShown)}</div>`,
  );
}

const BONUS_STEPS = 16;
const BONUS_STEP_TIME = 0.075;

function updateBonus() {
  if (!bonusDone) {
    const hurry = input.pressed('A') || input.pressed('L') || input.pressed('R');
    const steps = hurry ? BONUS_STEPS : Math.min(BONUS_STEPS, Math.floor(phaseTime / BONUS_STEP_TIME));
    if (bonusTotal > 0 && steps > bonusTicks) {
      bonusTicks = steps;
      bonusShown = Math.round((bonusTotal * bonusTicks) / BONUS_STEPS / 10) * 10;
      if (!hurry) sound.play('bonus', { rate: rateOf(Math.floor(bonusTicks / 2)), volume: 0.8 });
      showBonus();
    }
    if (bonusTicks >= BONUS_STEPS || bonusTotal === 0) {
      bonusDone = true;
      phaseTime = 0;
      score += bonusTotal;
      if (bonusTotal > 0) sound.play('total');
    }
    return;
  }
  if (phaseTime < 0.9) return;
  hud.bonus('');
  if (ball >= BALLS) {
    gameOver();
    return;
  }
  ball++;
  serveBall();
  hud.event(`BALL ${ball}`, 'cyan');
  sound.play('ready');
}

function gameOver() {
  state = 'over';
  overTime = 0;
  physics.park();
  stopLoops();
  const record = keepBest();
  hud.best(best);
  hud.clearEvent();
  hud.hint('');
  sound.duck(true);
  sound.play(record ? 'record' : 'over');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big-score">${fmt(score)}</div>` +
      `<div class="stats"><span>Targets <b>${stats.targets}</b></span><span>Spins <b>${stats.spins}</b></span>` +
      `<span>Multiball <b>${stats.multiballs}</b></span></div>` +
      `<div class="small">Best ${fmt(best)}</div>` +
      `<div class="keys">${KEY('A')} play again · ${KEY('B')} title</div>`,
    record ? 'record' : '',
  );
}

function nudge() {
  physics.nudge();
  view.shake(0.2);
  sound.play('nudge', { rate: wobble() });
  heat += 1;
  if (heat > HEAT_TILT) {
    setTilt(true);
    saveTime = 0;
    hud.event('TILT', 'red');
    sound.play('tilt');
    view.flash(RED, 0.8);
  } else if (heat > HEAT_WARN && !warned) {
    warned = true;
    hud.event('DANGER', 'red');
    sound.play('warning');
  }
}

function updatePlay(dt) {
  const left = input.down('L') || input.down('LEFT');
  const right = input.down('R') || input.down('A');
  const onTable = phase === 'lane' || phase === 'live';
  if (lanesFlash <= 0 && onTable && !tilted) {
    if (input.pressed('L') || input.pressed('LEFT')) rotateLanes(-1);
    if (input.pressed('R') || input.pressed('A')) rotateLanes(1);
  }
  if (onTable && !tilted && input.pressed('UP')) nudge();
  heat = Math.max(0, heat - HEAT_COOL * dt);
  if (heat < 1) warned = false;
  const pull = onTable && input.down('DOWN');
  physics.update(dt, left, right, pull);

  // Flipper solenoids: a clack up, a softer one down.
  for (let i = 0; i < 2; i++) {
    const held = physics.flippers[i].held ? 1 : 0;
    if (held !== flipHeld[i]) sound.play(held ? 'flip_up' : 'flip_down', { rate: wobble(), pan: i ? 0.35 : -0.35 });
    flipHeld[i] = held;
  }

  if (phase === 'lane' && !physics.inLane(0) && physics.balls[0].active) {
    // The ball left the plunger lane: it is in play, the ball save runs.
    phase = 'live';
    saveTime = saveUsed ? 0 : SAVE_TIME[ball - 1];
  }
  if (kickPending > 0 && onTable) {
    const k = physics.freeBall();
    if (k >= 0 && physics.kickOut(k)) kickPending--;
  }
  if (onTable) {
    for (let i = 0; i < MAX_BALLS; i++) {
      const b = physics.balls[i];
      if (!b.active) continue;
      if (b.y < DRAIN_Y) ballDrained(i);
      else if (physics.lost(i)) {
        // Safety net, never expected: give the ball back without a penalty.
        physics.park(i);
        if (physics.activeCount() > 0) kickPending++;
        else {
          phase = 'lane';
          physics.serve();
        }
      }
    }
  }
  phaseTime += dt;
  if (phase === 'drain' && phaseTime > 1.0) startBonus();
  else if (phase === 'bonus') updateBonus();

  saveTime = Math.max(0, saveTime - dt);
  skillTime = Math.max(0, skillTime - dt);
  if (lanesFlash > 0) {
    lanesFlash -= dt;
    if (lanesFlash <= 0) lanesLit.fill(0);
  }
  if (!passedBest && bestAtStart > 0 && score > bestAtStart && state === 'play') {
    passedBest = true;
    hud.event('NEW BEST!', 'yellow');
    sound.play('record', { volume: 0.5 });
  }
  if (state !== 'play') return;
  hud.score(score);
  const b0 = physics.balls[0];
  const waiting = phase === 'lane' && physics.inLane(0) && b0.y < 3;
  hud.hint(waiting ? 'Hold ▼ to pull<br>Release to launch<br><span class="skill">Skill shot:<br>blinking lane</span>' : '');
  updateLoops(pull);
}

// The ball rolling (louder and higher the faster the quickest ball goes) and
// the plunger's spring while it is pulled.
function updateLoops(pull) {
  let speed = 0;
  for (let i = 0; i < MAX_BALLS; i++) {
    const b = physics.balls[i];
    if (b.active && b.y > DRAIN_Y) speed = Math.max(speed, Math.hypot(b.vx, b.vy));
  }
  if (speed > 1.5) {
    rollLoop.set(Math.min(1, speed / 26) * 0.5, 0.75 + Math.min(0.6, speed / 50));
    rollOn = true;
  } else if (rollOn) {
    rollLoop.stop(0.2);
    rollOn = false;
  }
  const p = physics.plunger.pull;
  if (pull && p > 0 && physics.inLane(0)) {
    pullLoop.set(0.6, 0.85 + p * 0.5);
    pullOn = true;
  } else if (pullOn) {
    pullLoop.stop(0.05);
    pullOn = false;
  }
}

// The demo ball in attract mode: flips when the ball drops near a flipper.
function updateDemo(dt) {
  const b = physics.balls[0];
  let pull = false;
  if (physics.inLane(0) && b.y < 2.5 && Math.abs(b.vy) < 0.1 && botPull < 0) botPull = 0.55 + Math.random() * 0.5;
  if (botPull >= 0) {
    botPull -= dt;
    pull = botPull > 0;
    if (!pull) botPull = -1;
  }
  const near = b.y < 4.0 && b.y > 1.4 && b.vy < 0;
  if (near && b.x < 0.3 && b.x > -3 && Math.random() < 0.3) botLeft = 0.2;
  if (near && b.x > -0.3 && b.x < 3 && Math.random() < 0.3) botRight = 0.2;
  botLeft -= dt;
  botRight -= dt;
  physics.update(dt, botLeft > 0, botRight > 0, pull);
  if (b.y < DRAIN_Y || physics.lost(0)) physics.serve();
}

function updateBanks(dt) {
  for (let k = 0; k < 2; k++) {
    if (bankTimer[k] <= 0) continue;
    bankTimer[k] -= dt;
    // Stand the targets back up, unless a ball is right in front of them.
    if (bankTimer[k] <= 0 && !physics.raiseBank(k)) bankTimer[k] = 0.2;
  }
}

function updateLamps() {
  const fast = Math.sin(clock * 16) > 0 ? 1 : 0.1;
  const slow = Math.sin(clock * 7) > 0 ? 1 : 0.1;
  if (state === 'title' || state === 'over') {
    // Attract mode: a chase running over every lamp.
    const step = Math.floor(clock * 10);
    for (let i = 0; i < LAMP_COUNT; i++) levels[i] = (i + step) % 4 === 0 ? 1 : 0;
    return;
  }
  if (tilted) {
    // A tilted table goes dark.
    levels.fill(0);
    return;
  }
  for (let i = 0; i < 3; i++) {
    let v = lanesLit[i];
    if (lanesFlash > 0) v = fast;
    else if (!v && i === skillLane && (phase === 'lane' || skillTime > 0)) v = slow;
    levels[LAMP_LANE + i] = v;
  }
  for (let i = 0; i < 6; i++) {
    const down = !physics.targetUp[i];
    levels[LAMP_TARGET + i] = bankTimer[i < 3 ? 0 : 1] > 0 ? fast : down ? 1 : 0;
  }
  for (let i = 0; i < 4; i++) levels[LAMP_MULT + i] = mult >= i + 2 ? 1 : 0;
  for (let i = 0; i < 2; i++) levels[LAMP_MB + i] = multiball ? fast : mbLit[i] ? 1 : 0;
  levels[LAMP_SAVE] =
    phase === 'lane' && !saveUsed ? 1 : saveTime > 2 ? slow : saveTime > 0 ? fast : 0;
  const pull = physics.plunger.pull;
  const waiting = phase === 'lane' && physics.inLane(0) && pull === 0;
  const wave = Math.floor(clock * 8) % 8;
  for (let i = 0; i < 6; i++) {
    levels[LAMP_POWER + i] = pull * 6 > i + 0.05 ? 1 : waiting && i === wave ? 0.6 : 0;
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

toTitle();

// Upload every texture and compile every material now, while loading, so
// nothing stalls the first time it shows up in play.
scene.traverse((object) => {
  if (object.material?.map) renderer.initTexture(object.material.map);
});
renderer.compile(scene, view.camera);

hh.run((dt) => {
  if (state === 'title') {
    clock += dt;
    updateDemo(dt);
    updateBanks(dt);
    updateTitle();
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else {
      clock += dt;
      updatePlay(dt);
      updateBanks(dt);
    }
  } else if (state === 'paused') {
    updatePaused();
  } else if (state === 'over') {
    clock += dt;
    overTime += dt;
    physics.update(dt, false, false, false);
    // A short delay so a flipper mashed at the drain does not restart at once.
    if (overTime > 0.8 && input.pressed('A')) start();
    else if (overTime > 0.8 && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }

  updateLamps();
  // While paused nothing moves: the view gets no time.
  view.update(state === 'paused' ? 0 : dt, physics, levels);
  renderer.render(scene, view.camera);
});
