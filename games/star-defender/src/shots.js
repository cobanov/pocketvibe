// Player bullets (at most two at a time) and alien bombs, each a fixed pool
// drawn with one InstancedMesh. Also resolves what every shot runs into.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ALIEN_Y } from './aliens.js';
import { SHIP_HALF_D, SHIP_HALF_W } from './player.js';
import { GROUND_Z, PLAYER_Z, TOP_Z, part } from './shared.js';

const MAX_BULLETS = 2;
const MAX_BOMBS = 10;
const BULLET_SPEED = 30;
const SHOT_Y = ALIEN_Y;
const CROSS = 0.38; // how close a bullet and a bomb must pass to cancel out

function bombGeometry() {
  const outer = new THREE.OctahedronGeometry(0.26, 0);
  outer.scale(1, 1, 2.2);
  const core = new THREE.OctahedronGeometry(0.15, 0);
  core.scale(1, 1, 2.8);
  return mergeGeometries([part(outer, 0, 0, 0, 0xff3d5e), part(core, 0, 0.06, 0, 0xffe066)]);
}

export function createShots(scene, { aliens, shields, saucer, fx }) {
  const bulletGeometry = new THREE.BoxGeometry(0.14, 0.14, 0.9);
  const bulletMesh = new THREE.InstancedMesh(
    bulletGeometry,
    new THREE.MeshBasicMaterial({ color: 0xfff7b0 }),
    MAX_BULLETS,
  );
  bulletMesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  bulletMesh.count = 0;
  scene.add(bulletMesh);

  const bombMesh = new THREE.InstancedMesh(
    bombGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    MAX_BOMBS,
  );
  bombMesh.frustumCulled = false;
  bombMesh.count = 0;
  scene.add(bombMesh);

  const bx = new Float32Array(MAX_BULLETS);
  const bz = new Float32Array(MAX_BULLETS);
  const bOn = new Uint8Array(MAX_BULLETS);
  const mx = new Float32Array(MAX_BOMBS);
  const mz = new Float32Array(MAX_BOMBS);
  const mPrev = new Float32Array(MAX_BOMBS);
  const mv = new Float32Array(MAX_BOMBS);
  const mOn = new Uint8Array(MAX_BOMBS);
  const matrix = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  let spin = 0;

  const shots = {
    // What happened during the last update, read by main.js.
    points: 0,
    kills: 0,
    shipHit: false,
    bonus: 0, // saucer bonus scored this frame
    bonusX: 0,

    bullets() {
      let n = 0;
      for (let i = 0; i < MAX_BULLETS; i++) n += bOn[i];
      return n;
    },

    bombs() {
      let n = 0;
      for (let i = 0; i < MAX_BOMBS; i++) n += mOn[i];
      return n;
    },

    fire(x, z) {
      for (let i = 0; i < MAX_BULLETS; i++) {
        if (bOn[i]) continue;
        bOn[i] = 1;
        bx[i] = x;
        bz[i] = z;
        return true;
      }
      return false;
    },

    drop(x, z, speed) {
      for (let i = 0; i < MAX_BOMBS; i++) {
        if (mOn[i]) continue;
        mOn[i] = 1;
        mx[i] = x;
        mz[i] = mPrev[i] = z;
        mv[i] = speed;
        return true;
      }
      return false;
    },

    clearBombs() {
      mOn.fill(0);
    },

    clear() {
      bOn.fill(0);
      mOn.fill(0);
      shots.draw();
    },

    // ship is null when there is no ship to hit (dead, or the title demo).
    update(dt, ship) {
      shots.points = 0;
      shots.kills = 0;
      shots.shipHit = false;
      shots.bonus = 0;
      spin += dt * 14;

      for (let i = 0; i < MAX_BOMBS; i++) {
        if (!mOn[i]) continue;
        const z0 = mz[i];
        mPrev[i] = z0;
        mz[i] += mv[i] * dt;
        if (shields.hit(mx[i], z0, mz[i], true)) {
          mOn[i] = 0;
          fx.burst(shields.hitX, SHOT_Y, shields.hitZ, 0x7cf05a, 7, 5, 0.14);
          continue;
        }
        if (
          ship &&
          ship.vulnerable &&
          Math.abs(mx[i] - ship.x) < SHIP_HALF_W &&
          mz[i] > PLAYER_Z - SHIP_HALF_D &&
          z0 < PLAYER_Z + SHIP_HALF_D
        ) {
          mOn[i] = 0;
          shots.shipHit = true;
          continue;
        }
        if (mz[i] > GROUND_Z) {
          mOn[i] = 0;
          fx.burst(mx[i], 0.1, GROUND_Z, 0xff4fd8, 5, 4, 0.12);
        }
      }

      for (let i = 0; i < MAX_BULLETS; i++) {
        if (!bOn[i]) continue;
        const z0 = bz[i];
        const z1 = z0 - BULLET_SPEED * dt;
        bz[i] = z1;
        const x = bx[i];

        if (shields.hit(x, z0, z1, false)) {
          bOn[i] = 0;
          fx.burst(shields.hitX, SHOT_Y, shields.hitZ, 0x7cf05a, 5, 4, 0.12);
          continue;
        }

        // Shooting a bomb cancels both.
        let cancelled = false;
        for (let k = 0; k < MAX_BOMBS; k++) {
          if (!mOn[k] || Math.abs(mx[k] - x) > CROSS) continue;
          if (z0 + CROSS < mPrev[k] || z1 - CROSS > mz[k]) continue;
          mOn[k] = 0;
          cancelled = true;
          fx.burst(x, SHOT_Y, mz[k], 0xffe066, 8, 6, 0.13);
          break;
        }
        if (cancelled) {
          bOn[i] = 0;
          continue;
        }

        const a = aliens.hit(x, z0, z1);
        if (a >= 0) {
          bOn[i] = 0;
          shots.points += aliens.kill(a);
          shots.kills++;
          fx.burst(aliens.ax[a], SHOT_Y, aliens.az[a], aliens.colorOf(a), 18, 11, 0.24);
          continue;
        }

        const bonus = saucer.hit(x, z0, z1);
        if (bonus > 0) {
          bOn[i] = 0;
          shots.points += bonus;
          shots.bonus = bonus;
          shots.bonusX = saucer.x;
          fx.burst(saucer.x, 0.9, saucer.z, 0xff4466, 26, 12, 0.26);
          fx.burst(saucer.x, 0.9, saucer.z, 0x7ff6ff, 10, 8, 0.2);
          continue;
        }

        if (z1 < TOP_Z) bOn[i] = 0;
      }

      shots.draw();
    },

    draw() {
      let n = 0;
      for (let i = 0; i < MAX_BULLETS; i++) {
        if (!bOn[i]) continue;
        matrix.makeTranslation(bx[i], SHOT_Y, bz[i]);
        bulletMesh.setMatrixAt(n++, matrix);
      }
      bulletMesh.count = n;
      bulletMesh.instanceMatrix.needsUpdate = true;

      n = 0;
      for (let i = 0; i < MAX_BOMBS; i++) {
        if (!mOn[i]) continue;
        dummy.position.set(mx[i], SHOT_Y, mz[i]);
        dummy.rotation.set(0, 0, spin + i);
        dummy.updateMatrix();
        bombMesh.setMatrixAt(n++, dummy.matrix);
      }
      bombMesh.count = n;
      bombMesh.instanceMatrix.needsUpdate = true;
    },
  };

  return shots;
}
