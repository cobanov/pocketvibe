// The static scenery around the field: the ground, a concrete rim with
// hazard stripes, and an army camp around it (sandbags, crates, barrels, tank
// traps, tents, pines, rocks and bushes). Everything is merged into one
// vertex-coloured mesh: one draw call.

import * as THREE from 'three';
import { FLOOR_H, HALF, blob, box, cylinder, merge, paint } from './shared.js';

const GROUND = 0x4a5638;
const RIM = 0x8d918c;
const RIM_TOP = 0xb4b8b0;
const STRIPE_A = 0xf2c53d;
const STRIPE_B = 0x26272a;
const RIM_W = 0.55;
const RIM_H = 0.42; // above the field's floor

// Small deterministic random, so the camp looks the same every time.
let seed = 11;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);

// Moves a list of parts built around the origin to (x, y, z), turned by rot.
function place(parts, x, y, z, s, rot) {
  tmpQuat.setFromAxisAngle(yAxis, rot);
  tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(s, s, s));
  for (let i = 0; i < parts.length; i++) parts[i].applyMatrix4(tmpMatrix);
  return parts;
}

function sandbags(len) {
  const parts = [];
  for (let row = 0; row < 2; row++) {
    const n = Math.round(len / 0.5) - row;
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.25 + i * 0.5 + row * 0.25;
      parts.push(blob(0.3, 0.85, 0.42, 0.55, x, 0.12 + row * 0.22, 0, row ? 0xc9b07a : 0xb59c66));
    }
  }
  return parts;
}

function crate(s) {
  return [
    box(s, s, s, 0, s / 2, 0, 0x9c6b3a, 0xc08a52),
    box(s + 0.02, 0.08, s + 0.02, 0, s * 0.3, 0, 0x6e4a28),
    box(s + 0.02, 0.08, s + 0.02, 0, s * 0.75, 0, 0x6e4a28),
  ];
}

function barrel(hex) {
  return [
    cylinder(0.22, 0.22, 0.6, 8, 0, 0, 0, hex, 0xdedede),
    cylinder(0.235, 0.235, 0.06, 8, 0, 0.16, 0, 0x2a2a2a),
    cylinder(0.235, 0.235, 0.06, 8, 0, 0.42, 0, 0x2a2a2a),
  ];
}

// A Czech hedgehog: three crossed steel beams.
function hedgehog() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.BoxGeometry(0.1, 0.1, 0.9);
    g.rotateX(k === 0 ? 0.8 : 0);
    g.rotateZ(k === 1 ? 0.8 : 0);
    g.rotateY((k * Math.PI) / 3);
    g.translate(0, 0.3, 0);
    parts.push(paint(g, 0x5b5f66));
  }
  return parts;
}

function tent() {
  const g = new THREE.CylinderGeometry(0.75, 0.75, 1.6, 3);
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI / 6);
  g.translate(0, 0.36, 0);
  return [paint(g, 0x6b7a44), box(0.08, 0.5, 0.08, 0.84, 0.25, 0, 0x4a3a28)];
}

function pine(s) {
  return [
    cylinder(0.1, 0.14, 0.4, 5, 0, 0, 0, 0x6b4a2e),
    cylinder(0, 0.62, 0.9, 7, 0, 0.3, 0, 0x2f7a3c),
    cylinder(0, 0.45, 0.75, 7, 0, 0.8, 0, 0x3c9149),
  ].map((g) => g.scale(s, s, s));
}

function bush() {
  return [blob(0.38, 1, 0.7, 1, 0, 0.18, 0, rand() < 0.5 ? 0x4f8a3a : 0x5c9a44)];
}

function rock() {
  return [blob(0.32, 1.3, 0.6, 1, 0, 0.1, 0, rand() < 0.5 ? 0x8a8c86 : 0x9c9e96)];
}

