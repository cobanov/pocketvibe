// Low-poly models built from colored boxes and cylinders, each merged into a
// single geometry (vertex colors), so one kind of object is one draw call.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CRATE, PY, box, boxFaces, cylinder, paint, paintTop } from './shared.js';

// Polyhedra come without an index and boxes with one; mergeGeometries needs
// them all alike, so everything is flattened first (and texture coordinates,
// which nothing here uses, are dropped).
export function merge(parts) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) g.deleteAttribute('uv');
  const geometry = mergeGeometries(flat);
  for (let i = 0; i < parts.length; i++) {
    parts[i].dispose();
    if (flat[i] !== parts[i]) flat[i].dispose();
  }
  return geometry;
}

const ea = new THREE.Vector3();
const eb = new THREE.Vector3();
const ec = new THREE.Vector3();
const en = new THREE.Vector3();
const eye = new THREE.Vector3();

// Keeps only the triangles of a flat (non-indexed) geometry whose front
// faces at least one of the eye positions, or, with no eyes, those that do
// not face down or away from the camera (which is always above, in front).
// The rest are never on screen, but would still be drawn and counted.
export function cullHidden(geometry, eyes = null) {
  const pos = geometry.attributes.position;
  const keep = [];
  for (let t = 0; t < pos.count; t += 3) {
    ea.fromBufferAttribute(pos, t);
    eb.fromBufferAttribute(pos, t + 1).sub(ea);
    ec.fromBufferAttribute(pos, t + 2).sub(ea);
    en.crossVectors(eb, ec).normalize();
    let seen = false;
    if (!eyes) {
      seen = en.y > -0.5 && en.z > -0.5;
    } else {
      // Measured from the triangle's middle.
      ea.addScaledVector(eb, 1 / 3).addScaledVector(ec, 1 / 3);
      for (let i = 0; i < eyes.length && !seen; i++) seen = en.dot(eye.subVectors(eyes[i], ea)) > -0.05;
    }
    if (seen) keep.push(t);
  }
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const src = geometry.attributes[name];
    const size = src.itemSize;
    const out = new Float32Array(keep.length * 3 * size);
    let o = 0;
    for (const t of keep) for (let v = t; v < t + 3; v++) for (let k = 0; k < size; k++) out[o++] = src.array[v * size + k];
    g.setAttribute(name, new THREE.BufferAttribute(out, size));
  }
  geometry.dispose();
  return g;
}

// A wooden crate standing on y = 0: planks inside a darker frame, with a
// diagonal brace on every side the camera can see.
export function crateGeometry() {
  const s = CRATE;
  const h = s / 2;
  const t = 0.11; // frame thickness
  const wood = 0xe0a463;
  const woodTop = 0xf0bd7e;
  const frame = 0xa86a35;
  const frameTop = 0xc4844a;
  const parts = [box(s - 0.04, s - 0.04, s - 0.04, 0, h, 0, wood, woodTop)];
  // Twelve edges.
  for (let a = -1; a <= 1; a += 2) {
    for (let b = -1; b <= 1; b += 2) {
      parts.push(box(s, t, t, 0, h + a * (h - t / 2), b * (h - t / 2), frame, frameTop));
      parts.push(box(t, s, t, a * (h - t / 2), h, b * (h - t / 2), frame, frameTop));
      parts.push(box(t, t, s, a * (h - t / 2), h + b * (h - t / 2), 0, frame, frameTop));
    }
  }
  // Braces across the sides (the back one is never seen).
  const len = (s - 2 * t) * Math.SQRT2;
  for (let i = 0; i < 4; i++) {
    if (i === 2) continue;
    const g = new THREE.BoxGeometry(len, 0.09, 0.04);
    g.rotateZ(i % 2 ? Math.PI / 4 : -Math.PI / 4);
    g.translate(0, h, h - 0.012);
    g.rotateY((i * Math.PI) / 2);
    parts.push(paint(g, frame));
  }
  // Plank seams on the lid.
  parts.push(boxFaces(s - 2 * t, 0.012, 0.025, 0, s + 0.001, -0.12, frame, undefined, PY));
  parts.push(boxFaces(s - 2 * t, 0.012, 0.025, 0, s + 0.001, 0.12, frame, undefined, PY));
  return cullHidden(merge(parts));
}

