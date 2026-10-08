// The world: a fixed pool of rows that is recycled as the camera moves
// forward. Each row is grass (trees, rocks, coins), road (cars and trucks),
// river (logs or lily pads) or rail (a fast train with a warning light).
// Every kind of object is one InstancedMesh.

import * as THREE from 'three';
import { COLS, GRASS, HALF, LILY_Y, LOG_Y, RAIL, RIVER, ROAD, WATER_Y, clamp, randInt } from './shared.js';
import * as models from './models.js';

const AHEAD = 14; // rows kept from the camera row on: all the screen shows ahead, and a little more

const MAX_MOVERS = 6; // cars, trucks, logs or lily pads per row
const WRAP = 13; // movers loop over x in [-WRAP, WRAP)
const PERIOD = WRAP * 2;
const EDGE = 7; // columns of scenery trees on each side of the play area
const VIEW_HALF = 16; // ground strips reach this far left and right
const MIN_GAP = 2.6; // free cells between two vehicles in a lane
const ALL = (1 << COLS) - 1;
const CAR_LEN = 1.3;
const TRUCK_LEN = 2.36;
const COIN_CHANCE = 0.16;

const TRAIN_CARS = 4;
const TRAIN_CAR_LEN = 3;
const TRAIN_LEN = TRAIN_CARS * TRAIN_CAR_LEN;
const TRAIN_SPEED = 26;
const TRAIN_W = 17; // trains appear and vanish this far out, beyond the fog
const WARN_TIME = 1.2; // the lamps flash this long before a train sets off
const POLE_X = HALF + 0.9;
const POLE_Z = 0.44; // beside the track, clear of the train

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
const MESH_COUNT = 7;

const CAR_COLORS = [0xff5a5f, 0xffc23d, 0x4d8dff, 0x6bd14f, 0xff86d0, 0xa47bff, 0xf2f2f2, 0x2ed3c6].map(
  (hex) => new THREE.Color(hex),
);

