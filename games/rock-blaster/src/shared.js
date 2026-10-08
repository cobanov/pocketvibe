// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const BG = 0x0c0f2e; // deep space blue behind everything

// The play field in world units: 1 unit = 20 screen pixels, so 36 x 24 units
// fill the 720x480 screen exactly. The camera looks down the -z axis and
// everything plays on the z = 0 plane.
export const HALF_W = 18;
export const HALF_H = 12;

export const TAU = Math.PI * 2;

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

// Makes a geometry mergeable with any other one (non-indexed, position +
// normal + color only), moves it into place and paints it.
export function part(geometry, hex, x = 0, y = 0, z = 0) {
  let g = geometry;
  if (g.index) {
    g = geometry.toNonIndexed();
    geometry.dispose();
  }
  g.deleteAttribute('uv');
  g.clearGroups();
  g.translate(x, y, z);
  return paint(g, hex);
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Wraps an object with x/y around the screen edges. margin lets an object
// slide fully off screen before it appears on the other side.
export function wrap(o, margin) {
  const wx = HALF_W + margin;
  const wy = HALF_H + margin;
  if (o.x > wx) o.x -= wx * 2;
  else if (o.x < -wx) o.x += wx * 2;
  if (o.y > wy) o.y -= wy * 2;
  else if (o.y < -wy) o.y += wy * 2;
}
