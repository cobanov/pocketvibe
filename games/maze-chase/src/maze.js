// The maze: the grid the game logic asks about, and its look. Each layout is
// built once into a wall mesh (walls with glowing edges) and a small floor
// texture with the glow of the walls baked in, and swapped in when that maze
// comes up. Dots and power cores are one InstancedMesh each.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASE_X, DOOR_Y, EXIT_Y, H, MAZES, W } from './mazes.js';
import { DX, DY, glowDisc, glowMaterial, paint, worldX, worldZ, wrapX } from './shared.js';

export const OPEN = 0;
export const WALL = 1;
export const DOOR = 2;
export const BASE = 3;

const CELLS = W * H;
const T = 0.44; // wall thickness: corridors look wider than one cell
const WALL_H = 0.5;
const RIM_W = 0.08; // the glowing strip along every wall edge
const RIM_H = 0.035;
const FLOOR_TW = 256; // floor texture size, for the baked glow
const FLOOR_TH = 128;
const GLOW_REACH = 2; // cells: every floor texel is closer to a wall than this
const PLATFORM_MARGIN = 0.75; // floor beyond the outer wall centres
const PLATFORM_H = 0.9;
const GROUND_Y = -3.2; // the grid far below the platform
const GRID_STEP = 2;
const MAX_DOTS = 320;
const DOT_Y = 0.34;
const DOT_R = 0.17; // bigger than the corridors need, so dots read on a 3.4" screen
const CORES = 4;
const CORE_Y = 0.46;

const FLOOR = new THREE.Color(0x080b1e);
const WHITE = new THREE.Color(0xffffff);

// ---- Building a layout ----------------------------------------------------

const tmpColor = new THREE.Color();

