// Particles (tyre smoke, dirt, sparks, turbo flames) from one fixed pool,
// drawn as a single InstancedMesh of small unlit cubes.

import * as THREE from 'three';

const MAX = 140;

export const SMOKE = 0xd5dbe3;
export const SPARK = 0xffd23f;
export const FLAME = 0xff7a1a;
export const CONE = 0xff8a2a;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX);
  mesh.frustumCulled = false; // particles move, so the cached bounds would be wrong
  mesh.count = 0;
  scene.add(mesh);

  // Live particles are kept packed at the start of the arrays, so the mesh
  // draws only those (mesh.count) and idle slots cost nothing.
  const x = new Float32Array(MAX);
  const y = new Float32Array(MAX);
  const z = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX); // seconds left
  const total = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const gravity = new Float32Array(MAX);
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  let live = 0;
  let next = 0; // the slot to reuse when the pool is full

  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, color);
  const colors = mesh.instanceColor.array;

  // Moves particle `from` into slot `to`.
  function move(from, to) {
    x[to] = x[from];
    y[to] = y[from];
    z[to] = z[from];
    vx[to] = vx[from];
    vy[to] = vy[from];
    vz[to] = vz[from];
    life[to] = life[from];
    total[to] = total[from];
    size[to] = size[from];
    gravity[to] = gravity[from];
    colors[to * 3] = colors[from * 3];
    colors[to * 3 + 1] = colors[from * 3 + 1];
    colors[to * 3 + 2] = colors[from * 3 + 2];
  }

  return {
    mesh,

    // Starts one particle; an old one is reused when the pool is full.
    spawn(px, py, pz, pvx, pvy, pvz, psize, plife, hex, pgravity) {
      let i;
      if (live < MAX) {
        i = live++;
      } else {
        i = next;
        next = (next + 1) % MAX;
      }
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
      live = 0;
      mesh.count = 0;
    },

    update(dt) {
      if (live === 0 && mesh.count === 0) return;
      let i = 0;
      while (i < live) {
        life[i] -= dt;
        if (life[i] <= 0) {
          // The last live particle takes this slot and is updated next.
          live--;
          if (i < live) {
            move(live, i);
            mesh.instanceColor.needsUpdate = true;
          }
          continue;
        }
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
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        i++;
      }
      if (next >= live) next = 0;
      mesh.count = live;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
