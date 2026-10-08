// Tank Brigade: a top-down tank battle. Twenty enemy tanks come in from the
// top of each stage; keep them away from the core at the bottom of the field.
// D-pad drives, A fires, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, BRICK, DOWN, ENEMY_COLS, LEFT, PLAYER_COL, RIGHT, STEEL, TILES, UP, tileCenter } from './shared.js';
import { createWorld } from './world.js';
import { HIT_BRICK, HIT_CLANK, HIT_CORE, HIT_STEEL, createField } from './field.js';
import { createBullets } from './bullets.js';
import { createFx } from './fx.js';
import { ARMOUR, ARMOUR_HEX, KINDS, PLAYER, createTanks } from './tanks.js';
import { BOMB, CLOCK, HELMET, POWERS, SHOVEL, STAR, TANK, createPowerups } from './powerups.js';
import { createHud } from './hud.js';
import { DEMO_STAGE, STAGES } from './stages.js';

const SAVE_KEY = 'tank-brigade';
const WAVE = 20; // enemies per stage
const MAX_ON_FIELD = 4;
const START_LIVES = 3;
const MAX_LIVES = 9;
const CARRIERS = [3, 10, 17]; // the 4th, 11th and 18th enemy flash and drop a power-up
const SPAWN_SHIELD = 3;
const HELMET_TIME = 10;
const FREEZE_TIME = 10;
const SHOVEL_TIME = 18;
const SHOVEL_BLINK = 3; // the steel flickers back to brick at the end
const POWER_POINTS = 500;
const NO_HIT_BONUS = 1000;
const RESPAWN_DELAY = 1.3;
const INTRO_TIME = 1.5; // the field builds itself before the first tanks come in
const CLEAR_DELAY = 2.2; // after the last enemy, before the tally
const LOST_DELAY = 2.8; // GAME OVER rises before the panel shows
const TALLY_STEP = 0.07;
const DEMO_RESET = 2.5;
// Gun levels (stars): shell speed, shells in flight, breaks steel at 3.
const GUN_SPEED = [8, 12.5, 12.5, 12.5];
const GUN_MAX = [1, 1, 2, 2];
const FIRE_GAP = 0.12;
const AUTO_FIRE = 0.3; // holding A fires again after this long
const BRICK_HEX = 0xc85a30;
const STEEL_HEX = 0xa8b8cc;

const CAM_Y = 24;
const CAM_Z = 11.5;
const LOOK_Z = 0.8;

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 34, 52);
const camera = new THREE.PerspectiveCamera(30, hh.width / hh.height, 1, 56);

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5a48, 1.25));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-5, 12, 6);
scene.add(sun);

createWorld(scene);
const field = createField(scene);
const fx = createFx(scene);
const bullets = createBullets(scene, field);
const tanks = createTanks(scene, field, bullets, fx);
const items = createPowerups(scene);
const hud = createHud(hh.hud);
const player = tanks.player;

let state = 'title'; // title | play | clear | tally | lost | over | paused
let pausedFrom = 'play';
let demo = true; // the title screen plays a battle by itself
let stage = 0; // keeps counting after the last map; the maps loop, tougher
let startStage = 0;
let score = 0;
let lives = 0;
let gun = 0;
let tookHit = false;
let stateTime = 0;
let stageTime = 0;
let spawned = 0;
let destroyed = 0;
let spawnT = 0;
let spawnEvery = 3;
let spawnPoint = 0;
let respawnT = 0;
let freezeT = 0;
let shovelT = 0;
let wallKind = BRICK;
let fireGap = 0;
let holdA = 0;
let demoT = 0;
let shake = 0;
let titleTime = 0;
let tallyKind = 0;
let tallyCount = 0;
let tallyT = 0;
let tallyDone = false;
let record = false;
const kills = new Int32Array(KINDS.length);
const queue = new Int8Array(WAVE);
const queueKey = new Float32Array(WAVE);
const POINTS = KINDS.map((k) => k.points);
const DIR_BUTTONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
let wantDir = -1;

const saved = hh.load(SAVE_KEY, null);
let best = saved?.best || 0;
// The furthest stage reached (1-based); the title lets you start from any
// stage up to it.
let reached = Math.max(1, Math.min(STAGES.length, Math.floor(saved?.stage) || 1));

const HINT = 'D-pad move · A fire · START pause';

// Enemy AI settings, refreshed every stage.
const ai = { frozen: false, demo: true, speedMul: 1, shellMul: 1, fireMin: 1, fireRange: 1.4, coreBias: 0.2, blast: 1 };

