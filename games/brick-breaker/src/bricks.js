// The brick grid: every brick is one instance of a single InstancedMesh,
// colored per instance. Instance i always belongs to grid cell i; empty cells
// get a zero-scale matrix, and the draw count stops after the level's last
// brick. Matrices and colors are rewritten only for cells that changed or are
// animating.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIELD_TOP, box } from './shared.js';

export const COLS = 11;
export const ROWS = 8;
const CELLS = COLS * ROWS;
const CELL_W = 1.3;
const CELL_D = 0.72;
export const BRICK_HW = 0.58; // half width of a brick's hit box
export const BRICK_HD = 0.28; // half depth
const GRID_X0 = (-COLS * CELL_W) / 2;
const GRID_Z0 = FIELD_TOP + 1.0;
const GRID_Z1 = GRID_Z0 + ROWS * CELL_D;

const COLORS = {
  r: 0xff5d73,
  o: 0xff9f45,
  y: 0xffdc4a,
  g: 0x6fdc6a,
  t: 0x34d6c4,
  b: 0x4d9dff,
  p: 0xa66bff,
  k: 0xff6fc8,
};
const STEEL = [0, 0xeef3fa, 0xa9b5c9, 0x6f7c96]; // by hits left: lighter as it cracks
const GOLD = 0xf2b52a;
// Bomb bricks glow between these two, so they read as live, and carry a dark
// cap with a fuse on top.
const BOMB_DIM = new THREE.Color(0x3a2440);
const BOMB_HOT = new THREE.Color(0xff5a2a);
const BOMB_PULSE = 7; // radians per second
const GOLD_H = 1.9; // gold bricks stand taller and carry rivets so they read as different

const POP_TIME = 0.16;
const FLASH_TIME = 0.14;
const DIE_TIME = 0.09;
const FALL_TIME = 0.45; // intro: each brick drops in from above
const DROP_H = 9;
const BLAST_DELAY = 0.09; // a bomb hits the bricks around it this long after it breaks

// Body plus a slightly inset top plate. The vertex colors are grey and white
// and get multiplied by the instance color, which gives a cheap bevel look.
function brickGeometry() {
  return mergeGeometries([
    box(1.16, 0.4, 0.56, 0, 0.2, 0, 0xc4c4c4),
    box(1.0, 0.1, 0.42, 0, 0.44, 0, 0xffffff),
  ]);
}

// Four rivets on the top of a gold brick (sized for a brick of height 0.5,
// then scaled with the brick).
function rivetGeometry() {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    parts.push(box(0.12, 0.05, 0.1, k < 2 ? -0.38 : 0.38, 0.5, k % 2 ? -0.12 : 0.12, 0xfff4cf));
  }
  return mergeGeometries(parts);
}

// onBlast(cell, result) is called when a bomb's blast hits a brick, with
// what hit() returned.
// The dark cap and fuse on a bomb brick (sized like the rivets).
function bombCapGeometry() {
  return mergeGeometries([
    box(0.84, 0.05, 0.34, 0, 0.5, 0, 0x1c1426),
    box(0.16, 0.12, 0.16, 0, 0.56, 0, 0xffd84a),
  ]);
}

