// Tile Merge: slide numbered tiles around a 4x4 board; two equal tiles that
// meet merge into their sum. Make a 2048, then keep going as long as the board
// has room. The D-pad slides, X undoes one move, START pauses. The game is
// saved after every move, so it can be continued from the title screen.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { BG, CELLS, DOWN, DX, DZ, LEFT, RIGHT, TILE_H, UP, cellX, cellZ } from './shared.js';
import { createGame } from './game.js';
import { createTiles } from './tiles.js';
import { createTable } from './table.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';

const SAVE_KEY = 'tile-merge';
const HINT = 'D-pad slide · X undo · START pause';
const DEMO_STEP = 0.36; // seconds between the title demo's moves
const DEMO_WARMUP = 140; // moves played unseen, so the title board looks lived-in
const DEMO_LIMIT = 10; // the demo starts over once it has made a 1024
const WIN_DELAY = 0.8; // the celebration plays before the message
const OVER_DELAY = 0.9; // the board turns grey before the message
const CONFETTI = [0xffc46b, 0xff8a6b, 0xf2d272, 0x8dcf80, 0x58bfae, 0xffffff];

// Play view: almost straight down with a slight tilt. The title view is
// lower and further out, slowly swinging around the table.
const CAM_Y = 9.45;
const CAM_Z = 4.75;
const LOOK_Z = 0.2;
const TITLE_Y = 12.5;
const TITLE_R = 9.6;
const TITLE_LOOK_Z = -2.0; // looks past the board, so it sits low under the title

const hh = createHandheld({ clearColor: BG });
const { renderer, input } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(BG, 17, 36);

const camera = new THREE.PerspectiveCamera(32, hh.width / hh.height, 1, 38);

