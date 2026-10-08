// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const BG = 0x1d1747; // clear color and fog

// The playing field lies on the ground (y = 0): x to the right, z towards the
// player. The ball bounces off the left, right and top walls and is lost past
// the bottom edge.
export const FIELD_W = 14.6;
export const FIELD_D = 16.6;
export const FIELD_L = -FIELD_W / 2;
export const FIELD_R = FIELD_W / 2;
export const FIELD_TOP = -FIELD_D / 2;
export const FIELD_BOTTOM = FIELD_D / 2;

export const PADDLE_Z = FIELD_BOTTOM - 1.3; // centre line of the paddle
export const PADDLE_D = 0.6; // paddle depth
export const BALL_R = 0.28;
export const BALL_Y = 0.32; // height of the ball's centre above the floor

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

// An upright cylinder (or cone when top is 0) standing on y.
export function cylinder(top, bottom, h, segments, x, y, z, hex) {
  const g = new THREE.CylinderGeometry(top, bottom, h, segments);
  g.translate(x, y + h / 2, z);
  return paint(g, hex);
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
