// Particles: dust, coin sparkles, crash debris and shield shards. One ring
// buffer of small cubes drawn as a single InstancedMesh with per-instance
// colors; emitting overwrites the oldest one, so nothing is allocated.

import * as THREE from 'three';

const MAX = 160;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX); // seconds left, 0 = gone
  const maxLife = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const grav = new Float32Array(MAX);
  const rgb = new Float32Array(MAX * 3);
  const matrices = mesh.instanceMatrix.array;
  const colors = mesh.instanceColor.array;
  const tmp = new THREE.Color();
  let head = 0;

  function emit(x, y, z, sx, sy, sz, s, seconds, hex, g) {
    const i = head;
    head = (head + 1) % MAX;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    size[i] = s;
    life[i] = seconds;
    maxLife[i] = seconds;
    grav[i] = g;
    // Through THREE.Color, so the sRGB hex becomes the linear color the
    // renderer expects.
    tmp.setHex(hex);
    rgb[i * 3] = tmp.r;
    rgb[i * 3 + 1] = tmp.g;
    rgb[i * 3 + 2] = tmp.b;
  }

  return {
    // n particles flying out from a point: speed sideways, up upwards,
    // s their size, seconds their life, g gravity.
    burst(x, y, z, n, hex, speed, up, s, seconds, g) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.28;
        const v = speed * (0.35 + Math.random() * 0.65);
        emit(x, y, z, Math.cos(a) * v, up * (0.4 + Math.random() * 0.8), Math.sin(a) * v, s * (0.6 + Math.random() * 0.6), seconds * (0.6 + Math.random() * 0.4), hex, g);
      }
    },

    // A puff of dust at the runner's feet.
    dust(x, n, spread) {
      for (let k = 0; k < n; k++) {
        emit(x + (Math.random() - 0.5) * spread, 0.08, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 3, 0.8 + Math.random() * 1.4, 1 + Math.random() * 2, 0.16 + Math.random() * 0.1, 0.35 + Math.random() * 0.2, 0xd8d0c0, 4);
      }
    },

    clear() {
      life.fill(0);
      mesh.count = 0;
    },

    // move: how far the road moved this frame (particles live on it).
    update(dt, move) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        vy[i] -= grav[i] * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt + move;
        if (py[i] < 0.03) {
          py[i] = 0.03;
          vy[i] *= -0.3;
        }
        const s = size[i] * (0.2 + 0.8 * (life[i] / maxLife[i]));
        const o = n * 16;
        matrices[o] = s;
        matrices[o + 1] = 0;
        matrices[o + 2] = 0;
        matrices[o + 3] = 0;
        matrices[o + 4] = 0;
        matrices[o + 5] = s;
        matrices[o + 6] = 0;
        matrices[o + 7] = 0;
        matrices[o + 8] = 0;
        matrices[o + 9] = 0;
        matrices[o + 10] = s;
        matrices[o + 11] = 0;
        matrices[o + 12] = px[i];
        matrices[o + 13] = py[i];
        matrices[o + 14] = pz[i];
        matrices[o + 15] = 1;
        colors[n * 3] = rgb[i * 3];
        colors[n * 3 + 1] = rgb[i * 3 + 1];
        colors[n * 3 + 2] = rgb[i * 3 + 2];
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },

    // For warming up shaders while loading.
    showAll() {
      emit(0, 1, -5, 0, 0, 0, 0.3, 0.1, 0xffffff, 0);
      this.update(0, 0);
    },
  };
}
