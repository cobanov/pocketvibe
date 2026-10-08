// Pipe pairs: a fixed pool drawn with one InstancedMesh (plus one for their
// shadows). Each pair has a bottom pipe and a top pipe with a gap between.

import * as THREE from 'three';
import { DESPAWN_X, SPAWN_X, lowPoly, merge, part } from './shared.js';

const MAX_PAIRS = 8;
const BODY_R = 0.82;
const CAP_R = 1.04;
const CAP_H = 0.75;
const LENGTH = 17; // long enough to reach past the ledge and the top of the screen
export const PIPE_HALF_W = 0.95; // hit box half width, between body and cap

const FLOOR = 1.5; // lowest gap bottom above the ledge
const TOP = 12.6; // highest gap top

// Difficulty goes from 0 (first pipe) to 1 (score 50 and up).
const GAP_EASY = 4.8;
const GAP_HARD = 3.8;
const SPACING_EASY = 8.6; // world units between pairs
const SPACING_HARD = 7.8;
const REACH_EASY = 2.8; // how far a gap center may move from the last one
const REACH_HARD = 4.2;

// One pipe pointing down from y = 0: the rim at the top, the body below.
// Bottom pipes are drawn as is, top pipes rotated half a turn around z.
function pipeGeometry() {
  return merge([
    part(new THREE.CylinderGeometry(CAP_R, CAP_R, CAP_H, 10), 0, -CAP_H / 2, 0, 0x78dd4c),
    part(new THREE.CylinderGeometry(CAP_R + 0.02, CAP_R + 0.02, 0.1, 10, 1, true), 0, -0.13, 0, 0xb4f27e),
    part(new THREE.CylinderGeometry(CAP_R + 0.03, CAP_R + 0.03, 0.14, 10, 1, true), 0, -CAP_H + 0.07, 0, 0x3a9a2c),
    part(new THREE.CylinderGeometry(BODY_R + 0.02, BODY_R + 0.02, 0.3, 10, 1, true), 0, -CAP_H - 0.15, 0, 0x3a8a2a),
    part(new THREE.CylinderGeometry(BODY_R, BODY_R, LENGTH, 10, 1, true), 0, -CAP_H - LENGTH / 2, 0, 0x5cc93c),
  ]);
}

// sideRoom: how much further than on the 3:2 screen the view reaches to each
// side; pipes appear and are recycled that much further out.
export function createPipes(scene, sideRoom = 0) {
  const spawnX = SPAWN_X + sideRoom;
  const despawnX = DESPAWN_X - sideRoom;
  const mesh = new THREE.InstancedMesh(pipeGeometry(), lowPoly(), MAX_PAIRS * 2);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  scene.add(mesh);

  // A dark disc where each bottom pipe meets the ledge.
  const shadowGeometry = new THREE.CircleGeometry(1.5, 16);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x0b2a12, transparent: true, opacity: 0.25, depthWrite: false }),
    MAX_PAIRS,
  );
  shadows.frustumCulled = false;
  shadows.count = 0;
  scene.add(shadows);

  const active = new Uint8Array(MAX_PAIRS);
  const scored = new Uint8Array(MAX_PAIRS);
  const x = new Float32Array(MAX_PAIRS);
  const low = new Float32Array(MAX_PAIRS); // top of the bottom pipe
  const high = new Float32Array(MAX_PAIRS); // bottom of the top pipe

  const dummy = new THREE.Object3D();
  let untilNext = 0;
  let lastCenter = 7;
  let first = true;

  function spawn(px, d) {
    let i = 0;
    while (i < MAX_PAIRS && active[i]) i++;
    if (i === MAX_PAIRS) return;

    const gap = GAP_EASY + (GAP_HARD - GAP_EASY) * d;
    // The first gap stays close to where the bird hovers.
    const reach = first ? 1.2 : REACH_EASY + (REACH_HARD - REACH_EASY) * d;
    const min = FLOOR + gap / 2;
    const max = TOP - gap / 2;
    let center = lastCenter + (Math.random() * 2 - 1) * reach;
    // Bounce off the limits instead of clamping, so the gaps do not pile up at
    // the top or the bottom.
    if (center < min) center = Math.min(max, min + (min - center));
    if (center > max) center = Math.max(min, max - (center - max));
    lastCenter = center;
    first = false;

    active[i] = 1;
    scored[i] = 0;
    x[i] = px;
    low[i] = center - gap / 2;
    high[i] = center + gap / 2;
  }

  function draw() {
    let n = 0;
    let s = 0;
    for (let i = 0; i < MAX_PAIRS; i++) {
      if (!active[i]) continue;
      dummy.position.set(x[i], low[i], 0);
      dummy.rotation.z = 0;
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
      dummy.position.set(x[i], high[i], 0);
      dummy.rotation.z = Math.PI;
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
      // The sun is up and to the left, so the shadow leans right and back.
      dummy.position.set(x[i] + 0.45, 0.02, -0.35);
      dummy.rotation.z = 0;
      dummy.updateMatrix();
      shadows.setMatrixAt(s++, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    shadows.count = s;
    shadows.instanceMatrix.needsUpdate = true;
  }

  return {
    clear() {
      active.fill(0);
      draw();
    },

    // A new run: no pipes yet, the first one appears right away off-screen.
    reset() {
      active.fill(0);
      untilNext = 0;
      lastCenter = 7;
      first = true;
      draw();
    },

    // Scrolls the pipes left by `move` units and spawns new pairs.
    update(move, d) {
      for (let i = 0; i < MAX_PAIRS; i++) {
        if (!active[i]) continue;
        x[i] -= move;
        if (x[i] < despawnX) active[i] = 0;
      }
      untilNext -= move;
      if (untilNext <= 0) {
        // Spawned late by -untilNext units, so it has already moved that far.
        spawn(spawnX + untilNext, d);
        untilNext += SPACING_EASY + (SPACING_HARD - SPACING_EASY) * d;
      }
      draw();
    },

    // Counts the pairs whose middle just went past the bird. Writes the gap
    // center of the last one into out.y, for the sparkles.
    passed(birdX, out) {
      let n = 0;
      for (let i = 0; i < MAX_PAIRS; i++) {
        if (!active[i] || scored[i] || x[i] > birdX) continue;
        scored[i] = 1;
        out.y = (low[i] + high[i]) / 2;
        n++;
      }
      return n;
    },

    // True if a circle at (bx, by) with radius r touches any pipe.
    hits(bx, by, r) {
      for (let i = 0; i < MAX_PAIRS; i++) {
        if (!active[i]) continue;
        const dx = Math.max(0, Math.abs(bx - x[i]) - PIPE_HALF_W);
        if (dx >= r) continue;
        // Distance from the circle to the bottom pipe, then to the top pipe.
        const below = Math.max(0, by - low[i]);
        const above = Math.max(0, high[i] - by);
        if (dx * dx + below * below < r * r) return true;
        if (dx * dx + above * above < r * r) return true;
      }
      return false;
    },
  };
}