// Only the table and its things are lit; the board and tiles have baked shading.
scene.add(new THREE.HemisphereLight(0xfff4e6, 0x9a6a4a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(-5, 10, 4);
scene.add(sun);

createTable(scene);
const tiles = createTiles(scene);
const fx = createFx(scene);
const hud = createHud(hh.hud);
const game = createGame(); // the player's game
const demo = createGame(); // the one that plays itself behind the title

let state = 'title'; // title | play | paused | won | over
let stateTime = 0;
let titleTime = 0;
let demoWait = 0;
let queued = -1; // a move pressed while the tiles were still sliding
let shake = 0;
let pushX = 0; // the camera leans after the tiles
let pushZ = 0;
let leanX = 0;
let leanZ = 0;
let panelShown = false;
let bestAtStart = 0;
let view = 0; // 0 title view .. 1 play view

// Everything that is saved, kept in reused objects. The game in progress is
// saved after every move, so leaving and coming back resumes it.
const saved = hh.load(SAVE_KEY, null);
let best = Number(saved?.best) || 0;
let hasGame = game.restore(saved?.game);
if (hasGame) best = Math.max(best, game.score);
const gameData = {
  cells: new Array(CELLS).fill(0),
  score: 0,
  undo: new Array(CELLS).fill(0),
  undoScore: 0,
  canUndo: false,
  won: false,
};
const saveData = { best: 0, game: null };

function persist() {
  saveData.best = best;
  saveData.game = hasGame ? game.snapshot(gameData) : null;
  hh.save(SAVE_KEY, saveData);
}

const screenPos = new THREE.Vector3();

// A floating word over the tile at (x, z).
function popupAt(text, x, z) {
  screenPos.set(x, TILE_H + 0.5, z).project(camera);
  hud.popup(text, (screenPos.x + 1) * 0.5 * hh.width, (1 - screenPos.y) * 0.5 * hh.height);
}

function push(dir, amount) {
  pushX = DX[dir] * amount;
  pushZ = DZ[dir] * amount;
}

function readDir() {
  if (input.pressed('LEFT')) return LEFT;
  if (input.pressed('RIGHT')) return RIGHT;
  if (input.pressed('UP')) return UP;
  if (input.pressed('DOWN')) return DOWN;
  return -1;
}

// A fresh demo board that has already been played for a while.
function resetDemo() {
  demo.newGame();
  for (let i = 0; i < DEMO_WARMUP; i++) {
    const dir = demo.autoMove();
    if (dir < 0 || demo.biggest() >= 8) break;
    demo.move(dir);
  }
  tiles.snap(demo.cells, 1);
  demoWait = -0.4;
}

function titleMessage() {
  const action = hasGame ? 'A continue · Y new game' : 'Press A to start';
  let info = best > 0 ? `Best ${best}` : '';
  // best is never below the saved game's score, so info is set here.
  if (hasGame && game.score > 0) info = `Saved game ${game.score} points · ${info}`;
  hud.message(
    `<div class="title">TILE MERGE</div><div>${action}</div><div class="small">${HINT}</div>` +
      (info ? `<div class="small">${info}</div>` : ''),
    'high',
  );
}

function toTitle() {
  state = 'title';
  stateTime = 0;
  queued = -1;
  fx.clear();
  tiles.setGrey(0);
  resetDemo();
  hud.showStats(false);
  titleMessage();
}

// Starts playing game as it is now (new or continued).
function play() {
  state = 'play';
  stateTime = 0;
  queued = -1;
  fx.clear();
  tiles.setGrey(0);
  tiles.snap(game.cells, 1);
  bestAtStart = best;
  hud.showStats(true);
  hud.score(game.score);
  hud.best(best);
  hud.undo(game.canUndo);
  hud.message('');
  // A saved board can already be stuck.
  if (!game.canMove()) gameOver();
}

function newGame() {
  game.newGame();
  hasGame = true;
  persist();
  play();
}

function tryMove(dir) {
  if (!game.move(dir)) {
    tiles.nudge(dir);
    push(dir, 0.3);
    return;
  }
  tiles.slide(game, dir);
  push(dir, 1);
  if (game.gained > 0) hud.gain(game.gained);
  if (game.score > best) best = game.score;
  hud.score(game.score);
  hud.best(best);
  hud.undo(true);
  persist();
}

function undo() {
  if (!game.canUndo) return;
  tiles.finish();
  queued = -1;
  game.undo();
  tiles.snap(game.cells, 2);
  hud.score(game.score);
  hud.undo(false);
  persist();
}

function pause() {
  state = 'paused';
  hud.message(`<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`);
}

function win() {
  state = 'won';
  stateTime = 0;
  panelShown = false;
  queued = -1;
  shake = 0.5;
  for (let i = 0; i < 12; i++) {
    fx.confetti(cellX(i % CELLS), cellZ((i * 7) % CELLS), CONFETTI[i % CONFETTI.length], 9);
  }
}

function gameOver() {
  state = 'over';
  stateTime = 0;
  panelShown = false;
  queued = -1;
  shake = Math.max(shake, 0.3);
  hasGame = false;
  persist();
}

function showOver() {
  panelShown = true;
  const record = game.score > bestAtStart && game.score > 0;
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${game.score}</div>` +
      `<div class="small">Top tile ${2 ** game.biggest()} · Best ${best}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">${game.canUndo ? 'X undo · ' : ''}B title</div>`,
  );
}

// Effects for the merges of the slide that just landed.
function burstMerges(playing) {
  let top = -1; // the cell of the biggest merge
  for (let c = 0; c < CELLS; c++) {
    if (!tiles.merged[c]) continue;
    const e = tiles.shown[c];
    fx.burst(cellX(c), cellZ(c), e, Math.min(16, 2 + e), Math.min(2, 0.5 + e * 0.12));
    if (top < 0 || e > tiles.shown[top]) top = c;
  }
  if (top < 0) return;
  const e = tiles.shown[top];
  if (e >= 7) {
    // 128 and up: a ring, a shake and the new value floating up.
    const x = cellX(top);
    const z = cellZ(top);
    fx.wave(x, z, 0xfff1d6, 0.7 + (e - 7) * 0.12);
    shake = Math.max(shake, playing ? 0.12 + (e - 7) * 0.05 : 0.06);
    if (playing) popupAt(`${2 ** e}!`, x, z);
  }
}

function onLanded() {
  if (state === 'title') {
    burstMerges(false);
    return;
  }
  burstMerges(true);
  if (state !== 'play') return;
  if (game.justWon) {
    game.justWon = false;
    win();
    return;
  }
  if (queued >= 0) {
    const dir = queued;
    queued = -1;
    tryMove(dir);
  }
  if (!tiles.sliding && !game.canMove()) gameOver();
}

function updateDemo(dt) {
  if (tiles.sliding) return;
  demoWait += dt;
  if (demoWait < DEMO_STEP) return;
  demoWait = 0;
  const dir = demo.autoMove();
  if (dir < 0 || demo.biggest() >= DEMO_LIMIT) {
    resetDemo();
    return;
  }
  demo.move(dir);
  tiles.slide(demo, dir);
  push(dir, 0.6);
}

function placeCamera(dt) {
  // Glide between the title and play views.
  const target = state === 'title' ? 0 : 1;
  view += (target - view) * Math.min(1, dt * 3.5);
  const v = view * view * (3 - 2 * view);

  // The camera leans a little after every slide and eases back.
  const decay = Math.exp(-dt * 6);
  pushX *= decay;
  pushZ *= decay;
  const k = Math.min(1, dt * 14);
  leanX += (pushX - leanX) * k;
  leanZ += (pushZ - leanZ) * k;

  const angle = Math.sin(titleTime * 0.25) * 0.42;
  const x = Math.sin(angle) * TITLE_R * (1 - v) + leanX * 0.34;
  const y = TITLE_Y + (CAM_Y - TITLE_Y) * v;
  const z = Math.cos(angle) * TITLE_R + (CAM_Z - Math.cos(angle) * TITLE_R) * v + leanZ * 0.3;
  shake = Math.max(0, shake - dt);
  const j = shake * shake * 1.6;
  camera.position.set(x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j, z);
  camera.lookAt(leanX * 0.14, 0, TITLE_LOOK_Z + (LOOK_Z - TITLE_LOOK_Z) * v + leanZ * 0.12);
}

toTitle();

hh.run((dt) => {
  if (state !== 'paused') stateTime += dt;

  if (state === 'title') {
    titleTime += dt;
    updateDemo(dt);
    if (input.pressed('A') || input.pressed('START')) {
      if (hasGame) play();
      else newGame();
    } else if (input.pressed('Y')) {
      newGame();
    }
  } else if (state === 'play') {
    if (input.pressed('START')) {
      pause();
    } else if (input.pressed('X')) {
      undo();
    } else {
      const dir = readDir();
      if (dir >= 0) {
        if (tiles.sliding) queued = dir;
        else tryMove(dir);
      }
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'won') {
    if (!panelShown && stateTime > WIN_DELAY) {
      panelShown = true;
      hud.message(
        `<div class="title">You made 2048!</div>` +
          `<div>Score ${game.score}</div>` +
          `<div>A keep going · B title</div>`,
      );
    } else if (panelShown && input.pressed('A')) {
      state = 'play';
      hud.message('');
    } else if (panelShown && input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    tiles.setGrey(Math.min(1, stateTime / OVER_DELAY));
    if (!panelShown && stateTime > OVER_DELAY) {
      showOver();
    } else if (panelShown && input.pressed('A')) {
      newGame();
    } else if (panelShown && input.pressed('B')) {
      toTitle();
    } else if (panelShown && input.pressed('X') && game.canUndo) {
      // One more chance: back to the move before the end.
      hasGame = true;
      state = 'play';
      tiles.setGrey(0);
      hud.message('');
      undo();
    }
  }

  // Everything below animates; while paused it all stays frozen.
  if (state !== 'paused') {
    if (tiles.update(dt)) onLanded();
    fx.update(dt);
    placeCamera(dt);
  }

  renderer.render(scene, camera);
});
