// Low-poly voxel models. Each is built once from colored boxes merged into a
// single geometry (vertex colors), so a whole kind of object is one draw call.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LILY_Y, LOG_Y, box, paint, paintTop } from './shared.js';

const DARK = 0x2a2a30;
const WINDOW = 0x26323f;

// The chicken faces -z (forward). About one cell wide and tall.
export function chickenGeometry() {
  const white = 0xf4f1ea;
  const top = 0xffffff;
  const orange = 0xff9f1c;
  const red = 0xff3b3b;
  return mergeGeometries([
    box(0.07, 0.2, 0.07, -0.12, 0.1, 0.03, orange), // legs
    box(0.07, 0.2, 0.07, 0.12, 0.1, 0.03, orange),
    box(0.13, 0.04, 0.18, -0.12, 0.02, -0.02, orange), // feet
    box(0.13, 0.04, 0.18, 0.12, 0.02, -0.02, orange),
    box(0.56, 0.44, 0.6, 0, 0.42, 0.05, white, top), // body
    box(0.42, 0.4, 0.38, 0, 0.8, -0.1, white, top), // head and neck
    box(0.1, 0.14, 0.26, 0, 1.07, -0.08, red), // comb
    box(0.18, 0.1, 0.16, 0, 0.82, -0.36, orange), // beak
    box(0.08, 0.12, 0.06, 0, 0.71, -0.31, red), // wattle
    box(0.44, 0.08, 0.08, 0, 0.9, -0.2, 0x111111), // eyes: one bar that shows on both sides
    box(0.06, 0.24, 0.36, -0.31, 0.44, 0.06, 0xe2ddd2), // wings
    box(0.06, 0.24, 0.36, 0.31, 0.44, 0.06, 0xe2ddd2),
    box(0.3, 0.24, 0.12, 0, 0.6, 0.4, white, top), // tail
  ]).scale(1.12, 1.12, 1.12);
}

// A ground strip: a unit block with its top at y = 0. The instance color
// tints it; the sides are darker so river banks read as earth.
export function groundGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, -0.5, 0);
  return paintTop(g, 0xffffff, 0x8a8a8a);
}

export function treeGeometry() {
  return mergeGeometries([
    box(0.28, 0.36, 0.28, 0, 0.18, 0, 0x8b5a33),
    box(0.8, 0.62, 0.8, 0, 0.66, 0, 0x3f9e45, 0x58bd52),
    box(0.54, 0.34, 0.54, 0, 1.14, 0, 0x4aac4c, 0x6bcf5f),
  ]);
}

export function rockGeometry() {
  return mergeGeometries([
    box(0.74, 0.4, 0.64, 0, 0.2, 0, 0x8d96a3, 0xb3bcc7),
    box(0.42, 0.2, 0.38, 0.08, 0.5, -0.04, 0x8d96a3, 0xc2cad3),
  ]);
}

// A flat unit square for fake shadows.
export function shadowGeometry() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

// Vehicles point towards +x; a negative x scale turns them around.
// White parts take the per-instance color.
export function carGeometry() {
  const parts = [
    box(1.3, 0.36, 0.72, 0, 0.32, 0, 0xffffff, 0xffffff), // body
    box(0.74, 0.18, 0.66, -0.1, 0.59, 0, WINDOW), // window band
    box(0.7, 0.1, 0.62, -0.1, 0.73, 0, 0xffffff), // roof
    box(0.06, 0.08, 0.16, 0.66, 0.36, -0.22, 0xfff3b0), // headlights
    box(0.06, 0.08, 0.16, 0.66, 0.36, 0.22, 0xfff3b0),
  ];
  for (let i = 0; i < 4; i++) {
    parts.push(box(0.28, 0.24, 0.08, i < 2 ? 0.38 : -0.38, 0.13, i % 2 ? 0.36 : -0.36, DARK));
  }
  return mergeGeometries(parts);
}

export function truckGeometry(cab, cargo) {
  const parts = [
    box(2.36, 0.16, 0.7, 0, 0.2, 0, DARK), // chassis
    box(0.62, 0.62, 0.78, 0.84, 0.58, 0, cab, cab), // cab
    box(0.64, 0.2, 0.8, 0.86, 0.72, 0, WINDOW), // windscreen band
    box(1.66, 0.9, 0.84, -0.32, 0.73, 0, cargo, 0xffffff), // cargo box
    box(1.68, 0.12, 0.86, -0.32, 0.5, 0, cab), // stripe
  ];
  for (let i = 0; i < 6; i++) {
    const x = i < 2 ? 0.78 : i < 4 ? -0.3 : -0.86;
    parts.push(box(0.3, 0.26, 0.08, x, 0.13, i % 2 ? 0.37 : -0.37, DARK));
  }
  return mergeGeometries(parts);
}

// A log `len` cells long floating on the river, with grooves at the cell
// borders so the spots the chicken can land on are easy to read.
export function logGeometry(len) {
  const parts = [
    box(len - 0.06, 0.3, 0.62, 0, LOG_Y - 0.15, 0, 0x8f5d33, 0xb57b45),
    box(0.06, 0.26, 0.54, -len / 2 + 0.03, LOG_Y - 0.15, 0, 0xe6b77d), // cut ends
    box(0.06, 0.26, 0.54, len / 2 - 0.03, LOG_Y - 0.15, 0, 0xe6b77d),
  ];
  for (let i = 1; i < len; i++) parts.push(box(0.06, 0.02, 0.63, -len / 2 + i, LOG_Y, 0, 0x7a4c28));
  return mergeGeometries(parts);
}

