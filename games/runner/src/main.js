// Lane Runner: an endless runner on a three-lane road.
// D-pad left/right changes lanes, A jumps, DOWN slides, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { createSound } from './sound.js';
import { SKY } from './shared.js';
import { createWorld } from './world.js';
import { createFx } from './fx.js';
import { MAGNET, SHIELD, createTrack } from './track.js';
import { EV_DIVE, EV_JUMP, EV_LAND, EV_LANE, EV_SLIDE, createPlayer } from './player.js';
import { LOW, STAGE_LEN, TOP_STAGE, VAN, stageSpeed } from './patterns.js';
import { createHud } from './hud.js';

const START_SPEED = stageSpeed(0);
const TOP_SPEED = stageSpeed(TOP_STAGE);
const SPEED_UP = 3; // units per second gained per second when a stage starts
const TITLE_SPEED = 8;
const COIN_POINTS = 25;
const NEAR_POINTS = 10;
const MAGNET_TIME = 8;
const SHIELD_TIME = 10;
const SAVE_KEY = 'lane-runner';
const FOV = 62;

// Coins picked up in quick succession climb the F-sharp minor scale
// (semitones), then rock between the top two notes.
const COIN_STEPS = [0, 2, 3, 5, 7, 8, 10, 12];
const CHAIN_GAP = 0.5; // s

// Loaded one at a time in this order: the title menu's sounds first.
const SFX = [
  'menu_move', 'menu_select', 'menu_back', 'start', 'run', 'lane', 'jump', 'land', 'slide', 'dive', 'coin',
  'wind', 'bump', 'crash', 'near', 'horn', 'vanby', 'speedup', 'pickup', 'shield_break', 'power_end',
  'best', 'gameover', 'record', 'pause',
];

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;
const sound = createSound(hh, { sfx: SFX, music: 'theme' });

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 28, 62);

const camera = new THREE.PerspectiveCamera(FOV, hh.aspect, 0.1, 72);
hh.fitCamera(camera);
const lookAt = new THREE.Vector3();

