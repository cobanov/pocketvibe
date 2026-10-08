// Constants and small helpers shared by the game modules.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sky colors from the top of the screen down to the hazy horizon.
export const SKY_TOP = 0x3d97e6;
export const SKY_MID = 0x7cc6f6;
export const HORIZON = 0xd4efff;

// The game is played in the plane z = 0, seen from the side. The bird stays at
// BIRD_X and the world scrolls towards -x.
export const BIRD_X = -4;
export const CEILING_Y = 14.2; // the bird cannot fly above this (top of the screen)
export const SPAWN_X = 13.4; // new pipes appear here, just off the right edge
export const DESPAWN_X = -15; // and are recycled once they and their shadows are past the left edge

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
export function lowPoly() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}
