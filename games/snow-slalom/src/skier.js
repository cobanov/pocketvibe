// The skier: carving physics (edge angle, heading, speed), tuck and
// snowplough, ice, airtime off kickers and moguls, spins, crashes, and the
// drawn model with lean, crouch and squash.

import * as THREE from 'three';
import { PISTE, SLOPE_ANGLE, clamp, slopeY } from './shared.js';
import { FOOT_X, HIP_Y, skiGeometry, skierLegsGeometry, skierUpperGeometry } from './models.js';

const EDGE_RATE = 6; // how fast the edge angle follows the D-pad...
const EDGE_FLIP = 9; // ...and how fast it swaps from one edge to the other
const TURN = 1.5; // heading change per second at full edge...
const TURN_PER_SPEED = 0.045; // ...plus this much per unit of speed
const RELAX = 0.8; // with the D-pad free the skis drift back to the fall line
const MAX_HEADING = 1.25;
const DRAG = 0.0115;
const TUCK_DRAG = 0.5; // drag multiplier in a full tuck
const CARVE_FRICTION = 0.15; // speed scrubbed by a hard carve
const BRAKE = 1.5;
const ICE_GRIP = 0.3; // how much the skis still turn on ice
const AIR_GRAVITY = 22;
const MAX_SPEED = 30;
const DEEP = PISTE - 0.3; // deep snow beyond the piste edge
const WALL = PISTE + 1.2;
export const CRASH_TIME = 1.0;
const GETUP_TIME = 0.45;
const SAFE_TIME = 1.2; // blinking after getting up, no new crash
export const SPIN_TIME = 0.55; // one full turn in the air