const screenPos = new THREE.Vector3();
const spot = { x: 0, z: 0 };

function stageDef() {
  return demo ? DEMO_STAGE : STAGES[stage % STAGES.length];
}

function loopCount() {
  return demo ? 0 : Math.floor(stage / STAGES.length);
}

function popAt(text, x, z, gold) {
  screenPos.set(x, 0.7, z).project(camera);
  hud.pop(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, gold);
}

function persist() {
  hh.save(SAVE_KEY, { best, stage: reached });
}

// Who comes in this stage, in order: mostly the easy ones first. Each loop
// through the maps turns some basic and fast tanks into power and armoured.
function buildQueue() {
  const mix = stageDef().mix;
  let basic = mix[0];
  let fast = mix[1];
  let power = mix[2];
  let armour = mix[3];
  const extra = Math.min(basic + fast, loopCount() * 4);
  for (let k = 0; k < extra; k++) {
    if (basic > 0) basic--;
    else fast--;
    if (k % 2) armour++;
    else power++;
  }
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const kind = k + 1;
    const count = k === 0 ? basic : k === 1 ? fast : k === 2 ? power : armour;
    const rank = k === 0 ? 0 : k === 1 ? 1 : k === 2 ? 1.4 : 2;
    for (let i = 0; i < count && n < WAVE; i++) {
      queue[n] = kind;
      queueKey[n] = rank + Math.random() * 2.6;
      n++;
    }
  }
  // Insertion sort by key.
  for (let i = 1; i < WAVE; i++) {
    const kind = queue[i];
    const key = queueKey[i];
    let j = i - 1;
    while (j >= 0 && queueKey[j] > key) {
      queue[j + 1] = queue[j];
      queueKey[j + 1] = queueKey[j];
      j--;
    }
    queue[j + 1] = kind;
    queueKey[j + 1] = key;
  }
}

function setupAi() {
  const s = demo ? 0 : stage % STAGES.length;
  const l = loopCount();
  ai.demo = demo;
  ai.frozen = false;
  ai.speedMul = 1 + l * 0.08;
  ai.shellMul = 1 + l * 0.06;
  ai.fireMin = Math.max(0.5, (1.7 - s * 0.1) * (1 - l * 0.12));
  ai.fireRange = Math.max(0.7, 2 - s * 0.12);
  ai.blast = Math.min(2.5, 0.8 + s * 0.15 + l * 0.4); // how keenly they shoot through bricks in their way
  spawnEvery = Math.max(1.1, 3.6 - s * 0.17 - l * 0.35);
}

function loadStage(n) {
  stage = n;
  field.load(stageDef(), demo);
  tanks.reset();
  bullets.clear();
  fx.clear();
  items.clear();
  buildQueue();
  setupAi();
  kills.fill(0);
  spawned = 0;
  destroyed = 0;
  spawnPoint = 0;
  spawnT = INTRO_TIME;
  respawnT = INTRO_TIME * 0.7;
  freezeT = 0;
  shovelT = 0;
  wallKind = demo ? STEEL : BRICK;
  stageTime = 0;
  tookHit = false;
  demoT = 0;
  hud.enemies(WAVE);
  hud.stage(n + 1);
  hud.callout('');
  if (!demo) {
    const def = stageDef();
    hud.banner(`STAGE ${n + 1}`, loopCount() > 0 ? `${def.name} · tougher` : def.name);
    if (n + 1 > reached && n < STAGES.length) {
      reached = n + 1;
      persist();
    }
  }
}