scene.add(new THREE.HemisphereLight(0xffffff, 0x4a6b3a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(4, 10, 6);
scene.add(sun);

// One material for everything colored by its vertices.
const painted = new THREE.MeshLambertMaterial({ vertexColors: true });
const world = createWorld(scene, painted);
const fx = createFx(scene);
const track = createTrack(scene, painted, fx);
const player = createPlayer(scene, painted);
const hud = createHud(hh.hud);

// Continuous sounds, shaped every frame by what is going on.
const loops = { run: sound.loop('run'), wind: sound.loop('wind') };
const loopOn = { run: false, wind: false };

let state = 'title'; // title | play | paused | dying | over
let menu = 'title'; // the menu shown: title | options (on the title), pause
let cursor = 0;
let speed = 0;
let stage = 0;
let distance = 0;
let coins = 0;
let bonus = 0;
let nears = 0; // near misses this run
let stateTime = 0;
let time = 0;
let shake = 0;
let kick = 0; // the camera's widening on a speed-up, 1 .. 0
let lift = 1; // the title's higher view, 1 .. 0 in a run
let chain = 0;
let lastCoin = -9;
let magnetTime = 0;
let shieldTime = 0;
let dustTime = 0;
let passedBest = false;
let bannerAt = 0; // the best distance when the run started, where the banner stands
let crashKind = 2;
let autopilot = null; // testing only
const saved = hh.load(SAVE_KEY, {});
let best = saved.best ?? 0; // best score
let bestDist = saved.bestDist ?? 0;
let bestCoins = saved.bestCoins ?? 0;

const MENUS = {
  title: ['play', 'options'],
  options: ['sound', 'music', 'back'],
  pause: ['resume', 'sound', 'music', 'quit'],
};
const CRASH = ['TRIPPED!', 'BONK!', 'CRASH!', 'WHAM!']; // by obstacle kind

function label(id) {
  if (id === 'sound') return `Sound: ${sound.sfxOn ? 'On' : 'Off'}`;
  if (id === 'music') return `Music: ${sound.musicOn ? 'On' : 'Off'}`;
  if (id === 'quit') return 'Quit to title';
  return id[0].toUpperCase() + id.slice(1);
}

function menuHtml() {
  return (
    `<div class="menu">` +
    MENUS[menu].map((id, i) => `<div class="item${i === cursor ? ' on' : ''}">${label(id)}</div>`).join('') +
    `</div>`
  );
}

function recordsHtml() {
  if (bestDist <= 0) return '';
  return (
    `<div class="records">` +
    `<div><b>${bestDist} m</b><span>Best distance</span></div>` +
    `<div><b>${best}</b><span>Best score</span></div>` +
    `<div><b>${bestCoins}</b><span>Most coins</span></div>` +
    `</div>`
  );
}

// Draws the panel of the current state's menu.
function showMenu() {
  if (menu === 'title') {
    hud.message(
      `<div class="logo">LANE<span>RUNNER</span></div>` +
        menuHtml() +
        recordsHtml() +
        `<div class="small">D-pad ◀ ▶ change lane · A jump · ▼ slide</div>` +
        `<div class="small dim">D-pad choose · A select</div>`,
      'top',
    );
  } else if (menu === 'options') {
    hud.message(
      `<div class="title">OPTIONS</div>` + menuHtml() + `<div class="small dim">D-pad choose · A switch · B back</div>`,
      'top',
    );
  } else {
    hud.message(
      `<div class="title">PAUSED</div>` + menuHtml() + `<div class="small dim">D-pad choose · A select · B resume</div>`,
    );
  }
}

function openMenu(name, at = 0) {
  menu = name;
  cursor = at;
  showMenu();
}

// D-pad up and down move the cursor. Returns the item chosen with A, 'back'
// for B, or null.
function menuInput() {
  const items = MENUS[menu];
  const dir = (input.pressed('DOWN') ? 1 : 0) - (input.pressed('UP') ? 1 : 0);
  if (dir !== 0) {
    cursor = (cursor + dir + items.length) % items.length;
    sound.play('menu_move');
    showMenu();
  }
  if (input.pressed('A')) return items[cursor];
  if (input.pressed('B')) return 'back';
  return null;
}

// Sound and music switches, shared by the options and pause menus.
function toggle(id) {
  if (id === 'sound') sound.setSfx(!sound.sfxOn);
  else sound.setMusic(!sound.musicOn);
  sound.play('menu_select');
  showMenu();
}

function drive(name, volume, rate) {
  if (volume > 0.001) {
    loops[name].set(volume, rate);
    loopOn[name] = true;
  } else if (loopOn[name]) {
    loops[name].stop(0.12);
    loopOn[name] = false;
  }
}

function updateLoops() {
  const live = state === 'play';
  const pace = (speed - START_SPEED) / (TOP_SPEED - START_SPEED); // 0 .. 1
  const running = live && player.y <= 0 && player.slide <= 0;
  drive('run', running ? 0.55 : 0, 0.92 + pace * 0.36);
  drive('wind', live ? 0.12 + pace * 0.33 : 0, 0.9 + pace * 0.3);
}

function score() {
  return Math.floor(distance) + coins * COIN_POINTS + bonus;
}

function endPowers() {
  magnetTime = 0;
  shieldTime = 0;
  player.shield = false;
  hud.power(0, 0);
  hud.power(1, 0);
}

function toTitle() {
  state = 'title';
  track.clear();
  fx.clear();
  player.reset();
  endPowers();
  world.setBest(null);
  hud.showStats(false);
  sound.duck(false);
  openMenu('title');
}

function start() {
  state = 'play';
  speed = START_SPEED;
  stage = 0;
  distance = 0;
  coins = 0;
  bonus = 0;
  nears = 0;
  chain = 0;
  passedBest = false;
  bannerAt = bestDist;
  track.reset();
  fx.clear();
  player.reset();
  endPowers();
  hud.showStats(true);
  hud.freeze(false);
  hud.score(0);
  hud.distance(0);
  hud.coins(0);
  hud.message('');
  sound.play('start');
  sound.startMusic();
  sound.duck(false);
}

function pause() {
  state = 'paused';
  hud.freeze(true);
  sound.play('pause');
  sound.duck(true);
  openMenu('pause');
}

function resume() {
  state = 'play';
  hud.freeze(false);
  sound.play('menu_select');
  sound.duck(false);
  hud.message('');
}

function crash(kind) {
  state = 'dying';
  stateTime = 0;
  crashKind = kind;
  player.crash(kind === LOW ? 'trip' : 'slam');
  hud.freeze(true);
  shake = kind === VAN ? 0.55 : 0.4;
  hud.flash('rgba(255, 240, 220, 0.6)');
  fx.burst(player.x, 1, 0, 10, 0xffffff, 5, 4, 0.18, 0.5, 14);
  fx.dust(player.x, 8, 1);
  sound.play('crash', { rate: kind === VAN ? 0.9 : kind === LOW ? 1.08 : 1 });
  sound.duck(true);
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  const meters = Math.floor(distance);
  const final = score();
  // The first run sets the records quietly; later ones are celebrated.
  const firstRun = bestDist <= 0;
  const newDist = meters > bestDist;
  const newScore = final > best;
  const newCoins = coins > bestCoins;
  if (newDist) bestDist = meters;
  if (newScore) best = final;
  if (newCoins) bestCoins = coins;
  hh.save(SAVE_KEY, { best, bestDist, bestCoins });
  const record = !firstRun && (newDist || newScore);
  const tag = (on) => (on && !firstRun ? `<i class="new">NEW</i>` : '');
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : CRASH[crashKind]}</div>` +
      `<div class="stats">` +
      `<span>Distance</span><b>${meters} m${tag(newDist)}</b>` +
      `<span>Coins</span><b>${coins}${tag(newCoins)}</b>` +
      (nears > 0 ? `<span>Close calls</span><b>${nears}</b>` : '') +
      `<span>Score</span><b class="score">${final}${tag(newScore)}</b>` +
      `</div>` +
      `<div class="small">Best ${bestDist} m · ${best} points</div>` +
      `<div class="blink">Press A to run again</div>` +
      `<div class="small dim">B title</div>`,
    'top',
  );
  sound.play(record ? 'record' : 'gameover');
}

// Sounds and dust for what the runner did this frame.
function runnerEvents() {
  const ev = player.ev;
  if (!ev) return;
  const vary = 0.96 + Math.random() * 0.08;
  if (ev & EV_LANE) sound.play('lane', { volume: 0.8, rate: vary, pan: (player.lane - 1) * 0.4 });
  if (ev & EV_JUMP) {
    sound.play('jump', { rate: vary });
    fx.dust(player.x, 3, 0.6);
  }
  if (ev & EV_DIVE) sound.play('dive', { rate: vary });
  if (ev & EV_LAND) {
    sound.play('land', { volume: Math.min(1, 0.45 + player.landSpeed * 0.03), rate: vary });
    fx.dust(player.x, player.landSpeed > 14 ? 7 : 4, 0.8);
  }
  if (ev & EV_SLIDE) sound.play('slide', { rate: vary });
}

function onCoins(got) {
  coins += got;
  hud.coins(coins);
  chain = time - lastCoin < CHAIN_GAP ? Math.min(chain + got, 99) : 0;
  lastCoin = time;
  const top = COIN_STEPS.length - 1;
  const step = chain <= top ? COIN_STEPS[chain] : COIN_STEPS[top - ((chain - top) % 2)];
  sound.play('coin', { volume: 0.7, rate: 2 ** (step / 12) });
}

function onPickup(kind) {
  if (kind === MAGNET) {
    magnetTime = MAGNET_TIME;
    hud.power(0, MAGNET_TIME);
    hud.toast('MAGNET!');
    sound.play('pickup');
  } else {
    shieldTime = SHIELD_TIME;
    player.shield = true;
    hud.power(1, SHIELD_TIME);
    hud.toast('SHIELD!');
    sound.play('pickup', { rate: 1.12 });
  }
}

function onHit(hit) {
  const o = hit.obstacle;
  if (hit.side) {
    // Ran into its side while changing lanes: back to the old lane.
    o.ignore = true;
    player.bump();
    shake = Math.max(shake, 0.15);
    chain = 0;
    fx.burst(player.x, 1, 0, 6, 0xffffff, 3, 2, 0.12, 0.3, 6);
    sound.play('bump', { rate: 0.96 + Math.random() * 0.08, pan: (o.x - player.x) * 0.3 });
  } else if (player.blink > 0) {
    o.ignore = true; // just after the shield broke
  } else if (player.shield) {
    track.smash(o);
    player.shield = false;
    player.blink = 0.9;
    shieldTime = 0;
    hud.power(1, 0);
    shake = 0.3;
    hud.flash('rgba(127, 230, 255, 0.5)');
    fx.burst(player.x, 1, 0, 16, 0x7fe6ff, 6, 4, 0.18, 0.6, 12);
    sound.play('shield_break');
  } else {
    crash(o.kind);
  }
}

// What the track tells about: vans and near misses.
track.events.van = (x) => {
  if (state === 'play') sound.play('horn', { volume: 0.55, rate: 0.98 + Math.random() * 0.04, pan: (x - player.x) * 0.15 });
};
track.events.vanBy = (x) => {
  if (state !== 'play') return;
  const side = x - player.x;
  sound.play('vanby', { volume: Math.abs(side) < 3 ? 0.9 : 0.5, pan: Math.max(-0.8, Math.min(0.8, side * 0.3)) });
};
track.events.near = (x) => {
  nears++;
  bonus += NEAR_POINTS;
  hud.pop(`CLOSE! +${NEAR_POINTS}`);
  sound.play('near', { pan: Math.max(-0.7, Math.min(0.7, (x - player.x) * 0.3)) });
};

function play(dt) {
  // A new stage every STAGE_LEN metres: faster, with harder patterns.
  const nextStage = Math.floor(distance / STAGE_LEN);
  if (nextStage > stage) {
    stage = nextStage;
    if (stage <= TOP_STAGE) {
      hud.toast('SPEED UP!');
      kick = 1;
    } else {
      hud.toast(`${stage * STAGE_LEN} m`);
    }
    sound.play('speedup', { volume: stage <= TOP_STAGE ? 1 : 0.7 });
  }
  speed = Math.min(stageSpeed(stage), speed + SPEED_UP * dt);
  const move = speed * dt;
  distance += move;

  const pilot = import.meta.env.DEV && window.__lr?.autopilot && autopilot ? autopilot.think(player, speed, dt) : input;
  player.update(dt, pilot, speed);
  runnerEvents();
  track.update(move, stage, speed, dt, player);

  if (player.slide > 0 && player.y <= 0) {
    dustTime -= dt;
    if (dustTime <= 0) {
      dustTime = 0.05;
      fx.dust(player.x, 1, 0.5);
    }
  }

  const got = track.collect(player, dt, magnetTime > 0);
  if (got > 0) onCoins(got);
  const picked = track.pickup(player);
  if (picked >= 0) onPickup(picked);

  if (magnetTime > 0) {
    magnetTime -= dt;
    if (magnetTime <= 0) {
      hud.power(0, 0);
      sound.play('power_end');
    }
  }
  if (shieldTime > 0) {
    shieldTime -= dt;
    if (shieldTime <= 0) {
      player.shield = false;
      hud.power(1, 0);
      sound.play('power_end', { rate: 1.12 });
    }
  }

  const hit = track.hit(player, move);
  if (hit) onHit(hit);

  const meters = Math.floor(distance);
  hud.score(score());
  hud.distance(meters);
  if (bannerAt > 30 && !passedBest && meters > bannerAt) {
    passedBest = true;
    hud.toast('NEW BEST!');
    sound.play('best');
  }
  return move;
}

sound.startMusic();

// Build every shader and upload every texture and geometry now: one of each
// kind of object in view, compiled and drawn once, then put away.
track.showAll();
player.showAll(true);
fx.showAll();
world.setBest(-20);
for (const texture of world.textures) renderer.initTexture(texture);
renderer.compile(scene, camera);
renderer.render(scene, camera);
player.showAll(false);
toTitle();

hh.run((dt) => {
  time += dt;
  stateTime += dt;
  let move = 0;

  if (state === 'title') {
    move = TITLE_SPEED * dt;
    player.update(dt, null, TITLE_SPEED);
    const choice = menuInput();
    if (menu === 'title') {
      if (choice === 'play' || input.pressed('START')) start();
      else if (choice === 'options') {
        sound.play('menu_select');
        openMenu('options');
      }
    } else if (choice === 'back' || input.pressed('START')) {
      sound.play('menu_back');
      openMenu('title', 1);
    } else if (choice === 'sound' || choice === 'music') {
      toggle(choice);
    }
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else move = play(dt);
  } else if (state === 'paused') {
    const choice = menuInput();
    if (choice === 'resume' || choice === 'back' || input.pressed('START')) resume();
    else if (choice === 'sound' || choice === 'music') toggle(choice);
    else if (choice === 'quit') {
      sound.play('menu_back');
      toTitle();
    }
  } else if (state === 'dying') {
    if (player.updateDead(dt) && stateTime > 1.0) gameOver();
  } else if (state === 'over') {
    player.updateDead(dt);
    // A short delay so a button mashed during the crash does not restart at once.
    if (stateTime > 0.6 && (input.pressed('A') || input.pressed('START'))) start();
    else if (stateTime > 0.6 && input.pressed('B')) {
      sound.play('menu_back');
      toTitle();
    }
  }

  if (state !== 'paused') {
    world.update(move);
    fx.update(dt, move);
  }
  if (state !== 'title' && bannerAt > 30) world.setBest(distance - bannerAt);
  updateLoops();

  // Camera: behind and above the runner, following its lane and height. On
  // the title it looks up a little, so the runner shows under the menu.
  lift += ((state === 'title' ? 1 : 0) - lift) * Math.min(1, dt * 3);
  const jolt = state === 'paused' ? 0 : shake;
  shake = Math.max(0, shake - (state === 'paused' ? 0 : dt));
  if (kick > 0 && state !== 'paused') {
    kick = Math.max(0, kick - dt * 0.8);
    hh.fitCamera(camera, { fov: FOV + Math.sin(kick * Math.PI) * 5 });
  }
  camera.position.set(
    player.x * 0.6 + (Math.random() - 0.5) * jolt,
    3.4 + lift * 0.3 + player.y * 0.35 + (Math.random() - 0.5) * jolt,
    6.2,
  );
  lookAt.set(player.x * 0.4, 1.2 + lift * 1.7, -8);
  camera.lookAt(lookAt);

  renderer.render(scene, camera);
});

// Testing hooks (not in the built game): state, an autopilot that plays,
// and the names of the sounds played.
if (import.meta.env.DEV) {
  const sounds = [];
  const play = sound.play;
  sound.play = (name, options) => {
    sounds.push(name);
    play(name, options);
  };
  window.__lr = {
    autopilot: false,
    sounds,
    track,
    player,
    renderer,
    get state() {
      return state;
    },
    get distance() {
      return distance;
    },
    set distance(d) {
      distance = d;
    },
    get speed() {
      return speed;
    },
    get stage() {
      return stage;
    },
    get coins() {
      return coins;
    },
    get magnetTime() {
      return magnetTime;
    },
    get shieldTime() {
      return shieldTime;
    },
    give: onPickup,
  };
  import('./autopilot.js').then((m) => {
    autopilot = m.createAutopilot(track);
  });
}
