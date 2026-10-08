// Particles: small spinning cubes from cleared lines and hard drops. A fixed
// pool drawn as one InstancedMesh; new particles overwrite the oldest.

import * as THREE from 'three';
import { PIECE_RGB, bake, bevelBox } from './shared.js';

const MAX = 160;
const GRAVITY = 26;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(
    bake(bevelBox(1, 1, 1, 0.2), 0xffffff),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    MAX,
  );
  mesh.frustumCulled = false; // instances move
  mesh.count = 0;
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, white);
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const ttl = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  const type = new Int8Array(MAX);
  const colors = mesh.instanceColor.array;
  const dummy = new THREE.Object3D();
  let next = 0;

  function add(x, y, z, t, speedX, speedY, s, time) {
    const i = next;
    next = (next + 1) % MAX;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = speedX;
    vy[i] = speedY;
    vz[i] = 2 + Math.random() * 6;
    life[i] = time;
    ttl[i] = time;
    size[i] = s;
    spin[i] = (Math.random() - 0.5) * 16;
    type[i] = t;
  }

  return {
    // A cleared cell bursts into a couple of cubes of its colour.
    burst(x, y, t, power) {
      for (let k = 0; k < 2; k++) {
        add(
          x + (Math.random() - 0.5) * 0.6,
          y + (Math.random() - 0.5) * 0.6,
          0.3,
          t,
          (Math.random() - 0.5) * 10 * power + x * 0.6,
          4 + Math.random() * 8 * power,
          0.36 + Math.random() * 0.24,
          0.6 + Math.random() * 0.4,
        );
      }
    },

    // Dust kicked up under a hard-dropped piece.
    dust(x, y, t) {
      for (let k = 0; k < 2; k++) {
        add(
          x + (Math.random() - 0.5) * 0.8,
          y - 0.45,
          0.5,
          t,
          (Math.random() - 0.5) * 5,
          1.5 + Math.random() * 3,
          0.16 + Math.random() * 0.12,
          0.3 + Math.random() * 0.2,
        );
      }
    },

    clear() {
      life.fill(0);
      mesh.count = 0;
    },

    update(dt) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        vy[i] -= GRAVITY * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const a = life[i] * spin[i];
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(a, a * 0.7, 0);
        dummy.scale.setScalar(size[i] * Math.min(1, (life[i] / ttl[i]) * 2));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        // Starts bright, settles into the piece colour.
        const f = Math.max(0, (life[i] / ttl[i] - 0.8) * 5);
        const k = type[i] * 3;
        colors[n * 3] = PIECE_RGB[k] + (1 - PIECE_RGB[k]) * f;
        colors[n * 3 + 1] = PIECE_RGB[k + 1] + (1 - PIECE_RGB[k + 1]) * f;
        colors[n * 3 + 2] = PIECE_RGB[k + 2] + (1 - PIECE_RGB[k + 2]) * f;
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
