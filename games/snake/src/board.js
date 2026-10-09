// The static scenery: checker board, low walls, the wooden plinth under it,
// the grass around it and a ring of trees, rocks and flowers, merged into one
// vertex-colored mesh. The checker floor is one quad with a tiny texture (a
// quad per cell cost 768 triangles), and each board's blocks are a merged
// mesh of their own, shown while that board is chosen.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLS, ROWS, box, paint } from './shared.js';

const WALL_T = 0.6; // wall thickness
const WALL_H = 0.7;
const PLINTH_H = 1.4;

const TILE_A = 0xfbefc8;
const TILE_B = 0xeed49a;
const WALL = 0x4f8fe8;
const WALL_TOP = 0x8cc0ff;
const POST = 0xff8a3d;
const WOOD = 0xc98b55;
const WOOD_DARK = 0x9c6438;
const GRASS = 0x79c46a;

// Small deterministic random, so the decoration looks the same every time.
let seed = 7;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

function place(geometry, x, y, z, scale, rotY) {
  tmpQuat.setFromAxisAngle(yAxis, rotY);
  tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(scale, scale, scale));
  geometry.applyMatrix4(tmpMatrix);
  return geometry;
}

// Trees leave out the caps of their trunk and cones: from above they are
// never seen, and dropping them takes a third of each tree's triangles.
function tree(x, y, z, s) {
  const trunk = new THREE.CylinderGeometry(0.18, 0.24, 1, 5, 1, true);
  trunk.translate(0, 0.5, 0);
  const low = new THREE.ConeGeometry(1.1, 1.6, 7, 1, true);
  low.translate(0, 1.5, 0);
  const high = new THREE.ConeGeometry(0.8, 1.3, 7, 1, true);
  high.translate(0, 2.4, 0);
  const rot = rand() * Math.PI;
  return [
    place(paint(trunk, 0x7a5232), x, y, z, s, rot),
    place(paint(low, 0x2f9e4f), x, y, z, s, rot),
    place(paint(high, 0x45b85c), x, y, z, s, rot),
  ];
}

function bush(x, y, z, s) {
  const g = new THREE.IcosahedronGeometry(0.7, 0);
  g.scale(1, 0.75, 1);
  g.translate(0, 0.4, 0);
  return [place(paint(g, 0x3fae55), x, y, z, s, rand() * 3)];
}

function rock(x, y, z, s) {
  const g = new THREE.DodecahedronGeometry(0.55, 0);
  g.scale(1.2, 0.7, 1);
  g.translate(0, 0.2, 0);
  return [place(paint(g, 0xa9b3bd), x, y, z, s, rand() * 3)];
}

function flower(x, y, z) {
  const hex = [0xff6b8a, 0xffe14d, 0xffffff, 0xb784ff][Math.floor(rand() * 4)];
  return [box(0.1, 0.45, 0.1, x, y + 0.22, z, 0x3a8f3a), box(0.4, 0.16, 0.4, x, y + 0.5, z, hex)];
}

// The checker floor: one quad, one texel per cell (the texture is 32 wide, a
// power of two, and the quad shows the first COLS columns of it).
function floorMesh() {
  const texW = 32;
  const data = new Uint8Array(texW * ROWS * 4);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < texW; tx++) {
      // Texture rows go up the quad, board rows towards the camera.
      const hex = (tx + ROWS - 1 - ty) % 2 === 0 ? TILE_A : TILE_B;
      const i = (ty * texW + tx) * 4;
      data[i] = hex >> 16;
      data[i + 1] = (hex >> 8) & 255;
      data[i + 2] = hex & 255;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, texW, ROWS);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  const g = new THREE.PlaneGeometry(COLS, ROWS);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (COLS / texW));
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: texture }));
}

// A board's blocks as few boxes as possible: each block grows right as far
// as it can, then down while the rows below match.
function blocksGeometry(blocks) {
  const parts = [];
  const used = new Uint8Array(blocks.length);
  for (let z = 0; z < ROWS; z++) {
    for (let x = 0; x < COLS; x++) {
      const i = z * COLS + x;
      if (!blocks[i] || used[i]) continue;
      let w = 1;
      while (x + w < COLS && blocks[i + w] && !used[i + w]) w++;
      let h = 1;
      for (; z + h < ROWS; h++) {
        let full = true;
        for (let k = 0; k < w && full; k++) full = blocks[(z + h) * COLS + x + k] && !used[(z + h) * COLS + x + k];
        if (!full) break;
      }
      for (let dz = 0; dz < h; dz++) for (let k = 0; k < w; k++) used[(z + dz) * COLS + x + k] = 1;
      const cx = x - COLS / 2 + w / 2;
      const cz = z - ROWS / 2 + h / 2;
      parts.push(box(w - 0.12, WALL_H, h - 0.12, cx, WALL_H / 2, cz, WALL));
      parts.push(box(w - 0.04, 0.12, h - 0.04, cx, WALL_H + 0.06, cz, WALL_TOP));
    }
  }
  if (parts.length === 0) return null;
  const geometry = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return geometry;
}

// One random prop at (x, z) on the grass; trees only when tall is set.
function prop(parts, x, y, z, tall) {
  const r = rand();
  const s = 0.7 + rand() * 0.6;
  let list;
  if (tall && r < 0.4) list = tree(x, y, z, s);
  else if (r < 0.65) list = bush(x, y, z, s);
  else if (r < 0.8) list = rock(x, y, z, s);
  else list = flower(x, y, z);
  for (let k = 0; k < list.length; k++) parts.push(list[k]);
}

