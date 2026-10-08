// Road Hopper: an endless hopper across roads, rivers, railways and farm
// tracks. Each D-pad press hops one cell (UP is forward), START pauses.
// Dawdle and the camera leaves you behind, and the hawk takes you.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { HALF, RIVER, SKY, WATER_Y, clamp } from './shared.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const CAM_OFFSET = new THREE.Vector3(1.6, 12, 6.4);
const CAM_FOV = 40; // vertical, on the 3:2 screen the game is designed for
const LEAD = 2.2; // the camera looks this many rows ahead of the chicken
const CREEP = 0.3; // rows per second the camera moves forward on its own
const CREEP_MAX = 0.6;
const BEHIND_LIMIT = 2.2; // fall this far behind the camera (the 3:2 screen's bottom edge) and the hawk comes
const IDLE_LIMIT = 9; // so it does after this many seconds without a hop
const MILESTONE = 25; // a chime every this many rows
const SAVE_KEY = 'road-hopper';
const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

const SFX = [
  'hop', 'bump', 'log', 'lily', 'coin', 'car', 'truck', 'horn', 'tractor', 'river', 'bell', 'train',
  'squash', 'splash', 'hawk', 'snatch', 'cluck', 'start', 'best', 'milestone', 'record', 'over',
  'move', 'select', 'back', 'pause',
];

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;
const sound = createSound(hh, { sfx: SFX, music: 'theme' });
const tractorLoop = sound.loop('tractor');
const riverLoop = sound.loop('river');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 17, 25);

const camera = new THREE.PerspectiveCamera(CAM_FOV, hh.aspect, 0.5, 27);
fitView();
const lookAt = new THREE.Vector3();

// Wider screens show more at the sides. On taller ones the extra height all
// goes below the designed view, onto rows the chicken has already crossed,
// so the rows ahead that can be seen are the same on every screen shape.
function fitView() {
  hh.fitCamera(camera);
  const scale = hh.viewScale();
  if (scale <= 1) return;
  // A frustum tall enough to reach that far down, of which the screen shows
  // the bottom part: its top edge is the designed one.
  const t = Math.tan(THREE.MathUtils.degToRad(CAM_FOV / 2));
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t * (2 * scale - 1)));
  const k = (2 * scale - 1) / scale;
  const fullWidth = hh.width * k;
  const fullHeight = hh.height * k;
  camera.setViewOffset(fullWidth, fullHeight, (fullWidth - hh.width) / 2, fullHeight - hh.height, hh.width, hh.height);
}

scene.add(new THREE.HemisphereLight(0xffffff, 0x7d9a70, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-4, 10, 5);
scene.add(sun);

const shadowMaterial = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
});

// The world's sounds near the chicken. Passing cars and horns only while
// playing; crossing bells and trains whenever the world moves.
const worldSounds = {
  pass(name, near, dir) {
    if (state !== 'play') return;
    sound.play(name, { volume: near, rate: 0.94 + Math.random() * 0.12, pan: dir * 0.35 });
  },
  horn(pitch, dir) {
    if (state !== 'play') return;
    sound.play('horn', { volume: 0.75, rate: pitch * (0.97 + Math.random() * 0.06), pan: -dir * 0.3 });
  },
  train(near, pan) {
    sound.play('train', { volume: near * Math.sqrt(near), pan });
  },
  bell(near, pan) {
    sound.play('bell', { volume: 0.8 * near * near, pan });
  },
};

// Taller screens see more rows behind the camera (see fitView), so the world
// keeps more of them there.
const world = createWorld(scene, shadowMaterial, Math.ceil(6 * hh.viewScale()), worldSounds);
const player = createPlayer(scene, world, shadowMaterial);
const fx = createFx(scene, shadowMaterial);
const hud = createHud(hh.hud);

const DEATH_TITLES = {
  car: 'SQUASHED!',
  tractor: 'FLATTENED!',
  train: 'TRAIN WRECK!',
  water: 'SPLASH!',
  swept: 'SWEPT AWAY!',
  hawk: 'HAWK SNACK!',
};

// Menus: the pause menu during a run and the options from the title.
const PAUSE_MENU = { title: 'PAUSED', items: ['resume', 'sfx', 'music', 'quit'], hint: 'D-pad choose · A select · B resume' };
const OPTIONS_MENU = { title: 'OPTIONS', items: ['sfx', 'music', 'back'], hint: 'D-pad choose · A select · B back' };
const ITEM_LABELS = { resume: 'Resume', quit: 'Quit to title', back: 'Back' };

let state = 'title'; // title | options | play | paused | dying | over
let stateT = 0;
let score = 0;
let coins = 0;
let deathKind = '';
let camRow = 0;
let camX = 0;
let shake = 0;
let titleTurn = 0;
let cheered = false; // the new best was cheered this run
let warned = false; // the hawk warning is showing
let snatched = false; // the hawk has grabbed the chicken
let lastHop = -1; // stateT of the last hop, for the hop streak
let lastBump = -1; // stateT of the last bump sound
let streak = 0; // quick forward hops in a row: the hop sound rises
let menu = null;
let menuSel = 0;
const saved = hh.load(SAVE_KEY, { best: 0, coins: 0 });
let best = saved.best | 0;
let bank = saved.coins | 0; // coins collected over all runs

