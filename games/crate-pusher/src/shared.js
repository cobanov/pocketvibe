// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const BG = 0x2c3654;

// Directions, in the solver's order: up, right, down, left. On the board
// x grows to the right and z towards the camera (screen down).
export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;
export const DX = [0, 1, 0, -1];
export const DZ = [-1, 0, 1, 0];
export const BUTTONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

export const WALL_H = 0.52;
export const PLINTH_H = 0.7; // the board stands on a block this deep
export const CRATE = 0.84; // crate size

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

// Like paint, but faces pointing up get `topHex`: blocks read better with a
// lighter top.
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

export function box(w, h, d, x, y, z, hex, topHex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return topHex === undefined ? paint(g, hex) : paintTop(g, topHex, hex);
}

export function cylinder(r, h, x, y, z, hex, topHex, sides = 8) {
  const g = new THREE.CylinderGeometry(r, r, h, sides);
  g.translate(x, y, z);
  return topHex === undefined ? paint(g, hex) : paintTop(g, topHex, hex);
}

// Faces of a box, for a mask of which to keep: a face buried against a
// neighbour is never seen, so it is better not drawn (or counted) at all.
export const PX = 1;
export const NX = 2;
export const PY = 4; // top
export const NY = 8; // bottom
export const PZ = 16; // towards the camera
export const NZ = 32;
export const SIDES = PX | NX | PZ | NZ;

// Each face of a box: its normal and two edges (u x v = normal), in the
// order BoxGeometry uses (+x, -x, +y, -y, +z, -z).
const FACES = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [-1, 0, 0, 0, 0, 1, 0, 1, 0],
  [0, 1, 0, 0, 0, 1, 1, 0, 0],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
  [0, 0, 1, 1, 0, 0, 0, 1, 0],
  [0, 0, -1, 0, 1, 0, 1, 0, 0],
];
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]; // two triangles, (u, v) signs

// Like box, with only the faces in mask, written straight out as flat
// triangles (position, normal, color) for merging.
export function boxFaces(w, h, d, x, y, z, hex, topHex, mask) {
  const size = [w / 2, h / 2, d / 2];
  const count = 6 * ((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1) + ((mask >> 4) & 1) + ((mask >> 5) & 1));
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let o = 0;
  for (let f = 0; f < 6; f++) {
    if (!(mask & (1 << f))) continue;
    const [nx, ny, nz, ux, uy, uz, vx, vy, vz] = FACES[f];
    tmpColor.setHex(f === 2 && topHex !== undefined ? topHex : hex);
    for (let k = 0; k < 6; k++) {
      const su = CORNERS[k * 2];
      const sv = CORNERS[k * 2 + 1];
      pos[o] = x + (nx + ux * su + vx * sv) * size[0];
      pos[o + 1] = y + (ny + uy * su + vy * sv) * size[1];
      pos[o + 2] = z + (nz + uz * su + vz * sv) * size[2];
      nor[o] = nx;
      nor[o + 1] = ny;
      nor[o + 2] = nz;
      col[o] = tmpColor.r;
      col[o + 1] = tmpColor.g;
      col[o + 2] = tmpColor.b;
      o += 3;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// A soft round blob (white in the middle, clear at the edge) drawn on a
// small canvas: used for fake shadows and the glow under finished crates.
// Drawn once and shared.
let blob = null;
export function blobTexture() {
  if (blob) return blob;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  blob = new THREE.CanvasTexture(canvas);
  return blob;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

// Small deterministic random, so a level's scenery looks the same every time.
let seed = 1;
export function reseed(s) {
  seed = (s * 7919 + 13) % 2147483647 || 1;
}
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