// A box from (x0, z0) to (x1, z1) in cell coordinates, y0 to y1 high, with
// lighting baked into its vertex colors (the walls use an unlit material):
// tops get `top`, sides fade from `lo` at the floor to `hi` at the top, and
// faces turned away from the camera are a little darker. The bottom and the
// face looking up the maze are left out: the camera is always above the
// maze and in front of it, so it never sees them.
function slab(x0, z0, x1, z1, y0, y1, top, lo, hi) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  // BoxGeometry's faces are +x, -x, +y, -y, +z, -z, six indices each.
  const index = g.index.array;
  const kept = [];
  for (let f = 0; f < 6; f++) {
    if (f === 3 || f === 5) continue;
    for (let k = 0; k < 6; k++) kept.push(index[f * 6 + k]);
  }
  g.setIndex(kept);
  g.clearGroups();
  g.translate(worldX((x0 + x1) / 2), (y0 + y1) / 2, worldZ((z0 + z1) / 2));
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i);
    if (ny > 0.5) tmpColor.copy(top);
    else if (ny < -0.5) tmpColor.setRGB(0, 0, 0);
    else {
      const k = (pos.getY(i) - y0) / (y1 - y0);
      tmpColor.copy(lo).lerp(hi, k);
      const nz = nor.getZ(i);
      tmpColor.multiplyScalar(nz > 0.5 ? 1 : nz < -0.5 ? 0.55 : 0.78);
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function buildLayout(layout) {
  const rows = layout.rows;
  const isWall = (x, y) => x >= 0 && x < W && y >= 0 && y < H && rows[y][x] === '#';
  const hue = new THREE.Color(layout.hue);
  const top = hue.clone().multiplyScalar(0.3);
  const lo = hue.clone().multiplyScalar(0.1);
  const hi = hue.clone().multiplyScalar(0.55);
  const rim = hue.clone().lerp(WHITE, 0.45);

  // Wall bodies: one bar per run of wall cells along a row or a column, a post
  // for a lone cell and a filler square inside every 2x2 block, so thick walls
  // read as solid shapes. Rects are kept for the floor glow.
  const rects = [];
  const h = T / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isWall(x, y)) continue;
      if (!isWall(x - 1, y) && isWall(x + 1, y)) {
        let e = x;
        while (isWall(e + 1, y)) e++;
        rects.push([x - h, y - h, e + h, y + h]);
      }
      if (!isWall(x, y - 1) && isWall(x, y + 1)) {
        let e = y;
        while (isWall(x, e + 1)) e++;
        rects.push([x - h, y - h, x + h, e + h]);
      }
      if (!isWall(x - 1, y) && !isWall(x + 1, y) && !isWall(x, y - 1) && !isWall(x, y + 1)) {
        rects.push([x - h, y - h, x + h, y + h]);
      }
      if (isWall(x + 1, y) && isWall(x, y + 1) && isWall(x + 1, y + 1)) {
        rects.push([x, y, x + 1, y + 1]);
      }
    }
  }
  const parts = rects.map((r) => slab(r[0], r[1], r[2], r[3], 0, WALL_H, top, lo, hi));

  // Glowing edges: every stretch of wall outline that faces open floor, as
  // segments keyed by their line, merged where they touch.
  const lines = new Map();
  function edge(side, line, a, b) {
    const key = `${side}|${Math.round(line * 1000)}`;
    if (!lines.has(key)) lines.set(key, { side, line, segs: [] });
    lines.get(key).segs.push(a < b ? [a, b] : [b, a]);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isWall(x, y)) continue;
      for (let p = 0; p < 4; p++) {
        const along = DX[p] === 0; // the edge runs along x when it faces up or down
        const line = along ? y + DY[p] * h : x + DX[p] * h;
        const c = along ? x : y;
        // The middle square of the cell.
        if (!isWall(x + DX[p], y + DY[p])) edge(p, line, c - h, c + h);
        // The arms reaching towards wall neighbours, unless a filler covers them.
        for (let d = 0; d < 4; d++) {
          if ((d & 1) === (p & 1) || !isWall(x + DX[d], y + DY[d])) continue;
          if (isWall(x + DX[p], y + DY[p]) && isWall(x + DX[p] + DX[d], y + DY[p] + DY[d])) continue;
          const s = along ? DX[d] : DY[d];
          edge(p, line, c + s * h, c + s * 0.5);
        }
      }
    }
  }
  for (const { side, line, segs } of lines.values()) {
    segs.sort((a, b) => a[0] - b[0]);
    let cur = segs[0].slice();
    for (let i = 1; i <= segs.length; i++) {
      const s = segs[i];
      if (s && s[0] <= cur[1] + 1e-4) {
        cur[1] = Math.max(cur[1], s[1]);
        continue;
      }
      // The strip sits just inside the edge, on top of the wall.
      const inward = side === 0 || side === 1 ? -RIM_W : RIM_W;
      const l0 = Math.min(line, line + inward);
      const l1 = Math.max(line, line + inward);
      if (side & 1) parts.push(slab(cur[0], l0, cur[1], l1, WALL_H, WALL_H + RIM_H, rim, hi, rim));
      else parts.push(slab(l0, cur[0], l1, cur[1], WALL_H, WALL_H + RIM_H, rim, hi, rim));
      if (s) cur = s.slice();
    }
  }

  // The base door, and a bright line on the floor across each tunnel mouth.
  const door = new THREE.Color(0xff9ad8);
  parts.push(slab(BASE_X - 1 + h, DOOR_Y - 0.07, BASE_X + 1 - h, DOOR_Y + 0.07, 0.05, 0.28, door, door, door));
  for (let y = 0; y < H; y++) {
    if (rows[y][0] === '#') continue;
    parts.push(slab(-0.56, y - 0.5, -0.48, y + 0.5, 0, 0.03, rim, rim, rim));
    parts.push(slab(W - 0.52, y - 0.5, W - 0.44, y + 0.5, 0, 0.03, rim, rim, rim));
  }

  // The platform the maze stands on: dark sides with a bright top edge and a
  // dimmer one at the bottom, floating over the grid far below.
  const m = PLATFORM_MARGIN;
  const x0 = -m;
  const x1 = W - 1 + m;
  const z0 = -m;
  const z1 = H - 1 + m;
  const side = hue.clone().multiplyScalar(0.06);
  const sideHi = hue.clone().multiplyScalar(0.3);
  const dim = hue.clone().multiplyScalar(0.55);
  parts.push(slab(x0, z0, x1, z1, -PLATFORM_H, -0.03, side, side, sideHi));
  parts.push(slab(x0 - 0.04, z1, x1 + 0.04, z1 + 0.06, -0.1, 0, rim, rim, rim));
  parts.push(slab(x0 - 0.06, z0 - 0.04, x0, z1 + 0.04, -0.1, 0, rim, rim, rim));
  parts.push(slab(x1, z0 - 0.04, x1 + 0.06, z1 + 0.04, -0.1, 0, rim, rim, rim));
  parts.push(slab(x0 - 0.04, z1, x1 + 0.04, z1 + 0.05, -PLATFORM_H, -PLATFORM_H + 0.06, dim, dim, dim));

  // Thousands of triangles: non-indexed, which WebKit draws without a
  // per-frame cost for the index.
  const merged = mergeGeometries(parts);
  const walls = merged.toNonIndexed();
  merged.dispose();
  for (const g of parts) g.dispose();

  return { walls, floor: floorTexture(rects, hue) };
}

