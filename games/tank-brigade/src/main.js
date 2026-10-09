// Tank Brigade: a top-down tank battle. Twenty enemy tanks come in from the
// top of each stage; keep them away from the core at the bottom of the field.
// D-pad drives, A fires, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, BRICK, DOWN, ENEMY_COLS, HALF, PLAYER_COL, STEEL, TILES, UP, tileCenter } from './shared.js';
import { createWorld } from './world.js';
import { HIT_BRICK, HIT_CLANK, HIT_CORE, HIT_STEEL, createField } from './field.js';
import { createBullets } from './bullets.js';
import { createFx } from './fx.js';
import { ARMOUR, ARMOUR_HEX, KINDS, PLAYER, POWER, createTanks } from './tanks.js';
import { BOMB, CLOCK, HELMET, POWERS, SHOVEL, STAR, TANK, createPowerups } from './powerups.js';
import { createHud } from './hud.js';
import { DEMO_STAGE, STAGES } from './stages.js';
import { createSound } from './sound.js';

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
const ALARM_GAP = 4; // s between two core alarms
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
const camera = new THREE.PerspectiveCamera(30, hh.aspect, 1, 56);
// The whole field and the side panels' room stay in view on every screen
// shape: wider screens show more of the camp at the sides, taller ones more
// above and below.
hh.fitCamera(camera);

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

// Sound: every effect is a WAV in public/sfx/ made by tools/sfx/games/tank-brigade.py.
const POWER_SOUNDS = ['star', 'helmet', 'clock', 'bomb', 'shovel', 'extra']; // by power-up kind
const sound = createSound(hh, {
  sfx: [
    'engine', 'shot', 'enemy_shot', 'brick', 'steel', 'smash', 'edge', 'clash', 'armor', 'explode',
    'player_boom', 'deflect', 'spawn', 'appear', ...POWER_SOUNDS, 'core', 'alarm', 'stage', 'clear',
    'tick', 'bonus', 'over', 'record', 'move', 'select', 'back', 'pause',
  ],
  music: 'theme',
});
const engine = sound.loop('engine');
let engineOn = false;

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
let wallSeen = 0; // core wall cells standing, to notice a breach
let alarmT = 0;
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
let menuSel = 0;
const kills = new Int32Array(KINDS.length);
const queue = new Int8Array(WAVE);
const queueKey = new Float32Array(WAVE);
const POINTS = KINDS.map((k) => k.points);
const DIR_BUTTONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
let wantDir = -1;

const saved = hh.load(SAVE_KEY, null);
let best = saved?.best || 0;
// The furthest stage reached (1-based); the title lets you start from any
// stage up to it. bestStage is the furthest any game got, loops included.
let reached = Math.max(1, Math.min(STAGES.length, Math.floor(saved?.stage) || 1));
let bestStage = Math.max(reached, Math.floor(saved?.bestStage) || 1);

// Enemy AI settings, refreshed every stage.
const ai = {
  frozen: false,
  demo: true,
  speedMul: 1,
  shellMul: 1,
  fireMin: 1,
  fireRange: 1.4,
  coreBias: 0.2,
  hunt: 0.22,
  aim: false,
  blast: 1,
};

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
  hh.save(SAVE_KEY, { best, stage: reached, bestStage });
}

// A new best score (or stage) is kept even when the game is left from the
// pause menu.
function keepBest() {
  if (demo) return false;
  const isRecord = score > best;
  if (isRecord) best = score;
  bestStage = Math.max(bestStage, stage + 1);
  persist();
  return isRecord;
}

// ---------------------------------------------------------------- sound

const wobble = () => 0.96 + Math.random() * 0.08;
const panOf = (x) => (x / HALF) * 0.6;

// A battle effect: silent behind the title, where only the music plays.
function sfx(name, x, volume = 1, rate = wobble()) {
  if (!demo) sound.play(name, { volume, rate, pan: panOf(x) });
}

// The player's engine idles while the tank stands and revs while it drives.
function updateEngine() {
  if (!demo && player.live && (state === 'play' || state === 'clear')) {
    engine.set(player.moving ? 0.6 : 0.3, player.moving ? 1.12 : 0.88);
    engineOn = true;
  } else if (engineOn) {
    engine.stop();
    engineOn = false;
  }
}

