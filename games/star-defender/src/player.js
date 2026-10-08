// The player's ship: D-pad movement with a little inertia and banking, an
// engine flame, recoil when firing, and blinking after a respawn.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIELD_HALF, PLAYER_Z, box, part } from './shared.js';

const SPEED = 10.5; // top speed in units per second
const ACCEL = 16; // how fast the ship reaches the D-pad's speed
const SHIP_Y = 0.4;
const INVULNERABLE = 1.8; // seconds of blinking after a respawn
// The hit box is a little smaller than the model, so near misses stay misses.
export const SHIP_HALF_W = 0.62;
export const SHIP_HALF_D = 0.45;
export const SHIP_COLORS = [0xf2f4ff, 0x4f7dff, 0xff4a5a, 0x6ff3ff];

function shipGeometry() {
  const nose = new THREE.ConeGeometry(0.3, 1.4, 6);
  nose.rotateX(-Math.PI / 2); // tip towards -z, at the aliens
  const cockpit = new THREE.OctahedronGeometry(0.17, 0);
  cockpit.scale(1, 0.75, 1.7);
  return mergeGeometries([
    part(nose, 0, 0.05, -0.1, 0xf2f4ff),
    box(1.5, 0.1, 0.42, 0, -0.02, 0.28, 0x4f7dff),
    box(0.7, 0.12, 0.3, 0, 0.0, 0.05, 0x4f7dff),
    box(0.12, 0.34, 0.52, -0.75, 0.1, 0.28, 0xff4a5a),
    box(0.12, 0.34, 0.52, 0.75, 0.1, 0.28, 0xff4a5a),
    box(0.4, 0.24, 0.26, 0, 0.02, 0.62, 0x8a90b0),
    part(cockpit, 0, 0.2, -0.05, 0x6ff3ff),
  ]);
}

export function createPlayer(scene) {
  const ship = new THREE.Mesh(shipGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(ship);

  const flameGeometry = new THREE.ConeGeometry(0.15, 0.6, 6);
  flameGeometry.rotateX(Math.PI / 2); // tip towards +z
  flameGeometry.translate(0, 0, 0.3);
  const flame = new THREE.Mesh(flameGeometry, new THREE.MeshBasicMaterial({ color: 0xffa62e }));
  scene.add(flame);

  // Fake shadow: a dark transparent disc on the playfield.
  const shadowGeometry = new THREE.CircleGeometry(0.8, 14);
  shadowGeometry.rotateX(-Math.PI / 2);
  shadowGeometry.scale(1, 1, 0.7);
  const shadow = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shadow.position.set(0, 0.01, PLAYER_Z + 0.15);
  scene.add(shadow);

  let vx = 0;
  let recoil = 0;
  let blink = 0;
  let time = 0;

  const player = {
    x: 0,
    alive: true,

    get vulnerable() {
      return player.alive && blink <= 0;
    },

    reset() {
      player.x = 0;
      player.alive = true;
      vx = 0;
      recoil = 0;
      blink = 0;
      player.draw();
    },

    respawn() {
      player.reset();
      blink = INVULNERABLE;
    },

    explode() {
      player.alive = false;
      player.draw();
    },

    kick() {
      recoil = 1;
    },

    // dir is the D-pad x (-1, 0 or 1).
    update(dt, dir) {
      time += dt;
      if (player.alive) {
        vx += (dir * SPEED - vx) * Math.min(1, ACCEL * dt);
        player.x += vx * dt;
        const limit = FIELD_HALF - SHIP_HALF_W;
        if (player.x > limit || player.x < -limit) {
          player.x = Math.max(-limit, Math.min(limit, player.x));
          vx = 0;
        }
      }
      recoil = Math.max(0, recoil - dt * 8);
      blink = Math.max(0, blink - dt);
      player.draw();
    },

    draw() {
      const show = player.alive && (blink <= 0 || Math.floor(blink * 12) % 2 === 0);
      ship.visible = show;
      flame.visible = show;
      shadow.visible = player.alive;
      const z = PLAYER_Z + recoil * 0.22;
      ship.position.set(player.x, SHIP_Y + Math.sin(time * 4) * 0.05, z);
      ship.rotation.set(0.12, 0, -vx * 0.045);
      flame.position.set(player.x, SHIP_Y + 0.02, z + 0.72);
      flame.scale.set(1, 1, 0.75 + Math.random() * 0.5 + recoil * 0.6);
      shadow.position.x = player.x;
    },
  };

  return player;
}
