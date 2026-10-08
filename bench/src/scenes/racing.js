// Racing: an oval track lined with trees and eight cars driving around it.
// The camera follows the first car.

import * as THREE from 'three';

const RX = 120; // oval radius along x
const RZ = 70; // oval radius along z
const CARS = 8;

// Point on the oval at angle a, pushed outwards by r; heading along the track.
function oval(a, r = 0) {
  const x = (RX + r) * Math.cos(a);
  const z = (RZ + r) * Math.sin(a);
  const heading = Math.atan2(-RX * Math.sin(a), RZ * Math.cos(a));
  return { x, z, heading };
}

export default {
  name: 'racing',
  sky: 0xb7d7f0,
  fog: [40, 140],
  kinds: {
    road: { color: 0x555555, geometry: () => new THREE.BoxGeometry(10, 0.2, 5) },
    grass: { color: 0x4f8a3c, geometry: () => new THREE.BoxGeometry(1, 0.1, 1) },
    trunk: { color: 0x7a4e2d, geometry: () => new THREE.CylinderGeometry(0.3, 0.3, 1.5, 6) },
    leaves: { color: 0x2e7d32, geometry: () => new THREE.ConeGeometry(1.5, 3, 8) },
    body: { color: 0xd63031, geometry: () => new THREE.BoxGeometry(2, 0.8, 4) },
    cabin: { color: 0x2d3436, geometry: () => new THREE.BoxGeometry(1.6, 0.6, 1.8) },
  },

  build(rng) {
    const list = [{ kind: 'grass', x: 0, y: -0.1, z: 0, sx: RX * 2 + 120, sz: RZ * 2 + 120 }];
    const segments = 160;
    for (let i = 0; i < segments; i++) {
      const { x, z, heading } = oval((i / segments) * Math.PI * 2);
      list.push({ kind: 'road', x, y: 0, z, ry: heading });
    }
    for (let i = 0; i < 700; i++) {
      const a = rng() * Math.PI * 2;
      const r = (rng() < 0.5 ? -1 : 1) * (9 + rng() * 40);
      const { x, z } = oval(a, r);
      const s = 0.7 + rng() * 0.8;
      list.push({ kind: 'trunk', x, y: 0.75 * s, z, sx: s, sy: s, sz: s });
      list.push({ kind: 'leaves', x, y: 3 * s, z, sx: s, sy: s, sz: s });
    }
    for (let c = 0; c < CARS; c++) {
      const offset = c * 0.12;
      const lane = (c % 2 ? 1.8 : -1.8);
      const speed = 0.25 + c * 0.004;
      for (const [kind, y, dz] of [['body', 0.6, 0], ['cabin', 1.3, -0.3]]) {
        const part = { kind, x: 0, y, z: 0, ry: 0 };
        part.update = (t) => {
          const a = -(t * speed + offset);
          const p = oval(a, lane);
          part.x = p.x + Math.sin(p.heading) * dz;
          part.z = p.z + Math.cos(p.heading) * dz;
          part.ry = p.heading;
        };
        list.push(part);
      }
    }
    return list;
  },

  camera(t, camera, target) {
    const a = -(t * 0.25);
    const car = oval(a, -1.8);
    const behind = oval(a + 0.08, -1.8);
    target.set(car.x, 1, car.z);
    camera.position.set(behind.x, 5, behind.z);
  },
};
