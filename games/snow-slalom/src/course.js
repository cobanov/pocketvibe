// The race course: gates, pines, rocks, fences, moguls and kickers,
// generated one gate-to-gate segment at a time ahead of the skier and
// recycled behind. Every kind of object is one InstancedMesh.

import * as THREE from 'three';
import { PISTE, SLOPE_ANGLE, clamp, lerp, rand, randInt, slopeY } from './shared.js';
import {
  FENCE_HALF,
  RAMP_H,
  RAMP_HALF,
  RAMP_LEN,
  fenceGeometry,
  flagGeometry,
  mogulGeometry,
  pineGeometry,
  quadGeometry,
  rampGeometry,
  rockGeometry,
} from './models.js';

export const TREE = 0;
export const ROCK = 1;
export const FENCE = 2;
export const MOGUL = 3;
export const RAMP = 4;
const KINDS = 5;

// Gate states.
export const PENDING = 0;
export const PASSED = 1;
export const MISSED = 2;
export const SKIPPED = 3; // crossed while tumbling: no strike

const GATES = 12;
const MAX_OBS = 160;
const AHEAD = 125; // the course is built this far below the skier
const BEHIND = 16; // and dropped once it is this far behind
const MAX_PER_KIND = [70, 40, 16, 50, 6];
const MOGUL_RX = 1.2;
const MOGUL_RZ = 1.4;
const MOGUL_H = 0.45;

const RED = new THREE.Color(0xe8323c);
const BLUE = new THREE.Color(0x2f6fe0);
const GREY = new THREE.Color(0xa3aebd);
// A lighter red and blue for the dye line on the snow.
const RED_DYE = new THREE.Color(0xff5c66);
const BLUE_DYE = new THREE.Color(0x4f8cff);

// How hard the course is after `dist` units of descent: 0 for the first
// stretch, then a slow climb to 1 over about three kilometres.
export function difficulty(dist) {
  return clamp((dist - 120) / 2900, 0, 1);
}

function makeGate() {
  return { z: 0, x: 0, half: 3, color: 0, state: PENDING, t: 0, wobL: 0, wobR: 0 };
}

function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false; // the course is rebuilt as it moves, cached bounds would be wrong
  mesh.count = 0;
  return mesh;
}

