// The world: a fixed pool of rows that is recycled as the camera moves
// forward. Each row is grass (trees, rocks, coins), road (cars and trucks),
// river (logs or lily pads), rail (a fast train with a warning light) or a
// farm track (slow tractors towing hay). Every kind of object is one
// InstancedMesh, and only the instances the camera can see are drawn.

import * as THREE from 'three';
import { COLS, FARM, GRASS, HALF, LILY_Y, LOG_Y, RAIL, RIVER, ROAD, WATER_Y, clamp, randInt } from './shared.js';
import * as models from './models.js';

const AHEAD = 14; // rows kept from the camera row on: all the screen shows ahead, and a little more

const MAX_MOVERS = 6; // cars, trucks, tractors, logs or lily pads per row
const WRAP = 13; // movers loop over x in [-WRAP, WRAP)
const PERIOD = WRAP * 2;
const EDGE = 7; // columns of scenery trees on each side of the play area
const VIEW_HALF = 16; // ground strips reach this far left and right
const MIN_GAP = 2.6; // free cells between two vehicles in a lane
const ALL = (1 << COLS) - 1;
const CAR_LEN = 1.3;
const TRUCK_LEN = 2.36;
const TRACTOR_LEN = 3.4;
const COIN_CHANCE = 0.16;

const TRAIN_CARS = 4;
const TRAIN_CAR_LEN = 3;
const TRAIN_LEN = TRAIN_CARS * TRAIN_CAR_LEN;
const TRAIN_SPEED = 26;
const TRAIN_W = 17; // trains appear and vanish this far out, beyond the fog
const WARN_TIME = 1.2; // the lamps flash this long before a train sets off
const POLE_X = HALF + 0.9;
const POLE_Z = 0.44; // beside the track, clear of the train
const RAIL_SEG = 8; // a row's track is drawn in stretches this long
const RAIL_SEGS = (VIEW_HALF * 2) / RAIL_SEG;
const FLAG_X = -HALF - 0.62;

// Static instances (trees, ground, track) are only rewritten when rows are
// recycled or the camera has moved this far, so they are tested against the
// view with this much to spare.
const STATIC_MARGIN = 1;
const RESTAT_X = 0.4;
const RESTAT_Z = 0.5;

// What stands on a grass cell.
const FREE = 0;
const ROCK = 4; // 1 to 3 are trees of growing height
const TREE_H = [0, 0.8, 1.05, 1.35];

// Mover meshes.
const CAR = 0;
const TRUCK_A = 1;
const TRUCK_B = 2;
const LOG2 = 3; // LOG2 + (length - 2)
const LILY = 6;
const TRACTOR = 7;
const MESH_COUNT = 8;

const CAR_COLORS = [0xff5a5f, 0xffc23d, 0x4d8dff, 0x6bd14f, 0xff86d0, 0xa47bff, 0xf2f2f2, 0x2ed3c6].map(
  (hex) => new THREE.Color(hex),
);

// Ground colors per row kind: [center even, center odd, edge even, edge odd].
const GROUND = [
  [0xa6e05e, 0x9bd655],
  [0x5a5e6e, 0x5a5e6e],
  [0x56c8f2, 0x56c8f2],
  [0xa39589, 0xa39589],
  [0xb08a5c, 0xa98456],
].map(([a, b]) => {
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  return [ca, cb, ca.clone().multiplyScalar(0.72), cb.clone().multiplyScalar(0.72)];
});

const LAMP_ON = new THREE.Color(0xff2a2a);
const LAMP_OFF = new THREE.Color(0x4a1c1c);
const RAIL_WARN = new THREE.Color(1, 0.22, 0.22);
const RAIL_CALM = new THREE.Color(1, 1, 1);

function makeRow() {
  return {
    index: 0,
    type: GRASS,
    dir: 1,
    speed: 0,
    offset: 0, // movers sit at x0 + offset, wrapped
    count: 0,
    mesh: new Uint8Array(MAX_MOVERS),
    x0: new Float32Array(MAX_MOVERS),
    len: new Float32Array(MAX_MOVERS),
    tint: new Uint8Array(MAX_MOVERS),
    rel: new Float32Array(MAX_MOVERS), // last x of each mover from the chicken (for sounds)
    heard: -1, // the frame rel was last written
    cells: new Uint8Array(COLS), // grass: FREE, tree height or ROCK
    edges: new Uint8Array(EDGE * 2), // scenery trees outside the play area
    coin: -1, // column of a coin, or -1
    lily: false,
    dip: 0, // logs and lily pads sink a little when landed on
    trainTimer: 0,
    trainX: 0,
    trainRun: false,
    trainStart: false, // a train set off this frame
    railFirst: 0, // the row's track stretches drawn this time: first instance and count
    railCount: 0,
  };
}

