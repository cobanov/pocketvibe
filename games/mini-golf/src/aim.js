// The aim line: marching dots from the ball to the first border or bumper
// it would hit, a ring where it bounces and a short faded stub showing which
// way it goes from there. One InstancedMesh for the dots, one ring mesh.

import * as THREE from 'three';
import { GREEN, SAND } from './course.js';
import { BALL_R, castRay } from './physics.js';

const DOTS = 44;
const SPACING = 0.3;
const MAX_LEN = 10;
const STUB_LEN = 1.5;
const MARCH = 0.9; // units per second

const ray = [0, 0];

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
  const dotGeometry = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 8);
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

  const normal = [0, 0];
  const dummy = new THREE.Object3D();
  let march = 0;
  let shown = false;

  function dot(i, c, x, z, scale, color) {
    dummy.position.set(x, c.height(x, z) + 0.03, z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    dots.setMatrixAt(i, dummy.matrix);
    dots.setColorAt(i, color);
  }

  return {
    hide() {
      if (!shown) return;
      shown = false;
      dots.count = 0;
      ring.visible = false;
    },

    // Draws the line for a ball at (x, z) aimed at `angle` on course c.
    update(dt, c, x, z, angle) {
      shown = true;
      march = (march + dt * MARCH) % SPACING;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const len = castRay(c, x, z, dx, dz, MAX_LEN, normal);
      const hit = normal[0] !== 0 || normal[1] !== 0;
      let n = 0;
      for (let d = 0.28 + march; d < len && n < DOTS; d += SPACING) {
        // Dots near the end shrink a little when nothing is hit.
        const fade = hit ? 1 : Math.min(1, (len - d) / 2.5 + 0.3);
        dot(n++, c, x + dx * d, z + dz * d, fade, white);
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
          dot(n++, c, hx + rx * d, hz + rz * d, 0.8 - (d / STUB_LEN) * 0.5, faded);
        }
      }
      dots.count = n;
      dots.instanceMatrix.needsUpdate = true;
      dots.instanceColor.needsUpdate = true;
    },
  };
}