tanks.onFire = (t) => {
  if (t.enemy) sfx('enemy_shot', t.x, 0.5, wobble() * (t.kind === POWER ? 1.12 : 1));
};

// ---------------------------------------------------------------- menus

const ON_OFF = (on) => (on ? 'ON' : 'OFF');
const KEY = (button) => `<span class="key">${button}</span>`;
const PAUSE_ITEMS = ['resume', 'sound', 'music', 'quit'];
const TITLE_ITEMS = ['play', 'sound', 'music'];
const TITLE_STAGE_ITEMS = ['play', 'stage', 'sound', 'music'];
const LABELS = {
  play: () => 'PLAY',
  stage: () => `STAGE <b>◀ ${startStage + 1} ▶</b>`,
  resume: () => 'RESUME',
  quit: () => 'QUIT TO TITLE',
  sound: () => `SOUND <b>${ON_OFF(sound.sfxOn)}</b>`,
  music: () => `MUSIC <b>${ON_OFF(sound.musicOn)}</b>`,
};

// The stage row shows once a later stage has been reached.
function titleItems() {
  return reached > 1 ? TITLE_STAGE_ITEMS : TITLE_ITEMS;
}

function menuRows(items) {
  let html = '<div class="menu">';
  for (let i = 0; i < items.length; i++) {
    html += `<div class="item${i === menuSel ? ' sel' : ''}">${LABELS[items[i]]()}</div>`;
  }
  return html + '</div>';
}

function bestLine() {
  return best > 0 ? `<div class="small">Best ${best} · Stage ${bestStage}</div>` : '';
}

function showTitle() {
  hud.message(
    `<div class="title">TANK BRIGADE</div>` +
      menuRows(titleItems()) +
      bestLine() +
      `<div class="small keys">D-pad drive · ${KEY('A')} fire · ${KEY('START')} pause</div>`,
    'title-panel',
  );
}

function showPause() {
  hud.message(
    `<div class="title">PAUSED</div>` +
      menuRows(PAUSE_ITEMS) +
      `<div class="small keys">${KEY('A')} select · ${KEY('B')} or ${KEY('START')} resume</div>`,
  );
}

// Up / down moves through the items; returns the item A chose, 'left' or
// 'right' for the stage row, 'redraw' after a move, or null. Left / right
// also flip a toggle.
function menuInput(items) {
  const dy = input.pressed('DOWN') ? 1 : input.pressed('UP') ? -1 : 0;
  if (dy) {
    menuSel = (menuSel + dy + items.length) % items.length;
    sound.play('move');
    return 'redraw';
  }
  const item = items[menuSel];
  const left = input.pressed('LEFT');
  const right = input.pressed('RIGHT');
  if (item === 'stage' && (left || right)) return left ? 'left' : 'right';
  if (((left || right) && (item === 'sound' || item === 'music')) || input.pressed('A')) return item;
  return null;
}

function toggle(item) {
  if (item === 'sound') sound.setSfx(!sound.sfxOn);
  else sound.setMusic(!sound.musicOn);
  // Heard only when effects are (still) on.
  sound.play('select');
}

// ---------------------------------------------------------------- stages

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
  const def = stageDef();
  const n = demo ? 0 : stage % STAGES.length;
  // The first ten stages get harder a step at a time, the last five by half
  // steps, so the final stages stay fair.
  const s = n <= 9 ? n : 9 + (n - 9) * 0.5;
  const l = loopCount();
  ai.demo = demo;
  ai.frozen = false;
  ai.speedMul = 1 + l * 0.08;
  ai.shellMul = 1 + l * 0.06;
  ai.fireMin = Math.max(0.5, (1.7 - s * 0.1) * (1 - l * 0.12));
  ai.fireRange = Math.max(0.7, 2 - s * 0.12);
  ai.blast = Math.min(2.5, 0.8 + s * 0.15 + l * 0.4); // how keenly they shoot through bricks in their way
  ai.hunt = def.hunt ?? 0.22;
  ai.aim = Boolean(def.aim) || l > 0;
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
  wallSeen = field.wallLeft();
  alarmT = 0;
  stageTime = 0;
  tookHit = false;
  demoT = 0;
  hud.enemies(WAVE);
  hud.stage(n + 1);
  hud.callout('');
  if (!demo) {
    const def = stageDef();
    const note = def.note ? ` · ${def.note}` : '';
    hud.banner(`STAGE ${n + 1}`, loopCount() > 0 ? `${def.name} · tougher` : def.name + note);
    sound.duck(false);
    sound.play('stage', { delay: 0.15 });
    if (n + 1 > reached && n < STAGES.length) {
      reached = n + 1;
      persist();
    }
  }
}

