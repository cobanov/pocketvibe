// Obstacles, coins and power-ups: fixed pools drawn with one InstancedMesh
// per kind, filled by stringing the patterns of patterns.js together.

import * as THREE from 'three';
import { COIN_Y, DESPAWN_Z, GRAVITY, JUMP_SPEED, LANES, SPAWN_Z } from './shared.js';
import { barGeometry, coinGeometry, hurdleGeometry, magnetGeometry, shieldGeometry, vanGeometry, wallGeometry } from './models.js';
import { BAR, BREATHER, LOW, PATTERNS, TALL, VAN, stageGap, stageStep } from './patterns.js';

// The runner's hit box is a little smaller than it looks, and so are the
// obstacles', so a touch that looks like a miss is a miss.
export const PLAYER_HALF_W = 0.3;
export const PLAYER_HALF_D = 0.22;

// Hit boxes, relative to the obstacle's position on the ground.
const KINDS = [
  { halfW: 0.82, halfD: 0.26, bottom: 0, top: 0.85, max: 40, color: 0xf08a24 }, // hurdle
  { halfW: 0.95, halfD: 0.16, bottom: 1.05, top: 1.55, max: 40, color: 0xf2c230 }, // bar
  { halfW: 0.8, halfD: 0.45, bottom: 0, top: 2.6, max: 50, color: 0xc8443a }, // wall
  { halfW: 0.76, halfD: 1.65, bottom: 0, top: 1.9, max: 12, color: 0x3f7fd6 }, // van
];

// A van drives at the runner: it is drawn (and hits) at its place in the
// pattern times this, so it reaches the runner when its row does.
const VAN_RUSH = 1.5;
// Nothing goes into a van's lane this close behind it, or the van would be
// seen driving through it while far away.
const VAN_CLEAR = 26;
const NEAR_TIME = 0.28; // a lane change this soon before a wall or van counts as a near miss

export const MAGNET = 0;
export const SHIELD = 1;
const PICKUP_EVERY = [380, 560]; // metres between power-ups, at random in this range
const FIRST_PICKUP = 260;

const MAX_COINS = 160;
const COIN_CHANCE = 0.65; // patterns with a coin trail along their way through
const BREATHER_CHANCE = 0.08;
const MAGNET_REACH = 16; // units ahead the magnet pulls coins from

