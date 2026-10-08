// 3D side-scrolling platformer: floating platforms, spinning coins, patrolling
// enemies and mountains in the background. The camera pans along the level.

import * as THREE from 'three';

const LENGTH = 600;
const SPEED = 12;

export default {
  name: 'platformer',
  sky: 0xa8d8ff,
  fog: [30, 120],
  kinds: {
    platform: { color: 0x8e6e53, geometry: () => new THREE.BoxGeometry(4, 1, 4) },
    coin: {
      color: 0xf1c40f,
      geometry: () => new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16).rotateX(Math.PI / 2),
    },
    enemy: { color: 0x8e44ad, geometry: () => new THREE.SphereGeometry(0.6, 16, 12) },
    mountain: { color: 0x6c7a89, geometry: () => new THREE.ConeGeometry(10, 20, 8) },
  },

  build(rng) {
    const list = [];
    const platforms = [];
    for (let i = 0; i < 220; i++) {
      const p = { kind: 'platform', x: (i / 220) * LENGTH, y: rng() * 8, z: (rng() - 0.5) * 6 };
      platforms.push(p);
      list.push(p);
    }
    for (let i = 0; i < 300; i++) {
      const p = platforms[Math.floor(rng() * platforms.length)];
      const coin = { kind: 'coin', x: p.x + (rng() - 0.5) * 3, y: p.y + 1.5, z: p.z, ry: 0 };
      coin.update = (t) => {
        coin.ry = t * 3 + i;
      };
      list.push(coin);
    }
    for (let i = 0; i < 60; i++) {
      const p = platforms[Math.floor(rng() * platforms.length)];
      const enemy = { kind: 'enemy', x: p.x, y: p.y + 1.1, z: p.z };
      enemy.update = (t) => {
        enemy.x = p.x + Math.sin(t * 1.5 + i) * 1.5;
      };
      list.push(enemy);
    }
    for (let i = 0; i < 40; i++) {
      const s = 0.8 + rng() * 1.2;
      list.push({ kind: 'mountain', x: (i / 40) * LENGTH, y: 10 * s - 4, z: -45 - rng() * 20, sx: s, sy: s, sz: s });
    }
    return list;
  },

  camera(t, camera, target) {
    const x = (t * SPEED) % (LENGTH - 40);
    target.set(x + 4, 4, 0);
    camera.position.set(x, 7, 20);
  },
};
