// Pole Star: sit back at the Pole Star Lounge and watch Stella dance her
// routine on the pole to a disco loop. A throws her a dollar whenever you
// like: the bill flutters onto the stage and she waves thanks or blows you a
// kiss. Make it rain and she breaks into her showpiece spin, and the money
// on the stage swirls up round the pole. No score, no timer: just the show.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BEAT, clamp, pulse } from './shared.js';
import { createClub } from './club.js';
import { createDancer } from './dancer.js';
import { createMoney } from './money.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const RAIN = 6; // this many tips within RAIN_SPAN seconds make it rain
const RAIN_SPAN = 3;
const SHOW_REST = 8; // seconds between showpieces
const LAND = 0.6; // seconds from a throw to the bill landing, when she says thanks
const ENERGY_TIP = 0.1; // each tip lifts the lights, the crowd and the band
const ENERGY_FADE = 0.05; // per second
const BIG_MOVES = ['invert', 'flag']; // the crowd cheers when these begin
const THANKS = ['thank you!', 'thanks!', 'merci!', 'you are sweet!'];
const KISSES = ['mwah!', 'xoxo!'];
const TITLE =
  '<div class="logo">POLE STAR</div><div class="tag">starring <b>STELLA</b> · live at the Pole Star Lounge</div>';
const HINT = '<div class="small">A throw a dollar, as often as you like · START pause</div>';

const hh = createHandheld({ clearColor: 0x0a0612 });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0612, 13, 30);
const camera = new THREE.PerspectiveCamera(38, hh.width / hh.height, 0.3, 40);
hh.fitCamera(camera);
const BASE_FOV = camera.fov;
const CAM = new THREE.Vector3(0, 2.0, 7.4);

// Warm light from the front on the stage, pink and purple everywhere else.
scene.add(new THREE.HemisphereLight(0xff9ad8, 0x2a0c44, 1.25));
const key = new THREE.DirectionalLight(0xfff0dd, 1.7);
key.position.set(1.5, 6, 7);
scene.add(key);

const club = createClub(scene);
const dancer = createDancer(scene, camera);
const money = createMoney(scene, camera);
const audio = createAudio(hh);
const hud = createHud(hh.hud);
for (const t of [...club.textures, money.texture]) renderer.initTexture(t);

let state = 'title'; // title | show | paused
let menu = 'main'; // the title's menu: main | options
let sel = 0; // the highlighted entry of the menu on screen
let time = 0;
let beats = 0;
let energy = 0;
let lights = 0.3; // how lit up the club is, following the energy
const tipTimes = new Float32Array(RAIN).fill(-99);
let tipNext = 0;
let lastRain = -99;
let thanksAt = -1;
let thanksLine = 0;
let kissLine = 0;
let lastMove = '';
let lookY = 2.2;

const face = new THREE.Vector3();
const screen = new THREE.Vector3();
const target = new THREE.Vector3();

// A little random change of pitch, so repeated sounds do not drone.
function vary(amount) {
  return 1 + (Math.random() * 2 - 1) * amount;
}

function tip() {
  money.toss();
  audio.sound('toss', 0.7, vary(0.05));
  audio.sound('ching', 0.65, vary(0.04));
  energy = Math.min(1, energy + ENERGY_TIP);
  if (thanksAt < 0) thanksAt = time + LAND;
  tipTimes[tipNext] = time;
  tipNext = (tipNext + 1) % RAIN;
  let raining = time - lastRain > SHOW_REST;
  for (let i = 0; i < RAIN; i++) if (time - tipTimes[i] >= RAIN_SPAN) raining = false;
  if (raining && dancer.showpiece()) lastRain = time;
}

// Her thanks, floating up by her head: a wave or, now and then, a kiss.
function sayThanks() {
  const kiss = dancer.thanks() === 'kiss';
  dancer.face(face);
  screen.copy(face).project(camera);
  const x = clamp((screen.x + 1) * 0.5 * hh.width, 80, hh.width - 80);
  const y = clamp((1 - screen.y) * 0.5 * hh.height - 46, 60, hh.height - 90);
  hud.popup(kiss ? KISSES[kissLine++ % KISSES.length] : THANKS[thanksLine++ % THANKS.length], x, y);
}

// The crowd follows the show: cheers for the big moves, a roar for the
// showpiece and applause when it ends.
function onMove(move) {
  if (move === 'tornado') {
    club.cheer(3);
    audio.sound('cheer', 0.85);
  } else if (lastMove === 'tornado') {
    audio.sound('applause', 0.75);
    club.cheer(2);
  } else if (BIG_MOVES.includes(move)) {
    club.cheer(1.4);
    audio.sound('cheer', 0.4, vary(0.04));
  }
  lastMove = move;
}

