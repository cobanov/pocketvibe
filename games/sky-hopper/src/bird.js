// The bird: flapping, gravity, tilting with its speed, and its look.

import * as THREE from 'three';
import { BIRD_X, CEILING_Y, lowPoly, merge, part } from './shared.js';

const GRAVITY = 32;
const FLAP_SPEED = 10.2; // a flap sets the upward speed, it does not add to it
const MAX_FALL = 16;
const HOVER_Y = 7; // where the bird bobs on the title and get-ready screens
export const BIRD_R = 0.42; // hit circle, a little smaller than the body

function bodyGeometry() {
  const body = new THREE.IcosahedronGeometry(0.6, 1);
  body.scale(1.12, 0.96, 0.92);
  const belly = new THREE.IcosahedronGeometry(0.36, 1);
  belly.scale(1.1, 0.75, 0.85);

  const beakTop = new THREE.ConeGeometry(0.17, 0.44, 4);
  beakTop.rotateZ(-Math.PI / 2);
  const beakLow = new THREE.ConeGeometry(0.12, 0.3, 4);
  beakLow.rotateZ(-Math.PI / 2);
  const tail = new THREE.ConeGeometry(0.24, 0.5, 4);
  tail.rotateZ(Math.PI / 2 - 0.25);
  const crest = new THREE.ConeGeometry(0.1, 0.36, 4);
  crest.rotateZ(0.45);
  const crest2 = new THREE.ConeGeometry(0.08, 0.28, 4);
  crest2.rotateZ(0.95);

  return merge([
    part(body, 0, 0, 0, 0xffd53f),
    part(belly, 0.2, -0.27, 0.2, 0xfff0c4),
    part(new THREE.IcosahedronGeometry(0.24, 1), 0.33, 0.2, 0.37, 0xffffff), // eye
    part(new THREE.IcosahedronGeometry(0.11, 0), 0.44, 0.21, 0.55, 0x1d1d2b), // pupil
    part(new THREE.IcosahedronGeometry(0.1, 0), 0.5, -0.08, 0.4, 0xff8a7a), // cheek
    part(beakTop, 0.8, 0.02, 0, 0xff8c1a),
    part(beakLow, 0.72, -0.12, 0, 0xe2541a),
    part(tail, -0.78, 0.14, 0, 0xf0921c),
    part(crest, 0.02, 0.66, 0, 0xff5a36),
    part(crest2, -0.16, 0.58, 0, 0xff5a36),
  ]);
}

// The wing's pivot (its shoulder) is at the origin and the tip points back, so
// rotating it around z swings the tip up and down.
function wingGeometry() {
  const wing = new THREE.IcosahedronGeometry(0.34, 0);
  wing.scale(1.15, 0.55, 0.32);
  return merge([part(wing, -0.3, 0, 0, 0xffffff)]);
}

