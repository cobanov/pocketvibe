// Tower Stack: drop sliding slabs onto the tower. Whatever hangs over the
// edge is sliced off, so the slabs get smaller unless the drops are perfect.
// A or UP drops, START pauses. Miss the tower completely and the run is over.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { LH, SIZE, slabGeometry } from './shared.js';
import { createTower } from './tower.js';
import { CUT, MISS, PERFECT, createStack } from './stack.js';
import { createDebris } from './debris.js';
import { createFx } from './fx.js';
import { createSky } from './sky.js';
import { createClouds } from './clouds.js';
import { createHud } from './hud.js';

const BASE_SPEED = 2.9; // slide speed of the first slab, units per second
const SPEED_RAMP = 0.045; // added per layer
const MAX_SPEED = 7.4;
const FAR_SIDE_FROM = 8; // from this height slabs sometimes come from the front
const FAR_SIDE_CHANCE = 0.3;
const MILESTONE = 25; // a callout every 25 layers
const OVER_DELAY = 1.8; // the zoom out plays before the game-over panel
const DROP_GUARD = 0.15; // seconds after a slab appears before it can be dropped
const DEMO_SKIES = [40, 0, 86]; // sky offsets (in layers) for the demo runs
const SAVE_KEY = 'tower-stack';

// Orthographic camera at a fixed angle: isometric-looking, rising with the
// tower. VIEW_H is the visible height in world units at zoom 1 on the 3:2
// screen; wider screens show more at the sides, taller ones more above and
// below.
const VIEW_H = 10;
const ELEV = THREE.MathUtils.degToRad(31);
const COS_E = Math.cos(ELEV);
const SIN_E = Math.sin(ELEV);
const DIST = 40;
const PLAY_LOOK = 0.75; // the camera looks this far above the top: the top sits a little below the centre
const TITLE_LOOK = 2.7; // lower on screen under the title panel
const TITLE_ZOOM = 0.8; // and a little further out, so more of the tower shows

const hh = createHandheld({ clearColor: 0x7fc0f2 });
const { renderer, input } = hh;

const scene = new THREE.Scene();
// Fog only hazes the clouds far behind the tower; the slabs keep their colours.
scene.fog = new THREE.Fog(0x7fc0f2, 44, 80);
const camera = new THREE.OrthographicCamera(-1, 1, VIEW_H / 2, -VIEW_H / 2, 1, 110);
hh.fitCamera(camera); // sets the sides for this screen's shape
// The view's size in world units at zoom 1 on this screen, and how much
// taller it is than designed (1 on 3:2 and wider screens).
const SHOWN_W = camera.right - camera.left;
const SHOWN_H = camera.top - camera.bottom;
const TALL = SHOWN_H / VIEW_H;
const OVER_SHIFT = SHOWN_W * 0.2 * TALL; // tower to the left of the game-over panel
const OFFSET = new THREE.Vector3(DIST * COS_E * Math.SQRT1_2, DIST * SIN_E, DIST * COS_E * Math.SQRT1_2);
const RIGHT = new THREE.Vector3(1, 0, -1).normalize(); // screen right, on the ground
const UPWARD = new THREE.Vector3(); // screen up, in the world
camera.position.copy(OFFSET);
camera.lookAt(0, 0, 0);
UPWARD.set(0, 1, 0).applyQuaternion(camera.quaternion);
scene.add(camera); // the sky hangs from it

scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8fb8, 1.45));
const sun = new THREE.DirectionalLight(0xffffff, 1.65);
sun.position.set(-2.5, 10, 6); // lights the top and the left face, leaves the right one in shade
scene.add(sun);

const slab = slabGeometry();
const tower = createTower(scene, slab);
const debris = createDebris(scene, slab);
const stack = createStack(scene, slab, tower, debris);
const fx = createFx(scene);
const sky = createSky(camera, SHOWN_W, SHOWN_H, scene.fog);
const clouds = createClouds(scene, COS_E, SIN_E, SHOWN_W, SHOWN_H);
const hud = createHud(hh.hud);

