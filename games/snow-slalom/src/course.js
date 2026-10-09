// The race course: gates, pines, rocks, fences, moguls, kickers, sheets of
// ice and bonus flags, generated one gate-to-gate segment at a time ahead
// of the skier and dropped once they are behind the camera. Every kind of
// object is one InstancedMesh, which draws only the objects in view. The
// time trial's course comes from a fixed seed, so it is the same every run,
// and ends at a finish line.

import * as THREE from 'three';
import { PISTE, SLOPE_ANGLE, clamp, lerp, seededRandom, slopeY } from './shared.js';
import {
  FENCE_HALF,
  RAMP_H,
  RAMP_HALF,
  RAMP_LEN,
  bonusFlagGeometry,
  fenceGeometry,
  finishGeometry,
  flagGeometry,
  iceGeometry,
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
export const ICE = 5;
export const BONUS = 6;
const KINDS = 7;

// Gate states.
export const PENDING = 0;
export const PASSED = 1;
export const MISSED = 2;
export const SKIPPED = 3; // crossed while tumbling: no strike

const GATES = 10;
const MAX_OBS = 150;
// Gates are built until one is this far below the skier: about where the
// fog swallows everything, so nothing is drawn that cannot be seen.
const AHEAD = 84;
const BEHIND = 3; // what is this far behind the camera is dropped
const MAX_PER_KIND = [56, 30, 12, 40, 4, 5, 5];
const MOGUL_RX = 1.2;
const MOGUL_RZ = 1.4;
const MOGUL_H = 0.45;
const ICE_FROM = 260; // no ice in the first stretch
export const ICE_STRETCH = 1.7; // a sheet of ice is this much longer than wide
const BONUS_REACH = 1.15; // pass this close to a bonus flag to take it
const FINISH_AFTER = 26; // the finish line is this far below the last gate
// From the easiest course to the hardest: gates closer together, further
// to the side of each other and narrower.
const GAP_EASY = 26;
const GAP_HARD = 20;
const AMP_EASY = 2.4;
const AMP_HARD = 4.4;
const HALF_EASY = 3.3;
const HALF_HARD = 2.1;

// The time trial gets harder from TRIAL_EASY to TRIAL_HARD over its first
// TRIAL_RAMP units.
const TRIAL_EASY = 0.15;
const TRIAL_HARD = 0.8;
const TRIAL_RAMP = 760;

// Bounding spheres by kind (center height, radius), for scale 1.
const BOUNDS = [
  [1.6, 1.9], // pine
  [0.4, 1.4], // rock
  [0.5, 2.1], // fence
  [0.2, 1.5], // mogul
  [0.5, 2.8], // kicker
  [0, 1], // ice: its radius is its length
  [1.1, 1.2], // bonus flag
];

const RED = new THREE.Color(0xe8323c);
const BLUE = new THREE.Color(0x2f6fe0);
const GREY = new THREE.Color(0xa3aebd);
// A lighter red and blue for the dye line on the snow.
const RED_DYE = new THREE.Color(0xff5c66);
const BLUE_DYE = new THREE.Color(0x4f8cff);

// How hard the endless course is after `dist` units of descent: 0 for the
// first stretch, then a slow climb to 1 over about three kilometres.
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
  // Ice lies flat on the snow: pushed towards the camera so it never flickers.
  const iceMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const meshes = [
    instanced(pineGeometry(), lambert, MAX_PER_KIND[TREE]),
    instanced(rockGeometry(), lambert, MAX_PER_KIND[ROCK]),
    instanced(fenceGeometry(), lambert, MAX_PER_KIND[FENCE]),
    instanced(mogulGeometry(), lambert, MAX_PER_KIND[MOGUL]),
    instanced(rampGeometry(), lambert, MAX_PER_KIND[RAMP]),
    instanced(iceGeometry(), iceMaterial, MAX_PER_KIND[ICE]),
    instanced(bonusFlagGeometry(), lambert, MAX_PER_KIND[BONUS]),
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

  const finish = new THREE.Mesh(finishGeometry(PISTE), lambert);
  finish.visible = false;
  scene.add(finish);

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
  const mats = new Float32Array(MAX_OBS * 16); // each one's instance matrix
  const cy = new Float32Array(MAX_OBS); // the center of its bounding sphere above the snow...
  const cr = new Float32Array(MAX_OBS); // ...and the sphere's radius
  const live = new Int32Array(KINDS); // alive obstacles per kind
  let dirty = true;
  let shaking = 0;

  // Generator state. The course has its own random numbers, so the time
  // trial's seed gives the same course whatever else uses Math.random.
  let random = Math.random;
  const rnd = (lo, hi) => lo + random() * (hi - lo);
  const rndInt = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  let startZ = 0;
  let genZ = 0;
  let genX = 0;
  let side = 1;
  let color = 0;
  let phase = 0;
  let sinceRamp = 0;
  let level = 0; // fixed difficulty for the title demo, -1 otherwise
  let trialGates = 0; // gates in the time trial, 0 for an endless course
  let bonusFlags = false;
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
    const b = BOUNDS[k];
    cy[i] = b[0] * (k === ICE ? 0 : s);
    cr[i] = b[1] * (k === ICE ? s * ICE_STRETCH : s);
    return i;
  }

  function remove(i) {
    alive[i] = 0;
    live[kind[i]]--;
    dirty = true;
  }

  // True when (x, z) keeps `gap` clear of every obstacle already placed (and
  // of the whole of a sheet of ice).
  function roomAt(x, z, gap) {
    for (let i = 0; i < MAX_OBS; i++) {
      if (!alive[i]) continue;
      const g = kind[i] === ICE ? gap + os[i] * ICE_STRETCH : gap;
      if (Math.abs(oz[i] - z) > g + 2) continue;
      const dx = ox[i] - x;
      const dz = oz[i] - z;
      if (dx * dx + dz * dz < g * g) return false;
    }
    return true;
  }

  // x of the straight line between the two gates of the segment being filled.
  function lineX(z) {
    return segX0 + ((segX1 - segX0) * (segZ0 - z)) / (segZ0 - segZ1);
  }

  function levelAt(dist) {
    if (level >= 0) return level;
    if (trialGates > 0) return lerp(TRIAL_EASY, TRIAL_HARD, clamp(dist / TRIAL_RAMP, 0, 1));
    return difficulty(dist);
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

    // One feature on the line at most: a kicker, a sheet of ice (the skis
    // barely turn on it, so the line has to be set before it) or a field
    // of moguls.
    let feature = false;
    if (dist > 200 && sinceRamp >= 5 && len > 18 && random() < 0.3) {
      const z = z0 - len * 0.5;
      add(RAMP, lineX(z), z, 1, 0);
      feature = true;
      sinceRamp = 0;
    } else {
      sinceRamp++;
    }

    if (!feature && dist > ICE_FROM && random() < 0.1 + 0.2 * d) {
      const z = z0 - len * rnd(0.4, 0.6);
      const w = rnd(2.2, 3.1);
      const x = clamp(lineX(z) + rnd(-1.2, 1.2), -PISTE + w + 1, PISTE - w - 1);
      feature = add(ICE, x, z, w, 0) >= 0;
    }

    if (!feature && dist > 450 && random() < 0.12 + 0.38 * d) {
      const cz = z0 - len * rnd(0.4, 0.6);
      const cx = clamp(lineX(cz) + rnd(-2, 2), -PISTE + 3, PISTE - 3);
      const n = 3 + Math.round(4 * d);
      for (let k = 0; k < n; k++) {
        const z = cz + rnd(-len * 0.25, len * 0.25);
        const x = cx + rnd(-4.5, 4.5);
        if (z > z0 - 3.5 || z < z1 + 3.5 || !roomAt(x, z, 2.4)) continue;
        add(MOGUL, x, z, rnd(0.85, 1.15), 0);
      }
    }

    const trees = dist < 70 ? 0 : random() < 0.7 + 0.3 * d ? rndInt(1, 2 + Math.round(3 * d)) : 0;
    const rocks = dist < 160 ? 0 : rndInt(0, Math.round(1 + 2 * d));
    const fences = dist > 320 && random() < 0.1 + 0.32 * d ? 1 : 0;
    // Now and then a little clump of pines just inside the piste edge.
    if (dist > 40 && random() < 0.45) {
      const sx = random() < 0.5 ? -1 : 1;
      const cz = z0 - rnd(4, len - 4);
      for (let k = 0; k < 3; k++) {
        const x = sx * rnd(PISTE - 2.6, PISTE - 0.4);
        const z = cz + rnd(-2.5, 2.5);
        if (Math.abs(x - lineX(z)) > clear + 1.4 && roomAt(x, z, 1.5)) add(TREE, x, z, rnd(0.75, 1.3), 0);
      }
    }
    for (let n = 0; n < trees + rocks + fences; n++) {
      const k = n < trees ? TREE : n < trees + rocks ? ROCK : FENCE;
      const s = k === TREE ? rnd(0.8, 1.35) : k === ROCK ? rnd(0.7, 1.25) : 1;
      const r = k === TREE ? 1.1 * s : k === ROCK ? 1.0 * s : FENCE_HALF + 0.3;
      for (let tries = 0; tries < 8; tries++) {
        const z = z0 - rnd(3.5, len - 3.5);
        // Half the pines crowd the piste edges, framing the course.
        const x =
          k === TREE && random() < 0.5
            ? (random() < 0.5 ? -1 : 1) * rnd(PISTE - 3.2, PISTE - 0.6)
            : rnd(-PISTE + 1.2, PISTE - 1.2);
        if (Math.abs(x - lineX(z)) < clear + r) continue;
        if (Math.abs(x) + (k === FENCE ? FENCE_HALF : 0) > PISTE - 0.4) continue;
        if (!roomAt(x, z, r + 1.2)) continue;
        add(k, x, z, s, rnd(0, Math.PI * 2));
        break;
      }
    }

    // A gold bonus flag off the line: worth the detour if the next gate
    // still fits.
    if (bonusFlags && dist > 150 && random() < 0.25) {
      for (let tries = 0; tries < 6; tries++) {
        const z = z0 - len * rnd(0.3, 0.7);
        const x = lineX(z) + (random() < 0.5 ? -1 : 1) * rnd(3.2, 5.5);
        if (Math.abs(x) > PISTE - 2.5 || !roomAt(x, z, 2.2)) continue;
        add(BONUS, x, z, 1, rnd(0, Math.PI * 2));
        break;
      }
    }
  }

  function addGate() {
    const dist = startZ - genZ;
    const d = levelAt(dist);
    const gap = last === 0 ? 30 : lerp(GAP_EASY, GAP_HARD, d) + rnd(-1.5, 1.5);
    const z = genZ - gap;
    side = -side;
    const center = 5 * Math.sin((startZ - z) * 0.009 + phase);
    const amp = lerp(AMP_EASY, AMP_HARD, d) * rnd(0.8, 1.15);
    const half = lerp(HALF_EASY, HALF_HARD, d) + rnd(0, 0.3);
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
    if (last === trialGates) {
      course.finishZ = z - FINISH_AFTER;
      finish.position.set(0, slopeY(course.finishZ), course.finishZ);
      finish.visible = true;
    }
  }

  // Works out the instance matrix of every obstacle that does not move;
  // cull() copies those in view into the instanced meshes.
  function writeStatics() {
    shaking = 0;
    for (let i = 0; i < MAX_OBS; i++) {
      if (!alive[i]) continue;
      const k = kind[i];
      if (k === BONUS) continue; // they turn: worked out in cull()
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
      } else if (k === ICE) {
        dummy.rotation.set(-SLOPE_ANGLE, 0, 0);
        dummy.scale.set(s, 1, s * ICE_STRETCH);
      } else {
        dummy.rotation.set(-SLOPE_ANGLE, 0, 0);
        dummy.scale.setScalar(1);
      }
      dummy.updateMatrix();
      dummy.matrix.toArray(mats, i * 16);
    }
    dirty = false;
  }

  // Draws the obstacles in view (see createView). Bonus flags turn on their
  // poles and bob a little.
  function cull(view) {
    counts.fill(0);
    for (let i = 0; i < MAX_OBS; i++) {
      if (!alive[i]) continue;
      const k = kind[i];
      const y = slopeY(oz[i]);
      if (!view.sees(ox[i], y + cy[i], oz[i], cr[i])) continue;
      const mesh = meshes[k];
      if (k === BONUS) {
        dummy.position.set(ox[i], y + 0.08 * Math.sin(time * 3 + orot[i]), oz[i]);
        dummy.rotation.set(0, orot[i] + time * 1.8, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(counts[k]++, dummy.matrix);
        continue;
      }
      const to = mesh.instanceMatrix.array;
      const o = counts[k]++ * 16;
      const from = i * 16;
      for (let e = 0; e < 16; e++) to[o + e] = mats[from + e];
    }
    for (let k = 0; k < KINDS; k++) {
      meshes[k].count = counts[k];
      if (counts[k] > 0) meshes[k].instanceMatrix.needsUpdate = true;
    }
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
    // Set by surface(): what the snow under the skier is.
    onRamp: false,
    onMogul: false,
    onIce: false,
    hitKind: TREE,
    // Where the time trial ends (NaN on an endless course).
    finishZ: NaN,
    // Set by settle(): how far the skier passed from the nearer pole.
    poleGap: 9,
    // Set by collect(): where the bonus flag taken was.
    bonusX: 0,
    bonusZ: 0,

    // A fresh course starting at z. Options: level (a fixed difficulty, for
    // the title demo), trial (the number of gates of a fixed course that
    // ends at a finish line), seed (its random numbers), bonus (gold flags).
    reset(z, { level: fixed = -1, trial = 0, seed = 0, bonus = false } = {}) {
      alive.fill(0);
      live.fill(0);
      first = 0;
      last = 0;
      next = 0;
      random = trial > 0 ? seededRandom(seed) : Math.random;
      startZ = z;
      genZ = z;
      genX = 0;
      side = random() < 0.5 ? 1 : -1;
      color = 0;
      phase = rnd(0, Math.PI * 2);
      sinceRamp = 3;
      level = fixed;
      trialGates = trial;
      bonusFlags = bonus;
      course.finishZ = NaN;
      finish.visible = false;
      dirty = true;
      course.update(0, z, z);
    },

    // z is the skier's, camZ the camera's.
    update(dt, z, camZ) {
      time += dt;
      // Drop what is behind the camera, build what is ahead.
      while (first < last && gates[first % GATES].z > camZ + BEHIND) {
        if (next === first) next++;
        first++;
      }
      while ((trialGates === 0 || last < trialGates) && last - first < GATES && genZ > z - AHEAD) addGate();
      for (let i = 0; i < MAX_OBS; i++) {
        if (alive[i] && oz[i] > camZ + BEHIND) remove(i);
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

    cull,

    // How hard the course is `dist` units below its start.
    levelAt,

    // The next gate to pass, or null.
    get nextGate() {
      return next < last ? gates[next % GATES] : null;
    },

    // The gate after the next one, or null.
    get gateAfter() {
      return next + 1 < last ? gates[(next + 1) % GATES] : null;
    },

    // Settles the next gate as PASSED, MISSED or SKIPPED; x is where the
    // skier crossed its line. A pole the skier brushed past wobbles.
    settle(state, x) {
      const g = gates[next % GATES];
      g.state = state;
      g.t = 0;
      const gapL = Math.abs(x - (g.x - g.half));
      const gapR = Math.abs(x - (g.x + g.half));
      course.poleGap = Math.min(gapL, gapR);
      if (gapL < 1.1) g.wobL = 1;
      if (gapR < 1.1) g.wobR = 1;
      if (state === PASSED) {
        g.wobL = Math.max(g.wobL, 0.35);
        g.wobR = Math.max(g.wobR, 0.35);
      }
      next++;
    },

    // Local snow height under (x, z) from moguls and kickers; also sets
    // onRamp, onMogul and onIce.
    surface(x, z) {
      course.onRamp = false;
      course.onMogul = false;
      course.onIce = false;
      let h = 0;
      for (let i = 0; i < MAX_OBS; i++) {
        if (!alive[i] || Math.abs(oz[i] - z) > 6) continue;
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
        } else if (k === ICE) {
          const qx = (x - ox[i]) / os[i];
          const qz = (z - oz[i]) / (os[i] * ICE_STRETCH);
          if (qx * qx + qz * qz < 1) course.onIce = true;
        }
      }
      return h;
    },

    // Index of a pine, rock or fence the skier runs into on the way from
    // (x0, z0) to (x1, z1) this frame, y above the snow, or -1. hitKind
    // tells what it was. The whole move is checked, so a slow frame at full
    // speed cannot carry the skier through a fence.
    hit(x0, z0, x1, z1, y) {
      const mx = x1 - x0;
      const mz = z1 - z0;
      const len2 = mx * mx + mz * mz;
      for (let i = 0; i < MAX_OBS; i++) {
        if (!alive[i]) continue;
        const k = kind[i];
        if (k > FENCE || oz[i] > z0 + 2.5 || oz[i] < z1 - 2.5) continue;
        const s = os[i];
        let hit = false;
        if (k === FENCE) {
          // Where the move crosses the net's line, or where it ends if it
          // does not cross it.
          let x = x1;
          let dz = z1 - oz[i];
          if ((z0 - oz[i]) * dz < 0) {
            x = x0 + (mx * (oz[i] - z0)) / mz;
            dz = 0;
          }
          hit = y < 1.0 && Math.abs(x - ox[i]) < FENCE_HALF + 0.25 && Math.abs(dz) < 0.4;
        } else {
          // The point of the move nearest the trunk or the boulder.
          const t = len2 > 0 ? clamp(((ox[i] - x0) * mx + (oz[i] - z0) * mz) / len2, 0, 1) : 0;
          const dx = x0 + mx * t - ox[i];
          const dz = z0 + mz * t - oz[i];
          const r = k === TREE ? 0.5 * s + 0.28 : 0.8 * s + 0.26;
          const h = k === TREE ? 2.4 * s : 0.75 * s;
          hit = y < h && dx * dx + dz * dz < r * r;
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

    // True when the move from (x0, z0) to (x1, z1) takes a bonus flag; it
    // is gone then, and bonusX, bonusZ say where it was.
    collect(x0, z0, x1, z1) {
      const mx = x1 - x0;
      const mz = z1 - z0;
      const len2 = mx * mx + mz * mz;
      for (let i = 0; i < MAX_OBS; i++) {
        if (!alive[i] || kind[i] !== BONUS || oz[i] > z0 + 2 || oz[i] < z1 - 2) continue;
        const t = len2 > 0 ? clamp(((ox[i] - x0) * mx + (oz[i] - z0) * mz) / len2, 0, 1) : 0;
        const dx = x0 + mx * t - ox[i];
        const dz = z0 + mz * t - oz[i];
        if (dx * dx + dz * dz > BONUS_REACH * BONUS_REACH) continue;
        course.bonusX = ox[i];
        course.bonusZ = oz[i];
        remove(i);
        return true;
      }
      return false;
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
        if (k > FENCE) continue;
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

    // One of everything in front of a camera at z, so the game can compile
    // its shaders and upload its geometry while loading.
    warmUp(z) {
      course.reset(z, { level: 0.5 });
      alive.fill(0);
      live.fill(0);
      const ahead = z - 14;
      for (let k = 0; k < KINDS; k++) add(k, (k - 3) * 3, ahead - (k % 2) * 4, 1, 0);
      finish.position.set(0, slopeY(ahead - 10), ahead - 10);
      finish.visible = true;
      writeStatics();
      writeGates();
    },
  };

  return course;
}
