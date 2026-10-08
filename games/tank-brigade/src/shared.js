// Constants and small helpers shared by the game modules.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BG = 0x1a211d; // clear color and fog

// The field is 13 x 13 tiles of one world unit, centred on the origin, with x
// to the right and z towards the camera (screen down). Each tile is 2 x 2
// cells: bricks and steel break a cell at a time, and tanks (one tile big)
// line up with the cell grid whenever they turn.
export const TILES = 13;
export const N = TILES * 2; // cells per side
export const CELL = 0.5;
export const HALF = TILES / 2;
export const TANK_R = 0.5; // half size of a tank's hit box
export const FLOOR_H = 0.2; // the field is a slab this thick; water lies below its top

// What a cell holds.
export const EMPTY = 0;
export const BRICK = 1;
export const STEEL = 2;
export const WATER = 3;
export const TREES = 4;
export const ICE = 5;
export const CORE = 6;

// Directions, clockwise from up (away from the camera).
export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;
export const DIR_X = [0, 1, 0, -1];
export const DIR_Z = [-1, 0, 1, 0];

// Spawn tiles: enemies come in on the top row (in this order), the player
// starts left of the core, which sits in the middle of the bottom row.
export const ENEMY_COLS = [6, 12, 0];
export const PLAYER_COL = 4;
export const CORE_COL = 6;

export function tileCenter(t) {
  return -HALF + t + 0.5;
}

export function cellCenter(c) {
  return -HALF + (c + 0.5) * CELL;
}

export function toCell(v) {
  return Math.floor((v + HALF) / CELL);
}

// The nearest line of the cell grid: where a tank's centre sits when it is
// lined up with the cells around it.
export function snap(v) {
  return Math.round((v + HALF) / CELL) * CELL - HALF;
}

// Model rotation for a direction (every model faces up, towards -z).
export function yawOf(dir) {
  return -dir * Math.PI * 0.5;
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

const tmpColor = new THREE.Color();

// Gives a geometry one flat vertex color, so differently colored parts can be
// merged into a single mesh that uses one material and one draw call.
export function paint(geometry, hex) {
  tmpColor.setHex(hex);
  const n = geometry.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Like paint, but faces pointing up get `topHex`: blocks read better from the
// tilted camera with a lighter top.
export function paintTop(geometry, topHex, sideHex) {
  paint(geometry, sideHex);
  tmpColor.setHex(topHex);
  const normals = geometry.attributes.normal;
  const colors = geometry.attributes.color;
  for (let i = 0; i < normals.count; i++) {
    if (normals.getY(i) > 0.5) colors.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
  }
  return geometry;
}

// Multiplies the vertex colors of a painted geometry by hex.
export function tint(geometry, hex) {
  tmpColor.setHex(hex);
  const colors = geometry.attributes.color;
  for (let i = 0; i < colors.count; i++) {
    colors.setXYZ(i, colors.getX(i) * tmpColor.r, colors.getY(i) * tmpColor.g, colors.getZ(i) * tmpColor.b);
  }
  return geometry;
}

export function box(w, h, d, x, y, z, hex, topHex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return topHex === undefined ? paint(g, hex) : paintTop(g, topHex, hex);
}

// An upright cylinder (a cone when top is 0) standing on y.
export function cylinder(top, bottom, h, segments, x, y, z, hex, topHex) {
  const g = new THREE.CylinderGeometry(top, bottom, h, segments);
  g.translate(x, y + h / 2, z);
  return topHex === undefined ? paint(g, hex) : paintTop(g, topHex, hex);
}

// A low-poly blob (icosahedron), squashed by (sx, sy, sz).
export function blob(r, sx, sy, sz, x, y, z, hex) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, hex);
}

// Merges painted parts into one geometry. Polyhedra come without an index
// and boxes with one; mergeGeometries needs them alike, so a mixed list is
// flattened first. The parts are disposed.
export function merge(parts) {
  let mixed = false;
  for (let i = 1; i < parts.length; i++) if (!parts[i].index !== !parts[0].index) mixed = true;
  const list = mixed ? parts.map((g) => (g.index ? g.toNonIndexed() : g)) : parts;
  const geometry = mergeGeometries(list);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
    list[i].dispose();
  }
  return geometry;
}
