// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const SKY = 0x9fd3f0;

export const LANE_W = 2.2;
export const LANES = [-LANE_W, 0, LANE_W];

// The player stays at z = 0 and the world moves towards +z.
export const SPAWN_Z = -66; // new rows appear here, hidden in the fog
export const DESPAWN_Z = 8; // behind the camera
export const TRACK_LEN = 80; // length of the road and the tree belt

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
