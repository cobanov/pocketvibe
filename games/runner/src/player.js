// The runner: lane changes, jumping, sliding and its look.
//
// The movement is a plain function of a plain state (stepRunner), so the
// autopilot used in testing can try moves on copies of the runner.

import * as THREE from 'three';
import { GRAVITY, JUMP_SPEED, LANES } from './shared.js';
import { runnerGeometry } from './models.js';

export const STAND_H = 1.7;
export const SLIDE_H = 0.8;
const LANE_SPEED = 14; // units per second sideways
const DIVE_SPEED = 18; // DOWN in the air pulls the runner to the ground
const SLIDE_TIME = 0.65;
const JUMP_BUFFER = 0.16; // a jump pressed this long before landing still happens

// What happened in the last step (state.ev), for sounds and effects.
export const EV_JUMP = 1;
export const EV_LAND = 2;
export const EV_SLIDE = 4;
export const EV_DIVE = 8;
export const EV_LANE = 16;

export function newRunner() {
  return {
    lane: 1,
    fromLane: 1, // the lane before the last change, for bumping back
    switchAge: 9, // seconds since the last lane change
    x: LANES[1],
    prevX: LANES[1],
    y: 0,
    vy: 0,
    height: STAND_H,
    slide: 0, // seconds of slide left
    slideOnLanding: false,
    jumpBuffer: 0,
    ev: 0,
    landSpeed: 0,
  };
}

export function copyRunner(to, from) {
  to.lane = from.lane;
  to.fromLane = from.fromLane;
  to.switchAge = from.switchAge;
  to.x = from.x;
  to.prevX = from.prevX;
  to.y = from.y;
  to.vy = from.vy;
  to.height = from.height;
  to.slide = from.slide;
  to.slideOnLanding = from.slideOnLanding;
  to.jumpBuffer = from.jumpBuffer;
  return to;
}

// One step of movement. act: { left, right, jump, slide }, each true on the
// frame its button is pressed.
export function stepRunner(s, dt, act) {
  s.ev = 0;
  s.prevX = s.x;
  s.switchAge += dt;

  if (act.left && s.lane > 0) {
    s.fromLane = s.lane;
    s.lane--;
    s.switchAge = 0;
    s.ev |= EV_LANE;
  }
  if (act.right && s.lane < 2) {
    s.fromLane = s.lane;
    s.lane++;
    s.switchAge = 0;
    s.ev |= EV_LANE;
  }
  if (act.jump) {
    s.jumpBuffer = JUMP_BUFFER;
    s.slideOnLanding = false;
  }
  if (act.slide) {
    if (s.y <= 0 && s.vy <= 0) {
      s.slide = SLIDE_TIME;
      s.ev |= EV_SLIDE;
    } else {
      // The later press wins: DOWN cancels a jump waiting for the landing.
      if (s.vy > -DIVE_SPEED) {
        s.vy = -DIVE_SPEED;
        s.ev |= EV_DIVE;
      }
      s.slideOnLanding = true;
      s.jumpBuffer = 0;
    }
  }

  // Slide towards the target lane.
  const target = LANES[s.lane];
  const step = LANE_SPEED * dt;
  if (Math.abs(target - s.x) <= step) s.x = target;
  else s.x += Math.sign(target - s.x) * step;

  if (s.y > 0 || s.vy > 0) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= 0) {
      s.landSpeed = -s.vy;
      s.y = 0;
      s.vy = 0;
      s.ev |= EV_LAND;
      if (s.slideOnLanding) {
        s.slide = SLIDE_TIME;
        s.ev |= EV_SLIDE;
      }
      s.slideOnLanding = false;
    }
  }

  // A buffered jump goes off on the frame the runner is on the ground, also
  // the frame it lands.
  if (s.jumpBuffer > 0) {
    if (s.y <= 0 && s.vy <= 0) {
      s.vy = JUMP_SPEED;
      s.slide = 0;
      s.slideOnLanding = false;
      s.jumpBuffer = 0;
      s.ev |= EV_JUMP;
    } else {
      s.jumpBuffer -= dt;
    }
  }

  if (s.slide > 0) s.slide -= dt;
  s.height = s.slide > 0 ? SLIDE_H : STAND_H;
}

