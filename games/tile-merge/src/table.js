// The static scenery. The board (a tray with a socket for every cell) has
// baked shading like the tiles; the round table, its legs, the rug, the floor
// and the things lying on the table are lit. Each group is one merged mesh,
// so the whole scene costs two draw calls. There is a tray for each board
// size, all the same outside; only the one in use is shown.

import * as THREE from 'three';
import { AREA, SIZES, bake, block, mergeGeometries, paint } from './shared.js';

const BOARD = 0x9a7560;
const RIM = 0xb98f72;
const RIM_TOP = 0xd3ad8c;
const SOCKET = 0x7f5f4c;
const TABLE = 0xdba56c;
const TABLE_EDGE = 0xb47a45;
const LEG = 0xa86f3e;
const FLOOR_A = 0xe8b48c;
const FLOOR_B = 0xe0a880;

export const TABLE_Y = -0.3; // the table top; the board stands on it
const TABLE_R = 4.45;
const FLOOR_Y = -6;

// Polyhedra come without an index and the rest with one; mergeGeometries
// needs them all alike, so everything is flattened and stripped to position,
// normal and colour first.
function merge(parts) {
  const flat = parts.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    if (f.attributes.uv) f.deleteAttribute('uv');
    return f;
  });
  const geometry = mergeGeometries(flat);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
    flat[i].dispose();
  }
  return geometry;
}

// The tray of the n x n board.
function boardGeometry(n) {
  const parts = [];
  const inner = AREA / 2 + 0.08; // half size of the playing area
  const rimT = 0.3;
  const rimH = 0.5;
  // The tray floor; its top is y = 0, where the tiles stand.
  parts.push(block(inner * 2 + 0.1, 0.3, inner * 2 + 0.1, 0, -0.15, 0, BOARD, 0.04));
  // Raised rim, with a lighter cap.
  const outer = inner + rimT;
  const rimY = TABLE_Y + rimH / 2;
  parts.push(block(outer * 2, rimH, rimT, 0, rimY, -inner - rimT / 2, RIM, 0.08));
  parts.push(block(outer * 2, rimH, rimT, 0, rimY, inner + rimT / 2, RIM, 0.08));
  parts.push(block(rimT, rimH, inner * 2, -inner - rimT / 2, rimY, 0, RIM, 0.08));
  parts.push(block(rimT, rimH, inner * 2, inner + rimT / 2, rimY, 0, RIM, 0.08));
  const capY = TABLE_Y + rimH + 0.03;
  parts.push(block(outer * 2, 0.08, rimT * 0.7, 0, capY, -inner - rimT / 2, RIM_TOP, 0.03));
  parts.push(block(outer * 2, 0.08, rimT * 0.7, 0, capY, inner + rimT / 2, RIM_TOP, 0.03));
  parts.push(block(rimT * 0.7, 0.08, inner * 2, -inner - rimT / 2, capY, 0, RIM_TOP, 0.03));
  parts.push(block(rimT * 0.7, 0.08, inner * 2, inner + rimT / 2, capY, 0, RIM_TOP, 0.03));
  // A darker socket under every tile.
  const pitch = AREA / n;
  for (let c = 0; c < n * n; c++) {
    const g = new THREE.PlaneGeometry(pitch - 0.1, pitch - 0.1);
    g.rotateX(-Math.PI / 2);
    g.translate(((c % n) - (n - 1) / 2) * pitch, 0.004, (Math.floor(c / n) - (n - 1) / 2) * pitch);
    parts.push(bake(g, SOCKET));
  }
  return merge(parts);
}

function at(geometry, x, y, z, hex) {
  geometry.translate(x, y, z);
  return paint(geometry, hex);
}

function cylinder(rTop, rBottom, h, segments, x, y, z, hex) {
  return at(new THREE.CylinderGeometry(rTop, rBottom, h, segments), x, y + h / 2, z, hex);
}

// A mug of cocoa, standing on the table at (x, z).
function mug(parts, x, z) {
  const y = TABLE_Y;
  parts.push(cylinder(0.44, 0.4, 0.8, 14, x, y, z, 0x74b5a6));
  parts.push(cylinder(0.46, 0.46, 0.08, 14, x, y + 0.8, z, 0x8cc7b9));
  parts.push(cylinder(0.37, 0.37, 0.02, 14, x, y + 0.78, z, 0x6b3f28));
  const handle = new THREE.TorusGeometry(0.22, 0.07, 6, 10, Math.PI);
  handle.rotateZ(-Math.PI / 2);
  parts.push(at(handle, x + 0.42, y + 0.42, z, 0x74b5a6));
}

