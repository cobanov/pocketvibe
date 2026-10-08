// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const SIZE = 3; // starting footprint of a slab (square, world units)
export const LH = 0.5; // height of one layer
export const PED_H = 14; // the pedestal the tower stands on
export const MAX_LAYERS = 1200; // a run this tall would take well over an hour
export const HUE_STEP = 0.016; // hue shift from one layer to the next

// The two axes a slab can slide along, alternating every layer.
export const AX_X = 0;
export const AX_Z = 1;

export function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Overshoots a little before settling: for pops and landings.
export function backOut(t) {
  const u = t - 1;
  return 1 + 2.7 * u * u * u + 1.7 * u * u;
}

// The colour of layer i in a run that started at baseHue. HSL is read as
// sRGB so the numbers mean what they look like.
export function layerColor(i, baseHue, out) {
  const h = (((baseHue + i * HUE_STEP) % 1) + 1) % 1;
  return out.setHSL(h, 0.6, 0.6 + 0.05 * Math.sin(i * 0.41), THREE.SRGBColorSpace);
}

// A unit box whose vertex colours run from white at the top to a darker shade
// at the bottom. Tinted per instance, every layer gets a soft seam at its base,
// so the stack reads as separate slabs even when neighbours have close hues.
export function slabGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getY(i) > 0 ? 1 : 0.7;
    colors[i * 3] = k;
    colors[i * 3 + 1] = k;
    colors[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const tmpColor = new THREE.Color();

// Gives a geometry one flat vertex colour (with an optional darker bottom), so
// parts can be merged into a single mesh with one material.
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
