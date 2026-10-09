// Cloud Climber: bounce up an endless tower of clouds.
// The climber bounces by itself whenever it lands on a cloud; the D-pad steers
// it left and right, round the edges of the column. The camera only goes up:
// drop below the bottom of the screen and the run is over. START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import {
  BODY_H,
  CAM_EYE,
  CAM_Z,
  COL_W,
  CRUMBLE,
  FOV,
  HALF_W,
  JUMP_V,
  ONESHOT,
  ROCKET_V,
  SPRING_V,
  smoothstep,
  viewHalf,
} from './shared.js';
import { SPRING_H } from './models.js';
import { createSky } from './sky.js';
import { createPlatforms } from './platforms.js';
import { CAP, ROCKET, STAR, createPickups } from './pickups.js';
import { HURT, KNOCK, STOMP, createEnemies } from './enemies.js';
import { createStorms } from './storms.js';
import { createLevel } from './level.js';
import { createPlayer } from './player.js';
import { createPilot } from './pilot.js';
import { createFx } from './fx.js';
import { createMarker } from './marker.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const SAVE_KEY = 'cloud-climber';
const ANCHOR = 0.48; // the camera keeps the climber no higher than this share of the screen
const START_AT = 0.12; // the meadow sits this far up the screen at the start
// The title screen frames the demo between the logo and the panel.
const DEMO_ANCHOR = 0.56;
const DEMO_START_AT = 0.36;
const CAM_FOLLOW = 10;
const OVER_DELAY = 0.7; // the game-over panel waits for the fall to play out
const DEMO_RESET = 240; // the title-screen climber starts over at this height
const MILESTONE = 100;
const TRAIL_EVERY = 0.035;
// The sky changes on the way up; each change gets its own toast.
const PHASES = [
  { at: 250, text: 'SUNSET', kind: 'dusk' },
  { at: 575, text: 'STARRY NIGHT', kind: 'night' },
  { at: 1000, text: 'OUTER SPACE', kind: 'space' },
];
// While the climber keeps bouncing higher, each bounce sounds a step further
// up the D major pentatonic (semitones above the recorded D5).
const COMBO_STEPS = [0, 2, 4, 7, 9, 12];
const COMBO_GAP = 1.4; // s: a longer flight between bounces starts over
const STAR_STEPS = [0, 2, 4, 7, 9, 12, 14];
const DEATH = { fall: 'You fell off the clouds', pest: 'A pest got you', zap: 'Struck by lightning' };

const hh = createHandheld({ clearColor: 0xbfe6fb });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xbfe6fb, 24, 80);

// The camera only ever moves straight up, so it is aimed once here. The
// play area is the column and the band of sky a 3:2 screen shows; it fills
// every screen shape: wider screens show more margin at the sides, and the
// square one shows the column with narrow margins rather than more sky above
// and below, so the climb plays the same everywhere.
const camera = new THREE.PerspectiveCamera(FOV, hh.aspect, 1, 100);
camera.position.set(0, CAM_EYE, CAM_Z);
camera.lookAt(0, 0, 0);
hh.fitCamera(camera, { minAspect: (COL_W + 1) / (viewHalf(0) * 2) });
camera.updateMatrixWorld();

// The y of the screen's bottom and top edges on the column plane (z = 0),
// relative to the point the camera looks at.
const edge = new THREE.Vector3();
function edgeAt(ndcY) {
  edge.set(0, ndcY, 0.5).unproject(camera).sub(camera.position);
  return camera.position.y - (edge.y * camera.position.z) / edge.z;
}
const VIEW_BOTTOM = edgeAt(-1);
const VIEW_TOP = edgeAt(1);
const VIEW_H = VIEW_TOP - VIEW_BOTTOM;
const ANCHOR_Y = VIEW_BOTTOM + VIEW_H * ANCHOR;
const CAM_START = -(VIEW_BOTTOM + VIEW_H * START_AT);
const DEMO_ANCHOR_Y = VIEW_BOTTOM + VIEW_H * DEMO_ANCHOR;
const DEMO_CAM_START = -(VIEW_BOTTOM + VIEW_H * DEMO_START_AT);

