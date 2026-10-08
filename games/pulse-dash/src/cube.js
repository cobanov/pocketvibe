// The player's cube: a glowing block with a concentric-square face. It turns
// a quarter turn per jump while in the air and settles flat on landing,
// squashes and stretches, and carries a soft additive halo that pulses.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUBE_COLOR, box, glowTexture } from './shared.js';

const QUARTER = Math.PI / 2;
const TURN_PER_CELL = QUARTER / 4; // a jump is 4 cells long: a quarter turn

// Fakes lighting in the vertex colours: lighter top, darker sides.
function shade(geometry) {
  const nor = geometry.attributes.normal;
  const col = geometry.attributes.color;
  for (let i = 0; i < nor.count; i++) {
    const k = nor.getY(i) > 0.5 ? 1.25 : Math.abs(nor.getX(i)) > 0.5 ? 0.7 : nor.getZ(i) < -0.5 ? 0.5 : 1;
    col.setXYZ(i, Math.min(1, col.getX(i) * k), Math.min(1, col.getY(i) * k), Math.min(1, col.getZ(i) * k));
  }
  return geometry;
}

function cubeGeometry() {
  const f = 0.485;
  return shade(
    mergeGeometries([
      box(0.96, 0.96, 0.96, 0, 0, 0, CUBE_COLOR),
      box(0.62, 0.62, 0.02, 0, 0, f, 0x10260a), // dark inner square
      box(0.36, 0.36, 0.03, 0, 0, f + 0.01, CUBE_COLOR),
      box(0.18, 0.18, 0.04, 0, 0, f + 0.02, 0xf4ffd8), // bright core
      box(0.96, 0.06, 0.02, 0, 0.45, f, 0xeaffb0), // light rim on the face
      box(0.96, 0.06, 0.02, 0, -0.45, f, 0x5f8f12),
      box(0.06, 0.84, 0.02, -0.45, 0, f, 0xeaffb0),
      box(0.06, 0.84, 0.02, 0.45, 0, f, 0x5f8f12),
    ]),
  );
}

export function createCube(scene) {
  const group = new THREE.Group(); // at the cube's bottom centre; squashes
  const mesh = new THREE.Mesh(cubeGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  mesh.position.y = 0.5;
  group.add(mesh);
  const haloMat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: CUBE_COLOR,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMat);
  scene.add(group, halo);

  let rot = 0;
  let squash = 0; // 1 right after landing
  let stretch = 0; // 1 right after a jump

  return {
    reset() {
      rot = 0;
      squash = 0;
      stretch = 0;
      group.visible = true;
      halo.visible = true;
    },

    jump() {
      stretch = 1;
      squash = 0;
    },

    land() {
      squash = 1;
      stretch = 0;
    },

    die() {
      group.visible = false;
      halo.visible = false;
    },

    // moved: cells travelled this frame (turns the cube while it flies).
    update(dt, x, y, grounded, moved, pulse) {
      if (grounded) {
        // Settle on the nearest flat side.
        const target = Math.round(rot / QUARTER) * QUARTER;
        rot += (target - rot) * Math.min(1, dt * 22);
      } else {
        rot -= moved * TURN_PER_CELL;
      }
      squash *= Math.exp(-dt * 12);
      stretch *= Math.exp(-dt * 9);
      group.position.set(x, y, 0);
      group.scale.set(1 + 0.24 * squash - 0.12 * stretch, 1 - 0.26 * squash + 0.16 * stretch, 1);
      mesh.rotation.z = rot;
      halo.position.set(x, y + 0.5, -0.55);
      halo.scale.setScalar(2.5 + 0.5 * pulse);
    },
  };
}
