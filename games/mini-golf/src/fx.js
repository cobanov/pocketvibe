// Pooled effects: one InstancedMesh of small boxes for wood chips, sparks,
// splashes, dust and confetti (a new particle takes the lowest free slot,
// and only slots up to the highest live one are drawn), plus two expanding
// rings for splashes and the cup.

import * as THREE from 'three';

const MAX = 220;
const GRAVITY = 16;
const RINGS = 2;
const RING_TIME = 0.6;

const CHUNK = 0;
const CONFETTI = 1;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ emissive: 0x303030 }), MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const floor = new Float32Array(MAX);
  const rot = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const kind = new Uint8Array(MAX);

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX; i++) {
    mesh.setMatrixAt(i, ZERO);
    mesh.setColorAt(i, color);
  }

  const ringGeometry = new THREE.RingGeometry(0.7, 1, 28);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < RINGS; i++) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const ring = new THREE.Mesh(ringGeometry, material);
    ring.visible = false;
    scene.add(ring);
    rings.push({ ring, material, age: RING_TIME, size: 1 });
  }
  let nextRing = 0;

  let cursor = 0; // where the search for a free slot starts
  let top = 0; // slots below this are drawn
  let live = 0;
  let colorsDirty = false;

  function spawn(k, x, y, z, sx, sy, sz, s, t, hex, ground) {
    // The lowest free slot, or the next one round when all are taken.
    let i = -1;
    for (let j = cursor; j < MAX; j++) {
      if (life[j] <= 0) {
        i = j;
        break;
      }
    }
    if (i < 0) i = cursor % MAX;
    cursor = i + 1;
    if (i >= top) {
      top = i + 1;
      mesh.count = top;
    }
    kind[i] = k;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    floor[i] = ground;
    rot[i] = Math.random() * 6;
    spin[i] = (Math.random() - 0.5) * 14;
    size[i] = s;
    life[i] = t;
    maxLife[i] = t;
    color.setHex(hex);
    mesh.setColorAt(i, color);
    colorsDirty = true;
    live++;
  }

  return {
    // Chips flying off a point, mostly away along (nx, nz).
    chips(x, y, z, nx, nz, hex, n, speed) {
      for (let k = 0; k < n; k++) {
        const a = Math.atan2(nz, nx) + (Math.random() - 0.5) * 2.2;
        const sp = speed * (0.4 + Math.random() * 0.7);
        spawn(CHUNK, x, y, z, Math.cos(a) * sp, 1.5 + Math.random() * 2.5, Math.sin(a) * sp,
          0.05 + Math.random() * 0.05, 0.3 + Math.random() * 0.25, hex, y - 0.1);
      }
    },

    // A round burst of cubes.
    burst(x, y, z, hex, n, speed, ground) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = speed * (0.3 + Math.random() * 0.7);
        spawn(CHUNK, x, y, z, Math.cos(a) * sp, speed * (0.8 + Math.random()), Math.sin(a) * sp,
          0.06 + Math.random() * 0.07, 0.45 + Math.random() * 0.35, hex, ground);
      }
    },

    // Slow tumbling paper squares in many colors.
    confetti(x, y, z, n, colors) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.6 + Math.random() * 2.2;
        spawn(CONFETTI, x, y, z, Math.cos(a) * sp, 4 + Math.random() * 4, Math.sin(a) * sp,
          0.1 + Math.random() * 0.05, 1.6 + Math.random() * 0.8, colors[k % colors.length], y - 0.4);
      }
    },

    // A flat ring that grows and fades from (x, y, z).
    ring(x, y, z, hex, size) {
      const r = rings[nextRing];
      nextRing = (nextRing + 1) % RINGS;
      r.ring.position.set(x, y, z);
      r.material.color.setHex(hex);
      r.size = size;
      r.age = 0;
    },

    clear() {
      for (let i = 0; i < MAX; i++) {
        life[i] = 0;
        mesh.setMatrixAt(i, ZERO);
      }
      live = 0;
      cursor = 0;
      top = 0;
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < RINGS; i++) rings[i].age = RING_TIME;
    },

    update(dt) {
      for (let i = 0; i < RINGS; i++) {
        const r = rings[i];
        r.age += dt;
        r.ring.visible = r.age < RING_TIME;
        if (!r.ring.visible) continue;
        const k = r.age / RING_TIME;
        r.ring.scale.setScalar(r.size * (0.25 + (1 - (1 - k) * (1 - k)) * 0.9));
        r.material.opacity = 0.85 * (1 - k);
      }

      if (live === 0) return;
      live = 0;
      let high = 0;
      for (let i = 0; i < top; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          mesh.setMatrixAt(i, ZERO);
          continue;
        }
        live++;
        high = i + 1;
        if (kind[i] === CONFETTI) {
          // Paper: little gravity, lots of drag and a flutter.
          vy[i] = Math.max(vy[i] - GRAVITY * 0.35 * dt, -1.2);
          vx[i] *= 1 - dt * 1.8;
          vz[i] *= 1 - dt * 1.8;
          px[i] += (vx[i] + Math.sin(life[i] * 7 + i) * 0.6) * dt;
        } else {
          vy[i] -= GRAVITY * dt;
          px[i] += vx[i] * dt;
        }
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const half = size[i] * 0.5;
        if (py[i] < floor[i] + half) {
          py[i] = floor[i] + half;
          vy[i] = -vy[i] * 0.3;
          vx[i] *= 0.6;
          vz[i] *= 0.6;
        }
        rot[i] += spin[i] * dt;
        const s = size[i] * Math.min(1, (life[i] / maxLife[i]) * 3);
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(rot[i], rot[i] * 0.7, rot[i] * 0.3);
        if (kind[i] === CONFETTI) dummy.scale.set(s, s * 0.12, s * 0.7);
        else dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      // Freed slots low down are taken first again.
      top = high;
      mesh.count = top;
      cursor = 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (colorsDirty) {
        mesh.instanceColor.needsUpdate = true;
        colorsDirty = false;
      }
    },
  };
}
