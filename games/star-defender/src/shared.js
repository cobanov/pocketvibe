// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const SPACE = 0x0d0b2e; // background and fog color

// The playfield lies on the y = 0 plane. The formation starts far away (-z)
// and marches towards the player's ship near the camera (+z).
export const FIELD_HALF = 10.4; // ship and formation stay within x = ±FIELD_HALF
export const PLAYER_Z = 8.4;
export const GROUND_Z = 9.5; // bombs that pass this line are gone
export const SHIELD_Z = 5.3;
export const SAUCER_Z = -10.2;
export const TOP_Z = -14; // player bullets vanish past this line
export const FACE_TILT = 0.75; // aliens lean back so their faces look at the camera

const tmpColor = new THREE.Color();

// Gives a geometry one flat vertex color, so differently colored parts can be
// merged into a single mesh that uses one material and one draw call. Returns
// a non-indexed copy so every part merges with every other kind of part.
export function paint(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  tmpColor.setHex(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function box(w, h, d, x, y, z, hex, rotZ = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return paint(g, hex);
}

// Moves an already built geometry into place and paints it.
export function part(geometry, x, y, z, hex) {
  geometry.translate(x, y, z);
  return paint(geometry, hex);
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}