const sky = createSky(scene, renderer, hh.aspect);
const platforms = createPlatforms(scene);
const pickups = createPickups(scene);
const enemies = createEnemies(scene);
const fx = createFx(scene);
const storms = createStorms(scene, fx);
const level = createLevel(platforms, pickups, enemies, storms);
const player = createPlayer(scene);
const pilot = createPilot(platforms);
const marker = createMarker(scene);
const hud = createHud(hh.hud);
sky.glow(platforms.material, 0x6c6c94);
sky.glow(enemies.material, 0x5a3c8a);
sky.glow(storms.material, 0x4a4078);

// Effects in the order they are needed: the title's menu and the first
// bounces first, the rarer moments after.
const sound = createSound(hh, {
  sfx: [
    'move', 'select', 'back', 'start', 'bounce', 'wind', 'pause', 'spring', 'star', 'crumble', 'pop',
    'milestone', 'best', 'fall', 'gameover', 'record', 'phase', 'powerup', 'propeller', 'stomp', 'hurt',
    'buzz', 'bonk', 'rocket', 'rocket_loop', 'charge', 'zap',
  ],
  music: 'theme',
});
// Continuous sounds, shaped every frame by what is going on.
const loops = {
  wind: sound.loop('wind'),
  propeller: sound.loop('propeller'),
  rocket: sound.loop('rocket_loop'),
  buzz: sound.loop('buzz'),
};
const loopOn = { wind: false, propeller: false, rocket: false, buzz: false };

// Menus: the title's (with its options) and the pause menu.
const MENUS = {
  title: ['play', 'options'],
  options: ['sfx', 'music', 'back'],
  pause: ['resume', 'sfx', 'music', 'quit'],
};
const LABELS = { play: 'Play', options: 'Options', back: 'Back', resume: 'Resume', quit: 'Quit to title' };

let state = 'title'; // title | play | paused | dying | over
let menu = 'title'; // the menu on screen: title | options (on the title), pause
let cursor = 0;
let stateT = 0;
let clock = 0;
let demo = true; // the title screen plays by itself
let camY = CAM_START;
let height = 0; // highest the climber's feet have been this run
let metres = 0;
let stars = 0;
let shake = 0;
let trailT = 0;
let record = false;
let bestToast = false; // "NEW BEST!" was shown during this run
let runBest = 0; // the best height when this run started, where the bunting hangs
let nextMilestone = MILESTONE;
let nextPhase = 0;
let deathKind = 'fall';
let combo = 0;
let lastLandY = -1e9;
let lastLandT = -9;
let starStreak = 0;
let lastStarT = -9;
let wasFlying = false;
let best = hh.load(SAVE_KEY, null)?.best || 0;

const screenPos = new THREE.Vector3();

// Floating text over a point of the column.
function popupAt(text, x, y, kind) {
  screenPos.set(x, y, 0).project(camera);
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, kind);
}

// Game sounds (the title-screen demo stays quiet), panned to x.
function sfx(name, volume = 1, rate = 1, x = player.x, delay = 0) {
  if (demo) return;
  sound.play(name, { volume, rate, pan: (x / HALF_W) * 0.4, delay });
}

function vary(rate) {
  return rate * (0.97 + Math.random() * 0.06);
}

function label(id) {
  if (id === 'sfx') return `Sound: ${sound.sfxOn ? 'On' : 'Off'}`;
  if (id === 'music') return `Music: ${sound.musicOn ? 'On' : 'Off'}`;
  return LABELS[id];
}

function menuItems() {
  let html = '';
  const items = MENUS[menu];
  for (let i = 0; i < items.length; i++) {
    html += `<div class="item${i === cursor ? ' on' : ''}">${label(items[i])}</div>`;
  }
  return html;
}

// The title: the logo at the top, the menu at the bottom. The logo drops in
// only when the title first shows, not when the options open or close.
function titleMessage(fresh) {
  const options = menu === 'options';
  const hint = options ? 'D-pad choose · A switch · B back' : 'D-pad ◀ ▶ steer · START pause';
  hud.message(
    `<div class="top"><div class="logo${fresh ? '' : ' still'}">CLOUD CLIMBER</div></div>` +
      `<div class="bottom"><div class="panel">` +
      (options ? `<div class="heading">OPTIONS</div>` : '') +
      `<div class="menu">${menuItems()}</div>` +
      (!options && best > 0 ? `<div class="best">Best ${best} m</div>` : '') +
      `<div class="small">${hint}</div>` +
      `</div></div>`,
    'split',
  );
}

