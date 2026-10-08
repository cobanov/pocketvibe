// Constants and small helpers shared by the game modules.

import * as THREE from 'three';
import { H, W } from './mazes.js';

export const BG = 0x04050e; // clear color and fog

// Directions, indexed 0..3: right, down (towards the camera), left, up.
export const RIGHT = 0;
export const DOWN = 1;
export const LEFT = 2;
export const UP = 3;
export const NONE = -1;
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const BUTTON = ['RIGHT', 'DOWN', 'LEFT', 'UP'];

export function opposite(d) {
  return (d + 2) & 3;
}

// Positions are kept in cell units (integers are cell centres); the maze is
// centred on the origin, one world unit per cell, rows growing towards +z.
export function worldX(cx) {
  return cx - (W - 1) / 2;
}

export function worldZ(cy) {
  return cy - (H - 1) / 2;
}

// Column index with the side tunnels wrapping around.
export function wrapX(cx) {
  return ((cx % W) + W) % W;
}

// Horizontal distance between two columns, the short way through a tunnel.
export function wrapDX(ax, bx) {
  let d = ax - bx;
  if (d > W / 2) d -= W;
  else if (d < -W / 2) d += W;
  return d;
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

// An upright cylinder standing on y.
export function cylinder(top, bottom, h, segments, x, y, z, hex) {
  const g = new THREE.CylinderGeometry(top, bottom, h, segments);
  g.translate(x, y + h / 2, z);
  return paint(g, hex);
}

// A flat disc on the floor, white in the middle and black at the rim. Drawn
// with additive blending it is a soft round glow, without a texture.
export function glowDisc(radius) {
  const g = new THREE.CircleGeometry(radius, 18);
  g.rotateX(-Math.PI / 2);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  colors[0] = colors[1] = colors[2] = 1; // vertex 0 is the centre
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function glowMaterial(hex, opacity) {
  return new THREE.MeshBasicMaterial({
    color: hex,
    vertexColors: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

// 0 -> 1 with a springy overshoot.
export function elastic(x) {
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((Math.PI * 2) / 3)) + 1;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
