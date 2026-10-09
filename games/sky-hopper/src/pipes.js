// Pipe pairs: a fixed pool drawn with one InstancedMesh (plus one for their
// shadows). Each pair has a bottom pipe and a top pipe with a gap between.
// Later in a run some gaps slowly bob up and down.

import * as THREE from 'three';
import { DESPAWN_X, SPAWN_X, keepFacing, lowPoly, merge, part } from './shared.js';

const MAX_PAIRS = 8;
const BODY_R = 0.82;
const CAP_R = 1.04;
const CAP_H = 0.75;
const LENGTH = 17; // long enough to reach past the ledge and the top of the screen

const FLOOR = 1.5; // lowest gap bottom above the ledge
const TOP = 12.6; // highest gap top

// Difficulty goes from 0 (first pipe) to 1 (see difficulty() in main.js).
const GAP_EASY = 4.8;
const GAP_HARD = 3.8;
const SPACING_EASY = 8.6; // world units between pairs
const SPACING_HARD = 7.8;
const REACH_FIRST = 1.2; // the first gap stays close to where the bird hovers
const REACH_EASY = 2.8; // how far a gap center may move from the last one
const REACH_HARD = 4;

// Moving gaps: they bob by up to MOVE_AMP around their center, one swing
// every MOVE_WAVE units the world scrolls (about 2.5 s), so they stop when the
// world does. Their gap is a little wider to make up for it.
const MOVE_AMP_EASY = 0.6;
const MOVE_AMP_HARD = 1.05;
const MOVE_WAVE = 14;
const MOVE_GAP = 0.35;

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

// Distance from (px, py) to the box x0..x1, y0..y1, squared.
function boxDistanceSq(px, py, x0, x1, y0, y1) {
  const dx = Math.max(0, x0 - px, px - x1);
  const dy = Math.max(0, y0 - py, py - y1);
  return dx * dx + dy * dy;
}

// sideRoom: how much further than on the 3:2 screen the view reaches to each
// side; pipes appear and are recycled that much further out. eye: where the
// camera stands, so the pipes can leave out the faces it never sees.
export function createPipes(scene, sideRoom, eye) {
  const spawnX = SPAWN_X + sideRoom;
  const despawnX = DESPAWN_X - sideRoom;

  // The camera in a pipe's own space, for pipes anywhere they can be: bottom
  // pipes as they are, top pipes turned upside down.
  const eyes = [];
  for (const x of [despawnX, spawnX]) {
    for (const y of [FLOOR, TOP]) {
      for (const dy of [-0.3, 0.3]) {
        eyes.push(new THREE.Vector3(eye.x - x, eye.y + dy - y, eye.z));
        eyes.push(new THREE.Vector3(x - eye.x, y - eye.y - dy, eye.z));
      }
    }
  }
  const full = pipeGeometry();
  const mesh = new THREE.InstancedMesh(keepFacing(full, eyes), lowPoly(), MAX_PAIRS * 2);
  full.dispose();
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
  const center = new Float32Array(MAX_PAIRS); // middle of the gap, before bobbing
  const half = new Float32Array(MAX_PAIRS); // half the gap
  const amp = new Float32Array(MAX_PAIRS); // how far the gap bobs (0: it stays)
  const phase = new Float32Array(MAX_PAIRS);
  const low = new Float32Array(MAX_PAIRS); // top of the bottom pipe, now
  const high = new Float32Array(MAX_PAIRS); // bottom of the top pipe, now

  const dummy = new THREE.Object3D();
  let untilNext = 0;
  let lastCenter = 7;
  let lastAmp = 0;
  let first = true;

  function place(i) {
    const offset = amp[i] * Math.sin(phase[i]);
    low[i] = center[i] + offset - half[i];
    high[i] = center[i] + offset + half[i];
  }

  // Spawns a pair at px. moveChance: how likely its gap bobs. Returns true
  // if it does.
  function spawn(px, d, moveChance) {
    let i = 0;
    while (i < MAX_PAIRS && active[i]) i++;
    if (i === MAX_PAIRS) return false;

    const bob = !first && Math.random() < moveChance ? MOVE_AMP_EASY + (MOVE_AMP_HARD - MOVE_AMP_EASY) * d : 0;
    const gap = GAP_EASY + (GAP_HARD - GAP_EASY) * d + (bob > 0 ? MOVE_GAP : 0);
    // After a bobbing gap the bird may leave it off center, so the next one
    // reaches a little less far.
    const reach = first ? REACH_FIRST : REACH_EASY + (REACH_HARD - REACH_EASY) * d - lastAmp * 0.6;
    const min = FLOOR + gap / 2 + bob;
    const max = TOP - gap / 2 - bob;
    let c = lastCenter + (Math.random() * 2 - 1) * reach;
    // Bounce off the limits instead of clamping, so the gaps do not pile up at
    // the top or the bottom.
    if (c < min) c = Math.min(max, min + (min - c));
    if (c > max) c = Math.max(min, max - (c - max));
    lastCenter = c;
    lastAmp = bob;
    first = false;

    active[i] = 1;
    scored[i] = 0;
    x[i] = px;
    center[i] = c;
    half[i] = gap / 2;
    amp[i] = bob;
    phase[i] = Math.random() * Math.PI * 2;
    place(i);
    return bob > 0;
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
      lastAmp = 0;
      first = true;
      draw();
    },

    // Puts one pair in view, so it is drawn (and its geometry uploaded) while
    // the game loads.
    warmUp(px) {
      this.reset();
      spawn(px, 0, 0);
      draw();
    },

    // Scrolls the pipes left by `move` units, bobs the moving gaps and spawns
    // new pairs. Returns true if the new pair's gap bobs.
    update(move, d, moveChance) {
      for (let i = 0; i < MAX_PAIRS; i++) {
        if (!active[i]) continue;
        x[i] -= move;
        if (x[i] < despawnX) active[i] = 0;
        else if (amp[i] > 0) {
          phase[i] += (move / MOVE_WAVE) * Math.PI * 2;
          place(i);
        }
      }
      untilNext -= move;
      let moving = false;
      if (untilNext <= 0) {
        // Spawned late by -untilNext units, so it has already moved that far.
        moving = spawn(spawnX + untilNext, d, moveChance);
        untilNext += SPACING_EASY + (SPACING_HARD - SPACING_EASY) * d;
      }
      draw();
      return moving;
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

    // True if a circle at (bx, by) with radius r touches any pipe: the wide
    // rims at the gap and the narrower bodies beyond them, as drawn.
    hits(bx, by, r) {
      const rr = r * r;
      for (let i = 0; i < MAX_PAIRS; i++) {
        if (!active[i] || Math.abs(bx - x[i]) >= CAP_R + r) continue;
        const px = x[i];
        if (boxDistanceSq(bx, by, px - CAP_R, px + CAP_R, low[i] - CAP_H, low[i]) < rr) return true;
        if (boxDistanceSq(bx, by, px - BODY_R, px + BODY_R, -Infinity, low[i] - CAP_H) < rr) return true;
        if (boxDistanceSq(bx, by, px - CAP_R, px + CAP_R, high[i], high[i] + CAP_H) < rr) return true;
        if (boxDistanceSq(bx, by, px - BODY_R, px + BODY_R, high[i] + CAP_H, Infinity) < rr) return true;
      }
      return false;
    },
  };
}