// A spot on the floor: a square frame with a diamond in the middle. Only
// the tops: the sides are too thin to see.
export function spotGeometry() {
  const c = 0xffffff; // tinted by the material
  const parts = [
    boxFaces(0.7, 0.03, 0.09, 0, 0.015, -0.31, c, undefined, PY),
    boxFaces(0.7, 0.03, 0.09, 0, 0.015, 0.31, c, undefined, PY),
    boxFaces(0.09, 0.03, 0.53, -0.31, 0.015, 0, c, undefined, PY),
    boxFaces(0.09, 0.03, 0.53, 0.31, 0.015, 0, c, undefined, PY),
  ];
  const d = boxFaces(0.24, 0.03, 0.24, 0, 0, 0, c, undefined, PY);
  d.rotateY(Math.PI / 4);
  d.translate(0, 0.015, 0);
  parts.push(d);
  return merge(parts);
}

// A flat unit square lying on the floor, for blobs and glows.
export function quadGeometry() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

// The worker. Every part is built around its own pivot (hips for legs,
// shoulders for arms, neck for the head) so it can swing; the model faces -z.
const SKIN = 0xffcf9e;
const SHIRT = 0xff7a45;
const OVERALLS = 0x3d7be0;
const OVERALLS_TOP = 0x5a93ee;
const BOOT = 0x5a3a26;
const HAT = 0xffcf2e;
const HAT_TOP = 0xffe066;

export const HIP_Y = 0.24;
export const SHOULDER_Y = 0.5;
export const NECK_Y = 0.56;

export function workerBodyGeometry() {
  return merge([
    box(0.36, 0.2, 0.26, 0, 0.32, 0, OVERALLS, OVERALLS_TOP), // overalls
    box(0.34, 0.16, 0.24, 0, 0.48, 0, SHIRT, SHIRT), // shirt
    box(0.24, 0.12, 0.03, 0, 0.42, -0.13, OVERALLS, OVERALLS_TOP), // bib
    box(0.06, 0.18, 0.02, -0.11, 0.48, -0.125, OVERALLS), // straps
    box(0.06, 0.18, 0.02, 0.11, 0.48, -0.125, OVERALLS),
    box(0.04, 0.04, 0.02, -0.11, 0.43, -0.135, 0xffe066), // buttons
    box(0.04, 0.04, 0.02, 0.11, 0.43, -0.135, 0xffe066),
    box(0.08, 0.05, 0.02, 0, 0.37, -0.145, 0x2f63bd), // pocket
  ]);
}

