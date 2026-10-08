// Explosions: a fixed pool of debris cubes in one InstancedMesh. Each burst
// takes free particles from the pool; when the pool is full, bursts get
// smaller instead of allocating.

import * as THREE from 'three';

const MAX = 260;
const GRAVITY = 16;
const DRAG = 2.2;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MAX);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  const color = new THREE.Color();
  mesh.setColorAt(0, color); // creates the color buffer
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX); // seconds left; 0 means free
  const maxLife = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  const cr = new Float32Array(MAX);
  const cg = new Float32Array(MAX);
  const cb = new Float32Array(MAX);
  const dummy = new THREE.Object3D();
  let cursor = 0;

  return {
    // count cubes of color hex fly out from (x, y, z) at up to speed units/s.
    burst(x, y, z, hex, count, speed, scale) {
      color.setHex(hex);
      let made = 0;
      for (let k = 0; k < MAX && made < count; k++) {
        const i = cursor;
        cursor = (cursor + 1) % MAX;
        if (life[i] > 0) continue;
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.35 + Math.random() * 0.65);
        px[i] = x;
        py[i] = y;
        pz[i] = z;
        vx[i] = Math.cos(a) * s;
        vz[i] = Math.sin(a) * s * 0.8;
        vy[i] = (0.3 + Math.random()) * speed * 0.6;
        maxLife[i] = life[i] = 0.35 + Math.random() * 0.45;
        size[i] = scale * (0.6 + Math.random() * 0.8);
        spin[i] = Math.random() * 6;
        // Some debris is white hot, the rest takes the color of what blew up.
        const hot = Math.random() < 0.25;
        cr[i] = hot ? 1 : color.r;
        cg[i] = hot ? 1 : color.g;
        cb[i] = hot ? 1 : color.b;
        made++;
      }
    },

    clear() {
      life.fill(0);
      mesh.count = 0;
    },

    update(dt) {
      let n = 0;
      const drag = Math.max(0, 1 - DRAG * dt);
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        vy[i] -= GRAVITY * dt;
        vx[i] *= drag;
        vz[i] *= drag;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        spin[i] += dt * 9;
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(spin[i], spin[i] * 0.7, 0);
        dummy.scale.setScalar(size[i] * Math.min(1, (life[i] / maxLife[i]) * 1.6));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        color.setRGB(cr[i], cg[i], cb[i]);
        mesh.setColorAt(n, color);
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    },
  };
}