// 0 at the start, 1 from row 156 on.
function difficulty(r) {
  return clamp((r - 6) / 150, 0, 1);
}

// The free segments of `free` (a bit mask of columns) that touch `from`.
function spread(free, from) {
  let out = 0;
  let c = 0;
  while (c < COLS) {
    if (!((free >> c) & 1)) {
      c++;
      continue;
    }
    let seg = 0;
    let touches = false;
    while (c < COLS && (free >> c) & 1) {
      seg |= 1 << c;
      if ((from >> c) & 1) touches = true;
      c++;
    }
    if (touches) out |= seg;
  }
  return out;
}

// A random set bit of mask.
function pickBit(mask) {
  let n = 0;
  for (let c = 0; c < COLS; c++) if ((mask >> c) & 1) n++;
  let k = Math.floor(Math.random() * n);
  for (let c = 0; c < COLS; c++) {
    if ((mask >> c) & 1 && k-- === 0) return c;
  }
  return HALF;
}

function instanced(geometry, material, count, colors) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false; // rows are recycled, so the cached bounds would be wrong
  mesh.count = 0;
  if (colors) {
    for (let i = 0; i < count; i++) mesh.setColorAt(i, CAR_COLORS[0]);
  }
  return mesh;
}

// behind: rows kept behind the camera row, enough for the bottom of the
// screen (taller screens see further back). events gets the sounds of the
// world near the chicken: pass(name, near, dir), horn(pitch, dir),
// train(near, pan) and bell(near, pan), with near from 0 (far) to 1.
export function createWorld(scene, shadowMaterial, behind = 6, events = null) {
  const ROWS = behind + AHEAD; // row slots in the pool
  const rows = [];
  for (let i = 0; i < ROWS; i++) rows.push(makeRow());

  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });

  const ground = instanced(models.groundGeometry(), lambert, ROWS * 3, true);
  const trees = instanced(models.treeGeometry(), lambert, ROWS * (COLS + EDGE * 2));
  const rocks = instanced(models.rockGeometry(), lambert, ROWS * COLS);
  const shadowGeometry = models.shadowGeometry();
  const staticShadows = instanced(shadowGeometry, shadowMaterial, ROWS * (COLS + EDGE * 2));
  const moverShadows = instanced(shadowGeometry, shadowMaterial, ROWS * MAX_MOVERS);
  const dashes = instanced(models.dashGeometry(VIEW_HALF), new THREE.MeshBasicMaterial({ color: 0xe9e9ee }), ROWS);
  const rails = instanced(models.railGeometry(RAIL_SEG), lambert, ROWS * RAIL_SEGS, true);
  const ruts = instanced(models.rutGeometry(VIEW_HALF), lambert, ROWS);
  const poles = instanced(models.poleGeometry(), lambert, ROWS);
  const lamps = instanced(models.lampGeometry(), new THREE.MeshBasicMaterial(), ROWS * 2, true);
  const coinMesh = instanced(
    models.coinGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6b4800 }),
    ROWS,
  );
  const movers = [
    instanced(models.carGeometry(), lambert, ROWS * MAX_MOVERS, true),
    instanced(models.truckGeometry(0xff7a2f, 0xf2f2f2), lambert, ROWS * MAX_MOVERS),
    instanced(models.truckGeometry(0x3a7bd5, 0xdfe3ea), lambert, ROWS * MAX_MOVERS),
    instanced(models.logGeometry(2), lambert, ROWS * MAX_MOVERS),
    instanced(models.logGeometry(3), lambert, ROWS * MAX_MOVERS),
    instanced(models.logGeometry(4), lambert, ROWS * MAX_MOVERS),
    instanced(models.lilyGeometry(), lambert, ROWS * MAX_MOVERS),
    instanced(models.tractorGeometry(), lambert, ROWS * MAX_MOVERS),
  ];
  const engines = instanced(models.engineGeometry(), lambert, ROWS);
  const wagons = instanced(models.wagonGeometry(), lambert, ROWS * (TRAIN_CARS - 1));
  const trainShadows = instanced(shadowGeometry, shadowMaterial, ROWS * TRAIN_CARS);
  const flag = instanced(models.flagGeometry(), lambert, 1);
  const statics = [ground, trees, rocks, staticShadows, dashes, rails, ruts, poles, flag];

  scene.add(ground, trees, rocks, dashes, rails, ruts, poles, lamps, coinMesh, engines, wagons, flag);
  for (let i = 0; i < MESH_COUNT; i++) scene.add(movers[i]);
  scene.add(staticShadows, moverShadows, trainShadows);

  const m = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  const counts = new Int32Array(MESH_COUNT);
  const gapShare = new Float32Array(MAX_MOVERS);
  const frustum = new THREE.Frustum();
  const viewMatrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const box3 = new THREE.Box3();
  let first = 0; // lowest row index in the pool
  let time = 0;
  let frame = 0;
  let dirty = true; // the static instances need rewriting
  let builtX = 0; // where the camera was when they were last written
  let builtZ = 0;
  let flagRow = 0; // the row of the best run so far (0: no flag)
  let hornWait = 0;
  let lastDing = 0;

  // Generator state, carried from one row to the next.
  let chunkType = GRASS;
  let chunkLeft = 0;
  let lastType = GRASS;
  let lastLily = false;
  let lastRoadDir = 1;
  let lastRiverDir = 1;
  let reach = ALL; // columns of the last row from which the player can go on

  const world = {
    tractorNear: 0, // 0..1: how close the nearest tractor is to the chicken
    riverNear: 0, // 0..1: how close the nearest river is
  };

  function slotOf(r) {
    return ((r % ROWS) + ROWS) % ROWS;
  }

  function rowAt(r) {
    const row = rows[slotOf(r)];
    return row.index === r ? row : null;
  }

  function moverX(row, i) {
    const v = row.x0[i] + row.offset;
    return v - PERIOD * Math.floor((v + WRAP) / PERIOD);
  }

  // True if a sphere at (x, y, z) of radius r is in the camera's view.
  function seen(x, y, z, r) {
    sphere.center.set(x, y, z);
    sphere.radius = r;
    return frustum.intersectsSphere(sphere);
  }

  function seenBox(x0, x1, y0, y1, z, halfDepth, margin) {
    box3.min.set(x0 - margin, y0 - margin, z - halfDepth - margin);
    box3.max.set(x1 + margin, y1 + margin, z + halfDepth + margin);
    return frustum.intersectsBox(box3);
  }

  function pickChunk(r) {
    const d = difficulty(r);
    if (chunkType !== GRASS && !(d > 0.4 && Math.random() < 0.2)) {
      chunkType = GRASS;
      chunkLeft = Math.random() < 0.5 - 0.3 * d ? 2 : 1;
      return;
    }
    const roll = Math.random();
    if (r >= 10 && roll < 0.3 && chunkType !== RIVER) {
      chunkType = RIVER;
      chunkLeft = randInt(1, 2 + Math.round(d * 1.5));
    } else if (r >= 16 && roll < 0.48 && chunkType !== RAIL) {
      chunkType = RAIL;
      chunkLeft = Math.random() < 0.2 + 0.3 * d ? 2 : 1;
    } else if (r >= 22 && roll < 0.6 && chunkType !== FARM) {
      chunkType = FARM;
      chunkLeft = d > 0.5 && Math.random() < 0.35 ? 2 : 1;
    } else {
      chunkType = ROAD;
      chunkLeft = randInt(1, 2 + Math.round(d * 2.4));
    }
  }

  function genGrass(row, r) {
    const border = r < 0;
    for (let e = 0; e < EDGE * 2; e++) {
      row.edges[e] = border || Math.random() < 0.45 ? randInt(1, 3) : 0;
    }
    if (border) {
      for (let c = 0; c < COLS; c++) row.cells[c] = Math.random() < 0.8 ? randInt(1, 3) : ROCK;
      reach = ALL;
      return;
    }
    const d = difficulty(r);
    let n = r === 0 ? 0 : r < 3 ? randInt(0, 2) : randInt(0, 2 + Math.round(2.5 * d));
    if (lastType === RIVER) n = Math.min(n, 2);
    for (let k = 0; k < n; k++) {
      const c = randInt(0, COLS - 1);
      if (r < 3 && c === HALF) continue; // keep the start lane open
      row.cells[c] = Math.random() < 0.72 ? randInt(1, 3) : ROCK;
    }
    // Keep a way forward: some free segment must touch the reachable columns.
    let free = 0;
    for (let c = 0; c < COLS; c++) if (row.cells[c] === FREE) free |= 1 << c;
    let next = spread(free, reach);
    if (!next) {
      const c = pickBit(reach);
      row.cells[c] = FREE;
      free |= 1 << c;
      next = spread(free, reach);
    }
    reach = next;
    if (r > 2 && Math.random() < COIN_CHANCE) row.coin = pickBit(reach);
  }

  // Places row.count vehicles (lengths in row.len) around the lane loop, at
  // least MIN_GAP apart. The rest of the loop is shared out among the gaps:
  // evenly with some jitter, or, for a convoy, nearly all of it after the last
  // vehicle so they come in a bunch with a long quiet stretch behind.
  function spaceOut(row, convoy) {
    const n = row.count;
    let used = 0;
    for (let i = 0; i < n; i++) used += row.len[i] + MIN_GAP;
    const extra = Math.max(0, PERIOD - used);
    let total = 0;
    for (let i = 0; i < n; i++) {
      gapShare[i] = convoy ? (i === n - 1 ? 6 : Math.random() * 0.5) : 0.6 + Math.random() * 0.8;
      total += gapShare[i];
    }
    let pos = Math.random() * PERIOD;
    for (let i = 0; i < n; i++) {
      row.x0[i] = pos + row.len[i] / 2;
      pos += row.len[i] + MIN_GAP + (extra * gapShare[i]) / total;
    }
  }

  function genRoad(row, r) {
    const d = difficulty(r);
    row.dir = lastType === ROAD && Math.random() < 0.7 ? -lastRoadDir : Math.random() < 0.5 ? 1 : -1;
    lastRoadDir = row.dir;
    const truck = r > 6 && Math.random() < 0.22 + 0.12 * d;
    // Further on, some car lanes have a truck among the cars.
    const mixed = !truck && r > 30 && Math.random() < 0.12 + 0.18 * d;
    let n = truck ? randInt(1, 2 + Math.round(d)) : randInt(2, 3 + Math.round(1.6 * d));
    row.speed = truck ? 1.2 + 1.5 * d + Math.random() * 0.6 : 1.6 + 2.2 * d + Math.random() * 0.9;
    if (mixed) row.speed *= 0.85;
    if (r > 10 && Math.random() < 0.12 + 0.18 * d) {
      // A fast lane with fewer cars.
      row.speed *= 1.7;
      n = Math.max(1, n - 1);
    }
    let used = 0;
    row.count = 0;
    for (let i = 0; i < Math.min(n, MAX_MOVERS); i++) {
      const big = truck || (mixed && i % 2 === 1);
      const len = big ? TRUCK_LEN : CAR_LEN;
      if (used + len + MIN_GAP > PERIOD) break;
      used += len + MIN_GAP;
      row.len[i] = len;
      row.mesh[i] = big ? (Math.random() < 0.5 ? TRUCK_A : TRUCK_B) : CAR;
      row.tint[i] = randInt(0, CAR_COLORS.length - 1);
      row.count++;
    }
    spaceOut(row, row.count >= 3 && r > 14 && Math.random() < 0.15 + 0.15 * d);
    reach = ALL;
    if (Math.random() < 0.07) row.coin = randInt(0, COLS - 1);
  }

  // A farm track: one to three slow tractors, long enough that the gap
  // between them is what matters.
  function genFarm(row, r) {
    const d = difficulty(r);
    row.dir = Math.random() < 0.5 ? 1 : -1;
    row.speed = 0.75 + 0.7 * d + Math.random() * 0.35;
    row.count = randInt(1, 2 + Math.round(d * 0.8));
    for (let i = 0; i < row.count; i++) {
      row.len[i] = TRACTOR_LEN;
      row.mesh[i] = TRACTOR;
    }
    spaceOut(row, false);
    reach = ALL;
    if (Math.random() < 0.12) row.coin = randInt(0, COLS - 1);
  }

  function genRiver(row, r) {
    const d = difficulty(r);
    if (lastType === RIVER && !lastLily && Math.random() < 0.32) {
      // Lily pads: still, at fixed columns.
      row.lily = true;
      const want = d < 0.5 ? randInt(3, 5) : randInt(2, 4);
      let mask = 0;
      for (let tries = 0; tries < 30 && row.count < want; tries++) {
        const c = randInt(0, COLS - 1);
        if ((mask >> c) & 1) continue;
        mask |= 1 << c;
        const i = row.count++;
        row.x0[i] = c - HALF;
        row.len[i] = 1;
        row.mesh[i] = LILY;
      }
      reach = mask;
      return;
    }
    row.dir = lastType === RIVER ? -lastRiverDir : Math.random() < 0.5 ? 1 : -1;
    lastRiverDir = row.dir;
    row.speed = 0.9 + 1.2 * d + Math.random() * 0.6;
    const minLen = d < 0.35 ? 3 : 2;
    const maxLen = d < 0.6 ? 4 : 3;
    let pos = 0;
    while (row.count < MAX_MOVERS) {
      const len = randInt(minLen, maxLen);
      const gap = 1.4 + Math.random() * (1 + 1.6 * d);
      if (pos + len + gap > PERIOD) break;
      const i = row.count++;
      row.x0[i] = pos + len / 2;
      row.len[i] = len;
      row.mesh[i] = LOG2 + len - 2;
      pos += len + gap;
    }
    // Spread the leftover space over all gaps so no gap is much longer.
    const extra = (PERIOD - pos) / row.count;
    const start = Math.random() * PERIOD;
    for (let i = 0; i < row.count; i++) row.x0[i] += start + i * extra;
    reach = ALL;
  }

  function genRail(row) {
    row.dir = Math.random() < 0.5 ? 1 : -1;
    row.trainTimer = 1.5 + Math.random() * 3.5;
    reach = ALL;
  }

  function generate(r) {
    const row = rows[slotOf(r)];
    row.index = r;
    row.count = 0;
    row.offset = 0;
    row.speed = 0;
    row.dir = 1;
    row.coin = -1;
    row.lily = false;
    row.dip = 0;
    row.trainRun = false;
    row.trainStart = false;
    row.heard = -1;
    row.cells.fill(FREE);
    row.edges.fill(0);

    if (r >= 3) {
      if (chunkLeft <= 0) pickChunk(r);
      chunkLeft--;
      row.type = chunkType;
    } else {
      row.type = GRASS;
    }

    if (row.type === GRASS) genGrass(row, r);
    else if (row.type === ROAD) genRoad(row, r);
    else if (row.type === RIVER) genRiver(row, r);
    else if (row.type === FARM) genFarm(row, r);
    else genRail(row);
    // Keep the flag's spot clear of scenery trees.
    if (r === flagRow) row.edges[0] = 0;
    lastType = row.type;
    lastLily = row.lily;
    dirty = true;
  }

  // Ground, trees, rocks, lane dashes, rails, ruts, signal poles and the
  // flag change only when rows are recycled, so their instances are written
  // only then, or when the camera has moved far enough to bring others into
  // view. Only those in view are written.
  function rebuildStatics(camera) {
    builtX = camera.position.x;
    builtZ = camera.position.z;
    dirty = false;
    const mg = STATIC_MARGIN;
    let ng = 0;
    let nt = 0;
    let nr = 0;
    let ns = 0;
    let nd = 0;
    let nrail = 0;
    let nrut = 0;
    let npole = 0;
    const edgeW = VIEW_HALF - HALF - 0.5;
    for (let s = 0; s < ROWS; s++) {
      const row = rows[s];
      const z = -row.index;
      const y = row.type === RIVER ? WATER_Y : 0;
      const colors = GROUND[row.type];
      const odd = row.index & 1;
      if (seenBox(-HALF - 0.5, HALF + 0.5, y - 1, y, z, 0.5, mg)) {
        m.makeScale(COLS, 1, 1).setPosition(0, y, z);
        ground.setMatrixAt(ng, m);
        ground.setColorAt(ng++, colors[odd]);
      }
      for (let side = -1; side <= 1; side += 2) {
        const x = side * (HALF + 0.5 + edgeW / 2);
        if (!seenBox(x - edgeW / 2, x + edgeW / 2, y - 1, y, z, 0.5, mg)) continue;
        m.makeScale(edgeW, 1, 1).setPosition(x, y, z);
        ground.setMatrixAt(ng, m);
        ground.setColorAt(ng++, colors[2 + odd]);
      }

      if (row.type === GRASS) {
        for (let c = 0; c < COLS + EDGE * 2; c++) {
          let v;
          let x;
          if (c < COLS) {
            v = row.cells[c];
            x = c - HALF;
          } else {
            const e = c - COLS;
            v = row.edges[e];
            x = e < EDGE ? -(HALF + 1 + e) : HALF + 1 + (e - EDGE);
          }
          if (v === FREE) continue;
          if (!seen(x, 0.6, z, 0.9 + mg)) continue;
          if (v === ROCK) {
            m.makeTranslation(x, 0, z);
            rocks.setMatrixAt(nr++, m);
          } else {
            m.makeScale(1, TREE_H[v], 1).setPosition(x, 0, z);
            trees.setMatrixAt(nt++, m);
          }
          m.makeScale(0.9, 1, 0.8).setPosition(x + 0.14, 0.012, z + 0.1);
          staticShadows.setMatrixAt(ns++, m);
        }
      } else if (row.type === ROAD) {
        const next = rowAt(row.index + 1);
        if (next && next.type === ROAD && seenBox(-VIEW_HALF, VIEW_HALF, 0, 0, z - 0.5, 0.1, mg)) {
          m.makeTranslation(0, 0.004, z - 0.5);
          dashes.setMatrixAt(nd++, m);
        }
      } else if (row.type === FARM) {
        if (seenBox(-VIEW_HALF, VIEW_HALF, 0, 0, z, 0.3, mg)) {
          m.makeTranslation(0, 0.004, z);
          ruts.setMatrixAt(nrut++, m);
        }
      } else if (row.type === RAIL) {
        row.railFirst = nrail;
        for (let k = 0; k < RAIL_SEGS; k++) {
          const x = -VIEW_HALF + RAIL_SEG * (k + 0.5);
          if (!seenBox(x - RAIL_SEG / 2, x + RAIL_SEG / 2, 0, 0.1, z, 0.45, mg)) continue;
          m.makeTranslation(x, 0, z);
          rails.setMatrixAt(nrail++, m);
        }
        row.railCount = nrail - row.railFirst;
        m.makeTranslation(POLE_X, 0, z + POLE_Z);
        poles.setMatrixAt(npole++, m);
      }
    }
    flag.count = 0;
    const fr = flagRow > 0 ? rowAt(flagRow) : null;
    if (fr && seen(FLAG_X, 0.5, -flagRow, 1 + mg)) {
      m.makeTranslation(FLAG_X, 0, -flagRow);
      flag.setMatrixAt(0, m);
      flag.count = 1;
    }
    ground.count = ng;
    trees.count = nt;
    rocks.count = nr;
    staticShadows.count = ns;
    dashes.count = nd;
    rails.count = nrail;
    ruts.count = nrut;
    poles.count = npole;
    for (const mesh of statics) mesh.instanceMatrix.needsUpdate = true;
    ground.instanceColor.needsUpdate = true;
  }

  function addShadow(mesh, n, x, y, z, w, d) {
    m.makeScale(w, 1, d).setPosition(x + 0.1, y, z + 0.12);
    mesh.setMatrixAt(n, m);
  }

  // Writes the instances of everything that moves or animates and is in view.
  function draw() {
    counts.fill(0);
    let nshadow = 0;
    let ntrain = 0;
    let nwagon = 0;
    let ntshadow = 0;
    let ncoin = 0;
    let nlamp = 0;
    const blink = Math.floor(time * 7) & 1;
    for (let s = 0; s < ROWS; s++) {
      const row = rows[s];
      const z = -row.index;
      if (row.type === ROAD || row.type === RIVER || row.type === FARM) {
        const dipY = -0.08 * row.dip;
        const shadowY = row.type === RIVER ? WATER_Y + 0.012 : 0.012;
        for (let i = 0; i < row.count; i++) {
          const x = moverX(row, i);
          if (!seen(x, 0.4, z, row.len[i] / 2 + 0.5)) continue;
          const k = row.mesh[i];
          if (k === LILY) {
            m.makeRotationY(x * 1.7 + row.index);
            m.setPosition(x, dipY, z);
          } else {
            m.makeScale(row.dir, 1, row.dir).setPosition(x, dipY, z);
          }
          movers[k].setMatrixAt(counts[k], m);
          if (k === CAR) movers[k].setColorAt(counts[k], CAR_COLORS[row.tint[i]]);
          counts[k]++;
          if (k !== LILY) {
            addShadow(moverShadows, nshadow++, x, shadowY, z, row.len[i] + 0.1, k >= LOG2 && k < LILY ? 0.7 : 0.86);
          }
        }
      } else if (row.type === RAIL) {
        if (row.trainRun) {
          for (let k = 0; k < TRAIN_CARS; k++) {
            const x = row.trainX + row.dir * (TRAIN_LEN / 2 - TRAIN_CAR_LEN / 2 - k * TRAIN_CAR_LEN);
            if (!seen(x, 0.7, z, TRAIN_CAR_LEN / 2 + 0.5)) continue;
            m.makeScale(row.dir, 1, row.dir).setPosition(x, 0, z);
            if (k === 0) engines.setMatrixAt(ntrain++, m);
            else wagons.setMatrixAt(nwagon++, m);
            addShadow(trainShadows, ntshadow++, x, 0.012, z, TRAIN_CAR_LEN, 0.9);
          }
        }
        // The two lamps flash in turn while a train is coming or passing,
        // and the track blinks red so the warning reads on a small screen.
        const warn = row.trainRun || row.trainTimer < WARN_TIME;
        if (seen(POLE_X, 1.1, z + POLE_Z, 0.6)) {
          for (let k = 0; k < 2; k++) {
            m.makeTranslation(POLE_X + (k ? 0.14 : -0.14), 1.3, z + POLE_Z + 0.07);
            lamps.setMatrixAt(nlamp, m);
            lamps.setColorAt(nlamp, warn && blink === k ? LAMP_ON : LAMP_OFF);
            nlamp++;
          }
        }
        const color = warn && blink ? RAIL_WARN : RAIL_CALM;
        for (let k = 0; k < row.railCount; k++) rails.setColorAt(row.railFirst + k, color);
      }
      if (row.coin >= 0 && seen(row.coin - HALF, 0.4, z, 0.5)) {
        dummy.position.set(row.coin - HALF, 0.42 + Math.sin(time * 3 + row.index) * 0.06, z);
        dummy.rotation.set(0, time * 3 + row.index, 0);
        dummy.updateMatrix();
        coinMesh.setMatrixAt(ncoin++, dummy.matrix);
      }
    }
    for (let k = 0; k < MESH_COUNT; k++) {
      movers[k].count = counts[k];
      movers[k].instanceMatrix.needsUpdate = true;
    }
    movers[CAR].instanceColor.needsUpdate = true;
    moverShadows.count = nshadow;
    moverShadows.instanceMatrix.needsUpdate = true;
    engines.count = ntrain;
    engines.instanceMatrix.needsUpdate = true;
    wagons.count = nwagon;
    wagons.instanceMatrix.needsUpdate = true;
    trainShadows.count = ntshadow;
    trainShadows.instanceMatrix.needsUpdate = true;
    coinMesh.count = ncoin;
    coinMesh.instanceMatrix.needsUpdate = true;
    lamps.count = nlamp;
    lamps.instanceMatrix.needsUpdate = true;
    lamps.instanceColor.needsUpdate = true;
    rails.instanceColor.needsUpdate = true;
  }

  function updateTrain(row, dt) {
    row.trainStart = false;
    if (row.trainRun) {
      row.trainX += row.dir * TRAIN_SPEED * dt;
      if (row.dir * row.trainX > TRAIN_W + TRAIN_LEN / 2) {
        row.trainRun = false;
        row.trainTimer = 2.5 + Math.random() * (4.5 - 1.5 * difficulty(row.index));
      }
    } else {
      row.trainTimer -= dt;
      if (row.trainTimer <= 0) {
        row.trainRun = true;
        row.trainStart = true;
        row.trainX = -row.dir * (TRAIN_W + TRAIN_LEN / 2);
      }
    }
  }

  // The sounds around the chicken at row fr, column fx: vehicles passing
  // close by in the lanes next to it, a horn when one bears down on it,
  // crossing bells, trains, and how near the tractors and the river are.
  function listen(fr, fx, dt) {
    frame++;
    hornWait -= dt;
    let tractor = 0;
    let river = 0;
    let bellNear = 0;
    for (let k = -5; k <= 9; k++) {
      const row = rowAt(fr + k);
      if (!row) continue;
      const near = 1 - Math.abs(k) / 10;
      if (row.type === RIVER) river = Math.max(river, 1 - Math.abs(k) / 4);
      else if (row.type === RAIL) {
        if (row.trainStart && events) events.train(near, clamp(-row.dir * 0.4, -1, 1));
        // Bells ring while the lamps warn of a train, at the crossings close by.
        if (!row.trainRun && row.trainTimer < WARN_TIME && k >= -3 && k <= 6 && near > bellNear) bellNear = near;
      } else if (row.type === FARM) {
        for (let i = 0; i < row.count; i++) {
          const dx = Math.max(0, Math.abs(moverX(row, i) - fx) - row.len[i] / 2);
          tractor = Math.max(tractor, 1 - Math.hypot(dx, k) / 6);
        }
      }
      if (row.type !== ROAD || Math.abs(k) > 1 || !events) continue;
      const fresh = row.heard !== frame - 1;
      row.heard = frame;
      for (let i = 0; i < row.count; i++) {
        const rel = moverX(row, i) - fx;
        const prev = row.rel[i];
        row.rel[i] = rel;
        if (fresh) continue;
        // A vehicle's middle crossing the chicken's column in the next lane.
        if (k !== 0 && Math.abs(rel) < 2 && Math.abs(prev) < 2 && rel * prev <= 0 && (rel - prev) * row.dir > 0) {
          events.pass(row.mesh[i] === CAR ? 'car' : 'truck', k > 0 ? 0.75 : 0.6, row.dir);
        }
        // One coming at the chicken in its own lane sometimes honks.
        if (k === 0 && hornWait <= 0) {
          const gap = -rel * row.dir - row.len[i] / 2;
          const before = -prev * row.dir - row.len[i] / 2;
          if (before > 2.6 && gap <= 2.6) {
            hornWait = 2.5 + Math.random() * 3;
            if (Math.random() < 0.6) events.horn(row.mesh[i] === CAR ? 1.08 : 0.86, row.dir);
          }
        }
      }
    }
    // Crossing bells ring three or four times a second, in time with the lamps.
    const ding = Math.floor(time * 3.5);
    if (ding !== lastDing) {
      lastDing = ding;
      if (bellNear > 0 && events) events.bell(bellNear, clamp((POLE_X - fx) / 8, -0.6, 0.6));
    }
    world.tractorNear = tractor;
    world.riverNear = river;
  }

  Object.assign(world, {
    // Starts a new world with the chicken on row 0. best puts a flag beside
    // that row.
    reset(best = 0) {
      chunkType = GRASS;
      chunkLeft = 0;
      lastType = GRASS;
      lastLily = false;
      reach = ALL;
      flagRow = best;
      first = -behind;
      for (let r = first; r < first + ROWS; r++) generate(r);
      world.tractorNear = 0;
      world.riverNear = 0;
    },

    // Recycles rows that fell more than `behind` rows behind `cameraRow`.
    advance(cameraRow) {
      const want = Math.floor(cameraRow) - behind;
      while (first < want) {
        generate(first + ROWS);
        first++;
      }
    },

    // Moves everything on, after the camera has been placed for this frame.
    // With focusRow (the chicken's row) and focusX it also listens for the
    // sounds around the chicken.
    update(dt, camera, focusRow, focusX) {
      time += dt;
      for (let s = 0; s < ROWS; s++) {
        const row = rows[s];
        if (row.type === RAIL) updateTrain(row, dt);
        else if (row.speed > 0) {
          row.offset += row.dir * row.speed * dt;
          if (row.offset > PERIOD) row.offset -= PERIOD;
          else if (row.offset < -PERIOD) row.offset += PERIOD;
        }
        if (row.dip > 0) row.dip = Math.max(0, row.dip - dt * 5);
      }
      if (focusRow !== undefined) listen(focusRow, focusX, dt);
      else {
        world.tractorNear = 0;
        world.riverNear = 0;
      }
      camera.updateMatrixWorld();
      viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewMatrix);
      const p = camera.position;
      if (dirty || Math.abs(p.x - builtX) > RESTAT_X || Math.abs(p.z - builtZ) > RESTAT_Z) rebuildStatics(camera);
      draw();
    },

    // Shows one of everything in front of the camera for a frame, so every
    // material compiles and every geometry uploads while the game loads.
    // update() puts things back.
    warmUp(camera) {
      m.makeTranslation(camera.position.x, 0, camera.position.z - 9);
      for (const mesh of [...statics, ...movers, lamps, coinMesh, engines, wagons, moverShadows, trainShadows]) {
        mesh.setMatrixAt(0, m);
        mesh.count = 1;
        mesh.instanceMatrix.needsUpdate = true;
      }
      dirty = true;
    },

    rowType(r) {
      const row = rowAt(r);
      return row ? row.type : GRASS;
    },

    lily(r) {
      const row = rowAt(r);
      return row ? row.lily : false;
    },

    // True if the chicken cannot hop to x on row r (trees, rocks, the edges).
    // wide: a hop from one river row to the next, allowed out to where a
    // log would sweep the chicken away anyway.
    blocked(r, x, wide = false) {
      const row = rowAt(r);
      if (!row) return true;
      if (row.type === RIVER) return Math.abs(x) > HALF + (wide ? 1.15 : 0.5);
      if (Math.abs(x) > HALF) return true;
      return row.type === GRASS && row.cells[x + HALF] !== FREE;
    },

    // Height of what the chicken stands on in row r.
    surfaceY(r) {
      const row = rowAt(r);
      if (!row || row.type !== RIVER) return 0;
      return (row.lily ? LILY_Y : LOG_Y) - 0.08 * row.dip;
    },

    // On a river row: where the chicken ends up when landing at x (the
    // middle of the log cell or lily pad under it), or NaN for water. The
    // margins match what the eye sees: any landing that overlaps a log or a
    // pad with the chicken's body counts.
    support(r, x) {
      const row = rowAt(r);
      if (!row) return NaN;
      for (let i = 0; i < row.count; i++) {
        const mx = moverX(row, i);
        if (row.lily) {
          if (Math.abs(x - mx) < 0.7) return mx;
          continue;
        }
        const half = row.len[i] / 2;
        if (x > mx - half - 0.35 && x < mx + half + 0.35) {
          const cell = clamp(Math.round(x - (mx - half + 0.5)), 0, row.len[i] - 1);
          return mx - half + 0.5 + cell;
        }
      }
      return NaN;
    },

    // Sideways speed of whatever floats in row r (0 on land).
    drift(r) {
      const row = rowAt(r);
      return row && row.type === RIVER ? row.dir * row.speed : 0;
    },

    dip(r) {
      const row = rowAt(r);
      if (row) row.dip = 1;
    },

    // 0 if nothing hits a chicken at x on row r, 1 for a car or truck, 2 for
    // a train, 3 for a tractor.
    hit(r, x, halfW) {
      const row = rowAt(r);
      if (!row) return 0;
      if (row.type === ROAD || row.type === FARM) {
        for (let i = 0; i < row.count; i++) {
          if (Math.abs(moverX(row, i) - x) < row.len[i] / 2 + halfW) return row.type === FARM ? 3 : 1;
        }
      } else if (row.type === RAIL && row.trainRun) {
        if (Math.abs(row.trainX - x) < TRAIN_LEN / 2 + halfW) return 2;
      }
      return 0;
    },

    // True if a train is rushing past close to the chicken (for camera shake).
    trainNear(r, x) {
      for (let k = -2; k <= 2; k++) {
        const row = rowAt(r + k);
        if (row && row.type === RAIL && row.trainRun && Math.abs(row.trainX - x) < TRAIN_LEN / 2 + 3) return true;
      }
      return false;
    },

    // Picks up the coin at x on row r, if there is one.
    takeCoin(r, x) {
      const row = rowAt(r);
      if (!row || row.coin < 0 || row.coin !== Math.round(x) + HALF) return false;
      row.coin = -1;
      return true;
    },
  });

  return world;
}
