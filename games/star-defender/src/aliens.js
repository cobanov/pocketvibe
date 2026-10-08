// The alien formation: 5 rows x 10 columns, three kinds, one InstancedMesh
// per kind. The formation marches sideways in steps, drops a row at the
// edges and speeds up as it thins out.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACE_TILT, FIELD_HALF, box, part } from './shared.js';

export const COLS = 10;
export const ROWS = 5;
const COUNT = COLS * ROWS;
const COL_W = 1.6;
const ROW_D = 1.6;
const STEP_X = 0.3;
const STEP_Z = 0.55;
const MODEL_SCALE = 1.2;
export const ALIEN_HALF_W = 0.6 * MODEL_SCALE;
export const ALIEN_HALF_D = 0.42 * MODEL_SCALE;
export const ALIEN_Y = 0.55;
const FIRST_FRONT_Z = -1.4; // z of the front row on wave 1
const WAVE_ADVANCE = 0.45; // each later wave starts this much closer
const ENTER_TIME = 1.2; // seconds the formation takes to fly in
const POP_TIME = 0.08; // a hit alien flashes white this long before it bursts
const SHOT_HALF_W = 0.07; // half the width of a player bullet

const TYPE_OF_ROW = [0, 1, 1, 2, 2];
export const POINTS = [30, 20, 10];
export const ROW_COLORS = [0xff5ac8, 0x46e0ff, 0x7d8cff, 0xffd84a, 0xff9a3c];
const EYE = 0x1a1033;
const BODY = 0xffffff; // tinted per row by the instance color

// Models face +z (towards the ship). Each is about 1.1 wide and 0.9 tall
// before MODEL_SCALE.
function stingerGeometry() {
  const body = new THREE.OctahedronGeometry(0.42, 0);
  body.scale(1.15, 0.95, 0.6);
  return mergeGeometries([
    part(body, 0, 0, 0, BODY),
    box(0.06, 0.34, 0.06, -0.2, 0.42, 0, BODY, 0.45),
    box(0.06, 0.34, 0.06, 0.2, 0.42, 0, BODY, -0.45),
    box(0.13, 0.13, 0.13, -0.3, 0.6, 0, BODY),
    box(0.13, 0.13, 0.13, 0.3, 0.6, 0, BODY),
    box(0.13, 0.14, 0.2, -0.14, 0.04, 0.16, EYE),
    box(0.13, 0.14, 0.2, 0.14, 0.04, 0.16, EYE),
    box(0.07, 0.26, 0.07, -0.14, -0.42, 0, BODY, -0.3),
    box(0.07, 0.26, 0.07, 0.14, -0.42, 0, BODY, 0.3),
  ]);
}

function crabGeometry() {
  return mergeGeometries([
    box(0.8, 0.42, 0.42, 0, 0, 0, BODY),
    box(0.5, 0.18, 0.36, 0, 0.29, 0, BODY),
    box(0.2, 0.46, 0.26, -0.55, 0.16, 0, BODY, 0.45),
    box(0.2, 0.46, 0.26, 0.55, 0.16, 0, BODY, -0.45),
    box(0.1, 0.24, 0.14, -0.28, -0.3, 0, BODY, -0.2),
    box(0.1, 0.24, 0.14, 0.28, -0.3, 0, BODY, 0.2),
    box(0.1, 0.2, 0.14, -0.09, -0.28, 0, BODY),
    box(0.1, 0.2, 0.14, 0.09, -0.28, 0, BODY),
    box(0.15, 0.15, 0.1, -0.18, 0.05, 0.2, EYE),
    box(0.15, 0.15, 0.1, 0.18, 0.05, 0.2, EYE),
  ]);
}

function jellyGeometry() {
  const dome = new THREE.SphereGeometry(0.46, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1.2, 0.95, 0.85);
  const rim = new THREE.CylinderGeometry(0.58, 0.5, 0.14, 8);
  rim.scale(1, 1, 0.85);
  return mergeGeometries([
    part(dome, 0, -0.05, 0, BODY),
    part(rim, 0, -0.1, 0, BODY),
    box(0.1, 0.32, 0.1, -0.42, -0.3, 0, BODY, -0.3),
    box(0.1, 0.32, 0.1, -0.15, -0.32, 0.1, BODY),
    box(0.1, 0.32, 0.1, 0.15, -0.32, 0.1, BODY),
    box(0.1, 0.32, 0.1, 0.42, -0.3, 0, BODY, 0.3),
    box(0.14, 0.17, 0.14, -0.17, 0.13, 0.31, EYE),
    box(0.14, 0.17, 0.14, 0.17, 0.13, 0.31, EYE),
  ]);
}

