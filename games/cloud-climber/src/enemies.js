// Flying pests that show up high in the sky. They hover from side to side;
// touching one from the side or from below ends the run, landing on one from
// above squashes it and bounces the climber. Bodies and wings are one
// InstancedMesh each, from a small pool.

import * as THREE from 'three';
import { BODY_H, BODY_HALF, lowPoly, wrapDx } from './shared.js';
import { pestGeometry, wingGeometry } from './models.js';

const MAX = 4;
const RADIUS = 0.36;
const ALIVE = 0;
const SQUASHED = 1; // stomped: flattened, then drops away
const KNOCKED = 2; // hit by the propeller: flung aside

// What hit() reports.
export const MISS = 0;
export const STOMP = 1;
export const HURT = 2;
export const KNOCK = 3;

export function createEnemies(scene) {
  const material = lowPoly(0x241a3a);
  const bodies = new THREE.InstancedMesh(pestGeometry(), material, MAX);
  bodies.frustumCulled = false;
  bodies.count = 0;
  scene.add(bodies);
  // Wings are seen from both sides as they flap.
  const wings = new THREE.InstancedMesh(
    wingGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2a2a3a }),
    MAX * 2,
  );
  wings.frustumCulled = false;
  wings.count = 0;
  scene.add(wings);

  const list = [];
  for (let i = 0; i < MAX; i++) {
    list.push({ active: false, state: ALIVE, cx: 0, x: 0, y: 0, amp: 0, rate: 0, phase: 0, t: 0, vx: 0, vy: 0, spin: 0 });
  }
  const dummy = new THREE.Object3D();

  return {
    material,

    // Set by hit(): where the pest that was hit is.
    hitX: 0,
    hitY: 0,

    clear() {
      for (let i = 0; i < MAX; i++) list[i].active = false;
      bodies.count = 0;
      wings.count = 0;
    },

    spawn(x, y, amp, rate) {
      for (let i = 0; i < MAX; i++) {
        const e = list[i];
        if (e.active) continue;
        e.active = true;
        e.state = ALIVE;
        e.cx = e.x = x;
        e.y = y;
        e.amp = amp;
        e.rate = rate;
        e.phase = Math.random() * Math.PI * 2;
        e.t = 0;
        return true;
      }
      return false;
    },

    // Tests the climber (feet at y, falling from prevY) against every pest.
    hit(x, y, prevY, vy, flying) {
      for (let i = 0; i < MAX; i++) {
        const e = list[i];
        if (!e.active || e.state !== ALIVE) continue;
        const dx = wrapDx(e.x, x);
        if (Math.abs(dx) > RADIUS + BODY_HALF || y > e.y + RADIUS || y + BODY_H < e.y - RADIUS) continue;
        this.hitX = e.x;
        this.hitY = e.y;
        if (flying) {
          e.state = KNOCKED;
          e.t = 0;
          e.vx = dx > 0 ? -6 : 6;
          e.vy = 4;
          e.spin = dx > 0 ? 9 : -9;
          return KNOCK;
        }
        // Coming down with the feet above the pest's middle is a stomp.
        if (vy < 0 && prevY >= e.y + 0.05) {
          e.state = SQUASHED;
          e.t = 0;
          e.vx = 0;
          e.vy = -1;
          e.spin = 0;
          return STOMP;
        }
        return HURT;
      }
      return MISS;
    },

    update(dt, bottom, top) {
      let n = 0;
      let w = 0;
      for (let i = 0; i < MAX; i++) {
        const e = list[i];
        if (!e.active) continue;
        e.t += dt;
        let sx = 1;
        let sy = 1;
        let rz = 0;
        if (e.state === ALIVE) {
          e.phase += e.rate * dt;
          e.x = e.cx + Math.sin(e.phase) * e.amp;
        } else {
          if (e.state === SQUASHED && e.t < 0.15) {
            sy = 1 - (e.t / 0.15) * 0.6;
            sx = 1 + (e.t / 0.15) * 0.4;
          } else {
            e.vy -= 22 * dt;
            e.x += e.vx * dt;
            e.y += e.vy * dt;
            sy = e.state === SQUASHED ? 0.4 : 1;
            sx = e.state === SQUASHED ? 1.4 : 1;
          }
          rz = e.spin * e.t;
        }
        if (e.y < bottom - 2) {
          e.active = false;
          continue;
        }
        if (e.y > top + 1.5) continue;
        const bob = e.state === ALIVE ? Math.sin(e.t * 5) * 0.12 : 0;
        // Leans into the way it is flying.
        const lean = e.state === ALIVE ? -Math.cos(e.phase) * 0.25 : rz;
        dummy.position.set(e.x, e.y + bob, 0.05);
        dummy.rotation.set(0, 0, lean);
        dummy.scale.set(sx, sy, sx);
        dummy.updateMatrix();
        bodies.setMatrixAt(n++, dummy.matrix);

        if (e.state === SQUASHED) continue;
        const flap = Math.sin(e.t * 28) * 0.7;
        for (let s = -1; s <= 1; s += 2) {
          dummy.position.set(e.x + s * 0.26 * Math.cos(lean), e.y + bob + 0.12 + s * 0.26 * Math.sin(lean), -0.05);
          // The left wing is the right one turned around; then it flaps.
          dummy.rotation.set(0, s < 0 ? Math.PI : 0, (s < 0 ? -lean : lean) + flap + 0.3);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          wings.setMatrixAt(w++, dummy.matrix);
        }
      }
      bodies.count = n;
      bodies.instanceMatrix.needsUpdate = true;
      wings.count = w;
      wings.instanceMatrix.needsUpdate = true;
    },
  };
}
