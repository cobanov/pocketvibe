// Explosions and flashes: pooled particles and shock rings, each one
// InstancedMesh with additive blending, so fading a color to black fades it out.

import * as THREE from 'three';
import { HALF_H, HALF_W, TAU } from './shared.js';

const MAX_PARTS = 360;
const MAX_RINGS = 10;
const FX_Z = 5; // above every rock, ship and saucer, so sparks are never hidden

const tmpColor = new THREE.Color();
const dummy = new THREE.Object3D();

export function createFx(scene) {
  const additive = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  };

  const partMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial(additive),
    MAX_PARTS,
  );
  partMesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  scene.add(partMesh);

  const ringMesh = new THREE.InstancedMesh(
    new THREE.RingGeometry(0.86, 1, 28),
    new THREE.MeshBasicMaterial(additive),
    MAX_RINGS,
  );
  ringMesh.frustumCulled = false;
  scene.add(ringMesh);

  // Instance colors must exist before the first render so the shader uses them.
  tmpColor.setRGB(0, 0, 0);
  for (let i = 0; i < MAX_PARTS; i++) partMesh.setColorAt(i, tmpColor);
  for (let i = 0; i < MAX_RINGS; i++) ringMesh.setColorAt(i, tmpColor);
  partMesh.count = 0;
  ringMesh.count = 0;

  // A full-screen additive plane for color flashes, hidden when idle. It is
  // larger than the field, so it covers the screen with camera shake too.
  const flashMaterial = new THREE.MeshBasicMaterial({ ...additive, color: 0x000000 });
  const flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 8, HALF_H * 2 + 8), flashMaterial);
  flashMesh.position.z = 10;
  flashMesh.visible = false;
  scene.add(flashMesh);

  const parts = [];
  for (let i = 0; i < MAX_PARTS; i++) {
    parts.push({ life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, size: 0, r: 0, g: 0, b: 0, rot: 0, spin: 0, drag: 0 });
  }
  const rings = [];
  for (let i = 0; i < MAX_RINGS; i++) rings.push({ life: 0, max: 1, x: 0, y: 0, radius: 1, r: 0, g: 0, b: 0 });

  let nextPart = 0;
  let nextRing = 0;
  let flashTime = 0;
  let flashMax = 1;
  let flashR = 0;
  let flashG = 0;
  let flashB = 0;

  // Takes the next slot round-robin; when the pool is full the oldest spark goes.
  function spark(x, y, vx, vy, life, size, hex, drag) {
    const p = parts[nextPart];
    nextPart = (nextPart + 1) % MAX_PARTS;
    tmpColor.setHex(hex);
    p.life = life;
    p.max = life;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.size = size;
    p.r = tmpColor.r;
    p.g = tmpColor.g;
    p.b = tmpColor.b;
    p.rot = Math.random() * TAU;
    p.spin = (Math.random() - 0.5) * 16;
    p.drag = drag;
  }

  return {
    spark,

    // n sparks flying out from (x, y) in every direction.
    burst(x, y, hex, n, speed, life, size) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = speed * (0.25 + Math.random() * 0.75);
        spark(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.4), size, hex, 2.2);
      }
    },

    // A shock ring that grows to radius and fades out.
    ring(x, y, hex, radius, life) {
      const r = rings[nextRing];
      nextRing = (nextRing + 1) % MAX_RINGS;
      tmpColor.setHex(hex);
      r.life = life;
      r.max = life;
      r.x = x;
      r.y = y;
      r.radius = radius;
      r.r = tmpColor.r;
      r.g = tmpColor.g;
      r.b = tmpColor.b;
    },

    // Tints the whole screen for a moment.
    flash(hex, strength, life) {
      tmpColor.setHex(hex);
      flashR = tmpColor.r * strength;
      flashG = tmpColor.g * strength;
      flashB = tmpColor.b * strength;
      flashTime = life;
      flashMax = life;
    },

    clear() {
      for (let i = 0; i < MAX_PARTS; i++) parts[i].life = 0;
      for (let i = 0; i < MAX_RINGS; i++) rings[i].life = 0;
      flashTime = 0;
    },

    update(dt) {
      let n = 0;
      for (let i = 0; i < MAX_PARTS; i++) {
        const p = parts[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) continue;
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        const t = p.life / p.max;
        dummy.position.set(p.x, p.y, FX_Z);
        dummy.rotation.set(0, 0, p.rot);
        dummy.scale.setScalar(p.size * (0.35 + 0.65 * t));
        dummy.updateMatrix();
        partMesh.setMatrixAt(n, dummy.matrix);
        // Brightest at birth; the extra boost makes fresh sparks white-hot.
        const hot = 1 + t * t * 0.8;
        tmpColor.setRGB(Math.min(1, p.r * t * hot), Math.min(1, p.g * t * hot), Math.min(1, p.b * t * hot));
        partMesh.setColorAt(n, tmpColor);
        n++;
      }
      partMesh.count = n;
      partMesh.instanceMatrix.needsUpdate = true;
      partMesh.instanceColor.needsUpdate = true;

      let m = 0;
      for (let i = 0; i < MAX_RINGS; i++) {
        const r = rings[i];
        if (r.life <= 0) continue;
        r.life -= dt;
        if (r.life <= 0) continue;
        const t = r.life / r.max;
        const grow = 1 - t * t * t; // fast at first, then easing out
        dummy.position.set(r.x, r.y, FX_Z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(r.radius * (0.15 + 0.85 * grow));
        dummy.updateMatrix();
        ringMesh.setMatrixAt(m, dummy.matrix);
        tmpColor.setRGB(r.r * t, r.g * t, r.b * t);
        ringMesh.setColorAt(m, tmpColor);
        m++;
      }
      ringMesh.count = m;
      ringMesh.instanceMatrix.needsUpdate = true;
      ringMesh.instanceColor.needsUpdate = true;

      if (flashTime > 0) {
        flashTime -= dt;
        const t = Math.max(0, flashTime / flashMax);
        flashMaterial.color.setRGB(flashR * t, flashG * t, flashB * t);
        flashMesh.visible = t > 0;
      } else {
        flashMesh.visible = false;
      }
    },
  };
}