// ---------------------------------------------------------------- states

function toTitle() {
  state = 'title';
  demo = true;
  titleTime = 0;
  shake = 0;
  menuSel = 0;
  hud.paused(false);
  hud.showStats(false);
  hud.banner('');
  startStage = Math.min(startStage, reached - 1);
  loadStage(0);
  sound.duck(false);
  sound.startMusic();
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
  sound.startMusic();
  loadStage(startStage);
}

function pause() {
  pausedFrom = state;
  state = 'paused';
  menuSel = 0;
  hud.paused(true);
  sound.play('pause');
  sound.duck(true);
  showPause();
}

function resume() {
  state = pausedFrom;
  hud.paused(false);
  hud.message('');
  // Under GAME OVER the music stays down.
  sound.duck(state === 'lost');
}

function spawnPlayer() {
  const x = tileCenter(PLAYER_COL);
  const z = tileCenter(TILES - 1);
  // Never on top of an enemy parked there: wait until it moves on.
  if (!tanks.spotFree(x, z)) return;
  const t = tanks.spawn(0, PLAYER, x, z, UP, false);
  t.shield = SPAWN_SHIELD;
  sfx('spawn', x, 0.7, 1.25);
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
    sfx('spawn', x, 0.45);
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
  sfx('appear', spot.x, 0.8, 1);
}

function applyPower(kind) {
  const x = items.x;
  const z = items.z;
  fx.ring(x, z, 0xffe9a0, 1.6);
  fx.sparks(x, 0.5, z, 10, 0xffe45a);
  sfx(POWER_SOUNDS[kind], x, 1, 1);
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
    wallSeen = field.wallLeft();
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
  if (scored) sfx('explode', t.x, 0.9, wobble() * (t.kind === ARMOUR ? 0.85 : 1));
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
    // The armour rings lower as it cracks.
    sfx('armor', t.x, 0.9, wobble() * (0.88 + t.hp * 0.06));
    return;
  }
  destroyEnemy(t, true);
}

function playerHit(t) {
  if (t.shield > 0) {
    fx.sparks(t.x, 0.45, t.z, 6, 0x9ff0ff);
    sfx('deflect', t.x, 0.8);
    return;
  }
  fx.explode(t.x, t.z, 1.4, KINDS[PLAYER].color);
  tanks.kill(t);
  respawnT = RESPAWN_DELAY;
  sfx('player_boom', t.x, 1, 1);
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
  sfx('core', field.coreX, 1, 1);
  if (demo) demoT = DEMO_RESET;
  else if (state === 'play' || state === 'clear') lose();
}

function lose() {
  state = 'lost';
  stateTime = 0;
  hud.callout('');
  hud.banner('GAME OVER', '', 'stay');
  sound.duck(true);
  sound.play('over', { delay: 0.9 });
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  record = keepBest();
  hud.banner('');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big-score">${score}</div>` +
      `<div class="small">Stage ${stage + 1} · Best ${best}</div>` +
      `<div class="small keys">${KEY('A')} play again · ${KEY('B')} title</div>`,
    record ? 'record' : '',
  );
  if (record) sound.play('record');
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
  sound.duck(true);
  hud.tally(stage + 1, POINTS);
}