export function createPlayer(scene, material) {
  const mesh = new THREE.Mesh(runnerGeometry(), material);
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

  // The shield: a see-through bubble around the runner.
  const bubble = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 1),
    new THREE.MeshBasicMaterial({ color: 0x7fe6ff, transparent: true, opacity: 0.24, depthWrite: false }),
  );
  bubble.visible = false;
  scene.add(bubble);

  const act = { left: false, right: false, jump: false, slide: false };

  const player = {
    ...newRunner(),
    phase: 0,
    crashed: false,
    crashKind: 'slam', // slam: knocked back; trip: over a hurdle
    crashTime: 0,
    stumble: 0, // seconds of wobble after bumping into something's side
    shield: false,
    blink: 0, // seconds of flicker after the shield breaks

    reset() {
      Object.assign(this, newRunner());
      this.crashed = false;
      this.stumble = 0;
      this.shield = false;
      this.blink = 0;
      this.draw(0);
    },

    // input is null when the game is not taking controls (title screen),
    // or an object like the handheld's input; speed sets the stride.
    update(dt, input, speed) {
      act.left = !!input && input.pressed('LEFT');
      act.right = !!input && input.pressed('RIGHT');
      act.jump = !!input && (input.pressed('A') || input.pressed('UP'));
      act.slide = !!input && input.pressed('DOWN');
      stepRunner(this, dt, act);
      this.stumble = Math.max(0, this.stumble - dt);
      this.blink = Math.max(0, this.blink - dt);
      this.phase += dt * (8 + speed * 0.42);
      this.draw(dt);
    },

    // Sends the runner back to the lane it came from.
    bump() {
      this.lane = this.fromLane;
      this.switchAge = 9;
      this.stumble = 0.35;
    },

    crash(kind) {
      this.crashed = true;
      this.crashKind = kind;
      this.crashTime = 0;
      this.vy = kind === 'trip' ? 5 : 4;
      this.slide = 0;
      this.height = STAND_H;
    },

    // The fall after a crash; true once the runner lies still.
    updateDead(dt) {
      this.crashTime += dt;
      this.vy -= GRAVITY * 0.7 * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      this.draw(dt);
      return this.crashTime > 0.6;
    },

    draw(dt) {
      const sliding = this.slide > 0;
      let z = 0;
      let tilt = sliding ? 0.5 : this.y > 0 ? -0.25 : -0.12;
      let bob = this.y === 0 && !sliding ? Math.abs(Math.sin(this.phase)) * 0.1 : 0;
      if (this.crashed) {
        // Knocked back towards the camera, or thrown forward over a hurdle.
        const t = Math.min(1, this.crashTime / 0.35);
        const ease = 1 - (1 - t) * (1 - t);
        tilt = this.crashKind === 'trip' ? -1.4 * ease : 1.35 * ease;
        z = this.crashKind === 'trip' ? -1.1 * ease : 0.85 * ease;
        bob = 0;
      }
      mesh.position.set(this.x, this.y + bob, z);
      mesh.scale.y = sliding ? SLIDE_H / STAND_H : 1;
      mesh.rotation.x = tilt;
      mesh.rotation.z = this.crashed ? 0 : (this.x - LANES[this.lane]) * 0.15 + Math.sin(this.stumble * 40) * this.stumble * 0.8;
      mesh.visible = this.blink <= 0 || Math.floor(this.blink * 16) % 2 === 0;

      shadow.position.set(this.x, 0.02, z);
      shadow.scale.setScalar(Math.max(0.4, 1 - this.y * 0.25));

      bubble.visible = this.shield && !this.crashed;
      if (bubble.visible) {
        bubble.position.set(this.x, this.y + (sliding ? 0.55 : 0.9), 0);
        const s = 1 + Math.sin(this.phase * 0.5) * 0.04;
        bubble.scale.set(s, sliding ? s * 0.7 : s, s);
        bubble.rotation.y += dt * 0.8;
      }
    },

    // For warming up shaders while loading: shows the bubble for one frame.
    showAll(on) {
      bubble.visible = on;
    },
  };

  player.reset();
  return player;
}
