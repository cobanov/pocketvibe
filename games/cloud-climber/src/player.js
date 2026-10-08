// The climber: steering with momentum, wrapping round the column, bounces
// with squash and stretch, a flip off springs, propeller flights and the
// tumble when a pest gets it. A second copy of the model shows on the other
// side while it wraps.

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
  clamp,
  lowPoly,
  wrapX,
} from './shared.js';
import { BODY_MID, bladeGeometry, capGeometry, climberGeometry } from './models.js';

const SQUASH_TIME = 0.16;
const FLIP_TIME = 0.75;
const TURN_BOOST = 1.8; // steering against the motion bites harder
const CAP_Y = 0.98; // where the cap sits, above the feet

export function createPlayer(scene) {
  const material = lowPoly(0x261a14);
  const geometry = climberGeometry();
  const mesh = new THREE.Mesh(geometry, material);
  const ghost = new THREE.Mesh(geometry, material);
  ghost.visible = false;
  scene.add(mesh, ghost);

  const capMaterial = lowPoly(0x202020);
  const cap = new THREE.Group();
  const blades = new THREE.Mesh(bladeGeometry(), capMaterial);
  blades.position.y = 0.38;
  cap.add(new THREE.Mesh(capGeometry(), capMaterial), blades);
  cap.scale.setScalar(1.2);
  cap.visible = false;
  scene.add(cap);

  const player = {
    x: 0,
    y: 0, // feet
    vx: 0,
    vy: 0,
    prevY: 0,
    flyT: 0, // seconds of propeller flight left
    dead: false,
    squashT: SQUASH_TIME,
    flipT: FLIP_TIME,
    flipDir: 1,
    face: 0,
    clock: 0,
    capDrop: -1, // >= 0 while the used cap tumbles away
    capX: 0,
    capY: 0,
    capVx: 0,
    capVy: 0,

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
      this.dead = false;
      this.squashT = SQUASH_TIME;
      this.flipT = FLIP_TIME;
      this.face = 0;
      this.capDrop = -1;
      cap.visible = false;
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
        this.vy += (FLY_V - this.vy) * Math.min(1, dt * 6);
        this.flyT -= dt;
        if (this.flyT <= 0) this.dropCap();
      } else {
        this.vy -= GRAVITY * dt;
      }
      this.y += this.vy * dt;

      if (this.capDrop >= 0) {
        this.capDrop += dt;
        this.capVy -= GRAVITY * 0.6 * dt;
        this.capX += this.capVx * dt;
        this.capY += this.capVy * dt;
        if (this.capDrop > 1.6) {
          this.capDrop = -1;
          cap.visible = false;
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

    fly() {
      this.flyT = FLY_TIME;
      this.flipT = FLIP_TIME;
      this.capDrop = -1;
      cap.visible = true;
    },

    dropCap() {
      this.flyT = 0;
      this.capDrop = 0;
      this.capX = this.x;
      this.capY = this.y + CAP_Y;
      this.capVx = this.vx * 0.3 + (Math.random() < 0.5 ? -2 : 2);
      this.capVy = 3;
    },

    // Knocked out by a pest: a little hop, then a tumble off the screen.
    die() {
      if (this.flyT > 0) this.dropCap();
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
      if (this.flyT > 0) rz += Math.sin(this.clock * 8) * 0.08;

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

      if (this.flyT > 0) {
        cap.position.set(this.x, this.y + CAP_Y * sy, 0);
        cap.rotation.set(0, this.face, rz * 0.5);
        blades.rotation.y += dt * 32;
      } else if (this.capDrop >= 0) {
        cap.position.set(this.capX, this.capY, 0.2);
        cap.rotation.set(0, this.capDrop * 3, this.capDrop * 7 * Math.sign(this.capVx));
        blades.rotation.y += dt * 10;
      }
    },
  };

  player.reset(0, 0);
  return player;
}