function finishTally() {
  for (let k = 1; k < KINDS.length; k++) hud.tallyRow(k - 1, kills[k], kills[k] * POINTS[k]);
  const bonus = tookHit ? 0 : NO_HIT_BONUS;
  score += bonus;
  hud.tallyEnd(kills[1] + kills[2] + kills[3] + kills[4], bonus, `${KEY('A')} next stage`);
  sound.play(bonus > 0 ? 'bonus' : 'tick', { rate: bonus > 0 ? 1 : 0.8 });
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
    // Each row ticks a little higher than the one before.
    sound.play('tick', { volume: 0.7, rate: 0.9 + tallyKind * 0.08 });
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
      // A bigger gun barks a little higher.
      sfx('shot', player.x, 0.85, wobble() * (1 + gun * 0.05));
    }
  }
  const kind = items.pick(player.x, player.z);
  if (kind >= 0) applyPower(kind);
}

// A shell broke into the core's wall: an enemy one sounds the alarm.
function checkWall(b) {
  const left = field.wallLeft();
  if (left < wallSeen && b.enemy && alarmT <= 0 && state === 'play') {
    sfx('alarm', field.coreX, 0.8, 1);
    alarmT = ALARM_GAP;
  }
  wallSeen = left;
}

// Bullet results, reported by bullets.update. Enemy shells sound a little
// quieter than yours.
const events = {
  cell(b, result) {
    const loud = b.enemy ? 0.6 : 0.85;
    if (result === HIT_BRICK) {
      fx.debris(b.x, 0.38, b.z, 5, BRICK_HEX, 3.2, 0.12);
      fx.puff(b.x, 0.3, b.z, 0.32);
      fx.pop(b.x, 0.36, b.z);
      sfx('brick', b.x, loud);
      checkWall(b);
    } else if (result === HIT_STEEL) {
      fx.debris(b.x, 0.38, b.z, 5, STEEL_HEX, 3.6, 0.12);
      fx.sparks(b.x, 0.38, b.z, 6, 0xffffff);
      shake = Math.max(shake, 0.06);
      sfx('smash', b.x, 0.9);
      checkWall(b);
    } else if (result === HIT_CLANK) {
      fx.sparks(b.x, 0.38, b.z, 5, 0xfff0b0);
      fx.pop(b.x, 0.36, b.z);
      sfx('steel', b.x, loud * 0.85);
    } else if (result === HIT_CORE) {
      coreHit();
    }
  },
  edge(b) {
    fx.sparks(b.x, 0.38, b.z, 4, 0xe0e0e0);
    sfx('edge', b.x, b.enemy ? 0.35 : 0.55);
  },
  tank(b, t) {
    if (t.enemy) enemyHit(t);
    else playerHit(t);
  },
  clash(a, b) {
    fx.sparks((a.x + b.x) * 0.5, 0.38, (a.z + b.z) * 0.5, 7, 0xffffff);
    fx.pop((a.x + b.x) * 0.5, 0.38, (a.z + b.z) * 0.5);
    sfx('clash', a.x, 0.7);
  },
};

// Everything that moves on the field. spawning: enemies still come in.
function updateBattle(dt, spawning) {
  stageTime += dt;
  field.update(dt);
  ai.frozen = freezeT > 0;
  // Early on the enemies mostly wander; the longer a stage lasts, the more
  // of them head for the core. A siege stage starts keener.
  const def = stageDef();
  ai.coreBias = Math.min(
    0.55,
    0.05 + stageTime / 200 + (def.siege || 0) + (demo ? 0 : (stage % STAGES.length) * 0.02 + loopCount() * 0.08),
  );
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

  alarmT = Math.max(0, alarmT - dt);
  if (freezeT > 0) freezeT = Math.max(0, freezeT - dt);
  if (shovelT > 0) {
    shovelT = Math.max(0, shovelT - dt);
    const kind = shovelT === 0 || (shovelT < SHOVEL_BLINK && Math.floor(shovelT * 5) % 2 === 0) ? BRICK : STEEL;
    if (kind !== wallKind) {
      wallKind = kind;
      field.setCoreWall(kind);
      wallSeen = field.wallLeft();
    }
  }
}

function updateTitle(dt) {
  titleTime += dt;
  if (input.pressed('START')) {
    sound.play('select');
    start();
    return;
  }
  const item = menuInput(titleItems());
  if (item === 'play' || item === 'stage') {
    sound.play('select');
    start();
    return;
  }
  if (item === 'left' || item === 'right') {
    startStage = (startStage + (item === 'left' ? reached - 1 : 1)) % reached;
    sound.play('move', { rate: item === 'left' ? 0.94 : 1.06 });
    showTitle();
  } else if (item === 'sound' || item === 'music') {
    toggle(item);
    showTitle();
  } else if (item === 'redraw') {
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
  } else if (item === 'redraw') {
    showPause();
  }
}

