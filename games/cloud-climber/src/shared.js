// Constants and small helpers shared by the game modules.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The game is played in the plane z = 0, seen from the front. One world unit
// is one metre. The play column runs from x = -HALF_W to HALF_W and wraps:
// leaving one side brings the climber back in on the other.
export const COL_W = 9;
export const HALF_W = COL_W / 2;

// Clouds are PLAT_HALF * 2 wide; their centres stay inside the column.
export const PLAT_HALF = 0.85;
export const PLAT_X = HALF_W - PLAT_HALF;

// The camera looks at the column from CAM_Z in front, from CAM_EYE above
// the point it looks at: a gentle downward tilt that shows the cloud tops.
export const FOV = 40;
export const CAM_Z = 14.1;
export const CAM_EYE = 1.6;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

// Half the visible height at depth z (z <= 0, behind the column).
export function viewHalf(z) {
  return (CAM_Z - z) * TAN;
}

// How far below the camera's look point the middle of the view is at depth z.
export function viewDrop(z) {
  return (-z * CAM_EYE) / CAM_Z;
}

// The climber's movement.
export const GRAVITY = 30;
export const JUMP_V = 15.5; // every bounce: about 4 m high
export const SPRING_V = 26; // about 11 m
export const FLY_V = 15; // climbing speed under the propeller cap
export const FLY_TIME = 2.4;
export const MAX_VX = 8;
export const ACCEL = 34;
export const FRICTION = 16;
export const JUMP_H = (JUMP_V * JUMP_V) / (2 * GRAVITY);
export const SAFE_GAP = JUMP_H * 0.85; // the largest climb the generator ever asks for

// The climber's collision box: feet at y, this wide and tall.
export const BODY_HALF = 0.36;
export const BODY_H = 1.05;

// Platform kinds.
export const NORMAL = 0;
export const MOVING = 1;
export const CRUMBLE = 2;
export const ONESHOT = 3;

// Horizontal distance the climber can cover while climbing dy and landing,
// starting from a standstill, with a comfort margin. Used to keep every
// generated cloud reachable.
export function reach(dy) {
  const disc = JUMP_V * JUMP_V - 2 * GRAVITY * dy;
  if (disc <= 0) return 0;
  const t = (JUMP_V + Math.sqrt(disc)) / GRAVITY;
  const ramp = MAX_VX / ACCEL;
  const dist = t > ramp ? MAX_VX * (t - ramp / 2) : 0.5 * ACCEL * t * t;
  return dist * 0.75;
}

// Signed shortest x distance from a to b around the wrapping column.
export function wrapDx(a, b) {
  let d = b - a;
  if (d > HALF_W) d -= COL_W;
  else if (d < -HALF_W) d += COL_W;
  return d;
}

export function wrapX(x) {
  if (x > HALF_W) return x - COL_W;
  if (x < -HALF_W) return x + COL_W;
  return x;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
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

// Moves a geometry into place and paints it.
export function part(geometry, x, y, z, hex) {
  geometry.translate(x, y, z);
  return paint(geometry, hex);
}

export function box(w, h, d, x, y, z, hex) {
  return part(new THREE.BoxGeometry(w, h, d), x, y, z, hex);
}

// A low-poly ball squashed by (sx, sy, sz), moved to (x, y, z) and painted.
export function puff(r, sx, sy, sz, x, y, z, hex, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(sx, sy, sz);
  return part(g, x, y, z, hex);
}

// Merges painted parts into one geometry. Boxes and cylinders are indexed and
// icosahedrons are not, so everything is converted to non-indexed first.
export function merge(parts) {
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].index) {
      const flat = parts[i].toNonIndexed();
      parts[i].dispose();
      parts[i] = flat;
    }
  }
  const merged = mergeGeometries(parts);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  return merged;
}

// Flat-shaded vertex-color material: the faceted low-poly look.
export function lowPoly(emissive = 0x000000) {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive });
}
