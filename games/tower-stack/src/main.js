// Tower Stack: drop sliding slabs onto the tower. Whatever hangs over the
// edge is sliced off, so the slabs get smaller unless the drops are perfect.
// A or UP drops, START pauses. Miss the tower completely and the run is over.
// Every 25 layers the sky moves on (golden hour, sunset, starry night...).

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { LH, SIZE, slabFrontGeometry, slabGeometry } from './shared.js';
import { createTower } from './tower.js';
import { CUT, MISS, PERFECT, createStack } from './stack.js';
import { createDebris } from './debris.js';
import { createFx } from './fx.js';
import { PHASE_LAYERS, createSky, phaseName } from './sky.js';
import { createClouds } from './clouds.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

// The slide speed eases from BASE_SPEED towards TOP_SPEED (units per second)
// as the tower grows, 63% of the way there after SPEED_LAYERS layers: about
// 4.1 at 25 layers, 4.9 at 50, 5.8 at 100. A linear ramp used to reach 7.4,
// a slab crossing the tower in under half a second.
const BASE_SPEED = 2.9;
const TOP_SPEED = 6.3;
const SPEED_LAYERS = 55;
const FAR_SIDE_FROM = 8; // from this height slabs sometimes come from the front
const FAR_SIDE_CHANCE = 0.3;
const STREAK = 5; // every fifth perfect drop in a row gets a flourish
const OVER_DELAY = 1.8; // the zoom out plays before the game-over panel
const SKIP_AFTER = 0.8; // from then on A shows the panel at once
// A press this soon after a slab appears is ignored while the slab is still
// clear of the tower (a double tap, a bouncy button): it could only miss.
const DROP_GUARD = 0.15;
const DEMO_SKIES = [30, 0, 62]; // sky offsets (in layers) for the demo runs
const SAVE_KEY = 'tower-stack';
// The perfect chime climbs F major with the streak (semitones above F5).
const CHIME = [0, 2, 4, 5, 7, 9, 11, 12];
const MARKER_BACK = 8; // the best-height line runs this far behind the tower

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
const BACK = new THREE.Vector3(-1, 0, -1).normalize(); // away from the camera, on the ground
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
const slabFront = slabFrontGeometry();
const tower = createTower(scene, slabFront);
const debris = createDebris(scene, slab);
const stack = createStack(scene, slabFront, tower, debris);
const fx = createFx(scene);
const sky = createSky(camera, SHOWN_W, SHOWN_H, scene.fog);
const clouds = createClouds(scene, COS_E, SIN_E, SHOWN_W, SHOWN_H);
const hud = createHud(hh.hud);
const sound = createSound(hh, {
  // Loaded in this order: the sounds of every drop first.
  sfx: ['drop', 'cut', 'perfect', 'move', 'select', 'back', 'start', 'pause', 'grow', 'streak', 'miss', 'gameover', 'record', 'best', 'milestone', 'wind'],
  music: 'theme',
});
const wind = sound.loop('wind'); // louder and higher the taller the tower

// The best run's height while climbing: a thin gold line across the screen
// behind the tower, facing the camera so it shows as a flat line (the HUD
// puts a tag on it at the right edge).
const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffe066, fog: false }));
marker.quaternion.copy(camera.quaternion);
marker.scale.set(SHOWN_W * 1.4, 0.07, 1);
scene.add(marker);

let state = 'title'; // title | play | paused | falling | over
let stateT = 0;
let score = 0;
let perfects = 0;
let topCombo = 0;
let record = false;
let best = hh.load(SAVE_KEY, null)?.best || 0;
let shake = 0;
let punch = 0; // a short zoom-in on perfect drops
let menu = 'main'; // the title's menu: main | options
let sel = 0; // the highlighted entry of the menu on screen

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
let camU = 0; // how far right of the tower's axis the view is centred
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
  return TOP_SPEED - (TOP_SPEED - BASE_SPEED) * Math.exp(-n / SPEED_LAYERS);
}

