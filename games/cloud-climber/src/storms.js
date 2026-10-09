// Thunderclouds, high up from sunset on. They hang still and do nothing most
// of the time; then they flicker and crackle for a moment and strike: a bolt
// of lightning drops below them for a third of a second, and touching it, or
// the cloud while it strikes, ends the run. They are not clouds to stand on:
// the climber passes through them. Clouds, bolts and their flicker are one
// InstancedMesh each, from a small pool.

import * as THREE from 'three';
import { BODY_H, BODY_HALF, lowPoly, rand, wrapDx } from './shared.js';
import { boltGeometry, thunderCloudGeometry } from './models.js';

const MAX = 3;
export const BOLT = 2.6; // how far the lightning reaches below the cloud
const IDLE = 0;
const CHARGE = 1;
const STRIKE = 2;
const CHARGE_TIME = 0.85;
const STRIKE_TIME = 0.35;
const REACH = 0.38; // half the width of the bolt that hurts
const CLOUD_REACH = 0.85; // and of the cloud while it strikes

export function createStorms(scene, fx) {
  const material = lowPoly(0x221c38);
  const clouds = new THREE.InstancedMesh(thunderCloudGeometry(), material, MAX);
  clouds.frustumCulled = false;
  clouds.count = 0;
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < MAX; i++) clouds.setColorAt(i, white);
  scene.add(clouds);
  // Double sided, as the bolt is mirrored every few frames.
  const bolts = new THREE.InstancedMesh(
    boltGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }),
    MAX,
  );
  bolts.frustumCulled = false;
  bolts.count = 0;
  scene.add(bolts);

  const list = [];
  for (let i = 0; i < MAX; i++) list.push({ active: false, x: 0, y: 0, state: IDLE, t: 0, wait: 0, sparkT: 0 });
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();

  return {
    material,

    // Set by update() for the sounds: a storm in view started charging or
    // struck this frame, and where.
    charged: false,
    struck: false,
    eventX: 0,
    eventY: 0,

    clear() {
      for (let i = 0; i < MAX; i++) list[i].active = false;
      clouds.count = 0;
      bolts.count = 0;
    },

    spawn(x, y) {
      for (let i = 0; i < MAX; i++) {
        const s = list[i];
        if (s.active) continue;
        s.active = true;
        s.x = x;
        s.y = y;
        s.state = IDLE;
        s.t = 0;
        s.wait = rand(0.6, 2.6); // out of step with the others
        s.sparkT = 0;
        return true;
      }
      return false;
    },

    // True if a strike touches the climber's box (feet at y) now.
    hit(x, y) {
      for (let i = 0; i < MAX; i++) {
        const s = list[i];
        if (!s.active || s.state !== STRIKE) continue;
        const dx = Math.abs(wrapDx(s.x, x));
        if (y + BODY_H > s.y - BOLT && y < s.y - 0.3 && dx < REACH + BODY_HALF) return true;
        if (y + BODY_H > s.y - 0.7 && y < s.y + 0.15 && dx < CLOUD_REACH + BODY_HALF) return true;
      }
      return false;
    },

    update(dt, bottom, top) {
      this.charged = false;
      this.struck = false;
      let n = 0;
      let b = 0;
      for (let i = 0; i < MAX; i++) {
        const s = list[i];
        if (!s.active) continue;
        if (s.y < bottom - 2) {
          s.active = false;
          continue;
        }
        s.t += dt;
        const inView = s.y - BOLT < top && s.y > bottom - 0.5;
        if (s.state === IDLE && s.t > s.wait) {
          s.state = CHARGE;
          s.t = 0;
          if (inView && !this.charged) {
            this.charged = true;
            this.eventX = s.x;
            this.eventY = s.y;
          }
        } else if (s.state === CHARGE && s.t > CHARGE_TIME) {
          s.state = STRIKE;
          s.t = 0;
          if (inView && !this.struck) {
            this.struck = true;
            this.eventX = s.x;
            this.eventY = s.y;
          }
          if (inView) fx.burst(s.x, s.y - BOLT, 0xfff2a0, 8, 4, 0.08, 0.35, 6);
        } else if (s.state === STRIKE && s.t > STRIKE_TIME) {
          s.state = IDLE;
          s.t = 0;
          s.wait = rand(1.8, 2.8);
        }
        if (s.y - BOLT > top + 1 || s.y < bottom - 1) continue;

        // Flickers brighter and brighter while it charges, sparks under it,
        // then glows while it strikes.
        let glow = 0;
        if (s.state === CHARGE) {
          const k = s.t / CHARGE_TIME;
          glow = Math.sin(s.t * (20 + 40 * k)) > 0.2 ? 0.4 + 0.9 * k : 0.1 * k;
          s.sparkT += dt;
          if (s.sparkT > 0.12 && inView) {
            s.sparkT = 0;
            fx.burst(s.x + rand(-0.5, 0.5), s.y - 0.5, 0xfff2a0, 1, 2.5, 0.06, 0.3, 4);
          }
        } else if (s.state === STRIKE) {
          glow = 1.5;
        }
        tint.setRGB(1 + glow * 1.2, 1 + glow * 1.1, 1 + glow * 0.4);
        const bob = Math.sin(s.t * 1.7 + i) * 0.05;
        dummy.position.set(s.x, s.y + bob, 0);
        dummy.rotation.set(0, 0, 0);
        const puffUp = s.state === STRIKE ? 1.06 : 1;
        dummy.scale.set(puffUp, puffUp, 1);
        dummy.updateMatrix();
        clouds.setMatrixAt(n, dummy.matrix);
        clouds.setColorAt(n, tint);
        n++;

        if (s.state === STRIKE) {
          // Flips sides every few frames, so the bolt crackles.
          const flip = Math.floor(s.t * 30) % 2 ? -1 : 1;
          dummy.position.set(s.x, s.y - 0.35, 0.3);
          dummy.scale.set(flip, BOLT - 0.35, 1);
          dummy.updateMatrix();
          bolts.setMatrixAt(b++, dummy.matrix);
        }
      }
      clouds.count = n;
      clouds.instanceMatrix.needsUpdate = true;
      if (clouds.instanceColor) clouds.instanceColor.needsUpdate = true;
      bolts.count = b;
      bolts.instanceMatrix.needsUpdate = true;
    },
  };
}
