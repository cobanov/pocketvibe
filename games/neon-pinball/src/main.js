// Neon Pinball: one table with pop bumpers, slingshots, drop targets and
// rollover lanes. L or LEFT flips the left flipper, R or A the right one,
// hold DOWN to pull the plunger and let go to launch. START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, BUMPER_COLORS, CYAN, LIME, ORANGE, RED, YELLOW } from './shared.js';
import { DRAIN_Y, LAMP_COUNT, LAMP_LANE, LAMP_MULT, LAMP_POWER, LAMP_SAVE, LAMP_TARGET } from './table.js';
import { EV_BUMPER, EV_LANE, EV_LAUNCH, EV_SLING, EV_TARGET, createPhysics } from './physics.js';
import { createView } from './view.js';
import { createHud } from './hud.js';

const BALLS = 3;
const SAVE_TIME = [12, 9, 7]; // ball save seconds for balls 1, 2, 3
const SKILL_WINDOW = 4; // seconds after a launch in which a lane is a skill shot
const MAX_MULT = 5;

const POINTS_BUMPER = 250;
const POINTS_SLING = 50;
const POINTS_TARGET = 750;
const POINTS_BANK = 5000;
const POINTS_LANE = 500;
const POINTS_LANES = 2500;
const POINTS_SKILL = 10000;

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
const physics = createPhysics(onEvent);
const view = createView(scene);
const hud = createHud(hh.hud);

let state = 'title'; // title | play | paused | over
let phase = 'lane'; // during play: lane (waiting on the plunger) | live | drain
let score = 0;
let ball = 1;
let mult = 1;
let best = hh.load('neon-pinball', { best: 0 }).best;
let saveTime = 0;
let saveUsed = false;
let skillLane = 0;
let skillTime = 0;
let untouched = false; // nothing hit since the launch (for the skill shot)
let lanesFlash = 0;
let drainTimer = 0;
let overTime = 0;
let clock = 0;
const lanesLit = new Uint8Array(3);
const bankTimer = new Float32Array(2);
const levels = new Float32Array(LAMP_COUNT);

// Attract mode: a demo ball played by a simple bot behind the title screen.
let botLeft = 0;
let botRight = 0;
let botPull = -1;

const HINT = 'L / ◀ left flipper · R / A right flipper · hold ▼ to launch';

function add(points) {
  score += points * mult;
}

function bankDown(bank) {
  const up = physics.targetUp;
  return !up[bank * 3] && !up[bank * 3 + 1] && !up[bank * 3 + 2];
}

// Called by the physics for every scoring contact.
function onEvent(type, id, x, y) {
  const playing = state === 'play';
  if (type === EV_BUMPER) {
    view.bumperHit(id);
    view.burst(x, y, BUMPER_COLORS[id], 7, 6);
    view.shake(0.14);
    if (playing) {
      add(POINTS_BUMPER);
      untouched = false;
    }
  } else if (type === EV_SLING) {
    view.slingHit(id);
    view.burst(x, y, YELLOW, 5, 4);
    view.shake(0.1);
    if (playing) {
      add(POINTS_SLING);
      untouched = false;
    }
  } else if (type === EV_TARGET) {
    view.targetHit(id);
    view.burst(x, y, LIME, 8, 5);
    view.shake(0.12);
    const bank = id < 3 ? 0 : 1;
    const cleared = bankDown(bank);
    if (cleared) bankTimer[bank] = 1.5;
    if (playing) {
      add(POINTS_TARGET);
      untouched = false;
      if (cleared) {
        add(POINTS_BANK);
        hud.event('BANK CLEAR', 'lime');
        view.flash(LIME, 0.5);
        view.shake(0.22);
      }
    }
  } else if (type === EV_LANE) {
    view.burst(x, y, CYAN, 6, 3);
    if (!playing) return;
    if (skillTime > 0 && untouched && id === skillLane) {
      add(POINTS_SKILL);
      hud.event('SKILL SHOT!', 'yellow');
      view.flash(YELLOW, 0.8);
      view.shake(0.25);
      view.burst(x, y, YELLOW, 16, 7);
    }
    skillTime = 0;
    if (lanesFlash > 0) return;
    add(lanesLit[id] ? POINTS_LANE / 5 : POINTS_LANE);
    lanesLit[id] = 1;
    if (lanesLit[0] && lanesLit[1] && lanesLit[2]) {
      add(POINTS_LANES);
      if (mult < MAX_MULT) mult++;
      physics.setGravity(1 + (mult - 1) * 0.04); // a higher multiplier plays a little faster
      hud.mult(mult);
      hud.event(`${mult}X SCORING`, 'cyan');
      view.flash(CYAN, 0.6);
      view.shake(0.2);
      lanesFlash = 1.4;
    }
  } else if (type === EV_LAUNCH) {
    view.burst(x, y + 0.3, ORANGE, 6, 3);
    view.shake(0.1);
    if (playing && phase === 'lane') {
      skillTime = SKILL_WINDOW;
      untouched = true;
    }
  }
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

function resetTable() {
  physics.raiseAll();
  bankTimer.fill(0);
  lanesLit.fill(0);
  lanesFlash = 0;
  mult = 1;
  physics.setGravity(1);
}

function toTitle() {
  state = 'title';
  resetTable();
  physics.serve();
  botPull = -1;
  hud.showStats(false);
  hud.clearEvent();
  hud.message(
    `<div class="title">NEON PINBALL</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best.toLocaleString('en-US')}</div>` : ''),
  );
}

