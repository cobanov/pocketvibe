// Constants and small helpers shared by the game modules.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const COLS = 10;
export const ROWS = 20; // visible rows of the well
export const BOARD_ROWS = 24; // rows 20..23 are hidden spawn space
export const DRAW_ROWS = 22; // rows drawn; the two above the well peek out

// Piece types are 1..7 (I O T S Z J L); 0 is an empty cell and GREY the
// colour of a lost stack.
export const I = 1;
export const O = 2;
export const GREY = 8;

export const PIECE_HEX = [
  0x000000,
  0x2fd8ec, // I cyan
  0xffd23f, // O yellow
  0xb466ff, // T purple
  0x5ce05c, // S green
  0xff5468, // Z red
  0x4d7cff, // J blue
  0xff9a35, // L orange
  0x7d84a3, // grey
];

// Linear RGB of each piece colour, ready to copy into instance colour arrays.
export const PIECE_RGB = new Float32Array(PIECE_HEX.length * 3);
{
  const c = new THREE.Color();
  for (let i = 0; i < PIECE_HEX.length; i++) {
    c.setHex(PIECE_HEX[i]);
    PIECE_RGB[i * 3] = c.r;
    PIECE_RGB[i * 3 + 1] = c.g;
    PIECE_RGB[i * 3 + 2] = c.b;
  }
}

// World position of a cell centre. The well is centred on the origin, one
// unit per cell.
export function cellX(col) {
  return col - (COLS - 1) / 2;
}

export function cellY(row) {
  return row - (ROWS - 1) / 2;
}

// Lighting is baked into vertex colours: a fixed light from the upper left,
// so blocks and frame use MeshBasicMaterial and cost no lighting at all.
const LIGHT = new THREE.Vector3(-0.45, 0.75, 0.5).normalize();
const tmpColor = new THREE.Color();

function shadeOf(nx, ny, nz) {
  return 0.55 + 0.6 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
}

// Colours every vertex with hex, darkened or lightened by its face normal.
export function bake(geometry, hex) {
  tmpColor.setHex(hex);
  const normal = geometry.attributes.normal;
  const n = normal.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const s = shadeOf(normal.getX(i), normal.getY(i), normal.getZ(i));
    colors[i * 3] = tmpColor.r * s;
    colors[i * 3 + 1] = tmpColor.g * s;
    colors[i * 3 + 2] = tmpColor.b * s;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A box with chamfered edges and corners (44 triangles), centred on the
// origin. Flat normals, so each bevel catches the light on its own.
export function bevelBox(w, h, d, bevel) {
  const outer = [w / 2, h / 2, d / 2];
  const inner = [w / 2 - bevel, h / 2 - bevel, d / 2 - bevel];
  const pos = [];
  const signs = [0, 0, 0];

  // Every vertex sits on the outer surface along one axis and inside the
  // bevel along the other two.
  function vertex(axis) {
    return [0, 1, 2].map((a) => signs[a] * (a === axis ? outer[a] : inner[a]));
  }

  // Adds a triangle wound so that it faces away from the centre.
  function tri(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const out = nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1]) + nz * (a[2] + b[2] + c[2]);
    if (out < 0) pos.push(...a, ...c, ...b);
    else pos.push(...a, ...b, ...c);
  }

  function quad(a, b, c, d) {
    tri(a, b, c);
    tri(a, c, d);
  }

  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3;
    const c = (a + 2) % 3;
    for (const sa of [-1, 1]) {
      // The flat face on axis a.
      const face = [];
      for (const [sb, sc] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        signs[a] = sa;
        signs[b] = sb;
        signs[c] = sc;
        face.push(vertex(a));
      }
      quad(...face);

      // The bevel strips between this face and the faces on axis b.
      for (const sb of [-1, 1]) {
        signs[a] = sa;
        signs[b] = sb;
        signs[c] = -1;
        const p1 = vertex(a);
        const p4 = vertex(b);
        signs[c] = 1;
        quad(p1, vertex(a), vertex(b), p4);
      }
    }
  }

  // The corner triangles.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        signs[0] = sx;
        signs[1] = sy;
        signs[2] = sz;
        tri(vertex(0), vertex(1), vertex(2));
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// A baked, bevelled box placed at (x, y, z), ready to be merged.
export function block(w, h, d, x, y, z, hex, bevel = 0.12) {
  const g = bevelBox(w, h, d, bevel);
  g.translate(x, y, z);
  return bake(g, hex);
}

export { mergeGeometries };
