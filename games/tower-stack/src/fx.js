// Juice: square rings that spread out from a perfect drop, and a pool of
// sparkles and dust. Each kind is one InstancedMesh.

import * as THREE from 'three';

const RINGS = 6;
const RING_TIME = 0.55;
const RING_SPREAD = 0.95; // how far a ring travels out from the edge
const RING_THICK = 0.14;
const SPARKS = 96;
const SPARK_GRAVITY = 7;

export function createFx(scene) {
  // A ring is four flat bars around the footprint. Bars keep their thickness
  // whatever the footprint, and the ring fades by thinning out, so it can be
  // opaque (no blending cost).
  const bar = new THREE.PlaneGeometry(1, 1);
  bar.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), RINGS * 4);
  rings.frustumCulled = false;
  rings.count = 0;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < RINGS * 4; i++) rings.setColorAt(i, white);
  scene.add(rings);

  const rx = new Float32Array(RINGS);
  const ry = new Float32Array(RINGS);
  const rz = new Float32Array(RINGS);
  const rw = new Float32Array(RINGS);
  const rd = new Float32Array(RINGS);
  const rAge = new Float32Array(RINGS).fill(RING_TIME);
  let nextRing = 0;

  const sparks = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1, 0),
    new THREE.MeshBasicMaterial({ fog: false }),
    SPARKS,
  );
  sparks.frustumCulled = false;
  sparks.count = 0;
  for (let i = 0; i < SPARKS; i++) sparks.setColorAt(i, white);
  scene.add(sparks);

  const px = new Float32Array(SPARKS);
  const py = new Float32Array(SPARKS);
  const pz = new Float32Array(SPARKS);
  const vx = new Float32Array(SPARKS);
  const vy = new Float32Array(SPARKS);
  const vz = new Float32Array(SPARKS);
  const size = new Float32Array(SPARKS);
  const life = new Float32Array(SPARKS);
  const maxLife = new Float32Array(SPARKS);
  let nextSpark = 0;
  let liveSparks = 0;
  let liveRings = 0;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  function spark(x, y, z, sx, sy, sz, s, t) {
    const i = nextSpark;
    nextSpark = (nextSpark + 1) % SPARKS;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    size[i] = s;
    life[i] = t;
    maxLife[i] = t;
    sparks.setColorAt(i, color);
    liveSparks++;
  }

  function writeBar(j, x, y, z, w, d) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w, 1, d);
    dummy.updateMatrix();
    rings.setMatrixAt(j, dummy.matrix);
  }

  return {
    // A ring spreading out from a w x d footprint at height y. delay staggers
    // several rings for a combo.
    ring(x, y, z, w, d, hex, delay) {
      const i = nextRing;
      nextRing = (nextRing + 1) % RINGS;
      rx[i] = x;
      ry[i] = y;
      rz[i] = z;
      rw[i] = w;
      rd[i] = d;
      rAge[i] = -delay;
      color.setHex(hex);
      for (let k = 0; k < 4; k++) rings.setColorAt(i * 4 + k, color);
      rings.instanceColor.needsUpdate = true;
      liveRings++;
    },

    // Sparkles flying out from the edges of a w x d footprint.
    sparkle(x, y, z, w, d, hex, n, speed) {
      color.setHex(hex);
      for (let k = 0; k < n; k++) {
        // A random point on the perimeter, flying outwards from it.
        const side = k % 4;
        const t = Math.random() - 0.5;
        const ex = side < 2 ? t * w : (side === 2 ? -0.5 : 0.5) * w;
        const ez = side < 2 ? (side === 0 ? -0.5 : 0.5) * d : t * d;
        const ox = side < 2 ? 0 : side === 2 ? -1 : 1;
        const oz = side < 2 ? (side === 0 ? -1 : 1) : 0;
        const v = speed * (0.5 + Math.random() * 0.7);
        spark(
          x + ex,
          y,
          z + ez,
          ox * v + (Math.random() - 0.5) * 0.8,
          1.5 + Math.random() * 2.5,
          oz * v + (Math.random() - 0.5) * 0.8,
          0.06 + Math.random() * 0.06,
          0.45 + Math.random() * 0.4,
        );
      }
      sparks.instanceColor.needsUpdate = true;
    },

    // A puff of small chips where a slab was cut.
    dust(x, y, z, hex, n) {
      color.setHex(hex);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = 0.6 + Math.random() * 1.4;
        spark(x, y, z, Math.cos(a) * v, 0.5 + Math.random() * 1.5, Math.sin(a) * v, 0.05 + Math.random() * 0.05, 0.4 + Math.random() * 0.3);
      }
      sparks.instanceColor.needsUpdate = true;
    },

    clear() {
      life.fill(0);
      rAge.fill(RING_TIME);
      liveSparks = 0;
      liveRings = 0;
      sparks.count = 0;
      rings.count = 0;
    },

    update(dt) {
      if (liveRings > 0) {
        liveRings = 0;
        let top = 0;
        for (let i = 0; i < RINGS; i++) {
          if (rAge[i] >= RING_TIME) continue;
          rAge[i] += dt;
          const j = i * 4;
          const k = rAge[i] / RING_TIME;
          if (k >= 1 || k < 0) {
            // Finished, or still waiting for its delay: drawn flat to nothing.
            for (let b = 0; b < 4; b++) writeBar(j + b, 0, -999, 0, 0, 0);
            if (k < 1) liveRings++;
          } else {
            liveRings++;
            const e = 0.06 + (1 - (1 - k) * (1 - k)) * RING_SPREAD; // eases out
            const th = RING_THICK * (1 - k);
            const hw = rw[i] / 2 + e;
            const hd = rd[i] / 2 + e;
            writeBar(j, rx[i], ry[i], rz[i] - hd + th / 2, hw * 2, th);
            writeBar(j + 1, rx[i], ry[i], rz[i] + hd - th / 2, hw * 2, th);
            writeBar(j + 2, rx[i] - hw + th / 2, ry[i], rz[i], th, hd * 2 - th * 2);
            writeBar(j + 3, rx[i] + hw - th / 2, ry[i], rz[i], th, hd * 2 - th * 2);
          }
          top = Math.max(top, j + 4);
        }
        rings.count = liveRings > 0 ? top : 0;
        rings.instanceMatrix.needsUpdate = true;
      }

      if (liveSparks > 0) {
        liveSparks = 0;
        let top = 0;
        for (let i = 0; i < SPARKS; i++) {
          if (life[i] <= 0) continue;
          life[i] -= dt;
          vy[i] -= SPARK_GRAVITY * dt;
          px[i] += vx[i] * dt;
          py[i] += vy[i] * dt;
          pz[i] += vz[i] * dt;
          if (life[i] > 0) liveSparks++;
          top = i + 1;
        }
        for (let i = 0; i < top; i++) {
          const k = Math.max(0, life[i] / maxLife[i]);
          dummy.position.set(px[i], py[i], pz[i]);
          dummy.rotation.set(life[i] * 7, life[i] * 5, 0);
          dummy.scale.setScalar(life[i] > 0 ? size[i] * Math.min(1, k * 2.2) : 0);
          dummy.updateMatrix();
          sparks.setMatrixAt(i, dummy.matrix);
        }
        sparks.count = liveSparks > 0 ? top : 0;
        sparks.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
