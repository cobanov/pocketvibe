// The paddle: D-pad movement with a little acceleration, the wide power-up
// and a squash when the ball hits it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIELD_L, FIELD_R, PADDLE_D, PADDLE_Z, box, clamp, cylinder } from './shared.js';

const HALF_W = 1.35; // half width, including the round caps
const WIDE_HALF_W = 2.15;
const CAP_R = PADDLE_D / 2;
const START_SPEED = 6; // a tap moves at once
const MAX_SPEED = 19;
const ACCEL = 110; // units per second squared while held
const BRAKE = 160; // units per second squared after release
const SQUASH_TIME = 0.16;

export function createPaddle(scene) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });

  // The body is one unit wide and scaled in x; the caps stay round.
  const body = new THREE.Mesh(
    mergeGeometries([
      box(1, 0.36, PADDLE_D, 0, 0.2, 0, 0xf2efff),
      box(1, 0.05, 0.18, 0, 0.4, 0, 0x3fe6d4),
      box(1, 0.12, 0.04, 0, 0.2, PADDLE_D / 2 + 0.01, 0x3fe6d4),
    ]),
    material,
  );
  scene.add(body);

  const caps = new THREE.InstancedMesh(
    mergeGeometries([
      cylinder(CAP_R, CAP_R, 0.38, 12, 0, 0.01, 0, 0xff5d8f),
      cylinder(CAP_R * 0.6, CAP_R * 0.6, 0.04, 12, 0, 0.39, 0, 0xffd0e4),
    ]),
    material,
    2,
  );
  caps.frustumCulled = false;
  scene.add(caps);

  const shadowGeometry = new THREE.CircleGeometry(1, 20);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  scene.add(shadow);

  const m = new THREE.Matrix4();

  const paddle = {
    x: 0,
    v: 0, // velocity in units per second
    halfW: HALF_W,
    targetHalfW: HALF_W,
    squash: 0,

    reset() {
      this.x = 0;
      this.v = 0;
      this.halfW = HALF_W;
      this.targetHalfW = HALF_W;
      this.squash = 0;
      this.draw();
    },

    setWide(on) {
      this.targetHalfW = on ? WIDE_HALF_W : HALF_W;
    },

    // The ball hit the paddle.
    bump() {
      this.squash = SQUASH_TIME;
    },

    // dir is the D-pad: -1, 0 or 1.
    update(dt, dir) {
      if (dir !== 0) {
        if (this.v * dir < 0) this.v = 0; // turning around is instant
        if (Math.abs(this.v) < START_SPEED) this.v = dir * START_SPEED;
        this.v = clamp(this.v + dir * ACCEL * dt, -MAX_SPEED, MAX_SPEED);
      } else {
        const brake = BRAKE * dt;
        this.v = Math.abs(this.v) <= brake ? 0 : this.v - Math.sign(this.v) * brake;
      }

      this.halfW += (this.targetHalfW - this.halfW) * Math.min(1, dt * 12);
      this.x += this.v * dt;
      const min = FIELD_L + this.halfW;
      const max = FIELD_R - this.halfW;
      if (this.x < min || this.x > max) {
        this.x = clamp(this.x, min, max);
        this.v = 0;
      }
      if (this.squash > 0) this.squash = Math.max(0, this.squash - dt);
      this.draw();
    },

    // Title screen demo: steer towards x like a player holding the D-pad.
    autopilot(dt, x) {
      const d = x - this.x;
      this.update(dt, d > 0.25 ? 1 : d < -0.25 ? -1 : 0);
    },

    draw() {
      const k = Math.sin((this.squash / SQUASH_TIME) * Math.PI);
      const sy = 1 - 0.35 * k;
      const sz = 1 + 0.25 * k;
      const inner = this.halfW - CAP_R;
      body.position.set(this.x, 0, PADDLE_Z);
      body.scale.set(inner * 2, sy, sz);
      m.makeScale(1, sy, sz).setPosition(this.x - inner, 0, PADDLE_Z);
      caps.setMatrixAt(0, m);
      m.setPosition(this.x + inner, 0, PADDLE_Z);
      caps.setMatrixAt(1, m);
      caps.instanceMatrix.needsUpdate = true;
      material.emissive.setScalar(0.3 * k);

      shadow.position.set(this.x + 0.12, 0.02, PADDLE_Z + 0.16);
      shadow.scale.set(this.halfW + 0.1, 1, 0.42);
    },
  };

  paddle.reset();
  return paddle;
}
