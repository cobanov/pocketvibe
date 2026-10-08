// Turbo Circuit: an arcade lap racer. Four circuits, three rivals.
// A accelerates, B brakes and reverses, D-pad left/right steers, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { KMH, SKY, TOP_SPEED, angleDiff, formatTime, ordinal } from './shared.js';
import { createWorlds } from './world.js';
import { createFx } from './fx.js';
import { CAR_COLORS, createRace } from './race.js';
import { SURFACE_GRASS } from './car.js';
import { createHud, trackSvg } from './hud.js';
import { createSound } from './sound.js';
import { createRaceAudio } from './audio.js';

const COUNTDOWN = 3; // seconds of 3-2-1 before GO
const FINISH_GRACE = 40; // seconds left to finish once the winner is home
const RESULTS_DELAY = 1.6; // the FINISH banner plays before the results
const START_BOOST = 1.0; // seconds of turbo for pressing A on "1"
const SAVE_KEY = 'turbo-circuit';

const SFX = [
  'engine', 'screech', 'offroad', 'rumble', // loops
  'boost', 'cone', 'bump', 'wall', 'beep', 'go', 'lap', 'final', 'win', 'podium', 'lose',
  'record', 'overtake', 'warn', 'tick', 'move', 'select', 'back', 'shift', 'pause',
];

const hh = createHandheld({ clearColor: SKY });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 60, 140); // each circuit sets its own color and distances

const camera = new THREE.PerspectiveCamera(64, hh.aspect, 0.3, 160);
hh.fitCamera(camera);
const lookAt = new THREE.Vector3();

