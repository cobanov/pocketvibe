// Pole Star: sit back at the Pole Star Lounge and watch Stella dance her
// routine on the pole to a disco loop. A throws her a dollar whenever you
// like: the bill flutters onto the stage and she waves thanks. Make it rain
// and she breaks into her showpiece spin, and the money on the stage swirls
// up round the pole. No score, no timer: just the show.

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
const audio = createAudio();
const hud = createHud(hh.hud);
for (const t of [...club.textures, money.texture]) renderer.initTexture(t);

let paused = false;
let intro = true; // the title panel, until the first tip
let time = 0;
let beats = 0;
let beatShift = 0; // added to the music clock, so the routine runs on when the music starts
let musicOn = false;
let energy = 0;
const tipTimes = new Float32Array(RAIN).fill(-99);
let tipNext = 0;
let lastRain = -99;
let thanksAt = -1;
let thanksLine = 0;
let lastMove = '';
let lookY = 2.2;

const face = new THREE.Vector3();
const screen = new THREE.Vector3();
const target = new THREE.Vector3();

function tip() {
  money.toss();
  audio.sound('toss', 0.8);
  audio.sound('ching', 0.45);
  energy = Math.min(1, energy + ENERGY_TIP);
  if (thanksAt < 0) thanksAt = time + LAND;
  tipTimes[tipNext] = time;
  tipNext = (tipNext + 1) % RAIN;
  if (tipTimes.every((t) => time - t < RAIN_SPAN) && time - lastRain > SHOW_REST) {
    lastRain = time;
    dancer.showpiece();
  }
}

// Her thanks, floating up by her head.
function sayThanks() {
  dancer.thanks();
  dancer.face(face);
  screen.copy(face).project(camera);
  const x = clamp((screen.x + 1) * 0.5 * hh.width, 80, hh.width - 80);
  const y = clamp((1 - screen.y) * 0.5 * hh.height - 46, 60, hh.height - 90);
  hud.popup(THANKS[thanksLine++ % THANKS.length], x, y);
}

// The crowd follows the show: cheers for the big moves, a roar for the
// showpiece and applause when it ends.
function onMove(move) {
  if (move === 'tornado') {
    club.cheer(3);
    audio.sound('cheer', 1);
  } else if (lastMove === 'tornado') {
    audio.sound('applause', 0.8);
    club.cheer(2);
  } else if (BIG_MOVES.includes(move)) {
    club.cheer(1.4);
    audio.sound('cheer', 0.45);
  }
  lastMove = move;
}

function updateCamera(dt, lights) {
  const goalY = clamp(0.5 * dancer.hipsY() + 1.45, 2.15, 3.0) + (intro ? 0.75 : 0);
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

hud.intro(true);
dancer.reset(0);

// Compile every material while loading: a bill in front of the camera, and
// everything else is already in the scene.
money.showSample(new THREE.Vector3(0, 2, 5));
renderer.compile(scene, camera);
renderer.render(scene, camera);
money.clear();

hh.run((dt) => {
  // Desktop browsers only start sound after a key press.
  if (input.pressed('A') || input.pressed('START')) audio.unlock();

  if (paused) {
    if (input.pressed('START')) {
      paused = false;
      audio.resume();
      hud.pause(false);
      if (intro) hud.intro(true);
    }
    renderer.render(scene, camera);
    return;
  }
  if (input.pressed('START')) {
    paused = true;
    audio.pause();
    hud.pause(true);
    renderer.render(scene, camera);
    return;
  }

  time += dt;
  beats = audio.time(dt) / BEAT + beatShift;
  // The band starts as soon as it can; the routine carries on over the jump
  // in the clock, keeping its place in the bar.
  if (!musicOn && audio.ready && audio.live) {
    musicOn = true;
    const before = beats;
    audio.play();
    const start = audio.time(0) / BEAT;
    beatShift = Math.ceil((before - start) / 4) * 4;
    beats = start + beatShift;
    dancer.retime();
  }

  if (input.pressed('A')) {
    if (intro) {
      intro = false;
      hud.intro(false);
    }
    tip();
  }
  if (thanksAt >= 0 && time >= thanksAt) {
    thanksAt = -1;
    sayThanks();
  }

  energy = Math.max(0, energy - ENERGY_FADE * dt);
  const lights = dancer.spinning ? 1 : 0.3 + 0.7 * energy;
  audio.intensity(lights);

  dancer.update(dt, beats);
  if (dancer.move !== lastMove) onMove(dancer.move);
  money.update(dt, dancer.spinning);
  club.update(dt, beats, lights);
  updateCamera(dt, lights);
  renderer.render(scene, camera);
});