// Ground colors per row kind: [center even, center odd, edge even, edge odd].
const GROUND = [
  [0xa6e05e, 0x9bd655],
  [0x5a5e6e, 0x5a5e6e],
  [0x56c8f2, 0x56c8f2],
  [0xa39589, 0xa39589],
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
    cells: new Uint8Array(COLS), // grass: FREE, tree height or ROCK
    edges: new Uint8Array(EDGE * 2), // scenery trees outside the play area
    coin: -1, // column of a coin, or -1
    lily: false,
    dip: 0, // logs and lily pads sink a little when landed on
    trainTimer: 0,
    trainX: 0,
    trainRun: false,
  };
}

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
// screen (taller screens see further back).
export function createWorld(scene, shadowMaterial, behind = 6) {
  const ROWS = behind + AHEAD; // row slots in the pool
  const rows = [];
  for (let i = 0; i < ROWS; i++) rows.push(makeRow());

  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });

  const ground = instanced(models.groundGeometry(), lambert, ROWS * 3, true);
  ground.count = ROWS * 3;
  const trees = instanced(models.treeGeometry(), lambert, ROWS * (COLS + EDGE * 2));
  const rocks = instanced(models.rockGeometry(), lambert, ROWS * COLS);
  const shadowGeometry = models.shadowGeometry();
  const staticShadows = instanced(shadowGeometry, shadowMaterial, ROWS * (COLS + EDGE * 2));
  const moverShadows = instanced(shadowGeometry, shadowMaterial, ROWS * MAX_MOVERS);
  const dashes = instanced(models.dashGeometry(VIEW_HALF), new THREE.MeshBasicMaterial({ color: 0xe9e9ee }), ROWS);
  const rails = instanced(models.railGeometry(VIEW_HALF), lambert, ROWS, true);
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
  ];
  const engines = instanced(models.engineGeometry(), lambert, ROWS);
  const wagons = instanced(models.wagonGeometry(), lambert, ROWS * (TRAIN_CARS - 1));
  const trainShadows = instanced(shadowGeometry, shadowMaterial, ROWS);

  scene.add(ground, trees, rocks, dashes, rails, poles, lamps, coinMesh, engines, wagons);
  for (let i = 0; i < MESH_COUNT; i++) scene.add(movers[i]);
  scene.add(staticShadows, moverShadows, trainShadows);

  const m = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  const counts = new Int32Array(MESH_COUNT);
  let first = 0; // lowest row index in the pool
  let time = 0;

  // Generator state, carried from one row to the next.
  let chunkType = GRASS;
  let chunkLeft = 0;
  let lastType = GRASS;
  let lastLily = false;
  let lastRoadDir = 1;
  let lastRiverDir = 1;
  let reach = ALL; // columns of the last row from which the player can go on

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

  function genRoad(row, r) {
    const d = difficulty(r);
    row.dir = lastType === ROAD && Math.random() < 0.7 ? -lastRoadDir : Math.random() < 0.5 ? 1 : -1;
    lastRoadDir = row.dir;
    const truck = r > 6 && Math.random() < 0.22 + 0.12 * d;
    const len = truck ? TRUCK_LEN : CAR_LEN;
    let n = truck ? randInt(1, 2 + Math.round(d)) : randInt(2, 3 + Math.round(1.6 * d));
    row.speed = truck ? 1.2 + 1.5 * d + Math.random() * 0.6 : 1.6 + 2.2 * d + Math.random() * 0.9;
    if (r > 10 && Math.random() < 0.12 + 0.18 * d) {
      // A fast lane with fewer cars.
      row.speed *= 1.7;
      n = Math.max(1, n - 1);
    }
    n = Math.min(n, Math.floor(PERIOD / (len + MIN_GAP)), MAX_MOVERS);
    const spacing = PERIOD / n;
    const slack = spacing - len - MIN_GAP;
    const start = Math.random() * PERIOD;
    for (let i = 0; i < n; i++) {
      row.x0[i] = start + i * spacing + (Math.random() - 0.5) * slack * 0.9;
      row.len[i] = len;
      row.mesh[i] = truck ? (Math.random() < 0.5 ? TRUCK_A : TRUCK_B) : CAR;
      row.tint[i] = randInt(0, CAR_COLORS.length - 1);
    }
    row.count = n;
    reach = ALL;
    if (Math.random() < 0.07) row.coin = randInt(0, COLS - 1);
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

  function writeGround(row) {
    const s = slotOf(row.index) * 3;
    const z = -row.index;
    const y = row.type === RIVER ? WATER_Y : 0;
    const colors = GROUND[row.type];
    const odd = row.index & 1;
    const edgeW = VIEW_HALF - HALF - 0.5;
    m.makeScale(COLS, 1, 1).setPosition(0, y, z);
    ground.setMatrixAt(s, m);
    ground.setColorAt(s, colors[odd]);
    for (let side = -1; side <= 1; side += 2) {
      m.makeScale(edgeW, 1, 1).setPosition(side * (HALF + 0.5 + edgeW / 2), y, z);
      const i = s + (side < 0 ? 1 : 2);
      ground.setMatrixAt(i, m);
      ground.setColorAt(i, colors[2 + odd]);
    }
    ground.instanceMatrix.needsUpdate = true;
    ground.instanceColor.needsUpdate = true;
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
    else genRail(row);
    lastType = row.type;
    lastLily = row.lily;
    writeGround(row);
  }

  // Trees, rocks, lane dashes, rails and signal poles change only when rows
  // are recycled, so their instances are rewritten only then.
  function rebuildStatics() {
    let nt = 0;
    let nr = 0;
    let ns = 0;
    let nd = 0;
    let nrail = 0;
    for (let s = 0; s < ROWS; s++) {
      const row = rows[s];
      const z = -row.index;
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
        if (next && next.type === ROAD) {
          m.makeTranslation(0, 0.004, z - 0.5);
          dashes.setMatrixAt(nd++, m);
        }
      } else if (row.type === RAIL) {
        m.makeTranslation(0, 0, z);
        rails.setMatrixAt(nrail, m);
        m.makeTranslation(POLE_X, 0, z + POLE_Z);
        poles.setMatrixAt(nrail, m);
        nrail++;
      }
    }
    trees.count = nt;
    rocks.count = nr;
    staticShadows.count = ns;
    dashes.count = nd;
    rails.count = nrail;
    poles.count = nrail;
    trees.instanceMatrix.needsUpdate = true;
    rocks.instanceMatrix.needsUpdate = true;
    staticShadows.instanceMatrix.needsUpdate = true;
    dashes.instanceMatrix.needsUpdate = true;
    rails.instanceMatrix.needsUpdate = true;
    poles.instanceMatrix.needsUpdate = true;
  }

  function addShadow(mesh, n, x, y, z, w, d) {
    m.makeScale(w, 1, d).setPosition(x + 0.1, y, z + 0.12);
    mesh.setMatrixAt(n, m);
  }

  // Writes the instances of everything that moves or animates.
  function draw() {
    counts.fill(0);
    let nshadow = 0;
    let ntrain = 0;
    let nwagon = 0;
    let ncoin = 0;
    let nlamp = 0;
    let nrail = 0;
    for (let s = 0; s < ROWS; s++) {
      const row = rows[s];
      const z = -row.index;
      if (row.type === ROAD || row.type === RIVER) {
        const dipY = -0.08 * row.dip;
        const shadowY = row.type === RIVER ? WATER_Y + 0.012 : 0.012;
        for (let i = 0; i < row.count; i++) {
          const x = moverX(row, i);
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
            addShadow(moverShadows, nshadow++, x, shadowY, z, row.len[i] + 0.1, k >= LOG2 ? 0.7 : 0.86);
          }
        }
      } else if (row.type === RAIL) {
        if (row.trainRun) {
          for (let k = 0; k < TRAIN_CARS; k++) {
            const x = row.trainX + row.dir * (TRAIN_LEN / 2 - TRAIN_CAR_LEN / 2 - k * TRAIN_CAR_LEN);
            m.makeScale(row.dir, 1, row.dir).setPosition(x, 0, z);
            if (k === 0) engines.setMatrixAt(ntrain, m);
            else wagons.setMatrixAt(nwagon++, m);
          }
          addShadow(trainShadows, ntrain, row.trainX, 0.012, z, TRAIN_LEN, 0.9);
          ntrain++;
        }
        // The two lamps flash in turn while a train is coming or passing,
        // and the track blinks red so the warning reads on a small screen.
        // Rails are listed in slot order, the same order rebuildStatics uses.
        const warn = row.trainRun || row.trainTimer < WARN_TIME;
        const blink = Math.floor(time * 7) & 1;
        for (let k = 0; k < 2; k++) {
          m.makeTranslation(POLE_X + (k ? 0.14 : -0.14), 1.3, z + POLE_Z + 0.07);
          lamps.setMatrixAt(nlamp, m);
          lamps.setColorAt(nlamp, warn && blink === k ? LAMP_ON : LAMP_OFF);
          nlamp++;
        }
        rails.setColorAt(nrail++, warn && blink ? RAIL_WARN : RAIL_CALM);
      }
      if (row.coin >= 0) {
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
    trainShadows.count = ntrain;
    trainShadows.instanceMatrix.needsUpdate = true;
    wagons.count = nwagon;
    wagons.instanceMatrix.needsUpdate = true;
    coinMesh.count = ncoin;
    coinMesh.instanceMatrix.needsUpdate = true;
    lamps.count = nlamp;
    lamps.instanceMatrix.needsUpdate = true;
    lamps.instanceColor.needsUpdate = true;
    rails.instanceColor.needsUpdate = true;
  }

  function updateTrain(row, dt) {
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
        row.trainX = -row.dir * (TRAIN_W + TRAIN_LEN / 2);
      }
    }
  }

  return {
    // Starts a new world with the chicken on row 0.
    reset() {
      chunkType = GRASS;
      chunkLeft = 0;
      lastType = GRASS;
      lastLily = false;
      reach = ALL;
      first = -behind;
      for (let r = first; r < first + ROWS; r++) generate(r);
      rebuildStatics();
      draw();
    },

    // Recycles rows that fell more than `behind` rows behind `cameraRow`.
    advance(cameraRow) {
      const want = Math.floor(cameraRow) - behind;
      if (first >= want) return;
      while (first < want) {
        generate(first + ROWS);
        first++;
      }
      rebuildStatics();
    },

    update(dt) {
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
      draw();
    },

    rowType(r) {
      const row = rowAt(r);
      return row ? row.type : GRASS;
    },

    // True if the chicken cannot hop to x on row r (trees, rocks, the edges).
    blocked(r, x) {
      const row = rowAt(r);
      if (!row) return true;
      if (row.type === RIVER) return Math.abs(x) > HALF + 0.5;
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
    // middle of the log cell or lily pad under it), or NaN for water.
    support(r, x) {
      const row = rowAt(r);
      if (!row) return NaN;
      for (let i = 0; i < row.count; i++) {
        const mx = moverX(row, i);
        if (row.lily) {
          if (Math.abs(x - mx) < 0.6) return mx;
          continue;
        }
        const half = row.len[i] / 2;
        if (x > mx - half - 0.3 && x < mx + half + 0.3) {
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

    // 0 if nothing hits a chicken at x on row r, 1 for a car or truck, 2 for a train.
    hit(r, x, halfW) {
      const row = rowAt(r);
      if (!row) return 0;
      if (row.type === ROAD) {
        for (let i = 0; i < row.count; i++) {
          if (Math.abs(moverX(row, i) - x) < row.len[i] / 2 + halfW) return 1;
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
  };
}
