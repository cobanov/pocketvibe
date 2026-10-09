// The aim line: marching dots from the ball to the first border or bumper
// it would hit, a ring where it bounces and a short faded stub showing which
// way it goes from there. While A charges, the dots instead run as far as
// the putt would roll on level ground (bounce included) and a gold ring
// marks where it would stop. One InstancedMesh for the dots, two rings.

import * as THREE from 'three';
import { GREEN, SAND } from './course.js';
import { BALL_R, BUMPER_E, BUMPER_KICK, STOP_SPEED, WALL_E, castRay, slowDown } from './physics.js';

const DOTS = 60;
const SPACING = 0.3;
const MAX_LEN = 10;
const STUB_LEN = 1.5;
const MARCH = 0.9; // units per second
const PREVIEW_STEP = 0.05; // the preview rolls the ball on in steps this long
const PREVIEW_SPACING = 0.36;
const PREVIEW_LEN = 24;

const ray = [0, 0, 0];

// How far a ball could roll from (x, z) along (dx, dz) before a border,
// a bumper, water or a drop.
function clearLength(c, x, z, dx, dz, maxLen) {
  const len = castRay(c, x, z, dx, dz, maxLen, ray);
  for (let d = 0.2; d < len; d += 0.2) {
    const k = c.kindAt(x + dx * d, z + dz * d);
    if (k !== GREEN && k !== SAND) return d - 0.2;
  }
  return len;
}

