// Particles (tyre smoke, dirt, sparks, turbo flames) from one fixed pool,
// drawn as a single InstancedMesh of small unlit cubes.

import * as THREE from 'three';

const MAX = 140;

export const SMOKE = 0xe9edf2;
export const DIRT = 0x8a6a3e;
export const GRASS = 0x4f9a3c;
export const SPARK = 0xffd23f;
export const FLAME = 0xff7a1a;
export const CONE = 0xff8a2a;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX);
  mesh.frustumCulled = false; // particles move, so the cached bounds would be wrong
  scene.add(mesh);

  const x = new Float32Array(MAX);
  const y = new Float32Array(MAX);
  const z = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX); // seconds left, <= 0 is a free slot
  const total = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const gravity = new Float32Array(MAX);
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  let next = 0;

  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, color);

  return {
    // Starts one particle; the oldest one is reused when the pool is full.
    spawn(px, py, pz, pvx, pvy, pvz, psize, plife, hex, pgravity) {
      const i = next;
      next = (next + 1) % MAX;
      x[i] = px;
      y[i] = py;
      z[i] = pz;
      vx[i] = pvx;
      vy[i] = pvy;
      vz[i] = pvz;
      size[i] = psize;
      life[i] = total[i] = plife;
      gravity[i] = pgravity;
      color.setHex(hex);
      mesh.setColorAt(i, color);
      mesh.instanceColor.needsUpdate = true;
    },

    // A burst of n particles flying out from a point.
    burst(n, px, py, pz, speed, up, psize, plife, hex, pgravity) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        this.spawn(px, py, pz, Math.cos(a) * v, up * (0.5 + Math.random()), Math.sin(a) * v, psize, plife, hex, pgravity);
      }
    },

    clear() {
      life.fill(0);
    },

    update(dt) {
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) {
          dummy.scale.setScalar(0);
        } else {
          life[i] -= dt;
          vy[i] -= gravity[i] * dt;
          x[i] += vx[i] * dt;
          y[i] += vy[i] * dt;
          z[i] += vz[i] * dt;
          if (y[i] < 0.1) {
            y[i] = 0.1;
            vy[i] = 0;
          }
          dummy.position.set(x[i], y[i], z[i]);
          dummy.rotation.set(life[i] * 5, life[i] * 3, 0);
          dummy.scale.setScalar(size[i] * Math.max(0, life[i] / total[i]));
        }
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