const hemi = new THREE.HemisphereLight(0xffffff, 0x5a7a4a, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(30, 60, 20);
scene.add(sun);

const worlds = createWorlds(scene, { hemi, sun, camera, renderer });
const fx = createFx(scene);
const race = createRace(scene, fx);
const hud = createHud(hh.hud, CAR_COLORS, hh.second);
const sound = createSound(hh, { sfx: SFX, music: 'theme' });
const raceAudio = createRaceAudio(sound);
const { player, events } = race;

// Saved: the last circuit and each circuit's best race and best lap.
const saved = hh.load(SAVE_KEY, {});
const records = saved.records ?? {};
for (const w of worlds.list) records[w.def.id] ??= { race: 0, lap: 0 };
if (saved.best && !records.sunny.race) records.sunny.race = saved.best; // 1.2.0 kept one best time
let world = worlds.list.find((w) => w.def.id === saved.circuit) ?? worlds.list[0];

function store() {
  hh.save(SAVE_KEY, { circuit: world.def.id, records });
}

let state = 'title'; // title | options | countdown | race | paused | finish
let pausedFrom = 'race';
let menu = 0; // the highlighted menu entry
let countdown = 0;
let stateTime = 0;
let time = 0;
let finishLeft = 0;
let finishSecs = -1;
let finishText = '';
let wrongWay = 0;
let shake = 0;
let speedTimer = 0;
let dnf = false;
let resultsShown = false;
let resultsFinishes = 0;
let raceRecord = false;
let lapRecord = false;
let revAt = -1; // countdown left when A went down on the grid, -1 when not held
let lastPlace = 4;
let wallCooldown = 0;
let bumpCooldown = 0;
const places = new Int8Array(4);

// Chase camera: its yaw trails the car's heading, distance and field of view
// grow with speed.
let camYaw = 0;
let camDist = 7;
let camHeight = 3;
let fov = 64;
let fittedFov = 64; // the designed fov the camera was last fitted to

const HINT = 'A gas · B brake · D-pad steer · START pause';
const miniMaps = new Map();

function selectWorld(w) {
  world = w;
  worlds.select(w);
  race.setWorld(w);
  hud.setTrack(w.track, w.def.name, w.def.laps);
}

function onOff(on) {
  return on ? 'ON' : 'OFF';
}

function items(list) {
  return `<div class="menu">${list.map((t, i) => `<div class="item${i === menu ? ' sel' : ''}">${t}</div>`).join('')}</div>`;
}

function recordText(r) {
  if (r.race > 0) return `Best ${formatTime(r.race)}${r.lap > 0 ? ` · Lap ${formatTime(r.lap)}` : ''}`;
  return r.lap > 0 ? `Best lap ${formatTime(r.lap)}` : 'No record yet';
}

// The menus are HTML strings rebuilt only when something on them changes.
function render() {
  const d = world.def;
  if (state === 'title') {
    if (!miniMaps.has(world)) miniMaps.set(world, trackSvg(world.track, 104, 7));
    hud.message(
      `<div class="title">TURBO <span>CIRCUIT</span></div>` +
        `<div class="card">${miniMaps.get(world)}<div class="about">` +
        `<div class="cname"><b>◀</b>${d.name.toUpperCase()}<b>▶</b></div>` +
        `<div class="small">${d.tag}</div>` +
        `<div class="small">${d.laps} laps · ${world.km.toFixed(1)} km · ${world.index + 1}/${worlds.list.length}</div>` +
        `<div class="small rec">${recordText(records[d.id])}</div>` +
        `</div></div>` +
        items(['RACE', 'OPTIONS']) +
        `<div class="small">D-pad ◀ ▶ circuit · A select</div>`,
    );
    const r = records[d.id];
    hud.info(
      `<div class="tag">${d.tag}</div><div class="small">${d.laps} laps · ${world.km.toFixed(1)} km</div>` +
        `<div class="rec"><span>BEST RACE</span><b>${r.race > 0 ? formatTime(r.race) : '--'}</b></div>` +
        `<div class="rec"><span>BEST LAP</span><b>${r.lap > 0 ? formatTime(r.lap) : '--'}</b></div>`,
    );
  } else if (state === 'options') {
    hud.message(
      `<div class="title">OPTIONS</div>` +
        items([`SOUND: ${onOff(sound.sfxOn)}`, `MUSIC: ${onOff(sound.musicOn)}`, 'BACK']) +
        `<div class="small">A change · B back</div>`,
    );
  } else if (state === 'paused') {
    hud.message(
      `<div class="title">PAUSED</div>` +
        items(['RESUME', `SOUND: ${onOff(sound.sfxOn)}`, `MUSIC: ${onOff(sound.musicOn)}`, 'QUIT TO TITLE']) +
        `<div class="small">A select · B resume</div>`,
    );
  } else if (state === 'finish' && resultsShown) {
    hud.message(resultsHtml());
  }
}

// Standings, times and records after the race. Rivals still out on track
// get their time when they cross the line.
function resultsHtml() {
  const r = records[world.def.id];
  let head;
  if (dnf) head = `<div class="title">TIME UP</div><div class="small">The winner was home ${FINISH_GRACE} seconds ago</div>`;
  else head = `<div class="title place${player.place}">${player.place === 1 ? 'YOU WIN!' : `${ordinal(player.place).toUpperCase()} PLACE`}</div>`;
  const order = race.cars.slice().sort((a, b) => race.placeOf(a) - race.placeOf(b));
  let rows = '';
  for (let k = 0; k < order.length; k++) {
    const car = order[k];
    const c = CAR_COLORS[car.index];
    const right = car.finished ? formatTime(car.finishTime) : car.isPlayer ? 'DNF' : '--';
    rows += `<div class="row${car.isPlayer ? ' me' : ''}"><b>${k + 1}</b><i style="background:${c.css}"></i><span>${c.name}</span><em>${right}</em></div>`;
  }
  const time = dnf ? '' : `<div>Time ${formatTime(player.finishTime)}${raceRecord ? ' <em>NEW RECORD!</em>' : ''}</div>`;
  let lap = player.bestLap > 0 ? `Best lap ${formatTime(player.bestLap)}${lapRecord ? ' <em>LAP RECORD</em>' : ''}` : '';
  // The circuit's records, unless this race just set both.
  if (!(raceRecord && lapRecord)) lap += `${lap ? ' · ' : ''}Records ${r.race > 0 ? formatTime(r.race) : '--'} / ${r.lap > 0 ? formatTime(r.lap) : '--'}`;
  return head + `<div class="table">${rows}</div>` + time + `<div class="small">${lap}</div>` + items(['RACE AGAIN', 'NEXT CIRCUIT', 'TITLE']);
}

function toTitle() {
  state = 'title';
  menu = 0;
  race.reset();
  hud.reset();
  hud.showStats(false);
  hud.lapTime('');
  sound.duck(false);
  render();
}

function start() {
  state = 'countdown';
  countdown = COUNTDOWN + 0.7; // a short beat before "3"
  stateTime = 0;
  finishLeft = FINISH_GRACE;
  finishSecs = -1;
  wrongWay = 0;
  dnf = false;
  resultsShown = false;
  raceRecord = lapRecord = false;
  revAt = -1;
  lastPlace = 4;
  race.reset();
  hud.reset();
  hud.showStats(true);
  hud.message('');
  hud.place(race.placeOf(player));
  hud.lap(1);
  hud.time(0);
  hud.speed(0, false);
  sound.duck(false);
  // Start high above the grid and swoop down behind the car.
  camYaw = player.heading;
  camDist = 18;
  camHeight = 11;
}

function pause() {
  pausedFrom = state;
  state = 'paused';
  menu = 0;
  sound.play('pause');
  sound.duck(true);
  render();
}

function resume() {
  state = pausedFrom;
  hud.message('');
  sound.duck(false);
}

function finish(timeUp) {
  state = 'finish';
  stateTime = 0;
  dnf = timeUp;
  resultsShown = false;
  hud.alert('');
  hud.banner(timeUp ? 'TIME UP' : 'FINISH!', timeUp ? 'final' : 'finish');
  shake = Math.max(shake, 0.25);
  const place = player.place;
  sound.play(timeUp || place === 4 ? 'lose' : place === 1 ? 'win' : 'podium');
  if (!timeUp) {
    const r = records[world.def.id];
    raceRecord = r.race === 0 || player.finishTime < r.race;
    if (raceRecord) {
      r.race = player.finishTime;
      store();
    }
  }
}

function showResults() {
  resultsShown = true;
  resultsFinishes = race.finishCount;
  menu = 0;
  // On two screens the second keeps the standings, which fill in as the
  // rivals finish; one screen hides the stats under the results.
  if (!hh.second) hud.showStats(false);
  hud.lapTime('');
  sound.duck(true);
  if (raceRecord) sound.play('record');
  render();
}

// Warnings under the stats: driving the wrong way, or the time left to
// finish once the winner is home.
function updateAlert(dt) {
  const t = world.track;
  const i = player.idx;
  const backwards = player.fx * t.tx[i] + player.fz * t.tz[i] < -0.3 && player.fwd > 3;
  wrongWay = backwards ? wrongWay + dt : 0;
  if (wrongWay > 1) {
    if (wrongWay - dt <= 1) sound.play('warn');
    hud.alert('WRONG WAY');
  } else if (race.leaderFinished() && !player.finished) {
    const secs = Math.ceil(finishLeft);
    if (secs !== finishSecs) {
      finishSecs = secs;
      finishText = `FINISH IN ${secs}`;
      if (secs <= 10) sound.play('tick', { rate: secs <= 3 ? 1.12 : 1 });
    }
    hud.alert(finishText);
  } else {
    hud.alert('');
  }
}

// What happened this frame, turned into feel: shake, banners and sounds.
function react(dt) {
  wallCooldown -= dt;
  bumpCooldown -= dt;
  const vary = 0.96 + Math.random() * 0.08;
  // Cars pushing against each other touch on many frames in a row: one
  // bump sound for a hit, not one per frame.
  if (events.bump > 2) {
    shake = Math.max(shake, Math.min(0.35, events.bump * 0.03));
    if (bumpCooldown <= 0) {
      bumpCooldown = 0.18;
      sound.play('bump', { volume: Math.min(1, 0.35 + events.bump / 14), rate: vary });
    }
  } else if (events.near > 3 && events.nearDist < 40 && bumpCooldown <= 0) {
    bumpCooldown = 0.18;
    sound.play('bump', { volume: Math.min(0.6, events.near / 20) * (1 - events.nearDist / 40), rate: vary * 0.9 });
  }
  if (events.wall > 3) {
    shake = Math.max(shake, Math.min(0.3, events.wall * 0.025));
    if (wallCooldown <= 0) {
      wallCooldown = 0.25;
      sound.play('wall', { volume: Math.min(1, 0.3 + events.wall / 16), rate: vary });
    }
  }
  if (events.cones > 0) {
    shake = Math.max(shake, 0.12);
    sound.play('cone', { rate: vary });
  }
  if (events.boost) {
    shake = Math.max(shake, 0.12);
    hud.banner('TURBO!', 'boost');
    sound.play('boost', { rate: vary });
  }
  if (events.lap > 0) {
    const laps = race.laps;
    const r = records[world.def.id];
    let cls = player.bestLap === events.lapTime && events.lap > 1 ? 'best' : '';
    let text = formatTime(events.lapTime);
    if (r.lap === 0 || events.lapTime < r.lap) {
      r.lap = events.lapTime;
      lapRecord = true;
      cls = 'record';
      text += ' LAP RECORD';
      store();
    }
    if (events.lap < laps) {
      const last = events.lap === laps - 1;
      hud.banner(last ? 'FINAL LAP' : `LAP ${events.lap + 1}`, last ? 'final' : 'lap');
      sound.play(last ? 'final' : 'lap');
    }
    hud.lapTime(text, cls);
  }
  const place = race.placeOf(player);
  if (place < lastPlace) sound.play('overtake', { rate: 1 + (4 - place) * 0.06 });
  lastPlace = place;
  if (player.surface === SURFACE_GRASS && player.fwd > 8) shake = Math.max(shake, 0.05);
}

function chaseCamera(dt, rate) {
  const car = player;
  camYaw += angleDiff(car.heading, camYaw) * Math.min(1, dt * 4.5);
  const k = Math.max(0, Math.min(1.3, car.fwd / TOP_SPEED));
  const f = Math.min(1, dt * rate);
  camDist += (6.6 + k * 1.6 - camDist) * f;
  camHeight += (2.6 + k * 0.5 - camHeight) * f;
  const sx = Math.sin(camYaw);
  const sz = Math.cos(camYaw);
  camera.position.set(car.x - sx * camDist, camHeight, car.z - sz * camDist);
  lookAt.set(car.x + sx * 5, 1.0, car.z + sz * 5);
  return 62 + k * 10 + (car.boost > 0 ? 7 : 0);
}

function titleCamera() {
  // A slow orbit around the player's car while it drives itself.
  const a = time * 0.3;
  camera.position.set(player.x + Math.sin(a) * 9, 3.4, player.z + Math.cos(a) * 9);
  lookAt.set(player.x, 0.9, player.z);
  return 58;
}

// Menu cursor: UP and DOWN wrap around `count` entries.
function navigate(count) {
  const dir = input.pressed('UP') ? -1 : input.pressed('DOWN') ? 1 : 0;
  if (!dir) return false;
  menu = (menu + dir + count) % count;
  sound.play('move');
  render();
  return true;
}

function toggleSfx() {
  sound.setSfx(!sound.sfxOn);
  sound.play('select');
  render();
}

function toggleMusic() {
  sound.setMusic(!sound.musicOn);
  sound.play('select');
  render();
}

function titleInput() {
  const step = input.pressed('LEFT') ? -1 : input.pressed('RIGHT') ? 1 : 0;
  if (step) {
    const list = worlds.list;
    selectWorld(list[(world.index + step + list.length) % list.length]);
    store();
    race.reset();
    sound.play('shift', { rate: step > 0 ? 1.06 : 0.94 });
    render();
    return;
  }
  if (navigate(2)) return;
  if (input.pressed('START') || (input.pressed('A') && menu === 0)) {
    sound.play('select');
    start();
  } else if (input.pressed('A')) {
    sound.play('select');
    state = 'options';
    menu = 0;
    render();
  }
}

function optionsInput() {
  if (navigate(3)) return;
  if (input.pressed('B') || (input.pressed('A') && menu === 2)) {
    sound.play('back');
    state = 'title';
    menu = 1;
    render();
  } else if (input.pressed('A')) {
    if (menu === 0) toggleSfx();
    else toggleMusic();
  }
}

function pausedInput() {
  if (navigate(4)) return;
  if (input.pressed('START') || input.pressed('B') || (input.pressed('A') && menu === 0)) {
    sound.play('back');
    resume();
  } else if (input.pressed('A')) {
    if (menu === 1) toggleSfx();
    else if (menu === 2) toggleMusic();
    else {
      sound.play('back');
      toTitle();
    }
  }
}

function resultsInput() {
  if (navigate(3)) return;
  if (input.pressed('B') || (input.pressed('A') && menu === 2)) {
    sound.play('back');
    toTitle();
  } else if (input.pressed('A') || input.pressed('START')) {
    sound.play('select');
    if (menu === 1) {
      selectWorld(worlds.list[(world.index + 1) % worlds.list.length]);
      store();
    }
    start();
  }
}

selectWorld(world);
toTitle();

// Compile every material and upload every circuit's geometry and textures
// now, while loading, so nothing stalls the first time it comes into view.
renderer.compile(scene, camera);
worlds.warm(() => {
  const t = worlds.current.track;
  camera.position.set(t.px[0], 30, t.pz[0]);
  camera.lookAt(t.px[0] + 1, 0, t.pz[0]);
  renderer.render(scene, camera);
});
selectWorld(world);
race.reset();
sound.startMusic();

hh.run((dt) => {
  time += dt;
  stateTime += dt;
  let targetFov = 64;
  let level = 0; // engine sounds

  if (state === 'title' || state === 'options') {
    race.update(dt, input, 'attract');
    targetFov = titleCamera();
    if (state === 'title') titleInput();
    else optionsInput();
  } else if (state === 'countdown') {
    if (input.pressed('START')) {
      pause();
    } else {
      // Revving on the grid: A pressed during "1" and held to GO is a
      // turbo start; pressing too early wins nothing.
      if (input.pressed('A')) revAt = countdown;
      if (!input.down('A')) revAt = -1;
      countdown -= dt;
      race.draw(dt);
      if (countdown <= COUNTDOWN && hud.count(Math.max(0, Math.ceil(countdown)))) {
        sound.play(countdown > 0 ? 'beep' : 'go');
      }
      if (countdown <= 0) {
        state = 'race';
        shake = 0.15;
        if (revAt > 0 && revAt <= 1) {
          race.launch(player, START_BOOST);
          hud.lapTime('GREAT START!', 'best');
          sound.play('boost');
        }
      }
    }
    targetFov = chaseCamera(dt, 2.2);
    level = 1;
  } else if (state === 'race') {
    if (input.pressed('START')) {
      pause();
    } else {
      race.update(dt, input, import.meta.env.DEV && window.__tc?.autopilot ? 'cruise' : 'race');
      react(dt);
      hud.place(race.placeOf(player));
      hud.lap(Math.max(1, Math.min(race.laps, player.laps + 1)));
      hud.time(race.clock);
      hud.best(player.bestLap);
      if (race.leaderFinished()) finishLeft -= dt;
      updateAlert(dt);
      if (events.finished) finish(false);
      else if (finishLeft <= 0) finish(true);
    }
    targetFov = chaseCamera(dt, 6);
    level = 1;
  } else if (state === 'paused') {
    pausedInput();
    targetFov = fov;
  } else if (state === 'finish') {
    race.update(dt, input, 'cruise');
    targetFov = chaseCamera(dt, 3);
    level = resultsShown ? 0.45 : 0.8;
    if (!resultsShown && stateTime > RESULTS_DELAY) showResults();
    else if (resultsShown && race.finishCount !== resultsFinishes) {
      resultsFinishes = race.finishCount;
      render();
    }
    if (resultsShown && stateTime > RESULTS_DELAY + 0.5) resultsInput();
  }

  if (state === 'race' || state === 'countdown' || state === 'finish' || (hh.second && state !== 'paused')) {
    hud.map(race.cars);
  }
  if (state === 'race' || state === 'countdown' || state === 'finish') {
    if (hh.second) {
      for (let i = 0; i < race.cars.length; i++) places[i] = race.placeOf(race.cars[i]);
      hud.standings(race.cars, places);
    }
    speedTimer -= dt;
    if (speedTimer <= 0) {
      speedTimer = 0.1;
      hud.speed(Math.round(Math.abs(player.fwd) * KMH), player.boost > 0);
    }
  }
  raceAudio.update(dt, race.cars, level, (state === 'countdown' || state === 'race') && input.down('A'));

  worlds.update(time);

  if (state !== 'paused') {
    fov += (targetFov - fov) * Math.min(1, dt * 4);
    if (Math.abs(fittedFov - fov) > 0.05) {
      fittedFov = fov;
      hh.fitCamera(camera, { fov });
    }
    shake = Math.max(0, shake - dt);
    const jitter = shake * 0.9;
    camera.position.x += (Math.random() - 0.5) * jitter;
    camera.position.y += (Math.random() - 0.5) * jitter;
    camera.position.z += (Math.random() - 0.5) * jitter;
    camera.lookAt(lookAt);
    worlds.follow(camera);
  }

  renderer.render(scene, camera);
});

if (import.meta.env.DEV) {
  // For headless checks: the scene, the race, the state, and an autopilot
  // that drives the player's car.
  window.__tc = { THREE, scene, camera, renderer, race, worlds, sound, hud, autopilot: false, get state() { return state; }, get world() { return world; } };
}