let state = 'title'; // title | play | paused | falling | over
let stateT = 0;
let score = 0;
let perfects = 0;
let topCombo = 0;
let record = false;
let best = hh.load(SAVE_KEY, null)?.best || 0;
let shake = 0;
let punch = 0; // a short zoom-in on perfect drops

// Camera, eased towards the goals below.
let camX = 0;
let camY = TITLE_LOOK;
let camZ = 0;
let zoom = TITLE_ZOOM;
let shift = 0;
let goalX = 0;
let goalY = 0;
let goalZ = 0;
let goalZoom = TITLE_ZOOM;
let goalShift = 0;
let skyLevel = DEMO_SKIES[0];
let skyOffset = 0;

// The title-screen demo.
let demoPhase = 'stack'; // stack | fall
let demoT = 0;
let demoErr = 0; // where the demo means to drop the current slab
let demoGoal = 0; // the height at which it misses on purpose
let demoRun = 0;

const HINT = 'A or UP drop · START pause';
const target = new THREE.Vector3();
const screenPos = new THREE.Vector3();
const tmpColor = new THREE.Color();

// "TOWER STACK" with every letter one layer further round the colour wheel.
const TITLE = [...'TOWER STACK']
  .map((ch, i) => (ch === ' ' ? ' ' : `<span style="color:hsl(${(i * 26 + 330) % 360}, 90%, 72%)">${ch}</span>`))
  .join('');

function speedFor(n) {
  return Math.min(MAX_SPEED, BASE_SPEED + n * SPEED_RAMP);
}

// Floating text above a point of the tower.
function popupAt(text, x, y, z, gold) {
  screenPos.set(x, y, z).project(camera);
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height, gold);
}

function newTower() {
  tower.reset(Math.random());
  stack.reset();
  debris.clear();
  fx.clear();
}

function nextSlab() {
  const n = tower.n;
  stack.spawn(speedFor(n), n >= FAR_SIDE_FROM && Math.random() < FAR_SIDE_CHANCE);
}

// Rings, sparkles and dust for a drop that landed.
function landFx(kind, loud) {
  const r = stack.last;
  const base = r.y - LH / 2 + 0.01; // where the new layer meets the one below
  if (kind === PERFECT) {
    const combo = stack.combo;
    const hex = r.grew ? 0xffe066 : 0xffffff;
    fx.ring(r.x, base, r.z, r.w, r.d, hex, 0);
    if (combo >= 3) fx.ring(r.x, base, r.z, r.w, r.d, hex, 0.12);
    if (combo >= 6) fx.ring(r.x, base, r.z, r.w, r.d, hex, 0.24);
    fx.sparkle(r.x, base, r.z, r.w, r.d, hex, 10 + Math.min(combo, 8) * 3, 2 + Math.min(combo, 8) * 0.2);
    punch = Math.max(punch, 0.02 + Math.min(combo, 8) * 0.005);
    if (loud) {
      const text = combo >= 2 ? `PERFECT ×${combo}` : 'PERFECT';
      popupAt(text, r.x, r.y + LH * 2, r.z, r.grew);
    }
  } else if (kind === CUT) {
    tower.colorOf(tower.n, tmpColor);
    fx.dust(r.cutX, r.y, r.cutZ, tmpColor.getHex(), 9);
    shake = Math.max(shake, Math.min(0.12, r.cut * 0.1)); // a bigger slice, a harder knock
  }
}

function toTitle() {
  state = 'title';
  stateT = 0;
  hud.showStats(false);
  hud.callout('');
  hud.message(
    `<div class="title">${TITLE}</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best}</div>` : ''),
    'top',
  );
  demoReset();
}