export function createBird(scene) {
  const material = lowPoly();
  const root = new THREE.Group(); // position and tilt
  root.scale.setScalar(1.1);
  const body = new THREE.Mesh(bodyGeometry(), material); // squash and stretch
  const wing = new THREE.Mesh(wingGeometry(), material);
  wing.position.set(0.05, -0.02, 0.5);
  body.add(wing);
  root.add(body);
  scene.add(root);

  // Fake shadow: a dark transparent disc on the ledge.
  const shadowGeometry = new THREE.CircleGeometry(0.7, 16);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x0b2a12,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.position.set(BIRD_X, 0.03, 0);
  scene.add(shadow);

  const bird = {
    y: HOVER_Y,
    vy: 0,
    z: 0,
    angle: 0, // tilt in radians, positive is nose up
    time: 0,
    wingTime: 0,
    wingAngle: 0,
    flapKick: 0, // seconds of fast wing beats left after a flap
    squash: 0, // 1 right after a flap, decays to 0
    glow: 0, // white flash when hit, decays to 0

    reset() {
      this.y = HOVER_Y;
      this.vy = 0;
      this.z = 0;
      this.angle = 0;
      this.time = 0;
      this.flapKick = 0;
      this.squash = 0;
      this.glow = 0;
      this.draw();
    },

    flap() {
      this.vy = FLAP_SPEED;
      this.flapKick = 0.22;
      this.squash = 1;
    },

    // Title and get-ready screens: bob gently in place.
    hover(dt) {
      this.time += dt;
      this.y = HOVER_Y + Math.sin(this.time * 4.2) * 0.32;
      this.vy = 0;
      this.angle += (Math.sin(this.time * 4.2 + 1) * 0.08 - this.angle) * Math.min(1, dt * 8);
      this.beat(dt, 13);
      this.draw();
    },

    // Normal flight: gravity, flaps and the tilt that follows the speed.
    update(dt) {
      this.vy = Math.max(this.vy - GRAVITY * dt, -MAX_FALL);
      this.y += this.vy * dt;
      if (this.y > CEILING_Y) {
        this.y = CEILING_Y;
        this.vy = Math.min(this.vy, 0);
      }
      // Nose up quickly on a flap, then dive slowly as the fall speeds up.
      const target = this.vy > 0 ? 0.42 : Math.max(-1.45, 0.42 + this.vy * 0.11);
      const rate = target > this.angle ? 16 : 5;
      this.angle += (target - this.angle) * Math.min(1, dt * rate);

      if (this.flapKick > 0) {
        this.flapKick -= dt;
        this.beat(dt, 38);
      } else if (this.vy < -7) {
        // Falling fast: wings held up.
        this.wingAngle += (-0.65 - this.wingAngle) * Math.min(1, dt * 10);
      } else {
        this.beat(dt, 12);
      }
      this.draw();
    },

    // After a pipe hit: drop to the ledge nose first, in front of the pipe.
    // Returns true once the bird lies on the ground.
    fall(dt) {
      this.vy = Math.max(this.vy - GRAVITY * dt, -MAX_FALL);
      this.y += this.vy * dt;
      this.z += (1.3 - this.z) * Math.min(1, dt * 8);
      this.angle += (-1.5 - this.angle) * Math.min(1, dt * 7);
      this.wingAngle += (-0.65 - this.wingAngle) * Math.min(1, dt * 10);
      const landed = this.y <= BIRD_R;
      if (landed) this.land();
      this.draw();
      return landed;
    },

    // Lies on the ledge, nose down.
    land() {
      this.y = BIRD_R;
      this.vy = 0;
      this.angle = -1.2;
      this.wingAngle = -0.3;
      this.draw();
    },

    hit() {
      this.glow = 1;
      this.vy = Math.min(this.vy, 0) * 0.3 + 3;
    },

    beat(dt, speed) {
      this.wingTime += dt * speed;
      this.wingAngle = Math.sin(this.wingTime) * 0.8;
    },

    draw() {
      root.position.set(BIRD_X, this.y, this.z);
      root.rotation.z = this.angle;
      const s = this.squash;
      body.scale.set(1 - 0.16 * s, 1 + 0.22 * s, 1 - 0.08 * s);
      wing.rotation.z = this.wingAngle;
      // A warm base glow keeps the shaded side yellow; a hit flashes it white.
      const g = this.glow * 0.9;
      material.emissive.setRGB(0.1 + g, 0.06 + g, g);

      const k = Math.max(0.3, 1 - this.y * 0.055);
      shadow.position.z = this.z;
      shadow.scale.set(k * 1.25, 1, k);
      shadowMaterial.opacity = 0.32 * k;
    },

    // Decays the squash and the hit flash; runs in every state except pause.
    settle(dt) {
      if (this.squash === 0 && this.glow === 0) return;
      this.squash = Math.max(0, this.squash - dt * 6);
      this.glow = Math.max(0, this.glow - dt * 4);
      this.draw();
    },
  };

  bird.reset();
  return bird;
}
