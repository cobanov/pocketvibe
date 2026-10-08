// Particles: jetpack flames, smoke, dust, sparks and coin sparkles. One ring
// buffer of small squares drawn as a single InstancedMesh with per-instance
// colors. Emitting overwrites the oldest particle, so nothing is allocated.

import * as THREE from 'three';

const MAX = 260;

export function createParticles(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX,
  );
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const life = new Float32Array(MAX); // seconds left, 0 = dead
  const maxLife = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const rot = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  const grav = new Float32Array(MAX);
  const c0 = new Float32Array(MAX * 3); // color at birth
  const c1 = new Float32Array(MAX * 3); // color at death
  let head = 0;

  const matrices = mesh.instanceMatrix.array;
  const colors = mesh.instanceColor.array;
  const tmp = new THREE.Color();

  // Through THREE.Color, so the sRGB hex becomes the linear color the
  // renderer expects.
  function setColor(arr, i, hex) {
    tmp.setHex(hex);
    arr[i * 3] = tmp.r;
    arr[i * 3 + 1] = tmp.g;
    arr[i * 3 + 2] = tmp.b;
  }

  return {
    // One particle. Colors are hex numbers; it fades from `from` to `to` and
    // shrinks to nothing over its life. g is gravity (negative floats up).
    emit(x, y, z, svx, svy, seconds, s, from, to, g) {
      const i = head;
      head = (head + 1) % MAX;
      px[i] = x;
      py[i] = y;
      pz[i] = z;
      vx[i] = svx;
      vy[i] = svy;
      life[i] = seconds;
      maxLife[i] = seconds;
      size[i] = s;
      rot[i] = Math.random() * 6.28;
      spin[i] = (Math.random() - 0.5) * 12;
      grav[i] = g;
      setColor(c0, i, from);
      setColor(c1, i, to);
    },

    // A burst of n particles flying out from a point.
    burst(x, y, n, speed, seconds, s, from, to, g) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.28;
        const v = speed * (0.4 + Math.random() * 0.6);
        this.emit(x, y, 0.4, Math.cos(a) * v, Math.sin(a) * v, seconds * (0.6 + Math.random() * 0.4), s, from, to, g);
      }
    },

    clear() {
      life.fill(0);
      mesh.count = 0;
    },

    // move: how far the world scrolled this frame (particles live in the world).
    update(dt, move) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        vy[i] -= grav[i] * dt;
        px[i] += vx[i] * dt - move;
        py[i] += vy[i] * dt;
        rot[i] += spin[i] * dt;

        const t = life[i] / maxLife[i]; // 1 at birth, 0 at death
        const s = size[i] * (0.25 + 0.75 * t);
        const c = Math.cos(rot[i]) * s;
        const sn = Math.sin(rot[i]) * s;
        const o = n * 16;
        matrices[o] = c;
        matrices[o + 1] = sn;
        matrices[o + 2] = 0;
        matrices[o + 3] = 0;
        matrices[o + 4] = -sn;
        matrices[o + 5] = c;
        matrices[o + 6] = 0;
        matrices[o + 7] = 0;
        matrices[o + 8] = 0;
        matrices[o + 9] = 0;
        matrices[o + 10] = 1;
        matrices[o + 11] = 0;
        matrices[o + 12] = px[i];
        matrices[o + 13] = py[i];
        matrices[o + 14] = pz[i];
        matrices[o + 15] = 1;

        const k = i * 3;
        colors[n * 3] = c1[k] + (c0[k] - c1[k]) * t;
        colors[n * 3 + 1] = c1[k + 1] + (c0[k + 1] - c1[k + 1]) * t;
        colors[n * 3 + 2] = c1[k + 2] + (c0[k + 2] - c1[k + 2]) * t;
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}
