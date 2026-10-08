// Cloud Climber: bounce up an endless tower of clouds.
// The climber bounces by itself whenever it lands on a cloud; the D-pad steers
// it left and right, round the edges of the column. The camera only goes up:
// drop below the bottom of the screen and the run is over. START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BODY_H, CAM_EYE, CAM_Z, COL_W, CRUMBLE, FOV, JUMP_V, ONESHOT, SPRING_V, viewHalf } from './shared.js';
import { SPRING_H } from './models.js';
import { createSky } from './sky.js';
import { createPlatforms } from './platforms.js';
import { createPickups } from './pickups.js';
import { HURT, KNOCK, STOMP, createEnemies } from './enemies.js';
import { createLevel } from './level.js';
import { createPlayer } from './player.js';
import { createPilot } from './pilot.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';

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
const SUNSET_AT = 250;
const NIGHT_AT = 575;
const TRAIL_EVERY = 0.035;

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
const level = createLevel(platforms, pickups, enemies);
const player = createPlayer(scene);
const pilot = createPilot(platforms);
const fx = createFx(scene);
const hud = createHud(hh.hud);
sky.glow(platforms.material, 0x6c6c94);
sky.glow(enemies.material, 0x5a3c8a);

let state = 'title'; // title | play | paused | dying | over
let stateT = 0;
let demo = true; // the title screen plays by itself
let camY = CAM_START;
let height = 0; // highest the climber's feet have been this run
let metres = 0;
let stars = 0;
let shake = 0;
let trailT = 0;
let record = false;
let bestToast = false; // "NEW BEST!" was shown during this run
let nextMilestone = MILESTONE;
let sunsetToast = false;
let nightToast = false;
let best = hh.load(SAVE_KEY, null)?.best || 0;

const HINT = 'D-pad ◀ ▶ steer · START pause';
const screenPos = new THREE.Vector3();

// Floating text over a point of the column.
function popupAt(text, x, y, kind) {
  screenPos.set(x, y, 0).project(camera);
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, kind);
}

function newWorld(isDemo) {
  demo = isDemo;
  platforms.clear();
  pickups.clear();
  enemies.clear();
  fx.clear();
  level.reset(isDemo);
  pilot.reset();
  player.reset(0, 0);
  camY = isDemo ? DEMO_CAM_START : CAM_START;
  height = 0;
  metres = 0;
  shake = 0;
  sky.reset(camY);
  level.fill(camY + VIEW_TOP + 10);
}

function toTitle() {
  state = 'title';
  newWorld(true);
  hud.showStats(false);
  hud.message(
    `<div class="top"><div class="logo">CLOUD CLIMBER</div></div>` +
      `<div class="bottom"><div class="panel">` +
      `<div class="big">Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="best">Best ${best} m</div>` : '') +
      `</div></div>`,
    'split',
  );
}

function start() {
  state = 'play';
  stateT = 0;
  newWorld(false);
  stars = 0;
  record = false;
  bestToast = false;
  sunsetToast = false;
  nightToast = false;
  nextMilestone = MILESTONE;
  hud.showStats(true);
  hud.height(0);
  hud.best(best);
  hud.stars(0);
  hud.message('');
}

function pause() {
  state = 'paused';
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
}

// 'fall' off the bottom, or 'hit' by a pest.
function die(kind) {
  state = 'dying';
  stateT = 0;
  if (kind === 'hit') {
    player.die();
    shake = 0.4;
    hud.flash('hit');
    fx.burst(player.x, player.y + 0.5, 0xffffff, 10, 5, 0.12, 0.6, 8);
    fx.burst(player.x, player.y + 0.5, 0xff8a5b, 6, 4, 0.1, 0.6, 8);
  } else {
    shake = 0.25;
  }
  record = metres > best;
  if (record) {
    best = metres;
    hh.save(SAVE_KEY, { best });
  }
}