// A little potted plant.
function plant(parts, x, z) {
  const y = TABLE_Y;
  parts.push(cylinder(0.36, 0.27, 0.5, 10, x, y, z, 0xd0703f));
  parts.push(cylinder(0.4, 0.4, 0.12, 10, x, y + 0.48, z, 0xe08550));
  parts.push(cylinder(0.33, 0.33, 0.02, 10, x, y + 0.58, z, 0x5e3a22));
  const leaves = [
    [0, 0.95, 0, 0.32, 0x5aa957],
    [-0.22, 0.8, 0.1, 0.24, 0x74c06a],
    [0.22, 0.82, -0.08, 0.26, 0x4f9c4e],
    [0.05, 0.78, 0.24, 0.22, 0x86cf74],
    [-0.08, 0.84, -0.22, 0.22, 0x68b860],
  ];
  for (const [lx, ly, lz, r, hex] of leaves) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(1, 1.25, 1);
    parts.push(at(g, x + lx, y + ly, z + lz, hex));
  }
}

// A pencil lying on the table, turned by angle.
function pencil(parts, x, z, angle) {
  const len = 1.9;
  const r = 0.07;
  const pieces = [
    new THREE.CylinderGeometry(r, r, len, 6).translate(0, 0, 0),
    paint(new THREE.CylinderGeometry(r, r, 0.22, 6).translate(0, len / 2 + 0.11, 0), 0xf08aa0),
    paint(new THREE.ConeGeometry(r, 0.26, 6).rotateX(Math.PI).translate(0, -len / 2 - 0.13, 0), 0xf3d9b5),
  ];
  paint(pieces[0], 0xf3bf3f);
  for (const g of pieces) {
    g.rotateZ(Math.PI / 2);
    g.rotateY(angle);
    g.translate(x, TABLE_Y + r, z);
    parts.push(g);
  }
}

function roomGeometry() {
  const parts = [];
  // Round table top with a darker edge, on four legs.
  parts.push(cylinder(TABLE_R, TABLE_R, 0.32, 40, 0, TABLE_Y - 0.32, 0, TABLE));
  parts.push(cylinder(TABLE_R - 0.12, TABLE_R - 0.2, 0.3, 40, 0, TABLE_Y - 0.62, 0, TABLE_EDGE));
  // Faint growth rings in the wood, and the board's soft shadow on it.
  for (const r of [3.3, 3.75, 4.15]) {
    const ring = new THREE.RingGeometry(r, r + 0.05, 48);
    ring.rotateX(-Math.PI / 2);
    parts.push(at(ring, 0, TABLE_Y + 0.002, 0, 0xcf975f));
  }
  const shadow = new THREE.PlaneGeometry(5.3, 5.3);
  shadow.rotateX(-Math.PI / 2);
  parts.push(at(shadow, 0.14, TABLE_Y + 0.003, 0.2, 0xc68e56));
  const legY = FLOOR_Y;
  const legH = TABLE_Y - 0.62 - FLOOR_Y;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    parts.push(cylinder(0.24, 0.17, legH, 8, Math.cos(a) * 2.9, legY, Math.sin(a) * 2.9, LEG));
  }

  // Floor boards, a round rug and a soft dark patch under the table.
  for (let i = -8; i <= 8; i++) {
    const g = new THREE.PlaneGeometry(1.6, 44);
    g.rotateX(-Math.PI / 2);
    parts.push(at(g, i * 1.6, FLOOR_Y, -6, i % 2 === 0 ? FLOOR_A : FLOOR_B));
  }
  parts.push(cylinder(8.2, 8.2, 0.04, 40, 0, FLOOR_Y, 0, 0xcf7d63));
  parts.push(cylinder(7.4, 7.4, 0.04, 40, 0, FLOOR_Y + 0.01, 0, 0xeaa080));
  parts.push(cylinder(6.6, 6.6, 0.04, 40, 0, FLOOR_Y + 0.02, 0, 0xcf7d63));
  parts.push(cylinder(4.6, 4.6, 0.04, 32, 0.4, FLOOR_Y + 0.03, -0.3, 0xb8694f));

  // Things on the table around the board.
  mug(parts, 3.5, -0.5);
  plant(parts, -3.45, 1.55);
  pencil(parts, 3.4, 1.9, 1.25);
  return merge(parts);
}

export function createTable(scene) {
  const boardMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const boards = {};
  for (const n of SIZES) {
    boards[n] = new THREE.Mesh(boardGeometry(n), boardMaterial);
    scene.add(boards[n]);
  }
  scene.add(new THREE.Mesh(roomGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true })));
  return {
    // Shows the tray of the n x n board (0 shows all, for warming up).
    show(n) {
      for (const k of SIZES) boards[k].visible = n === 0 || k === n;
    },
  };
}
