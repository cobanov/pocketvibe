// The enemy saucers: they cross the screen from one side to the other,
// weaving up and down over the rocks, and take shots at the ship. The big one fires wide of
// the mark; the small one, from wave 3, is faster, aims straight at the ship
// and in later waves leads its shots. Only one saucer flies at a time.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLY_Z, HALF_H, HALF_W, TAU, part, rand } from './shared.js';

const SHOT_SPEED = 12;
const SHOT_LIFE = 1.7;

// hit: collision radius. size: drawn scale. Speeds in units per second,
// gaps in seconds between shots.
const KINDS = [
  { hit: 1.05, size: 1, points: 500, speed: 4.6, speedUp: 0.35, maxSpeed: 8, gap: 2.0, minGap: 1.1, weave: 3.2 },
  { hit: 0.7, size: 0.62, points: 1000, speed: 6.2, speedUp: 0.3, maxSpeed: 10, gap: 1.35, minGap: 0.75, weave: 4.4 },
];

// Cylinder pieces stood on the z axis, so the camera looks down onto the dome.
function disc(top, bottom, height, segments) {
  const g = new THREE.CylinderGeometry(top, bottom, height, segments);
  g.rotateX(Math.PI / 2);
  return g;
}

// colors: lower hull, upper hull, rim, dome, lights.
function saucerGeometry([low, high, rim, dome, lights]) {
  const cap = new THREE.SphereGeometry(0.5, 10, 4, 0, TAU, 0, Math.PI / 2);
  cap.rotateX(Math.PI / 2);
  const parts = [
    part(disc(1.25, 0.55, 0.35, 12), low, 0, 0, -0.18),
    part(disc(0.62, 1.25, 0.3, 12), high, 0, 0, 0.15),
    part(disc(1.32, 1.32, 0.1, 12), rim, 0, 0, 0),
    part(cap, dome, 0, 0, 0.28),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    parts.push(part(new THREE.BoxGeometry(0.2, 0.2, 0.16), lights, Math.cos(a) * 1.0, Math.sin(a) * 1.0, 0.12));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export function createSaucer(scene, fx) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // The big one in violet, the small one in hot red, so it reads as the dangerous one.
  const meshes = [
    new THREE.Mesh(saucerGeometry([0x5b44c8, 0x9b86ff, 0xff5fd2, 0x7dffc0, 0xfff27a]), material),
    new THREE.Mesh(saucerGeometry([0xa8243a, 0xff6a4a, 0xfff27a, 0x7dffc0, 0xff5fd2]), material),
  ];
  for (let k = 0; k < meshes.length; k++) {
    meshes[k].scale.setScalar(KINDS[k].size);
    meshes[k].visible = false;
    scene.add(meshes[k]);
  }
  let mesh = meshes[0];

  return {
    active: false,
    small: false,
    hit: KINDS[0].hit,
    points: KINDS[0].points,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    turnTimer: 0,
    shotTimer: 0,
    spin: 0,
    aimError: 0.5,
    lead: 0,
    shotGap: 1.8,

    // Enters from a random side. Later waves fly faster and aim better.
    spawn(wave, small) {
      const kind = KINDS[small ? 1 : 0];
      const side = Math.random() < 0.5 ? -1 : 1;
      mesh.visible = false;
      mesh = meshes[small ? 1 : 0];
      this.active = true;
      this.small = small;
      this.hit = kind.hit;
      this.points = kind.points;
      this.x = -side * (HALF_W + 1.4);
      this.y = rand(-HALF_H * 0.7, HALF_H * 0.7);
      this.vx = side * Math.min(kind.maxSpeed, kind.speed + wave * kind.speedUp);
      this.vy = 0;
      this.turnTimer = rand(0.8, 1.6);
      this.shotTimer = small ? 0.8 : 1.1;
      this.shotGap = Math.max(kind.minGap, kind.gap - (wave - 2) * 0.1);
      if (small) {
        // Straight at the ship, then leading it more each wave.
        this.aimError = Math.max(0.03, 0.18 - (wave - 3) * 0.03);
        this.lead = Math.min(1, Math.max(0, (wave - 4) * 0.2));
      } else {
        // Never better than a loose spray.
        this.aimError = Math.max(0.28, 0.6 - (wave - 2) * 0.06);
        this.lead = 0;
      }
      mesh.visible = true;
      this.place();
    },

    hide() {
      this.active = false;
      mesh.visible = false;
    },

    destroy() {
      const s = this.small ? 0.7 : 1;
      fx.burst(this.x, this.y, this.small ? 0xff6a4a : 0xff5fd2, 22, 12 * s, 0.7, 0.36);
      fx.burst(this.x, this.y, 0x7dffc0, 14, 10 * s, 0.6, 0.3);
      fx.burst(this.x, this.y, 0xfff27a, 10, 15 * s, 0.4, 0.22);
      fx.ring(this.x, this.y, this.small ? 0xff6a4a : 0xff5fd2, 3.6 * s, 0.45);
      this.hide();
    },

    // True while the saucer is inside the field, where it can hit and be hit.
    get inField() {
      return this.active && Math.abs(this.x) < HALF_W;
    },

    // ship: the target, or anything with alive/hyper/x/y/vx/vy. Returns true
    // on a frame the saucer fired.
    update(dt, ship, shots) {
      if (!this.active) return false;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Gone once it crosses to the other side; it only wraps vertically.
      if ((this.vx > 0 && this.x > HALF_W + 1.3) || (this.vx < 0 && this.x < -HALF_W - 1.3)) {
        this.hide();
        return false;
      }
      if (this.y > HALF_H + 1.4) this.y -= (HALF_H + 1.4) * 2;
      else if (this.y < -HALF_H - 1.4) this.y += (HALF_H + 1.4) * 2;

      // Weave: pick a new vertical direction now and then.
      this.turnTimer -= dt;
      if (this.turnTimer <= 0) {
        this.turnTimer = rand(0.9, 1.8);
        const r = Math.random();
        const weave = KINDS[this.small ? 1 : 0].weave;
        this.vy = r < 0.35 ? -weave : r < 0.7 ? weave : 0;
      }

      let fired = false;
      this.shotTimer -= dt;
      if (this.shotTimer <= 0) {
        this.shotTimer = this.shotGap * rand(0.8, 1.25);
        if (ship.alive && ship.hyper <= 0 && this.inField) {
          // Aim where the ship will be when the shot gets there (as far as
          // `lead` allows), give or take the aim error.
          let tx = ship.x;
          let ty = ship.y;
          if (this.lead > 0) {
            const t = (Math.sqrt((tx - this.x) ** 2 + (ty - this.y) ** 2) / SHOT_SPEED) * this.lead;
            tx += ship.vx * t;
            ty += ship.vy * t;
          }
          const a = Math.atan2(ty - this.y, tx - this.x) + rand(-this.aimError, this.aimError);
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          const r = this.hit + 0.15;
          fired = shots.fireEnemy(this.x + cx * r, this.y + cy * r, cx * SHOT_SPEED, cy * SHOT_SPEED, SHOT_LIFE);
          fx.spark(this.x + cx * r, this.y + cy * r, cx * 3, cy * 3, 0.12, 0.6, 0xff5fd2, 0);
        }
      }

      this.spin += dt * (this.small ? 5.5 : 3.5);
      this.place();
      return fired;
    },

    place() {
      mesh.position.set(this.x, this.y, FLY_Z);
      // Tilted towards the camera so its shape reads, spinning around its axis.
      mesh.rotation.set(-0.85, 0, this.spin);
    },

    // Both kinds on screen at once, for warming up while loading.
    showAll(x, y) {
      for (let k = 0; k < meshes.length; k++) {
        meshes[k].visible = true;
        meshes[k].position.set(x + k * 3, y, FLY_Z);
      }
    },

    hideAll() {
      this.active = false;
      for (let k = 0; k < meshes.length; k++) meshes[k].visible = false;
    },
  };
}