// The floor's look: dark, with the glow of the walls baked into a small
// texture (texel colors by distance to the nearest wall), so the walls cast
// a soft neon light on it. Two triangles draw it.
function floorTexture(rects, hue) {
  const m = PLATFORM_MARGIN;
  const fw = W - 1 + m * 2;
  const fd = H - 1 + m * 2;
  // The walls near each cell, so a texel only measures against a few.
  const near = [];
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      const list = [];
      for (let k = 0; k < rects.length; k++) {
        const r = rects[k];
        const dx = Math.max(r[0] - cx - 0.5, 0, cx - 0.5 - r[2]);
        const dy = Math.max(r[1] - cy - 0.5, 0, cy - 0.5 - r[3]);
        if (dx < GLOW_REACH && dy < GLOW_REACH) list.push(r);
      }
      near.push(list);
    }
  }
  const data = new Uint8Array(FLOOR_TW * FLOOR_TH * 4);
  for (let j = 0; j < FLOOR_TH; j++) {
    // Row 0 is the near edge of the floor (v = 0).
    const cy = H - 1 + m - ((j + 0.5) / FLOOR_TH) * fd;
    for (let i = 0; i < FLOOR_TW; i++) {
      const cx = -m + ((i + 0.5) / FLOOR_TW) * fw;
      const list = near[Math.min(H - 1, Math.max(0, Math.round(cy))) * W + Math.min(W - 1, Math.max(0, Math.round(cx)))];
      let d = GLOW_REACH;
      for (let k = 0; k < list.length; k++) {
        const r = list[k];
        const dx = Math.max(r[0] - cx, 0, cx - r[2]);
        const dy = Math.max(r[1] - cy, 0, cy - r[3]);
        d = Math.min(d, Math.hypot(dx, dy));
      }
      const glow = 0.42 * Math.exp(-d * 3.6) + 0.045 * Math.exp(-d * 0.9);
      tmpColor.setRGB(FLOOR.r + hue.r * glow, FLOOR.g + hue.g * glow, FLOOR.b + hue.b * glow).convertLinearToSRGB();
      const o = (j * FLOOR_TW + i) * 4;
      data[o] = Math.round(Math.min(1, tmpColor.r) * 255);
      data[o + 1] = Math.round(Math.min(1, tmpColor.g) * 255);
      data[o + 2] = Math.round(Math.min(1, tmpColor.b) * 255);
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, FLOOR_TW, FLOOR_TH);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// ---- Dots and cores -------------------------------------------------------

function coreGeometry() {
  // Polyhedra come without an index and the torus with one; mergeGeometries
  // needs them alike, so the torus is flattened.
  const gem = paint(new THREE.IcosahedronGeometry(0.31, 0), 0xfff6d8);
  const ringIndexed = new THREE.TorusGeometry(0.5, 0.055, 3, 16);
  ringIndexed.rotateX(Math.PI / 2 - 0.5);
  const ring = paint(ringIndexed.toNonIndexed(), 0xffb347);
  const g = mergeGeometries([gem, ring]);
  gem.dispose();
  ring.dispose();
  ringIndexed.dispose();
  return g;
}

// Thin flat strips in a grid, merged; its material takes the maze's color.
function groundGrid() {
  const parts = [];
  for (let x = -40; x <= 40; x += GRID_STEP) {
    const g = new THREE.PlaneGeometry(0.07, 70);
    g.rotateX(-Math.PI / 2);
    g.translate(x, GROUND_Y, -12);
    parts.push(g);
  }
  for (let z = -46; z <= 22; z += GRID_STEP) {
    const g = new THREE.PlaneGeometry(80, 0.07);
    g.rotateX(-Math.PI / 2);
    g.translate(0, GROUND_Y, z);
    parts.push(g);
  }
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

export function createMaze(scene) {
  const grid = new Uint8Array(CELLS);
  const dots = new Uint8Array(CELLS); // 1 dot, 2 power core
  const slot = new Int16Array(CELLS); // instance index of a cell's dot or core
  const tunnel = new Uint8Array(CELLS);
  const toExit = new Int16Array(CELLS); // steps to the cell above the door
  const queue = new Int16Array(CELLS);
  // All layouts are built up front, so a level change never stalls a frame.
  const built = MAZES.map(buildLayout);

  const wallMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const walls = new THREE.Mesh(new THREE.BufferGeometry(), wallMaterial);
  const floorGeometry = new THREE.PlaneGeometry(W - 1 + PLATFORM_MARGIN * 2, H - 1 + PLATFORM_MARGIN * 2);
  floorGeometry.rotateX(-Math.PI / 2);
  floorGeometry.translate(0, -0.01, 0);
  const floorMaterial = new THREE.MeshBasicMaterial({ map: built[0].floor });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  const gridMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 });
  scene.add(new THREE.Mesh(groundGrid(), gridMaterial), floor, walls);

  const dotMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(DOT_R, 0),
    new THREE.MeshLambertMaterial({ color: 0xffe6c0, emissive: 0xc8904e }),
    MAX_DOTS,
  );
  dotMesh.count = 0;
  scene.add(dotMesh);

  const coreMesh = new THREE.InstancedMesh(
    coreGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x9a6a30 }),
    CORES,
  );
  coreMesh.frustumCulled = false;
  scene.add(coreMesh);
  const coreGlow = new THREE.InstancedMesh(glowDisc(1.05), glowMaterial(0xff9a2e, 0.85), CORES);
  coreGlow.frustumCulled = false;
  scene.add(coreGlow);
  const coreCell = new Int16Array(CORES);
  let cores = 0;

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const dummy = new THREE.Object3D();
  let time = 0;

  function bfsToExit() {
    toExit.fill(-1);
    const start = EXIT_Y * W + BASE_X;
    toExit[start] = 0;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let d = 0; d < 4; d++) {
        const ny = cy + DY[d];
        if (ny < 0 || ny >= H) continue;
        const n = ny * W + wrapX(cx + DX[d]);
        if (grid[n] !== OPEN || toExit[n] >= 0) continue;
        toExit[n] = toExit[c] + 1;
        queue[tail++] = n;
      }
    }
  }

  const maze = {
    index: 0,
    name: '',
    hue: 0,
    dotsLeft: 0,
    dotsTotal: 0,

    load(i) {
      const layout = MAZES[i % MAZES.length];
      this.index = i % MAZES.length;
      this.name = layout.name;
      this.hue = layout.hue;
      walls.geometry = built[this.index].walls;
      floorMaterial.map = built[this.index].floor;
      gridMaterial.color.setHex(layout.hue).multiplyScalar(0.32);

      const rows = layout.rows;
      tunnel.fill(0);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ch = rows[y][x];
          grid[y * W + x] = ch === '#' ? WALL : ch === '-' ? DOOR : ch === 'B' ? BASE : OPEN;
        }
        // Side tunnels: the dotless stretch from the edge inwards.
        if (rows[y][0] !== '#') {
          for (let x = 0; x < W / 2 && rows[y][x] === ' '; x++) tunnel[y * W + x] = 1;
          for (let x = W - 1; x > W / 2 && rows[y][x] === ' '; x--) tunnel[y * W + x] = 1;
        }
      }
      bfsToExit();
      this.refill();
      this.flash(0);
    },

    // Puts every dot and core of the current layout back.
    refill() {
      const rows = MAZES[this.index].rows;
      let n = 0;
      cores = 0;
      dots.fill(0);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ch = rows[y][x];
          const c = y * W + x;
          if (ch === '.') {
            dots[c] = 1;
            slot[c] = n;
            dummy.position.set(worldX(x), DOT_Y, worldZ(y));
            dummy.rotation.set(0, 0.6, 0);
            dummy.scale.set(1, 1.2, 1);
            dummy.updateMatrix();
            dotMesh.setMatrixAt(n++, dummy.matrix);
          } else if (ch === 'o' && cores < CORES) {
            dots[c] = 2;
            slot[c] = cores;
            coreCell[cores++] = c;
          }
        }
      }
      dotMesh.count = n;
      dotMesh.instanceMatrix.needsUpdate = true;
      dotMesh.computeBoundingSphere();
      this.dotsTotal = n + cores;
      this.dotsLeft = this.dotsTotal;
    },

    // What is in a cell: WALL above and below the maze, columns wrap around.
    cell(cx, cy) {
      if (cy < 0 || cy >= H) return WALL;
      return grid[cy * W + wrapX(cx)];
    },

    // True where the player and roaming drones may go.
    open(cx, cy) {
      return cy >= 0 && cy < H && grid[cy * W + wrapX(cx)] === OPEN;
    },

    isTunnel(cx, cy) {
      return cy >= 0 && cy < H && tunnel[cy * W + wrapX(cx)] === 1;
    },

    toExit(cx, cy) {
      if (cy < 0 || cy >= H) return -1;
      return toExit[cy * W + wrapX(cx)];
    },

    dotAt(cx, cy) {
      if (cy < 0 || cy >= H) return 0;
      return dots[cy * W + wrapX(cx)];
    },

    // Removes the dot or core in a cell. Returns 0 (nothing), 1 dot or 2 core.
    eat(cx, cy) {
      if (cy < 0 || cy >= H) return 0;
      const c = cy * W + wrapX(cx);
      const kind = dots[c];
      if (kind === 0) return 0;
      dots[c] = 0;
      this.dotsLeft--;
      if (kind === 1) {
        dotMesh.setMatrixAt(slot[c], ZERO);
        dotMesh.instanceMatrix.needsUpdate = true;
      }
      return kind;
    },

    // Copies every dot and core cell into `out` (for the demo's pathfinding).
    forEachDot(out) {
      let n = 0;
      for (let c = 0; c < CELLS; c++) if (dots[c] !== 0) out[n++] = c;
      return n;
    },

    update(dt) {
      time += dt;
      for (let i = 0; i < CORES; i++) {
        const c = coreCell[i];
        if (i >= cores || dots[c] !== 2) {
          coreMesh.setMatrixAt(i, ZERO);
          coreGlow.setMatrixAt(i, ZERO);
          continue;
        }
        const cx = c % W;
        const x = worldX(cx);
        const z = worldZ((c - cx) / W);
        const pulse = 1 + Math.sin(time * 7 + i) * 0.14;
        dummy.position.set(x, CORE_Y + Math.sin(time * 3 + i) * 0.05, z);
        dummy.rotation.set(0, time * 2.2 + i, 0);
        dummy.scale.setScalar(pulse);
        dummy.updateMatrix();
        coreMesh.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, 0.02, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(0.85 + Math.sin(time * 7 + i) * 0.15);
        dummy.updateMatrix();
        coreGlow.setMatrixAt(i, dummy.matrix);
      }
      coreMesh.instanceMatrix.needsUpdate = true;
      coreGlow.instanceMatrix.needsUpdate = true;
    },

    // 0 is the normal look; higher values wash the walls out towards white
    // (the flashing when a maze is cleared).
    flash(k) {
      const v = 1 + k * 2.2;
      wallMaterial.color.setRGB(v, v, v);
    },
  };

  return maze;
}
