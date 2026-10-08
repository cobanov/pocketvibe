// Pooled debris: small colored cubes that pop out of broken bricks, plus
// tiny white sparks on bounces. One InstancedMesh whose live particles are
// kept packed at the front (a dead one is replaced by the last), so only
// those are drawn; when the pool is full a new particle takes an old slot.

import * as THREE from 'three';

const MAX = 200;
const GRAVITY = 24;

export function createEffects(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ emissive: 0x2a2a2a }),
    MAX,
  );
  mesh.frustumCulled = false;
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const rot = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const hexes = new Uint32Array(MAX);

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX; i++) {
    mesh.setMatrixAt(i, ZERO);
    mesh.setColorAt(i, color);
  }
  mesh.count = 0;

  let cursor = 0; // the slot a new particle takes when the pool is full
  let colorsDirty = false;
  let live = 0; // particles alive, in slots 0 .. live - 1

  function spawn(x, y, z, sx, sy, sz, s, t, hex) {
    let i;
    if (live < MAX) i = live++;
    else {
      i = cursor;
      cursor = (cursor + 1) % MAX;
    }
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    rot[i] = Math.random() * 6;
    spin[i] = (Math.random() - 0.5) * 16;
    size[i] = s;
    life[i] = t;
    maxLife[i] = t;
    hexes[i] = hex;
    color.setHex(hex);
    mesh.setColorAt(i, color);
    colorsDirty = true;
  }

  // Moves particle j into slot i (i's particle is dead).
  function move(j, i) {
    px[i] = px[j];
    py[i] = py[j];
    pz[i] = pz[j];
    vx[i] = vx[j];
    vy[i] = vy[j];
    vz[i] = vz[j];
    rot[i] = rot[j];
    spin[i] = spin[j];
    size[i] = size[j];
    life[i] = life[j];
    maxLife[i] = maxLife[j];
    hexes[i] = hexes[j];
    color.setHex(hexes[i]);
    mesh.setColorAt(i, color);
    colorsDirty = true;
  }

  return {
    // Chunks flying out of a broken brick.
    burst(x, z, hex, n) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 1.5 + Math.random() * 3.5;
        spawn(
          x + (Math.random() - 0.5) * 0.9,
          0.3 + Math.random() * 0.2,
          z + (Math.random() - 0.5) * 0.4,
          Math.cos(a) * sp,
          4 + Math.random() * 5,
          Math.sin(a) * sp,
          0.14 + Math.random() * 0.14,
          0.55 + Math.random() * 0.35,
          hex,
        );
      }
    },

    // A few quick sparks where the ball bounced.
    sparks(x, z, n, hex) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 3 + Math.random() * 4;
        spawn(x, 0.35, z, Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp, 0.08, 0.22, hex);
      }
    },

    // A spark or two jumping off a bomb's fuse.
    fuse(x, z) {
      const n = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 0.6 + Math.random() * 1.2;
        spawn(x, 0.62, z, Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp, 0.07, 0.3, k ? 0xff8a3a : 0xffe27a);
      }
    },

    clear() {
      live = 0;
      cursor = 0;
      mesh.count = 0;
    },

    update(dt) {
      if (live === 0 && mesh.count === 0) return;
      let i = 0;
      while (i < live) {
        life[i] -= dt;
        if (life[i] <= 0) {
          // The last live particle takes this slot and is updated next.
          live--;
          if (i < live) move(live, i);
          continue;
        }
        vy[i] -= GRAVITY * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const half = size[i] * 0.5;
        if (py[i] < half) {
          // Bounce on the floor and lose speed.
          py[i] = half;
          vy[i] = -vy[i] * 0.35;
          vx[i] *= 0.7;
          vz[i] *= 0.7;
        }
        rot[i] += spin[i] * dt;
        const s = size[i] * Math.min(1, (life[i] / maxLife[i]) * 2.5);
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(rot[i], rot[i] * 0.7, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        i++;
      }
      mesh.count = live;
      mesh.instanceMatrix.needsUpdate = true;
      if (colorsDirty) {
        mesh.instanceColor.needsUpdate = true;
        colorsDirty = false;
      }
    },
  };
}
