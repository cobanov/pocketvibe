// Shells: a pool of bullets drawn as one InstancedMesh, with a dimmer glow
// trail behind each (a second InstancedMesh, additive). Bullets move in small
// steps so a fast one never skips a brick, a tank or another bullet.

import * as THREE from 'three';
import { DIR_X, DIR_Z, HALF, TANK_R, yawOf } from './shared.js';
import { HIT_NONE } from './field.js';
import { shellGeometry } from './models.js';

const MAX = 16;
const STEP = 0.12;
const Y = 0.36; // height of the shells, about the barrels' height
const HIT_R = TANK_R + 0.06;
const CLASH_R = 0.3;
const PLAYER_HEX = 0xfff2a8;
const ENEMY_HEX = 0xff7a4a;

export function createBullets(scene, field) {
  const mesh = new THREE.InstancedMesh(shellGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color(0xffffff)); // creates instanceColor once, up front
  scene.add(mesh);

  const glow = new THREE.InstancedMesh(
    shellGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    MAX,
  );
  glow.frustumCulled = false;
  glow.count = 0;
  glow.setColorAt(0, new THREE.Color(0xffffff));
  scene.add(glow);

  const list = [];
  for (let i = 0; i < MAX; i++) {
    list.push({ active: false, x: 0, z: 0, dir: 0, speed: 0, owner: 0, enemy: false, power: false, age: 0 });
  }
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  function draw() {
    let n = 0;
    for (let i = 0; i < MAX; i++) {
      const b = list[i];
      if (!b.active) continue;
      dummy.position.set(b.x, Y, b.z);
      dummy.rotation.set(0, yawOf(b.dir), 0);
      const grow = Math.min(1, b.age * 30);
      dummy.scale.set(grow, grow, grow);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      color.setHex(b.enemy ? ENEMY_HEX : PLAYER_HEX);
      mesh.setColorAt(n, color);

      // The trail: a longer, wider shell behind the head.
      const back = b.power ? 0.55 : 0.42;
      dummy.position.set(b.x - DIR_X[b.dir] * back, Y, b.z - DIR_Z[b.dir] * back);
      dummy.scale.set(1.5 * grow, 1.2 * grow, (b.power ? 3 : 2.2) * grow);
      dummy.updateMatrix();
      glow.setMatrixAt(n, dummy.matrix);
      color.multiplyScalar(b.enemy ? 0.55 : 0.5);
      glow.setColorAt(n, color);
      n++;
    }
    mesh.count = n;
    glow.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
    glow.instanceColor.needsUpdate = true;
  }

  return {
    list,

    // Bullets of one tank still in flight.
    countFor(owner) {
      let n = 0;
      for (let i = 0; i < MAX; i++) if (list[i].active && list[i].owner === owner) n++;
      return n;
    },

    fire(owner, enemy, x, z, dir, speed, power) {
      for (let i = 0; i < MAX; i++) {
        const b = list[i];
        if (b.active) continue;
        b.active = true;
        b.owner = owner;
        b.enemy = enemy;
        b.x = x;
        b.z = z;
        b.dir = dir;
        b.speed = speed;
        b.power = power;
        b.age = 0;
        return true;
      }
      return false;
    },

    clear() {
      for (let i = 0; i < MAX; i++) list[i].active = false;
      draw();
    },

    // Moves every bullet and reports what it hit through ev:
    //   ev.cell(b, result), ev.edge(b), ev.tank(b, tank), ev.clash(a, b)
    update(dt, tanks, ev) {
      for (let i = 0; i < MAX; i++) {
        const b = list[i];
        if (!b.active) continue;
        b.age += dt;
        let left = b.speed * dt;
        while (left > 0 && b.active) {
          const s = Math.min(STEP, left);
          left -= s;
          b.x += DIR_X[b.dir] * s;
          b.z += DIR_Z[b.dir] * s;

          if (b.x < -HALF || b.x > HALF || b.z < -HALF || b.z > HALF) {
            b.x = Math.max(-HALF, Math.min(HALF, b.x));
            b.z = Math.max(-HALF, Math.min(HALF, b.z));
            b.active = false;
            ev.edge(b);
            break;
          }

          const result = field.bulletHit(b.x, b.z, b.dir, b.power);
          if (result !== HIT_NONE) {
            b.active = false;
            ev.cell(b, result);
            break;
          }

          // Player shells hit enemies, enemy shells hit the player; enemy
          // shells fly through other enemies.
          for (let k = 0; k < tanks.length; k++) {
            const t = tanks[k];
            if (!t.live || t.enemy === b.enemy) continue;
            if (Math.abs(t.x - b.x) < HIT_R && Math.abs(t.z - b.z) < HIT_R) {
              b.active = false;
              ev.tank(b, t);
              break;
            }
          }
          if (!b.active) break;

          for (let k = 0; k < MAX; k++) {
            const o = list[k];
            if (!o.active || o.enemy === b.enemy) continue;
            if (Math.abs(o.x - b.x) < CLASH_R && Math.abs(o.z - b.z) < CLASH_R) {
              b.active = false;
              o.active = false;
              ev.clash(b, o);
              break;
            }
          }
        }
      }
      draw();
    },
  };
}
