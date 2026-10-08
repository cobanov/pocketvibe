// Coins: a fixed pool drawn as one InstancedMesh, placed in shapes (lines,
// arcs, blocks, waves, diagonals) by level.js. A coin that would touch a
// zapper is simply left out.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CEIL_Y, DESPAWN_X, HERO_X, cyl } from './shared.js';

const MAX_COINS = 160;
const GAP = 0.78; // distance between neighbouring coins in a shape
const LOW = 0.6; // lowest and highest coin centres
const HIGH = CEIL_Y - 0.6;

function coinGeometry() {
  return mergeGeometries([
    cyl(0.3, 0.08, 12, 'z', 0, 0, 0, 0xffcf33),
    cyl(0.2, 0.1, 12, 'z', 0, 0, 0, 0xf3a51c),
  ]);
}

export function createCoins(scene, particles, zappers) {
  const mesh = new THREE.InstancedMesh(
    coinGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6b4600 }),
    MAX_COINS,
  );
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  scene.add(mesh);

  const cx = new Float32Array(MAX_COINS);
  const cy = new Float32Array(MAX_COINS);
  const alive = new Uint8Array(MAX_COINS);
  const dummy = new THREE.Object3D();
  let spin = 0;

  function add(x, y) {
    if (y < LOW || y > HIGH || zappers.blocks(x, y, 0.75)) return;
    for (let i = 0; i < MAX_COINS; i++) {
      if (alive[i]) continue;
      alive[i] = 1;
      cx[i] = x;
      cy[i] = y;
      return;
    }
  }

  function draw() {
    let n = 0;
    for (let i = 0; i < MAX_COINS; i++) {
      if (!alive[i]) continue;
      dummy.position.set(cx[i], cy[i], 0);
      dummy.rotation.y = spin + cx[i] * 0.4;
      dummy.updateMatrix();
      mesh.setMatrixAt(n++, dummy.matrix);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    GAP,
    LOW,
    HIGH,

    // Shapes. x is the left end; each returns its width.
    line(x, y, n) {
      for (let i = 0; i < n; i++) add(x + i * GAP, y);
      return (n - 1) * GAP;
    },
    arc(x, y, n, h) {
      for (let i = 0; i < n; i++) add(x + i * GAP, y + Math.sin((Math.PI * i) / (n - 1)) * h);
      return (n - 1) * GAP;
    },
    block(x, y, cols, rows) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add(x + c * GAP, y + r * GAP);
      return (cols - 1) * GAP;
    },
    wave(x, y, n, amp) {
      for (let i = 0; i < n; i++) add(x + i * GAP, y + Math.sin(i * 0.75) * amp);
      return (n - 1) * GAP;
    },
    diagonal(x, y, n, rise) {
      for (let i = 0; i < n; i++) add(x + i * GAP, y + i * rise);
      return (n - 1) * GAP;
    },

    clear() {
      alive.fill(0);
      draw();
    },

    update(dt, move) {
      spin += dt * 5;
      for (let i = 0; i < MAX_COINS; i++) {
        if (!alive[i]) continue;
        cx[i] -= move;
        if (cx[i] < DESPAWN_X) alive[i] = 0;
      }
      draw();
    },

    // Picks up the coins the hero touches and returns how many.
    collect(hero) {
      let n = 0;
      const bottom = hero.y - 0.15;
      const top = hero.y + 1.6;
      for (let i = 0; i < MAX_COINS; i++) {
        if (!alive[i]) continue;
        if (Math.abs(cx[i] - HERO_X) > 0.62 || cy[i] < bottom || cy[i] > top) continue;
        alive[i] = 0;
        n++;
        particles.emit(cx[i], cy[i], 0.4, 2.5, 3, 0.3, 0.2, 0xffffff, 0xffc21a, 6);
        particles.emit(cx[i], cy[i], 0.4, -1, 4, 0.3, 0.16, 0xfff6b0, 0xffa500, 6);
        particles.emit(cx[i], cy[i], 0.4, 1, -2, 0.25, 0.14, 0xffffff, 0xffd23f, 0);
      }
      return n;
    },
  };
}
