// Pole Star: a very serious pole fitness show at the Pole Star Lounge,
// starring Sergio. A tips a dollar. Tips on the beat build a combo and the
// hype; the more hype, the bigger his moves, from a bored lean on the pole to
// the money-swirling tornado. Mash the button and the bills start hitting
// him in the face. The show lasts one song; the applause is the score.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BEAT, TIERS, clamp, pulse } from './shared.js';
import { createClub } from './club.js';
import { MOVE_BOW, createDancer } from './dancer.js';
import { createMoney } from './money.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const SHOW_BEATS = 36 * 4; // 36 bars at 120 bpm: 72 seconds
const FINALE = 3.4; // the bow and the applause before the results
// Seconds before and after a beat that count as on it. Late gets a little
// more: on the handheld the sound may come out after the clock says.
const EARLY = 0.1;
const LATE = 0.14;
const DECAY = 2; // hype lost per second, plus DECAY_K of the hype
const DECAY_K = 0.11;
const ON_GAIN = 2.5; // hype for a tip on the beat, plus ON_COMBO per combo step
const ON_COMBO = 0.4;
const COMBO_CAP = 14;
const OFF_GAIN = 0.3; // a tip off the beat still pleases him a little
const CLAP_GAIN = 1;
const BONK_AFTER = 3; // off-beat tips within BONK_SPAN seconds, and the next one hits him
const BONK_SPAN = 1.2;
const BONK_COOLDOWN = 2.5;
const BONK_HYPE = 6;
const TIER_POINTS = [1, 4, 10, 20, 35, 60]; // applause per beat in each tier
const DROP_MARGIN = 6; // hype must fall this far under a tier before he leaves it
// Applause for the 2nd to 5th star. Simulated shows: tipping on 70% of the
// beats scores about 1,200, 85% about 3,000, 93% about 6,000, every beat
// about 11,000.
const STARS = [1000, 2500, 5000, 8500];
const DEMO_CYCLE = 52; // seconds for the title demo to go from bored to tornado and back
const SAVE_KEY = 'pole-star';

const MC_UP = [
  [],
  ['He is walking! Look at him <b>WALK!</b>', 'The Stroll. Elegant. Timeless.'],
  ['<b>FIREMAN SPIN!</b> Stand back!', 'He is spinning! Somebody hold his drink!'],
  ['<b>THE FLAG!</b> Physics has left the building!', 'Is that even allowed?!'],
  ['<b>HELICOPTER!</b> Air traffic control is worried!', 'He is achieving lift!'],
  ['<b>TORNADO!</b> Hold on to your wallets!', 'THE MONEY IS SWIRLING!'],
];
// When he drops back to bored, and in time with his gags while he stays bored.
const MC_BORED = [
  'Sergio is thinking about his taxes.',
  'Sergio wonders if he left the oven on.',
  'Sergio is not impressed.',
  'Sergio is losing interest...',
];
const MC_GAG = ['Sergio checks his watch.', 'Sergio yawns. Loudly.', 'Sergio twirls his moustache. Waiting.'];
const MC_BONK = ['<b>BONK!</b> Easy there, cowboy!', 'Throw it, do not pitch it!', 'Sergio felt that one.', 'Tip to the beat, not to the face!'];
const MC_COMBO = { 10: 'What rhythm!', 25: 'Are you a metronome?!', 50: 'The crowd is in tears!', 100: 'One hundred on the beat. Legend.' };
const PHONE = [
  [10, 'BANK', 'Small purchases noticed. All good?'],
  [25, 'MOM', 'where are you'],
  [50, 'BANK', 'Is this really you?'],
  [80, 'MOM', 'why does your card say POLE STAR'],
  [120, 'BANK', 'We are not angry. Just worried.'],
  [160, 'LANDLORD', 'rent?'],
  [220, 'BANK', 'We have named a vault after you.'],
  [300, 'ACCOUNTANT', 'I quit.'],
  [400, 'BANK', 'Sergio is now our biggest client.'],
  [600, 'MOM', 'ok I am proud of you I guess'],
];
const REVIEWS = [
  'Sergio will pretend this never happened.',
  'Sergio says it was... a show.',
  'Sergio nods. Respect.',
  'Sergio dedicates his next spin to you.',
  'Sergio is crying. Art has been made.',
];

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
const dancer = createDancer(scene);
const money = createMoney(scene, camera);
const audio = createAudio();
const hud = createHud(hh.hud);
for (const t of [...club.textures, money.texture]) renderer.initTexture(t);

