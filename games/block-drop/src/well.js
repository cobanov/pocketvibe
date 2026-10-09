// The well on screen: frame and side panels (one merged mesh), the grid
// behind the blocks, every block (one InstancedMesh) and the ghost piece.

import * as THREE from 'three';
import {
  BOARD_ROWS,
  COLS,
  DRAW_ROWS,
  GREY,
  PIECE_RGB,
  ROWS,
  bake,
  bevelBox,
  block,
  cellX,
  cellY,
  mergeGeometries,
} from './shared.js';
import { CENTER_X, CENTER_Y, SHAPES } from './pieces.js';

const FRAME = 0xe4defc;
const PANEL = 0x1c2046;
const BLOCK_SCALE = 0.97;
const MAX_BLOCKS = COLS * DRAW_ROWS + 4 + 12 + 4;

// Side panels, in world units (x, y of the inner rectangle).
export const LAYOUT = {
  hold: { x0: -14, x1: -7.2, y0: 5.4, y1: 10.6 },
  stats: { x0: -14, x1: -7.2, y0: -4.2, y1: 4.6 },
  next: { x0: 7.2, x1: 14, y0: 0.4, y1: 10.6 },
  best: { x0: 7.2, x1: 14, y0: -4.2, y1: -0.4 },
};
const HOLD_Y = 7.45;
const NEXT_Y = [8.0, 4.95, 1.9];
const NEXT_SCALE = [0.82, 0.68, 0.68];
const HOLD_SCALE = 0.82;

function gridTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12152f';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#1d2149';
  ctx.fillRect(1, 1, 30, 30);
  ctx.fillStyle = '#22275a';
  ctx.fillRect(1, 1, 30, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(COLS, ROWS);
  return texture;
}

// A tray: dark inner panel with a light bevelled rim, used for the side boxes.
function tray(parts, { x0, x1, y0, y1 }) {
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const back = new THREE.PlaneGeometry(w, h).toNonIndexed();
  back.deleteAttribute('uv');
  back.translate(cx, cy, -0.5);
  parts.push(bake(back, PANEL));
  const t = 0.4;
  parts.push(block(w + t * 2, t, 1.0, cx, y1 + t / 2, -0.2, FRAME, 0.1));
  parts.push(block(w + t * 2, t, 1.0, cx, y0 - t / 2, -0.2, FRAME, 0.1));
  parts.push(block(t, h, 1.0, x0 - t / 2, cy, -0.2, FRAME, 0.1));
  parts.push(block(t, h, 1.0, x1 + t / 2, cy, -0.2, FRAME, 0.1));
}

function frameGeometry() {
  const parts = [];
  const bottom = -ROWS / 2;
  const side = COLS / 2;
  // Walls and floor of the well.
  parts.push(block(0.6, ROWS + 0.6, 1.4, -side - 0.3, -0.3, 0, FRAME));
  parts.push(block(0.6, ROWS + 0.6, 1.4, side + 0.3, -0.3, 0, FRAME));
  parts.push(block(COLS + 1.2, 0.7, 1.6, 0, bottom - 0.35, 0, FRAME));
  tray(parts, LAYOUT.hold);
  tray(parts, LAYOUT.stats);
  tray(parts, LAYOUT.next);
  tray(parts, LAYOUT.best);
  return mergeGeometries(parts);
}

