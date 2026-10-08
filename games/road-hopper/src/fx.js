// Effects: pooled particles (dust, feathers, splashes, coin sparkles) drawn
// with one InstancedMesh, and the hawk that grabs a chicken who dawdles.

import * as THREE from 'three';
import { hawkBodyGeometry, hawkWingGeometry } from './models.js';

const MAX = 96;
const SWOOP = 0.6; // seconds from the hawk appearing to the grab

export function createFx(scene, shadowMaterial) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), MAX);
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
  const colors = [];
  for (let i = 0; i < MAX; i++) colors.push(new THREE.Color());
  let cursor = 0;

  const dummy = new THREE.Object3D();

  function spawn(x, y, z, sx, sy, sz, s, t, hex, g, d) {
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
    colors[i].setHex(hex);
  }

  // n particles flying out from (x, y, z).
  function burst(x, y, z, n, hex, speed, up, s, t, g, d) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.4 + Math.random() * 0.6);
      spawn(
        x,
        y,
        z,
        Math.cos(a) * r,
        up * (0.5 + Math.random() * 0.7),
        Math.sin(a) * r,
        s * (0.7 + Math.random() * 0.6),
        t * (0.7 + Math.random() * 0.5),
        hex,
        g,
        d,
      );
    }
  }

  // The hawk: a body and two flapping wings.
  const hawkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const hawk = new THREE.Group();
  hawk.add(new THREE.Mesh(hawkBodyGeometry(), hawkMaterial));
  const wingR = new THREE.Mesh(hawkWingGeometry(1), hawkMaterial);
  const wingL = new THREE.Mesh(hawkWingGeometry(-1), hawkMaterial);
  wingR.position.set(0.22, 0.1, 0);
  wingL.position.set(-0.22, 0.1, 0);
  hawk.add(wingR, wingL);
  hawk.scale.setScalar(1.15);
  hawk.visible = false;
  scene.add(hawk);

  const hawkShadowGeometry = new THREE.CircleGeometry(0.6, 12);
  hawkShadowGeometry.rotateX(-Math.PI / 2);
  const hawkShadow = new THREE.Mesh(hawkShadowGeometry, shadowMaterial);
  hawkShadow.visible = false;
  scene.add(hawkShadow);

  let hawkT = -1; // < 0 when the hawk is away
  let hawkX = 0;
  let hawkZ = 0;

  function placeHawk(x, y, z, dx, dy, dz) {
    hawk.position.set(x, y, z);
    // Face the flight direction (the model faces -z), nose a little down or up.
    hawk.rotation.set(-Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * 0.6, Math.atan2(-dx, -dz), 0, 'YXZ');
    hawkShadow.position.set(x, 0.015, z);
    hawkShadow.scale.setScalar(Math.max(0.4, 1.6 - y * 0.12));
  }

  return {
    dust(x, y, z) {
      burst(x, y + 0.05, z, 4, 0xf3ead2, 1.4, 1.2, 0.09, 0.3, 4, 3);
    },

    splash(x, y, z, big) {
      burst(x, y, z, big ? 18 : 5, 0xffffff, big ? 2.2 : 1.2, big ? 6 : 2.5, 0.12, 0.55, 16, 0.5);
      if (big) burst(x, y, z, 10, 0x7fd8ff, 1.6, 5, 0.14, 0.6, 16, 0.5);
    },

    sparkle(x, y, z) {
      burst(x, y, z, 10, 0xffd23f, 2.4, 3.5, 0.11, 0.45, 9, 1);
    },

    feathers(x, y, z) {
      burst(x, y + 0.4, z, 18, 0xffffff, 2.8, 4, 0.13, 1.1, 5, 2.5);
      burst(x, y + 0.4, z, 4, 0xff3b3b, 2.2, 3, 0.1, 0.9, 5, 2.5);
    },

    // The hawk swoops on the chicken at (x, z).
    hawk(x, z) {
      hawkT = 0;
      hawkX = x;
      hawkZ = z;
      hawk.visible = true;
      hawkShadow.visible = true;
    },

    // True once the hawk has its talons on the chicken.
    get grabbed() {
      return hawkT >= SWOOP;
    },

    // Where the chicken hangs while it is carried.
    get hawkPosition() {
      return hawk.position;
    },

    // Shows the hawk and a particle at (x, z) for the loading frame, so their
    // materials compile and geometries upload then; clear() hides them.
    warmUp(x, z) {
      placeHawk(x, 1.5, z, 0, -1, -1);
      hawk.visible = true;
      hawkShadow.visible = true;
      dummy.position.set(x, 0.5, z);
      dummy.updateMatrix();
      mesh.setMatrixAt(0, dummy.matrix);
      mesh.count = 1;
      mesh.instanceMatrix.needsUpdate = true;
    },

    clear() {
      for (let i = 0; i < MAX; i++) life[i] = 0;
      mesh.count = 0;
      hawkT = -1;
      hawk.visible = false;
      hawkShadow.visible = false;
    },

    update(dt) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        const slow = Math.max(0, 1 - drag[i] * dt);
        vx[i] *= slow;
        vz[i] *= slow;
        vy[i] -= gravity[i] * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        const k = life[i] / maxLife[i];
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(life[i] * 7, life[i] * 5, 0);
        dummy.scale.setScalar(size[i] * (0.3 + 0.7 * k));
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

      if (hawkT < 0) return;
      hawkT += dt;
      const flap = Math.sin(hawkT * 22) * 0.7;
      wingR.rotation.z = flap;
      wingL.rotation.z = -flap;
      if (hawkT < SWOOP) {
        // Dive from high up ahead, speeding up.
        const k = hawkT / SWOOP;
        const e = k * k;
        placeHawk(hawkX + 5 * (1 - e), 1.1 + 8 * (1 - e), hawkZ - 7 * (1 - e), -5, -8, 7);
      } else {
        // Climb away towards the top left, chicken in its talons.
        const k = hawkT - SWOOP;
        const e = k * k;
        placeHawk(hawkX - 4 * e, 1.1 + 3 * k + 6 * e, hawkZ - 5 * e, -4, 4, -5);
      }
    },
  };
}
