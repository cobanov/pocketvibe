// Constants and small helpers shared by the game modules.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BG = 0xf4cfae; // warm peach behind the table, also the fog

// The board: 4x4 cells, PITCH world units apart, centred on the origin and
// lying on the table top (y = 0). Row 0 is the far row (screen top).
export const SIZE = 4;
export const CELLS = SIZE * SIZE;
export const PITCH = 1.08;
export const TILE_W = 0.94; // tile body width and depth
export const TILE_H = 0.42; // tile body height

export function cellX(cell) {
  return ((cell % SIZE) - (SIZE - 1) / 2) * PITCH;
}

export function cellZ(cell) {
  return (Math.floor(cell / SIZE) - (SIZE - 1) / 2) * PITCH;
}

// Directions. DX and DZ are the world step of each.
export const LEFT = 0;
export const RIGHT = 1;
export const UP = 2;
export const DOWN = 3;
export const DX = [-1, 1, 0, 0];
export const DZ = [0, 0, -1, 1];

// Tiles are stored as exponents: 1 is the 2 tile, 11 the 2048 tile, 17 the
// 131072 tile (the largest a 4x4 board can ever hold). 0 is an empty cell.
export const MAX_EXP = 17;
export const WIN_EXP = 11;

// Body colour of each tile, warm and soft up to 2048, then cooler jewels.
export const TILE_HEX = [
  0x000000,
  0xf6ead6, // 2 cream
  0xf3dbb0, // 4 sand
  0xf6b27a, // 8 apricot
  0xf59666, // 16 peach
  0xf27d5f, // 32 coral
  0xe9604f, // 64 warm red
  0xf3d272, // 128 butter
  0xf0c556, // 256 yellow
  0xeeb440, // 512 honey
  0xe9952e, // 1024 amber
  0xffc425, // 2048 gold
  0x8dcf80, // 4096 sage
  0x58bfae, // 8192 teal
  0x6c9fe0, // 16384 blue
  0x9a83d8, // 32768 lavender
  0xd474b0, // 65536 orchid
  0x5a4868, // 131072 plum
];

// Linear RGB of each tile colour, ready to copy into instance colour arrays.
export const TILE_RGB = new Float32Array(TILE_HEX.length * 3);
{
  const c = new THREE.Color();
  for (let i = 0; i < TILE_HEX.length; i++) {
    c.setHex(TILE_HEX[i]);
    TILE_RGB[i * 3] = c.r;
    TILE_RGB[i * 3 + 1] = c.g;
    TILE_RGB[i * 3 + 2] = c.b;
  }
}

// Lighting is baked into vertex colours: a fixed light from the upper left,
// so tiles and board use MeshBasicMaterial and cost no lighting at all.
const LIGHT = new THREE.Vector3(-0.4, 0.85, 0.35).normalize();
const tmpColor = new THREE.Color();

function shadeOf(nx, ny, nz) {
  return 0.6 + 0.45 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
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

// Gives a geometry one flat vertex colour (for the lit scenery).
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
export function block(w, h, d, x, y, z, hex, bevel = 0.1) {
  const g = bevelBox(w, h, d, bevel);
  g.translate(x, y, z);
  return bake(g, hex);
}

// Smoothing curves for animations, t in 0..1.
export function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeOutBack(t) {
  const u = t - 1;
  return 1 + 2.4 * u * u * u + 1.4 * u * u;
}

export { mergeGeometries };