function gameOver() {
  state = 'over';
  stateT = 0;
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big">${metres} m</div>` +
      `<div class="small">Best ${best} m · <span class="star">★</span> ${stars}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
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
    if (!demo) popupAt('BOING!', player.x, player.y + 1.2, 'big');
  } else if (p.kind === CRUMBLE) {
    // No bounce: the storm cloud breaks and the climber drops through.
    platforms.crumble(p);
    player.vy *= 0.4;
    fx.burst(p.x, p.y - 0.2, 0x8c8aa4, 12, 3, 0.15, 0.7, 10);
    fx.burst(p.x, p.y - 0.2, 0xc4c2d6, 6, 2, 0.12, 0.6, 6);
    shake = Math.max(shake, 0.07);
    return;
  } else {
    player.y = p.y;
    player.bounce(JUMP_V);
    if (p.kind === ONESHOT) {
      platforms.pop(p);
      fx.burst(p.x, p.y - 0.2, 0xfff0b0, 12, 3.5, 0.13, 0.5, 2);
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
    }
  }

  const got = pickups.collect(player.x, player.y);
  if (got === 1) {
    fx.burst(pickups.hitX, pickups.hitY, 0xffd23f, 10, 4, 0.09, 0.45, 4);
    if (!demo) {
      stars++;
      hud.stars(stars);
      popupAt('+1', pickups.hitX, pickups.hitY + 0.5, 'gold');
    }
  } else if (got === 2) {
    player.fly();
    hud.flash('boost');
    hud.toast('PROPELLER!', 'gold');
    fx.burst(pickups.hitX, pickups.hitY, 0x4dd0ff, 12, 5, 0.1, 0.5, 4);
  }

  const hit = enemies.hit(player.x, player.y, player.prevY, player.vy, player.flying);
  if (hit === STOMP) {
    player.y = Math.max(player.y, enemies.hitY);
    player.bounce(JUMP_V * 1.05);
    fx.burst(enemies.hitX, enemies.hitY, 0x7a52c7, 12, 5, 0.12, 0.6, 10);
    fx.burst(enemies.hitX, enemies.hitY, 0xffd23f, 4, 4, 0.08, 0.5, 10);
    shake = Math.max(shake, 0.15);
    popupAt('STOMP!', enemies.hitX, enemies.hitY + 0.8, 'big');
  } else if (hit === KNOCK) {
    fx.burst(enemies.hitX, enemies.hitY, 0x7a52c7, 10, 6, 0.12, 0.6, 10);
    popupAt('BONK!', enemies.hitX, enemies.hitY + 0.8, 'big');
  } else if (hit === HURT && state === 'play') {
    die('hit');
    return;
  }

  // Puffs stream out behind the propeller and after a spring launch.
  if (player.flying || player.vy > JUMP_V * 1.15) {
    trailT += dt;
    while (trailT > TRAIL_EVERY) {
      trailT -= TRAIL_EVERY;
      fx.trail(player.x, player.y + 0.1, player.flying ? 0xffffff : 0xfff3b0);
    }
  }
}

// Height, milestones and the camera's climb.
function track(dt) {
  if (!player.dead && player.y > height) height = player.y;
  const target = player.y - (demo ? DEMO_ANCHOR_Y : ANCHOR_Y);
  if (!player.dead && target > camY) camY += (target - camY) * Math.min(1, dt * CAM_FOLLOW);
  metres = Math.floor(height);
  if (demo) return;
  hud.height(metres);
  hud.best(Math.max(best, metres));
  if (metres >= nextMilestone) {
    hud.toast(`${nextMilestone} m!`, '');
    nextMilestone += MILESTONE;
  }
  if (!bestToast && best > 0 && metres > best) {
    bestToast = true;
    hud.toast('NEW BEST!', 'gold');
  }
  if (!sunsetToast && metres >= SUNSET_AT) {
    sunsetToast = true;
    hud.toast('SUNSET', 'dusk');
  }
  if (!nightToast && metres >= NIGHT_AT) {
    nightToast = true;
    hud.toast('STARRY NIGHT', 'night');
  }
}

// Below the bottom edge of the screen means gone.
function fellOff() {
  return player.y + BODY_H < camY + VIEW_BOTTOM - 0.2;
}

toTitle();
// Build every shader now instead of on first use, so nothing stalls mid-run.
renderer.compile(scene, camera);

hh.run((dt) => {
  stateT += dt;

  if (state === 'title') {
    climb(dt, pilot.steer(player));
    track(dt);
    if (fellOff() || height > DEMO_RESET) {
      hud.flash('fade');
      newWorld(true);
    }
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
    } else {
      climb(dt, input.dpad.x);
      track(dt);
      if (state === 'play' && fellOff()) die('fall');
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      // Quitting still keeps a new best height.
      if (metres > best) {
        best = metres;
        hh.save(SAVE_KEY, { best });
      }
      toTitle();
    }
  } else if (state === 'dying') {
    player.update(dt, 0);
    if (stateT > OVER_DELAY) gameOver();
  } else if (state === 'over') {
    player.update(dt, 0);
    // A short delay so a button mashed while falling does not restart at once.
    if (stateT > 0.4 && input.pressed('A')) start();
    else if (stateT > 0.4 && input.pressed('B')) toTitle();
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
    player.draw(dt);
    fx.update(dt);
    sky.update(dt, camY, height);
    shake = Math.max(0, shake - dt);
  }

  const jitter = live ? shake * 0.8 : 0;
  camera.position.set((Math.random() - 0.5) * jitter, camY + CAM_EYE + (Math.random() - 0.5) * jitter, CAM_Z);

  renderer.render(scene, camera);
});
