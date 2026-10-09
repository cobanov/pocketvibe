// The tiles on screen: every tile body is one InstancedMesh and every number
// another, sharing the same instance matrices. The numbers come from one
// canvas atlas drawn at startup; a per-instance attribute picks the cell.
// This module also owns the animations: eased slides, merge pops, spawn
// scale-ins, a nudge for moves that go nowhere and the grey of a lost game.
// Tiles are modelled for the 4x4 board and scaled by TILE_SCALE on the others.

import * as THREE from 'three';
import {
  CELLS, DX, DZ, GOAL_EXP, MAX_CELLS, MAX_EXP, SIZE, TILE_H, TILE_RGB, TILE_SCALE, TILE_W,
  bake, bevelBox, cellX, cellZ, easeOutBack, easeOutCubic,
} from './shared.js';

const MAX = 32; // a slide never shows more than 25 tiles, plus room to spare
const SLIDE_TIME = 0.12;
const POP_TIME = 0.24;
const SPAWN_TIME = 0.22;
const NUDGE_TIME = 0.2;
const DONE = 9; // timer value of an animation that has finished

// Atlas: 512 x 512 px, 4 x 5 cells of 128 x 102 px, one per value from 2 to
// 1048576.
const ATLAS_SIZE = 512;
const ATLAS_COLS = 4;
const CELL_W = 128;
const CELL_H = 102;
const LABEL_W = 0.88;
const LABEL_H = LABEL_W * (CELL_H / CELL_W);
const GREY = 0.62; // linear grey the tiles fade to when the game is lost

function drawAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let e = 1; e <= MAX_EXP; e++) {
    const i = e - 1;
    const cx = (i % ATLAS_COLS) * CELL_W + CELL_W / 2;
    const cy = Math.floor(i / ATLAS_COLS) * CELL_H + CELL_H / 2 + 3;
    const text = String(2 ** e);
    // Short numbers are as tall as the cell allows, long ones shrink to fit.
    let size = 82;
    ctx.font = `900 ${size}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    const width = ctx.measureText(text).width;
    if (width > CELL_W - 16) {
      size = Math.floor((size * (CELL_W - 16)) / width);
      ctx.font = `900 ${size}px system-ui, "Helvetica Neue", Arial, sans-serif`;
    }
    if (e <= 2) {
      ctx.fillStyle = '#7a5d48';
      ctx.fillText(text, cx, cy);
    } else {
      // White with a soft warm outline and drop, so it reads on every colour.
      ctx.lineWidth = Math.max(4, size * 0.12);
      ctx.strokeStyle = 'rgba(110, 48, 18, 0.32)';
      ctx.strokeText(text, cx, cy + 3);
      ctx.strokeStyle = 'rgba(110, 48, 18, 0.4)';
      ctx.strokeText(text, cx, cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, cx, cy);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  // Premultiplied, so filtering never pulls dark fringes out of the
  // transparent background around the digits.
  texture.premultiplyAlpha = true;
  return texture;
}

const labelVertex = /* glsl */ `
  attribute float cell;
  varying vec2 vUv;
  void main() {
    // The half keeps floor() safe from rounding on low-precision GPUs.
    float row = floor((cell + 0.5) / ${ATLAS_COLS}.0);
    float col = cell - row * ${ATLAS_COLS}.0;
    vUv = vec2((uv.x + col) * ${CELL_W / ATLAS_SIZE}, 1.0 - (row + 1.0 - uv.y) * ${CELL_H / ATLAS_SIZE});
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const labelFragment = /* glsl */ `
  uniform sampler2D atlas;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(atlas, vUv);
  }
`;

export function createTiles(scene) {
  // Bodies stand on the board: the geometry's base is at y = 0, so scaling
  // squashes them against the board instead of sinking them into it.
  const bodyGeometry = bake(bevelBox(TILE_W, TILE_H, TILE_W, 0.12), 0xffffff);
  bodyGeometry.translate(0, TILE_H / 2, 0);
  const bodies = new THREE.InstancedMesh(bodyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true }), MAX);
  bodies.frustumCulled = false; // instances move
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < MAX; i++) bodies.setColorAt(i, white);
  bodies.count = 0;
  scene.add(bodies);

  // The numbers: a flat quad just above each tile's top face.
  const labelGeometry = new THREE.PlaneGeometry(LABEL_W, LABEL_H);
  labelGeometry.rotateX(-Math.PI / 2);
  labelGeometry.translate(0, TILE_H + 0.006, 0);
  const cellAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  labelGeometry.setAttribute('cell', cellAttr);
  const labels = new THREE.InstancedMesh(
    labelGeometry,
    new THREE.ShaderMaterial({
      uniforms: { atlas: { value: drawAtlas() } },
      vertexShader: labelVertex,
      fragmentShader: labelFragment,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    }),
    MAX,
  );
  // Both meshes read the same matrices, uploaded once per frame.
  labels.instanceMatrix = bodies.instanceMatrix;
  labels.frustumCulled = false;
  labels.count = 0;
  scene.add(labels);

  const matrices = bodies.instanceMatrix.array;
  const colors = bodies.instanceColor.array;
  const cellIds = cellAttr.array;

  // What is on screen: during a slide the tiles of `before` travel to their
  // `dest`; afterwards `shown` is the settled board.
  const before = new Uint8Array(MAX_CELLS);
  const dest = new Int8Array(MAX_CELLS);
  const merged = new Uint8Array(MAX_CELLS);
  const shown = new Uint8Array(MAX_CELLS);
  let spawned = -1;
  let sliding = false;
  let slideT = 0;
  let slideDir = 0;

  // Per-cell animation timers in seconds (negative ones wait). They follow
  // their tile through the next slide, so a quick move never cuts a pop off.
  const popT = new Float32Array(MAX_CELLS).fill(DONE);
  const popSize = new Float32Array(MAX_CELLS);
  const spawnT = new Float32Array(MAX_CELLS).fill(DONE);
  const nextPop = new Float32Array(MAX_CELLS);
  const nextPopSize = new Float32Array(MAX_CELLS);
  const nextSpawn = new Float32Array(MAX_CELLS);
  let nudgeT = DONE;
  let nudgeDir = 0;
  let grey = 0;
  let time = 0;

  function put(i, x, z, lift, sx, sy, sz, e, flash, shine) {
    const o = i * 16;
    const scale = TILE_SCALE;
    matrices[o] = sx * scale;
    matrices[o + 5] = sy * scale;
    matrices[o + 10] = sz * scale;
    matrices[o + 12] = x;
    matrices[o + 13] = lift * scale;
    matrices[o + 14] = z;
    const k = e * 3;
    let r = TILE_RGB[k];
    let g = TILE_RGB[k + 1];
    let b = TILE_RGB[k + 2];
    // A merge flashes towards white; big tiles shimmer a little.
    const w = flash + shine;
    r += (1 - r) * w;
    g += (1 - g) * w;
    b += (1 - b) * w;
    if (grey > 0) {
      const lum = (r + g + b) / 3;
      const k2 = grey * 0.85;
      r += (lum * 0.5 + GREY * 0.5 - r) * k2;
      g += (lum * 0.5 + GREY * 0.5 - g) * k2;
      b += (lum * 0.5 + GREY * 0.5 - b) * k2;
    }
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    cellIds[i] = e - 1;
  }

  // Draws the tile with value e that belongs to timer slot c at (x, z).
  function drawTile(i, c, x, z, e, stretch) {
    let s = 1;
    let lift = 0;
    let flash = 0;
    if (spawnT[c] < SPAWN_TIME) {
      s = spawnT[c] <= 0 ? 0 : easeOutBack(spawnT[c] / SPAWN_TIME);
    }
    if (popT[c] < POP_TIME) {
      const p = popT[c] / POP_TIME;
      const bump = Math.sin(Math.PI * p);
      s *= 1 + popSize[c] * bump;
      lift = popSize[c] * 0.5 * bump;
      flash = popSize[c] * 1.6 * (1 - p) * (1 - p);
    }
    // Stretch along the slide, slimmer across it.
    let sx = s;
    let sz = s;
    if (stretch > 0) {
      const along = 1 + stretch * 0.16;
      const across = 1 - stretch * 0.07;
      sx *= DX[slideDir] !== 0 ? along : across;
      sz *= DX[slideDir] !== 0 ? across : along;
    }
    const shine = e >= GOAL_EXP[SIZE] ? 0.12 + 0.1 * Math.sin(time * 3 + c) : 0;
    put(i, x, z, lift, sx, s, sz, e, flash, shine);
  }

  const api = {
    get sliding() {
      return sliding;
    },

    // Starts animating the move the game just made.
    slide(game, dir) {
      before.set(game.before);
      dest.set(game.dest);
      merged.set(game.merged);
      shown.set(game.cells);
      spawned = game.spawned;
      slideDir = dir;
      slideT = 0;
      sliding = true;
    },

    // Ends a slide at once (an undo pressed mid-slide).
    finish() {
      if (sliding) {
        slideT = SLIDE_TIME;
        api.update(0);
      }
    },

    // Shows a board without a slide. pop: 0 nothing, 1 every tile scales in
    // one after another (a new board), 2 every tile gives a small pop (undo).
    snap(cells, pop) {
      sliding = false;
      shown.set(cells);
      spawned = -1;
      for (let c = 0; c < CELLS; c++) {
        popT[c] = pop === 2 ? 0 : DONE;
        popSize[c] = 0.1;
        spawnT[c] = pop === 1 ? -0.03 * c - 0.05 : DONE;
      }
    },

    // A move that changes nothing: the tiles lean towards the wall.
    nudge(dir) {
      nudgeDir = dir;
      nudgeT = 0;
    },

    // 0..1: how far the tiles have faded to grey (a lost game).
    setGrey(value) {
      grey = value;
    },

    // Animates and draws. Returns true on the frame a slide lands, so the
    // caller can burst the merges and take the next move. hurry: moves are
    // waiting, so the slide runs at double speed.
    update(dt, hurry = false) {
      time += dt;
      for (let c = 0; c < CELLS; c++) {
        if (popT[c] < DONE) popT[c] = Math.min(DONE, popT[c] + dt);
        if (spawnT[c] < DONE) spawnT[c] = Math.min(DONE, spawnT[c] + dt);
      }
      if (nudgeT < DONE) nudgeT = Math.min(DONE, nudgeT + dt);

      let landed = false;
      if (sliding) {
        slideT += hurry ? dt * 2 : dt;
        if (slideT >= SLIDE_TIME) {
          // Timers move with their tiles; merged tiles start a fresh pop and
          // the new tile starts to grow.
          for (let c = 0; c < CELLS; c++) {
            nextPop[c] = DONE;
            nextPopSize[c] = 0;
            nextSpawn[c] = DONE;
          }
          for (let c = 0; c < CELLS; c++) {
            const d = dest[c];
            if (before[c] === 0 || d < 0) continue;
            if (merged[d]) {
              nextPop[d] = 0;
              nextPopSize[d] = Math.min(0.34, 0.12 + shown[d] * 0.018);
            } else {
              nextPop[d] = popT[c];
              nextPopSize[d] = popSize[c];
              nextSpawn[d] = spawnT[c];
            }
          }
          if (spawned >= 0) nextSpawn[spawned] = 0;
          popT.set(nextPop);
          popSize.set(nextPopSize);
          spawnT.set(nextSpawn);
          sliding = false;
          landed = true;
        }
      }

      let n = 0;
      if (sliding) {
        const t = slideT / SLIDE_TIME;
        const k = easeOutCubic(t);
        const stretch = Math.sin(Math.PI * Math.min(1, t * 1.15));
        for (let c = 0; c < CELLS; c++) {
          const e = before[c];
          if (e === 0) continue;
          const d = dest[c];
          const x0 = cellX(c);
          const z0 = cellZ(c);
          const x = x0 + (cellX(d) - x0) * k;
          const z = z0 + (cellZ(d) - z0) * k;
          drawTile(n++, c, x, z, e, d === c ? 0 : stretch);
        }
      } else {
        let ox = 0;
        let oz = 0;
        if (nudgeT < NUDGE_TIME) {
          const push = Math.sin(Math.PI * (nudgeT / NUDGE_TIME)) * 0.07 * TILE_SCALE;
          ox = DX[nudgeDir] * push;
          oz = DZ[nudgeDir] * push;
        }
        for (let c = 0; c < CELLS; c++) {
          const e = shown[c];
          if (e === 0) continue;
          drawTile(n++, c, cellX(c) + ox, cellZ(c) + oz, e, 0);
        }
      }
      bodies.count = n;
      labels.count = n;
      bodies.instanceMatrix.needsUpdate = true;
      bodies.instanceColor.needsUpdate = true;
      cellAttr.needsUpdate = true;
      return landed;
    },

    // Where merges happened in the slide that just landed, for effects.
    merged,
    shown,
  };
  return api;
}