function newWorld() {
  world.reset(best);
  player.reset();
  fx.clear();
  camRow = 0;
  camX = 0;
}

function titleMessage() {
  hud.message(
    `<div class="title">ROAD HOPPER</div>` +
      (best > 0 || bank > 0
        ? `<div class="stats"><span>BEST ${best}</span><span class="coin">● ${bank}</span></div>`
        : '') +
      `<div class="blink">Press A to start</div>` +
      `<div class="small">D-pad hop · START pause · SELECT options</div>`,
    'high',
  );
}

function toTitle() {
  state = 'title';
  newWorld();
  hud.showStats(false);
  hud.warn(false);
  hud.flash('');
  titleMessage();
  sound.duck(false);
}

function start(fresh) {
  if (fresh) newWorld();
  state = 'play';
  stateT = 0;
  score = 0;
  coins = 0;
  cheered = false;
  warned = false;
  snatched = false;
  streak = 0;
  lastHop = -1;
  lastBump = -1;
  player.idle = 0;
  hud.showStats(true);
  hud.score(0);
  hud.best(best);
  hud.coins(0);
  hud.flash('');
  hud.message('');
  sound.duck(false);
  sound.play('cluck', { volume: 0.7 });
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
  state = 'paused';
  hud.warn(false);
  warned = false;
  openMenu(PAUSE_MENU);
  sound.play('pause');
  sound.duck(true);
}

function resume() {
  state = 'play';
  hud.message('');
  sound.play('back');
  sound.duck(false);
}

function die(kind) {
  state = 'dying';
  stateT = 0;
  deathKind = kind;
  hud.warn(false);
  const z = -player.rowPos;
  if (kind === 'car' || kind === 'tractor' || kind === 'train') {
    player.die('car');
    fx.feathers(player.x, player.y, -player.rowPos);
    shake = kind === 'train' ? 0.5 : 0.32;
    hud.flash('hit');
    sound.play('squash');
  } else if (kind === 'water' || kind === 'swept') {
    player.die('water');
    fx.splash(player.x, WATER_Y + 0.1, z, true);
    shake = 0.12;
    hud.flash('water');
    sound.play('splash');
  } else {
    player.die('hawk');
    fx.hawk(player.x, z);
    sound.play('hawk');
  }
}

// Banks the run's coins and best score. Returns true for a new best.
function endRun() {
  bank += coins;
  coins = 0;
  const record = score > best;
  if (record) best = score;
  hh.save(SAVE_KEY, { best, coins: bank });
  return record;
}

function gameOver() {
  state = 'over';
  stateT = 0;
  const runCoins = coins;
  const record = endRun();
  hud.best(best);
  hud.message(
    `<div class="title">${DEATH_TITLES[deathKind]}</div>` +
      `<div class="big">${score}</div>` +
      (record ? `<div class="record">NEW BEST!</div>` : `<div class="small">Best ${best}</div>`) +
      `<div class="small"><span class="coin">●</span> ${runCoins} this run · ${bank} total</div>` +
      `<div class="blink">Press A to play again</div>` +
      `<div class="small">B title</div>`,
    'high',
  );
  sound.play(record ? 'record' : 'over');
  sound.duck(true);
}

// The hops and bumps the player update just made, heard.
function playerSounds() {
  if (player.hopped) {
    // Quick forward hops one after another climb in pitch a little.
    streak = player.toRow > player.fromRow && stateT - lastHop < 0.42 ? Math.min(streak + 1, 8) : 0;
    lastHop = stateT;
    sound.play('hop', { volume: 0.8, rate: 1 + streak * 0.015 + (Math.random() - 0.5) * 0.08 });
  } else if (player.bumped && stateT - lastBump > 0.4) {
    // Holding the D-pad into a tree retries every hop; knock only now and then.
    lastBump = stateT;
    sound.play('bump', { rate: 0.95 + Math.random() * 0.1 });
  }
}

