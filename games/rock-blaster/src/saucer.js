// The enemy saucer: crosses the screen from one side to the other, weaving up
// and down, and takes a shot at the ship now and then. Better aim each wave.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF_H, HALF_W, TAU, part, rand } from './shared.js';

export const SAUCER_HIT = 1.05;
export const SAUCER_POINTS = 500;

const SHOT_SPEED = 12;
const SHOT_LIFE = 1.7;

// Cylinder pieces stood on the z axis, so the camera looks down onto the dome.
function disc(top, bottom, height, segments) {
  const g = new THREE.CylinderGeometry(top, bottom, height, segments);
  g.rotateX(Math.PI / 2);
  return g;
}

function saucerGeometry() {
  const dome = new THREE.SphereGeometry(0.5, 10, 4, 0, TAU, 0, Math.PI / 2);
  dome.rotateX(Math.PI / 2);
  const parts = [
    part(disc(1.25, 0.55, 0.35, 12), 0x5b44c8, 0, 0, -0.18),
    part(disc(0.62, 1.25, 0.3, 12), 0x9b86ff, 0, 0, 0.15),
    part(disc(1.32, 1.32, 0.1, 12), 0xff5fd2, 0, 0, 0),
    part(dome, 0x7dffc0, 0, 0, 0.28),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    parts.push(part(new THREE.BoxGeometry(0.2, 0.2, 0.16), 0xfff27a, Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.12));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export function createSaucer(scene, fx) {
  const mesh = new THREE.Mesh(saucerGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.visible = false;
  scene.add(mesh);

  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    turnTimer: 0,
    shotTimer: 0,
    spin: 0,
    aimError: 0.5,
    shotGap: 1.8,

    // Enters from a random side. Later waves fly faster and aim better.
    spawn(wave) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.active = true;
      this.x = -side * (HALF_W + 1.4);
      this.y = rand(-HALF_H * 0.7, HALF_H * 0.7);
      this.vx = side * Math.min(8, 4.6 + wave * 0.35);
      this.vy = 0;
      this.turnTimer = rand(0.8, 1.6);
      this.shotTimer = 1.1;
      this.aimError = Math.max(0.1, 0.6 - (wave - 2) * 0.08);
      this.shotGap = Math.max(1.0, 2.0 - (wave - 2) * 0.12);
      mesh.visible = true;
    },

    hide() {
      this.active = false;
      mesh.visible = false;
    },

    destroy() {
      fx.burst(this.x, this.y, 0xff5fd2, 22, 12, 0.7, 0.36);
      fx.burst(this.x, this.y, 0x7dffc0, 14, 10, 0.6, 0.3);
      fx.burst(this.x, this.y, 0xfff27a, 10, 15, 0.4, 0.22);
      fx.ring(this.x, this.y, 0xff5fd2, 3.6, 0.45);
      this.hide();
    },

    // ship: the target, or anything with alive/x/y.
    update(dt, ship, shots) {
      if (!this.active) return;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Gone once it crosses to the other side; it only wraps vertically.
      if ((this.vx > 0 && this.x > HALF_W + 1.3) || (this.vx < 0 && this.x < -HALF_W - 1.3)) {
        this.hide();
        return;
      }
      if (this.y > HALF_H + 1.4) this.y -= (HALF_H + 1.4) * 2;
      else if (this.y < -HALF_H - 1.4) this.y += (HALF_H + 1.4) * 2;

      // Weave: pick a new vertical direction now and then.
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) {
        this.turnTimer = rand(0.9, 1.8);
        const r = Math.random();
        this.vy = r < 0.35 ? -3.2 : r < 0.7 ? 3.2 : 0;
      }

      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        this.shotTimer = this.shotGap * rand(0.8, 1.25);
        if (ship.alive && ship.hyper <= 0) {
          const a = Math.atan2(ship.y - this.y, ship.x - this.x) + rand(-this.aimError, this.aimError);
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          shots.fireEnemy(this.x + cx * 1.2, this.y + cy * 1.2, cx * SHOT_SPEED, cy * SHOT_SPEED, SHOT_LIFE);
          fx.spark(this.x + cx * 1.2, this.y + cy * 1.2, cx * 3, cy * 3, 0.12, 0.6, 0xff5fd2, 0);
        }
      }

      this.spin += dt * 3.5;
      mesh.position.set(this.x, this.y, 0);
      // Tilted towards the camera so its shape reads, spinning around its axis.
      mesh.rotation.set(-0.85, 0, this.spin);
    },
  };
}
