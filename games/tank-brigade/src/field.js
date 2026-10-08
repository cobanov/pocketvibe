// The battlefield: 26 x 26 cells (four per tile) holding bricks, steel,
// water, trees and ice, and the core the player defends in the middle of the
// bottom row. Bricks and steel are one InstancedMesh each with one instance
// per standing cell, rewritten only when a cell changes; the floor, trees and
// ice glints are instanced per tile and change only when a stage loads.
// Water is one plane under the floor slab, seen where floor tiles are missing.

import * as THREE from 'three';
import {
  BRICK,
  CELL,
  CORE,
  CORE_COL,
  DIR_X,
  EMPTY,
  ENEMY_COLS,
  HALF,
  ICE,
  N,
  PLAYER_COL,
  STEEL,
  TILES,
  TREES,
  WATER,
  cellCenter,
  tileCenter,
  toCell,
} from './shared.js';
import {
  brickGeometry,
  coreGeometry,
  crystalGeometry,
  floorGeometry,
  glintGeometry,
  rippleGeometry,
  rubbleGeometry,
  steelGeometry,
  treesGeometry,
} from './models.js';

const CELLS = N * N;
const TILE_COUNT = TILES * TILES;
const RISE_TIME = 0.42; // stage intro: every block pops up out of the floor
const BRICK_COLOR = 0xc85a30;
const STEEL_COLOR = 0xa8b8cc;
const FLOOR_A = 0x3e4642;
const FLOOR_B = 0x464f4a;
const ICE_COLOR = 0xbfe6f2;
const WATER_COLOR = 0x2486a8;
const WATER_Y = -0.13;

// Bullet results, from least to most important.
export const HIT_NONE = 0;
export const HIT_CLANK = 1; // steel or the field's edge: nothing breaks
export const HIT_BRICK = 2;
export const HIT_STEEL = 3; // steel broken by a fully upgraded gun
export const HIT_CORE = 4;

// The core's wall: the cells around it, as column, row pairs.
const CORE_WALL = [11, 23, 12, 23, 13, 23, 14, 23, 11, 24, 11, 25, 14, 24, 14, 25];

