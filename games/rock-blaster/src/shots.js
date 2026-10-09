// Bullets: one pool and one InstancedMesh for the player's shots, another for
// the saucer's. Bullets wrap around the edges and expire after a short time.

import * as THREE from 'three';
import { FLY_Z, wrap } from './shared.js';

const PLAYER_MAX = 12;
const ENEMY_MAX = 10;

const dummy = new THREE.Object3D();

function pool(n) {
  const list = [];
  for (let i = 0; i < n; i++) list.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, px: 0, py: 0 });
  return list;
}

// A stretched diamond pointing along +x.
function boltGeometry(length, width) {
  const g = new THREE.OctahedronGeometry(1, 0);
  g.scale(length, width, width);
  return g;
}

export function createShots(scene) {
  const playerMesh = new THREE.InstancedMesh(
    boltGeometry(0.5, 0.17),
    new THREE.MeshBasicMaterial({ color: 0xfff27a }),
    PLAYER_MAX,
  );
  const enemyMesh = new THREE.InstancedMesh(
    boltGeometry(0.34, 0.24),
    new THREE.MeshBasicMaterial({ color: 0xff5fd2 }),
    ENEMY_MAX,
  );
  for (const mesh of [playerMesh, enemyMesh]) {
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    mesh.count = 0;
    scene.add(mesh);
  }

  const player = pool(PLAYER_MAX);
  const enemy = pool(ENEMY_MAX);
  let spin = 0;

  function fire(list, x, y, vx, vy, life) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.active) continue;
      b.active = true;
      b.x = b.px = x;
      b.y = b.py = y;
      b.vx = vx;
      b.vy = vy;
      b.life = life;
      return true;
    }
    return false;
  }

  function step(list, mesh, dt, wobble) {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        continue;
      }
      // Remember where the bullet was, so hits can be tested along its path.
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      wrap(b, 0.2);
      if (Math.abs(b.x - b.px) > 4 || Math.abs(b.y - b.py) > 4) {
        // Just wrapped: the old position is on the far side of the screen.
        b.px = b.x;
        b.py = b.y;
      }
      dummy.position.set(b.x, b.y, FLY_Z + 0.3);
      dummy.rotation.set(wobble ? spin : 0, 0, Math.atan2(b.vy, b.vx));
      // Shrink away over the last tenth of a second.
      dummy.scale.setScalar(Math.min(1, b.life * 10));
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    player,
    enemy,

    // Returns false when every player bullet is already in flight.
    firePlayer(x, y, vx, vy, life) {
      return fire(player, x, y, vx, vy, life);
    },

    fireEnemy(x, y, vx, vy, life) {
      return fire(enemy, x, y, vx, vy, life);
    },

    clear() {
      for (let i = 0; i < PLAYER_MAX; i++) player[i].active = false;
      for (let i = 0; i < ENEMY_MAX; i++) enemy[i].active = false;
      playerMesh.count = 0;
      enemyMesh.count = 0;
    },

    update(dt) {
      spin += dt * 20;
      step(player, playerMesh, dt, false);
      step(enemy, enemyMesh, dt, true);
    },
  };
}
