// The alien formation: 5 rows x 10 columns, three kinds, one InstancedMesh
// per kind. The formation marches sideways in steps, drops a row at the
// edges and speeds up as it thins out. A wave can leave slots empty (its
// formation), give rows armor (two hits) and send aliens diving at the ship.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FACE_TILT, FIELD_HALF, PLAYER_Z, SHIELD_Z, box, part, prune } from './shared.js';

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

// Diving: an alien leaves the formation, swoops over the bunkers at the ship
// and, if it misses, comes back into its slot from the far end.
const DIVE_Y = 1.55; // height over the bunkers
const DIVE_END_Z = 15.5; // past the bottom of the screen on every shape
const RETURN_FROM_Z = -22; // above the top of the screen on every shape
const RETURN_FROM_Y = 6;
const RETURN_SPEED = 10;

const TYPE_OF_ROW = [0, 1, 1, 2, 2];
export const POINTS = [30, 20, 10];
export const ROW_COLORS = [0xff5ac8, 0x46e0ff, 0x7d8cff, 0xffd84a, 0xff9a3c];
export const ARMOR_COLOR = 0xc4cee6;
const EYE = 0x1a1033;
const BODY = 0xffffff; // tinted per row by the instance color

// Models face +z (towards the ship). Each is about 1.1 wide and 0.9 tall
// before MODEL_SCALE. Faces that sit inside another part are left out.
function stingerGeometry() {
  const body = new THREE.OctahedronGeometry(0.42, 0);
  body.scale(1.15, 0.95, 0.6);
  return mergeGeometries([
    part(body, 0, 0, 0, BODY),
    box(0.06, 0.34, 0.06, -0.2, 0.42, 0, BODY, 0.45, 'py ny'),
    box(0.06, 0.34, 0.06, 0.2, 0.42, 0, BODY, -0.45, 'py ny'),
    box(0.13, 0.13, 0.13, -0.3, 0.6, 0, BODY),
    box(0.13, 0.13, 0.13, 0.3, 0.6, 0, BODY),
    box(0.13, 0.14, 0.2, -0.14, 0.04, 0.16, EYE),
    box(0.13, 0.14, 0.2, 0.14, 0.04, 0.16, EYE),
    box(0.07, 0.26, 0.07, -0.14, -0.42, 0, BODY, -0.3, 'py ny'),
    box(0.07, 0.26, 0.07, 0.14, -0.42, 0, BODY, 0.3, 'py ny'),
  ]);
}

function crabGeometry() {
  return mergeGeometries([
    box(0.8, 0.42, 0.42, 0, 0, 0, BODY),
    box(0.5, 0.18, 0.36, 0, 0.29, 0, BODY, 0, 'ny'),
    box(0.2, 0.46, 0.26, -0.55, 0.16, 0, BODY, 0.45),
    box(0.2, 0.46, 0.26, 0.55, 0.16, 0, BODY, -0.45),
    box(0.1, 0.24, 0.14, -0.28, -0.3, 0, BODY, -0.2, 'py ny'),
    box(0.1, 0.24, 0.14, 0.28, -0.3, 0, BODY, 0.2, 'py ny'),
    box(0.1, 0.2, 0.14, -0.09, -0.28, 0, BODY, 0, 'py ny'),
    box(0.1, 0.2, 0.14, 0.09, -0.28, 0, BODY, 0, 'py ny'),
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
    box(0.1, 0.32, 0.1, -0.42, -0.3, 0, BODY, -0.3, 'py ny'),
    box(0.1, 0.32, 0.1, -0.15, -0.32, 0.1, BODY, 0, 'py ny'),
    box(0.1, 0.32, 0.1, 0.15, -0.32, 0.1, BODY, 0, 'py ny'),
    box(0.1, 0.32, 0.1, 0.42, -0.3, 0, BODY, 0.3, 'py ny'),
    box(0.14, 0.17, 0.14, -0.17, 0.13, 0.31, EYE),
    box(0.14, 0.17, 0.14, 0.17, 0.13, 0.31, EYE),
  ]);
}

