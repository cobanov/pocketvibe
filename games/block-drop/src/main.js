// Block Drop: a falling-block puzzle. Fill rows across the well to clear them.
// D-pad left/right moves, DOWN soft drops, UP hard drops, A/B rotate,
// L or R holds a piece, START pauses.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';
import { COLS, DRAW_ROWS, cellX, cellY } from './shared.js';
import { createGame } from './game.js';
import { createWell, LAYOUT } from './well.js';
import { createBackdrop } from './backdrop.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';

const DIST = 40; // camera distance from the well
const LOOK_Y = 0.55;
const PITCH = 0.045; // the camera looks slightly down on the blocks
// Width / height of the well and its side panels in the designed view, so
// narrower screens zoom out until all of it shows.
const BOARD_ASPECT = 1.3;
const SAVE_KEY = 'block-drop';
const CLEAR_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD!'];
const HINT = '◀ ▶ move · ▼ ▲ drop · A B rotate · L R hold';

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

let state = 'title'; // title | play | paused | over
let time = 0;
let shake = 0;
let kick = 0;
let overTime = 0;
let greyRows = 0;
let panelShown = false;
let record = false;
let best = hh.load(SAVE_KEY, { best: 0 }).best;

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

function toTitle() {
  state = 'title';
  game.decorate();
  well.reset();
  fx.clear();
  greyRows = 0;
  backdrop.theme(1, false);
  hud.showStats(false);
  hud.message(
    `<div class="title">BLOCK DROP</div>` +
      `<div>Press A to start</div>` +
      `<div class="small">${HINT}</div>` +
      (best > 0 ? `<div class="small">Best ${best}</div>` : ''),
  );
}

function start() {
  state = 'play';
  game.start();
  well.reset();
  fx.clear();
  greyRows = 0;
  backdrop.theme(1, false);
  hud.showStats(true);
  hud.stats(0, 1, 0);
  hud.best(best);
  hud.message('');
}

function gameOver() {
  state = 'over';
  overTime = 0;
  greyRows = 0;
  panelShown = false;
  shake = 0.35;
  record = game.score > best;
  if (record) {
    best = game.score;
    hh.save(SAVE_KEY, { best });
  }
}

function showGameOver() {
  panelShown = true;
  hud.message(
    `<div class="title">${record ? 'NEW BEST!' : 'GAME OVER'}</div>` +
      `<div>Score ${game.score}</div>` +
      `<div class="small">Level ${game.level} · Lines ${game.lines} · Best ${best}</div>` +
      `<div>Press A to play again</div>` +
      `<div class="small">B title</div>`,
  );
}

// Effects for what happened in the last game update.
function react() {
  const ev = game.ev;
  if (ev.hardRows > 0) {
    shake = Math.max(shake, 0.14);
    kick = Math.min(0.35, 0.1 + ev.hardRows * 0.015);
    for (let i = 0; i < 4; i++) {
      const cell = ev.lockedCells[i];
      const col = cell % COLS;
      const row = (cell - col) / COLS;
      fx.dust(cellX(col), cellY(row), game.board[cell]);
    }
  }
  if (ev.cleared > 0) {
    const n = ev.cleared;
    shake = Math.max(shake, n === 4 ? 0.45 : 0.08 * n);
    const main = ev.backToBack ? 'B2B QUAD!' : CLEAR_NAMES[n];
    let sub = `+${ev.points}`;
    if (ev.levelUp) sub = `LEVEL ${game.level}!`;
    else if (game.combo > 0) sub = `COMBO ${game.combo}  +${ev.points}`;
    hud.popup(main, sub, n === 4);
    if (ev.levelUp) backdrop.theme(game.level, false);
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
warmUp();

hh.run((dt) => {
  time += dt;

  if (state === 'title') {
    if (input.pressed('A') || input.pressed('START')) start();
  } else if (state === 'play') {
    if (input.pressed('START')) {
      state = 'paused';
      hud.message(
        `<div class="title">PAUSED</div><div>Press START to resume</div><div class="small">B quit to title</div>`,
      );
    } else {
      game.update(dt, input);
      react();
      hud.stats(game.score, game.level, game.lines);
      // The best box counts along once the old record is beaten.
      hud.best(Math.max(best, game.score));
      if (game.phase === 'dead') gameOver();
    }
  } else if (state === 'paused') {
    if (input.pressed('START')) {
      state = 'play';
      hud.message('');
    } else if (input.pressed('B')) {
      toTitle();
    }
  } else if (state === 'over') {
    overTime += dt;
    // The stack turns grey from the bottom up, then the result appears.
    greyRows = Math.min(DRAW_ROWS, overTime * 34);
    if (!panelShown && overTime > 0.75) showGameOver();
    if (panelShown && input.pressed('A')) start();
    else if (panelShown && input.pressed('B')) toTitle();
  }

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

  renderer.render(scene, camera);
});
