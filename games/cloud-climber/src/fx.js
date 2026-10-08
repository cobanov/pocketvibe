// Pooled particles drawn with one InstancedMesh of low-poly puffs: cloud
// dust on landings, storm-cloud crumbs, star sparkles, propeller trails.
// A ring of slots; a new particle takes the oldest one.

import * as THREE from 'three';

const MAX = 160;

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ flatShading: true, emissive: 0x404040 }),
    MAX,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, white);
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const gravity = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  const grow = new Uint8Array(MAX); // puffs swell as they fade, sparks shrink
  const colors = [];
  for (let i = 0; i < MAX; i++) colors.push(new THREE.Color());
  let cursor = 0;

  const dummy = new THREE.Object3D();

  function spawn(x, y, z, sx, sy, sz, s, t, hex, g, d, swell) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    size[i] = s;
    life[i] = t;
    maxLife[i] = t;
    gravity[i] = g;
    drag[i] = d;
    grow[i] = swell ? 1 : 0;
    colors[i].setHex(hex);
  }

  return {
    // Soft puffs squeezed out sideways from under the feet.
    dust(x, y, hex, n) {
      for (let k = 0; k < n; k++) {
        const side = k % 2 ? 1 : -1;
        spawn(
          x + side * (0.2 + Math.random() * 0.3),
          y - 0.05,
          (Math.random() - 0.5) * 0.6,
          side * (1.5 + Math.random() * 2.5),
          0.4 + Math.random() * 1.4,
          (Math.random() - 0.5) * 1.5,
          0.1 + Math.random() * 0.08,
          0.35 + Math.random() * 0.25,
          hex,
          -1,
          4,
          true,
        );
      }
    },

    // Pieces flying out in all directions from (x, y).
    burst(x, y, hex, n, speed, s, t, g) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.7);
        spawn(
          x,
          y,
          (Math.random() - 0.5) * 0.4,
          Math.cos(a) * v,
          Math.sin(a) * v + speed * 0.3,
          (Math.random() - 0.5) * speed * 0.5,
          s * (0.7 + Math.random() * 0.6),
          t * (0.7 + Math.random() * 0.5),
          hex,
          g,
          1.5,
          false,
        );
      }
    },

    // A single puff left behind by the propeller.
    trail(x, y, hex) {
      spawn(
        x + (Math.random() - 0.5) * 0.4,
        y,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 1.2,
        -2 - Math.random() * 2,
        0,
        0.12 + Math.random() * 0.08,
        0.45,
        hex,
        0,
        2,
        true,
      );
    },

    clear() {
      life.fill(0);
      mesh.count = 0;
    },

    update(dt) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        const slow = Math.max(0, 1 - drag[i] * dt);
        vx[i] *= slow;
        vy[i] *= slow;
        vz[i] *= slow;
        vy[i] -= gravity[i] * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const k = life[i] / maxLife[i];
        const s = grow[i] ? size[i] * (1.6 - 0.6 * k) * Math.min(1, k * 3) : size[i] * k;
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(life[i] * 5, life[i] * 4, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, colors[i]);
        n++;
      }
      mesh.count = n;
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