// Every way a kind of alien can be turned: leaning back at the camera, its
// two-frame wobble, and banking up to 0.8 rad while it dives.
function posesOf(type) {
  const wobble =
    type === 0
      ? [[0.32, 0, 1, 1], [0, 0, 1, 1], [-0.32, 0, 1, 1]]
      : type === 1
        ? [[0, 0.14, 1.06, 1], [0, -0.14, 0.94, 1]]
        : [[0, 0, 0.93, 1.1], [0, 0, 1.07, 0.9]];
  const poses = [];
  const euler = new THREE.Euler();
  for (const [y, z, sx, sy] of wobble) {
    for (const bank of [-0.8, -0.4, 0, 0.4, 0.8]) {
      const m = new THREE.Matrix4().makeRotationFromEuler(euler.set(-FACE_TILT, y, z + bank));
      poses.push(m.multiply(new THREE.Matrix4().makeScale(sx, sy, 1)));
    }
  }
  return poses;
}

export function createAliens(scene) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Everywhere an alien can be (marching and flying in from above, diving
  // past the ship, coming back from far away) and the camera (it follows
  // the ship a little and shakes).
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const X = FIELD_HALF + 1;
  const places = [
    [v(-X, 0.3, -14), v(X, 12.6, PLAYER_Z)],
    [v(-X, 0.3, -14), v(X, DIVE_Y + 0.1, DIVE_END_Z)],
    [v(-X, 0.3, RETURN_FROM_Z), v(X, RETURN_FROM_Y, 0)],
  ];
  const eye = [v(-1.5, 23, 13.5), v(1.5, 24, 13.5)];
  const geometries = [stingerGeometry(), crabGeometry(), jellyGeometry()].map((g, t) => {
    g.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
    return prune(g, posesOf(t), places, eye);
  });
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
  const hp = new Uint8Array(COUNT); // 2 while armored
  const pop = new Float32Array(COUNT);
  const flash = new Float32Array(COUNT); // armor just cracked
  const ax = new Float32Array(COUNT); // drawn position, used for hit tests
  const az = new Float32Array(COUNT);
  // Divers: 0 in formation, 1 swooping at the ship, 2 coming back.
  const dive = new Uint8Array(COUNT);
  const dx = new Float32Array(COUNT);
  const dy = new Float32Array(COUNT);
  const dz = new Float32Array(COUNT);
  const dvx = new Float32Array(COUNT);
  const dt0 = new Float32Array(COUNT); // seconds since the dive began
  const dBomb = new Uint8Array(COUNT); // 1 once this dive has dropped its bomb
  const rowColors = ROW_COLORS.map((hex) => new THREE.Color(hex));
  const armorColor = new THREE.Color(ARMOR_COLOR);
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
  let sizeFactor = 1;
  let diveSpeed = 6;
  let colorsDirty = true;

  function setColor(i, color) {
    meshes[typeOf[i]].setColorAt(instOf[i], color);
    colorsDirty = true;
  }

  function interval() {
    // Proportional to the number of aliens left, like the arcade original:
    // the last one races across the screen. Smaller formations start a
    // little faster than a full one.
    return Math.max(0.05, aliens.living * 0.015 * sizeFactor) * speedFactor;
  }

  // Index of the front-most living alien in column c still in the
  // formation, or -1.
  function frontOf(c) {
    for (let r = ROWS - 1; r >= 0; r--) {
      const i = r * COLS + c;
      if (alive[i] && !dive[i]) return i;
    }
    return -1;
  }

  function slotX(i) {
    return drawX + ((i % COLS) - (COLS - 1) / 2) * COL_W;
  }

  function slotZ(i) {
    return drawZ - (ROWS - 1 - Math.floor(i / COLS)) * ROW_D;
  }

  // Moves one diver; ship is { x } or null.
  function updateDiver(i, dt, ship) {
    dt0[i] += dt;
    if (dive[i] === 1) {
      // A short hop back and up, then the swoop, steering at the ship.
      const t = dt0[i];
      const vz = t < 0.45 ? -2.5 + (t / 0.45) * (diveSpeed + 2.5) : diveSpeed;
      dz[i] += vz * dt;
      const want = ship ? Math.max(-4, Math.min(4, (ship.x - dx[i]) * 1.4)) : dvx[i];
      dvx[i] += (want - dvx[i]) * Math.min(1, dt * 2.5);
      dx[i] = Math.max(-FIELD_HALF, Math.min(FIELD_HALF, dx[i] + dvx[i] * dt));
      // High over the bunkers, down to the ship's height at its line.
      const over = Math.min(1, t / 0.45) * Math.min(1, Math.max(0, (PLAYER_Z - 0.4 - dz[i]) / 1.8));
      dy[i] = ALIEN_Y + (DIVE_Y - ALIEN_Y) * over;
      if (dz[i] > DIVE_END_Z) {
        dive[i] = 2;
        dx[i] = slotX(i);
        dy[i] = RETURN_FROM_Y;
        dz[i] = RETURN_FROM_Z;
      }
    } else {
      // Back into the slot, which keeps marching.
      const tx = slotX(i) - dx[i];
      const ty = ALIEN_Y - dy[i];
      const tz = slotZ(i) - dz[i];
      const d = Math.hypot(tx, ty, tz);
      const move = Math.min(d, RETURN_SPEED * dt * Math.min(1, 0.3 + d / 3));
      if (d < 0.05) {
        dive[i] = 0;
        return;
      }
      dx[i] += (tx / d) * move;
      dy[i] += (ty / d) * move;
      dz[i] += (tz / d) * move;
    }
  }

  const aliens = {
    living: 0,
    frontZ: 0, // z of the living alien in formation closest to the ship
    stepped: false, // true on frames where the formation took a step
    dived: -1, // slot that started a dive this frame, or -1
    diveBomb: -1, // slot of a diver that wants to drop its bomb now, or -1
    ax,
    az,

    // layout: { mask: 5 strings of 10 ('X' = alien), armor: rows with armor }.
    reset(wave, layout, speed = 1, dives = 6) {
      aliens.living = 0;
      for (let i = 0; i < COUNT; i++) {
        const r = Math.floor(i / COLS);
        alive[i] = layout ? (layout.mask[r][i % COLS] === 'X' ? 1 : 0) : 1;
        hp[i] = layout?.armor?.includes(r) ? 2 : 1;
        pop[i] = 0;
        flash[i] = 0;
        dive[i] = 0;
        setColor(i, hp[i] === 2 ? armorColor : rowColors[r]);
        aliens.living += alive[i];
      }
      sizeFactor = Math.sqrt(COUNT / Math.max(1, aliens.living));
      offX = 0;
      offZ = FIRST_FRONT_Z + Math.min(wave - 1, 6) * WAVE_ADVANCE;
      drawX = offX;
      drawZ = offZ;
      dir = 1;
      frame = 0;
      enterT = 0;
      speedFactor = speed;
      diveSpeed = dives;
      stepTimer = interval();
      aliens.draw();
    },

    // True while the formation is still flying in at the start of a wave.
    get entering() {
      return enterT < ENTER_TIME;
    },

    // Aliens diving right now.
    get diving() {
      let n = 0;
      for (let i = 0; i < COUNT; i++) n += alive[i] && dive[i] ? 1 : 0;
      return n;
    },

    // marching is false while the game holds the formation still; ship is
    // the player's ship ({ x }) for divers to steer at, or null.
    update(dt, marching, shields, ship = null) {
      aliens.stepped = false;
      aliens.dived = -1;
      aliens.diveBomb = -1;
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
        if (flash[i] > 0) {
          flash[i] -= dt;
          if (flash[i] <= 0 && alive[i]) setColor(i, rowColors[Math.floor(i / COLS)]);
        }
        if (!alive[i] || !dive[i]) continue;
        updateDiver(i, dt, ship);
        // One bomb per dive, dropped while still in front of the bunkers.
        if (ship && dive[i] === 1 && !dBomb[i] && dz[i] < SHIELD_Z - 2.5 && dt0[i] > 0.5 && Math.abs(dx[i] - ship.x) < 2.2) {
          dBomb[i] = 1;
          aliens.diveBomb = i;
        }
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
        if (!alive[i] || dive[i]) continue;
        const x = offX + ((i % COLS) - (COLS - 1) / 2) * COL_W;
        const z = offZ - (ROWS - 1 - Math.floor(i / COLS)) * ROW_D;
        shields.erase(x - ALIEN_HALF_W, x + ALIEN_HALF_W, z - ALIEN_HALF_D, z + ALIEN_HALF_D);
      }
    },

    // Sends the front alien of a random column diving; returns its slot or -1.
    startDive() {
      if (enterT < ENTER_TIME || aliens.living < 2) return -1;
      const start = Math.floor(Math.random() * COLS);
      for (let k = 0; k < COLS; k++) {
        const i = frontOf((start + k) % COLS);
        if (i < 0) continue;
        dive[i] = 1;
        dx[i] = ax[i];
        dy[i] = ALIEN_Y;
        dz[i] = az[i];
        dvx[i] = 0;
        dt0[i] = 0;
        dBomb[i] = 0;
        aliens.dived = i;
        return i;
      }
      return -1;
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

    // A diver touching the ship's box, or -1.
    rammed(x, z, halfW, halfD) {
      for (let i = 0; i < COUNT; i++) {
        if (!alive[i] || dive[i] !== 1) continue;
        if (Math.abs(ax[i] - x) < halfW + ALIEN_HALF_W * 0.7 && Math.abs(az[i] - z) < halfD + ALIEN_HALF_D * 0.7) return i;
      }
      return -1;
    },

    // A shot hits the alien in slot i: armor cracks (returns 0) or the alien
    // dies (returns its points, doubled while diving).
    strike(i) {
      if (hp[i] > 1) {
        hp[i]--;
        flash[i] = POP_TIME;
        setColor(i, white);
        return 0;
      }
      return aliens.kill(i);
    },

    // Kills the alien in slot i and returns its points.
    kill(i) {
      const points = POINTS[typeOf[i]] * (dive[i] ? 2 : 1);
      alive[i] = 0;
      pop[i] = POP_TIME;
      flash[i] = 0;
      setColor(i, white);
      aliens.living--;
      return points;
    },

    isDiving(i) {
      return dive[i] !== 0;
    },

    typeOf(i) {
      return typeOf[i];
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
        let bank = 0;
        if (dive[i]) {
          ax[i] = dx[i];
          az[i] = dz[i];
          dummy.position.set(dx[i], dy[i], dz[i]);
          if (dive[i] === 1) bank = Math.max(-0.8, Math.min(0.8, -dvx[i] * 0.2));
        } else {
          const x = slotX(i);
          const z = slotZ(i);
          ax[i] = x;
          az[i] = z;
          if (alive[i] && z > front) front = z;
          // Fly-in: each alien drops from above, front rows first.
          const t = Math.min(1, Math.max(0, (enterT - (ROWS - 1 - r) * 0.08 - c * 0.03) / 0.6));
          const drop = (1 - t) * (1 - t) * (1 - t) * 12;
          dummy.position.set(x, ALIEN_Y + drop + Math.sin(bob * 3 + c * 0.7 + r) * 0.06, z);
        }
        dummy.rotation.set(-FACE_TILT, 0, bank);
        dummy.scale.set(1, 1, 1);

        // Two-frame wobble, a different move for each kind.
        const type = typeOf[i];
        if (type === 0) {
          dummy.rotation.y = s * 0.32;
        } else if (type === 1) {
          dummy.rotation.z += s * 0.14;
          dummy.scale.x = 1 + s * 0.06;
        } else {
          dummy.scale.set(1 - s * 0.07, 1 + s * 0.1, 1);
        }
        if (pop[i] > 0 || flash[i] > 0) dummy.scale.multiplyScalar(pop[i] > 0 ? 1.4 : 1.15);
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