export function createSkier(scene) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group(); // stands on the slope, tilted with it
  const body = new THREE.Group(); // heading, lean and tumble
  body.rotation.order = 'YXZ';
  root.add(body);
  const skiGeo = skiGeometry();
  const skiL = new THREE.Mesh(skiGeo, material);
  const skiR = new THREE.Mesh(skiGeo, material);
  const legs = new THREE.Mesh(skierLegsGeometry(), material);
  const upper = new THREE.Mesh(skierUpperGeometry(), material);
  body.add(skiL, skiR, legs, upper);
  root.rotation.x = -SLOPE_ANGLE;
  scene.add(root);

  // Fake shadow: a soft blue disc on the snow under the skier.
  const shadowGeometry = new THREE.CircleGeometry(0.62, 14);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x3a5a8a, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  shadow.rotation.x = -SLOPE_ANGLE;
  scene.add(shadow);

  const skier = {
    x: 0,
    z: 0,
    px: 0, // where the last update started
    pz: 0,
    y: 0, // height above the snow
    vy: 0,
    v: 0, // speed along the heading
    ang: 0, // heading: 0 straight down the fall line, positive to the right
    edge: 0, // -1..1, how hard the skis are on edge
    tuck: 0,
    brake: 0,
    ground: 0, // height of the snow under the skier (moguls, kickers)
    air: false,
    airTime: 0,
    lastAir: 0, // airtime of the jump that just ended
    landed: false, // true on the frame of a landing
    launched: false, // true on the frame of leaving a kicker
    wasRamp: false,
    deep: false, // ploughing through deep snow at the edge
    ice: false, // on a sheet of ice
    fromRamp: false, // in the air off a kicker
    spinT: -1, // time into a spin, -1 when not spinning
    spinDir: 1,
    spins: 0, // spins completed in this jump
    spun: false, // true on the frame a spin is completed
    landedSpins: 0, // on a landing frame: the spins of that jump
    wipeout: false, // on a landing frame: it came in the middle of a spin
    crashT: -1, // time since a crash, -1 when standing
    safe: 0,
    spin: 1,
    push: 0,
    squash: 0,
    clock: 0,

    get crashed() {
      return this.crashT >= 0;
    },

    reset(x, z, v) {
      this.x = x;
      this.z = z;
      this.px = x;
      this.pz = z;
      this.y = 0;
      this.vy = 0;
      this.v = v;
      this.ang = 0;
      this.edge = 0;
      this.tuck = 0;
      this.brake = 0;
      this.ground = 0;
      this.air = false;
      this.airTime = 0;
      this.landed = false;
      this.launched = false;
      this.wasRamp = false;
      this.deep = false;
      this.ice = false;
      this.fromRamp = false;
      this.spinT = -1;
      this.spins = 0;
      this.spun = false;
      this.landedSpins = 0;
      this.wipeout = false;
      this.crashT = -1;
      this.safe = 0;
      this.squash = 0;
      root.visible = true;
      this.draw();
    },

    // steer: -1..1 from the D-pad, steep: how hard gravity pulls (it grows
    // through a run).
    update(dt, steer, tuckOn, brakeOn, steep, course) {
      this.landed = false;
      this.launched = false;
      this.spun = false;
      this.wipeout = false;
      this.px = this.x;
      this.pz = this.z;
      if (dt <= 0) return;
      this.clock += dt;
      this.squash = Math.max(0, this.squash - dt * 4);
      if (this.crashT >= 0) {
        this.tumble(dt);
        return;
      }
      this.safe = Math.max(0, this.safe - dt);
      this.tuck += ((tuckOn ? 1 : 0) - this.tuck) * Math.min(1, dt * 8);
      this.brake += ((brakeOn ? 1 : 0) - this.brake) * Math.min(1, dt * 8);

      // The edge builds towards the D-pad; the heading follows the edge, so
      // sideways speed comes from carving round, not from strafing. On ice
      // the edge hardly bites and the skis keep going where they point.
      const rate = steer * this.edge < 0 ? EDGE_FLIP : EDGE_RATE;
      this.edge += (steer - this.edge) * Math.min(1, dt * rate);
      const grip = this.air ? 0.2 : this.ice ? ICE_GRIP : 1;
      const turn = this.edge * (TURN + TURN_PER_SPEED * this.v) * (1 - 0.45 * this.tuck) * (1 - 0.25 * this.brake);
      this.ang += turn * grip * dt;
      if (Math.abs(steer) < 0.1 && !this.air && !this.ice) this.ang -= this.ang * Math.min(1, dt * RELAX);

      // Deep snow past the piste edge: slow, and the skis get turned back in.
      this.deep = Math.abs(this.x) > DEEP;
      if (this.deep) {
        const back = this.x > 0 ? -0.6 : 0.6;
        this.ang += (back - this.ang) * Math.min(1, dt * 3);
      }
      this.ang = clamp(this.ang, -MAX_HEADING, MAX_HEADING);

      // Speed: gravity along the heading against air drag, the scrub of a
      // hard carve and the snowplough.
      const v = this.v;
      let acc = -DRAG * (1 - (1 - TUCK_DRAG) * this.tuck) * v * v;
      if (!this.air) {
        const bite = this.ice ? 0.15 : 1;
        acc += steep * Math.cos(this.ang) - (CARVE_FRICTION * Math.abs(this.edge) + BRAKE * this.brake) * bite * v;
        if (this.deep) acc -= 1.5 * v;
      }
      this.v = clamp(v + acc * dt, 0, MAX_SPEED);

      this.x = clamp(this.x + Math.sin(this.ang) * this.v * dt, -WALL, WALL);
      this.z -= Math.cos(this.ang) * this.v * dt;

      // Height: follow the snow, or fly when it drops away faster than
      // gravity can pull the skier down onto it.
      const gy = course.surface(this.x, this.z);
      this.ground = gy;
      if (this.air) {
        this.vy -= AIR_GRAVITY * dt;
        this.y += this.vy * dt;
        this.airTime += dt;
        if (this.spinT >= 0) {
          this.spinT += dt;
          if (this.spinT >= SPIN_TIME) {
            this.spinT = -1;
            this.spins++;
            this.spun = true;
          }
        }
        if (this.y <= gy) {
          this.air = false;
          this.landed = true;
          this.lastAir = this.airTime;
          this.squash = clamp(-this.vy / 9, 0.3, 1);
          this.y = gy;
          this.vy = 0;
          // Nearly round counts; landing sideways halfway through does not.
          if (this.spinT >= 0) {
            if (this.spinT > SPIN_TIME * 0.8) this.spins++;
            else this.wipeout = true;
          }
          this.landedSpins = this.spins;
          this.spins = 0;
          this.spinT = -1;
          this.fromRamp = false;
        }
      } else {
        const sv = (gy - this.y) / dt;
        if (sv < this.vy - AIR_GRAVITY * dt - 1) {
          this.air = true;
          this.airTime = 0;
          if (this.wasRamp) {
            this.vy = this.vy + 3 + this.v * 0.1;
            this.launched = true;
            this.fromRamp = true;
          } else {
            this.vy *= 0.5; // the knees soak up most of a mogul
          }
          this.vy -= AIR_GRAVITY * dt;
          this.y += this.vy * dt;
        } else {
          this.vy = Math.min(sv, 14);
          this.y = gy;
        }
      }
      this.wasRamp = course.onRamp;
      this.ice = course.onIce && !this.air;
    },

    // A spin in the air off a kicker, dir -1 left or 1 right. Returns false
    // when there is no jump to spin in, or a spin is already going.
    trick(dir) {
      if (!this.air || !this.fromRamp || this.spinT >= 0 || this.crashT >= 0) return false;
      this.spinT = 0;
      this.spinDir = dir;
      return true;
    },

    // Hit something at x = fromX: tumble, lose most of the speed, get up.
    crash(fromX) {
      this.crashT = 0;
      this.v *= 0.3;
      this.vy = 4.5;
      this.air = false;
      this.y = Math.max(this.y, this.ground);
      this.spin = this.edge >= 0 ? -1 : 1;
      this.push = this.x >= fromX ? 1 : -1;
      this.edge = 0;
      this.tuck = 0;
      this.brake = 0;
      this.ice = false;
      this.fromRamp = false;
      this.spinT = -1;
      this.spins = 0;
    },

    tumble(dt) {
      this.crashT += dt;
      this.v = Math.max(0, this.v - 6 * dt);
      this.ang -= this.ang * Math.min(1, dt * 2);
      const pushing = this.crashT < 0.5 ? this.push * 1.4 * dt : 0;
      this.x = clamp(this.x + Math.sin(this.ang) * this.v * dt + pushing, -WALL, WALL);
      this.z -= Math.cos(this.ang) * this.v * dt;
      this.vy -= AIR_GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y < 0) {
        this.y = 0;
        this.vy = this.vy < -3 ? -this.vy * 0.35 : 0;
      }
      this.ground = 0;
      if (this.crashT >= CRASH_TIME + GETUP_TIME) {
        this.crashT = -1;
        this.safe = SAFE_TIME;
        this.v = Math.max(this.v, 4);
        this.y = 0;
      }
    },

    // Where ski `side` (-1 left, 1 right) touches the snow, into out.x, out.z.
    skiAt(side, out) {
      const spread = FOOT_X + 0.1 * this.brake;
      out.x = this.x + side * spread * Math.cos(this.ang);
      out.z = this.z + side * spread * Math.sin(this.ang);
      return out;
    },

    draw() {
      let crouch = 1 - 0.3 * this.tuck - 0.22 * this.squash;
      let lean = 0.35 + 0.6 * this.tuck + 0.25 * this.squash;
      let roll = -this.edge * (0.3 + 0.012 * this.v);
      let pitch = 0;
      let plough = this.brake;
      let spin = 0;
      if (this.air) {
        // Knees up on the way up, reaching for the snow on the way down.
        crouch = Math.min(crouch, this.vy > 0 ? 0.72 : 0.86);
        lean = 0.55;
        roll *= 0.4;
        pitch = clamp(this.vy * 0.02, -0.12, 0.12);
        if (this.spinT >= 0) {
          // Fast out of the start, easing into the end of the turn.
          const k = Math.min(1, this.spinT / SPIN_TIME);
          spin = this.spinDir * Math.PI * 2 * (1 - (1 - k) * (1 - k));
          crouch = 0.74;
          roll = 0;
        }
      }
      if (this.crashT >= 0) {
        const k = Math.min(1, this.crashT / CRASH_TIME);
        const e = 1 - (1 - k) * (1 - k) * (1 - k);
        if (k < 1) {
          // Cartwheel twice, slowing down, curled up.
          roll = this.spin * Math.PI * 4 * e;
          pitch = Math.sin(k * Math.PI * 3) * 0.4 * (1 - k);
          crouch = 0.6;
          lean = 1.1;
        } else {
          // Getting back up.
          const u = Math.min(1, (this.crashT - CRASH_TIME) / GETUP_TIME);
          roll = 0;
          crouch = 0.6 + 0.4 * u;
          lean = 1.1 - 0.75 * u;
        }
        plough = 0.6;
      } else {
        // A little bob in the knees while gliding.
        crouch += Math.sin(this.clock * 9) * 0.012 * Math.min(1, this.v / 10);
      }

      root.position.set(this.x, slopeY(this.z) + this.y, this.z);
      body.rotation.set(pitch, -this.ang - spin, roll);
      legs.scale.y = crouch;
      upper.position.set(0, HIP_Y * crouch, 0.06);
      upper.rotation.x = -lean;
      skiL.position.x = -FOOT_X - 0.1 * plough;
      skiR.position.x = FOOT_X + 0.1 * plough;
      skiL.rotation.y = -0.3 * plough;
      skiR.rotation.y = 0.3 * plough;
      // Blink while safe after a crash.
      root.visible = this.safe <= 0 || Math.floor(this.safe * 14) % 2 === 0;

      const lift = Math.max(0, this.y - this.ground);
      shadow.position.set(this.x, slopeY(this.z) + this.ground + 0.04, this.z);
      shadow.scale.setScalar(1 / (1 + lift * 0.35));
      shadow.material.opacity = 0.28 / (1 + lift * 0.4);
    },
  };

  skier.reset(0, 0, 0);
  return skier;
}
