// Obstacles and coins: fixed pools drawn with one InstancedMesh per kind.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESPAWN_Z, LANES, SPAWN_Z, box } from './shared.js';

export const PLAYER_HALF_W = 0.35;
export const PLAYER_HALF_D = 0.3;

const LOW = 0; // a hurdle: jump over it
const BAR = 1; // a bar at head height: slide under it
const TALL = 2; // a wall: change lanes

// Hit boxes, relative to the obstacle's position on the ground.
const KINDS = [
  { halfW: 0.85, halfD: 0.3, bottom: 0, top: 0.9, max: 30 },
  { halfW: 1.0, halfD: 0.2, bottom: 1.0, top: 1.6, max: 30 },
  { halfW: 0.85, halfD: 0.5, bottom: 0, top: 2.6, max: 30 },
];

function kindGeometry(kind) {
  if (kind === LOW) {
    return mergeGeometries([
      box(1.7, 0.35, 0.5, 0, 0.72, 0, 0xf08a24),
      box(0.15, 0.55, 0.15, -0.7, 0.27, 0, 0xdddddd),
      box(0.15, 0.55, 0.15, 0.7, 0.27, 0, 0xdddddd),
    ]);
  }
  if (kind === BAR) {
    return mergeGeometries([
      box(2.0, 0.5, 0.3, 0, 1.35, 0, 0xf2c230),
      box(0.15, 1.6, 0.15, -1.0, 0.8, 0, 0x333333),
      box(0.15, 1.6, 0.15, 1.0, 0.8, 0, 0x333333),
    ]);
  }
  return mergeGeometries([
    box(1.7, 2.3, 1.0, 0, 1.15, 0, 0xc8443a),
    box(1.75, 0.3, 1.05, 0, 2.45, 0, 0x8e2c26),
  ]);
}

const MAX_COINS = 80;
const COIN_Y = 0.9;

export function createTrack(scene) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const meshes = KINDS.map((k, i) => {
    const mesh = new THREE.InstancedMesh(kindGeometry(i), material, k.max);
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });

  const coinGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 10);
  coinGeometry.rotateX(Math.PI / 2);
  const coinMesh = new THREE.InstancedMesh(
    coinGeometry,
    new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6b4a00 }),
    MAX_COINS,
  );
  coinMesh.frustumCulled = false;
  coinMesh.count = 0;
  scene.add(coinMesh);

  const obstacles = [];
  for (let k = 0; k < KINDS.length; k++) {
    for (let i = 0; i < KINDS[k].max; i++) obstacles.push({ active: false, kind: k, x: 0, z: 0 });
  }
  const coins = Array.from({ length: MAX_COINS }, () => ({ active: false, x: 0, y: 0, z: 0 }));

  const counts = new Int32Array(KINDS.length);
  const matrix = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  let untilNextRow = 0;
  let spin = 0;

  function addObstacle(kind, x, z) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.active && o.kind === kind) {
        o.active = true;
        o.x = x;
        o.z = z;
        return;
      }
    }
  }

  function addCoin(x, y, z) {
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active) {
        c.active = true;
        c.x = x;
        c.y = y;
        c.z = z;
        return;
      }
    }
  }

  function spacing(difficulty) {
    return 22 - difficulty * 8;
  }

  // One row of obstacles across the road. At least one lane is always open.
  function spawnRow(z, difficulty) {
    const free = Math.floor(Math.random() * 3);
    const both = Math.random() < 0.3 + difficulty * 0.45;
    const single = (free + 1 + Math.floor(Math.random() * 2)) % 3;
    let hurdleLane = -1;

    for (let lane = 0; lane < 3; lane++) {
      if (lane === free || (!both && lane !== single)) continue;
      const r = Math.random();
      const kind = r < 0.4 ? LOW : r < 0.7 + difficulty * 0.1 ? BAR : TALL;
      addObstacle(kind, LANES[lane], z);
      if (kind === LOW) hurdleLane = lane;
    }

    if (hurdleLane >= 0 && Math.random() < 0.4) {
      // An arc of coins over a hurdle rewards the jump.
      const x = LANES[hurdleLane];
      addCoin(x, 1.5, z + 2.2);
      addCoin(x, 2.2, z);
      addCoin(x, 1.5, z - 2.2);
    } else if (Math.random() < 0.6) {
      // A line of coins leading into the open lane.
      for (let i = 0; i < 5; i++) addCoin(LANES[free], COIN_Y, z + 2 + i * 2);
    }
  }

  function clear() {
    for (let i = 0; i < obstacles.length; i++) obstacles[i].active = false;
    for (let i = 0; i < coins.length; i++) coins[i].active = false;
  }

  function draw() {
    counts.fill(0);
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o.active) continue;
      matrix.makeTranslation(o.x, 0, o.z);
      meshes[o.kind].setMatrixAt(counts[o.kind]++, matrix);
    }
    for (let k = 0; k < meshes.length; k++) {
      meshes[k].count = counts[k];
      meshes[k].instanceMatrix.needsUpdate = true;
    }

    let n = 0;
    for (let i = 0; i < coins.length; i++) {
      const c = coins[i];
      if (!c.active) continue;
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.y = spin + c.z * 0.3;
      dummy.updateMatrix();
      coinMesh.setMatrixAt(n++, dummy.matrix);
    }
    coinMesh.count = n;
    coinMesh.instanceMatrix.needsUpdate = true;
  }

  return {
    clear() {
      clear();
      draw();
    },

    // Fills the road ahead with rows so a new run starts with something to do.
    reset() {
      clear();
      let z = -34;
      while (z > SPAWN_Z) {
        spawnRow(z, 0);
        z -= spacing(0);
      }
      untilNextRow = SPAWN_Z - z;
      draw();
    },

    // Moves everything towards the camera by `move` units and spawns new rows.
    // difficulty goes from 0 (start) to 1 (top speed).
    update(move, difficulty, dt) {
      spin += dt * 4;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o.active) continue;
        o.z += move;
        if (o.z > DESPAWN_Z) o.active = false;
      }
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (!c.active) continue;
        c.z += move;
        if (c.z > DESPAWN_Z) c.active = false;
      }
      untilNextRow -= move;
      if (untilNextRow <= 0) {
        spawnRow(SPAWN_Z - untilNextRow, difficulty);
        untilNextRow += spacing(difficulty);
      }
      draw();
    },

    // True if the player touches an obstacle.
    hits(player) {
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (!o.active) continue;
        const k = KINDS[o.kind];
        if (Math.abs(o.z) > k.halfD + PLAYER_HALF_D) continue;
        if (Math.abs(o.x - player.x) > k.halfW + PLAYER_HALF_W) continue;
        if (player.y >= k.top || player.y + player.height <= k.bottom) continue;
        return true;
      }
      return false;
    },

    // Removes the coins the player touches and returns how many there were.
    collect(player) {
      let n = 0;
      for (let i = 0; i < coins.length; i++) {
        const c = coins[i];
        if (!c.active) continue;
        if (Math.abs(c.z) > 0.7 || Math.abs(c.x - player.x) > 0.8) continue;
        if (c.y < player.y - 0.4 || c.y > player.y + player.height + 0.4) continue;
        c.active = false;
        n++;
      }
      return n;
    },
  };
}
