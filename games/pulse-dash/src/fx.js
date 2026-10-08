// Effects: a ring buffer of glowing squares (the cube's trail, sparks,
// the crash and the confetti) drawn as one additive InstancedMesh with
// per-instance colours, and one shockwave ring. Additive blending means a
// particle fades by darkening, so no transparency sorting is needed.
// Particles live in world space; nothing is allocated after startup.

import * as THREE from 'three';

const MAX = 240;
const RING_TIME = 0.5;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    MAX,
  );
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  scene.add(mesh);

  // Drawn over everything, so the floor does not cut it in half.
  const ringMat = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), ringMat);
  ring.renderOrder = 2;
  ring.visible = false;
  scene.add(ring);
  const ringColor = new THREE.Color();
  let ringAge = RING_TIME;

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
  const rgb = new Float32Array(MAX * 3);
  let head = 0;

  const matrices = mesh.instanceMatrix.array;
  const colors = mesh.instanceColor.array;
  const tmp = new THREE.Color();

  function emit(x, y, z, svx, svy, seconds, s, hex, g) {
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
    spin[i] = (Math.random() - 0.5) * 10;
    grav[i] = g;
    // Through THREE.Color, so the sRGB hex becomes the linear colour the
    // renderer expects.
    tmp.setHex(hex);
    rgb[i * 3] = tmp.r;
    rgb[i * 3 + 1] = tmp.g;
    rgb[i * 3 + 2] = tmp.b;
  }

  return {
    emit,

    // n particles flying out of (x, y) in all directions.
    burst(x, y, n, speed, seconds, s, hex, g) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.28;
        const v = speed * (0.35 + Math.random() * 0.65);
        emit(x, y, 0.3, Math.cos(a) * v, Math.sin(a) * v, seconds * (0.6 + Math.random() * 0.4), s, hex, g);
      }
    },

    // An expanding ring at (x, y), facing the camera.
    shockwave(x, y, hex) {
      ring.position.set(x, y, 0.4);
      ringColor.setHex(hex);
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
        vy[i] -= grav[i] * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        rot[i] += spin[i] * dt;

        const t = life[i] / maxLife[i]; // 1 at birth, 0 at death
        const s = size[i] * (0.3 + 0.7 * t);
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
        const k = Math.min(1, t * 1.6);
        colors[n * 3] = rgb[i * 3] * k;
        colors[n * 3 + 1] = rgb[i * 3 + 1] * k;
        colors[n * 3 + 2] = rgb[i * 3 + 2] * k;
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;

      ringAge += dt;
      ring.visible = ringAge < RING_TIME;
      if (ring.visible) {
        const k = ringAge / RING_TIME;
        ring.scale.setScalar(0.6 + 4.2 * (1 - (1 - k) * (1 - k)));
        ringMat.color.copy(ringColor).multiplyScalar(1 - k);
      }
    },
  };
}