let state = 'title'; // title | starting | play | paused | finale | over
let stateT = 0;
let time = 0;
let songT = 0;
let beats = 0;
let lastBeat = -1;
let hype = 0;
let peak = 0; // the highest hype since the last beat
let tier = 0;
let combo = 0;
let bestCombo = 0;
let tab = 0;
let applause = 0;
let topTier = 0;
let tippedBeat = -99; // the beat already tipped on (one tip per beat counts)
let clappedBeat = -99;
const offTimes = [-9, -9, -9];
let offNext = 0;
let lastBonk = -9;
let phoneNext = 0;
let mcUp = 0;
let mcBored = 0;
let mcBonk = 0;
let shake = 0;
let record = false;
let titleMusic = false;
let saved = hh.load(SAVE_KEY, null) || {};
let best = saved.best || 0;

// The camera's goals, eased.
let lookY = 2.2;
let camX = 0;

const face = new THREE.Vector3();
const screen = new THREE.Vector3();
const target = new THREE.Vector3();

function tierFor(h) {
  let t = 0;
  for (let i = 1; i < TIERS.length; i++) if (h >= TIERS[i].from) t = i;
  return t;
}

// Floating text over Sergio's head.
function popupAtFace(text, cls, dy = -40) {
  dancer.face(face);
  screen.copy(face).project(camera);
  const x = clamp((screen.x + 1) * 0.5 * hh.width, 60, hh.width - 60);
  const y = clamp((1 - screen.y) * 0.5 * hh.height + dy, 90, hh.height - 120);
  hud.popup(text, x + (Math.random() - 0.5) * 40, y, cls);
}

function stars(score) {
  let n = 1;
  for (const s of STARS) if (score >= s) n++;
  return n;
}

function titleHtml() {
  return (
    `<div class="logo">POLE STAR</div>` +
    `<div class="tag">starring <b>SERGIO</b> · a very serious pole fitness show</div>` +
    `<div class="go">Press A to take your seat</div>` +
    `<div class="small">A tip $1 · tip on the beat for combos · B clap · START pause</div>` +
    (best > 0 ? `<div class="small gold">Best applause ${best.toLocaleString('en-US')}</div>` : '')
  );
}

function toTitle() {
  state = 'title';
  stateT = 0;
  hud.showPlay(false);
  hud.callout('');
  hud.phone('', '');
  hud.message(titleHtml(), 'top');
  money.clear();
  dancer.reset(0);
  hype = 0;
  tier = 0;
  titleMusic = false;
  audio.stop(0.3);
}

function start() {
  state = 'play';
  stateT = 0;
  hype = 0;
  peak = 0;
  tier = 0;
  combo = 0;
  bestCombo = 0;
  tab = 0;
  applause = 0;
  topTier = 0;
  tippedBeat = -99;
  clappedBeat = -99;
  offTimes.fill(-9);
  lastBonk = -9;
  phoneNext = 0;
  lastBeat = -1;
  money.clear();
  dancer.reset(0);
  audio.play();
  audio.intensity(0);
  hud.showPlay(true);
  hud.message('');
  hud.phone('', '');
  hud.tab(0);
  hud.applause(0);
  hud.combo(0);
  hud.hype(0, 0);
  hud.callout('Ladies and gentlemen... <b>SERGIO!</b>');
  audio.sound('cheer', 0.7);
  club.cheer(1.2);
}