export function createBricks(scene, onBlast) {
  const mesh = new THREE.InstancedMesh(
    brickGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    CELLS,
  );
  mesh.frustumCulled = false; // instances change, so the cached bounds would be wrong
  scene.add(mesh);

  // Fake shadows: dark transparent quads, offset a little down and right.
  const shadowGeometry = new THREE.PlaneGeometry(1.2, 0.6);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    CELLS,
  );
  shadows.frustumCulled = false;
  scene.add(shadows);

  // Rivets: decoration for gold bricks, one instance per gold brick of the
  // level (goldSlot maps a cell to its instance), so only those are drawn.
  const rivets = new THREE.InstancedMesh(rivetGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), CELLS);
  rivets.frustumCulled = false;
  rivets.count = 0;
  scene.add(rivets);

  // Bomb caps, one instance per bomb of the level in the same way.
  const caps = new THREE.InstancedMesh(bombCapGeometry(), rivets.material, CELLS);
  caps.frustumCulled = false;
  caps.count = 0;
  scene.add(caps);

  const hp = new Int8Array(CELLS); // 0 empty, -1 gold, otherwise hits left
  const maxHp = new Int8Array(CELLS);
  const bomb = new Uint8Array(CELLS);
  const goldSlot = new Int16Array(CELLS);
  const bombSlot = new Int16Array(CELLS);
  const color = new Uint32Array(CELLS);
  const pop = new Float32Array(CELLS);
  const flash = new Float32Array(CELLS);
  const dying = new Float32Array(CELLS);
  const delay = new Float32Array(CELLS);
  const blast = new Float32Array(CELLS); // seconds until a pending blast hits this cell
  const dirty = new Uint8Array(CELLS);

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const WHITE = new THREE.Color(0xffffff);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let remaining = 0;
  let introT = 0;
  let introEnd = 0;
  let bombs = 0; // bombs left, which glow every frame
  let nextBomb = 0; // where nextBomb() looks first
  let blasts = 0; // cells waiting for a blast
  let pulse = 0;

  for (let i = 0; i < CELLS; i++) {
    mesh.setMatrixAt(i, ZERO);
    mesh.setColorAt(i, WHITE);
    shadows.setMatrixAt(i, ZERO);
    rivets.setMatrixAt(i, ZERO);
  }

  const cellX = (i) => GRID_X0 + ((i % COLS) + 0.5) * CELL_W;
  const cellZ = (i) => GRID_Z0 + (Math.floor(i / COLS) + 0.5) * CELL_D;

  function write(i, intro) {
    if (bomb[i] && hp[i] === 0) caps.setMatrixAt(bombSlot[i], ZERO);
    if (hp[i] === 0 && dying[i] <= 0) {
      mesh.setMatrixAt(i, ZERO);
      shadows.setMatrixAt(i, ZERO);
      return;
    }
    const x = cellX(i);
    const z = cellZ(i);
    let t = 1;
    if (intro) t = Math.min(1, Math.max(0, (introT - delay[i]) / FALL_TIME));
    const y = DROP_H * (1 - t) * (1 - t) * (1 - t);

    let s = 1;
    if (pop[i] > 0) s += Math.sin((pop[i] / POP_TIME) * Math.PI) * 0.18;
    if (dying[i] > 0) s = 1 + (1 - dying[i] / DIE_TIME) * 0.4;
    const sy = hp[i] < 0 ? GOLD_H * s : s;
    m.makeScale(s, sy, s).setPosition(x, y, z);
    mesh.setMatrixAt(i, m);
    if (hp[i] < 0) rivets.setMatrixAt(goldSlot[i], m);
    else if (bomb[i] && hp[i] > 0) caps.setMatrixAt(bombSlot[i], m);

    if (bomb[i] && hp[i] > 0) c.lerpColors(BOMB_DIM, BOMB_HOT, 0.5 + 0.5 * Math.sin(pulse));
    else c.setHex(color[i]);
    if (dying[i] > 0) c.copy(WHITE);
    else if (flash[i] > 0) c.lerp(WHITE, flash[i] / FLASH_TIME);
    mesh.setColorAt(i, c);

    if (dying[i] > 0) {
      shadows.setMatrixAt(i, ZERO);
    } else {
      const off = hp[i] < 0 ? 0.24 : 0.12;
      m.makeScale(t, 1, t).setPosition(x + off, 0.02, z + off * 1.2);
      shadows.setMatrixAt(i, m);
    }
  }

  return {
    cellX,
    cellZ,

    // Loads a level map (an array of strings) and starts the drop-in intro.
    load(map) {
      remaining = 0;
      introEnd = 0;
      bombs = 0;
      blasts = 0;
      nextBomb = 0;
      let gold = 0;
      let last = -1;
      for (let i = 0; i < CELLS; i++) {
        hp[i] = 0;
        maxHp[i] = 0;
        bomb[i] = 0;
        blast[i] = 0;
        pop[i] = 0;
        flash[i] = 0;
        dying[i] = 0;
        dirty[i] = 1;
      }
      for (let r = 0; r < map.length && r < ROWS; r++) {
        const row = map[r];
        for (let col = 0; col < COLS; col++) {
          const ch = row[col];
          const i = r * COLS + col;
          if (ch === '#') {
            hp[i] = -1;
            color[i] = GOLD;
            goldSlot[i] = gold++;
          } else if (ch === 'x') {
            hp[i] = maxHp[i] = 1;
            bomb[i] = 1;
            color[i] = BOMB_HOT.getHex();
            bombSlot[i] = bombs++;
            remaining++;
          } else if (ch === '2' || ch === '3') {
            hp[i] = maxHp[i] = ch === '2' ? 2 : 3;
            color[i] = STEEL[hp[i]];
            remaining++;
          } else if (COLORS[ch] !== undefined) {
            hp[i] = maxHp[i] = 1;
            color[i] = COLORS[ch];
            remaining++;
          } else {
            continue;
          }
          delay[i] = r * 0.07 + Math.abs(col - 5) * 0.03 + Math.random() * 0.05;
          introEnd = Math.max(introEnd, delay[i] + FALL_TIME);
          last = i;
        }
      }
      mesh.count = last + 1;
      shadows.count = last + 1;
      rivets.count = gold;
      caps.count = bombs;
      introT = 0;
    },

    // True once every brick has landed.
    ready() {
      return introT >= introEnd;
    },

    remaining() {
      return remaining;
    },

    colorOf(i) {
      return color[i];
    },

    maxHp(i) {
      return maxHp[i];
    },

    // True for a brick that can still be hit and broken (not gold, not gone).
    breakable(i) {
      return hp[i] > 0;
    },

    isBomb(i) {
      return bomb[i] === 1;
    },

    // The cell of a live bomb, a different one each call (for the fuse
    // sparks), or -1 when none is left.
    nextBomb() {
      if (bombs === 0) return -1;
      for (let k = 0; k < CELLS; k++) {
        const i = (nextBomb + k) % CELLS;
        if (bomb[i] && hp[i] > 0) {
          nextBomb = i + 1;
          return i;
        }
      }
      return -1;
    },

    // The brick whose hit box overlaps a square of half size r around (x, z),
    // or -1. axis 0 (moving along x) prefers the brick most in line in z,
    // axis 1 the one most in line in x, so a ball hitting the seam between
    // two bricks only hits one of them.
    find(x, z, r, axis) {
      if (z < GRID_Z0 - r || z > GRID_Z1 + r) return -1;
      const col = Math.floor((x - GRID_X0) / CELL_W);
      const row = Math.floor((z - GRID_Z0) / CELL_D);
      let best = -1;
      let bestD = 1e9;
      for (let rr = row - 1; rr <= row + 1; rr++) {
        if (rr < 0 || rr >= ROWS) continue;
        for (let cc = col - 1; cc <= col + 1; cc++) {
          if (cc < 0 || cc >= COLS) continue;
          const i = rr * COLS + cc;
          if (hp[i] === 0) continue;
          const ox = Math.abs(x - cellX(i));
          const oz = Math.abs(z - cellZ(i));
          if (ox >= BRICK_HW + r || oz >= BRICK_HD + r) continue;
          const d = axis === 0 ? oz : ox;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
      }
      return best;
    },

    // Hits brick i. Returns 0 for gold (no damage), 1 when it cracked and
    // 2 when it broke.
    hit(i) {
      dirty[i] = 1;
      flash[i] = FLASH_TIME;
      pop[i] = POP_TIME;
      if (hp[i] < 0) return 0;
      hp[i]--;
      if (hp[i] > 0) {
        color[i] = STEEL[hp[i]];
        return 1;
      }
      dying[i] = DIE_TIME;
      remaining--;
      if (bomb[i]) {
        bombs--;
        // The blast reaches the eight cells around it a moment later.
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        for (let r = row - 1; r <= row + 1; r++) {
          for (let cc = col - 1; cc <= col + 1; cc++) {
            if (r < 0 || r >= ROWS || cc < 0 || cc >= COLS) continue;
            const n = r * COLS + cc;
            if (hp[n] > 0 && blast[n] <= 0) {
              blast[n] = BLAST_DELAY;
              blasts++;
            }
          }
        }
      }
      return 2;
    },

    // True while a blast is still on its way to some brick.
    blasting() {
      return blasts > 0;
    },

    update(dt) {
      if (blasts > 0) {
        for (let i = 0; i < CELLS; i++) {
          if (blast[i] <= 0) continue;
          blast[i] -= dt;
          if (blast[i] > 0) continue;
          blasts--;
          if (hp[i] > 0) onBlast(i, this.hit(i));
        }
      }
      const intro = introT < introEnd;
      if (intro) introT += dt;
      pulse = (pulse + dt * BOMB_PULSE) % (Math.PI * 2);
      let wrote = false;
      const n = mesh.count;
      for (let i = 0; i < n; i++) {
        let d = dirty[i] || intro || (bombs > 0 && bomb[i] && hp[i] > 0);
        if (pop[i] > 0) {
          pop[i] = Math.max(0, pop[i] - dt);
          d = 1;
        }
        if (flash[i] > 0) {
          flash[i] = Math.max(0, flash[i] - dt);
          d = 1;
        }
        if (dying[i] > 0) {
          dying[i] = Math.max(0, dying[i] - dt);
          d = 1;
        }
        if (!d) continue;
        dirty[i] = 0;
        write(i, intro);
        wrote = true;
      }
      if (wrote) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        shadows.instanceMatrix.needsUpdate = true;
        rivets.instanceMatrix.needsUpdate = true;
        caps.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