// A little random spread for repeated sounds, so they do not machine-gun.
function vary(k) {
  return 1 + (Math.random() * 2 - 1) * k;
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
    const streak = combo % STREAK === 0;
    if (streak) {
      // Every fifth in a row: a gold burst and a harder punch.
      fx.sparkle(r.x, base, r.z, r.w, r.d, 0xffe066, 26, 3.6);
      punch = Math.max(punch, 0.08);
    }
    if (loud) {
      const text = combo >= 2 ? `PERFECT ×${combo}` : 'PERFECT';
      popupAt(text, r.x, r.y + LH * 2, r.z, r.grew || streak);
    }
  } else if (kind === CUT) {
    tower.colorOf(tower.n, tmpColor);
    fx.dust(r.cutX, r.y, r.cutZ, tmpColor.getHex(), 9);
    shake = Math.max(shake, Math.min(0.12, r.cut * 0.1)); // a bigger slice, a harder knock
  }
}

// The sounds of a drop that landed: a thud that rises slowly with the tower,
// then the slice, or the perfect chime climbing F major with the streak.
function landSound(kind) {
  const r = stack.last;
  const lift = 1 + Math.min(0.3, tower.n * 0.0025);
  if (kind === PERFECT) {
    const combo = stack.combo;
    sound.play('drop', { volume: 0.7, rate: lift * vary(0.03) });
    sound.play('perfect', { rate: 2 ** (CHIME[Math.min(combo, CHIME.length) - 1] / 12) });
    if (r.grew) sound.play('grow', { delay: 0.08, rate: vary(0.03) });
    if (combo % STREAK === 0) sound.play('streak', { delay: 0.12 });
  } else {
    sound.play('drop', { rate: lift * vary(0.04) });
    sound.play('cut', { volume: 0.55 + Math.min(0.45, r.cut * 0.35), rate: vary(0.04), pan: r.side * 0.35 });
  }
}

// Menus. Entries are picked with A; the D-pad moves up and down, and LEFT /
// RIGHT also flip an On / Off entry.
function onOff(on) {
  return on ? 'On' : 'Off';
}

function optionItems() {
  return [`Sound: ${onOff(sound.sfxOn)}`, `Music: ${onOff(sound.musicOn)}`];
}

// Moves the highlight through n entries; true if it moved.
function menuMove(n) {
  const d = input.pressed('DOWN') - input.pressed('UP');
  if (!d) return false;
  sel = (sel + d + n) % n;
  sound.play('move');
  return true;
}

function flipPressed() {
  return input.pressed('A') || input.pressed('LEFT') || input.pressed('RIGHT');
}

// Sound effects (0) or music (1) on or off.
function toggle(which) {
  if (which === 0) sound.setSfx(!sound.sfxOn);
  else sound.setMusic(!sound.musicOn);
  sound.play('select');
}

function bestLine() {
  if (best <= 0) return '';
  const sky = phaseName(best);
  return `<div class="small">Best ${best}${sky ? ` · ${sky}` : ''}</div>`;
}

function showTitle() {
  const head = `<div class="title">${TITLE}</div>`;
  if (menu === 'main') {
    hud.menu(head, ['Play', 'Options'], sel, `<div class="small">${HINT}</div>${bestLine()}`, 'top');
  } else {
    hud.menu(head, [...optionItems(), 'Back'], sel, '<div class="small">A change · B back</div>', 'top');
  }
}

function showPause() {
  hud.menu('<div class="title">PAUSED</div>', ['Resume', ...optionItems(), 'Quit to title'], sel, '<div class="small">B or START resume</div>');
}

function toTitle() {
  state = 'title';
  stateT = 0;
  menu = 'main';
  sel = 0;
  hud.showStats(false);
  hud.callout('');
  showTitle();
  sound.duck(false);
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
  hud.markerText(`BEST ${best}`);
  hud.callout('');
  hud.message('');
  sound.duck(false);
  sound.play('start');
}

function pause() {
  state = 'paused';
  sel = 0;
  hud.pause(true);
  sound.duck(true);
  sound.play('pause');
  showPause();
}

