// Cheap juice: a pool of glowing cube particles (one InstancedMesh; a new
// particle takes the lowest free slot, so only as many instances as there
// are live particles get drawn, or the oldest slot when all are busy) and a
// single expanding ring on the floor.

import * as THREE from 'three';

const MAX = 180;
const GRAVITY = 16;
const FLOOR = 0.08;
const RING_TIME = 0.4;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    MAX,
  );
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  const color = new THREE.Color(0xffffff);
  mesh.setColorAt(0, color); // creates instanceColor once, up front
  scene.add(mesh);

  const ringGeometry = new THREE.RingGeometry(0.8, 1, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.y = 0.04;
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
  const grav = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  let next = 0;
  let colorsDirty = false;

  const dummy = new THREE.Object3D();

  function spawn(x, y, z, sx, sy, sz, g, s, t) {
    let i = 0;
    while (i < MAX && life[i] > 0) i++;
    if (i === MAX) {
      i = next;
      next = (next + 1) % MAX;
    }
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    grav[i] = g;
    size[i] = s;
    life[i] = t;
    maxLife[i] = t;
    mesh.setColorAt(i, color);
    colorsDirty = true;
  }

  return {
    // n cubes flying out of (x, y, z) in the color hex, falling back down.
    burst(x, y, z, hex, n, speed) {
      color.setHex(hex);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.7);
        spawn(
          x,
          y,
          z,
          Math.cos(a) * v,
          speed * (0.6 + Math.random() * 0.9),
          Math.sin(a) * v,
          GRAVITY,
          0.7 + Math.random() * 0.6,
          0.45 + Math.random() * 0.4,
        );
      }
    },

    // A few small sparks that drift and fade without falling.
    sparks(x, y, z, hex, n, speed) {
      color.setHex(hex);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.7);
        spawn(x, y, z, Math.cos(a) * v, 0.5 + Math.random(), Math.sin(a) * v, 0, 0.45, 0.25 + Math.random() * 0.2);
      }
    },

    // A flat ring that grows and fades from (x, z).
    wave(x, z, hex, s) {
      ring.position.x = x;
      ring.position.z = z;
      ringMaterial.color.setHex(hex);
      ringSize = s;
      ringAge = 0;
    },

    clear() {
      life.fill(0);
      ringAge = RING_TIME;
    },

    update(dt) {
      let top = 0; // one past the last live slot
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        vy[i] -= grav[i] * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        if (py[i] < FLOOR && vy[i] < 0) {
          py[i] = FLOOR;
          vy[i] *= -0.4;
          vx[i] *= 0.6;
          vz[i] *= 0.6;
        }
        top = i + 1;
      }
      // Dead slots below the last live one are drawn with zero scale,
      // nothing past it is drawn at all.
      for (let i = 0; i < top; i++) {
        const k = Math.max(0, life[i] / maxLife[i]);
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(life[i] * 9, life[i] * 6, 0);
        dummy.scale.setScalar(life[i] > 0 ? size[i] * Math.min(1, k * 2) : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      if (top > 0 || mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
      mesh.count = top;
      if (colorsDirty) {
        mesh.instanceColor.needsUpdate = true;
        colorsDirty = false;
      }

      ringAge += dt;
      ring.visible = ringAge < RING_TIME;
      if (ring.visible) {
        const k = ringAge / RING_TIME;
        ring.scale.setScalar((0.3 + k * 1.7) * ringSize);
        ringMaterial.opacity = 0.9 * (1 - k);
      }
    },
  };
}