export function workerHeadGeometry() {
  const head = new THREE.SphereGeometry(0.2, 10, 8);
  head.scale(1, 0.92, 0.95);
  head.translate(0, 0.17, 0);
  const hat = new THREE.SphereGeometry(0.2, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  hat.scale(1, 0.75, 1);
  hat.translate(0, 0.23, 0.01);
  return merge([
    paint(head, SKIN),
    paintTop(hat, HAT_TOP, HAT),
    box(0.42, 0.035, 0.26, 0, 0.235, -0.07, HAT, HAT_TOP), // brim
    box(0.05, 0.05, 0.28, 0, 0.37, 0.01, 0xffb300), // ridge on the hat
    box(0.045, 0.07, 0.03, -0.075, 0.18, -0.18, 0x2a2030), // eyes
    box(0.045, 0.07, 0.03, 0.075, 0.18, -0.18, 0x2a2030),
    box(0.06, 0.035, 0.03, -0.12, 0.12, -0.165, 0xff9a9a), // cheeks
    box(0.06, 0.035, 0.03, 0.12, 0.12, -0.165, 0xff9a9a),
    box(0.07, 0.025, 0.03, 0, 0.1, -0.185, 0xc0504a), // smile
  ]);
}

// An arm hanging down from the shoulder pivot.
export function workerArmGeometry() {
  return merge([
    box(0.1, 0.16, 0.1, 0, -0.07, 0, SHIRT), // sleeve
    box(0.085, 0.1, 0.085, 0, -0.19, 0, SKIN), // forearm
    box(0.1, 0.07, 0.1, 0, -0.26, 0, 0xf2f2f2), // glove
  ]);
}

// A leg hanging down from the hip pivot, boot at the bottom.
export function workerLegGeometry() {
  return merge([
    box(0.12, 0.16, 0.13, 0, -0.08, 0, OVERALLS),
    box(0.13, 0.08, 0.18, 0, -0.2, -0.025, BOOT, 0x6e4a31),
  ]);
}

// Scenery around the board, standing on y = 0 (moved into place by the caller).

export function palletGeometry(load) {
  const parts = [
    box(1.1, 0.06, 0.9, 0, 0.17, 0, 0xc79a62, 0xd8ae78), // deck
    box(1.1, 0.12, 0.14, 0, 0.07, -0.36, 0xa87c4a),
    box(1.1, 0.12, 0.14, 0, 0.07, 0, 0xa87c4a),
    box(1.1, 0.12, 0.14, 0, 0.07, 0.36, 0xa87c4a),
  ];
  if (load === 1) {
    // Two stacked cardboard boxes.
    parts.push(box(0.5, 0.42, 0.42, -0.24, 0.41, 0.12, 0xc89b67, 0xd9b07e));
    parts.push(box(0.5, 0.42, 0.42, 0.26, 0.41, -0.1, 0xbf9060, 0xd2a675));
    parts.push(box(0.46, 0.38, 0.4, 0, 0.81, 0, 0xc89b67, 0xdcb683));
    parts.push(box(0.47, 0.03, 0.08, 0, 1.0, 0, 0xe8d9a8)); // tape
  } else if (load === 2) {
    // A wrapped stack.
    parts.push(box(1.0, 0.7, 0.82, 0, 0.55, 0, 0x7fc8c8, 0xa5e0dc));
    parts.push(box(1.02, 0.08, 0.84, 0, 0.45, 0, 0x5ea8a8));
  }
  return merge(parts);
}

export function barrelGeometry(hex, topHex) {
  return merge([
    cylinder(0.3, 0.74, 0, 0.37, 0, hex, topHex, 10),
    cylinder(0.315, 0.05, 0, 0.18, 0, 0x2b2f3a, undefined, 10),
    cylinder(0.315, 0.05, 0, 0.56, 0, 0x2b2f3a, undefined, 10),
  ]);
}

export function coneGeometry() {
  const cone = new THREE.ConeGeometry(0.17, 0.46, 8);
  cone.translate(0, 0.27, 0);
  const stripe = new THREE.CylinderGeometry(0.105, 0.135, 0.08, 8);
  stripe.translate(0, 0.24, 0);
  return merge([box(0.36, 0.05, 0.36, 0, 0.025, 0, 0xff7a1f), paint(cone, 0xff7a1f), paint(stripe, 0xffffff)]);
}

// The same color a little lighter, for the tops of blocks.
function lighten(hex) {
  const r = Math.min(255, ((hex >> 16) & 255) + 24);
  const g = Math.min(255, ((hex >> 8) & 255) + 24);
  const b = Math.min(255, (hex & 255) + 24);
  return (r << 16) | (g << 8) | b;
}

// A tall steel rack with boxes on its shelves, for the back of the room.
export function rackGeometry(seedFn) {
  const steel = 0x3d6fb3;
  const beam = 0xff9d2e;
  const parts = [];
  for (let a = -1; a <= 1; a += 2) {
    for (let b = -1; b <= 1; b += 2) parts.push(box(0.08, 2.4, 0.08, a * 1.0, 1.2, b * 0.4, steel));
  }
  const colors = [0xc89b67, 0xbf9060, 0x8ccf9a, 0xf28b82, 0x9ab8f0];
  for (let level = 0; level < 3; level++) {
    const y = 0.2 + level * 0.8;
    parts.push(box(2.1, 0.08, 0.1, 0, y, -0.4, beam));
    parts.push(box(2.1, 0.08, 0.1, 0, y, 0.4, beam));
    parts.push(box(2.0, 0.03, 0.8, 0, y + 0.04, 0, 0x8a96a8));
    let x = -0.85;
    while (x < 0.75) {
      const w = 0.32 + seedFn() * 0.3;
      if (x + w > 0.95) break;
      if (seedFn() < 0.8) {
        const hgt = 0.3 + seedFn() * 0.32;
        const hex = colors[Math.floor(seedFn() * colors.length)];
        parts.push(box(w - 0.04, hgt, 0.6, x + w / 2, y + 0.06 + hgt / 2, 0, hex, lighten(hex)));
      }
      x += w;
    }
  }
  return merge(parts);
}
