// The warehouse worker: a little guy in a hard hat built from six parts so
// legs and arms can swing. He walks with a bobbing step, leans in with both
// arms out when he pushes, bumps into walls, looks around when left alone
// and jumps for joy when a level is done.

import * as THREE from 'three';
import { DX, DZ, blobTexture, easeOut } from './shared.js';
import {
  HIP_Y,
  NECK_Y,
  SHOULDER_Y,
  quadGeometry,
  workerArmGeometry,
  workerBodyGeometry,
  workerHeadGeometry,
  workerLegGeometry,
} from './models.js';

const FACE = [0, -Math.PI / 2, Math.PI, Math.PI / 2]; // up, right, down, left (model faces -z)
const TURN_SPEED = 22;
const STRIDE = 0.75; // leg swing in radians
const PUSH_ARMS = 1.45; // arms held out in front
const SCALE = 1.3;

export function createWorker(scene) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group();
  const body = new THREE.Group(); // leans and bobs; legs stay on root
  root.add(body);
  body.add(new THREE.Mesh(workerBodyGeometry(), material));
  const head = new THREE.Mesh(workerHeadGeometry(), material);
  head.position.y = NECK_Y;
  body.add(head);
  const armGeometry = workerArmGeometry();
  const armL = new THREE.Mesh(armGeometry, material);
  const armR = new THREE.Mesh(armGeometry, material);
  armL.position.set(-0.23, SHOULDER_Y, 0);
  armR.position.set(0.23, SHOULDER_Y, 0);
  body.add(armL, armR);
  const legGeometry = workerLegGeometry();
  const legL = new THREE.Mesh(legGeometry, material);
  const legR = new THREE.Mesh(legGeometry, material);
  legL.position.set(-0.09, HIP_Y, 0);
  legR.position.set(0.09, HIP_Y, 0);
  root.add(legL, legR);
  root.scale.setScalar(SCALE);
  scene.add(root);

  const shadow = new THREE.Mesh(
    quadGeometry(),
    new THREE.MeshBasicMaterial({ color: 0x1a1030, map: blobTexture(), transparent: true, opacity: 0.4, depthWrite: false }),
  );
  shadow.scale.setScalar(0.75);
  scene.add(shadow);

  const w = {
    x: 0,
    z: 0,
    fromX: 0,
    fromZ: 0,
    toX: 0,
    toZ: 0,
    t: 1, // 0..1 along the current step
    dur: 0.1,
    dir: 2,
    face: Math.PI,
    phase: 0, // walk cycle
    walk: 0, // how much of the walk cycle shows, eases in and out
    push: 0, // 0 arms swinging .. 1 arms out pushing
    pushing: false,
    bump: 0,
    bumpDir: 0,
    idle: 0,
    cheer: -1, // seconds into the celebration, < 0 when not cheering
    y: 0,
    clock: 0,

    // Stands on (x, z) facing dir, with no animation running.
    place(x, z, dir) {
      this.x = this.fromX = this.toX = x;
      this.z = this.fromZ = this.toZ = z;
      this.t = 1;
      this.dir = dir;
      this.face = FACE[dir];
      this.walk = 0;
      this.push = 0;
      this.pushing = false;
      this.bump = 0;
      this.idle = 0;
      this.cheer = -1;
      this.y = 0;
    },

    // One step to (x, z) taking time seconds; pushing holds the arms out.
    stepTo(x, z, dir, time, pushing) {
      const k = easeOut(Math.min(1, this.t));
      this.fromX = this.fromX + (this.toX - this.fromX) * k;
      this.fromZ = this.fromZ + (this.toZ - this.fromZ) * k;
      this.toX = x;
      this.toZ = z;
      this.t = 0;
      this.dur = time;
      this.dir = dir;
      this.pushing = pushing;
      this.idle = 0;
      this.cheer = -1;
    },

    // Walked into a wall or a crate that will not budge.
    bumpInto(dir, strain) {
      this.dir = dir;
      this.bumpDir = dir;
      this.bump = 1;
      this.pushing = strain;
      this.idle = 0;
    },

    moving() {
      return this.t < 1;
    },

    celebrate() {
      this.cheer = 0;
      this.dir = 2; // turn to the camera
      this.pushing = false;
    },

    update(dt) {
      this.clock += dt;
      this.idle += dt;
      const was = this.t;
      if (this.t < 1) {
        this.t = Math.min(1, this.t + dt / this.dur);
        // Half a stride per cell, so feet alternate from step to step.
        this.phase += Math.PI * (this.t - was);
      }
      const k = easeOut(this.t);
      this.x = this.fromX + (this.toX - this.fromX) * k;
      this.z = this.fromZ + (this.toZ - this.fromZ) * k;
      const stepping = this.t < 1;
      this.walk += ((stepping ? 1 : 0) - this.walk) * Math.min(1, dt * (stepping ? 20 : 10));
      if (!stepping && this.idle > 0.2) this.pushing = false;
      this.push += ((this.pushing ? 1 : 0) - this.push) * Math.min(1, dt * 16);
      this.bump = Math.max(0, this.bump - dt * 5);

      // Turn the shortest way round.
      let diff = FACE[this.dir] - this.face;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.face += diff * Math.min(1, dt * TURN_SPEED);

      const swing = Math.sin(this.phase) * this.walk;
      let armSwing = -swing * 0.8;
      let lean = -0.22 * this.push;
      let bob = Math.abs(Math.sin(this.phase)) * 0.045 * this.walk;
      let armsUp = 0;
      this.y = 0;

      if (this.cheer >= 0) {
        // Two happy hops with the arms in the air, then a bounce in place.
        this.cheer += dt;
        const hop = this.cheer < 1.2 ? Math.abs(Math.sin(this.cheer * Math.PI * 1.7)) : 0;
        this.y = hop * 0.35;
        armsUp = Math.min(1, this.cheer * 6);
        armSwing = Math.sin(this.cheer * 12) * 0.25;
        lean = 0;
        bob = Math.sin(this.clock * 8) * 0.02;
      }

      // A bump nudges him towards the wall and back.
      const b = Math.sin(this.bump * Math.PI) * 0.09;
      root.position.set(this.x + DX[this.bumpDir] * b, this.y, this.z + DZ[this.bumpDir] * b);
      root.rotation.y = this.face;
      body.position.y = bob;
      body.rotation.x = lean;
      const breathe = 1 + Math.sin(this.clock * 3) * 0.015 * (1 - this.walk);
      body.scale.set(1, breathe, 1);

      legL.rotation.x = swing * STRIDE;
      legR.rotation.x = -swing * STRIDE;
      const out = PUSH_ARMS * this.push;
      armL.rotation.x = armSwing * (1 - this.push) + out + armsUp * (Math.PI - 0.3 - out);
      armR.rotation.x = -armSwing * (1 - this.push) + out + armsUp * (Math.PI - 0.3 - out);
      armL.rotation.z = -armsUp * 0.35;
      armR.rotation.z = armsUp * 0.35;

      // Left alone for a while, he looks around.
      const look = this.idle > 2.5 && this.cheer < 0 ? Math.sin((this.idle - 2.5) * 1.3) * 0.5 : 0;
      head.rotation.y += (look - head.rotation.y) * Math.min(1, dt * 4);
      head.rotation.x = this.push * 0.15;

      shadow.position.set(root.position.x, 0.015, root.position.z);
      shadow.scale.setScalar(0.75 * (1 - this.y * 0.8));
    },
  };

  w.place(0, 0, 2);
  return w;
}
