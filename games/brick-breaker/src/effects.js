// Pooled debris: small colored cubes that pop out of broken bricks, plus
// tiny white sparks on bounces. One InstancedMesh, a ring of slots; a new
// particle simply takes the oldest slot.

import * as THREE from 'three';

const MAX = 200;
const GRAVITY = 24;

export function createEffects(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ emissive: 0x2a2a2a }),
    MAX,
  );
  mesh.frustumCulled = false;
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const rot = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX; i++) {
    mesh.setMatrixAt(i, ZERO);
    mesh.setColorAt(i, color);
  }

  let cursor = 0;
  let colorsDirty = false;
  let live = 0; // particles alive after the last update

  function spawn(x, y, z, sx, sy, sz, s, t, hex) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    rot[i] = Math.random() * 6;
    spin[i] = (Math.random() - 0.5) * 16;
    size[i] = s;
    life[i] = t;
    maxLife[i] = t;
    color.setHex(hex);
    mesh.setColorAt(i, color);
    colorsDirty = true;
    live++;
  }

  return {
    // Chunks flying out of a broken brick.
    burst(x, z, hex, n) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 3.5;
        spawn(
          x + (Math.random() - 0.5) * 0.9,
          0.3 + Math.random() * 0.2,
          z + (Math.random() - 0.5) * 0.4,
          Math.cos(a) * sp,
          4 + Math.random() * 5,
          Math.sin(a) * sp,
          0.14 + Math.random() * 0.14,
          0.55 + Math.random() * 0.35,
          hex,
        );
      }
    },

    // A few quick sparks where the ball bounced.
    sparks(x, z, n, hex) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 4;
        spawn(x, 0.35, z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, 0.08, 0.22, hex);
      }
    },

    clear() {
      for (let i = 0; i < MAX; i++) {
        life[i] = 0;
        mesh.setMatrixAt(i, ZERO);
      }
      live = 0;
      mesh.instanceMatrix.needsUpdate = true;
    },

    update(dt) {
      if (live === 0) return;
      live = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          mesh.setMatrixAt(i, ZERO);
          continue;
        }
        live++;
        vy[i] -= GRAVITY * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const half = size[i] * 0.5;
        if (py[i] < half) {
          // Bounce on the floor and lose speed.
          py[i] = half;
          vy[i] = -vy[i] * 0.35;
          vx[i] *= 0.7;
          vz[i] *= 0.7;
        }
        rot[i] += spin[i] * dt;
        const s = size[i] * Math.min(1, (life[i] / maxLife[i]) * 2.5);
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(rot[i], rot[i] * 0.7, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (colorsDirty) {
        mesh.instanceColor.needsUpdate = true;
        colorsDirty = false;
      }
    },
  };
}
