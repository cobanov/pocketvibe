// Road Hopper: an endless hopper across roads, rivers and railways.
// Each D-pad press hops one cell (UP is forward), START pauses. Dawdle and the
// camera leaves you behind, and the hawk takes you.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { HALF, RIVER, SKY, WATER_Y, clamp } from './shared.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';

const CAM_OFFSET = new THREE.Vector3(1.6, 12, 6.4);
const LEAD = 2.2; // the camera looks this many rows ahead of the chicken
const CREEP = 0.3; // rows per second the camera moves forward on its own
const CREEP_MAX = 0.6;
const BEHIND_LIMIT = 3.4; // fall this far behind the camera and the hawk comes
const IDLE_LIMIT = 9; // so it does after this many seconds without a hop
const SAVE_KEY = 'road-hopper';
const DIRECTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 17, 25);

const camera = new THREE.PerspectiveCamera(40, hh.width / hh.height, 0.5, 27);
const lookAt = new THREE.Vector3();

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
const world = createWorld(scene, shadowMaterial);
const player = createPlayer(scene, world, shadowMaterial);
const fx = createFx(scene, shadowMaterial);
const hud = createHud(hh.hud);

const DEATH_TITLES = {
  car: 'SQUASHED!',
  train: 'TRAIN WRECK!',
  water: 'SPLASH!',
  swept: 'SWEPT AWAY!',
  hawk: 'HAWK SNACK!',
};

let state = 'title'; // title | play | paused | dying | over
let stateT = 0;
let score = 0;
let coins = 0;
let deathKind = '';
let camRow = 0;
let camX = 0;
let shake = 0;
let titleTurn = 0;
const saved = hh.load(SAVE_KEY, { best: 0, coins: 0 });
let best = saved.best | 0;
let bank = saved.coins | 0; // coins collected over all runs

function newWorld() {
  world.reset();
  player.reset();
  fx.clear();
  camRow = 0;
  camX = 0;
}

function toTitle() {
  state = 'title';
  newWorld();
  hud.showStats(false);
  hud.warn(false);
  hud.flash('');
  hud.message(
    `<div class="title">ROAD HOPPER</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">D-pad hop · START pause</div>` +
      (best > 0 || bank > 0 ? `<div class="small">Best ${best} · <span class="coin">●</span> ${bank}</div>` : ''),
  );
}

function start(fresh) {
  if (fresh) newWorld();
  state = 'play';
  stateT = 0;
  score = 0;
  coins = 0;
  player.idle = 0;
  hud.showStats(true);
  hud.score(0);
  hud.best(best);
  hud.coins(0);
  hud.flash('');
  hud.message('');
}

function die(kind) {
  state = 'dying';
  stateT = 0;
  deathKind = kind;
  hud.warn(false);
  const z = -player.rowPos;
  if (kind === 'car' || kind === 'train') {
    player.die(kind);
    fx.feathers(player.x, player.y, -player.rowPos);
    shake = kind === 'train' ? 0.5 : 0.32;
    hud.flash('hit');
  } else if (kind === 'water' || kind === 'swept') {
    player.die('water');
    fx.splash(player.x, WATER_Y + 0.1, z, true);
    shake = 0.12;
    hud.flash('water');
  } else {
    player.die('hawk');
    fx.hawk(player.x, z);
  }
}

function gameOver() {
  state = 'over';
  stateT = 0;
  bank += coins;
  const record = score > best;
  if (record) best = score;
  hh.save(SAVE_KEY, { best, coins: bank });
  hud.best(best);
  hud.message(
    `<div class="title">${DEATH_TITLES[deathKind]}</div>` +
      `<div class="big">${score}</div>` +
      (record ? `<div class="record">NEW BEST!</div>` : `<div class="small">Best ${best}</div>`) +
      `<div class="small"><span class="coin">●</span> ${coins} this run · ${bank} total</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

// One frame of play: hops, landings, hazards and the camera push.
function play(dt) {
  player.update(dt, input);
  const z = -player.rowPos;

  if (player.landed) {
    const r = player.row;
    if (world.rowType(r) === RIVER) {
      const x = world.support(r, player.x);
      if (x !== x) {
        die('water');
        return;
      }
      player.x = x;
      world.dip(r);
      fx.splash(x, player.baseY, z, false);
    } else {
      fx.dust(player.x, player.baseY, z);
      if (world.takeCoin(r, player.x)) {
        coins++;
        hud.coins(coins);
        fx.sparkle(player.x, 0.5, z);
      }
    }
    if (player.maxRow > score) {
      score = player.maxRow;
      hud.score(score);
    }
  }

  const hit = world.hit(player.cellRow, player.x, 0.3);
  if (hit) {
    die(hit === 2 ? 'train' : 'car');
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
  hud.warn(behind > BEHIND_LIMIT - 1.3 || player.idle > IDLE_LIMIT - 3);
  if (world.trainNear(player.row, player.x)) shake = Math.max(shake, 0.07);
  world.advance(camRow);
}

toTitle();

hh.run((dt) => {
  stateT += dt;
  let live = true; // false while paused: nothing moves

  if (state === 'title') {
    player.update(dt, null);
    // The chicken looks around while it waits.
    titleTurn += dt;
    if (titleTurn > 1.8) {
      titleTurn = 0;
      player.turn(Math.floor(Math.random() * 4));
    }
    if (input.pressed('A') || input.pressed('START')) {
      start(false);
      player.turn(0);
    } else {
      for (let d = 0; d < 4; d++) {
        if (input.pressed(DIRECTIONS[d])) {
          // A D-pad press starts the run with that hop.
          start(false);
          player.update(0, input);
          break;
        }
      }
    }
  } else if (state === 'play') {
    if (input.pressed('START')) {
      state = 'paused';
      hud.message(
        `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`,
      );
    } else {
      play(dt);
    }
  } else if (state === 'paused') {
    live = false;
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'dying') {
    player.update(dt, null);
    if (stateT > (deathKind === 'hawk' ? 1.5 : 0.9)) gameOver();
  } else if (state === 'over') {
    player.update(dt, null);
    // A short delay so a button mashed during the crash does not restart at once.
    if (stateT > 0.4 && input.pressed('A')) start(true);
    else if (stateT > 0.4 && input.pressed('B')) toTitle();
  }

  if (live) {
    world.update(dt);
    fx.update(dt);
    if (player.dead && player.death === 'hawk' && fx.grabbed) {
      const p = fx.hawkPosition;
      player.carry(p.x, p.y - 0.95, p.z);
      player.draw();
    }
  }

  shake = Math.max(0, shake - dt);
  const jitter = shake * 0.5;
  camX += (clamp(player.x * 0.45, -1.4, 1.4) - camX) * Math.min(1, dt * 3);
  lookAt.set(camX, 0, -(camRow + LEAD));
  camera.position.copy(lookAt).add(CAM_OFFSET);
  camera.position.x += (Math.random() - 0.5) * jitter;
  camera.position.y += (Math.random() - 0.5) * jitter;
  camera.lookAt(lookAt);

  renderer.render(scene, camera);
});