// A sensible aim for a ball at rest: straight at the cup if the way is
// clear, otherwise the direction whose open stretch ends closest to the cup
// by walking distance (round the corner of a dogleg, over the bridge).
export function suggestAim(c, x, z) {
  const toCup = Math.atan2(c.cup.z - z, c.cup.x - x);
  const dCup = Math.hypot(c.cup.x - x, c.cup.z - z);
  if (clearLength(c, x, z, Math.cos(toCup), Math.sin(toCup), dCup) >= dCup - 0.3) return toCup;
  let best = toCup;
  let bestScore = Infinity;
  for (let k = 0; k < 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const len = clearLength(c, x, z, dx, dz, 9);
    const score = c.pathDistance(x + dx * len * 0.9, z + dz * len * 0.9);
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export function createAim(scene) {
  const dotGeometry = new THREE.CircleGeometry(0.05, 8);
  dotGeometry.rotateX(-Math.PI / 2);
  const dots = new THREE.InstancedMesh(dotGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }), DOTS);
  dots.frustumCulled = false;
  dots.count = 0;
  const white = new THREE.Color(0xffffff);
  const faded = new THREE.Color(0xfff2a8);
  for (let i = 0; i < DOTS; i++) dots.setColorAt(i, white);
  scene.add(dots);

  const ringGeometry = new THREE.RingGeometry(BALL_R * 0.8, BALL_R * 1.25, 18);
  ringGeometry.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ring.visible = false;
  scene.add(ring);
  // Where the previewed putt stops: a bigger gold ring.
  const stopGeometry = new THREE.RingGeometry(BALL_R * 1.1, BALL_R * 1.75, 18);
  stopGeometry.rotateX(-Math.PI / 2);
  const stop = new THREE.Mesh(stopGeometry, new THREE.MeshBasicMaterial({ color: 0xffd23f }));
  stop.visible = false;
  scene.add(stop);

  const normal = [0, 0, 0];
  const dummy = new THREE.Object3D();
  let march = 0;
  let shown = false;
  let n = 0;

  function dot(c, x, z, scale, color) {
    if (n >= DOTS) return;
    dummy.position.set(x, c.height(x, z) + 0.03, z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    dots.setMatrixAt(n, dummy.matrix);
    dots.setColorAt(n, color);
    n++;
  }

  function finish() {
    dots.count = n;
    dots.instanceMatrix.needsUpdate = true;
    dots.instanceColor.needsUpdate = true;
  }

  // The dots of a putt leaving (x, z) along `angle` at `speed`, rolled on
  // over level green and sand until it stops, drops or meets a second
  // border.
  function preview(c, x, z, angle, speed) {
    let dx = Math.cos(angle);
    let dz = Math.sin(angle);
    let px = x;
    let pz = z;
    let v = speed;
    let travelled = 0;
    let next = 0.28 + (march / SPACING) * PREVIEW_SPACING;
    let bounces = 0;
    let wet = false;
    let len = castRay(c, px, pz, dx, dz, PREVIEW_LEN, normal);
    let d = 0;
    while (v > STOP_SPEED && travelled < PREVIEW_LEN) {
      if (d >= len) {
        if ((normal[0] === 0 && normal[1] === 0) || bounces === 1) break;
        // Bounce: reflect, losing speed into the border (or gaining a kick
        // from a bumper).
        px += dx * len;
        pz += dz * len;
        ring.visible = true;
        ring.position.set(px, c.height(px, pz) + 0.03, pz);
        bounces++;
        const bumper = normal[2] === 1;
        let vx = dx * v;
        let vz = dz * v;
        const vn = vx * normal[0] + vz * normal[1];
        const e = bumper ? BUMPER_E : WALL_E;
        vx -= (1 + e) * vn * normal[0];
        vz -= (1 + e) * vn * normal[1];
        if (bumper) {
          vx += normal[0] * BUMPER_KICK;
          vz += normal[1] * BUMPER_KICK;
        }
        v = Math.hypot(vx, vz);
        if (v < 1e-6) break;
        dx = vx / v;
        dz = vz / v;
        len = castRay(c, px, pz, dx, dz, PREVIEW_LEN, normal);
        d = 0;
        continue;
      }
      d = Math.min(len, d + PREVIEW_STEP);
      travelled += PREVIEW_STEP;
      const k = c.kindAt(px + dx * d, pz + dz * d);
      if (k !== GREEN && k !== SAND) {
        wet = true;
        break;
      }
      v = slowDown(v, PREVIEW_STEP, k === SAND);
      if (travelled >= next) {
        next += PREVIEW_SPACING;
        dot(c, px + dx * d, pz + dz * d, 1, bounces ? faded : white);
      }
    }
    const ex = px + dx * d;
    const ez = pz + dz * d;
    stop.visible = !wet;
    if (!wet) stop.position.set(ex, c.height(ex, ez) + 0.035, ez);
  }

  return {
    hide() {
      if (!shown) return;
      shown = false;
      dots.count = 0;
      ring.visible = false;
      stop.visible = false;
    },

    // Draws the line for a ball at (x, z) aimed at `angle` on course c, or
    // with `speed` (> 0) the preview of a putt that fast.
    update(dt, c, x, z, angle, speed = 0) {
      shown = true;
      march = (march + dt * MARCH) % SPACING;
      n = 0;
      ring.visible = false;
      stop.visible = false;
      if (speed > 0) {
        preview(c, x, z, angle, speed);
        finish();
        return;
      }
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const len = castRay(c, x, z, dx, dz, MAX_LEN, normal);
      const hit = normal[0] !== 0 || normal[1] !== 0;
      for (let d = 0.28 + march; d < len && n < DOTS; d += SPACING) {
        // Dots near the end shrink a little when nothing is hit.
        const fade = hit ? 1 : Math.min(1, (len - d) / 2.5 + 0.3);
        dot(c, x + dx * d, z + dz * d, fade, white);
      }
      const hx = x + dx * len;
      const hz = z + dz * len;
      ring.visible = hit;
      if (hit) {
        ring.position.set(hx, c.height(hx, hz) + 0.03, hz);
        // The bounce: reflect the direction off the surface normal.
        const dn = dx * normal[0] + dz * normal[1];
        const rx = dx - 2 * dn * normal[0];
        const rz = dz - 2 * dn * normal[1];
        for (let d = SPACING; d < STUB_LEN && n < DOTS; d += SPACING) {
          dot(c, hx + rx * d, hz + rz * d, 0.8 - (d / STUB_LEN) * 0.5, faded);
        }
      }
      finish();
    },
  };
}
