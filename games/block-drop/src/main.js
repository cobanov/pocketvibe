// Block Drop: a falling-block puzzle. Fill rows across the well to clear them.
// D-pad left/right moves, DOWN soft drops, UP hard drops, A/B rotate,
// L or R holds a piece, START pauses. Three modes: Marathon (endless, faster
// every 10 lines), Sprint (40 lines against the clock) and Dig (clear 10 rows
// of garbage against the clock).

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { COLS, DRAW_ROWS, cellX, cellY } from './shared.js';
import { DIG_ROWS, SPRINT_LINES, createGame } from './game.js';
import { createWell, LAYOUT } from './well.js';
import { createBackdrop } from './backdrop.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createSound } from './sound.js';

const DIST = 40; // camera distance from the well
const LOOK_Y = 0.55;
const PITCH = 0.045; // the camera looks slightly down on the blocks
// Width / height of the well and its side panels in the designed view, so
// narrower screens zoom out until all of it shows.
const BOARD_ASPECT = 1.3;
const SAVE_KEY = 'block-drop';
const MODE_KEY = 'block-drop.mode';
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD!'];
const SPIN_NAMES = ['', 'MINI T-SPIN', 'T-SPIN'];
const CLEAR_SOUNDS = ['', 'clear1', 'clear2', 'clear3', 'clear4'];
const MODES = ['marathon', 'sprint', 'dig'];
const MODE_NAMES = { marathon: 'Marathon', sprint: 'Sprint', dig: 'Dig' };
const MODE_INFO = {
  marathon: 'Endless, faster every 10 lines',
  sprint: `Clear ${SPRINT_LINES} lines against the clock`,
  dig: `Dig out ${DIG_ROWS} rows of garbage`,
};
const READY_SUB = { marathon: '', sprint: `${SPRINT_LINES} LINES`, dig: `${DIG_ROWS} ROWS` };
// The combo blip climbs B minor with every clear in a row (semitones above B).
const SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];
const HINT =
  '<div class="small">D-pad move · DOWN soft drop · UP hard drop</div>' +
  '<div class="small">A B rotate · L R hold · START pause</div>';

const hh = createHandheld({ clearColor: 0x2a2060 });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8a5ab0, 48, 92);

const camera = new THREE.PerspectiveCamera(32, hh.aspect, 1, 100);
hh.fitCamera(camera, { minAspect: BOARD_ASPECT });

// Only the drifting background blocks are lit; the well has baked shading.
scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a9a, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-4, 8, 6);
scene.add(sun);

const backdrop = createBackdrop(scene);
const well = createWell(scene);
const fx = createFx(scene);
const game = createGame();
const hud = createHud(hh.hud);
const sound = createSound(hh, {
  // Loaded in this order: the sounds of every piece first.
  sfx: [
    'shift', 'rotate', 'drop', 'lock', 'soft', 'hold', 'clear1', 'clear2', 'clear3', 'clear4', 'combo',
    'twist', 'tspin', 'b2b', 'allclear', 'levelup', 'deny', 'move', 'select', 'back', 'start', 'go',
    'pause', 'topout', 'gameover', 'finish', 'record', 'danger',
  ],
  music: 'theme',
});
const alarm = sound.loop('danger'); // a heartbeat while the stack nears the top

let state = 'title'; // title | play | paused | over
let menu = 'main'; // the title's menu: main | options
let sel = 0; // the highlighted entry of the menu on screen
let mode = hh.load(MODE_KEY, 'marathon');
if (!MODES.includes(mode)) mode = 'marathon';
let time = 0;
let shake = 0;
let kick = 0;
let overTime = 0;
let greyRows = 0;
let panelShown = false;
let won = false;
let record = false;
let sky = 1;
let lastSoft = 0;
let shownTenth = -1;
let timeText = '';
let shownLines = -1;
let linesText = '';
const saved = hh.load(SAVE_KEY, {});
// Marathon keeps the best score, Sprint and Dig the best time in seconds.
const best = { marathon: saved.best || 0, sprint: saved.sprint || 0, dig: saved.dig || 0 };

function placeCamera(yaw, pitch, jx, jy) {
  camera.position.set(Math.sin(yaw) * DIST + jx, LOOK_Y + Math.sin(pitch) * DIST + jy, Math.cos(yaw) * DIST);
  camera.lookAt(jx, LOOK_Y + jy, 0);
  camera.updateMatrixWorld();
}