export function createCourse(scene) {
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const meshes = [
    instanced(pineGeometry(), lambert, MAX_PER_KIND[TREE]),
    instanced(rockGeometry(), lambert, MAX_PER_KIND[ROCK]),
    instanced(fenceGeometry(), lambert, MAX_PER_KIND[FENCE]),
    instanced(mogulGeometry(), lambert, MAX_PER_KIND[MOGUL]),
    instanced(rampGeometry(), lambert, MAX_PER_KIND[RAMP]),
  ];
  for (let k = 0; k < KINDS; k++) scene.add(meshes[k]);

  const flags = instanced(flagGeometry(), lambert, GATES * 2);
  flags.setColorAt(0, RED); // creates instanceColor up front
  scene.add(flags);
  // A band of dye on the snow between the two flags, as on a real race
  // course: on a small screen it says "through here" better than the poles.
  const lines = instanced(
    quadGeometry(),
    new THREE.MeshBasicMaterial({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    GATES,
  );
  lines.setColorAt(0, RED);
  scene.add(lines);

  const gates = [];
  for (let i = 0; i < GATES; i++) gates.push(makeGate());
  let first = 0; // absolute index of the oldest gate kept
  let last = 0; // one past the newest gate
  let next = 0; // the next gate the skier has to pass

  // Obstacles as parallel arrays.
  const kind = new Uint8Array(MAX_OBS);
  const ox = new Float32Array(MAX_OBS);
  const oz = new Float32Array(MAX_OBS);
  const os = new Float32Array(MAX_OBS);
  const orot = new Float32Array(MAX_OBS);
  const alive = new Uint8Array(MAX_OBS);
  const wob = new Float32Array(MAX_OBS); // a pine shaking after a hit
  const live = new Int32Array(KINDS); // alive obstacles per kind
  let dirty = true;
  let shaking = 0;

  // Generator state.
  let startZ = 0;
  let genZ = 0;
  let genX = 0;
  let side = 1;
  let color = 0;
  let phase = 0;
  let sinceRamp = 0;
  let level = 0; // fixed difficulty for the title demo, -1 in a real run
  let segX0 = 0; // the gate-to-gate line being filled
  let segZ0 = 0;
  let segX1 = 0;
  let segZ1 = 0;
  let time = 0;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const counts = new Int32Array(KINDS);

  function slotFree() {
    for (let i = 0; i < MAX_OBS; i++) if (!alive[i]) return i;
    return -1;
  }

  function add(k, x, z, s, rot) {
    if (live[k] >= MAX_PER_KIND[k]) return -1;
    const i = slotFree();
    if (i < 0) return -1;
    live[k]++;
    kind[i] = k;
    ox[i] = x;
    oz[i] = z;
    os[i] = s;
    orot[i] = rot;
    wob[i] = 0;
    alive[i] = 1;
    dirty = true;
    return i;
  }

  // True when (x, z) keeps `gap` clear of every obstacle already placed.
  function roomAt(x, z, gap) {
    for (let i = 0; i < MAX_OBS; i++) {
      if (!alive[i] || Math.abs(oz[i] - z) > gap + 2) continue;
      const dx = ox[i] - x;
      const dz = oz[i] - z;
      if (dx * dx + dz * dz < gap * gap) return false;
    }
    return true;
  }

  // x of the straight line between the two gates of the segment being filled.
  function lineX(z) {
    return segX0 + ((segX1 - segX0) * (segZ0 - z)) / (segZ0 - segZ1);
  }

  // Scatters obstacles between two gates, keeping a corridor along the line
  // from gate to gate free so there is always a way through.
  function fillSegment(x0, z0, x1, z1, d, dist) {
    segX0 = x0;
    segZ0 = z0;
    segX1 = x1;
    segZ1 = z1;
    const len = z0 - z1;
    const clear = lerp(3.2, 1.8, d);

    let ramp = false;
    if (dist > 200 && sinceRamp >= 5 && len > 18 && Math.random() < 0.3) {
      const z = z0 - len * 0.5;
      add(RAMP, lineX(z), z, 1, 0);
      ramp = true;
      sinceRamp = 0;
    } else {
      sinceRamp++;
    }

    if (!ramp && dist > 450 && Math.random() < 0.12 + 0.38 * d) {
      const cz = z0 - len * rand(0.4, 0.6);
      const cx = clamp(lineX(cz) + rand(-2, 2), -PISTE + 3, PISTE - 3);
      const n = 3 + Math.round(4 * d);
      for (let k = 0; k < n; k++) {
        const z = cz + rand(-len * 0.25, len * 0.25);
        const x = cx + rand(-4.5, 4.5);
        if (z > z0 - 3.5 || z < z1 + 3.5 || !roomAt(x, z, 2.4)) continue;
        add(MOGUL, x, z, rand(0.85, 1.15), 0);
      }
    }

    const trees = dist < 70 ? 0 : Math.random() < 0.7 + 0.3 * d ? randInt(1, 2 + Math.round(3 * d)) : 0;
    const rocks = dist < 160 ? 0 : randInt(0, Math.round(1 + 2 * d));
    const fences = dist > 320 && Math.random() < 0.1 + 0.32 * d ? 1 : 0;
    // Now and then a little clump of pines just inside the piste edge.
    if (dist > 40 && Math.random() < 0.45) {
      const sx = Math.random() < 0.5 ? -1 : 1;
      const cz = z0 - rand(4, len - 4);
      for (let k = 0; k < 3; k++) {
        const x = sx * rand(PISTE - 2.6, PISTE - 0.4);
        const z = cz + rand(-2.5, 2.5);
        if (Math.abs(x - lineX(z)) > clear + 1.4 && roomAt(x, z, 1.5)) add(TREE, x, z, rand(0.75, 1.3), 0);
      }
    }
    for (let n = 0; n < trees + rocks + fences; n++) {
      const k = n < trees ? TREE : n < trees + rocks ? ROCK : FENCE;
      const s = k === TREE ? rand(0.8, 1.35) : k === ROCK ? rand(0.7, 1.25) : 1;
      const r = k === TREE ? 1.1 * s : k === ROCK ? 1.0 * s : FENCE_HALF + 0.3;
      for (let tries = 0; tries < 8; tries++) {
        const z = z0 - rand(3.5, len - 3.5);
        // Half the pines crowd the piste edges, framing the course.
        const x =
          k === TREE && Math.random() < 0.5
            ? (Math.random() < 0.5 ? -1 : 1) * rand(PISTE - 3.2, PISTE - 0.6)
            : rand(-PISTE + 1.2, PISTE - 1.2);
        if (Math.abs(x - lineX(z)) < clear + r) continue;
        if (Math.abs(x) + (k === FENCE ? FENCE_HALF : 0) > PISTE - 0.4) continue;
        if (!roomAt(x, z, r + 1.2)) continue;
        add(k, x, z, s, rand(0, Math.PI * 2));
        break;
      }
    }
  }

  function addGate() {
    const dist = startZ - genZ;
    const d = level >= 0 ? level : difficulty(dist);
    const gap = last === 0 ? 30 : lerp(26, 18, d) + rand(-1.5, 1.5);
    const z = genZ - gap;
    side = -side;
    const center = 5 * Math.sin((startZ - z) * 0.009 + phase);
    const amp = lerp(2.4, 5, d) * rand(0.8, 1.15);
    const half = lerp(3.3, 2, d) + rand(0, 0.3);
    const lim = PISTE - 2 - half;
    const x = last === 0 ? 0 : clamp(center + side * amp, -lim, lim);
    const g = gates[last % GATES];
    g.z = z;
    g.x = x;
    g.half = half;
    g.color = color;
    g.state = PENDING;
    g.t = 0;
    g.wobL = 0;
    g.wobR = 0;
    color ^= 1;
    if (last > 0) fillSegment(genX, genZ, x, z, d, dist);
    genX = x;
    genZ = z;
    last++;
  }

  function writeStatics() {
    counts.fill(0);
    shaking = 0;
    for (let i = 0; i < MAX_OBS; i++) {
      if (!alive[i]) continue;
      const k = kind[i];
      const s = os[i];
      dummy.position.set(ox[i], slopeY(oz[i]), oz[i]);
      if (k === TREE) {
        const w = wob[i];
        if (w > 0) shaking++;
        dummy.rotation.set(Math.sin(w * 40) * 0.12 * w, 0, Math.sin(w * 31) * 0.12 * w);
        dummy.scale.set(s, s * 1.1, s);
      } else if (k === ROCK) {
        dummy.rotation.set(-SLOPE_ANGLE, orot[i], 0);
        dummy.scale.setScalar(s);
      } else if (k === MOGUL) {
        dummy.rotation.set(-SLOPE_ANGLE, 0, 0);
        dummy.scale.set(MOGUL_RX * s, MOGUL_H * s, MOGUL_RZ * s);
      } else {
        dummy.rotation.set(-SLOPE_ANGLE, 0, 0);
        dummy.scale.setScalar(1);
      }
      dummy.updateMatrix();
      meshes[k].setMatrixAt(counts[k]++, dummy.matrix);
    }
    for (let k = 0; k < KINDS; k++) {
      meshes[k].count = counts[k];
      meshes[k].instanceMatrix.needsUpdate = true;
    }
    dirty = false;
  }

  // One flag of gate g: side -1 left (panel out to the left), 1 right.
  function writeFlag(n, g, s, wobble, gi) {
    const x = g.x + s * g.half;
    dummy.position.set(x, slopeY(g.z), g.z);
    // The panel points out along the model's +x, so a negative z turn
    // tips either flag outwards: a missed gate droops open.
    let lean = Math.sin(wobble * 26) * 0.45 * wobble;
    let scale = 1;
    if (g.state === MISSED) lean -= 0.55 * Math.min(1, g.t * 4);
    if (g.state === PASSED && g.t < 0.35) scale = 1 + 0.3 * Math.sin((g.t / 0.35) * Math.PI);
    if (g.state === PENDING && gi === next) scale = 1 + 0.06 * Math.sin(time * 9);
    const flutter = Math.sin(time * 7 + gi * 1.3 + s) * 0.18;
    dummy.rotation.set(0, (s < 0 ? Math.PI : 0) + flutter, lean);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    flags.setMatrixAt(n, dummy.matrix);
    if (g.state === MISSED || g.state === SKIPPED) tint.copy(GREY);
    else tint.copy(g.color ? BLUE : RED);
    flags.setColorAt(n, tint);
  }

  function writeGates() {
    let n = 0;
    let nl = 0;
    for (let gi = first; gi < last; gi++) {
      const g = gates[gi % GATES];
      writeFlag(n++, g, -1, g.wobL, gi);
      writeFlag(n++, g, 1, g.wobR, gi);
      if (g.state === PENDING) {
        dummy.position.set(g.x, slopeY(g.z) + 0.03, g.z);
        dummy.rotation.set(-SLOPE_ANGLE, 0, 0);
        dummy.scale.set(g.half * 2, 1, 0.7);
        dummy.updateMatrix();
        lines.setMatrixAt(nl, dummy.matrix);
        lines.setColorAt(nl, g.color ? BLUE_DYE : RED_DYE);
        nl++;
      }
    }
    flags.count = n;
    flags.instanceMatrix.needsUpdate = true;
    flags.instanceColor.needsUpdate = true;
    lines.count = nl;
    lines.instanceMatrix.needsUpdate = true;
    lines.instanceColor.needsUpdate = true;
  }

  const course = {
    // Set by surface(): true while the snow under the skier is a kicker.
    onRamp: false,
    // Set by surface(): true while it is a mogul.
    onMogul: false,
    hitKind: TREE,

    // A fresh course starting at z. demoLevel >= 0 fixes the difficulty
    // (the title demo); -1 ramps it up with distance.
    reset(z, demoLevel) {
      alive.fill(0);
      live.fill(0);
      first = 0;
      last = 0;
      next = 0;
      startZ = z;
      genZ = z;
      genX = 0;
      side = Math.random() < 0.5 ? 1 : -1;
      color = 0;
      phase = rand(0, Math.PI * 2);
      sinceRamp = 3;
      level = demoLevel;
      dirty = true;
      course.update(0, z);
    },

    update(dt, z) {
      time += dt;
      // Drop what is behind, build what is ahead.
      while (first < last && gates[first % GATES].z > z + BEHIND) {
        if (next === first) next++;
        first++;
      }
      while (last - first < GATES && genZ > z - AHEAD) addGate();
      for (let i = 0; i < MAX_OBS; i++) {
        if (alive[i] && oz[i] > z + BEHIND) {
          alive[i] = 0;
          live[kind[i]]--;
          dirty = true;
        }
      }
      for (let gi = first; gi < last; gi++) {
        const g = gates[gi % GATES];
        g.t += dt;
        g.wobL = Math.max(0, g.wobL - dt * 1.6);
        g.wobR = Math.max(0, g.wobR - dt * 1.6);
      }
      if (shaking > 0) {
        for (let i = 0; i < MAX_OBS; i++) if (wob[i] > 0) wob[i] = Math.max(0, wob[i] - dt * 1.5);
        dirty = true;
      }
      if (dirty) writeStatics();
      writeGates();
    },

    // The next gate to pass, or null.
    get nextGate() {
      return next < last ? gates[next % GATES] : null;
    },

    // The gate after the next one, or null.
    get gateAfter() {
      return next + 1 < last ? gates[(next + 1) % GATES] : null;
    },

    // Settles the next gate as PASSED, MISSED or SKIPPED; a pole the skier
    // brushed past wobbles.
    settle(state, x) {
      const g = gates[next % GATES];
      g.state = state;
      g.t = 0;
      if (Math.abs(x - (g.x - g.half)) < 1.1) g.wobL = 1;
      if (Math.abs(x - (g.x + g.half)) < 1.1) g.wobR = 1;
      if (state === PASSED) {
        g.wobL = Math.max(g.wobL, 0.35);
        g.wobR = Math.max(g.wobR, 0.35);
      }
      next++;
    },

    // Local snow height under (x, z) from moguls and kickers; also sets
    // onRamp and onMogul.
    surface(x, z) {
      course.onRamp = false;
      course.onMogul = false;
      let h = 0;
      for (let i = 0; i < MAX_OBS; i++) {
        if (!alive[i] || Math.abs(oz[i] - z) > 3) continue;
        const k = kind[i];
        if (k === MOGUL) {
          const s = os[i];
          const qx = (x - ox[i]) / (MOGUL_RX * s);
          const qz = (z - oz[i]) / (MOGUL_RZ * s);
          const q = qx * qx + qz * qz;
          if (q < 1) {
            const r = Math.sqrt(q);
            const m = MOGUL_H * s * 0.5 * (1 + Math.cos(Math.PI * r));
            if (m > h) {
              h = m;
              course.onMogul = true;
            }
          }
        } else if (k === RAMP) {
          const back = oz[i] + RAMP_LEN / 2;
          if (Math.abs(x - ox[i]) < RAMP_HALF && z < back && z > back - RAMP_LEN) {
            const r = (RAMP_H * (back - z)) / RAMP_LEN;
            if (r > h) {
              h = r;
              course.onRamp = true;
              course.onMogul = false;
            }
          }
        }
      }
      return h;
    },

    // Index of an obstacle the skier at (x, z), y above the snow, runs into,
    // or -1. hitKind tells what it was.
    hit(x, z, y) {
      for (let i = 0; i < MAX_OBS; i++) {
        if (!alive[i] || Math.abs(oz[i] - z) > 2.5) continue;
        const k = kind[i];
        const dx = x - ox[i];
        const dz = z - oz[i];
        const s = os[i];
        let hit = false;
        if (k === TREE) {
          const r = 0.5 * s + 0.28;
          hit = y < 2.4 * s && dx * dx + dz * dz < r * r;
        } else if (k === ROCK) {
          const r = 0.8 * s + 0.26;
          hit = y < 0.75 * s && dx * dx + dz * dz < r * r;
        } else if (k === FENCE) {
          hit = y < 1.0 && Math.abs(dx) < FENCE_HALF + 0.25 && Math.abs(dz) < 0.4;
        }
        if (hit) {
          course.hitKind = k;
          if (k === TREE) {
            wob[i] = 1;
            shaking++;
          }
          return i;
        }
      }
      return -1;
    },

    obstacleX(i) {
      return ox[i];
    },

    // Which way the demo skier should steer to miss the first pine, rock or
    // fence on its line (x moving `dx` per unit downhill) within `range`:
    // -1 left, 1 right, 0 when the way is clear. It goes round on the side
    // of `tx` (where it wants to be) unless it is already committed.
    avoid(x, z, dx, range, tx) {
      let nearest = range;
      let dir = 0;
      for (let i = 0; i < MAX_OBS; i++) {
        if (!alive[i]) continue;
        const k = kind[i];
        if (k === MOGUL || k === RAMP) continue;
        const ahead = z - oz[i];
        if (ahead < 0 || ahead > nearest) continue;
        const miss = x + dx * ahead - ox[i];
        const r = k === FENCE ? FENCE_HALF + 0.7 : 0.9 * os[i] + 0.6;
        if (Math.abs(miss) > r) continue;
        nearest = ahead;
        if (Math.abs(miss) > r * 0.5) dir = miss > 0 ? 1 : -1;
        else dir = tx > ox[i] ? 1 : -1;
        if (Math.abs(ox[i]) > PISTE - 4) dir = ox[i] > 0 ? -1 : 1; // never towards the trees
      }
      return dir;
    },
  };

  return course;
}