export function createTrack(scene, material, fx) {
  const geometries = [hurdleGeometry(), barGeometry(), wallGeometry(), vanGeometry()];
  const meshes = KINDS.map((k, i) => {
    const mesh = new THREE.InstancedMesh(geometries[i], material, k.max);
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });

  const coinMesh = new THREE.InstancedMesh(
    coinGeometry(),
    new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6b4a00 }),
    MAX_COINS,
  );
  coinMesh.frustumCulled = false;
  coinMesh.count = 0;
  scene.add(coinMesh);

  const pickupMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x3a3a3a });
  const pickupMeshes = [magnetGeometry(), shieldGeometry()].map((g) => {
    const mesh = new THREE.InstancedMesh(g, pickupMaterial, 2);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });

  const obstacles = [];
  for (let k = 0; k < KINDS.length; k++) {
    for (let i = 0; i < KINDS[k].max; i++) {
      obstacles.push({ active: false, kind: k, lane: 0, x: 0, z: 0, ignore: false, arrived: false, passed: false, seen: false, from: -1 });
    }
  }
  const coins = Array.from({ length: MAX_COINS }, () => ({ active: false, x: 0, y: 0, z: 0, pull: false }));
  const pickups = Array.from({ length: 4 }, () => ({ active: false, kind: 0, x: 0, z: 0 }));

  const counts = new Int32Array(KINDS.length);
  const pickupCounts = new Int32Array(2);
  const matrix = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  const vanZ = new Float32Array(3); // the farthest van in each lane (a pattern's place)
  const rowZ = new Float32Array(8);
  const path = new Int8Array(8);
  const recent = new Int16Array(4).fill(-1); // the last patterns, not picked again soon
  let nextZ = 0; // where the next pattern starts; moves with the road
  let spin = 0;
  let travelled = 0;
  let pickupAt = FIRST_PICKUP;

  // What the game hears about: set by main.js.
  const events = { van: null, vanBy: null, near: null };

  // Where a thing is drawn and hits: vans drive at the runner.
  const drawnZ = (o, z) => (o.kind === VAN ? z * VAN_RUSH : z);

  function addObstacle(kind, lane, z, from) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.active && o.kind === kind) {
        o.active = true;
        o.from = from;
        o.lane = lane;
        o.x = LANES[lane];
        o.z = z;
        o.ignore = false;
        o.arrived = false;
        o.passed = false;
        o.seen = false;
        return;
      }
    }
  }

  function addCoin(lane, y, z) {
    // Not where a van will be seen driving through it.
    if (z > vanZ[lane] - VAN_CLEAR && z < vanZ[lane] + 2) return;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active) {
        c.active = true;
        c.x = LANES[lane];
        c.y = y;
        c.z = z;
        c.pull = false;
        return;
      }
    }
  }

  function addPickup(kind, lane, z) {
    if (z > vanZ[lane] - VAN_CLEAR && z < vanZ[lane] + 2) return false;
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (!p.active) {
        p.active = true;
        p.kind = kind;
        p.x = LANES[lane];
        p.z = z;
        return true;
      }
    }
    return false;
  }

  function choosePattern(stage) {
    if (Math.random() < BREATHER_CHANCE && stage > 0 && track.only === null) return BREATHER;
    let total = 0;
    for (let i = 0; i < PATTERNS.length; i++) total += weight(i, stage);
    let r = Math.random() * total;
    for (let i = 0; i < PATTERNS.length; i++) {
      r -= weight(i, stage);
      if (r <= 0) {
        recent.copyWithin(1, 0);
        recent[0] = i;
        return PATTERNS[i];
      }
    }
    return PATTERNS[0];
  }

  // Newer patterns come up more often; the very easy ones fade out.
  function weight(i, stage) {
    const p = PATTERNS[i];
    if (track.only !== null) return i === track.only ? 1 : 0;
    if (p.tier > stage || recent.includes(i)) return 0;
    if (p.tier === stage) return 3;
    if (p.tier === 0 && p.rows.length === 1 && stage >= 3) return 0.4;
    return p.tier >= stage - 2 ? 2 : 1;
  }

  const passable = (cell) => cell !== TALL && cell !== VAN;

  // The way the coin trail takes through a pattern: a lane in every row
  // that the runner can get through, changing lanes only when it must.
  function choosePath(rows, mirror) {
    let lane = -1;
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r].cells;
      const at = (l) => cells[mirror ? 2 - l : l];
      if (lane >= 0 && passable(at(lane)) && Math.random() < 0.8) {
        path[r] = lane;
        continue;
      }
      // The nearest lane that is open, picked at random among equals.
      let best = -1;
      let bestCost = 9;
      for (let l = 0; l < 3; l++) {
        if (!passable(at(l))) continue;
        const cost = (lane < 0 ? 0 : Math.abs(l - lane)) + Math.random() * 0.9;
        if (cost < bestCost) {
          bestCost = cost;
          best = l;
        }
      }
      lane = best;
      path[r] = lane;
    }
  }

  // Lays a pattern down with its first row at z (and the rest further on).
  // Returns where its last row ended up.
  function spawnPattern(z, stage, speed) {
    const pattern = choosePattern(stage);
    const rows = pattern.rows;
    const mirror = Math.random() < 0.5;
    const step = stageStep(stage) * speed;

    for (let r = 0; r < rows.length; r++) rowZ[r] = r === 0 ? z : rowZ[r - 1] - rows[r].gap * step;

    // Moved further on if it would stand too close behind a van.
    let shift = 0;
    for (let r = 0; r < rows.length; r++) {
      for (let l = 0; l < 3; l++) {
        if (rows[r].cells[mirror ? 2 - l : l] < 0) continue;
        shift = Math.max(shift, rowZ[r] - (vanZ[l] - VAN_CLEAR));
      }
    }
    for (let r = 0; r < rows.length; r++) rowZ[r] -= shift;

    const from = PATTERNS.indexOf(pattern);
    for (let r = 0; r < rows.length; r++) {
      for (let l = 0; l < 3; l++) {
        const kind = rows[r].cells[mirror ? 2 - l : l];
        if (kind < 0) continue;
        addObstacle(kind, l, rowZ[r], from);
        if (kind === VAN) vanZ[l] = Math.min(vanZ[l], rowZ[r]);
      }
    }

    choosePath(rows, mirror);
    const due = travelled >= pickupAt;
    if (due) pickupAt = travelled + PICKUP_EVERY[0] + Math.random() * (PICKUP_EVERY[1] - PICKUP_EVERY[0]);
    if (pattern === BREATHER || due || Math.random() < COIN_CHANCE) layCoins(rows, mirror, step, speed, due);
    return rowZ[rows.length - 1];
  }

  // Coins along the path: a line through open road, an arc over each
  // hurdle shaped like the runner's jump at this speed, and a low row under
  // each bar. A power-up, when one is due, sits where the line starts.
  function layCoins(rows, mirror, step, speed, pickup) {
    const spacing = Math.max(2.4, speed * 0.13);
    const arcSpan = 0.24 * speed; // the arc's coins span +-0.24 s of the jump
    const last = rows.length - 1;
    const start = rowZ[0] + step * 0.6;
    const cell = (r) => rows[r].cells[mirror ? 2 - path[r] : path[r]];

    let z = start;
    if (pickup) {
      // Not where a van would drive through it; then it comes with the next pattern.
      if (addPickup(Math.random() < 0.5 ? MAGNET : SHIELD, path[0], start)) z -= spacing * 1.5;
      else pickupAt = travelled;
    }

    let s = 0; // the line is between row s and row s + 1
    for (; z > rowZ[last] - 1; z -= spacing) {
      while (s < last && z < rowZ[s + 1]) s++;
      let lane = path[s];
      let near = s; // the nearest row
      if (z < rowZ[s] && s < last) {
        // Between two rows the line moves over at the midpoint, through the
        // middle lane when it crosses the whole road.
        const t = (rowZ[s] - z) / (rowZ[s] - rowZ[s + 1]);
        if (t >= 0.5) {
          lane = path[s + 1];
          near = s + 1;
        }
        if (Math.abs(path[s + 1] - path[s]) === 2 && t > 0.33 && t < 0.67) lane = 1;
      }
      if (lane === path[near]) {
        const kind = cell(near);
        const d = Math.abs(z - rowZ[near]);
        if (kind === LOW && d < arcSpan + spacing * 0.5) continue;
        if (kind === BAR && d < 2.2) continue;
      }
      addCoin(lane, COIN_Y, z);
    }

    for (let r = 0; r <= last; r++) {
      const kind = cell(r);
      if (kind === LOW) {
        for (let k = -2; k <= 2; k++) {
          const t = k * 0.12 + JUMP_SPEED / GRAVITY; // seconds since take-off, peak at the hurdle
          const height = JUMP_SPEED * t - 0.5 * GRAVITY * t * t;
          addCoin(path[r], COIN_Y + height, rowZ[r] - k * 0.12 * speed);
        }
      } else if (kind === BAR) {
        for (let k = -1; k <= 1; k++) addCoin(path[r], 0.45, rowZ[r] + k * 1.3);
      }
    }
  }

  function clear() {
    for (let i = 0; i < obstacles.length; i++) obstacles[i].active = false;
    for (let i = 0; i < coins.length; i++) coins[i].active = false;
    for (let i = 0; i < pickups.length; i++) pickups[i].active = false;
    vanZ.fill(1e6);
  }

  function draw() {
    counts.fill(0);
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.active) continue;
      const z = drawnZ(o, o.z);
      if (z < SPAWN_Z) continue; // still beyond the fog
      matrix.makeTranslation(o.x, 0, z);
      meshes[o.kind].setMatrixAt(counts[o.kind]++, matrix);
    }
    for (let k = 0; k < meshes.length; k++) {
      meshes[k].count = counts[k];
      meshes[k].instanceMatrix.needsUpdate = true;
    }

    let n = 0;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active || c.z < SPAWN_Z) continue;
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, spin + c.z * 0.3, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      coinMesh.setMatrixAt(n++, dummy.matrix);
    }
    coinMesh.count = n;
    coinMesh.instanceMatrix.needsUpdate = true;

    pickupCounts.fill(0);
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (!p.active || p.z < SPAWN_Z) continue;
      dummy.position.set(p.x, 1.15 + Math.sin(spin * 0.8 + p.z * 0.2) * 0.15, p.z);
      dummy.rotation.set(0, spin * 0.7, 0);
      dummy.scale.setScalar(1.35);
      dummy.updateMatrix();
      pickupMeshes[p.kind].setMatrixAt(pickupCounts[p.kind]++, dummy.matrix);
    }
    for (let k = 0; k < 2; k++) {
      pickupMeshes[k].count = pickupCounts[k];
      pickupMeshes[k].instanceMatrix.needsUpdate = true;
    }
  }

  const hitResult = { obstacle: null, side: false };

  const track = {
    events,
    only: null, // testing: a pattern index to repeat

    clear() {
      clear();
      draw();
    },

    // Lays the road ahead out so a new run starts with something to do.
    reset() {
      clear();
      travelled = 0;
      pickupAt = FIRST_PICKUP;
      recent.fill(-1);
      nextZ = -30;
      while (nextZ > SPAWN_Z) nextZ = spawnPattern(nextZ, 0, 14) - stageGap(0) * 14;
      draw();
    },

    // For warming up shaders while loading: one of everything in view.
    showAll() {
      clear();
      for (let k = 0; k < KINDS.length; k++) addObstacle(k, k % 3, -12 - k * 4, -1);
      addCoin(1, COIN_Y, -6);
      addPickup(MAGNET, 0, -8);
      addPickup(SHIELD, 2, -8);
      draw();
    },

    // Moves everything towards the runner by `move` units and lays down new
    // patterns. stage and speed (units per second) set how hard they are.
    update(move, stage, speed, dt, runner) {
      spin += dt * 4;
      travelled += move;
      for (let l = 0; l < 3; l++) vanZ[l] += move;

      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o.active) continue;
        o.z += move;
        const k = KINDS[o.kind];
        const z = drawnZ(o, o.z);
        if (z > DESPAWN_Z) {
          o.active = false;
          continue;
        }
        if (o.kind === VAN && !o.seen && z > SPAWN_Z + 6) {
          o.seen = true;
          events.van?.(o.x);
        }
        // The front reaches the runner: a wall or van dodged at the last
        // moment is a near miss.
        if (!o.arrived && z + k.halfD > -PLAYER_HALF_D) {
          o.arrived = true;
          if (
            runner &&
            (o.kind === TALL || o.kind === VAN) &&
            runner.lane !== o.lane &&
            runner.fromLane === o.lane &&
            runner.switchAge < NEAR_TIME &&
            !o.ignore
          ) {
            events.near?.(o.x);
          }
          if (o.kind === VAN) events.vanBy?.(o.x);
        }
        if (!o.passed && z - k.halfD > PLAYER_HALF_D) o.passed = true;
      }

      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (!c.active) continue;
        c.z += move;
        if (c.z > DESPAWN_Z) c.active = false;
      }
      for (let i = 0; i < pickups.length; i++) {
        const p = pickups[i];
        if (!p.active) continue;
        p.z += move;
        if (p.z > DESPAWN_Z) p.active = false;
      }

      nextZ += move;
      if (nextZ > SPAWN_Z) nextZ = spawnPattern(nextZ, stage, speed) - stageGap(stage) * speed;
      draw();
    },

    // The obstacle the runner touches (or null), swept over the last step
    // so nothing is skipped in a long frame. side: the runner moved into its
    // side while changing lanes, rather than running into it.
    hit(runner, move) {
      hitResult.obstacle = null;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o.active || o.ignore) continue;
        const k = KINDS[o.kind];
        const z = drawnZ(o, o.z);
        const before = drawnZ(o, o.z - move);
        if (before - k.halfD >= PLAYER_HALF_D || z + k.halfD <= -PLAYER_HALF_D) continue;
        if (Math.abs(o.x - runner.x) >= k.halfW + PLAYER_HALF_W) continue;
        if (runner.y >= k.top || runner.y + runner.height <= k.bottom) continue;
        hitResult.obstacle = o;
        // Already level with the runner, and the runner was clear of it a
        // step ago: it came in from the side.
        const level = before + k.halfD > -PLAYER_HALF_D && before - k.halfD < PLAYER_HALF_D;
        hitResult.side = level && Math.abs(o.x - runner.prevX) >= k.halfW + PLAYER_HALF_W;
        return hitResult;
      }
      return null;
    },

    // For the autopilot: true if the runner (a copy, moved on by itself)
    // touches anything once the road has moved `ahead` units, counting only
    // what is nearer than `vision` now. pad (units) makes every obstacle
    // that much longer, so a way through it leaves room for late presses.
    touching(runner, ahead, move, vision, pad = 0) {
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o.active || o.ignore) continue;
        if (drawnZ(o, o.z) < -vision) continue;
        const k = KINDS[o.kind];
        const z = drawnZ(o, o.z + ahead);
        const before = drawnZ(o, o.z + ahead - move);
        const halfD = k.halfD + (o.kind === VAN ? pad * VAN_RUSH : pad);
        if (before - halfD >= PLAYER_HALF_D || z + halfD <= -PLAYER_HALF_D) continue;
        if (Math.abs(o.x - runner.x) >= k.halfW + PLAYER_HALF_W) continue;
        if (runner.y >= k.top || runner.y + runner.height <= k.bottom) continue;
        return true;
      }
      return false;
    },

    // Breaks an obstacle the shield hit: it bursts into pieces.
    smash(o) {
      o.active = false;
      const k = KINDS[o.kind];
      const z = drawnZ(o, o.z);
      const top = Math.min(k.top, 2.2);
      fx.burst(o.x, top * 0.5, z, 18, k.color, 7, 5, 0.32, 0.8, 22);
      fx.burst(o.x, top * 0.5, z, 8, 0xffffff, 6, 4, 0.2, 0.5, 18);
    },

    // Picks up the coins the runner touches and returns how many. With the
    // magnet on, coins ahead fly to the runner first.
    collect(runner, dt, magnet) {
      let n = 0;
      const pull = Math.min(1, dt * 10);
      const cy = runner.y + runner.height * 0.5;
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (!c.active) continue;
        if (magnet && !c.pull && c.z > -MAGNET_REACH && c.z < 1) c.pull = true;
        if (c.pull) {
          c.x += (runner.x - c.x) * pull;
          c.y += (cy - c.y) * pull;
          c.z += (0 - c.z) * pull;
        }
        if (Math.abs(c.z) > 0.7 || Math.abs(c.x - runner.x) > 0.8) continue;
        if (c.y < runner.y - 0.4 || c.y > runner.y + runner.height + 0.4) continue;
        c.active = false;
        fx.burst(c.x, c.y, c.z, 5, 0xffe066, 3.5, 2, 0.12, 0.3, 4);
        n++;
      }
      return n;
    },

    // The power-up the runner touches (MAGNET or SHIELD), or -1.
    pickup(runner) {
      for (let i = 0; i < pickups.length; i++) {
        const p = pickups[i];
        if (!p.active) continue;
        if (Math.abs(p.z) > 0.9 || Math.abs(p.x - runner.x) > 1.0) continue;
        p.active = false;
        fx.burst(p.x, 1.15, p.z, 14, p.kind === MAGNET ? 0xff5a5f : 0x5fe0ff, 5, 3, 0.18, 0.5, 2);
        return p.kind;
      }
      return -1;
    },
  };

  return track;
}
