// Four bunkers made of small blocks that chip away. All blocks are one
// InstancedMesh; the instance data is rebuilt only when a block changes.

import * as THREE from 'three';
import { SHIELD_Z, boxGeometry } from './shared.js';

const BS = 0.3; // block size
const COLS = 10;
const ROWS = 6;
const PER = COLS * ROWS;
// Row 0 faces the aliens, the last row faces the ship.
const MASK = [
  '...XXXX...',
  '.XXXXXXXX.',
  'XXXXXXXXXX',
  'XXXXXXXXXX',
  'XXXX..XXXX',
  'XXX....XXX',
];
export const SHIELD_X = [-7.2, -2.4, 2.4, 7.2];
const COUNT = SHIELD_X.length * PER;
export const SHIELD_MIN_Z = SHIELD_Z - (ROWS / 2) * BS;
export const SHIELD_MAX_Z = SHIELD_Z + (ROWS / 2) * BS;
const HALF_W = (COLS / 2) * BS;
const TOP_COLOR = new THREE.Color(0xa6ff5c);
const BOTTOM_COLOR = new THREE.Color(0x2fd39a);

export function createShields(scene) {
  // No bottom (on the floor) and no back (always turned away from the camera).
  const geometry = boxGeometry(BS * 0.94, 0.5, BS * 0.94, 'ny nz');
  geometry.translate(0, 0.25, 0);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial(), COUNT);
  mesh.setColorAt(0, TOP_COLOR); // creates the color buffer
  scene.add(mesh);

  const hp = new Uint8Array(COUNT); // 0 gone, 1 cracked, 2 whole
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  let dirty = true;

  function draw() {
    let n = 0;
    for (let i = 0; i < COUNT; i++) {
      if (hp[i] === 0) continue;
      const b = Math.floor(i / PER);
      const r = Math.floor((i % PER) / COLS);
      const c = i % COLS;
      matrix.makeScale(1, hp[i] === 2 ? 1 : 0.55, 1);
      matrix.setPosition(SHIELD_X[b] + (c - COLS / 2 + 0.5) * BS, 0, SHIELD_Z + (r - ROWS / 2 + 0.5) * BS);
      mesh.setMatrixAt(n, matrix);
      color.lerpColors(TOP_COLOR, BOTTOM_COLOR, r / (ROWS - 1));
      if (hp[i] === 1) color.multiplyScalar(0.55);
      mesh.setColorAt(n, color);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    // The bunkers never move, so the bounds only change when blocks go.
    mesh.computeBoundingSphere();
    dirty = false;
  }

  function damage(i, amount) {
    if (hp[i] === 0) return;
    hp[i] = Math.max(0, hp[i] - amount);
    dirty = true;
  }

  const shields = {
    // Where the last hit landed, for the debris particles.
    hitX: 0,
    hitZ: 0,

    reset() {
      for (let b = 0; b < SHIELD_X.length; b++) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) hp[b * PER + r * COLS + c] = MASK[r][c] === 'X' ? 2 : 0;
        }
      }
      dirty = true;
    },

    // Tests a shot that moved from z0 to z1 along x. Damages the first block
    // it meets and returns true. Bombs (explosive) also crack their neighbors.
    hit(x, z0, z1, explosive) {
      const lo = Math.min(z0, z1);
      const hi = Math.max(z0, z1);
      if (hi < SHIELD_MIN_Z || lo > SHIELD_MAX_Z) return false;
      let b = -1;
      for (let k = 0; k < SHIELD_X.length; k++) {
        if (Math.abs(x - SHIELD_X[k]) < HALF_W) b = k;
      }
      if (b < 0) return false;
      const c = Math.floor((x - SHIELD_X[b] + HALF_W) / BS);
      if (c < 0 || c >= COLS) return false;

      // Walk the rows in the direction of travel so the near side chips first.
      const down = z1 > z0;
      for (let k = 0; k < ROWS; k++) {
        const r = down ? k : ROWS - 1 - k;
        const rz0 = SHIELD_MIN_Z + r * BS;
        if (rz0 + BS < lo || rz0 > hi) continue;
        const i = b * PER + r * COLS + c;
        if (hp[i] === 0) continue;
        damage(i, explosive ? 2 : 1);
        if (explosive) {
          // Crack one block beside and one behind the hit.
          const side = Math.random() < 0.5 ? -1 : 1;
          if (c + side >= 0 && c + side < COLS) damage(i + side, 1);
          const next = r + (down ? 1 : -1);
          if (next >= 0 && next < ROWS) damage(b * PER + next * COLS + c, 1);
        }
        shields.hitX = SHIELD_X[b] + (c - COLS / 2 + 0.5) * BS;
        shields.hitZ = rz0 + BS / 2;
        return true;
      }
      return false;
    },

    // Removes every block whose center lies inside the box (aliens that
    // reach the bunkers eat through them).
    erase(x0, x1, z0, z1) {
      if (z1 < SHIELD_MIN_Z || z0 > SHIELD_MAX_Z) return;
      for (let i = 0; i < COUNT; i++) {
        if (hp[i] === 0) continue;
        const b = Math.floor(i / PER);
        const r = Math.floor((i % PER) / COLS);
        const c = i % COLS;
        const x = SHIELD_X[b] + (c - COLS / 2 + 0.5) * BS;
        const z = SHIELD_Z + (r - ROWS / 2 + 0.5) * BS;
        if (x > x0 && x < x1 && z > z0 && z < z1) {
          hp[i] = 0;
          dirty = true;
        }
      }
    },

    update() {
      if (dirty) draw();
    },
  };

  return shields;
}