// Places the HTML labels over the 3D panels, once, with the camera at rest.
function layoutHud() {
  placeCamera(0, PITCH, 0, 0);
  const v = new THREE.Vector3();
  const rect = (x0, x1, y) => {
    v.set(x0, y, 0).project(camera);
    const left = (v.x + 1) * 0.5 * hh.width;
    const top = (1 - v.y) * 0.5 * hh.height;
    v.set(x1, y, 0).project(camera);
    return { x: left, y: top, w: (v.x + 1) * 0.5 * hh.width - left };
  };
  hud.layout(
    rect(LAYOUT.hold.x0, LAYOUT.hold.x1, LAYOUT.hold.y1 - 0.1),
    rect(LAYOUT.next.x0, LAYOUT.next.x1, LAYOUT.next.y1 - 0.1),
    rect(LAYOUT.stats.x0, LAYOUT.stats.x1, LAYOUT.stats.y1 - 0.1),
    rect(LAYOUT.best.x0, LAYOUT.best.x1, LAYOUT.best.y1 - 0.1),
    rect(-5, 5, 5.5),
  );
}

// m:ss.t from tenths of a second.
function clock(tenths) {
  const m = Math.floor(tenths / 600);
  const s = Math.floor(tenths / 10) % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}.${tenths % 10}`;
}

function bestText(m) {
  if (!best[m]) return '';
  return m === 'marathon' ? String(best[m]) : clock(Math.floor(best[m] * 10));
}

function saveBest() {
  hh.save(SAVE_KEY, { best: best.marathon, sprint: best.sprint, dig: best.dig });
}

// A little random spread for repeated sounds, so they do not machine-gun.
function vary(k) {
  return 1 + (Math.random() * 2 - 1) * k;
}

// Sounds lean a little towards the side of the well they happen on.
function panAt(col) {
  return (col - (COLS - 1) / 2) * 0.06;
}

// The sky: Marathon changes it with the level, Sprint every 10 lines, Dig
// has its own.
function skyFor() {
  if (mode === 'marathon') return game.level;
  if (mode === 'sprint') return 2 + Math.floor(game.lines / 10);
  return 3;
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

function showTitle() {
  const head = '<div class="title">BLOCK DROP</div>';
  if (menu === 'main') {
    const m = MODES[sel];
    const info = m ? MODE_INFO[m] : 'Sound and music';
    let bestLine = '<div class="small">&nbsp;</div>';
    if (m) bestLine = best[m] ? `<div class="small gold">Best ${bestText(m)}</div>` : '<div class="small dim">No best yet</div>';
    hud.menu(head, [...MODES.map((k) => MODE_NAMES[k]), 'Options'], sel, `<div class="small info">${info}</div>${bestLine}${HINT}`);
  } else {
    hud.menu(head, [...optionItems(), 'Back'], sel, '<div class="small">A change · B back</div>');
  }
}

function showPause() {
  hud.menu('<div class="title">PAUSED</div>', ['Resume', ...optionItems(), 'Quit to title'], sel, '<div class="small">B or START resume</div>');
}

function toTitle() {
  state = 'title';
  menu = 'main';
  sel = MODES.indexOf(mode);
  game.decorate();
  well.reset();
  fx.clear();
  greyRows = 0;
  backdrop.theme(1, false);
  hud.showStats(false);
  hud.pause(false);
  sound.duck(false);
  showTitle();
}

function start(m) {
  mode = m;
  hh.save(MODE_KEY, m);
  state = 'play';
  game.start(m);
  well.reset();
  fx.clear();
  greyRows = 0;
  shownTenth = -1;
  shownLines = -1;
  sky = skyFor();
  backdrop.theme(sky, false);
  if (m === 'marathon') hud.labels('SCORE', 'LEVEL', 'LINES');
  else if (m === 'sprint') hud.labels('TIME', 'LINES', 'SCORE');
  else hud.labels('TIME', 'LEFT', 'LINES');
  hud.showStats(true);
  hud.pause(false);
  updateStats();
  hud.best(m === 'marathon' ? best.marathon : bestText(m) || '-');
  hud.message('');
  hud.popup('READY', READY_SUB[m], false);
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

// The stats panel; strings are only rebuilt when what they show changes.
function updateStats() {
  if (mode === 'marathon') {
    hud.stats(game.score, game.level, game.lines);
    // The best box counts along once the old record is beaten.
    hud.best(Math.max(best.marathon, game.score));
    return;
  }
  const tenth = Math.floor(game.time * 10);
  if (tenth !== shownTenth) {
    shownTenth = tenth;
    timeText = clock(tenth);
  }
  if (mode === 'sprint') {
    if (game.lines !== shownLines) {
      shownLines = game.lines;
      linesText = `${Math.min(game.lines, SPRINT_LINES)}/${SPRINT_LINES}`;
    }
    hud.stats(timeText, linesText, game.score);
  } else {
    hud.stats(timeText, game.left, game.lines);
  }
}

// The stack topped out: it turns grey from the bottom up, then the result shows.
function gameOver() {
  state = 'over';
  won = false;
  overTime = 0;
  greyRows = 0;
  panelShown = false;
  shake = 0.35;
  record = mode === 'marathon' && game.score > best.marathon;
  if (record) {
    best.marathon = game.score;
    saveBest();
  }
  sound.play('topout');
}

// Sprint or Dig done: confetti, then the time.
function finish() {
  state = 'over';
  won = true;
  overTime = 0;
  panelShown = false;
  record = !best[mode] || game.time < best[mode];
  if (record) {
    best[mode] = game.time;
    saveBest();
    hud.best(bestText(mode));
  }
  fx.confetti(cellX(0), cellX(COLS - 1), cellY(0));
  hud.popup('FINISH!', clock(Math.floor(game.time * 10)), true);
  sound.play('finish');
}

function showResult() {
  panelShown = true;
  const t = clock(Math.floor(game.time * 10));
  let html;
  if (won) {
    html =
      `<div class="title">${record ? 'NEW BEST!' : 'FINISHED!'}</div>` +
      `<div class="big">${t}</div>` +
      `<div class="small">${MODE_NAMES[mode]} · Best ${bestText(mode)}</div>` +
      `<div class="small">${game.pieces} ${game.pieces === 1 ? 'piece' : 'pieces'} · Score ${game.score}</div>`;
  } else if (mode === 'marathon') {
    html =
      `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div class="big">${game.score}</div>` +
      `<div class="small">Level ${game.level} · Lines ${game.lines} · Best ${best.marathon}</div>`;
  } else {
    const left = mode === 'sprint' ? `${game.lines} of ${SPRINT_LINES} lines` : `${game.left} ${game.left === 1 ? 'row' : 'rows'} left`;
    html =
      `<div class="title">GAME OVER</div>` +
      `<div>${left}</div>` +
      `<div class="small">Time ${t}${best[mode] ? ` · Best ${bestText(mode)}` : ''}</div>`;
  }
  hud.message(`${html}<div>A play again</div><div class="small">B title</div>`);
  sound.duck(true);
  if (record) sound.play('record');
  else if (!won) sound.play('gameover');
}

// Effects and sounds for what happened in the last game update.
function react() {
  const ev = game.ev;
  const pan = panAt(game.x + 1.5);
  if (ev.go) {
    hud.popup('GO!', '', true);
    sound.play('go');
  }
  if (ev.held) sound.play('hold', { rate: vary(0.02) });
  if (ev.denied) sound.play('deny');
  if (ev.shiftX !== 0) sound.play('shift', { volume: 0.8, rate: vary(0.04), pan });
  if (ev.rotated !== 0) {
    sound.play('rotate', { rate: (ev.rotated > 0 ? 1 : 0.94) * vary(0.02), pan });
    if (ev.twist) sound.play('twist', { delay: 0.02, pan });
  }
  if (ev.softRows > 0 && time - lastSoft > 0.055) {
    lastSoft = time;
    sound.play('soft', { rate: vary(0.03), pan });
  }
  if (ev.hardRows > 0) {
    shake = Math.max(shake, 0.14);
    kick = Math.min(0.35, 0.1 + ev.hardRows * 0.015);
    for (let i = 0; i < 4; i++) {
      const cell = ev.lockedCells[i];
      const col = cell % COLS;
      const row = (cell - col) / COLS;
      fx.dust(cellX(col), cellY(row), game.board[cell]);
    }
    sound.play('drop', { volume: Math.min(1, 0.65 + ev.hardRows * 0.02), rate: vary(0.03), pan });
  } else if (ev.locked) {
    sound.play('lock', { rate: vary(0.04), pan });
  }
  if (ev.cleared > 0) {
    const n = ev.cleared;
    shake = Math.max(shake, n === 4 ? 0.45 : 0.08 * n + (ev.tspin ? 0.1 : 0));
    // The tag line names what made the clear special, the main line the rows.
    let tag = ev.tspin ? SPIN_NAMES[ev.tspin] : '';
    if (ev.backToBack) tag = tag ? `B2B ${tag}` : 'BACK TO BACK';
    let main = CLEAR_NAMES[n];
    let sub = `+${ev.points}`;
    if (ev.allClear) {
      tag = tag ? `${tag} ${main}` : main;
      main = 'ALL CLEAR!';
    }
    if (ev.levelUp) sub = `LEVEL ${game.level}!`;
    else if (game.combo > 0) sub = `COMBO ${game.combo}  +${ev.points}`;
    hud.popup(main, sub, n === 4 || ev.tspin > 0 || ev.allClear, tag);
    sound.play(CLEAR_SOUNDS[n]);
    if (ev.tspin) sound.play('tspin', { delay: 0.05 });
    if (game.combo > 0) sound.play('combo', { delay: 0.12, rate: 2 ** (SCALE[Math.min(game.combo, SCALE.length) - 1] / 12) });
    if (ev.backToBack) sound.play('b2b', { delay: 0.18 });
    if (ev.allClear) sound.play('allclear', { delay: 0.3 });
    if (ev.levelUp) {
      sound.play('levelup', { delay: 0.35 });
      hud.bump(1);
    }
    const s = skyFor();
    if (s !== sky) {
      sky = s;
      backdrop.theme(sky, false);
    }
  } else if (ev.tspin) {
    hud.popup('T-SPIN', `+${ev.points}`, true, ev.tspin === 1 ? 'MINI' : '');
    sound.play('tspin');
  }
  if (ev.collapsed) {
    const power = 0.6 + game.clearCount * 0.25;
    for (let i = 0; i < game.clearCount; i++) {
      const y = cellY(game.clearedRows[i]);
      for (let c = 0; c < COLS; c++) fx.burst(cellX(c), y, game.clearedTypes[i * COLS + c], power);
    }
  }
}

// Compile every material and upload every texture now, with one of each
// kind of object in the scene (empty instance pools included), so nothing
// stalls the first time it shows during play.
function warmUp() {
  scene.traverse((o) => {
    if (o.material?.map) renderer.initTexture(o.material.map);
  });
  placeCamera(0, PITCH, 0, 0);
  renderer.compile(scene, camera);
}

layoutHud();
backdrop.theme(1, true);
toTitle();
sound.startMusic(); // plays from the title on, once loaded and allowed
warmUp();

hh.run((dt) => {
  const paused = state === 'paused';
  if (!paused) time += dt;

  if (state === 'title') {
    if (menu === 'main') {
      if (menuMove(4)) showTitle();
      // START plays the highlighted mode (or the last one, from Options).
      else if (input.pressed('START')) start(MODES[sel] ?? mode);
      else if (input.pressed('A')) {
        if (sel < MODES.length) start(MODES[sel]);
        else {
          menu = 'options';
          sel = 0;
          sound.play('select');
          showTitle();
        }
      }
    } else if (input.pressed('B') || (sel === 2 && input.pressed('A'))) {
      menu = 'main';
      sel = MODES.length;
      sound.play('back');
      showTitle();
    } else if (menuMove(3)) showTitle();
    else if (sel < 2 && flipPressed()) {
      toggle(sel);
      showTitle();
    }
  } else if (state === 'play') {
    if (input.pressed('START')) pause();
    else {
      game.update(dt, input);
      react();
      updateStats();
      if (game.phase === 'dead') gameOver();
      else if (game.phase === 'done') finish();
    }
  } else if (state === 'paused') {
    if (input.pressed('START') || input.pressed('B') || (sel === 0 && input.pressed('A'))) resume();
    else if (menuMove(4)) showPause();
    else if ((sel === 1 || sel === 2) && flipPressed()) {
      toggle(sel - 1);
      showPause();
    } else if (sel === 3 && input.pressed('A')) {
      sound.play('back');
      toTitle();
    }
  } else if (state === 'over') {
    overTime += dt;
    // A lost stack turns grey from the bottom up, then the result appears.
    if (!won) greyRows = Math.min(DRAW_ROWS, overTime * 34);
    if (!panelShown && overTime > (won ? 1.4 : 0.75)) showResult();
    else if (panelShown && input.pressed('A')) start(mode);
    else if (panelShown && input.pressed('B')) {
      sound.play('back');
      toTitle();
    }
  }

  // The heartbeat follows how close the stack is to the top.
  const d = state === 'play' && game.phase !== 'ready' ? well.danger : 0;
  alarm.set(d * 0.6, 1 + d * 0.08);

  // While paused everything stays frozen.
  if (!paused) {
    well.update(dt, game, greyRows);
    fx.update(dt);
    backdrop.update(dt);

    // Gentle sway, a shake on impacts and a short dip on hard drops.
    shake = Math.max(0, shake - dt);
    kick *= Math.exp(-dt * 14);
    const j = shake * shake * 3;
    placeCamera(
      Math.sin(time * 0.31) * 0.03,
      PITCH + Math.sin(time * 0.23) * 0.012,
      (Math.random() - 0.5) * j,
      (Math.random() - 0.5) * j + kick,
    );
  }

  renderer.render(scene, camera);
});