export function createWell(scene) {
  const frame = new THREE.Mesh(frameGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  scene.add(frame);

  const gridMaterial = new THREE.MeshBasicMaterial({ map: gridTexture() });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(COLS, ROWS), gridMaterial);
  grid.position.z = -0.52;
  scene.add(grid);

  // Every block on screen: the stack, the falling piece, next and hold.
  // Their backs never face the camera, so the block has none (30 triangles).
  const cubeGeometry = bake(bevelBox(1, 1, 1, 0.16, true), 0xffffff);
  const blocks = new THREE.InstancedMesh(
    cubeGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    MAX_BLOCKS,
  );
  blocks.frustumCulled = false; // instances change every frame
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < MAX_BLOCKS; i++) blocks.setColorAt(i, white);
  scene.add(blocks);

  const ghost = new THREE.InstancedMesh(
    cubeGeometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false }),
    4,
  );
  ghost.frustumCulled = false;
  for (let i = 0; i < 4; i++) ghost.setColorAt(i, white);
  scene.add(ghost);

  // Instance matrices start as identity; blocks are never rotated, so put()
  // only writes the scale and translation entries.
  const blockM = blocks.instanceMatrix.array;
  const blockC = blocks.instanceColor.array;
  const ghostM = ghost.instanceMatrix.array;
  const ghostC = ghost.instanceColor.array;

  // Per-cell and per-row animation state.
  const cellFlash = new Float32Array(COLS * BOARD_ROWS); // 1 -> 0 after a lock
  const rowFall = new Float32Array(BOARD_ROWS); // rows still to fall after a collapse
  const rowVel = new Float32Array(BOARD_ROWS);
  const rowClearing = new Uint8Array(BOARD_ROWS);

  let count = 0;
  let offX = 0; // the falling piece eases into its new column
  let offY = 0;
  let pop = 0; // a small scale pop on rotation
  let danger = 0; // 0..1 as the stack nears the top
  let time = 0;

  function put(m, c, i, x, y, z, s, r, g, b) {
    const o = i * 16;
    m[o] = s;
    m[o + 5] = s;
    m[o + 10] = s;
    m[o + 12] = x;
    m[o + 13] = y;
    m[o + 14] = z;
    c[i * 3] = r;
    c[i * 3 + 1] = g;
    c[i * 3 + 2] = b;
  }

  // Adds one block, its colour mixed towards white by `flash` (0..1) and
  // darkened by `dim` (0..1).
  function addBlock(x, y, s, type, flash, dim) {
    const k = type * 3;
    const f = flash;
    const d = 1 - dim;
    put(
      blockM,
      blockC,
      count++,
      x,
      y,
      0,
      s,
      (PIECE_RGB[k] + (1 - PIECE_RGB[k]) * f) * d,
      (PIECE_RGB[k + 1] + (1 - PIECE_RGB[k + 1]) * f) * d,
      (PIECE_RGB[k + 2] + (1 - PIECE_RGB[k + 2]) * f) * d,
    );
  }

  // A whole piece in its spawn orientation, centred on (cx, cy).
  function addPreview(type, cx, cy, s, dim) {
    const shape = SHAPES[type][0];
    for (let i = 0; i < 8; i += 2) {
      addBlock(cx + (shape[i] - CENTER_X[type]) * s, cy + (shape[i + 1] - CENTER_Y[type]) * s, s * 0.96, type, 0, dim);
    }
  }

  function reactTo(game) {
    const ev = game.ev;
    if (ev.shiftX !== 0) offX -= ev.shiftX;
    if (ev.shiftY !== 0) offY += ev.shiftY;
    if (ev.rotated) pop = 1;
    if (ev.locked) {
      for (let i = 0; i < 4; i++) cellFlash[ev.lockedCells[i]] = 1;
      offX = 0;
      offY = 0;
    }
    if (ev.cleared > 0) {
      for (let i = 0; i < game.clearCount; i++) rowClearing[game.clearedRows[i]] = 1;
    }
    if (ev.collapsed) {
      rowClearing.fill(0);
      cellFlash.fill(0);
      for (let r = 0; r < BOARD_ROWS; r++) {
        if (ev.rowShift[r] > 0) rowFall[r] = ev.rowShift[r];
      }
    }
    if (ev.held) {
      offX = 0;
      offY = 0;
    }
  }

  return {
    // 0..1 as the stack nears the top (eased), for the warning sound.
    get danger() {
      return danger;
    },

    reset() {
      cellFlash.fill(0);
      rowFall.fill(0);
      rowVel.fill(0);
      rowClearing.fill(0);
      offX = 0;
      offY = 0;
      pop = 0;
    },

    // greyRows: rows from the bottom drawn grey (the game over sweep).
    update(dt, game, greyRows) {
      time += dt;
      reactTo(game);

      const ease = Math.exp(-dt * 30);
      offX *= ease;
      offY *= ease;
      pop = Math.max(0, pop - dt * 9);

      const board = game.board;
      count = 0;
      let highest = -1;

      // Rows above a collapse fall with gravity into place.
      for (let r = 0; r < BOARD_ROWS; r++) {
        if (rowFall[r] > 0) {
          rowVel[r] += 70 * dt;
          rowFall[r] = Math.max(0, rowFall[r] - rowVel[r] * dt);
        } else {
          rowVel[r] = 0;
        }
      }

      // The stack.
      for (let r = 0; r < DRAW_ROWS; r++) {
        const y = cellY(r) + rowFall[r];
        const clearing = rowClearing[r] === 1 && game.phase === 'clear';
        let scale = BLOCK_SCALE;
        let flashRow = 0;
        if (clearing) {
          // Flash white and swell, then shrink away.
          const p = game.clearProgress;
          flashRow = Math.min(1, p * 8) * (0.88 + 0.12 * Math.cos(p * 50));
          scale = p < 0.6 ? BLOCK_SCALE + p * 0.2 : (BLOCK_SCALE + 0.12) * (1 - (p - 0.6) / 0.4);
        }
        for (let c = 0; c < COLS; c++) {
          const cell = r * COLS + c;
          const t = board[cell];
          if (t === 0) continue;
          if (r > highest) highest = r;
          if (cellFlash[cell] > 0) cellFlash[cell] = Math.max(0, cellFlash[cell] - dt * 6);
          const flash = clearing ? flashRow : cellFlash[cell] * 0.7;
          addBlock(cellX(c), y, scale, r < greyRows ? GREY : t, flash, 0);
        }
      }

      // The falling piece and its ghost.
      let ghosts = 0;
      if (game.phase === 'fall') {
        const shape = SHAPES[game.type][game.rot];
        const s = BLOCK_SCALE * (1 + pop * 0.12);
        // Dims a little while the lock delay runs out.
        const dim = game.lockProgress * 0.3;
        const showGhost = game.ghostY < game.y;
        const k = game.type * 3;
        for (let i = 0; i < 8; i += 2) {
          const col = game.x + shape[i];
          const row = game.y + shape[i + 1];
          if (row < DRAW_ROWS) addBlock(cellX(col) + offX, cellY(row) + offY, s, game.type, 0, dim);
          if (showGhost) {
            put(
              ghostM,
              ghostC,
              ghosts++,
              cellX(col),
              cellY(game.ghostY + shape[i + 1]),
              0,
              0.9,
              PIECE_RGB[k] * 0.8 + 0.2,
              PIECE_RGB[k + 1] * 0.8 + 0.2,
              PIECE_RGB[k + 2] * 0.8 + 0.2,
            );
          }
        }
      }
      ghost.count = ghosts;
      ghost.instanceMatrix.needsUpdate = true;
      ghost.instanceColor.needsUpdate = true;

      // Next three and hold.
      const nx = (LAYOUT.next.x0 + LAYOUT.next.x1) / 2;
      for (let i = 0; i < 3; i++) addPreview(game.next[i], nx, NEXT_Y[i], NEXT_SCALE[i], 0);
      if (game.hold !== 0) {
        const hx = (LAYOUT.hold.x0 + LAYOUT.hold.x1) / 2;
        addPreview(game.hold, hx, HOLD_Y, HOLD_SCALE, game.canHold ? 0 : 0.55);
      }

      blocks.count = count;
      blocks.instanceMatrix.needsUpdate = true;
      blocks.instanceColor.needsUpdate = true;

      // The grid glows red and pulses when the stack is close to the top.
      const target = game.phase === 'idle' || game.phase === 'done' ? 0 : Math.min(1, Math.max(0, (highest - 13) / 5));
      danger += (target - danger) * Math.min(1, dt * 4);
      const pulse = danger * (0.6 + 0.4 * Math.sin(time * 7));
      gridMaterial.color.setRGB(1 + pulse * 5, 1 - pulse * 0.45, 1 - pulse * 0.6);
    },
  };
}