export function lilyGeometry() {
  const pad = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10);
  pad.translate(0, LILY_Y - 0.03, 0);
  paintTop(pad, 0x5cc15a, 0x2f8a3c);
  return mergeGeometries([pad, box(0.13, 0.1, 0.13, 0.2, LILY_Y + 0.04, 0.16, 0xff8fc8, 0xffc2e2)]);
}

export function engineGeometry() {
  return mergeGeometries([
    box(2.9, 0.22, 0.9, 0, 0.17, 0, DARK), // chassis
    box(2.8, 0.92, 0.86, -0.02, 0.73, 0, 0xe53f4b, 0xf05a63),
    box(2.82, 0.14, 0.88, -0.02, 0.5, 0, 0xffd23f), // stripe
    box(0.96, 0.32, 0.9, -0.82, 1.32, 0, 0xc0303c, 0xd94450), // cab roof
    box(0.06, 0.3, 0.66, 1.4, 0.86, 0, WINDOW), // front window
    box(0.98, 0.24, 0.92, -0.82, 0.98, 0, WINDOW), // side windows
  ]);
}

export function wagonGeometry() {
  return mergeGeometries([
    box(2.9, 0.22, 0.9, 0, 0.17, 0, DARK),
    box(2.76, 0.88, 0.86, 0, 0.7, 0, 0x3d7fe0, 0x5d98ef),
    box(2.4, 0.22, 0.88, 0, 0.82, 0, WINDOW),
    box(2.78, 0.1, 0.88, 0, 0.46, 0, 0xf4f4f4),
  ]);
}

// Two rails and their sleepers across the whole width of a row.
export function railGeometry(halfWidth) {
  const parts = [
    box(halfWidth * 2, 0.08, 0.08, 0, 0.06, -0.24, 0xd5dbe3, 0xf0f3f7),
    box(halfWidth * 2, 0.08, 0.08, 0, 0.06, 0.24, 0xd5dbe3, 0xf0f3f7),
  ];
  for (let x = -halfWidth + 0.4; x < halfWidth; x += 0.8) {
    parts.push(box(0.22, 0.04, 0.84, x, 0.02, 0, 0x6e4a32));
  }
  return mergeGeometries(parts);
}

// Dashed lane markings across the whole width of a row.
export function dashGeometry(halfWidth) {
  const parts = [];
  for (let x = -halfWidth + 0.4; x < halfWidth; x += 1.6) {
    const g = new THREE.PlaneGeometry(0.8, 0.07);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
}

// The crossing signal; its two lamps are a separate mesh so they can flash.
export function poleGeometry() {
  return mergeGeometries([
    box(0.1, 1.3, 0.1, 0, 0.65, 0, 0x7d838c),
    box(0.62, 0.3, 0.14, 0, 1.3, 0, 0x2b2b31),
    box(0.5, 0.1, 0.06, 0, 0.95, 0, 0xf4f4f4), // crossbuck bar
  ]);
}

export function lampGeometry() {
  const g = new THREE.BoxGeometry(0.2, 0.2, 0.06);
  return g;
}

export function coinGeometry() {
  const rim = new THREE.CylinderGeometry(0.27, 0.27, 0.08, 12);
  rim.rotateX(Math.PI / 2);
  paint(rim, 0xffc21a);
  const face = new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12);
  face.rotateX(Math.PI / 2);
  paint(face, 0xffe680);
  return mergeGeometries([rim, face]);
}

// The hawk faces -z. Wings are separate so they can flap.
export function hawkBodyGeometry() {
  return mergeGeometries([
    box(0.5, 0.42, 1.0, 0, 0, 0, 0x6e4626, 0x8a5a32),
    box(0.42, 0.4, 0.42, 0, 0.14, -0.62, 0xf3efe6),
    box(0.14, 0.14, 0.22, 0, 0.08, -0.9, 0xffc21f),
    box(0.44, 0.08, 0.08, 0, 0.2, -0.7, 0x111111),
    box(0.56, 0.1, 0.42, 0, 0.06, 0.68, 0x4e3119),
    box(0.3, 0.16, 0.16, 0, -0.28, -0.12, 0xffc21f), // talons
  ]);
}

// One wing reaching out along +x from the shoulder; mirrored for the left.
export function hawkWingGeometry(side) {
  const g = mergeGeometries([
    box(0.7, 0.08, 0.6, 0.35, 0, 0, 0x7d5232, 0x956339),
    box(0.6, 0.06, 0.44, 0.95, 0, 0.06, 0x5a3a1f, 0x6e4626),
  ]);
  if (side < 0) {
    g.scale(-1, 1, 1);
    // Mirroring flips the triangle winding; flip it back so faces stay outward.
    const index = g.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const t = index[i + 1];
      index[i + 1] = index[i + 2];
      index[i + 2] = t;
    }
    g.computeVertexNormals();
  }
  return g;
}
