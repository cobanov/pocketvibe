// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const SKY = 0xbfe6f5;

// The grid: one world unit per cell. Row r sits at z = -r, so forward is -z.
// Playable columns run from -HALF to HALF.
export const HALF = 4;
export const COLS = HALF * 2 + 1;

// Row kinds.
export const GRASS = 0;
export const ROAD = 1;
export const RIVER = 2;
export const RAIL = 3;
export const FARM = 4; // a dirt track with slow tractors

// Heights of the surfaces the chicken can stand on.
export const WATER_Y = -0.34;
export const LOG_Y = -0.06;
export const LILY_Y = -0.26;

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

// Like paint, but faces pointing up get `topHex`: voxel blocks read better
// with a lighter top.
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

export function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