// One frame of play: hops, landings, hazards and the camera push.
function play(dt) {
  player.update(dt, input);
  playerSounds();
  const z = -player.rowPos;

  if (player.landed) {
    const r = player.row;
    if (world.rowType(r) === RIVER) {
      const x = world.support(r, player.x);
      if (x !== x) {
        die('water');
        return;
      }
      player.settle(x);
      world.dip(r);
      fx.splash(x, player.baseY, z, false);
      sound.play(world.lily(r) ? 'lily' : 'log', { rate: 0.95 + Math.random() * 0.1 });
    } else {
      fx.dust(player.x, player.baseY, z);
      if (world.takeCoin(r, player.x)) {
        coins++;
        hud.coins(coins);
        fx.sparkle(player.x, 0.5, z);
        sound.play('coin', { rate: 0.98 + Math.random() * 0.04 });
      }
    }
    if (player.maxRow > score) {
      score = player.maxRow;
      hud.score(score);
      hud.best(Math.max(best, score));
      if (!cheered && best > 0 && score > best) {
        cheered = true;
        hud.toast('NEW BEST!');
        sound.play('best');
      } else if (score % MILESTONE === 0) {
        sound.play('milestone');
      }
    }
  }

  // A little less than the chicken's half width, so a hit always looks like one.
  const hit = world.hit(player.cellRow, player.x, 0.25);
  if (hit) {
    die(hit === 2 ? 'train' : hit === 3 ? 'tractor' : 'car');
    return;
  }
  if (!player.hopping && world.rowType(player.row) === RIVER && Math.abs(player.x) > HALF + 1.2) {
    die('swept');
    return;
  }

  // The camera creeps forward once the run is under way and catches up with
  // the chicken when it gets ahead.
  if (player.maxRow > 0) camRow += Math.min(CREEP_MAX, CREEP + score * 0.002) * dt;
  if (player.rowPos > camRow) camRow += (player.rowPos - camRow) * Math.min(1, dt * 4);
  const behind = camRow - player.rowPos;
  if (behind > BEHIND_LIMIT || player.idle > IDLE_LIMIT) {
    die('hawk');
    return;
  }
  const warn = behind > BEHIND_LIMIT - 1.1 || player.idle > IDLE_LIMIT - 3;
  if (warn && !warned) sound.play('hawk', { volume: 0.25, rate: 1.2 });
  warned = warn;
  hud.warn(warn);
  if (world.trainNear(player.row, player.x)) shake = Math.max(shake, 0.07);
  world.advance(camRow);
}

function placeCamera(dt) {
  shake = Math.max(0, shake - dt);
  const jitter = shake * 0.5;
  camX += (clamp(player.x * 0.45, -1.4, 1.4) - camX) * Math.min(1, dt * 3);
  lookAt.set(camX, 0, -(camRow + LEAD));
  camera.position.copy(lookAt).add(CAM_OFFSET);
  camera.position.x += (Math.random() - 0.5) * jitter;
  camera.position.y += (Math.random() - 0.5) * jitter;
  camera.lookAt(lookAt);
}

toTitle();
sound.startMusic();

// Compile every material and upload every geometry now, while loading:
// trains, tractors, coins, lamps, the flag and the hawk are not on screen at
// the start, so without this they would do it in the middle of a run.
placeCamera(0);
world.warmUp(camera);
fx.warmUp(camX, -(camRow + LEAD));
renderer.compile(scene, camera);
renderer.render(scene, camera);
fx.clear();

hh.run((dt) => {
  stateT += dt;
  let live = true; // false while paused: nothing moves

  if (state === 'title') {
    player.update(dt, null);
    // The chicken looks around while it waits, and clucks now and then.
    titleTurn += dt;
    if (titleTurn > 1.8) {
      titleTurn = 0;
      player.turn(Math.floor(Math.random() * 4));
      if (Math.random() < 0.3) sound.play('cluck', { volume: 0.45, rate: 0.95 + Math.random() * 0.12 });
    }
    if (input.pressed('A') || input.pressed('START')) {
      start(false);
      player.turn(0);
      sound.play('start');
    } else if (input.pressed('SELECT')) {
      state = 'options';
      openMenu(OPTIONS_MENU);
      sound.play('select');
    } else {
      for (let d = 0; d < 4; d++) {
        if (input.pressed(DIRECTIONS[d])) {
          // A D-pad press starts the run with that hop.
          start(false);
          player.update(0, input);
          playerSounds();
          break;
        }
      }
    }
  } else if (state === 'options') {
    player.update(dt, null);
    const item = menuInput();
    if (item === 'back') {
      state = 'title';
      titleMessage();
      sound.play('back');
    } else if (item) toggle(item);
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else play(dt);
  } else if (state === 'paused') {
    live = false;
    const item = input.pressed('START') ? 'resume' : menuInput();
    if (item === 'resume' || item === 'back') resume();
    else if (item === 'quit') {
      endRun();
      toTitle();
      sound.play('back');
    } else if (item) toggle(item);
  } else if (state === 'dying') {
    player.update(dt, null);
    if (stateT > (deathKind === 'hawk' ? 1.5 : 0.9)) gameOver();
  } else if (state === 'over') {
    player.update(dt, null);
    // A short delay so a button mashed during the crash does not restart at once.
    if (stateT > 0.4 && input.pressed('A')) {
      start(true);
      sound.play('start');
    } else if (stateT > 0.4 && input.pressed('B')) {
      toTitle();
      sound.play('back');
    }
  }

  placeCamera(dt);
  if (live) {
    world.update(dt, camera, state === 'play' ? player.cellRow : player.row, player.x);
    fx.update(dt);
    if (player.dead && player.death === 'hawk' && fx.grabbed) {
      if (!snatched) {
        snatched = true;
        sound.play('snatch');
      }
      const p = fx.hawkPosition;
      player.carry(p.x, p.y - 0.95, p.z);
      player.draw();
    }
  }
  // The tractors' engines and the river murmur, louder the nearer they are.
  tractorLoop.set(live ? world.tractorNear * 0.8 : 0);
  riverLoop.set(live ? world.riverNear * 0.4 : 0);

  renderer.render(scene, camera);
});
