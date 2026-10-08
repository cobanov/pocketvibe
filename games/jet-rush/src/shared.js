// Constants and small helpers shared by the game modules.
//
// Side view: x points right (the way the hero runs), y up, z towards the
// camera. The hero stays at x = HERO_X and the world scrolls towards -x.

import * as THREE from 'three';

export const BG = 0x1a2340; // clear and fog color: the dim lab behind the windows

export const CEIL_Y = 7.2; // the corridor runs from y = 0 (floor) to here
export const MID_Y = CEIL_Y / 2;

export const HERO_X = 0;

// Camera: straight side view, a little ahead of the hero.
export const CAM_X = HERO_X + 5;
export const CAM_Z = 11;
export const FOV = 48;
export const VIEW_HALF_H = CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
export const VIEW_HALF_W = VIEW_HALF_H * 1.5; // 720 / 480
export const RIGHT_EDGE = CAM_X + VIEW_HALF_W; // visible right edge at z = 0

export const SPAWN_X = RIGHT_EDGE + 1.5; // new patterns start here, off screen
export const DESPAWN_X = -8; // behind the left edge

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

// A cylinder whose axis lies along 'x', 'y' or 'z'.
export function cyl(r, len, segments, axis, x, y, z, hex) {
  const g = new THREE.CylinderGeometry(r, r, len, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, hex);
}

// A canvas drawn once at startup and used as a texture.
export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Squared distance from point p to the segment a-b.
export function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px;
  const ey = ay + dy * t - py;
  return ex * ex + ey * ey;
}
