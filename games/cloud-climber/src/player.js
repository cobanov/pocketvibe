// The climber: steering with momentum, wrapping round the column, bounces
// with squash and stretch, a flip off springs, flights under the propeller
// cap or on the rocket, and the tumble when a pest or lightning gets it. A
// second copy of the model shows on the other side while it wraps.

import * as THREE from 'three';
import {
  ACCEL,
  COL_W,
  FLY_TIME,
  FLY_V,
  FRICTION,
  GRAVITY,
  HALF_W,
  JUMP_V,
  MAX_VX,
  ROCKET_TIME,
  ROCKET_V,
  clamp,
  lowPoly,
  wrapX,
} from './shared.js';
import { BODY_MID, bladeGeometry, capGeometry, climberGeometry, flameGeometry, rocketGeometry } from './models.js';

const SQUASH_TIME = 0.16;
const FLIP_TIME = 0.75;
const TURN_BOOST = 1.8; // steering against the motion bites harder
const CAP_Y = 0.98; // where the cap sits, above the feet
const ROCKET_X = 0.42; // the rocket comes as a pair strapped on either side

// What the climber is flying with.
export const CAP = 1;
export const ROCKET = 2;

export function createPlayer(scene) {
  const material = lowPoly(0x261a14);
  const geometry = climberGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  const ghost = new THREE.Mesh(geometry, material);
  ghost.visible = false;
  scene.add(mesh, ghost);

  const gearMaterial = lowPoly(0x202020);
  const cap = new THREE.Group();
  const blades = new THREE.Mesh(bladeGeometry(), gearMaterial);
  blades.position.y = 0.38;
  cap.add(new THREE.Mesh(capGeometry(), gearMaterial), blades);
  cap.scale.setScalar(1.2);
  cap.visible = false;
  // Worn, the rocket is a jetpack: two of them, one either side of the
  // climber, so they show while it faces the camera.
  const rocket = new THREE.Group();
  const rocketGeo = rocketGeometry();
  const flameGeo = flameGeometry();
  const flameMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const flames = [];
  for (let s = -1; s <= 1; s += 2) {
    const r = new THREE.Mesh(rocketGeo, gearMaterial);
    const f = new THREE.Mesh(flameGeo, flameMaterial);
    r.position.set(s * ROCKET_X, 0, -0.1);
    f.position.copy(r.position);
    r.scale.setScalar(0.85);
    rocket.add(r, f);
    flames.push(f);
  }
  rocket.visible = false;
  scene.add(cap, rocket);

  const player = {
    x: 0,
    y: 0, // feet
    vx: 0,
    vy: 0,
    prevY: 0,
    flyT: 0, // seconds of flight left
    gear: 0, // CAP or ROCKET while flying
    dead: false,
    squashT: SQUASH_TIME,
    flipT: FLIP_TIME,
    flipDir: 1,
    face: 0,
    clock: 0,
    dropT: -1, // >= 0 while the used cap or rocket tumbles away
    dropped: null, // which one
    dropX: 0,
    dropY: 0,
    dropVx: 0,
    dropVy: 0,

    get flying() {
      return this.flyT > 0;
    },

    reset(x, y) {
      this.x = x;
      this.y = y;
      this.prevY = y;
      this.vx = 0;
      this.vy = 0;
      this.flyT = 0;
      this.gear = 0;
      this.dead = false;
      this.squashT = SQUASH_TIME;
      this.flipT = FLIP_TIME;
      this.face = 0;
      this.dropT = -1;
      cap.visible = false;
      rocket.visible = false;
      mesh.rotation.set(0, 0, 0);
      this.draw(0);
    },

    // steer is the D-pad: -1, 0 or 1.
    update(dt, steer) {
      this.clock += dt;
      if (!this.dead && steer !== 0) {
        const boost = steer * this.vx < 0 ? TURN_BOOST : 1;
        this.vx += steer * ACCEL * boost * dt;
      } else {
        const dec = FRICTION * dt * (this.dead ? 0.3 : 1);
        this.vx = Math.abs(this.vx) <= dec ? 0 : this.vx - Math.sign(this.vx) * dec;
      }
      this.vx = clamp(this.vx, -MAX_VX, MAX_VX);
      this.x = wrapX(this.x + this.vx * dt);

      this.prevY = this.y;
      if (this.flyT > 0) {
        // Spin up to full climbing speed, then coast out of it when time is up.
        const rocketing = this.gear === ROCKET;
        this.vy += ((rocketing ? ROCKET_V : FLY_V) - this.vy) * Math.min(1, dt * (rocketing ? 4 : 6));
        this.flyT -= dt;
        if (this.flyT <= 0) this.dropGear();
      } else {
        this.vy -= GRAVITY * dt;
      }
      this.y += this.vy * dt;

      if (this.dropT >= 0) {
        this.dropT += dt;
        this.dropVy -= GRAVITY * 0.6 * dt;
        this.dropX += this.dropVx * dt;
        this.dropY += this.dropVy * dt;
        if (this.dropT > 1.6) {
          this.dropT = -1;
          this.dropped.visible = false;
        }
      }
    },

    bounce(v) {
      this.vy = v;
      this.squashT = 0;
      if (v > JUMP_V * 1.3) {
        // A big launch gets a flip, rolling the way the climber is moving.
        this.flipT = 0;
        this.flipDir = this.vx > 0.5 ? -1 : this.vx < -0.5 ? 1 : Math.random() < 0.5 ? -1 : 1;
      }
    },

    // Takes off with the cap or the rocket (CAP or ROCKET).
    fly(gear) {
      if (this.dropT >= 0) this.dropped.visible = false;
      this.dropT = -1;
      this.gear = gear;
      this.flyT = gear === ROCKET ? ROCKET_TIME : FLY_TIME;
      this.flipT = FLIP_TIME;
      cap.visible = gear === CAP;
      rocket.visible = gear === ROCKET;
      flames[0].visible = flames[1].visible = true;
    },

    // The flight is over: the cap or the rocket comes off and tumbles away.
    dropGear() {
      this.flyT = 0;
      this.dropped = this.gear === ROCKET ? rocket : cap;
      this.gear = 0;
      this.dropT = 0;
      this.dropX = this.x;
      this.dropY = this.y + (this.dropped === cap ? CAP_Y : 0.2);
      this.dropVx = this.vx * 0.3 + (Math.random() < 0.5 ? -2 : 2);
      this.dropVy = 3;
      flames[0].visible = flames[1].visible = false;
    },

    // Knocked out by a pest or lightning: a little hop, then a tumble off
    // the screen.
    die() {
      if (this.flyT > 0) this.dropGear();
      this.dead = true;
      this.vy = 7;
      this.vx *= 0.3;
    },

    draw(dt) {
      this.squashT += dt;
      this.flipT += dt;

      // Squash right after a bounce, stretch while moving fast.
      const s = Math.max(0, 1 - this.squashT / SQUASH_TIME);
      const speed = Math.min(1, Math.abs(this.vy) / JUMP_V);
      const sy = (1 - 0.34 * s) * (1 + 0.12 * speed * (1 - s));
      const sx = (1 + 0.26 * s) * (1 - 0.06 * speed * (1 - s));

      // Turn towards the way it is steering and lean into it.
      const faceTarget = this.dead ? 0 : (this.vx / MAX_VX) * 0.75;
      this.face += (faceTarget - this.face) * Math.min(1, dt * 10);
      let rz = (-this.vx / MAX_VX) * 0.16;
      if (this.flipT < FLIP_TIME) {
        const k = this.flipT / FLIP_TIME;
        rz += this.flipDir * Math.PI * 2 * (1 - (1 - k) * (1 - k));
      }
      if (this.dead) rz = this.clock * 9;
      // A wobble in flight: slow under the cap, a fast shudder on the rocket.
      if (this.gear === CAP) rz += Math.sin(this.clock * 8) * 0.08;
      else if (this.gear === ROCKET) rz += Math.sin(this.clock * 20) * 0.04;

      mesh.position.set(this.x, this.y + BODY_MID * sy, 0);
      mesh.rotation.set(0, this.face, rz);
      mesh.scale.set(sx, sy, sx);

      // While part of the climber is past an edge, its twin shows on the other side.
      ghost.visible = Math.abs(this.x) > HALF_W - 0.5;
      if (ghost.visible) {
        ghost.position.copy(mesh.position);
        ghost.position.x -= Math.sign(this.x) * COL_W;
        ghost.rotation.copy(mesh.rotation);
        ghost.scale.copy(mesh.scale);
      }

      if (this.gear === CAP) {
        cap.position.set(this.x, this.y + CAP_Y * sy, 0);
        cap.rotation.set(0, this.face, rz * 0.5);
        blades.rotation.y += dt * 32;
      } else if (this.gear === ROCKET) {
        rocket.position.set(this.x, this.y + 0.08, 0);
        rocket.rotation.set(0, this.face * 0.6, rz);
        flames[0].scale.set(1, 0.8 + Math.random() * 0.7, 1);
        flames[1].scale.set(1, 0.8 + Math.random() * 0.7, 1);
      }
      if (this.dropT >= 0) {
        const d = this.dropped;
        d.position.set(this.dropX, this.dropY, 0.2);
        d.rotation.set(0, this.dropT * 3, this.dropT * 7 * Math.sign(this.dropVx));
        if (d === cap) blades.rotation.y += dt * 10;
      }
    },
  };

  player.reset(0, 0);
  return player;
}