export function createWorld(scene) {
  const parts = [];
  const gy = -FLOOR_H; // the ground lies at the bottom of the field slab

  const ground = new THREE.PlaneGeometry(64, 48);
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, gy, -4);
  parts.push(paint(ground, GROUND));

  // Darker patches of trodden earth.
  for (let i = 0; i < 18; i++) {
    const x = (rand() < 0.5 ? -1 : 1) * (8 + rand() * 7);
    const z = -14 + rand() * 24;
    const g = new THREE.CircleGeometry(0.8 + rand() * 1.4, 7);
    g.rotateX(-Math.PI / 2);
    g.scale(1.4, 1, 1);
    g.translate(x, gy + 0.005, z);
    parts.push(paint(g, 0x3f4930));
  }

  // The concrete rim around the field, with hazard stripes on top.
  const outer = HALF + RIM_W;
  const rimH = RIM_H + FLOOR_H;
  const rimY = gy + rimH / 2;
  parts.push(box(outer * 2, rimH, RIM_W, 0, rimY, -HALF - RIM_W / 2, RIM, RIM_TOP));
  parts.push(box(outer * 2, rimH, RIM_W, 0, rimY, HALF + RIM_W / 2, RIM, RIM_TOP));
  parts.push(box(RIM_W, rimH, HALF * 2, -HALF - RIM_W / 2, rimY, 0, RIM, RIM_TOP));
  parts.push(box(RIM_W, rimH, HALF * 2, HALF + RIM_W / 2, rimY, 0, RIM, RIM_TOP));
  const stripes = 18;
  const step = (outer * 2) / stripes;
  for (let i = 0; i < stripes; i++) {
    const hex = i % 2 ? STRIPE_B : STRIPE_A;
    const a = -outer + (i + 0.5) * step;
    parts.push(box(step, 0.03, RIM_W * 0.5, a, RIM_H + 0.015, -HALF - RIM_W / 2, hex));
    parts.push(box(step, 0.03, RIM_W * 0.5, a, RIM_H + 0.015, HALF + RIM_W / 2, hex));
    parts.push(box(RIM_W * 0.5, 0.03, step, -HALF - RIM_W / 2, RIM_H + 0.015, a, hex));
    parts.push(box(RIM_W * 0.5, 0.03, step, HALF + RIM_W / 2, RIM_H + 0.015, a, hex));
  }
  // Corner posts with lamps.
  for (let k = 0; k < 4; k++) {
    const x = (k % 2 ? 1 : -1) * (HALF + RIM_W / 2);
    const z = (k < 2 ? -1 : 1) * (HALF + RIM_W / 2);
    parts.push(box(0.75, rimH + 0.25, 0.75, x, gy + (rimH + 0.25) / 2, z, 0x6d716c, 0x9a9e98));
    parts.push(box(0.36, 0.14, 0.36, x, RIM_H + 0.32, z, 0xffe9a0));
  }

  // The camp: groups placed around the field, left, right and behind it.
  const groups = [
    [sandbags(3), -8.4, -3.5, Math.PI / 2],
    [sandbags(3), 8.4, 2.5, Math.PI / 2],
    [sandbags(2.5), -8.3, 4.6, Math.PI / 2],
    [sandbags(4), -3, -7.9, 0],
    [sandbags(4), 3.5, -7.9, 0],
    [crate(0.7), -9.4, -1.2, 0.3],
    [crate(0.55), -9.6, -0.2, 0.9],
    [crate(0.7), 9.3, -2.2, -0.2],
    [crate(0.6), 9.8, -1.3, 0.5],
    [crate(0.5), 9.2, 5.4, 0.2],
    [barrel(0xb8432e), -9.2, 1.4, 0],
    [barrel(0x5d7a3e), -9.8, 1.9, 0],
    [barrel(0x3e6a9c), 9.4, 0.4, 0],
    [barrel(0xb8432e), 9.9, 0.9, 0],
    [barrel(0x5d7a3e), 8.9, 6.6, 0],
    [hedgehog(), -9.6, -5.4, 0.4],
    [hedgehog(), 9.5, -4.6, 1.1],
    [hedgehog(), -9.2, 7.2, 0.2],
    [hedgehog(), 9.6, 3.6, 0.7],
    [tent(), -10.6, 3.4, 0.2],
    [tent(), 10.8, -6.8, -0.3],
    [tent(), -6.5, -10.2, 0.1],
  ];
  for (let i = 0; i < groups.length; i++) {
    const [list, x, z, rot] = groups[i];
    place(list, x, gy, z, 1, rot);
    for (let k = 0; k < list.length; k++) parts.push(list[k]);
  }

  // Pines, bushes and rocks scattered further out.
  for (let i = 0; i < 70; i++) {
    let x;
    let z;
    if (i < 30) {
      x = -16 + rand() * 32;
      z = -15 + rand() * 6;
    } else {
      x = (i % 2 ? 1 : -1) * (10.4 + rand() * 6);
      z = -10 + rand() * 20;
    }
    const r = rand();
    const list = r < 0.45 ? pine(0.8 + rand() * 0.6) : r < 0.75 ? bush() : rock();
    place(list, x, gy, z, 0.8 + rand() * 0.5, rand() * Math.PI * 2);
    for (let k = 0; k < list.length; k++) parts.push(list[k]);
  }

  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);
  return mesh;
}