// view: what the screen shows beyond the 720x480 view, { taller, wider }.
// boards: BOARDS from boards.js. Returns { show(i), warmUp(on) }.
export function createBoard(scene, view, boards) {
  const parts = [];
  scene.add(floorMesh());

  // Low walls around the board with a lighter top rim and orange corner posts.
  const hw = COLS / 2 + WALL_T / 2;
  const hd = ROWS / 2 + WALL_T / 2;
  const outerW = COLS + WALL_T * 2;
  parts.push(box(outerW, WALL_H, WALL_T, 0, WALL_H / 2, -hd, WALL));
  parts.push(box(outerW, WALL_H, WALL_T, 0, WALL_H / 2, hd, WALL));
  parts.push(box(WALL_T, WALL_H, ROWS, -hw, WALL_H / 2, 0, WALL));
  parts.push(box(WALL_T, WALL_H, ROWS, hw, WALL_H / 2, 0, WALL));
  parts.push(box(outerW, 0.12, WALL_T + 0.08, 0, WALL_H + 0.06, -hd, WALL_TOP));
  parts.push(box(outerW, 0.12, WALL_T + 0.08, 0, WALL_H + 0.06, hd, WALL_TOP));
  parts.push(box(WALL_T + 0.08, 0.12, ROWS, -hw, WALL_H + 0.06, 0, WALL_TOP));
  parts.push(box(WALL_T + 0.08, 0.12, ROWS, hw, WALL_H + 0.06, 0, WALL_TOP));
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      parts.push(box(0.95, WALL_H + 0.35, 0.95, sx * hw, (WALL_H + 0.35) / 2, sz * hd, POST));
      parts.push(box(0.7, 0.14, 0.7, sx * hw, WALL_H + 0.42, sz * hd, 0xffc04d));
    }
  }

  // Wooden plinth the board stands on, with a darker band at the bottom.
  const plinthW = outerW + 0.5;
  const plinthD = ROWS + WALL_T * 2 + 0.5;
  // Its top sits a little below the floor tiles so the two never z-fight.
  parts.push(box(plinthW, PLINTH_H - 0.35, plinthD, 0, -0.05 - (PLINTH_H - 0.35) / 2, 0, WOOD));
  parts.push(box(plinthW + 0.3, 0.3, plinthD + 0.3, 0, -PLINTH_H + 0.15, 0, WOOD_DARK));

  // Grass around the board.
  const ground = new THREE.PlaneGeometry(120, 90);
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, -PLINTH_H, 0);
  parts.push(paint(ground, GRASS));

  // Decoration around the plinth, placed in the strips that are on screen:
  // a wide one behind the board and narrow ones on both sides.
  const gy = -PLINTH_H;
  for (let i = 0; i < 64; i++) {
    let x;
    let z;
    if (i < 28) {
      x = -20 + rand() * 40;
      z = -16 + rand() * 6;
    } else {
      x = (i % 2 === 0 ? -1 : 1) * (14.4 + rand() * 4.5);
      z = -10 + rand() * 19;
    }
    if (Math.abs(x) < plinthW / 2 + 0.8 && Math.abs(z) < plinthD / 2 + 0.8) continue;
    const r = rand();
    const s = 0.7 + rand() * 0.6;
    const list = r < 0.4 ? tree(x, gy, z, s) : r < 0.65 ? bush(x, gy, z, s) : r < 0.8 ? rock(x, gy, z, s) : flower(x, gy, z);
    for (let k = 0; k < list.length; k++) parts.push(list[k]);
  }

  // Taller and wider screens show grass the 720x480 view does not: more of
  // the same there, all of it out of that view, so it looks the same as ever.
  if (view.taller) {
    // In front of the board (low props close to it, trees further out) and
    // far behind it.
    for (let i = 0; i < 26; i++) {
      const z = 11.5 + rand() * 3.5;
      prop(parts, -16 + rand() * 32, gy, z, z > 12.8);
    }
    for (let i = 0; i < 16; i++) prop(parts, -26 + rand() * 52, gy, -25 + rand() * 4.5, true);
  }
  if (view.wider) {
    // The far corners behind the board.
    for (let i = 0; i < 8; i++) prop(parts, (i % 2 === 0 ? -1 : 1) * (22.5 + rand() * 3), gy, -19 + rand() * 9, true);
  }

  // Polyhedra come without an index and the rest with one; mergeGeometries
  // needs them all alike, so everything is flattened first.
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const geometry = mergeGeometries(flat);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
    flat[i].dispose();
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(geometry, material));

  // The blocks of every board, made now; only the chosen board's show.
  const blockMeshes = boards.map((b) => {
    const g = blocksGeometry(b.blocks);
    if (!g) return null;
    const mesh = new THREE.Mesh(g, material);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  });
  let shown = 0;

  return {
    show(i) {
      shown = i;
      blockMeshes.forEach((m, k) => {
        if (m) m.visible = k === i;
      });
    },
    // All of them at once for one frame while loading, so every geometry is
    // uploaded before play.
    warmUp(on) {
      blockMeshes.forEach((m, k) => {
        if (m) m.visible = on || k === shown;
      });
    },
  };
}