function updateCamera(dt) {
  // Under the title the view rises, so she dances below the panel.
  const goalY = clamp(0.5 * dancer.hipsY() + 1.45, 2.15, 3.0) + (state === 'title' ? 0.75 : 0);
  lookY += (goalY - lookY) * Math.min(1, dt * 1.6);
  const sway = Math.sin(time * 0.31) * (0.15 + 0.3 * lights);
  camera.position.set(CAM.x + sway, CAM.y + (lookY - 2.2) * 0.4, CAM.z);
  target.set(sway * 0.3, lookY, 0);
  camera.lookAt(target);
  // A small punch-in on every beat when the club is buzzing.
  const fov = BASE_FOV * (1 - 0.012 * pulse(beats, 7) * Math.max(0, lights - 0.4));
  if (Math.abs(fov - camera.fov) > 0.001) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- menus
// Entries are picked with A; the D-pad moves up and down, and LEFT / RIGHT
// also flip an On / Off entry.

function onOff(on) {
  return on ? 'On' : 'Off';
}

function optionItems() {
  return [`Sound: ${onOff(audio.sfxOn)}`, `Music: ${onOff(audio.musicOn)}`];
}

// Moves the highlight through n entries; true if it moved.
function menuMove(n) {
  const d = input.pressed('DOWN') - input.pressed('UP');
  if (!d) return false;
  sel = (sel + d + n) % n;
  audio.sound('move', 1, vary(0.02));
  return true;
}

function flipPressed() {
  return input.pressed('A') || input.pressed('LEFT') || input.pressed('RIGHT');
}

// Sound effects (0) or music (1) on or off.
function toggle(which) {
  if (which === 0) audio.setSfx(!audio.sfxOn);
  else audio.setMusic(!audio.musicOn);
  audio.sound('select');
}

function showTitle() {
  if (menu === 'main') hud.menu(TITLE, ['Throw a dollar', 'Options'], sel, HINT, 'top');
  else hud.menu(TITLE, [...optionItems(), 'Back'], sel, '<div class="small">A change · B back</div>', 'top');
}

function showPause() {
  hud.menu('<div class="title">PAUSED</div>', ['Resume', ...optionItems(), 'Quit to title'], sel, '<div class="small">B or START resume</div>');
}

// The show goes on behind the title; the first dollar starts your evening.
function toTitle() {
  state = 'title';
  menu = 'main';
  sel = 0;
  hud.hint(false);
  showTitle();
}

function startShow() {
  state = 'show';
  hud.message('');
  hud.hint(true);
}

function pause() {
  state = 'paused';
  sel = 0;
  hud.pause(true);
  audio.pause();
  audio.sound('pause');
  showPause();
}

function resume() {
  state = 'show';
  hud.pause(false);
  hud.message('');
  audio.resume();
  audio.sound('select');
}

function updateTitle() {
  if (menu === 'main') {
    if (input.pressed('START')) {
      audio.sound('select');
      startShow();
    } else if (menuMove(2)) showTitle();
    else if (input.pressed('A')) {
      if (sel === 0) {
        startShow();
        tip();
      } else {
        menu = 'options';
        sel = 0;
        audio.sound('select');
        showTitle();
      }
    }
  } else if (input.pressed('B') || (sel === 2 && input.pressed('A'))) {
    menu = 'main';
    sel = 1;
    audio.sound('back');
    showTitle();
  } else if (menuMove(3)) showTitle();
  else if (sel < 2 && flipPressed()) {
    toggle(sel);
    showTitle();
  }
}

function updatePause() {
  if (input.pressed('START') || input.pressed('B') || (sel === 0 && input.pressed('A'))) resume();
  else if (menuMove(4)) showPause();
  else if ((sel === 1 || sel === 2) && flipPressed()) {
    toggle(sel - 1);
    showPause();
  } else if (sel === 3 && input.pressed('A')) {
    hud.pause(false);
    audio.resume();
    audio.sound('back');
    toTitle();
  }
}

// ---------------------------------------------------------------- the show

function advance(dt) {
  time += dt;
  // The band joins as soon as sound may play, on the next bar line.
  if (audio.canStart) audio.start();
  beats = audio.time() / BEAT;

  if (thanksAt >= 0 && time >= thanksAt) {
    thanksAt = -1;
    sayThanks();
  }

  energy = Math.max(0, energy - ENERGY_FADE * dt);
  // The lights flare up quickly and die down slowly.
  const goal = dancer.spinning ? 1 : 0.3 + 0.7 * energy;
  lights += (goal - lights) * Math.min(1, dt * (goal > lights ? 5 : 1.2));
  audio.intensity(lights);

  dancer.update(dt, beats);
  if (dancer.move !== lastMove) onMove(dancer.move);
  money.update(dt, dancer.spinning);
  club.update(dt, beats, lights);
  updateCamera(dt);
}

dancer.reset(0);
showTitle();

// Compile every material while loading: a bill in front of the camera, and
// everything else is already in the scene.
money.showSample(new THREE.Vector3(0, 2, 5));
renderer.compile(scene, camera);
renderer.render(scene, camera);
money.clear();

hh.run((dt) => {
  if (state === 'title') updateTitle();
  else if (state === 'show') {
    if (input.pressed('START')) pause();
    else if (input.pressed('A')) tip();
  } else updatePause();

  // While paused everything stands still, the dance's clock too.
  if (state !== 'paused') advance(dt);
  renderer.render(scene, camera);
});

if (import.meta.env.DEV) {
  // For headless checks: the game's parts and state, and the names of the
  // sounds played.
  window.__ps = {
    THREE, scene, camera, renderer, dancer, money, club, audio, hud, sounds: [],
    get state() { return state; },
    get beats() { return beats; },
    get lights() { return lights; },
    get energy() { return energy; },
    get time() { return time; },
  };
  const sound = audio.sound;
  audio.sound = (name, ...rest) => {
    window.__ps.sounds.push(name);
    sound(name, ...rest);
  };
}