function start() {
  state = 'play';
  stateT = 0;
  score = 0;
  perfects = 0;
  topCombo = 0;
  skyOffset = 0;
  newTower();
  nextSlab();
  hud.showStats(true);
  hud.score(0);
  hud.best(best > 0 ? `BEST ${best}` : '', false);
  hud.callout('');
  hud.message('');
}

function pause() {
  state = 'paused';
  hud.pause(true);
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
}

function drop() {
  const kind = stack.drop();
  if (kind === MISS) {
    lose();
    return;
  }
  score = tower.n;
  if (kind === PERFECT) {
    perfects++;
    topCombo = Math.max(topCombo, stack.combo);
  }
  landFx(kind, true);
  hud.score(score);
  if (best > 0 && score > best) hud.best('NEW BEST', true);
  if (score % MILESTONE === 0 || (best > 0 && score === best + 1)) {
    hud.callout(score % MILESTONE === 0 ? `${score} LAYERS!` : 'NEW BEST!');
    fx.sparkle(tower.topX, tower.height, tower.topZ, tower.topW, tower.topD, 0xffe066, 30, 3.2);
  }
  if (tower.full) lose();
  else nextSlab();
}

function lose() {
  state = 'falling';
  stateT = 0;
  shake = 0.32;
  hud.flash();
  hud.callout('');
  tower.showAll(true);
  record = score > best;
  if (record) {
    best = score;
    hh.save(SAVE_KEY, { best });
  }
}

