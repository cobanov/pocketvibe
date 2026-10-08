// The hero: jetpack physics, run and flight animation, flames and the tumble
// after a hit. Drawn as a few meshes (body, two legs, two arms, flames) that
// share one vertex-colored material.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEIL_Y, HERO_X, box, cyl, paint, segDist2 } from './shared.js';

const HEIGHT = 1.5; // feet to the top of the hair
const CENTER = 0.72; // the model spins around this height
const MAX_Y = CEIL_Y - HEIGHT - 0.02;
const GRAVITY = 36;
const THRUST = 84; // upward acceleration while A is held (gravity still pulls)
const KICK = 3.2; // instant lift when taking off from the floor
const MAX_RISE = 10.5;
const MAX_FALL = 17;
const HIT_R = 0.27; // radius around the three hit points

// Where the jetpack's two nozzles are, relative to the hero's feet.
const NOZZLE_X = -0.44;
const NOZZLE_Y = 0.36;

const SUIT = 0x3a86ff;
const PANTS = 0x24365e;
const SKIN = 0xf4c49c;

function bodyGeometry() {
  return mergeGeometries([
    box(0.44, 0.52, 0.42, 0, 0.78, 0, SUIT), // torso
    box(0.46, 0.08, 0.44, 0, 0.55, 0, 0x1d2333), // belt
    box(0.1, 0.1, 0.02, 0.12, 0.55, 0.22, 0xffd23f), // buckle
    box(0.47, 0.14, 0.43, 0, 1.0, 0, 0xffffff), // collar stripe
    box(0.4, 0.38, 0.38, 0.03, 1.22, 0, SKIN), // head
    box(0.08, 0.08, 0.1, 0.25, 1.18, 0, SKIN), // nose
    box(0.44, 0.12, 0.4, 0, 1.44, 0, 0x5a3825), // hair
    box(0.12, 0.26, 0.4, -0.16, 1.3, 0, 0x5a3825),
    box(0.42, 0.07, 0.4, 0.02, 1.3, 0, 0xffd23f), // goggle strap
    box(0.14, 0.12, 0.06, 0.15, 1.3, 0.19, 0x253042), // goggle lens
    box(0.06, 0.08, 0.02, 0.14, 1.19, 0.2, 0x253042), // eye
    box(0.28, 0.56, 0.46, -0.34, 0.82, 0, 0xa3aec0), // jetpack frame
    cyl(0.12, 0.6, 8, 'y', -0.44, 0.84, 0.13, 0xff4d4d), // fuel tanks
    cyl(0.12, 0.6, 8, 'y', -0.44, 0.84, -0.13, 0xff4d4d),
    cyl(0.13, 0.06, 8, 'y', -0.44, 1.13, 0.13, 0xffd23f),
    cyl(0.13, 0.06, 8, 'y', -0.44, 1.13, -0.13, 0xffd23f),
    cyl(0.09, 0.14, 8, 'y', NOZZLE_X, 0.48, 0.13, 0x2d3340), // nozzles
    cyl(0.09, 0.14, 8, 'y', NOZZLE_X, 0.48, -0.13, 0x2d3340),
  ]);
}

// A limb hangs down from its pivot at y = 0.
function limbGeometry(length, width, top, foot) {
  const parts = [box(width, length, width, 0, -length / 2, 0, top)];
  if (foot) parts.push(box(width + 0.1, 0.1, width + 0.02, 0.05, -length + 0.05, 0, foot));
  return mergeGeometries(parts);
}

// Two flame cones hanging from the nozzles; y = 0 is the nozzle mouth, so
// scaling y stretches the flames downwards.
function flameGeometry() {
  const parts = [];
  for (let s = -1; s <= 1; s += 2) {
    const outer = new THREE.ConeGeometry(0.11, 0.5, 6);
    outer.rotateX(Math.PI); // point down
    outer.translate(NOZZLE_X, -0.25, 0.13 * s);
    const inner = new THREE.ConeGeometry(0.06, 0.32, 6);
    inner.rotateX(Math.PI);
    inner.translate(NOZZLE_X, -0.16, 0.13 * s + 0.03);
    parts.push(paint(outer, 0xff7a1f), paint(inner, 0xfff2a0));
  }
  return mergeGeometries(parts);
}

