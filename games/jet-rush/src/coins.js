// Coins: a fixed pool drawn as one InstancedMesh, placed in shapes (lines,
// arcs, blocks, waves, diagonals, zigzags, rings, arrows, diamonds) by
// level.js. A coin that would touch a zapper is simply left out, and only the
// coins on screen are drawn.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAM_X, CEIL_Y, DESPAWN_X, HERO_X, VIEW_HALF_W, cyl } from './shared.js';

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

// sideRoom: how much further than on the 3:2 screen the view reaches to each
// side; coins beyond the edges are not drawn.
export function createCoins(scene, particles, zappers, sideRoom = 0) {
  const minX = CAM_X - VIEW_HALF_W - sideRoom - 0.5;
  const maxX = CAM_X + VIEW_HALF_W + sideRoom + 0.5;
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
      if (!alive[i] || cx[i] < minX || cx[i] > maxX) continue;
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
    // Sharp ups and downs, amp above and below y.
    zigzag(x, y, n, amp) {
      for (let i = 0; i < n; i++) {
        const p = (i % 6) / 6;
        add(x + i * GAP, y + amp * (p < 0.5 ? 4 * p - 1 : 3 - 4 * p));
      }
      return (n - 1) * GAP;
    },
    // A circle of coins of radius r around (x + r, y).
    ring(x, y, r) {
      const n = Math.round((2 * Math.PI * r) / GAP);
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        add(x + r - Math.cos(a) * r, y + Math.sin(a) * r);
      }
      return 2 * r;
    },
    // An arrow pointing ahead: two arms of k + 1 coins meeting at the tip.
    chevron(x, y, k, h) {
      for (let i = 0; i < k; i++) {
        add(x + i * GAP, y + (k - i) * h);
        add(x + i * GAP, y - (k - i) * h);
      }
      add(x + k * GAP, y);
      return k * GAP;
    },
    // A filled diamond, 2k + 1 columns wide.
    diamond(x, y, k) {
      for (let c = 0; c <= 2 * k; c++) {
        const m = k + 1 - Math.abs(c - k);
        for (let j = 0; j < m; j++) add(x + c * GAP, y + (j - (m - 1) / 2) * GAP);
      }
      return 2 * k * GAP;
    },
    // Coins along a straight path from (x0, y0) to (x1, y1), ends included.
    trail(x0, y0, x1, y1, spacing = GAP) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / spacing));
      for (let i = 0; i <= n; i++) add(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
      return x1 - x0;
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
