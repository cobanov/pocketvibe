// The static scenery: checker board, low walls, the wooden plinth under it,
// the grass around it and a ring of trees, rocks and flowers. Everything is
// merged into one vertex-colored mesh, so the whole scene is one draw call.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLS, ROWS, box, cellX, cellZ, paint } from './shared.js';

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

function tree(x, y, z, s) {
  const trunk = new THREE.CylinderGeometry(0.18, 0.24, 1, 5);
  trunk.translate(0, 0.5, 0);
  const low = new THREE.ConeGeometry(1.1, 1.6, 7);
  low.translate(0, 1.5, 0);
  const high = new THREE.ConeGeometry(0.8, 1.3, 7);
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

export function createBoard(scene) {
  const parts = [];

  // Checker floor, one quad per cell.
  for (let cz = 0; cz < ROWS; cz++) {
    for (let cx = 0; cx < COLS; cx++) {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(cellX(cx), 0, cellZ(cz));
      parts.push(paint(g, (cx + cz) % 2 === 0 ? TILE_A : TILE_B));
    }
  }

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

  // Polyhedra come without an index and the rest with one; mergeGeometries
  // needs them all alike, so everything is flattened first.
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const geometry = mergeGeometries(flat);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
    flat[i].dispose();
  }
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
  return mesh;
}
