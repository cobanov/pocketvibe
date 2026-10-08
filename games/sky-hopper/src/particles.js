// Small flying bits (feathers, puffs, sparkles): a ring buffer of particles
// drawn with one InstancedMesh. Spawning overwrites the oldest particle.

import * as THREE from 'three';

const MAX = 72;
const GRAVITY = 14;

export function createParticles(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX,
  );
  mesh.frustumCulled = false;
  const color = new THREE.Color(1, 1, 1);
  // Creates the color buffer now, so the shader is not rebuilt mid-game.
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, color);
  mesh.count = 0;
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const total = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const fall = new Float32Array(MAX); // gravity multiplier
  const cr = new Float32Array(MAX);
  const cg = new Float32Array(MAX);
  const cb = new Float32Array(MAX);
  const dummy = new THREE.Object3D();
  let next = 0;
  let alive = 0;

  function spawn(x, y, z, sx, sy, sz, time, s, hex, g) {
    const i = next;
    next = (next + 1) % MAX;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    life[i] = time;
    total[i] = time;
    size[i] = s;
    fall[i] = g;
    color.setHex(hex);
    cr[i] = color.r;
    cg[i] = color.g;
    cb[i] = color.b;
    alive = MAX;
  }

  return {
    spawn,

    // n particles flying out from (x, y, z), alternating between two colors.
    burst(x, y, z, n, speed, hexA, hexB, s, time, g) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.45 + Math.random() * 0.55);
        spawn(
          x,
          y,
          z,
          Math.cos(a) * v,
          Math.sin(a) * v,
          (Math.random() - 0.5) * speed * 0.6,
          time * (0.7 + Math.random() * 0.5),
          s * (0.7 + Math.random() * 0.6),
          k % 2 === 0 ? hexA : hexB,
          g,
        );
      }
    },

    clear() {
      life.fill(0);
      mesh.count = 0;
      alive = 0;
    },

    // move: how far the world scrolled this frame; particles drift with it.
    update(dt, move) {
      if (alive === 0) return;
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        vy[i] -= GRAVITY * fall[i] * dt;
        // A little air drag.
        vx[i] *= 1 - dt * 1.5;
        vz[i] *= 1 - dt * 1.5;
        px[i] += vx[i] * dt - move;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const k = life[i] / total[i];
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(k * 7 + i, k * 5, 0);
        dummy.scale.setScalar(size[i] * (k < 0.5 ? k * 2 : 1));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        color.setRGB(cr[i], cg[i], cb[i]);
        mesh.setColorAt(n, color);
        n++;
      }
      mesh.count = n;
      alive = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}