function pause() {
  state = 'paused';
  audio.pause();
  hud.pause(true);
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B leave the show</div>`);
}

function resume() {
  state = 'play';
  audio.resume();
  hud.pause(false);
  hud.message('');
}

function setTier(next) {
  if (next === tier) return;
  const prev = tier;
  tier = next;
  audio.intensity(hype / 100);
  if (state !== 'play') return;
  if (next > prev) {
    if (next > topTier) topTier = next;
    const lines = MC_UP[next];
    hud.callout(lines[mcUp++ % lines.length], next === 5 ? 'hot' : '');
    audio.sound(next === 5 ? 'airhorn' : 'fanfare', 0.9);
    audio.sound('cheer', 0.5 + next * 0.1);
    club.cheer(1.6);
  } else if (next === 0 && prev >= 2) {
    hud.callout(MC_BORED[mcBored++ % MC_BORED.length], 'sad');
    audio.sound('sad', 0.8);
  } else if (next === 0) {
    hud.callout(MC_BORED[mcBored++ % MC_BORED.length], 'sad');
  }
}

// The hype decides the move; he only changes move on a beat, moves up when
// the hype reached a tier since the last beat (it dips between tips), and
// only drops to a lower one once the hype is clearly below it.
function updateTier() {
  const raw = tierFor(peak);
  if (raw > tier) setTier(raw);
  else if (raw < tier && hype < TIERS[tier].from - DROP_MARGIN) setTier(tierFor(hype + DROP_MARGIN));
  peak = hype;
}

function onBonk() {
  dancer.bonk();
  hype = Math.max(0, hype - BONK_HYPE);
  shake = 0.25;
  audio.sound('bonk');
  popupAtFace('BONK!', 'bad', -20);
  hud.callout(MC_BONK[mcBonk++ % MC_BONK.length], 'sad');
}

function tip() {
  const nearest = Math.round(beats);
  const off = (beats - nearest) * BEAT;
  const inWindow = off >= -EARLY && off <= LATE && nearest >= 0;
  tab++;
  audio.sound('toss', 0.8);
  if (inWindow && tippedBeat !== nearest) {
    // The combo counts beats in a row: a skipped beat starts it again.
    combo = tippedBeat === nearest - 1 ? combo + 1 : 1;
    tippedBeat = nearest;
    bestCombo = Math.max(bestCombo, combo);
    hype += ON_GAIN + ON_COMBO * Math.min(combo, COMBO_CAP);
    applause += Math.min(combo, 30);
    money.toss(true);
    audio.sound('ching', 0.7);
    hud.judge('ON BEAT!', 'gold');
    if (MC_COMBO[combo]) hud.callout(MC_COMBO[combo], 'hot');
    hud.press(true);
  } else {
    hype += OFF_GAIN;
    hud.press(false);
    if (inWindow) {
      // A second tip on a beat already tipped: nice, but no combo.
      money.toss(false);
    } else {
      if (combo >= 5) hud.judge('COMBO LOST', 'bad');
      else hud.judge(off < 0 ? 'EARLY' : 'LATE', 'dim');
      combo = 0;
      offTimes[offNext] = time;
      offNext = (offNext + 1) % offTimes.length;
      const spam = offTimes.every((t) => time - t < BONK_SPAN);
      if (spam && time - lastBonk > BONK_COOLDOWN) {
        lastBonk = time;
        dancer.face(face);
        money.tossAt(face, onBonk);
      } else money.toss(false);
    }
  }
  hype = Math.min(100, hype);
  hud.tab(tab);
  hud.combo(combo);
  hud.applause(applause);
  while (phoneNext < PHONE.length && tab >= PHONE[phoneNext][0]) {
    const [, from, text] = PHONE[phoneNext++];
    hud.phone(from, text);
  }
}

function clap() {
  audio.sound('clap', 0.8);
  const nearest = Math.round(beats);
  const off = (beats - nearest) * BEAT;
  if (off >= -EARLY && off <= LATE && clappedBeat !== nearest) {
    clappedBeat = nearest;
    hype = Math.min(100, hype + CLAP_GAIN);
  }
}

function finale() {
  state = 'finale';
  stateT = 0;
  audio.stop(0.05);
  audio.sound('sting');
  audio.sound('applause');
  club.cheer(FINALE + 1);
  hud.callout('Thank you! Sergio, everybody!');
  hud.combo(0);
  record = applause > best;
  if (record) best = applause;
  saved = {
    best,
    bestTab: Math.max(saved.bestTab || 0, tab),
    bestCombo: Math.max(saved.bestCombo || 0, bestCombo),
  };
  hh.save(SAVE_KEY, saved);
}

function showOver() {
  state = 'over';
  stateT = 0;
  hud.showPlay(false);
  hud.callout('');
  const n = stars(applause);
  hud.message(
    `<div class="title">${record ? 'NEW BEST SHOW!' : "SHOW'S OVER!"}</div>` +
      `<div class="stars">${'★'.repeat(n)}<span>${'★'.repeat(5 - n)}</span></div>` +
      `<div class="big">${applause.toLocaleString('en-US')}</div>` +
      `<div class="small">applause · best ${best.toLocaleString('en-US')}</div>` +
      `<div class="small">Your tab <b class="money">$${tab}</b> · Best combo ${bestCombo} · Top move ${TIERS[topTier].name}</div>` +
      `<div class="review">"${REVIEWS[n - 1]}"</div>` +
      `<div>Press A for another show</div>` +
      `<div class="small">B title</div>`,
  );
}

// The title demo: the hype rises to the tornado and falls back, with the
// crowd tipping on the beat, to show off every move.
let demoTipped = -1;
function updateDemo() {
  const k = (stateT % DEMO_CYCLE) / DEMO_CYCLE;
  const goal = k < 0.6 ? (k / 0.6) * 112 : (1 - (k - 0.6) / 0.4) * 112;
  hype = clamp(goal, 0, 100);
  peak = hype;
  const nearest = Math.floor(beats);
  if (nearest !== demoTipped && nearest >= 0) {
    demoTipped = nearest;
    if (Math.random() < 0.15 + hype / 160) money.toss(Math.random() < 0.5);
  }
  updateTier();
}

function updateCamera(dt) {
  const energy = hype / 100;
  // On the title the camera looks a little higher, so he stays under the panel.
  const lift = state === 'title' || state === 'starting' ? 0.75 : 0;
  const goalY = clamp(0.5 * dancer.hipsY() + 1.45, 2.15, 3.0) + lift;
  lookY += (goalY - lookY) * Math.min(1, dt * 1.6);
  camX = Math.sin(time * 0.31) * (0.15 + 0.35 * energy);
  shake = Math.max(0, shake - dt);
  camera.position.set(CAM.x + camX, CAM.y + (lookY - 2.2) * 0.4, CAM.z);
  target.set(camX * 0.3, lookY, 0);
  if (shake > 0) {
    target.x += (Math.random() - 0.5) * shake;
    target.y += (Math.random() - 0.5) * shake;
  }
  camera.lookAt(target);
  // A small punch-in on every beat once the show is hot.
  const fov = BASE_FOV * (1 - 0.014 * pulse(beats, 7) * Math.max(0, energy - 0.3));
  if (Math.abs(fov - camera.fov) > 0.001) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
}

toTitle();

// Compile every material while loading: a bill in front of the camera, and
// everything else is already in the scene.
money.showSample(new THREE.Vector3(0, 2, 5));
renderer.compile(scene, camera);
renderer.render(scene, camera);
money.clear();

hh.run((dt) => {
  time += dt;
  const paused = state === 'paused';
  if (!paused) {
    stateT += dt;
    songT = audio.time(dt);
    beats = songT / BEAT;
  }
  // Desktop browsers only start sound after a key press.
  if (input.pressed('A') || input.pressed('B') || input.pressed('START')) audio.unlock();

  if (state === 'title' || state === 'starting') {
    updateDemo();
    // The band plays on the title as soon as it can.
    if (!titleMusic && audio.ready && audio.live) {
      titleMusic = true;
      audio.play();
    }
    if (state === 'title' && (input.pressed('A') || input.pressed('START'))) {
      state = 'starting';
      stateT = 0;
      if (!audio.ready) hud.message(`<div class="title">ONE MOMENT</div><div>The band is tuning up...</div>`);
    }
    // Starts once the music is rendered and, in a desktop browser, the
    // press has woken the sound up (or it will not: then silently).
    if (state === 'starting' && audio.ready && (audio.live || stateT > 0.6)) start();
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else {
      if (input.pressed('A')) tip();
      if (input.pressed('B')) clap();
    }
    hype = Math.max(0, hype - (DECAY + DECAY_K * hype) * dt);
    peak = Math.max(peak, hype);
    if (beats >= SHOW_BEATS) finale();
  } else if (state === 'paused') {
    if (input.pressed('START')) resume();
    else if (input.pressed('B')) {
      hud.pause(false);
      audio.resume();
      toTitle();
    }
  } else if (state === 'finale') {
    hype = Math.max(0, hype - 30 * dt);
    if (stateT > FINALE) showOver();
  } else if (state === 'over') {
    if (stateT > 0.5 && input.pressed('A')) start();
    else if (stateT > 0.5 && input.pressed('B')) toTitle();
  }

  if (paused) {
    renderer.render(scene, camera);
    return;
  }

  // Once per beat: the ring on the A button, the applause, the move.
  const beat = Math.floor(beats);
  if (beat !== lastBeat && beats >= 0) {
    lastBeat = beat;
    if (state === 'play') {
      // A beat gone by without a tip ends the combo.
      if (combo > 0 && tippedBeat < beat - 1) {
        if (combo >= 5) hud.judge('COMBO LOST', 'bad');
        combo = 0;
        hud.combo(0);
      }
      updateTier();
      if (tier === 0 && beat % 16 === 7) hud.callout(MC_GAG[Math.floor(beat / 16) % MC_GAG.length], 'sad');
      applause += TIER_POINTS[tier];
      hud.applause(applause);
      hud.beat();
    }
  }
  if (state === 'play') {
    hud.hype(hype, tier);
    hud.progress(beats / SHOW_BEATS);
  }

  const move = state === 'finale' || state === 'over' ? MOVE_BOW : tier;
  dancer.update(dt, beats, move);
  money.update(dt, tier === 5 && state !== 'finale' && state !== 'over');
  club.update(dt, beats, hype, tier);
  updateCamera(dt);
  renderer.render(scene, camera);
});
