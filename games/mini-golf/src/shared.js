// Constants and small helpers shared by the rendering modules.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SKY = 0xa9def7;
export const GROUND_Y = -0.55; // the meadow the courses stand on
export const WALL_H = 0.3; // border height above the green

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

// Like paint, but faces pointing up get `topHex`.
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

export function cylinder(rTop, rBottom, h, segments, x, y, z, hex, topHex) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, segments);
  g.translate(x, y, z);
  return topHex === undefined ? paint(g, hex) : paintTop(g, topHex, hex);
}

// Merges parts that may mix indexed and non-indexed geometries, and frees
// the parts. Nothing is textured, so uvs are dropped.
export function merge(parts) {
  const flat = parts.map((g) => {
    const f = g.index ? g.toNonIndexed() : g;
    f.deleteAttribute('uv');
    return f;
  });
  const geometry = mergeGeometries(flat);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
    flat[i].dispose();
  }
  return geometry;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Shortest signed difference between two angles.
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Small deterministic random, so each hole's scenery is the same every time.
export function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