export function createAliens(scene) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const geometries = [stingerGeometry(), crabGeometry(), jellyGeometry()];
  for (let t = 0; t < geometries.length; t++) geometries[t].scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
  const perType = [0, 0, 0];
  for (let r = 0; r < ROWS; r++) perType[TYPE_OF_ROW[r]] += COLS;
  const meshes = geometries.map((g, t) => {
    const mesh = new THREE.InstancedMesh(g, material, perType[t]);
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    scene.add(mesh);
    return mesh;
  });

  // Each slot (row * COLS + col) owns a fixed instance in its kind's mesh;
  // dead aliens get a zero-scale matrix, so instance colors never shuffle.
  const typeOf = new Uint8Array(COUNT);
  const instOf = new Uint8Array(COUNT);
  const used = [0, 0, 0];
  for (let i = 0; i < COUNT; i++) {
    const t = TYPE_OF_ROW[Math.floor(i / COLS)];
    typeOf[i] = t;
    instOf[i] = used[t]++;
  }

  const alive = new Uint8Array(COUNT);
  const pop = new Float32Array(COUNT);
  const ax = new Float32Array(COUNT); // drawn position, used for hit tests
  const az = new Float32Array(COUNT);
  const rowColors = ROW_COLORS.map((hex) => new THREE.Color(hex));
  const white = new THREE.Color(0xffffff);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const dummy = new THREE.Object3D();

  let offX = 0; // logical formation offset; it moves in steps
  let offZ = 0;
  let drawX = 0; // drawn offset, eased towards the logical one
  let drawZ = 0;
  let dir = 1;
  let stepTimer = 0;
  let frame = 0;
  let enterT = 0;
  let bob = 0;
  let speedFactor = 1;
  let colorsDirty = true;

  function setColor(i, color) {
    meshes[typeOf[i]].setColorAt(instOf[i], color);
    colorsDirty = true;
  }

  function interval() {
    // Proportional to the number of aliens left, like the arcade original:
    // the last one races across the screen.
    return Math.max(0.05, aliens.living * 0.015) * speedFactor;
  }

  // Index of the front-most living alien in column c, or -1.
  function frontOf(c) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (alive[r * COLS + c]) return r * COLS + c;
    }
    return -1;
  }

  const aliens = {
    living: 0,
    frontZ: 0, // z of the living alien closest to the ship
    stepped: false, // true on frames where the formation took a step
    ax,
    az,

    reset(wave) {
      for (let i = 0; i < COUNT; i++) {
        alive[i] = 1;
        pop[i] = 0;
        setColor(i, rowColors[Math.floor(i / COLS)]);
      }
      aliens.living = COUNT;
      offX = 0;
      offZ = FIRST_FRONT_Z + Math.min(wave - 1, 6) * WAVE_ADVANCE;
      drawX = offX;
      drawZ = offZ;
      dir = 1;
      frame = 0;
      enterT = 0;
      speedFactor = Math.max(0.55, 1 - 0.07 * (wave - 1));
      stepTimer = interval();
      aliens.draw();
    },

    // True while the formation is still flying in at the start of a wave.
    get entering() {
      return enterT < ENTER_TIME;
    },

    // marching is false while the game holds the formation still.
    update(dt, marching, shields) {
      aliens.stepped = false;
      bob += dt;
      if (enterT < ENTER_TIME) {
        enterT += dt;
      } else if (marching && aliens.living > 0) {
        stepTimer -= dt;
        if (stepTimer <= 0) {
          stepTimer = interval();
          aliens.step(shields);
        }
      }
      for (let i = 0; i < COUNT; i++) {
        if (pop[i] > 0) pop[i] -= dt;
      }
      const ease = Math.min(1, dt * 22);
      drawX += (offX - drawX) * ease;
      drawZ += (offZ - drawZ) * ease;
      aliens.draw();
    },

    // One march step: sideways, or one row closer and turn at an edge.
    step(shields) {
      aliens.stepped = true;
      frame ^= 1;
      let minC = COLS;
      let maxC = -1;
      for (let i = 0; i < COUNT; i++) {
        if (!alive[i]) continue;
        const c = i % COLS;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
      const next = offX + dir * STEP_X;
      const left = next + (minC - (COLS - 1) / 2) * COL_W - ALIEN_HALF_W;
      const right = next + (maxC - (COLS - 1) / 2) * COL_W + ALIEN_HALF_W;
      if (right > FIELD_HALF || left < -FIELD_HALF) {
        offZ += STEP_Z;
        dir = -dir;
      } else {
        offX = next;
      }

      // Aliens that reach the bunkers eat through them.
      for (let i = 0; i < COUNT; i++) {
        if (!alive[i]) continue;
        const x = offX + ((i % COLS) - (COLS - 1) / 2) * COL_W;
        const z = offZ - (ROWS - 1 - Math.floor(i / COLS)) * ROW_D;
        shields.erase(x - ALIEN_HALF_W, x + ALIEN_HALF_W, z - ALIEN_HALF_D, z + ALIEN_HALF_D);
      }
    },

    // Returns the slot of a living alien that a shot moving from z0 to z1
    // along x passes through (the first one it meets), or -1.
    hit(x, z0, z1) {
      if (enterT < ENTER_TIME) return -1;
      const lo = Math.min(z0, z1) - ALIEN_HALF_D;
      const hi = Math.max(z0, z1) + ALIEN_HALF_D;
      let found = -1;
      for (let i = 0; i < COUNT; i++) {
        if (!alive[i] || az[i] < lo || az[i] > hi) continue;
        if (Math.abs(ax[i] - x) > ALIEN_HALF_W + SHOT_HALF_W) continue;
        if (found < 0 || az[i] > az[found]) found = i;
      }
      return found;
    },

    // Kills the alien in slot i and returns its points.
    kill(i) {
      alive[i] = 0;
      pop[i] = POP_TIME;
      setColor(i, white);
      aliens.living--;
      return POINTS[typeOf[i]];
    },

    colorOf(i) {
      return ROW_COLORS[Math.floor(i / COLS)];
    },

    // Picks the alien that drops the next bomb: the front alien of a random
    // column, or of the column closest to the ship when aim is true.
    shooter(shipX, aim) {
      if (aliens.living === 0) return -1;
      if (aim) {
        let best = -1;
        for (let c = 0; c < COLS; c++) {
          const i = frontOf(c);
          if (i >= 0 && (best < 0 || Math.abs(ax[i] - shipX) < Math.abs(ax[best] - shipX))) best = i;
        }
        return best;
      }
      const start = Math.floor(Math.random() * COLS);
      for (let k = 0; k < COLS; k++) {
        const i = frontOf((start + k) % COLS);
        if (i >= 0) return i;
      }
      return -1;
    },

    draw() {
      const s = frame ? 1 : -1;
      let front = -100;
      for (let i = 0; i < COUNT; i++) {
        const mesh = meshes[typeOf[i]];
        if (!alive[i] && pop[i] <= 0) {
          mesh.setMatrixAt(instOf[i], hidden);
          continue;
        }
        const r = Math.floor(i / COLS);
        const c = i % COLS;
        const x = drawX + (c - (COLS - 1) / 2) * COL_W;
        const z = drawZ - (ROWS - 1 - r) * ROW_D;
        ax[i] = x;
        az[i] = z;
        if (alive[i] && z > front) front = z;

        // Fly-in: each alien drops from above, front rows first.
        const t = Math.min(1, Math.max(0, (enterT - (ROWS - 1 - r) * 0.08 - c * 0.03) / 0.6));
        const drop = (1 - t) * (1 - t) * (1 - t) * 12;
        dummy.position.set(x, ALIEN_Y + drop + Math.sin(bob * 3 + c * 0.7 + r) * 0.06, z);
        dummy.rotation.set(-FACE_TILT, 0, 0);
        dummy.scale.set(1, 1, 1);

        // Two-frame wobble, a different move for each kind.
        const type = typeOf[i];
        if (type === 0) {
          dummy.rotation.y = s * 0.32;
        } else if (type === 1) {
          dummy.rotation.z = s * 0.14;
          dummy.scale.x = 1 + s * 0.06;
        } else {
          dummy.scale.set(1 - s * 0.07, 1 + s * 0.1, 1);
        }
        if (pop[i] > 0) dummy.scale.multiplyScalar(1.4);
        dummy.updateMatrix();
        mesh.setMatrixAt(instOf[i], dummy.matrix);
      }
      aliens.frontZ = front;
      for (let t = 0; t < meshes.length; t++) {
        meshes[t].instanceMatrix.needsUpdate = true;
        if (colorsDirty) meshes[t].instanceColor.needsUpdate = true;
      }
      colorsDirty = false;
    },
  };

  aliens.reset(1);
  return aliens;
}
