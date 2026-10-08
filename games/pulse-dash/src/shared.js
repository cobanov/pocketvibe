// Constants and small helpers shared by the game modules.
//
// Side view: x points right (the way the cube runs), y up, z towards the
// camera. One world unit is one cell of the level grid; the cube runs along
// z = 0 and the floor's top is y = 0.

import * as THREE from 'three';

export const CUBE_COLOR = 0xc6ff3a;
export const PAD_COLOR = 0xffe14a;
export const RING_COLOR = 0xffe14a;

// Camera: a side view from a little above, the cube in the left third.
export const CAM_AHEAD = 4.2; // the camera looks this far ahead of the cube
export const CAM_Z = 12.5;
export const CAM_Y = 3.1;
export const FOV = 50;

// Things are written into the instanced meshes only inside this window
// around the camera.
export const VIEW_BACK = 11;
export const VIEW_AHEAD = 12;

const tmpColor = new THREE.Color();

// Gives a geometry one flat vertex colour, so differently coloured parts can
// be merged into a single mesh that uses one material and one draw call.
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

// Merged geometries need the same attributes, so the uvs go.
export function box(w, h, d, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.deleteAttribute('uv');
  g.translate(x, y, z);
  return paint(g, hex);
}

// A flat quad facing the camera (+z) or the sky (+y).
export function quad(w, h, x, y, z, hex, up) {
  const g = new THREE.PlaneGeometry(w, h);
  g.deleteAttribute('uv');
  if (up) g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, hex);
}

// A soft round glow drawn once on a canvas, for additive halos. Every halo
// shares the one texture.
let glow = null;
export function glowTexture() {
  if (glow) return glow;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

// The kick's pulse at song time t: 1 on each beat, fading over the beat.
// Bars without a kick only shimmer.
export function beatPulse(L, t) {
  if (t < 0) return 0;
  const beat = (t * L.bpm) / 60;
  const bar = Math.floor(beat / 4);
  const k = Math.exp(-(beat - Math.floor(beat)) * 5);
  return bar < L.bars && L.kick[bar] ? k : k * 0.25;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