function showTitle() {
  hud.message(
    `<div class="title">TANK BRIGADE</div>` +
      `<div>Press A to start</div>` +
      (reached > 1 ? `<div class="choice">◀ STAGE ${startStage + 1} ▶</div>` : '') +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best}</div>` : ''),
  );
}

function toTitle() {
  state = 'title';
  demo = true;
  titleTime = 0;
  shake = 0;
  hud.paused(false);
  hud.showStats(false);
  hud.banner('');
  startStage = Math.min(startStage, reached - 1);
  loadStage(0);
  showTitle();
}

function start() {
  state = 'play';
  stateTime = 0;
  demo = false;
  score = 0;
  lives = START_LIVES;
  gun = 0;
  shake = 0;
  hud.message('');
  hud.showStats(true);
  loadStage(startStage);
}

function pause() {
  pausedFrom = state;
  state = 'paused';
  hud.paused(true);
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
}

function spawnPlayer() {
  const t = tanks.spawn(0, PLAYER, tileCenter(PLAYER_COL), tileCenter(TILES - 1), UP, false);
  t.shield = SPAWN_SHIELD;
}

// Enemies come in one by one at the three spawn points, up to four at once.
function updateWave(dt) {
  if (spawned >= WAVE || field.building()) return;
  spawnT -= dt;
  if (spawnT > 0 || tanks.enemies() >= MAX_ON_FIELD) return;
  for (let k = 0; k < ENEMY_COLS.length; k++) {
    const p = (spawnPoint + k) % ENEMY_COLS.length;
    const x = tileCenter(ENEMY_COLS[p]);
    const z = tileCenter(0);
    if (!tanks.spotFree(x, z)) continue;
    tanks.spawn(tanks.freeSlot(), queue[spawned], x, z, DOWN, CARRIERS.indexOf(spawned) >= 0);
    spawnPoint = (p + 1) % ENEMY_COLS.length;
    spawned++;
    // The first three come in quickly, the rest at the stage's pace.
    spawnT = spawned < 3 ? 0.9 : spawnEvery;
    hud.enemies(WAVE - spawned);
    return;
  }
}

function dropPower() {
  const r = Math.random();
  let kind = r < 0.24 ? STAR : r < 0.4 ? HELMET : r < 0.55 ? CLOCK : r < 0.7 ? BOMB : r < 0.86 ? SHOVEL : TANK;
  if (demo && kind === SHOVEL) kind = STAR;
  field.itemSpot(spot);
  items.spawn(kind, spot.x, spot.z);
  fx.ring(spot.x, spot.z, 0xffd25a, 1.4);
}

function applyPower(kind) {
  const x = items.x;
  const z = items.z;
  fx.ring(x, z, 0xffe9a0, 1.6);
  fx.sparks(x, 0.5, z, 10, 0xffe45a);
  if (!demo) {
    score += POWER_POINTS;
    popAt(`${POWER_POINTS}`, x, z, true);
    hud.callout(POWERS[kind].name, POWERS[kind].color);
  }
  if (kind === STAR) {
    gun = Math.min(3, gun + 1);
  } else if (kind === HELMET) {
    player.shield = HELMET_TIME;
  } else if (kind === CLOCK) {
    freezeT = FREEZE_TIME;
  } else if (kind === BOMB) {
    shake = Math.max(shake, 0.45);
    for (let i = 1; i < tanks.list.length; i++) {
      if (tanks.list[i].live) destroyEnemy(tanks.list[i], false);
    }
  } else if (kind === SHOVEL) {
    shovelT = SHOVEL_TIME;
    wallKind = STEEL;
    field.setCoreWall(STEEL);
  } else if (kind === TANK) {
    lives = Math.min(MAX_LIVES, lives + 1);
  }
}

function tankHex(t) {
  return t.kind === ARMOUR ? ARMOUR_HEX[Math.max(1, t.hp)] : KINDS[t.kind].color;
}

function destroyEnemy(t, scored) {
  fx.explode(t.x, t.z, 1, tankHex(t));
  tanks.kill(t);
  destroyed++;
  shake = Math.max(shake, 0.18);
  if (scored && !demo) {
    const points = KINDS[t.kind].points;
    score += points;
    kills[t.kind]++;
    popAt(`${points}`, t.x, t.z, false);
  }
}

function enemyHit(t) {
  if (t.carrier) {
    t.carrier = false;
    dropPower();
  }
  t.hp--;
  if (t.hp > 0) {
    t.flash = 0.16;
    fx.sparks(t.x, 0.45, t.z, 7, 0xffffff);
    fx.debris(t.x, 0.4, t.z, 3, tankHex(t), 3, 0.1);
    shake = Math.max(shake, 0.07);
    return;
  }
  destroyEnemy(t, true);
}

function playerHit(t) {
  if (t.shield > 0) {
    fx.sparks(t.x, 0.45, t.z, 6, 0x9ff0ff);
    return;
  }
  fx.explode(t.x, t.z, 1.4, KINDS[PLAYER].color);
  tanks.kill(t);
  respawnT = RESPAWN_DELAY;
  if (demo || (state !== 'play' && state !== 'clear')) return;
  shake = 0.45;
  hud.hurt();
  lives--;
  gun = 0;
  tookHit = true;
  if (lives <= 0) lose();
}

function coreHit() {
  field.destroyCore();
  fx.explode(field.coreX, field.coreZ, 2.2, 0x7ff0ff);
  fx.debris(field.coreX, 0.4, field.coreZ, 10, 0x9aa3ae, 5, 0.16);
  shake = 0.65;
  if (demo) demoT = DEMO_RESET;
  else if (state === 'play' || state === 'clear') lose();
}

function lose() {
  state = 'lost';
  stateTime = 0;
  hud.callout('');
  hud.banner('GAME OVER', '', 'stay');
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  record = score > best;
  if (record) best = score;
  persist();
  hud.banner('');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${score}</div>` +
      `<div class="small">Stage ${stage + 1} · Best ${best}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

function startTally() {
  state = 'tally';
  stateTime = 0;
  tallyKind = 1;
  tallyCount = 0;
  tallyT = 0.5;
  tallyDone = false;
  bullets.clear();
  items.clear();
  hud.tally(stage + 1, POINTS);
}

function finishTally() {
  for (let k = 1; k < KINDS.length; k++) hud.tallyRow(k - 1, kills[k], kills[k] * POINTS[k]);
  const bonus = tookHit ? 0 : NO_HIT_BONUS;
  score += bonus;
  hud.tallyEnd(kills[1] + kills[2] + kills[3] + kills[4], bonus);
  tallyDone = true;
  stateTime = 0;
}

// Counts the kills up row by row; A skips to the end, then moves on.
function updateTally(dt) {
  if (tallyDone) {
    if (stateTime > 0.4 && (input.pressed('A') || stateTime > 4)) {
      state = 'play';
      stateTime = 0;
      hud.message('');
      loadStage(stage + 1);
    }
    return;
  }
  if (stateTime > 0.6 && input.pressed('A')) {
    finishTally();
    return;
  }
  tallyT -= dt;
  if (tallyT > 0) return;
  tallyT = TALLY_STEP;
  if (tallyCount < kills[tallyKind]) {
    tallyCount++;
    hud.tallyRow(tallyKind - 1, tallyCount, tallyCount * POINTS[tallyKind]);
    return;
  }
  hud.tallyRow(tallyKind - 1, tallyCount, tallyCount * POINTS[tallyKind]);
  tallyKind++;
  tallyCount = 0;
  tallyT = 0.3;
  if (tallyKind >= KINDS.length) finishTally();
}

// D-pad: the direction pressed last wins, so a quick turn while holding
// another direction is not lost.
function readDir() {
  for (let d = 0; d < 4; d++) if (input.pressed(DIR_BUTTONS[d])) wantDir = d;
  if (wantDir >= 0 && !input.down(DIR_BUTTONS[wantDir])) wantDir = -1;
  if (wantDir < 0) {
    for (let d = 0; d < 4; d++) {
      if (input.down(DIR_BUTTONS[d])) {
        wantDir = d;
        break;
      }
    }
  }
  return wantDir;
}

function updatePlayer(dt) {
  if (!player.live) return;
  tanks.drive(player, readDir(), dt);
  fireGap -= dt;
  holdA = input.down('A') ? holdA + dt : 0;
  if ((input.pressed('A') || holdA > AUTO_FIRE) && fireGap <= 0) {
    if (tanks.fire(player, GUN_SPEED[gun], gun === 3, GUN_MAX[gun])) {
      fireGap = FIRE_GAP;
      holdA = 0;
    }
  }
  const kind = items.pick(player.x, player.z);
  if (kind >= 0) applyPower(kind);
}

// Bullet results, reported by bullets.update.
const events = {
  cell(b, result) {
    if (result === HIT_BRICK) {
      fx.debris(b.x, 0.38, b.z, 5, BRICK_HEX, 3.2, 0.12);
      fx.puff(b.x, 0.3, b.z, 0.32);
      fx.pop(b.x, 0.36, b.z);
    } else if (result === HIT_STEEL) {
      fx.debris(b.x, 0.38, b.z, 5, STEEL_HEX, 3.6, 0.12);
      fx.sparks(b.x, 0.38, b.z, 6, 0xffffff);
      shake = Math.max(shake, 0.06);
    } else if (result === HIT_CLANK) {
      fx.sparks(b.x, 0.38, b.z, 5, 0xfff0b0);
      fx.pop(b.x, 0.36, b.z);
    } else if (result === HIT_CORE) {
      coreHit();
    }
  },
  edge(b) {
    fx.sparks(b.x, 0.38, b.z, 4, 0xe0e0e0);
  },
  tank(b, t) {
    if (t.enemy) enemyHit(t);
    else playerHit(t);
  },
  clash(a, b) {
    fx.sparks((a.x + b.x) * 0.5, 0.38, (a.z + b.z) * 0.5, 7, 0xffffff);
    fx.pop((a.x + b.x) * 0.5, 0.38, (a.z + b.z) * 0.5);
  },
};

// Everything that moves on the field. spawning: enemies still come in.
function updateBattle(dt, spawning) {
  stageTime += dt;
  field.update(dt);
  ai.frozen = freezeT > 0;
  // Early on the enemies mostly wander; the longer a stage lasts, the more
  // of them head for the core.
  ai.coreBias = Math.min(0.5, 0.05 + stageTime / 200 + (demo ? 0 : (stage % STAGES.length) * 0.02 + loopCount() * 0.08));
  if (spawning) updateWave(dt);

  // Out of play the player's tank stands still (its tracks stop, no dust).
  if (!demo && state !== 'play' && state !== 'clear') player.moving = false;
  if (spawning && !player.active && !field.building()) {
    respawnT -= dt;
    if (respawnT <= 0) spawnPlayer();
  }

  tanks.update(dt, ai);
  bullets.update(dt, tanks.list, events);
  items.update(dt);

  if (freezeT > 0) freezeT = Math.max(0, freezeT - dt);
  if (shovelT > 0) {
    shovelT = Math.max(0, shovelT - dt);
    const kind = shovelT === 0 || (shovelT < SHOVEL_BLINK && Math.floor(shovelT * 5) % 2 === 0) ? BRICK : STEEL;
    if (kind !== wallKind) {
      wallKind = kind;
      field.setCoreWall(kind);
    }
  }
}

toTitle();

hh.run((dt) => {
  if (state !== 'paused') stateTime += dt;

  if (state === 'title') {
    titleTime += dt;
    if (input.pressed('A') || input.pressed('START')) {
      start();
    } else {
      if (reached > 1 && (input.pressed('LEFT') || input.pressed('RIGHT'))) {
        startStage = (startStage + (input.pressed('LEFT') ? reached - 1 : 1)) % reached;
        showTitle();
      }
      updateBattle(dt, true);
      // The demo starts over once its wave is beaten or its core falls.
      if (demoT === 0 && (destroyed >= WAVE || !field.coreAlive)) demoT = DEMO_RESET;
      if (demoT > 0) {
        demoT -= dt;
        if (demoT <= 0) loadStage(0);
      }
    }
  } else if (state === 'play' || state === 'clear') {
    if (input.pressed('START')) {
      pause();
    } else {
      updatePlayer(dt);
      updateBattle(dt, state === 'play');
      if (state === 'play' && destroyed >= WAVE) {
        state = 'clear';
        stateTime = 0;
      } else if (state === 'clear' && stateTime > CLEAR_DELAY) {
        startTally();
      }
    }
  } else if (state === 'lost') {
    if (input.pressed('START')) pause();
    else updateBattle(dt, false);
    if (state === 'lost' && stateTime > LOST_DELAY) gameOver();
  } else if (state === 'tally') {
    field.update(dt);
    updateTally(dt);
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = pausedFrom;
      hud.paused(false);
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    updateBattle(dt, false);
    // A short delay so a button mashed while losing does not restart at once.
    if (stateTime > 0.6 && input.pressed('A')) start();
    else if (stateTime > 0.6 && input.pressed('B')) toTitle();
  }

  if (state !== 'paused') {
    tanks.draw(dt, freezeT > 0);
    fx.update(dt);
    shake = Math.max(0, shake - dt);
  }

  if (!demo) {
    hud.score(score);
    hud.hi(Math.max(best, score));
    hud.lives(lives);
    hud.gun(gun);
    hud.timers(Math.ceil(player.live ? player.shield : 0), Math.ceil(freezeT), Math.ceil(shovelT));
  }

  // Fixed tilted camera; a slow sway behind the title and a shake on hits.
  const jitter = state === 'paused' ? 0 : shake * 0.8;
  const sway = state === 'title' ? Math.sin(titleTime * 0.35) * 1.4 : 0;
  camera.position.set(
    sway + (Math.random() - 0.5) * jitter,
    CAM_Y + (Math.random() - 0.5) * jitter,
    CAM_Z + (Math.random() - 0.5) * jitter,
  );
  camera.lookAt(sway * 0.3, 0, LOOK_Z);

  renderer.render(scene, camera);
});
