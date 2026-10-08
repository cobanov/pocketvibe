// Endless runner: a long three-lane track with obstacles, spinning coins and
// buildings on both sides. The camera runs down the track.

import * as THREE from 'three';

const LENGTH = 800;
const SPEED = 30;

export default {
  name: 'runner',
  sky: 0x9fc9eb,
  fog: [30, 110],
  kinds: {
    ground: { color: 0x6aa84f, geometry: () => new THREE.BoxGeometry(12, 0.5, 8) },
    obstacle: { color: 0xc0392b, geometry: () => new THREE.BoxGeometry(1.5, 1.5, 1.5) },
    coin: {
      color: 0xf1c40f,
      geometry: () => new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16).rotateX(Math.PI / 2),
    },
    building: { color: 0x7f8c8d, geometry: () => new THREE.BoxGeometry(1, 1, 1) },
  },

  build(rng) {
    const list = [];
    const lane = () => (Math.floor(rng() * 3) - 1) * 3;
    for (let z = 0; z < LENGTH; z += 8) list.push({ kind: 'ground', x: 0, y: -0.25, z: -z });
    for (let i = 0; i < 300; i++) {
      list.push({ kind: 'obstacle', x: lane(), y: 0.75, z: -20 - rng() * (LENGTH - 20) });
    }
    for (let i = 0; i < 400; i++) {
      const coin = { kind: 'coin', x: lane(), y: 1, z: -10 - rng() * (LENGTH - 10), ry: 0 };
      coin.update = (t) => {
        coin.ry = t * 3 + i;
      };
      list.push(coin);
    }
    for (let i = 0; i < 240; i++) {
      const side = i % 2 ? 1 : -1;
      const h = 4 + rng() * 16;
      list.push({
        kind: 'building',
        x: side * (10 + rng() * 10),
        y: h / 2,
        z: -rng() * LENGTH,
        sx: 3 + rng() * 4,
        sy: h,
        sz: 3 + rng() * 4,
      });
    }
    return list;
  },

  camera(t, camera, target) {
    const z = -((t * SPEED) % (LENGTH - 120));
    target.set(0, 1, z - 10);
    camera.position.set(0, 4, z + 6);
  },
};
