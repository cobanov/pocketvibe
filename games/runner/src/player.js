// The runner: lane changes, jumping, sliding and its look.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANES, box } from './shared.js';

const STAND_H = 1.7;
const SLIDE_H = 0.8;
const LANE_SPEED = 14; // units per second sideways
const JUMP_SPEED = 12;
const GRAVITY = 36;
const DIVE_SPEED = 18; // DOWN in the air pulls the runner to the ground
const SLIDE_TIME = 0.65;
const JUMP_BUFFER = 0.12; // a jump pressed just before landing still counts

function runnerGeometry() {
  return mergeGeometries([
    box(0.22, 0.6, 0.25, -0.15, 0.3, 0, 0x2b3a67), // legs
    box(0.22, 0.6, 0.25, 0.15, 0.3, 0, 0x2b3a67),
    box(0.7, 0.65, 0.4, 0, 0.92, 0, 0xe8553e), // body
    box(0.18, 0.55, 0.2, -0.45, 0.95, 0, 0xe8553e), // arms
    box(0.18, 0.55, 0.2, 0.45, 0.95, 0, 0xe8553e),
    box(0.48, 0.45, 0.42, 0, 1.47, 0, 0xf2c6a0), // head
    box(0.5, 0.14, 0.44, 0, 1.68, 0, 0x3a2a1e), // hair
  ]);
}

export function createPlayer(scene) {
  const mesh = new THREE.Mesh(runnerGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);

  // Fake shadow: a dark transparent disc on the ground.
  const shadowGeometry = new THREE.CircleGeometry(0.55, 16);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.position.y = 0.02;
  scene.add(shadow);

  const player = {
    lane: 1,
    x: 0,
    y: 0,
    vy: 0,
    height: STAND_H,
    slide: 0, // seconds of slide left
    slideOnLanding: false,
    jumpBuffer: 0,
    phase: 0,
    crashed: false,

    reset() {
      this.lane = 1;
      this.x = LANES[1];
      this.y = 0;
      this.vy = 0;
      this.slide = 0;
      this.slideOnLanding = false;
      this.jumpBuffer = 0;
      this.crashed = false;
      this.height = STAND_H;
      this.draw();
    },

    // input is null when the game is not taking controls (title screen).
    update(dt, input) {
      const grounded = this.y <= 0;

      if (input) {
        if (input.pressed('LEFT') && this.lane > 0) this.lane--;
        if (input.pressed('RIGHT') && this.lane < 2) this.lane++;
        if (input.pressed('A') || input.pressed('UP')) this.jumpBuffer = JUMP_BUFFER;
        if (input.pressed('DOWN')) {
          if (grounded) {
            this.slide = SLIDE_TIME;
          } else {
            this.vy = Math.min(this.vy, -DIVE_SPEED);
            this.slideOnLanding = true;
          }
        }
      }

      if (this.jumpBuffer > 0) {
        this.jumpBuffer -= dt;
        if (grounded) {
          this.vy = JUMP_SPEED;
          this.slide = 0;
          this.slideOnLanding = false;
          this.jumpBuffer = 0;
        }
      }

      // Slide towards the target lane.
      const target = LANES[this.lane];
      const step = LANE_SPEED * dt;
      if (Math.abs(target - this.x) <= step) this.x = target;
      else this.x += Math.sign(target - this.x) * step;

      if (this.y > 0 || this.vy > 0) {
        this.vy -= GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          if (this.slideOnLanding) this.slide = SLIDE_TIME;
          this.slideOnLanding = false;
        }
      }

      if (this.slide > 0) this.slide -= dt;
      this.height = this.slide > 0 ? SLIDE_H : STAND_H;
      this.phase += dt * 14;
      this.draw();
    },

    crash() {
      this.crashed = true;
      this.draw();
    },

    draw() {
      const sliding = this.slide > 0;
      const bob = this.y === 0 && !sliding && !this.crashed ? Math.abs(Math.sin(this.phase)) * 0.1 : 0;
      mesh.position.set(this.x, this.y + bob, 0);
      mesh.scale.y = sliding ? SLIDE_H / STAND_H : 1;
      mesh.rotation.x = this.crashed ? 1.3 : sliding ? 0.5 : -0.12;
      mesh.rotation.z = (this.x - LANES[this.lane]) * 0.15;

      shadow.position.x = this.x;
      shadow.scale.setScalar(Math.max(0.4, 1 - this.y * 0.25));
    },
  };

  player.reset();
  return player;
}
