// The clouds: a fixed pool of platforms, recycled once they drop below the
// screen. Every kind is one InstancedMesh, and only the clouds in view are
// written into it each frame. Springs and the halves of broken storm clouds
// get a mesh of their own.

import * as THREE from 'three';
import { BODY_HALF, MOVING, NORMAL, PLAT_HALF, lowPoly, wrapDx } from './shared.js';
import {
  SPRING_H,
  crumbleCloudGeometry,
  crumbleHalfGeometry,
  movingCloudGeometry,
  normalCloudGeometry,
  oneShotCloudGeometry,
  springGeometry,
} from './models.js';

const MAX = 64;
const MAX_SPRINGS = 10;
export const LIVE = 0; // a cloud that can be landed on
const BREAKING = 1; // a storm cloud falling apart
const POPPING = 2; // a one-shot cloud about to vanish
const SQUISH_TIME = 0.32;
const BREAK_TIME = 0.9;
const POP_DELAY = 0.1;
const POP_TIME = 0.22;
const SPRING_TIME = 0.4;
const FOOT = BODY_HALF * 0.8; // how far past the edge a foot still counts

export function createPlatforms(scene) {
  // Clouds keep a soft glow so their shaded sides stay light, even at night.
  const material = lowPoly(0x3a3a50);
  const geometries = [normalCloudGeometry(), movingCloudGeometry(), crumbleCloudGeometry(), oneShotCloudGeometry()];
  const meshes = geometries.map((g) => instanced(scene, g, material, MAX));
  const halves = instanced(scene, crumbleHalfGeometry(), material, 8);
  const springs = instanced(scene, springGeometry(), lowPoly(0x202020), MAX_SPRINGS);

  const list = [];
  for (let i = 0; i < MAX; i++) {
    list.push({
      active: false,
      kind: NORMAL,
      state: LIVE,
      x: 0,
      y: 0,
      cx: 0, // moving clouds swing around cx
      amp: 0,
      rate: 0,
      phase: 0,
      spring: false,
      springX: 0,
      springT: SPRING_TIME,
      squishT: SQUISH_TIME,
      t: 0,
    });
  }
  const counts = new Int32Array(4);
  const dummy = new THREE.Object3D();
  let freeCount = MAX;

  function release(p) {
    p.active = false;
    freeCount++;
  }

  return {
    list,
    material,
    onSpring: false, // set by land(): the last landing hit a spring

    free() {
      return freeCount;
    },

    clear() {
      for (let i = 0; i < MAX; i++) list[i].active = false;
      freeCount = MAX;
    },

    spawn(kind, x, y) {
      for (let i = 0; i < MAX; i++) {
        const p = list[i];
        if (p.active) continue;
        p.active = true;
        p.kind = kind;
        p.state = LIVE;
        p.x = p.cx = x;
        p.y = y;
        p.amp = 0;
        p.rate = 0;
        p.phase = 0;
        p.spring = false;
        p.springT = SPRING_TIME;
        p.squishT = SQUISH_TIME;
        p.t = 0;
        freeCount--;
        return p;
      }
      return null;
    },

    // True if nothing stands near (x, y): no cloud closer than dy vertically
    // whose path overlaps x (wide enough for the swing of moving clouds).
    roomAt(x, y, dy, amp) {
      for (let i = 0; i < MAX; i++) {
        const p = list[i];
        if (!p.active || Math.abs(p.y - y) >= dy) continue;
        if (Math.abs(wrapDx(p.cx, x)) < PLAT_HALF * 2 + 0.3 + p.amp + amp) return false;
      }
      return true;
    },

    // Finds what the climber's feet touched while falling from prevY to y:
    // returns the cloud, or null. onSpring tells whether its spring was hit.
    land(prevY, y, x) {
      let best = null;
      this.onSpring = false;
      for (let i = 0; i < MAX; i++) {
        const p = list[i];
        if (!p.active || p.state !== LIVE) continue;
        if (p.spring) {
          const top = p.y + SPRING_H;
          if (prevY >= top && y <= top && Math.abs(wrapDx(p.x + p.springX, x)) < 0.26 + FOOT) {
            if (!best || top > best.y) {
              best = p;
              this.onSpring = true;
            }
            continue;
          }
        }
        if (prevY >= p.y && y <= p.y && Math.abs(wrapDx(p.x, x)) < PLAT_HALF + FOOT) {
          if (!best || p.y > best.y) {
            best = p;
            this.onSpring = false;
          }
        }
      }
      return best;
    },

    // Reactions to being landed on.
    squish(p) {
      p.squishT = 0;
    },

    bounceSpring(p) {
      p.springT = 0;
      p.squishT = 0;
    },

    crumble(p) {
      p.state = BREAKING;
      p.t = 0;
    },

    pop(p) {
      p.squishT = 0;
      p.state = POPPING;
      p.t = 0;
    },

    update(dt, bottom) {
      for (let i = 0; i < MAX; i++) {
        const p = list[i];
        if (!p.active) continue;
        if (p.kind === MOVING) {
          p.phase += p.rate * dt;
          p.x = p.cx + Math.sin(p.phase) * p.amp;
        }
        p.squishT += dt;
        p.springT += dt;
        if (p.state !== LIVE) {
          p.t += dt;
          if (p.state === BREAKING && p.t > BREAK_TIME) release(p);
          else if (p.state === POPPING && p.t > POP_DELAY + POP_TIME) release(p);
        }
        if (p.active && p.y < bottom - 2) release(p);
      }
    },

    // Writes the clouds between bottom and top into their meshes.
    draw(bottom, top) {
      counts.fill(0);
      let nHalves = 0;
      let nSprings = 0;
      for (let i = 0; i < MAX; i++) {
        const p = list[i];
        if (!p.active || p.y < bottom - 1.5 || p.y > top + 1) continue;

        if (p.state === BREAKING) {
          // Two halves drift apart, tip over and drop.
          const t = p.t;
          const fall = 6 * t * t;
          for (let s = 0; s < 2 && nHalves < 8; s++) {
            const dir = s === 0 ? -1 : 1;
            dummy.position.set(p.x + dir * (0.04 + t * 0.9), p.y - fall, 0);
            dummy.rotation.set(0, s === 0 ? 0 : Math.PI, t * 1.6);
            dummy.scale.setScalar(Math.max(0.01, 1 - t * 0.8));
            dummy.updateMatrix();
            halves.setMatrixAt(nHalves++, dummy.matrix);
          }
          continue;
        }

        // A landing dips the cloud and squashes it, then it springs back.
        const k = Math.min(1, p.squishT / SQUISH_TIME);
        const wave = Math.sin(k * Math.PI) * (1 - k * 0.5);
        let sx = 1 + 0.08 * wave;
        let sy = 1 - 0.2 * wave;
        const dip = -0.16 * wave;
        if (p.state === POPPING && p.t > POP_DELAY) {
          // Puffs up and is gone.
          const q = (p.t - POP_DELAY) / POP_TIME;
          sx = 1 + q * 0.5;
          sy = Math.max(0.01, 1 - q);
        }
        dummy.position.set(p.x, p.y + dip, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(sx, sy, sx);
        dummy.updateMatrix();
        meshes[p.kind].setMatrixAt(counts[p.kind]++, dummy.matrix);

        if (p.spring && nSprings < MAX_SPRINGS) {
          // Squeezed flat on a hit, then overshoots and settles.
          const u = Math.min(1, p.springT / SPRING_TIME);
          const s = u < 0.15 ? 1 - (u / 0.15) * 0.55 : 1 + Math.sin((u - 0.15) * 18) * 0.35 * (1 - u);
          dummy.position.set(p.x + p.springX, p.y + dip + 0.02, 0.05);
          dummy.scale.set(1, s, 1);
          dummy.updateMatrix();
          springs.setMatrixAt(nSprings++, dummy.matrix);
        }
      }
      for (let k = 0; k < 4; k++) {
        meshes[k].count = counts[k];
        meshes[k].instanceMatrix.needsUpdate = true;
      }
      halves.count = nHalves;
      halves.instanceMatrix.needsUpdate = true;
      springs.count = nSprings;
      springs.instanceMatrix.needsUpdate = true;
    },
  };
}

function instanced(scene, geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}
