// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const SKY = 0x9ed8ef;

// The board is COLS x ROWS cells of 1 world unit, centered on the origin.
// x grows to the right, z grows towards the camera (screen down).
export const COLS = 24;
export const ROWS = 16;
export const CELLS = COLS * ROWS;

export function cellX(cx) {
  return cx - COLS / 2 + 0.5;
}

export function cellZ(cz) {
  return cz - ROWS / 2 + 0.5;
}

// Directions, indexed 0..3: right, down (towards the camera), left, up.
export const RIGHT = 0;
export const DOWN = 1;
export const LEFT = 2;
export const UP = 3;
export const DIR_X = [1, 0, -1, 0];
export const DIR_Z = [0, 1, 0, -1];

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

export function box(w, h, d, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return paint(g, hex);
}

// A low-poly ball, squashed by (sx, sy, sz) and moved to (x, y, z).
export function ball(r, sx, sy, sz, x, y, z, hex, detail = 8) {
  const g = new THREE.SphereGeometry(r, detail, Math.max(4, detail - 2));
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, hex);
}

// Fake shadow: a flat dark transparent disc, drawn just above the floor.
export function shadowDisc(radius, opacity) {
  const g = new THREE.CircleGeometry(radius, 16);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ color: 0x1a2a10, transparent: true, opacity, depthWrite: false }),
  );
  mesh.position.y = 0.012;
  return mesh;
}
