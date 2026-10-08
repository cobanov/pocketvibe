// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const BPM = 120;
export const BEAT = 60 / BPM; // seconds per beat
export const STAGE_Y = 0.4; // top of the stage
export const STAGE_R = 2.2; // stage radius; the pole stands at its centre
export const POLE_TOP = 6.2;
export const POLE_R = 0.05;

// Hype tiers: the dancer's move for each, from bored to the finale spin.
export const TIERS = [
  { name: 'WARMING UP', from: 0 },
  { name: 'THE STROLL', from: 15 },
  { name: 'FIREMAN SPIN', from: 35 },
  { name: 'THE FLAG', from: 55 },
  { name: 'HELICOPTER', from: 75 },
  { name: 'TORNADO', from: 95 },
];

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smooth(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

// 0 to 1 and back over one unit of phase, peaking at the middle.
export function bump(t) {
  return Math.sin(clamp(t, 0, 1) * Math.PI);
}

// A sharp hit at the start of each unit that dies away: for nods and taps.
export function pulse(phase, k = 6) {
  return Math.exp(-(phase - Math.floor(phase)) * k);
}

// Angle a minus angle b, wrapped to -PI..PI.
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const tmpColor = new THREE.Color();

// Gives a geometry one flat vertex colour (with an optional second colour
// at the bottom), so parts can be merged into one mesh with one material.
export function paint(geometry, hex, bottomHex = hex) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const bottom = new THREE.Color(bottomHex);
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getY(i) - min.y) / Math.max(1e-6, max.y - min.y);
    tmpColor.setHex(hex).lerp(bottom, 1 - k);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A box with its top face scaled: tapered limbs and torsos.
export function taperBox(w, h, d, topScale = 1, topDepthScale = topScale) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * topScale);
      pos.setZ(i, pos.getZ(i) * topDepthScale);
    }
  }
  return g;
}

// A canvas drawn once at load and turned into a texture (never redrawn).
export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  return texture;
}