function easeOutBack(t) {
  const c = 1.8;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export function createField(scene) {
  const cells = new Uint8Array(CELLS);
  const tiles = new Uint8Array(TILE_COUNT); // EMPTY, WATER, TREES or ICE: how the tile is drawn
  const shade = new Float32Array(CELLS); // brightness of each cell's bricks, for a hand-laid look
  const delay = new Float32Array(CELLS); // when each cell rises in the intro
  const tileDelay = new Float32Array(TILE_COUNT);
  for (let i = 0; i < CELLS; i++) shade[i] = 0.84 + Math.random() * 0.24;

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });

  function instanced(geometry, mat, count) {
    const mesh = new THREE.InstancedMesh(geometry, mat, count);
    mesh.frustumCulled = false; // instances change, so the cached bounds would be wrong
    mesh.count = 0;
    mesh.setColorAt(0, new THREE.Color(0xffffff)); // creates instanceColor once, up front
    scene.add(mesh);
    return mesh;
  }

  const floor = instanced(floorGeometry(), material, TILE_COUNT);
  const bricks = instanced(brickGeometry(), material, CELLS);
  const steel = instanced(steelGeometry(), material, CELLS);
  const trees = instanced(treesGeometry(), material, TILE_COUNT);
  const glints = instanced(glintGeometry(), new THREE.MeshBasicMaterial({ color: 0xf2feff }), TILE_COUNT);
  const ripples = instanced(rippleGeometry(), new THREE.MeshBasicMaterial({ color: 0x9fe4f4 }), TILE_COUNT * 2);

  const waterGeometry = new THREE.PlaneGeometry(TILES, TILES);
  waterGeometry.rotateX(-Math.PI / 2);
  const waterMaterial = new THREE.MeshLambertMaterial({ color: WATER_COLOR, emissive: 0x062a3a });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.position.y = WATER_Y - 0.01;
  scene.add(water);

  // The core: plinth, a spinning crystal, and rubble once it is destroyed.
  const coreX = tileCenter(CORE_COL);
  const coreZ = tileCenter(TILES - 1);
  const plinth = new THREE.Mesh(coreGeometry(), material);
  plinth.position.set(coreX, 0, coreZ);
  scene.add(plinth);
  const crystalMaterial = new THREE.MeshLambertMaterial({ color: 0x7ff0ff, emissive: 0x1a7f90 });
  const crystal = new THREE.Mesh(crystalGeometry(), crystalMaterial);
  scene.add(crystal);
  const rubble = new THREE.Mesh(rubbleGeometry(), material);
  rubble.position.set(coreX, 0, coreZ);
  rubble.visible = false;
  scene.add(rubble);

  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  const waterTiles = new Int16Array(TILE_COUNT);
  let waterCount = 0;
  let introT = 0;
  let introEnd = 0;
  let solidDirty = false;
  let clock = 0;

  function setCell(cx, cz, kind) {
    cells[cz * N + cx] = kind;
  }

  // Fills the cells of tile (tx, tz) picked by a half: 0 whole, 1 left,
  // 2 right, 3 top, 4 bottom.
  function fillTile(tx, tz, kind, half) {
    for (let q = 0; q < 4; q++) {
      const qx = q & 1;
      const qz = q >> 1;
      if (half === 1 && qx !== 0) continue;
      if (half === 2 && qx !== 1) continue;
      if (half === 3 && qz !== 0) continue;
      if (half === 4 && qz !== 1) continue;
      setCell(tx * 2 + qx, tz * 2 + qz, kind);
    }
  }

  function clearTile(tx, tz) {
    fillTile(tx, tz, EMPTY, 0);
    tiles[tz * TILES + tx] = EMPTY;
  }

  function rise(t) {
    if (t <= 0) return 0;
    return t >= RISE_TIME ? 1 : Math.max(0.001, easeOutBack(t / RISE_TIME));
  }

  // Rewrites the brick and steel instances from the cells.
  function writeSolids() {
    const intro = introT < introEnd;
    let nb = 0;
    let ns = 0;
    for (let i = 0; i < CELLS; i++) {
      const k = cells[i];
      if (k !== BRICK && k !== STEEL) continue;
      const s = intro ? rise(introT - delay[i]) : 1;
      if (s === 0) continue;
      const cx = i % N;
      const cz = (i - cx) / N;
      // Bricks alternate their direction cell by cell, like laid brickwork.
      m.makeRotationY(k === BRICK && (cx + cz) & 1 ? Math.PI / 2 : 0);
      m.scale(v.set(1, s, 1));
      m.setPosition(cellCenter(cx), 0, cellCenter(cz));
      if (k === BRICK) {
        c.setHex(BRICK_COLOR).multiplyScalar(shade[i]);
        bricks.setMatrixAt(nb, m);
        bricks.setColorAt(nb, c);
        nb++;
      } else {
        c.setHex(STEEL_COLOR).multiplyScalar(0.9 + (shade[i] - 0.84) * 0.5);
        steel.setMatrixAt(ns, m);
        steel.setColorAt(ns, c);
        ns++;
      }
    }
    bricks.count = nb;
    steel.count = ns;
    bricks.instanceMatrix.needsUpdate = true;
    bricks.instanceColor.needsUpdate = true;
    steel.instanceMatrix.needsUpdate = true;
    steel.instanceColor.needsUpdate = true;
  }

  // Floor, ice glints and trees: once per stage, and every frame of the intro
  // for the trees.
  function writeTiles() {
    let nf = 0;
    let ng = 0;
    waterCount = 0;
    for (let i = 0; i < TILE_COUNT; i++) {
      const tx = i % TILES;
      const tz = (i - tx) / TILES;
      const x = tileCenter(tx);
      const z = tileCenter(tz);
      const kind = tiles[i];
      if (kind === WATER) {
        waterTiles[waterCount++] = i;
        continue;
      }
      m.makeTranslation(x, 0, z);
      floor.setMatrixAt(nf, m);
      if (kind === ICE) c.setHex(ICE_COLOR).multiplyScalar(0.94 + shade[i * 2] * 0.06);
      else c.setHex((tx + tz) & 1 ? FLOOR_A : FLOOR_B).multiplyScalar(0.96 + (shade[i * 3] - 0.84) * 0.3);
      floor.setColorAt(nf, c);
      nf++;
      if (kind === ICE) {
        m.makeRotationY((i % 4) * (Math.PI / 2));
        m.setPosition(x, 0, z);
        glints.setMatrixAt(ng++, m);
      }
    }
    floor.count = nf;
    glints.count = ng;
    floor.instanceMatrix.needsUpdate = true;
    floor.instanceColor.needsUpdate = true;
    glints.instanceMatrix.needsUpdate = true;
    writeTrees();
  }

  function writeTrees() {
    const intro = introT < introEnd;
    let nt = 0;
    for (let i = 0; i < TILE_COUNT; i++) {
      if (tiles[i] !== TREES) continue;
      const s = intro ? rise(introT - tileDelay[i]) : 1;
      if (s === 0) continue;
      const tx = i % TILES;
      const tz = (i - tx) / TILES;
      m.makeRotationY((i % 4) * (Math.PI / 2));
      m.scale(v.set(s, s, s));
      m.setPosition(tileCenter(tx), 0, tileCenter(tz));
      trees.setMatrixAt(nt, m);
      c.setRGB(0.9 + (shade[i] - 0.84) * 0.5, 0.95 + (shade[i * 2] - 0.84) * 0.3, 0.9);
      trees.setColorAt(nt, c);
      nt++;
    }
    trees.count = nt;
    trees.instanceMatrix.needsUpdate = true;
    trees.instanceColor.needsUpdate = true;
  }

  function writeRipples() {
    for (let k = 0; k < waterCount; k++) {
      const i = waterTiles[k];
      const tx = i % TILES;
      const tz = (i - tx) / TILES;
      for (let j = 0; j < 2; j++) {
        const phase = clock * 1.6 + i * 1.7 + j * 2.4;
        const s = 0.55 + 0.45 * Math.sin(phase * 0.7) ** 2;
        m.makeScale(s, 1, 1);
        m.setPosition(
          tileCenter(tx) + (j ? 0.18 : -0.16) + Math.sin(phase) * 0.1,
          WATER_Y,
          tileCenter(tz) + (j ? 0.2 : -0.18),
        );
        ripples.setMatrixAt(k * 2 + j, m);
      }
    }
    ripples.count = waterCount * 2;
    if (waterCount > 0) ripples.instanceMatrix.needsUpdate = true;
  }

  const field = {
    coreX,
    coreZ,
    coreAlive: true,

    // Loads a stage. steelWall gives the core a steel wall (the title demo).
    load(stage, steelWall) {
      cells.fill(EMPTY);
      tiles.fill(EMPTY);
      const map = stage.map;
      for (let tz = 0; tz < TILES; tz++) {
        for (let tx = 0; tx < TILES; tx++) {
          const ch = map[tz][tx];
          const t = tz * TILES + tx;
          if (ch === '#') fillTile(tx, tz, BRICK, 0);
          else if (ch === 'L') fillTile(tx, tz, BRICK, 1);
          else if (ch === 'R') fillTile(tx, tz, BRICK, 2);
          else if (ch === 'T') fillTile(tx, tz, BRICK, 3);
          else if (ch === 'D') fillTile(tx, tz, BRICK, 4);
          else if (ch === '@') fillTile(tx, tz, STEEL, 0);
          else if (ch === 'l') fillTile(tx, tz, STEEL, 1);
          else if (ch === 'r') fillTile(tx, tz, STEEL, 2);
          else if (ch === 't') fillTile(tx, tz, STEEL, 3);
          else if (ch === 'd') fillTile(tx, tz, STEEL, 4);
          else if (ch === '~') {
            fillTile(tx, tz, WATER, 0);
            tiles[t] = WATER;
          } else if (ch === '%') {
            fillTile(tx, tz, TREES, 0);
            tiles[t] = TREES;
          } else if (ch === '=') {
            fillTile(tx, tz, ICE, 0);
            tiles[t] = ICE;
          }
        }
      }

      // Spawn tiles and the core's corner of the field are always open.
      for (let k = 0; k < ENEMY_COLS.length; k++) clearTile(ENEMY_COLS[k], 0);
      clearTile(PLAYER_COL, TILES - 1);
      for (let tz = TILES - 2; tz < TILES; tz++) {
        for (let tx = CORE_COL - 1; tx <= CORE_COL + 1; tx++) clearTile(tx, tz);
      }
      fillTile(CORE_COL, TILES - 1, CORE, 0);
      this.setCoreWall(steelWall ? STEEL : BRICK);

      this.coreAlive = true;
      plinth.visible = true;
      crystal.visible = true;
      rubble.visible = false;

      // The intro sweeps from the top row down.
      introEnd = 0;
      for (let i = 0; i < CELLS; i++) {
        delay[i] = Math.floor(i / N) * 0.022 + Math.random() * 0.12;
        introEnd = Math.max(introEnd, delay[i] + RISE_TIME);
      }
      for (let i = 0; i < TILE_COUNT; i++) tileDelay[i] = delay[(Math.floor(i / TILES) * 2) * N];
      introT = 0;
      writeTiles();
      writeSolids();
    },

    // True while the stage intro is still running.
    building() {
      return introT < introEnd;
    },

    kind(cx, cz) {
      if (cx < 0 || cz < 0 || cx >= N || cz >= N) return STEEL;
      return cells[cz * N + cx];
    },

    // True if a tank cannot drive into the cell.
    blocks(cx, cz) {
      if (cx < 0 || cz < 0 || cx >= N || cz >= N) return true;
      const k = cells[cz * N + cx];
      return k === BRICK || k === STEEL || k === WATER || k === CORE;
    },

    isIce(x, z) {
      return this.kind(toCell(x), toCell(z)) === ICE;
    },

    // Rebuilds the core's wall as kind (BRICK or STEEL); the shovel uses it.
    setCoreWall(kind) {
      for (let k = 0; k < CORE_WALL.length; k += 2) setCell(CORE_WALL[k], CORE_WALL[k + 1], kind);
      solidDirty = true;
    },

    destroyCore() {
      this.coreAlive = false;
      plinth.visible = false;
      crystal.visible = false;
      rubble.visible = true;
    },

    // A bullet head at (x, z) travelling in dir. It is as wide as a tank, so
    // it touches the two cells either side of its line. Returns a HIT_* code;
    // broken cells are cleared here.
    bulletHit(x, z, dir, power) {
      let ca;
      let cb;
      let ra;
      let rb;
      if (DIR_X[dir] === 0) {
        ra = rb = toCell(z);
        ca = toCell(x - 0.25);
        cb = toCell(x + 0.25);
      } else {
        ca = cb = toCell(x);
        ra = toCell(z - 0.25);
        rb = toCell(z + 0.25);
      }
      let result = hitCell(ca, ra, power);
      if (ca !== cb || ra !== rb) result = Math.max(result, hitCell(cb, rb, power));
      return result;
    },

    // A random open spot for a power-up (centre on the cell grid), written to out.
    itemSpot(out) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const cx = 1 + Math.floor(Math.random() * (N - 3));
        const cz = 1 + Math.floor(Math.random() * (N - 6));
        let ok = true;
        for (let q = 0; q < 4 && ok; q++) {
          const k = cells[(cz + (q >> 1)) * N + cx + (q & 1)];
          // Late tries accept bricks: the player can shoot their way in.
          if (k !== EMPTY && k !== ICE && !(attempt > 40 && k === BRICK)) ok = false;
        }
        if (!ok) continue;
        out.x = -HALF + (cx + 1) * CELL;
        out.z = -HALF + (cz + 1) * CELL;
        return;
      }
      out.x = 0;
      out.z = 0;
    },

    update(dt) {
      clock += dt;
      if (introT < introEnd) {
        introT += dt;
        solidDirty = true;
        writeTrees();
      }
      if (solidDirty) {
        solidDirty = false;
        writeSolids();
      }
      writeRipples();
      crystal.position.set(coreX, 0.62 + Math.sin(clock * 2.2) * 0.05, coreZ);
      crystal.rotation.y = clock * 1.4;
      const glow = 0.5 + 0.5 * Math.sin(clock * 3.1);
      crystalMaterial.emissive.setRGB(0.08 + glow * 0.12, 0.42 + glow * 0.25, 0.5 + glow * 0.25);
      waterMaterial.emissive.setRGB(0.02, 0.15 + Math.sin(clock * 1.3) * 0.03, 0.22);
    },
  };

  function hitCell(cx, cz, power) {
    if (cx < 0 || cz < 0 || cx >= N || cz >= N) return HIT_NONE;
    const i = cz * N + cx;
    const k = cells[i];
    if (k === BRICK) {
      cells[i] = EMPTY;
      solidDirty = true;
      return HIT_BRICK;
    }
    if (k === STEEL) {
      if (!power) return HIT_CLANK;
      cells[i] = EMPTY;
      solidDirty = true;
      return HIT_STEEL;
    }
    if (k === CORE) return field.coreAlive ? HIT_CORE : HIT_CLANK;
    return HIT_NONE;
  }

  return field;
}