function showOver() {
  state = 'over';
  stateT = 0;
  hud.showStats(false);
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big">${score}</div>` +
      `<div class="small">${score === 1 ? 'layer' : 'layers'} · Best ${best}</div>` +
      `<div class="small">Perfect ${perfects} · Top combo ${topCombo}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
    'side',
  );
}

// The demo stacks a tower of 14 to 25 layers with mostly perfect drops, then
// misses on purpose, shows the whole tower and starts again.
function demoReset() {
  newTower();
  demoPhase = 'stack';
  demoT = 0;
  demoGoal = 14 + Math.floor(Math.random() * 12);
  skyOffset = DEMO_SKIES[demoRun % DEMO_SKIES.length];
  demoRun++;
  demoSlab();
}

function demoSlab() {
  const n = tower.n;
  stack.spawn(speedFor(n) * 0.9, n >= 6 && Math.random() < FAR_SIDE_CHANCE);
  const side = Math.random() < 0.5 ? -1 : 1;
  if (n >= demoGoal || Math.min(tower.topW, tower.topD) < 1.2) demoErr = side * (stack.size + 0.4);
  else if (Math.random() < 0.7) demoErr = (Math.random() - 0.5) * 0.12;
  else demoErr = side * (0.18 + Math.random() * 0.4);
}

function updateDemo(dt) {
  if (demoPhase === 'stack') {
    const before = stack.offset - demoErr;
    stack.update(dt);
    const after = stack.offset - demoErr;
    if (stack.age > 0.3 && before * after <= 0) {
      const kind = stack.drop();
      if (kind === MISS) {
        demoPhase = 'fall';
        demoT = 0;
        shake = 0.2;
        tower.showAll(true);
      } else {
        landFx(kind, false);
        demoSlab();
      }
    }
  } else {
    demoT += dt;
    if (demoT > 3.4) demoReset();
  }
}

// Where the camera wants to be: following the top while stacking, or pulled
// back to show the whole tower (beside the game-over panel, or under the
// title panel).
function frame() {
  const overview = state === 'falling' || state === 'over' || (state === 'title' && demoPhase === 'fall');
  if (!overview) {
    goalX = tower.topX;
    goalZ = tower.topZ;
    goalY = tower.height + (state === 'title' ? TITLE_LOOK : PLAY_LOOK);
    goalZoom = state === 'title' ? TITLE_ZOOM : 1;
    goalShift = 0;
    return;
  }
  // On screen the tower spans its height (plus the pedestal down to the
  // clouds) and the diagonal of its footprint.
  const h = tower.height;
  const room = state === 'title' ? 0.6 : 0.8;
  const extent = (h + 4) * COS_E + SIZE * Math.SQRT2 * SIN_E;
  // Always a little pull back, even for a short tower. Screens taller than
  // 3:2 zoom in by as much as they are taller, so the tower fills them the
  // same way and its foot stays in the cloud bank.
  goalZoom = Math.min(state === 'title' ? 0.7 : 0.85, (VIEW_H * room) / extent) * TALL;
  goalX = 0;
  goalZ = 0;
  goalY = (h - 4) / 2 + 0.9;
  // Under the title panel the tower sits lower; beside the game-over panel
  // it moves left.
  if (state === 'title') goalY += (SHOWN_H * 0.16) / goalZoom / COS_E;
  goalShift = state === 'title' ? 0 : OVER_SHIFT;
  if (state === 'title' && h < 6) goalY = h + TITLE_LOOK;
}

function updateCamera(dt) {
  frame();
  // A new demo tower starts far below the last overview: swoop down faster.
  const k = Math.min(1, dt * (state === 'title' && demoPhase === 'stack' && tower.n < 2 ? 5 : 3.2));
  camX += (goalX - camX) * k;
  camY += (goalY - camY) * k;
  camZ += (goalZ - camZ) * k;
  // Zooming out eases more slowly than the rest, for a calm pull back.
  zoom += (goalZoom - zoom) * Math.min(1, dt * (goalZoom < zoom ? 2.2 : 4));
  shift += (goalShift - shift) * Math.min(1, dt * 2.5);
  punch = Math.max(0, punch - dt * 0.12);
  const z = zoom * (1 + punch);
  if (z !== camera.zoom) {
    camera.zoom = z;
    camera.updateProjectionMatrix();
  }
  target.set(camX, camY, camZ).addScaledVector(RIGHT, shift / zoom);
  shake = Math.max(0, shake - dt);
  if (shake > 0) {
    target.addScaledVector(RIGHT, (Math.random() - 0.5) * shake * 0.8 / zoom);
    target.addScaledVector(UPWARD, (Math.random() - 0.5) * shake * 0.8 / zoom);
  }
  camera.position.copy(target).add(OFFSET);
}

toTitle();

// Compile every material now, while loading: the offcuts, rings, sparkles
// and stars are not drawn until later, and would stall the game the first
// time they show up.
renderer.compile(scene, camera);

hh.run((dt) => {
  const paused = state === 'paused';
  if (!paused) stateT += dt;

  if (state === 'title') {
    updateDemo(dt);
    if (input.pressed('A') || input.pressed('UP') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    // A new slab starts clear of the tower, so a press in its first moment
    // (a double tap, a bouncy button) would always miss: ignore it.
    else if ((input.pressed('A') || input.pressed('UP')) && stack.age > DROP_GUARD) drop();
    else stack.update(dt);
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.pause(false);
      hud.message('');
    } else if (input.pressed('B')) {
      hud.pause(false);
      toTitle();
    }
  } else if (state === 'falling') {
    if (stateT > OVER_DELAY) showOver();
  } else if (state === 'over') {
    // A short beat so a button mashed while losing does not restart at once.
    if (stateT > 0.4 && (input.pressed('A') || input.pressed('UP'))) start();
    else if (stateT > 0.4 && input.pressed('B')) toTitle();
  }

  // Everything below animates; while paused it all stays frozen.
  if (!paused) {
    tower.update(dt);
    debris.update(dt);
    fx.update(dt);
    if (state !== 'falling' && state !== 'over') {
      skyLevel += (tower.n + skyOffset - skyLevel) * Math.min(1, dt * 1.5);
    }
    updateCamera(dt);
    sky.update(dt, skyLevel, camY, zoom);
    clouds.update(dt, camY, zoom, sky.cloudTint);
  }

  renderer.render(scene, camera);
});
