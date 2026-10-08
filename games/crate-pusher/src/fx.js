// Particles from one pooled InstancedMesh: dust puffs behind pushed crates,
// sparkles when a crate lands on a spot, and confetti when a level is done.

import * as THREE from 'three';

const MAX = 160;
const CONFETTI = [0xff5c8a, 0xffc93c, 0x5ad1c4, 0x6fa8ff, 0xb98cff, 0x8ee06a, 0xff8a3d];

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, white);
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const gravity = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  const flat = new Uint8Array(MAX); // confetti: thin flakes that tumble
  const spin = new Float32Array(MAX);
  const colors = [];
  for (let i = 0; i < MAX; i++) colors.push(new THREE.Color());
  let cursor = 0;

  const dummy = new THREE.Object3D();

  function spawn(x, y, z, sx, sy, sz, s, t, hex, g, d, isFlat) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    size[i] = s;
    life[i] = t;
    maxLife[i] = t;
    gravity[i] = g;
    drag[i] = d;
    flat[i] = isFlat ? 1 : 0;
    spin[i] = 4 + Math.random() * 8;
    colors[i].setHex(hex);
  }

  return {
    // A puff of dust at floor level, blown in direction (dx, dz).
    dust(x, z, dx, dz) {
      for (let k = 0; k < 5; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 0.6;
        spawn(
          x + (Math.random() - 0.5) * 0.5,
          0.08,
          z + (Math.random() - 0.5) * 0.5,
          Math.cos(a) * r + dx * 0.8,
          0.6 + Math.random() * 0.8,
          Math.sin(a) * r + dz * 0.8,
          0.1 + Math.random() * 0.07,
          0.35 + Math.random() * 0.2,
          0xe9dcc4,
          1.5,
          3,
          false,
        );
      }
    },

    // Golden sparkles shooting up from a crate that found its spot.
    sparkle(x, z) {
      for (let k = 0; k < 14; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1 + Math.random() * 1.6;
        spawn(x, 0.6, z, Math.cos(a) * r, 2.5 + Math.random() * 2.5, Math.sin(a) * r, 0.09, 0.6, k % 3 ? 0xffd24a : 0xffffff, 9, 1.2, false);
      }
    },

    // A shower of confetti flakes over (x, z).
    confetti(x, z, n, spread) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * spread;
        spawn(
          x + Math.cos(a) * r * 0.3,
          0.5 + Math.random() * 0.6,
          z + Math.sin(a) * r * 0.3,
          Math.cos(a) * r,
          4 + Math.random() * 4,
          Math.sin(a) * r,
          0.16 + Math.random() * 0.06,
          1.6 + Math.random() * 0.8,
          CONFETTI[k % CONFETTI.length],
          6,
          1.6,
          true,
        );
      }
    },

    // A puff where a crate leaves for a restart.
    poof(x, z) {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        spawn(x, 0.4, z, Math.cos(a) * 1.8, 1 + Math.random(), Math.sin(a) * 1.8, 0.16, 0.4, 0xffffff, 2, 4, false);
      }
    },

    clear() {
      for (let i = 0; i < MAX; i++) life[i] = 0;
      mesh.count = 0;
    },

    update(dt) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        const slow = Math.max(0, 1 - drag[i] * dt);
        vx[i] *= slow;
        vz[i] *= slow;
        vy[i] -= gravity[i] * dt;
        if (flat[i] && vy[i] < -1.2) vy[i] = -1.2; // flakes flutter down slowly
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        if (py[i] < 0.03) {
          py[i] = 0.03;
          vy[i] = 0;
          vx[i] *= 0.5;
          vz[i] *= 0.5;
        }
        const k = life[i] / maxLife[i];
        const s = size[i] * Math.min(1, k * 3);
        const t = life[i] * spin[i];
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(t, t * 0.7, flat[i] ? t * 0.4 : 0);
        if (flat[i]) dummy.scale.set(s, s * 0.12, s * 0.65);
        else dummy.scale.setScalar(s * (0.4 + 0.6 * k));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, colors[i]);
        n++;
      }
      mesh.count = n;
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