function openMenu(name, at) {
  menu = name;
  cursor = at;
  if (state === 'paused') {
    hud.message(
      `<div class="title">PAUSED</div><div class="menu">${menuItems()}</div>` +
        `<div class="small">D-pad choose · A select · B resume</div>`,
    );
  } else {
    titleMessage(false);
  }
}

// The D-pad moves the cursor. Returns the item chosen with A, 'back' for B,
// or null.
function menuInput() {
  const items = MENUS[menu];
  const dir = (input.pressed('DOWN') ? 1 : 0) - (input.pressed('UP') ? 1 : 0);
  if (dir !== 0) {
    cursor = (cursor + dir + items.length) % items.length;
    sound.play('move');
    hud.menu(menuItems());
  }
  if (input.pressed('A')) return items[cursor];
  if (input.pressed('B')) return 'back';
  return null;
}

// Sound and music switches, shared by the options and pause menus.
function toggle(id) {
  if (id === 'sfx') sound.setSfx(!sound.sfxOn);
  else sound.setMusic(!sound.musicOn);
  sound.play('select');
  hud.menu(menuItems());
}

function newWorld(isDemo) {
  demo = isDemo;
  platforms.clear();
  pickups.clear();
  enemies.clear();
  storms.clear();
  fx.clear();
  level.reset(isDemo);
  pilot.reset();
  player.reset(0, 0);
  camY = isDemo ? DEMO_CAM_START : CAM_START;
  height = 0;
  metres = 0;
  shake = 0;
  combo = 0;
  lastLandY = -1e9;
  wasFlying = false;
  sky.reset(camY);
  level.fill(camY + VIEW_TOP + 10);
}

function toTitle() {
  state = 'title';
  newWorld(true);
  marker.hide();
  hud.showStats(false);
  menu = 'title';
  cursor = 0;
  titleMessage(true);
  sound.duck(false);
}

function start() {
  state = 'play';
  stateT = 0;
  newWorld(false);
  stars = 0;
  record = false;
  bestToast = false;
  runBest = best;
  marker.place(best);
  nextMilestone = MILESTONE;
  nextPhase = 0;
  starStreak = 0;
  hud.showStats(true);
  hud.height(0);
  hud.best(best);
  hud.stars(0);
  hud.message('');
  sound.duck(false);
  sound.play('start');
}

function pause() {
  state = 'paused';
  openMenu('pause', 0);
  sound.play('pause');
  sound.duck(true);
}

function resume() {
  state = 'play';
  hud.message('');
  sound.play('back');
  sound.duck(false);
}

function saveBest() {
  if (metres <= best) return false;
  best = metres;
  hh.save(SAVE_KEY, { best });
  return true;
}

// 'fall' off the bottom, 'pest' caught by one, 'zap' struck by lightning.
function die(kind) {
  state = 'dying';
  stateT = 0;
  deathKind = kind;
  if (kind === 'fall') {
    shake = 0.25;
    sfx('fall');
  } else {
    player.die();
    shake = 0.4;
    hud.flash(kind === 'zap' ? 'zap' : 'hit');
    fx.burst(player.x, player.y + 0.5, 0xffffff, 10, 5, 0.12, 0.6, 8);
    fx.burst(player.x, player.y + 0.5, kind === 'zap' ? 0xfff2a0 : 0xff8a5b, 6, 4, 0.1, 0.6, 8);
    sfx('hurt');
    if (kind === 'zap') sfx('zap', 0.8);
    sfx('fall', 0.6, 1, player.x, 0.35);
  }
  record = saveBest();
}

