// The player's ship: turning, thrust with inertia, firing, hyperspace and
// its look (hull, engine flame, spawn shield).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLY_Z, TAU, part, rand, wrap } from './shared.js';

export const SHIP_HIT = 0.62; // collision radius
const SCALE = 1.2; // drawn size of the hull

const TURN_MIN = 2.6; // rad/s when a direction is first pressed, for fine aim
const TURN_MAX = 5.4; // rad/s after holding for TURN_RAMP seconds
const TURN_RAMP = 0.22;
const THRUST = 22; // units/s²
const MAX_SPEED = 15;
const DRAG = 0.65; // fraction of speed lost per second
const BULLET_SPEED = 27;
const BULLET_LIFE = 0.7;
const INHERIT = 0.5; // share of the ship's velocity the bullets keep
const RECOIL = 0.12; // units/s the ship loses with each shot
const TAP_RATE = 0.085; // seconds between shots when tapping A
const HOLD_RATE = 0.19; // seconds between shots when holding A
const INVULN = 2.6;
const HYPER_TIME = 0.4; // seconds spent in hyperspace
const HYPER_COOLDOWN = 1.0;
const EXHAUST_RATE = 55; // sparks per second while thrusting

function chevron(points, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) shape.lineTo(points[i], points[i + 1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  return g;
}

function hullGeometry() {
  const cockpit = new THREE.IcosahedronGeometry(0.22, 0);
  cockpit.scale(1.4, 0.9, 0.7);
  const g = mergeGeometries([
    part(chevron([1.05, 0, -0.75, 0.7, -0.42, 0, -0.75, -0.7], 0.3), 0xeef2ff, 0, 0, -0.15),
    part(chevron([0.72, 0, -0.32, 0.3, -0.18, 0, -0.32, -0.3], 0.22), 0xff4d6a, 0, 0, 0.12),
    part(cockpit, 0x5ff0ff, 0.28, 0, 0.32),
    part(new THREE.BoxGeometry(0.22, 0.16, 0.2), 0x4a5070, -0.52, 0.24, 0),
    part(new THREE.BoxGeometry(0.22, 0.16, 0.2), 0x4a5070, -0.52, -0.24, 0),
    part(new THREE.BoxGeometry(0.2, 0.1, 0.34), 0x5ff0ff, -0.66, 0.62, 0),
    part(new THREE.BoxGeometry(0.2, 0.1, 0.34), 0x5ff0ff, -0.66, -0.62, 0),
  ]);
  g.computeVertexNormals();
  return g;
}

// A cone pointing along -x from the origin: yellow-white at the base, red at the tip.
function flameGeometry() {
  const g = new THREE.ConeGeometry(0.24, 1, 6, 1, true);
  g.rotateZ(Math.PI / 2);
  g.translate(-0.5, 0, 0);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const hot = new THREE.Color(0xfff3b0);
  const cool = new THREE.Color(0xff4a1c);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(hot).lerp(cool, Math.min(1, -pos.getX(i)));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// findSpot(out) picks where a hyperspace jump ends; onArrive() is called when
// the ship comes out of it.
export function createShip(scene, fx, findSpot, onArrive) {
  const group = new THREE.Group();
  group.rotation.order = 'ZYX'; // yaw last, so banking rolls around the nose
  group.scale.setScalar(SCALE);
  scene.add(group);

  const hull = new THREE.Mesh(hullGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  group.add(hull);

  const flame = new THREE.Mesh(flameGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  flame.position.x = -0.6;
  group.add(flame);

  // A soft cyan bubble while the ship cannot be hurt.
  const shield = new THREE.Mesh(
    new THREE.RingGeometry(1.0, 1.18, 28),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
  scene.add(shield);
  const shieldColor = new THREE.Color(0x4fd8ff);

  const spot = { x: 0, y: 0 };

  const ship = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: Math.PI / 2,
    alive: false,
    invuln: 0,
    hyper: 0, // seconds left in hyperspace
    hyperCooldown: 0,
    sinceShot: 1,
    turnTime: 0,
    turnDir: 0,
    thrusting: false,
    bank: 0,
    exhaust: 0,
    time: 0,

    // Puts the ship in the centre, pointing up, with a moment of invulnerability.
    reset() {
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.angle = Math.PI / 2;
      this.alive = true;
      this.invuln = INVULN;
      this.hyper = 0;
      this.hyperCooldown = 0;
      this.sinceShot = 1;
      this.turnTime = 0;
      this.bank = 0;
      this.thrusting = false;
      fx.ring(0, 0, 0x4fd8ff, 2.6, 0.5);
      fx.burst(0, 0, 0x8ff0ff, 14, 7, 0.4, 0.22);
      this.draw();
    },

    // True while rocks and bullets can hit the ship.
    get vulnerable() {
      return this.alive && this.hyper <= 0 && this.invuln <= 0;
    },

    // turn: -1 right, 1 left, 0 none. thrust: UP held.
    update(dt, turn, thrust) {
      this.time += dt;
      if (this.hyperCooldown > 0) this.hyperCooldown -= dt;
      this.sinceShot += dt;
      if (!this.alive) {
        this.draw();
        return;
      }

      if (this.hyper > 0) {
        this.hyper -= dt;
        if (this.hyper <= 0) {
          findSpot(spot);
          this.x = spot.x;
          this.y = spot.y;
          fx.ring(this.x, this.y, 0x9a7bff, 2.2, 0.35);
          fx.burst(this.x, this.y, 0xc8b0ff, 16, 8, 0.35, 0.22);
          onArrive();
        }
        this.draw();
        return;
      }

      if (this.invuln > 0) this.invuln -= dt;

      // Turning speeds up the longer a direction is held, so taps aim finely.
      if (turn !== this.turnDir) this.turnTime = 0;
      this.turnDir = turn;
      if (turn !== 0) {
        this.turnTime += dt;
        const rate = TURN_MIN + (TURN_MAX - TURN_MIN) * Math.min(1, this.turnTime / TURN_RAMP);
        this.angle = (this.angle + turn * rate * dt) % TAU;
      }

      const dx = Math.cos(this.angle);
      const dy = Math.sin(this.angle);
      this.thrusting = thrust;
      if (thrust) {
        this.vx += dx * THRUST * dt;
        this.vy += dy * THRUST * dt;
        const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (speed > MAX_SPEED) {
          this.vx *= MAX_SPEED / speed;
          this.vy *= MAX_SPEED / speed;
        }
        // Exhaust sparks trail behind the engines.
        this.exhaust += dt * EXHAUST_RATE;
        while (this.exhaust >= 1) {
          this.exhaust -= 1;
          const s = rand(5, 9);
          const side = rand(-1.6, 1.6);
          fx.spark(
            this.x - dx * 1.1,
            this.y - dy * 1.1,
            this.vx - dx * s - dy * side,
            this.vy - dy * s + dx * side,
            rand(0.18, 0.32),
            rand(0.2, 0.32),
            Math.random() < 0.5 ? 0xffb347 : 0xff6a2a,
            3,
          );
        }
      }
      const k = Math.max(0, 1 - DRAG * dt);
      this.vx *= k;
      this.vy *= k;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      wrap(this, 0.8);

      this.bank += (turn * 0.45 - this.bank) * Math.min(1, dt * 10);
      this.draw();
    },

    // tapped: A was pressed this frame (faster than holding it down).
    // Returns true if a shot left the gun.
    fire(shots, tapped) {
      if (!this.alive || this.hyper > 0) return false;
      if (this.sinceShot < (tapped ? TAP_RATE : HOLD_RATE)) return false;
      const dx = Math.cos(this.angle);
      const dy = Math.sin(this.angle);
      const nx = this.x + dx * 1.05 * SCALE;
      const ny = this.y + dy * 1.05 * SCALE;
      if (!shots.firePlayer(nx, ny, dx * BULLET_SPEED + this.vx * INHERIT, dy * BULLET_SPEED + this.vy * INHERIT, BULLET_LIFE)) return false;
      this.sinceShot = 0;
      // A tiny recoil and a muzzle spark.
      this.vx -= dx * RECOIL;
      this.vy -= dy * RECOIL;
      fx.spark(nx, ny, this.vx + dx * 4, this.vy + dy * 4, 0.1, 0.55, 0xfff27a, 0);
      return true;
    },

    // Jumps to a random safe-ish spot. Returns false while recharging.
    hyperspace() {
      if (!this.alive || this.hyper > 0 || this.hyperCooldown > 0) return false;
      this.hyper = HYPER_TIME;
      this.hyperCooldown = HYPER_COOLDOWN;
      this.vx = 0;
      this.vy = 0;
      this.thrusting = false;
      fx.ring(this.x, this.y, 0x9a7bff, 1.8, 0.3);
      fx.burst(this.x, this.y, 0xc8b0ff, 16, 7, 0.35, 0.22);
      this.draw();
      return true;
    },

    explode() {
      this.alive = false;
      this.thrusting = false;
      fx.burst(this.x, this.y, 0xeef2ff, 26, 13, 0.9, 0.36);
      fx.burst(this.x, this.y, 0xff6a2a, 24, 9, 0.8, 0.42);
      fx.burst(this.x, this.y, 0x5ff0ff, 10, 15, 0.6, 0.26);
      fx.ring(this.x, this.y, 0xffffff, 4.5, 0.55);
      fx.ring(this.x, this.y, 0xff6a2a, 2.8, 0.4);
      this.draw();
    },

    hide() {
      this.alive = false;
      this.thrusting = false;
      this.draw();
    },

    draw() {
      const present = this.alive && this.hyper <= 0;
      // Blink while invulnerable.
      group.visible = present && (this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0);
      group.position.set(this.x, this.y, FLY_Z);
      group.rotation.set(this.bank, 0, this.angle);

      flame.visible = this.thrusting;
      if (this.thrusting) {
        // Flicker: a different length and width every frame.
        flame.scale.set(0.75 + Math.random() * 0.65, 0.8 + Math.random() * 0.4, 1);
      }

      shield.visible = present && this.invuln > 0;
      if (shield.visible) {
        const t = Math.min(1, this.invuln / 0.6); // fade out over the last moment
        const pulse = 0.55 + 0.25 * Math.sin(this.time * 14);
        shield.material.color.copy(shieldColor).multiplyScalar(pulse * t);
        shield.position.set(this.x, this.y, FLY_Z + 0.5);
        shield.scale.setScalar(SCALE * (1.05 + 0.06 * Math.sin(this.time * 9)));
      }
    },
  };

  ship.hide();
  return ship;
}
