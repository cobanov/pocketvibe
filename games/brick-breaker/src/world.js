// Static scenery: the field floor, its walls, the raised platform it sits on
// and some low-poly decoration on the ground around it. Everything except the
// textured floor is merged into one vertex-colored mesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIELD_BOTTOM, FIELD_D, FIELD_L, FIELD_R, FIELD_TOP, FIELD_W, box, cylinder, paint } from './shared.js';

const WALL_T = 0.6; // wall thickness
const WALL_H = 0.7;
const GROUND_Y = -2.2;
const TILE = 1.3; // floor grid matches the brick columns

function gridTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2f2b7a';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#3d3a96';
  ctx.fillRect(0, 0, 64, 3);
  ctx.fillRect(0, 0, 3, 64);
  ctx.fillRect(30, 30, 4, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// A small deterministic random generator, so the decoration is the same every run.
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function scenery() {
  const parts = [];
  const wallColor = 0xebe6ff;
  const trim = 0x41e2d0;
  const post = 0xff6fae;

  // The platform under the field and its glowing front edge (where balls fall).
  parts.push(box(FIELD_W + WALL_T * 2, -GROUND_Y, FIELD_D + WALL_T, 0, GROUND_Y / 2 - 0.01, -WALL_T / 2, 0x463f9c));
  parts.push(box(FIELD_W, 0.06, 0.12, 0, -0.02, FIELD_BOTTOM - 0.06, 0xff4f7b));
  parts.push(box(FIELD_W + WALL_T * 2, 0.25, 0.08, 0, -0.16, FIELD_BOTTOM + 0.04, 0xff4f7b));

  // Side and top walls, with a bright trim along their inner edge.
  const sideLen = FIELD_D + WALL_T;
  const sideZ = -WALL_T / 2;
  parts.push(box(WALL_T, WALL_H, sideLen, FIELD_L - WALL_T / 2, WALL_H / 2, sideZ, wallColor));
  parts.push(box(WALL_T, WALL_H, sideLen, FIELD_R + WALL_T / 2, WALL_H / 2, sideZ, wallColor));
  parts.push(box(FIELD_W, WALL_H, WALL_T, 0, WALL_H / 2, FIELD_TOP - WALL_T / 2, wallColor));
  parts.push(box(0.12, 0.08, sideLen, FIELD_L - 0.06, WALL_H + 0.04, sideZ, trim));
  parts.push(box(0.12, 0.08, sideLen, FIELD_R + 0.06, WALL_H + 0.04, sideZ, trim));
  parts.push(box(FIELD_W, 0.08, 0.12, 0, WALL_H + 0.04, FIELD_TOP - 0.06, trim));

  // Corner and end posts.
  const postH = WALL_H + 0.35;
  const px = FIELD_W / 2 + WALL_T / 2;
  const corners = [
    [-px, FIELD_TOP - WALL_T / 2],
    [px, FIELD_TOP - WALL_T / 2],
    [-px, FIELD_BOTTOM - 0.1],
    [px, FIELD_BOTTOM - 0.1],
  ];
  for (const [x, z] of corners) {
    parts.push(box(0.9, postH, 0.9, x, postH / 2, z, post));
    parts.push(box(0.6, 0.12, 0.6, x, postH + 0.06, z, 0xffd84a));
  }

  // The ground far below, with pillars and crystals on it.
  const ground = new THREE.PlaneGeometry(90, 70);
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, GROUND_Y, -2);
  parts.push(paint(ground, 0x231d58));

  const rand = seeded(7);
  const decor = [0x372f86, 0x41379a, 0x2a7d8c, 0x84387a];
  for (let i = 0; i < 22; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (FIELD_W / 2 + 2.4 + rand() * 10);
    const z = -14 + rand() * 26;
    const c = decor[Math.floor(rand() * decor.length)];
    if (rand() < 0.5) {
      const h = 0.6 + rand() * 1.2;
      const w = 0.8 + rand() * 0.8;
      parts.push(box(w, h, w, x, GROUND_Y + h / 2, z, c));
      parts.push(box(w * 0.7, 0.15, w * 0.7, x, GROUND_Y + h + 0.075, z, i % 3 === 0 ? 0xff6fae : 0x41e2d0));
    } else {
      const h = 0.9 + rand() * 1.1;
      parts.push(cylinder(0, 0.45 + rand() * 0.35, h, 5, x, GROUND_Y, z, c));
    }
  }
  return mergeGeometries(parts);
}

export function createWorld(scene) {
  const grid = gridTexture();
  grid.repeat.set(FIELD_W / TILE, FIELD_D / TILE);
  // Line the grid up with the brick columns.
  grid.offset.set(-((FIELD_W / TILE) % 1) / 2, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD_W, FIELD_D), new THREE.MeshLambertMaterial({ map: grid }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  scene.add(new THREE.Mesh(scenery(), new THREE.MeshLambertMaterial({ vertexColors: true })));
}