function gameOver() {
  state = 'over';
  stateT = 0;
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="cause">${DEATH[deathKind]}</div>` +
      `<div class="big">${metres} m</div>` +
      `<div class="small">Best ${best} m · <span class="star">★</span> ${stars}</div>` +
      `<div>A play again · B title</div>`,
  );
  sound.play(record ? 'record' : 'gameover');
  sound.duck(true);
}

// Each landing higher than the last, soon after it, raises the bounce.
function bounceSound(y, rate) {
  const climbing = y > lastLandY + 0.3 && clock - lastLandT < COMBO_GAP;
  combo = climbing ? Math.min(combo + 1, COMBO_STEPS.length - 1) : 0;
  lastLandY = y;
  lastLandT = clock;
  sfx('bounce', 0.8, vary(rate * 2 ** (COMBO_STEPS[combo] / 12)));
}

// The climber touched down on cloud p.
function landOn(p) {
  if (platforms.onSpring) {
    player.y = p.y + SPRING_H;
    player.bounce(SPRING_V);
    platforms.bounceSpring(p);
    fx.burst(p.x + p.springX, player.y, 0xffffff, 8, 5, 0.08, 0.35, 6);
    fx.burst(p.x + p.springX, player.y, 0xff4f5e, 5, 4, 0.08, 0.35, 6);
    shake = Math.max(shake, 0.12);
    lastLandY = player.y;
    lastLandT = clock;
    sfx('spring', 0.9, vary(1));
    if (!demo) popupAt('BOING!', player.x, player.y + 1.2, 'big');
  } else if (p.kind === CRUMBLE) {
    // No bounce: the storm cloud breaks and the climber drops through.
    platforms.crumble(p);
    player.vy *= 0.4;
    fx.burst(p.x, p.y - 0.2, 0x8c8aa4, 12, 3, 0.15, 0.7, 10);
    fx.burst(p.x, p.y - 0.2, 0xc4c2d6, 6, 2, 0.12, 0.6, 6);
    shake = Math.max(shake, 0.07);
    combo = 0;
    sfx('crumble', 0.9, vary(1), p.x);
    return;
  } else {
    player.y = p.y;
    player.bounce(JUMP_V);
    bounceSound(p.y, 1);
    if (p.kind === ONESHOT) {
      platforms.pop(p);
      fx.burst(p.x, p.y - 0.2, 0xfff0b0, 12, 3.5, 0.13, 0.5, 2);
      sfx('pop', 0.8, vary(1), p.x, 0.08);
    } else {
      platforms.squish(p);
    }
    fx.dust(player.x, p.y, 0xffffff, 6);
  }
  pilot.bounced(player.x, player.y);
}

// One frame of climbing, for the player and the title-screen demo alike.
function climb(dt, steer) {
  player.update(dt, steer);
  if (player.dead) return;

  if (!player.flying && player.vy <= 0) {
    const p = platforms.land(player.prevY, player.y, player.x);
    if (p) {
      landOn(p);
    } else if (player.y <= 0 && player.prevY >= 0) {
      // The meadow at the bottom.
      player.y = 0;
      player.bounce(JUMP_V);
      fx.dust(player.x, 0, 0x9fe678, 6);
      pilot.bounced(player.x, 0);
      combo = 0;
      lastLandY = 0;
      lastLandT = clock;
      sfx('bounce', 0.7, vary(0.84));
    }
  }

  const got = pickups.collect(player.x, player.y);
  if (got === STAR) {
    fx.burst(pickups.hitX, pickups.hitY, 0xffd23f, 10, 4, 0.09, 0.45, 4);
    if (!demo) {
      stars++;
      hud.stars(stars);
      popupAt('+1', pickups.hitX, pickups.hitY + 0.5, 'gold');
      starStreak = clock - lastStarT < 0.9 ? Math.min(starStreak + 1, STAR_STEPS.length - 1) : 0;
      lastStarT = clock;
      sfx('star', 0.8, 2 ** (STAR_STEPS[starStreak] / 12), pickups.hitX);
    }
  } else if (got === CAP || got === ROCKET) {
    player.fly(got);
    hud.flash('boost');
    hud.toast(got === ROCKET ? 'ROCKET!' : 'PROPELLER!', 'gold');
    fx.burst(pickups.hitX, pickups.hitY, got === ROCKET ? 0xff8a2a : 0x4dd0ff, 12, 5, 0.1, 0.5, 4);
    sfx(got === ROCKET ? 'rocket' : 'powerup');
    if (got === ROCKET) shake = Math.max(shake, 0.2);
  }
  // The cap or the rocket comes off when the flight is over.
  if (wasFlying && !player.flying) sfx('pop', 0.7, 0.75);
  wasFlying = player.flying;

  const hit = enemies.hit(player.x, player.y, player.prevY, player.vy, player.flying);
  if (hit === STOMP) {
    player.y = Math.max(player.y, enemies.hitY);
    player.bounce(JUMP_V * 1.05);
    fx.burst(enemies.hitX, enemies.hitY, 0x7a52c7, 12, 5, 0.12, 0.6, 10);
    fx.burst(enemies.hitX, enemies.hitY, 0xffd23f, 4, 4, 0.08, 0.5, 10);
    shake = Math.max(shake, 0.15);
    popupAt('STOMP!', enemies.hitX, enemies.hitY + 0.8, 'big');
    lastLandY = enemies.hitY;
    lastLandT = clock;
    sfx('stomp', 1, vary(1), enemies.hitX);
  } else if (hit === KNOCK) {
    fx.burst(enemies.hitX, enemies.hitY, 0x7a52c7, 10, 6, 0.12, 0.6, 10);
    popupAt('BONK!', enemies.hitX, enemies.hitY + 0.8, 'big');
    sfx('bonk', 1, vary(1), enemies.hitX);
  } else if (hit === HURT && state === 'play') {
    die('pest');
    return;
  }
  if (state === 'play' && !player.flying && storms.hit(player.x, player.y)) {
    die('zap');
    return;
  }

  // Puffs stream out behind the propeller, flames behind the rocket, and
  // sparkles after a spring launch.
  if (player.flying || player.vy > JUMP_V * 1.15) {
    const rocketing = player.gear === ROCKET;
    trailT += dt;
    while (trailT > TRAIL_EVERY) {
      if (rocketing) {
        // Twice as thick, from one rocket or the other.
        trailT -= TRAIL_EVERY * 0.5;
        const side = Math.random() < 0.5 ? -0.42 : 0.42;
        fx.trail(player.x + side, player.y - 0.3, Math.random() < 0.5 ? 0xffa030 : 0xffe066);
      } else {
        trailT -= TRAIL_EVERY;
        fx.trail(player.x, player.y + 0.1, player.flying ? 0xffffff : 0xfff3b0);
      }
    }
    if (rocketing) shake = Math.max(shake, 0.04);
  }
}

// Height, milestones, the sky's changes, the record and the camera's climb.
function track(dt) {
  if (!player.dead && player.y > height) height = player.y;
  const target = player.y - (demo ? DEMO_ANCHOR_Y : ANCHOR_Y);
  if (!player.dead && target > camY) camY += (target - camY) * Math.min(1, dt * CAM_FOLLOW);
  metres = Math.floor(height);
  if (demo) return;
  hud.height(metres);
  hud.best(Math.max(best, metres));
  let jingle = false;
  if (nextPhase < PHASES.length && metres >= PHASES[nextPhase].at) {
    const phase = PHASES[nextPhase++];
    hud.toast(phase.text, phase.kind);
    sfx('phase');
    jingle = true;
  }
  if (metres >= nextMilestone) {
    if (!jingle) {
      hud.toast(`${nextMilestone} m!`, '');
      sfx('milestone');
      jingle = true;
    }
    nextMilestone += MILESTONE;
  }
  if (!bestToast && runBest > 0 && metres > runBest) {
    bestToast = true;
    hud.toast('NEW BEST!', 'gold');
    marker.wave();
    fx.burst(player.x, runBest, 0xffd23f, 8, 5, 0.09, 0.6, 6);
    fx.burst(player.x, runBest, 0xff6b6b, 6, 5, 0.09, 0.6, 6);
    sfx('best');
  }
}

// Below the bottom edge of the screen means gone.
function fellOff() {
  return player.y + BODY_H < camY + VIEW_BOTTOM - 0.2;
}

// Starts a loop at volume (and rate), or fades it out at 0.
function drive(name, volume, rate) {
  if (volume > 0.001) {
    loops[name].set(volume, rate);
    loopOn[name] = true;
  } else if (loopOn[name]) {
    loops[name].stop(0.15);
    loopOn[name] = false;
  }
}

// The wind rises with height and speed; the cap whirs, the rocket roars and
// pests buzz when they are close.
function updateLoops() {
  const playing = state === 'play';
  const speed = Math.min(1, Math.abs(player.vy) / ROCKET_V);
  let wind = 0;
  if (playing) wind = 0.12 + 0.3 * smoothstep(20, 900, height) + 0.3 * speed;
  else if (state === 'title' || state === 'dying' || state === 'over') wind = 0.08;
  drive('wind', wind, 0.85 + 0.2 * smoothstep(0, 1000, height) + 0.15 * speed);
  const flying = playing && player.flying;
  drive('propeller', flying && player.gear === CAP ? 0.5 : 0, 1 + Math.sin(clock * 3) * 0.03);
  drive('rocket', flying && player.gear === ROCKET ? 0.6 : 0, 1);
  let buzz = 0;
  if (playing) {
    const d = enemies.nearest(player.x, player.y + 0.5);
    if (d < 6) buzz = 0.55 * (1 - d / 6) * (1 - d / 6);
  }
  drive('buzz', buzz, 1);
}

// Build every shader and upload every model now instead of on first use, so
// nothing stalls mid-run: for one frame, everything hidden shows and every
// instanced mesh draws a copy.
function warmUp() {
  const hidden = [];
  const empty = [];
  scene.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
    if (o.isInstancedMesh && o.count === 0) {
      empty.push(o);
      o.count = 1;
    }
  });
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  for (const o of hidden) o.visible = false;
  for (const o of empty) o.count = 0;
}

toTitle();
warmUp();
sound.startMusic();

hh.run((dt) => {
  stateT += dt;
  clock += dt;

  if (state === 'title') {
    climb(dt, pilot.steer(player));
    track(dt);
    if (fellOff() || height > DEMO_RESET) {
      hud.flash('fade');
      newWorld(true);
    }
    const choice = menuInput();
    if (menu === 'title') {
      if (choice === 'play' || input.pressed('START')) {
        start();
      } else if (choice === 'options') {
        sound.play('select');
        openMenu('options', 0);
      }
    } else if (choice === 'back' || input.pressed('START')) {
      sound.play('back');
      openMenu('title', 1);
    } else if (choice === 'sfx' || choice === 'music') {
      toggle(choice);
    }
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
    } else {
      climb(dt, input.dpad.x);
      track(dt);
      if (state === 'play' && fellOff()) die('fall');
    }
  } else if (state === 'paused') {
    const choice = input.pressed('START') ? 'resume' : menuInput();
    if (choice === 'resume' || choice === 'back') {
      resume();
    } else if (choice === 'quit') {
      // Quitting still keeps a new best height.
      saveBest();
      sound.play('back');
      toTitle();
    } else if (choice) {
      toggle(choice);
    }
  } else if (state === 'dying') {
    player.update(dt, 0);
    if (stateT > OVER_DELAY) gameOver();
  } else if (state === 'over') {
    player.update(dt, 0);
    // A short delay so a button mashed while falling does not restart at once.
    if (stateT > 0.4 && input.pressed('A')) {
      start();
    } else if (stateT > 0.4 && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }

  // Everything below is drawing and scenery; while paused it stays frozen.
  const live = state !== 'paused';
  if (live) {
    const bottom = camY + VIEW_BOTTOM;
    const top = camY + VIEW_TOP;
    level.fill(top + 10);
    platforms.update(dt, bottom);
    platforms.draw(bottom, top);
    pickups.update(dt, bottom, top);
    enemies.update(dt, bottom, top);
    storms.update(dt, bottom, top);
    if (!demo && (storms.charged || storms.struck)) {
      const near = Math.max(0.25, 1 - Math.abs(storms.eventY - player.y) / 10);
      if (storms.charged) sfx('charge', 0.7 * near, 1, storms.eventX);
      if (storms.struck) sfx('zap', 0.75 * near, vary(1), storms.eventX);
    }
    marker.update(dt);
    player.draw(dt);
    fx.update(dt);
    sky.update(dt, camY, height);
    shake = Math.max(0, shake - dt);
  }
  updateLoops();

  const jitter = live ? shake * 0.8 : 0;
  camera.position.set((Math.random() - 0.5) * jitter, camY + CAM_EYE + (Math.random() - 0.5) * jitter, CAM_Z);

  renderer.render(scene, camera);
});
