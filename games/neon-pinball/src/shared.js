// Palette and small geometry helpers shared by the view modules.

import * as THREE from 'three';

export const BG = 0x05031a; // behind the cabinet

// Neon palette: every lit element uses one of these.
export const CYAN = 0x2de2ff;
export const MAGENTA = 0xff3fd2;
export const YELLOW = 0xffe14a;
export const LIME = 0x7dff4f;
export const ORANGE = 0xff8a2b;
export const VIOLET = 0x9b5cff;
export const RED = 0xff3b6b;

// Wall color by table.js style name.
export const STYLE = {
  rail: CYAN,
  guide: MAGENTA,
  slingbody: MAGENTA,
  sling: YELLOW,
  gate: ORANGE,
  bank: LIME,
  divider: CYAN,
  target: LIME,
};

export const BUMPER_COLORS = [MAGENTA, MAGENTA, VIOLET];

const tmpColor = new THREE.Color();

// Vertex colors for MeshBasicMaterial that fake lighting: faces pointing up
// (+z, towards the camera) get the full color plus a little white, so they
// read as a glowing neon top; side faces get a darker shade.
export function shaded(geometry, hex, side = 0.5, hot = 0.25) {
  tmpColor.setHex(hex);
  const normals = geometry.attributes.normal;
  const n = geometry.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const up = normals.getZ(i) > 0.5;
    const k = up ? 1 : side;
    const w = up ? hot : 0;
    colors[i * 3] = Math.min(1, tmpColor.r * k + w);
    colors[i * 3 + 1] = Math.min(1, tmpColor.g * k + w);
    colors[i * 3 + 2] = Math.min(1, tmpColor.b * k + w);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A wall piece from (ax, ay) to (bx, by), thickness w, height h, standing on
// the table. Merged geometries need the same attributes, so drop the uvs.
export function bar(ax, ay, bx, by, w, h, z, hex, side, hot) {
  const len = Math.hypot(bx - ax, by - ay);
  const g = new THREE.BoxGeometry(len + w, w, h);
  g.deleteAttribute('uv');
  g.rotateZ(Math.atan2(by - ay, bx - ax));
  g.translate((ax + bx) / 2, (ay + by) / 2, z + h / 2);
  return shaded(g, hex, side, hot);
}

// An upright cylinder (posts, bumpers) standing at z.
export function post(x, y, r, h, z, hex, side, hot, segments = 14) {
  const g = new THREE.CylinderGeometry(r, r, h, segments, 1);
  g.deleteAttribute('uv');
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z + h / 2);
  return shaded(g, hex, side, hot);
}

// A flat filled polygon at height z, facing up.
export function slab(points, z, hex) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  const g = new THREE.ShapeGeometry(shape);
  g.deleteAttribute('uv');
  g.translate(0, 0, z);
  return shaded(g, hex, 1, 0);
}