function serveBall() {
  phase = 'lane';
  saveUsed = false;
  saveTime = 0;
  skillTime = 0;
  skillLane = Math.floor(Math.random() * 3);
  mult = 1;
  physics.setGravity(1);
  physics.serve();
  hud.mult(1);
  hud.balls(ball, BALLS);
}

function start() {
  state = 'play';
  score = 0;
  ball = 1;
  resetTable();
  serveBall();
  hud.showStats(true);
  hud.score(0);
  hud.best(best);
  hud.message('');
  hud.event('BALL 1', 'cyan');
}

function drained() {
  if (saveTime > 0) {
    // Ball save: the ball comes back to the plunger, once per ball.
    saveTime = 0;
    saveUsed = true;
    phase = 'lane';
    physics.serve();
    hud.event('BALL SAVED', 'yellow');
    view.flash(YELLOW, 0.4);
    return;
  }
  phase = 'drain';
  drainTimer = 1.6;
  physics.park();
  hud.event(ball < BALLS ? 'DRAIN' : 'LAST BALL', 'red');
  view.flash(RED, 0.7);
  view.shake(0.3);
}

function gameOver() {
  state = 'over';
  overTime = 0;
  physics.park();
  const record = score > best;
  if (record) {
    best = score;
    hh.save('neon-pinball', { best });
    hud.best(best);
  }
  hud.clearEvent();
  hud.hint('');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${score.toLocaleString('en-US')}</div>` +
      `<div class="small">Best ${best.toLocaleString('en-US')}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

function updatePlay(dt) {
  const left = input.down('L') || input.down('LEFT');
  const right = input.down('R') || input.down('A');
  if (lanesFlash <= 0 && phase !== 'drain') {
    if (input.pressed('L') || input.pressed('LEFT')) rotateLanes(-1);
    if (input.pressed('R') || input.pressed('A')) rotateLanes(1);
  }
  physics.update(dt, left, right, input.down('DOWN'));

  if (phase === 'lane' && !physics.inLane()) {
    // The ball left the plunger lane: it is in play, the ball save runs.
    phase = 'live';
    saveTime = saveUsed ? 0 : SAVE_TIME[ball - 1];
  }
  if (phase !== 'drain') {
    if (physics.ball.y < DRAIN_Y) drained();
    else if (physics.lost()) {
      // Safety net, never expected: give the ball back without a penalty.
      phase = 'lane';
      physics.serve();
    }
  } else {
    drainTimer -= dt;
    if (drainTimer <= 0) {
      if (ball >= BALLS) {
        gameOver();
        return;
      }
      ball++;
      serveBall();
      hud.event(`BALL ${ball}`, 'cyan');
    }
  }

  saveTime = Math.max(0, saveTime - dt);
  skillTime = Math.max(0, skillTime - dt);
  if (lanesFlash > 0) {
    lanesFlash -= dt;
    if (lanesFlash <= 0) lanesLit.fill(0);
  }
  hud.score(score);
  const waiting = phase === 'lane' && physics.inLane() && physics.ball.y < 3;
  hud.hint(waiting ? 'Hold ▼ to pull<br>Release to launch<br><span class="skill">Skill shot:<br>blinking lane</span>' : '');
}

// The demo ball in attract mode: flips when the ball drops near a flipper.
function updateDemo(dt) {
  const b = physics.ball;
  let pull = false;
  if (physics.inLane() && b.y < 2.5 && Math.abs(b.vy) < 0.1 && botPull < 0) botPull = 0.55 + Math.random() * 0.5;
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
  if (b.y < DRAIN_Y || physics.lost()) physics.serve();
}

function updateBanks(dt) {
  for (let k = 0; k < 2; k++) {
    if (bankTimer[k] <= 0) continue;
    bankTimer[k] -= dt;
    // Stand the targets back up, unless the ball is right in front of them.
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
  levels[LAMP_SAVE] =
    phase === 'lane' && !saveUsed ? 1 : saveTime > 2 ? slow : saveTime > 0 ? fast : 0;
  const pull = physics.plunger.pull;
  const waiting = phase === 'lane' && physics.inLane() && pull === 0;
  const wave = Math.floor(clock * 8) % 8;
  for (let i = 0; i < 6; i++) {
    levels[LAMP_POWER + i] = pull * 6 > i + 0.05 ? 1 : waiting && i === wave ? 0.6 : 0;
  }
}

toTitle();

hh.run((dt) => {
  if (state === 'title') {
    clock += dt;
    updateDemo(dt);
    updateBanks(dt);
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      state = 'paused';
      hud.message(
        `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`,
      );
    } else {
      clock += dt;
      updatePlay(dt);
      updateBanks(dt);
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    clock += dt;
    overTime += dt;
    physics.update(dt, false, false, false);
    // A short delay so a flipper mashed at the drain does not restart at once.
    if (overTime > 0.8 && input.pressed('A')) start();
    else if (overTime > 0.8 && input.pressed('B')) toTitle();
  }

  updateLamps();
  // While paused nothing moves: the view gets no time.
  view.update(state === 'paused' ? 0 : dt, physics, levels, state !== 'over' && !(state === 'play' && phase === 'drain'));
  renderer.render(scene, view.camera);
});
