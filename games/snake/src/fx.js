// Cheap juice: a pool of bouncing cube particles (one InstancedMesh) and a
// single expanding ring on the floor.

import * as THREE from 'three';

const MAX = 96;
const GRAVITY = 18;
const FLOOR = 0.09;
const RING_TIME = 0.35;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.18),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    MAX,
  );
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  const white = new THREE.Color(0xffffff);
  mesh.setColorAt(0, white); // creates instanceColor once, up front
  scene.add(mesh);

  const ringGeometry = new THREE.RingGeometry(0.8, 1, 32);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.y = 0.03;
  ring.visible = false;
  scene.add(ring);
  let ringAge = RING_TIME;

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  let next = 0; // ring-buffer slot for the next particle

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  return {
    // n cubes flying out of (x, y, z) in the color hex.
    burst(x, y, z, hex, n, speed) {
      color.setHex(hex);
      for (let k = 0; k < n; k++) {
        const i = next;
        next = (next + 1) % MAX;
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.5 + Math.random() * 0.6);
        px[i] = x;
        py[i] = y;
        pz[i] = z;
        vx[i] = Math.cos(a) * v;
        vz[i] = Math.sin(a) * v;
        vy[i] = speed * (0.9 + Math.random() * 0.9);
        maxLife[i] = 0.5 + Math.random() * 0.35;
        life[i] = maxLife[i];
        mesh.setColorAt(i, color);
      }
      mesh.instanceColor.needsUpdate = true;
    },

    // A flat ring that grows and fades from (x, z).
    wave(x, z, hex) {
      ring.position.x = x;
      ring.position.z = z;
      ringMaterial.color.setHex(hex);
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
        vy[i] -= GRAVITY * dt;
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
      // Slots keep their order (colors stay valid); dead slots below the last
      // live one are drawn with zero scale, nothing past it is drawn at all.
      for (let i = 0; i < top; i++) {
        const k = Math.max(0, life[i] / maxLife[i]);
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(life[i] * 9, life[i] * 6, 0);
        dummy.scale.setScalar(life[i] > 0 ? Math.min(1, k * 1.8) : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      if (top > 0 || mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
      mesh.count = top;

      ringAge += dt;
      ring.visible = ringAge < RING_TIME;
      if (ring.visible) {
        const k = ringAge / RING_TIME;
        ring.scale.setScalar(0.4 + k * 1.6);
        ringMaterial.opacity = 0.85 * (1 - k);
      }
    },
  };
}