function resume() {
  state = 'play';
  hud.pause(false);
  hud.message('');
  sound.duck(false);
  sound.play('select');
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
  landSound(kind);
  hud.score(score);
  if (best > 0 && score > best) hud.best('NEW BEST', true);
  if (score % PHASE_LAYERS === 0) {
    // The sky moves on: golden hour, sunset, starry night, midnight...
    hud.callout(phaseName(score).toUpperCase(), `${score} layers`);
    sound.play('milestone', { delay: 0.1 });
    fx.sparkle(tower.topX, tower.height, tower.topZ, tower.topW, tower.topD, 0xffe066, 30, 3.2);
  } else if (best > 0 && score === best + 1) {
    hud.callout('NEW BEST!');
    sound.play('best', { delay: 0.08 });
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
  sound.play('miss', { pan: stack.last.side * 0.3 });
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
  const sky = phaseName(score);
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big">${score}</div>` +
      `<div class="small">${score === 1 ? 'layer' : 'layers'} · Best ${best}</div>` +
      (sky ? `<div class="small sky">Sky: ${sky}</div>` : '') +
      `<div class="small">Perfect ${perfects} · Best streak ${topCombo}</div>` +
      `<div>A play again</div>` +
      `<div class="small">B title</div>`,
    'side',
  );
  sound.duck(true);
  sound.play(record ? 'record' : 'gameover');
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
  camU = target.dot(RIGHT);
}

// The best-height line and its tag, while climbing towards the best run.
function updateMarker() {
  const show = (state === 'play' || state === 'paused') && best > score;
  marker.visible = show;
  if (!show) {
    hud.marker(-1);
    return;
  }
  // Behind the tower and lowered by as much as that raises it on screen, so
  // it lines up with the top of a tower `best` layers tall.
  marker.position
    .set(tower.topX, best * LH - (MARKER_BACK * SIN_E) / COS_E, tower.topZ)
    .addScaledVector(BACK, MARKER_BACK);
  screenPos.copy(marker.position).project(camera);
  const y = (1 - screenPos.y) * 0.5 * hh.height;
  hud.marker(y > 30 && y < hh.height - 10 ? y : -1);
}

function updateWind() {
  let volume = 0;
  let rate = 1;
  if (state === 'play') {
    const k = Math.min(1, tower.n / 120);
    volume = 0.08 + 0.3 * k;
    rate = 0.85 + 0.3 * k;
  } else if (state === 'title') {
    volume = 0.08;
    rate = 0.9;
  } else if (state === 'falling' || state === 'over') {
    volume = 0.14;
    rate = 0.8;
  }
  wind.set(volume, rate);
}

toTitle();
sound.startMusic(); // plays from the title on, once loaded and allowed

// Compile every material now, while loading: the offcuts, rings, sparkles,
// stars, the shooting star and the best-height line are not drawn until
// later, and would stall the game the first time they show up.
renderer.compile(scene, camera);

hh.run((dt) => {
  const paused = state === 'paused';
  if (!paused) stateT += dt;

  if (state === 'title') {
    updateDemo(dt);
    if (menu === 'main') {
      if (input.pressed('START') || (sel === 0 && input.pressed('A'))) start();
      else if (menuMove(2)) showTitle();
      else if (input.pressed('A')) {
        menu = 'options';
        sel = 0;
        sound.play('select');
        showTitle();
      }
    } else if (input.pressed('B') || (sel === 2 && input.pressed('A'))) {
      menu = 'main';
      sel = 1;
      sound.play('back');
      showTitle();
    } else if (menuMove(3)) showTitle();
    else if (sel < 2 && flipPressed()) {
      toggle(sel);
      showTitle();
    }
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    // The drop happens where the slab was last drawn, on the frame the press
    // arrives. Only a press in a new slab's first moment, while it could
    // only miss, is ignored (see DROP_GUARD).
    else if ((input.pressed('A') || input.pressed('UP')) && !(stack.age < DROP_GUARD && stack.wouldMiss)) drop();
    else stack.update(dt);
  } else if (state === 'paused') {
    if (input.pressed('START') || input.pressed('B') || (sel === 0 && input.pressed('A'))) resume();
    else if (menuMove(4)) showPause();
    else if ((sel === 1 || sel === 2) && flipPressed()) {
      toggle(sel - 1);
      showPause();
    } else if (sel === 3 && input.pressed('A')) {
      sound.play('back');
      hud.pause(false);
      toTitle();
    }
  } else if (state === 'falling') {
    if (stateT > OVER_DELAY || (stateT > SKIP_AFTER && (input.pressed('A') || input.pressed('UP')))) showOver();
  } else if (state === 'over') {
    // A short beat so a button mashed while losing does not restart at once.
    if (stateT > 0.4 && (input.pressed('A') || input.pressed('UP'))) start();
    else if (stateT > 0.4 && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }
  updateWind();

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
    clouds.update(dt, camY, camU, zoom, sky.cloudTint);
  }
  updateMarker();

  renderer.render(scene, camera);
});