export function createHero(scene, particles) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });

  // root sits at the hero's centre so the tumble spins around it; `model`
  // shifts the meshes down so their y = 0 is the feet.
  const root = new THREE.Group();
  const model = new THREE.Group();
  model.position.y = -CENTER;
  root.add(model);
  scene.add(root);

  model.add(new THREE.Mesh(bodyGeometry(), material));

  const legGeo = limbGeometry(0.52, 0.17, PANTS, 0x2d3340);
  const backLegGeo = limbGeometry(0.52, 0.17, 0x1b2848, 0x22272f);
  const armGeo = limbGeometry(0.44, 0.14, SUIT, null);
  const backArmGeo = limbGeometry(0.44, 0.14, 0x2a66c8, null);

  function limb(geometry, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.add(new THREE.Mesh(geometry, material));
    model.add(pivot);
    return pivot;
  }
  const backArm = limb(backArmGeo, 0.02, 0.98, -0.26);
  const backLeg = limb(backLegGeo, 0.02, 0.54, -0.1);
  const frontLeg = limb(legGeo, 0.02, 0.54, 0.1);
  const frontArm = limb(armGeo, 0.02, 0.98, 0.27);

  const flame = new THREE.Mesh(flameGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  flame.position.y = NOZZLE_Y + 0.05;
  model.add(flame);

  // Fake shadow: a dark transparent disc on the floor.
  const shadowGeometry = new THREE.CircleGeometry(0.5, 14);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.position.set(HERO_X - 0.1, 0.02, 0);
  scene.add(shadow);

  let flameTimer = 0;
  let squash = 0;
  let tilt = 0;

  const hero = {
    y: 0,
    vy: 0,
    grounded: true,
    thrusting: false,
    phase: 0,
    dead: false,
    settled: false,
    freeze: 0, // electrocuted pause before the tumble
    zapFlash: 0,
    cy: 0, // centre height during the tumble
    rot: 0,
    spin: 0,

    reset() {
      this.y = 0;
      this.vy = 0;
      this.grounded = true;
      this.thrusting = false;
      this.dead = false;
      this.settled = false;
      this.freeze = 0;
      this.zapFlash = 0;
      this.rot = 0;
      this.spin = 0;
      squash = 0;
      tilt = 0;
      material.emissive.setHex(0x000000);
      this.draw(0);
    },

    // thrust: A or UP held. speed: world speed, for the run cycle.
    update(dt, thrust, speed) {
      if (thrust && this.grounded) this.vy = KICK;
      this.thrusting = thrust;
      this.vy -= (GRAVITY - (thrust ? THRUST : 0)) * dt;
      if (this.vy > MAX_RISE) this.vy = MAX_RISE;
      if (this.vy < -MAX_FALL) this.vy = -MAX_FALL;
      this.y += this.vy * dt;

      if (this.y >= MAX_Y) {
        this.y = MAX_Y;
        if (this.vy > 0) this.vy = 0;
      }
      const wasGrounded = this.grounded;
      if (this.y <= 0) {
        this.y = 0;
        if (!wasGrounded && this.vy < -5) {
          squash = 0.12;
          for (let k = 0; k < 6; k++) {
            const side = k < 3 ? -1 : 1;
            particles.emit(HERO_X + side * 0.2, 0.08, 0.3, side * (1.5 + Math.random() * 2), 0.8 + Math.random(), 0.35, 0.22, 0xe9eef5, 0x8f9ab0, 3);
          }
        }
        this.vy = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }

      if (this.grounded) {
        const before = Math.sin(this.phase);
        this.phase += dt * (6 + speed * 0.55);
        // A little puff of dust at every footstep.
        if ((before < 0) !== (Math.sin(this.phase) < 0)) {
          particles.emit(HERO_X - 0.1, 0.06, 0.3, -1 - Math.random(), 0.6, 0.3, 0.16, 0xdfe5ee, 0x9aa5ba, 2);
        }
      } else {
        this.phase += dt * 4;
      }

      if (thrust) this.emitFlames(dt);
      this.draw(dt);
    },

    // Title screen: hover up and down on its own.
    updateTitle(dt, time) {
      const target = 2.6 + Math.sin(time * 1.4) * 1.6;
      this.update(dt, this.y < target && this.vy < 4, 9);
    },

    emitFlames(dt) {
      flameTimer -= dt;
      while (flameTimer <= 0) {
        flameTimer += 1 / 75;
        const z = Math.random() < 0.5 ? 0.13 : -0.13;
        const smoke = Math.random() < 0.18;
        particles.emit(
          HERO_X + NOZZLE_X + (Math.random() - 0.5) * 0.1,
          this.y + NOZZLE_Y - 0.25,
          z + 0.2,
          -2 - Math.random() * 2,
          -7 - Math.random() * 4 + this.vy * 0.3,
          smoke ? 0.5 : 0.22 + Math.random() * 0.12,
          smoke ? 0.3 : 0.26,
          smoke ? 0xb9c2d0 : 0xffe066,
          smoke ? 0x5e6578 : 0xff3d1f,
          smoke ? -4 : 0,
        );
      }
    },

    // True if a segment of radius r touches the hero.
    hitBy(ax, ay, bx, by, r) {
      const rr = (r + HIT_R) * (r + HIT_R);
      const x = HERO_X - 0.06;
      return (
        segDist2(x, this.y + 0.3, ax, ay, bx, by) < rr ||
        segDist2(x, this.y + 0.72, ax, ay, bx, by) < rr ||
        segDist2(x + 0.04, this.y + 1.12, ax, ay, bx, by) < rr
      );
    },

    // Centre of the hero's body: missiles aim here.
    centerY() {
      return this.y + CENTER;
    },

    // kind: 'zap' (a short electrocuted freeze first) or 'boom'.
    die(kind) {
      this.dead = true;
      this.settled = false;
      this.thrusting = false;
      this.cy = this.y + CENTER;
      this.vy = kind === 'zap' ? 4 : 9;
      this.spin = kind === 'zap' ? 7 : 11;
      this.rot = 0;
      this.freeze = kind === 'zap' ? 0.4 : 0;
      this.zapFlash = kind === 'zap' ? 0.9 : 0;
    },

    // The tumble: bounce along the floor until the hero lies still.
    updateDead(dt) {
      if (this.zapFlash > 0) {
        this.zapFlash -= dt;
        const on = this.zapFlash > 0 && Math.floor(this.zapFlash * 18) % 2 === 0;
        material.emissive.setHex(on ? 0x55e8ff : 0x000000);
      }
      if (this.freeze > 0) {
        this.freeze -= dt;
        root.position.set(HERO_X + (Math.random() - 0.5) * 0.14, this.cy + (Math.random() - 0.5) * 0.14, 0);
        if (Math.random() < 0.5) {
          particles.emit(HERO_X + (Math.random() - 0.5) * 0.8, this.cy + (Math.random() - 0.5) * 1.2, 0.5, 0, 0, 0.12, 0.16, 0xffffff, 0x3fd8ff, 0);
        }
        return;
      }

      const floor = 0.3;
      this.vy -= GRAVITY * dt;
      this.cy += this.vy * dt;
      this.rot += this.spin * dt;
      if (this.cy > CEIL_Y - 0.5) {
        this.cy = CEIL_Y - 0.5;
        this.vy = -Math.abs(this.vy) * 0.5;
      }
      if (this.cy <= floor) {
        this.cy = floor;
        if (this.vy < -3) {
          this.vy = -this.vy * 0.45;
          this.spin *= 0.6;
          for (let k = 0; k < 5; k++) {
            particles.emit(HERO_X + (Math.random() - 0.5), 0.1, 0.3, (Math.random() - 0.5) * 4, 1 + Math.random(), 0.4, 0.26, 0xe9eef5, 0x8f9ab0, 3);
          }
        } else {
          this.vy = 0;
          this.spin = 0;
          // Settle flat on the back (rotation = PI/2, modulo a full turn).
          const diff = ((((Math.PI / 2 - this.rot) % 6.2832) + 9.4248) % 6.2832) - 3.1416;
          this.rot += diff * Math.min(1, dt * 12);
          if (Math.abs(diff) < 0.02) this.settled = true;
        }
      }
      root.position.set(HERO_X, this.cy, 0);
      root.rotation.z = this.rot;
      frontLeg.rotation.z = 0.5;
      backLeg.rotation.z = -0.4;
      frontArm.rotation.z = 2.2;
      backArm.rotation.z = 1.4;
      flame.visible = false;
      shadow.scale.setScalar(1);
      shadowMaterial.opacity = 0.3;
    },

    draw(dt) {
      squash = Math.max(0, squash - dt);
      const run = this.grounded;
      const s = Math.sin(this.phase);
      const bob = run ? Math.abs(Math.cos(this.phase)) * 0.07 : 0;

      // Lean forward while thrusting, back a little while falling.
      const targetTilt = run ? -0.08 : this.thrusting ? -0.2 : 0.12;
      tilt += (targetTilt - tilt) * Math.min(1, dt * 10);

      root.position.set(HERO_X, this.y + CENTER + bob - squash * 0.5, 0);
      root.rotation.z = tilt;
      root.scale.set(1 + squash, 1 - squash, 1);

      if (run) {
        frontLeg.rotation.z = s * 0.85;
        backLeg.rotation.z = -s * 0.85;
        frontArm.rotation.z = -s * 0.7;
        backArm.rotation.z = s * 0.7;
      } else {
        // Legs dangle behind, arms out front, with a little sway.
        const sway = Math.sin(this.phase * 2) * 0.12;
        frontLeg.rotation.z = -0.35 + sway;
        backLeg.rotation.z = -0.15 - sway;
        frontArm.rotation.z = this.thrusting ? 1.2 : 0.7 + sway;
        backArm.rotation.z = this.thrusting ? 0.9 : 0.4 - sway;
      }

      flame.visible = this.thrusting;
      if (this.thrusting) flame.scale.set(1, 0.75 + Math.random() * 0.6, 1);

      const lift = Math.max(0, this.y);
      shadow.scale.setScalar(Math.max(0.35, 1 - lift * 0.12));
      shadowMaterial.opacity = Math.max(0.08, 0.32 - lift * 0.04);
    },
  };

  hero.reset();
  return hero;
}
