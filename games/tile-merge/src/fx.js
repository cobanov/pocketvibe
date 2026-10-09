// Juice: chunky little cubes that burst out of merges (one InstancedMesh, a
// ring of slots where a new particle takes the oldest) and one flat ring that
// sweeps out from big merges. The cubes are plain (12 triangles): they are a
// few pixels across, and 180 bevelled ones went over the triangle budget.

import * as THREE from 'three';
import { TILE_RGB, bake } from './shared.js';

const MAX = 180;
const GRAVITY = 22;
const FLOOR = 0.06;
const RING_TIME = 0.4;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(
    bake(new THREE.BoxGeometry(1, 1, 1), 0xffffff),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    MAX,
  );
  mesh.frustumCulled = false; // instances move
  mesh.count = 0;
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, white);
  scene.add(mesh);

  const ringGeometry = new THREE.RingGeometry(0.82, 1, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.visible = false;
  scene.add(ring);
  let ringAge = RING_TIME;
  let ringSize = 1;

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
  const cr = new Float32Array(MAX);
  const cg = new Float32Array(MAX);
  const cb = new Float32Array(MAX);
  const matrices = mesh.instanceMatrix.array;
  const colors = mesh.instanceColor.array;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let next = 0;

  function add(x, y, z, speed, up, s, time, r, g, b) {
    const i = next;
    next = (next + 1) % MAX;
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = Math.cos(a) * v;
    vz[i] = Math.sin(a) * v;
    vy[i] = up * (0.6 + Math.random() * 0.7);
    life[i] = time * (0.75 + Math.random() * 0.5);
    ttl[i] = life[i];
    size[i] = s * (0.7 + Math.random() * 0.6);
    spin[i] = (Math.random() - 0.5) * 18;
    cr[i] = r;
    cg[i] = g;
    cb[i] = b;
  }

  return {
    // Crumbs in the colour of tile e, out of a merge at (x, z).
    burst(x, z, e, n, power) {
      const k = e * 3;
      for (let j = 0; j < n; j++) {
        // A few come out lighter, like sparks.
        const w = j % 4 === 0 ? 0.5 : 0;
        add(
          x + (Math.random() - 0.5) * 0.5,
          0.5,
          z + (Math.random() - 0.5) * 0.5,
          1.6 + 1.2 * power,
          3.5 + 1.8 * power,
          0.12 + 0.03 * power,
          0.5 + 0.15 * power,
          TILE_RGB[k] + (1 - TILE_RGB[k]) * w,
          TILE_RGB[k + 1] + (1 - TILE_RGB[k + 1]) * w,
          TILE_RGB[k + 2] + (1 - TILE_RGB[k + 2]) * w,
        );
      }
    },

    // Confetti in the colour hex, thrown high from (x, z).
    confetti(x, z, hex, n) {
      color.setHex(hex);
      for (let j = 0; j < n; j++) add(x, 0.6, z, 4.5, 11, 0.16, 1.3, color.r, color.g, color.b);
    },

    // A flat ring that sweeps out from (x, z).
    wave(x, z, hex, scale) {
      ring.position.set(x, 0.03, z);
      ringMaterial.color.setHex(hex);
      ringSize = scale;
      ringAge = 0;
    },

    clear() {
      life.fill(0);
      mesh.count = 0;
      ringAge = RING_TIME;
      ring.visible = false;
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
        if (py[i] < FLOOR && vy[i] < 0) {
          // Bounce off the board and lose speed.
          py[i] = FLOOR;
          vy[i] *= -0.35;
          vx[i] *= 0.6;
          vz[i] *= 0.6;
        }
        const a = life[i] * spin[i];
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(a, a * 0.7, 0);
        dummy.scale.setScalar(size[i] * Math.min(1, (life[i] / ttl[i]) * 2.5));
        dummy.updateMatrix();
        dummy.matrix.toArray(matrices, n * 16);
        colors[n * 3] = cr[i];
        colors[n * 3 + 1] = cg[i];
        colors[n * 3 + 2] = cb[i];
        n++;
      }
      mesh.count = n;
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }

      ringAge += dt;
      ring.visible = ringAge < RING_TIME;
      if (ring.visible) {
        const k = ringAge / RING_TIME;
        ring.scale.setScalar((0.5 + easeOut(k) * 2.2) * ringSize);
        ringMaterial.opacity = 0.9 * (1 - k);
      }
    },
  };
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
