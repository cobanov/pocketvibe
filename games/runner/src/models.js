// Low-poly models built from boxes with vertex colors, so each kind is one
// geometry for one InstancedMesh (or one mesh) with a shared material.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, paint } from './shared.js';

export function runnerGeometry() {
  return mergeGeometries([
    box(0.22, 0.6, 0.25, -0.15, 0.3, 0, 0x2b3a67), // legs
    box(0.22, 0.6, 0.25, 0.15, 0.3, 0, 0x2b3a67),
    box(0.7, 0.65, 0.4, 0, 0.92, 0, 0xe8553e), // body
    box(0.18, 0.55, 0.2, -0.45, 0.95, 0, 0xe8553e), // arms
    box(0.18, 0.55, 0.2, 0.45, 0.95, 0, 0xe8553e),
    box(0.48, 0.45, 0.42, 0, 1.47, 0, 0xf2c6a0), // head
    box(0.5, 0.14, 0.44, 0, 1.68, 0, 0x3a2a1e), // hair
  ]);
}

export function hurdleGeometry() {
  return mergeGeometries([
    box(1.7, 0.35, 0.5, 0, 0.72, 0, 0xf08a24),
    box(0.15, 0.55, 0.15, -0.7, 0.27, 0, 0xdddddd),
    box(0.15, 0.55, 0.15, 0.7, 0.27, 0, 0xdddddd),
  ]);
}

export function barGeometry() {
  return mergeGeometries([
    box(2.0, 0.5, 0.3, 0, 1.35, 0, 0xf2c230),
    box(0.15, 1.6, 0.15, -1.0, 0.8, 0, 0x333333),
    box(0.15, 1.6, 0.15, 1.0, 0.8, 0, 0x333333),
  ]);
}

export function wallGeometry() {
  return mergeGeometries([
    box(1.7, 2.3, 1.0, 0, 1.15, 0, 0xc8443a),
    box(1.75, 0.3, 1.05, 0, 2.45, 0, 0x8e2c26),
  ]);
}

// A delivery van driving at the runner; its front faces +z.
export function vanGeometry() {
  return mergeGeometries([
    box(1.6, 1.45, 3.4, 0, 1.1, 0, 0x3f7fd6), // body
    box(1.62, 0.22, 3.0, 0, 1.02, -0.15, 0xf4f4f4), // side stripe
    box(1.42, 0.5, 0.06, 0, 1.47, 1.71, 0x1d2b44), // windscreen
    box(0.34, 0.18, 0.06, -0.52, 0.72, 1.71, 0xfff3a8), // headlights
    box(0.34, 0.18, 0.06, 0.52, 0.72, 1.71, 0xfff3a8),
    box(1.66, 0.2, 0.16, 0, 0.42, 1.72, 0x9aa2ad), // bumper
    box(0.26, 0.5, 0.62, -0.72, 0.25, 1.05, 0x222222), // wheels
    box(0.26, 0.5, 0.62, 0.72, 0.25, 1.05, 0x222222),
    box(0.26, 0.5, 0.62, -0.72, 0.25, -1.05, 0x222222),
    box(0.26, 0.5, 0.62, 0.72, 0.25, -1.05, 0x222222),
  ]);
}

export function coinGeometry() {
  const g = new THREE.CylinderGeometry(0.38, 0.38, 0.1, 10);
  g.rotateX(Math.PI / 2);
  return g;
}

// A horseshoe magnet, open side up, centered on its middle.
export function magnetGeometry() {
  return mergeGeometries([
    box(0.24, 0.62, 0.24, -0.3, 0.05, 0, 0xe5333b),
    box(0.24, 0.62, 0.24, 0.3, 0.05, 0, 0xe5333b),
    box(0.84, 0.24, 0.24, 0, -0.32, 0, 0xe5333b),
    box(0.24, 0.2, 0.25, -0.3, 0.46, 0, 0xf2f2f2),
    box(0.24, 0.2, 0.25, 0.3, 0.46, 0, 0xf2f2f2),
  ]);
}

// A shield badge: a tall cyan gem with a white stripe down its face.
export function shieldGeometry() {
  const gem = new THREE.OctahedronGeometry(0.5);
  gem.scale(0.95, 1.2, 0.5);
  return mergeGeometries([paint(gem, 0x3fd2ff), box(0.12, 0.8, 0.54, 0, 0, 0, 0xffffff).toNonIndexed()]);
}