// Loading: put one of every kind of object on screen (every tank kind with
// the shield, a spawn twinkle, shells, an explosion, a power-up and the
// wrecked core), compile every material and upload every geometry and the
// brick texture now, so nothing stalls the first time it appears in play.
// toTitle() clears them.
function warmUp() {
  camera.position.set(0, CAM_Y, CAM_Z);
  camera.lookAt(0, 0, LOOK_Z);
  loadStage(0);
  field.update(10); // the whole field risen, so its blocks are drawn too
  renderer.initTexture(field.brickMap);
  for (let k = 0; k < KINDS.length; k++) {
    const t = tanks.spawn(k, k, tileCenter(2 + k * 2), tileCenter(6), UP, false);
    t.spawnT = 0;
    t.live = true;
    t.pop = 1;
  }
  player.shield = 1;
  tanks.fire(player, GUN_SPEED[0], false, 1);
  tanks.fire(tanks.list[1], GUN_SPEED[0], false, 1);
  bullets.update(0, tanks.list, events);
  fx.explode(0, 0, 1, 0xffffff);
  fx.update(0.01);
  items.spawn(STAR, 0, tileCenter(4));
  field.destroyCore();
  tanks.draw(0, false);
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  // The spawn twinkle, drawn in place of the basic tank.
  tanks.list[1].spawnT = 0.5;
  tanks.draw(0, false);
  renderer.render(scene, camera);
  // The other power-up icons.
  for (let k = 0; k < POWERS.length; k++) {
    if (k === STAR) continue;
    items.spawn(k, 0, tileCenter(4));
    renderer.render(scene, camera);
  }
}

warmUp();
toTitle();

hh.run((dt) => {
  if (state !== 'paused') stateTime += dt;

  if (state === 'title') {
    updateTitle(dt);
  } else if (state === 'play' || state === 'clear') {
    if (input.pressed('START')) {
      pause();
    } else {
      updatePlayer(dt);
      updateBattle(dt, state === 'play');
      if (state === 'play' && destroyed >= WAVE) {
        state = 'clear';
        stateTime = 0;
        sound.play('clear', { delay: 0.5 });
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
    updatePaused();
  } else if (state === 'over') {
    updateBattle(dt, false);
    // A short delay so a button mashed while losing does not restart at once.
    if (stateTime > 0.6 && input.pressed('A')) {
      sound.play('select');
      start();
    } else if (stateTime > 0.6 && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }

  if (state !== 'paused') {
    tanks.draw(dt, freezeT > 0);
    fx.update(dt);
    shake = Math.max(0, shake - dt);
  }
  updateEngine();

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

if (import.meta.env.DEV) {
  // For headless checks: the scene, the game's parts and its state.
  window.__tb = {
    THREE, scene, camera, renderer, field, tanks, bullets, items, fx, sound, player, ai,
    get state() { return state; },
    get stage() { return stage; },
    get lives() { return lives; },
    get score() { return score; },
    get gun() { return gun; },
    get destroyed() { return destroyed; },
    get spawned() { return spawned; },
    get menuSel() { return menuSel; },
    get engineOn() { return engineOn; },
    set lives(n) { lives = n; },
    // Starts a game at stage n (0-based).
    go(n) { startStage = n; start(); },
    // Destroys every enemy on the field and all still to come but one.
    clearStage() {
      for (let i = 1; i < tanks.list.length; i++) if (tanks.list[i].live) destroyEnemy(tanks.list[i], true);
      spawned = Math.max(spawned, WAVE - 1);
      destroyed = Math.max(destroyed, WAVE - 1 - tanks.enemies());
    },
    // Drops a power-up just ahead of the player.
    drop(kind) { items.spawn(kind, player.x, player.z - 1.5); },
    hitCore() { coreHit(); },
    power(kind) { applyPower(kind); },
    reach(n) { reached = n; persist(); },
  };
}
