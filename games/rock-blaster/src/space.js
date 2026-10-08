// Backdrop: a soft nebula plane and two parallax star layers. Three meshes,
// three draw calls, nothing in here moves per vertex.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BG, HALF_H, HALF_W, part } from './shared.js';

// Each star layer is a tile slightly larger than the screen, built 2x2 times
// into one geometry, so sliding the mesh by up to one tile never shows a gap.
const TILE_W = HALF_W * 2 + 4;
const TILE_H = HALF_H * 2 + 4;

const tmpColor = new THREE.Color();

function nebula() {
  const g = new THREE.PlaneGeometry(TILE_W, TILE_H, 18, 12);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color(BG);
  const purple = new THREE.Color(0x3b1f66);
  const teal = new THREE.Color(0x0f4560);
  const pink = new THREE.Color(0x5a1f4e);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Three soft blobs blended over the base color.
    const a = Math.exp(-((x + 9) ** 2 + (y - 4) ** 2) / 70);
    const b = Math.exp(-((x - 10) ** 2 + (y + 5) ** 2) / 60);
    const c = Math.exp(-((x - 4) ** 2 + (y - 9) ** 2) / 30);
    tmpColor.copy(base).lerp(purple, a * 0.9).lerp(teal, b * 0.85).lerp(pink, c * 0.6);
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// count stars as small diamonds, repeated over a 2x2 block of tiles.
function starLayer(count, minSize, maxSize, hexes) {
  const verts = new Float32Array(count * 4 * 6 * 3);
  const colors = new Float32Array(count * 4 * 6 * 3);
  let v = 0;
  for (let i = 0; i < count; i++) {
    const sx = (Math.random() - 0.5) * TILE_W;
    const sy = (Math.random() - 0.5) * TILE_H;
    const s = minSize + Math.random() * (maxSize - minSize);
    tmpColor.setHex(hexes[i % hexes.length]).multiplyScalar(0.55 + Math.random() * 0.45);
    for (let t = 0; t < 4; t++) {
      const x = sx + (t & 1) * TILE_W;
      const y = sy + (t >> 1) * TILE_H;
      // Two triangles: a diamond centred on (x, y).
      const quad = [x, y + s, x - s, y, x + s, y, x + s, y, x - s, y, x, y - s];
      for (let k = 0; k < 6; k++) {
        verts[v * 3] = quad[k * 2];
        verts[v * 3 + 1] = quad[k * 2 + 1];
        verts[v * 3 + 2] = 0;
        colors[v * 3] = tmpColor.r;
        colors[v * 3 + 1] = tmpColor.g;
        colors[v * 3 + 2] = tmpColor.b;
        v++;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function createSpace(scene) {
  const back = new THREE.Mesh(nebula(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  back.position.z = -20;
  scene.add(back);

  const starMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const far = new THREE.Mesh(starLayer(110, 0.05, 0.09, [0xaab8ff, 0xffffff, 0xc8b8ff]), starMaterial);
  far.position.z = -12;
  far.frustumCulled = false;
  scene.add(far);
  const near = new THREE.Mesh(starLayer(45, 0.09, 0.15, [0xffffff, 0xfff1c0, 0xb8f0ff]), starMaterial);
  near.position.z = -6;
  near.frustumCulled = false;
  scene.add(near);

  let ox = 0;
  let oy = 0;

  function place(mesh, depth) {
    // Wrap the offset into one tile, then shift so the 2x2 block covers the screen.
    let x = (ox * depth) % TILE_W;
    let y = (oy * depth) % TILE_H;
    if (x > 0) x -= TILE_W;
    if (y > 0) y -= TILE_H;
    mesh.position.x = x;
    mesh.position.y = y;
  }

  return {
    // Drifts the stars against the ship's velocity for a sense of motion.
    update(dt, vx, vy) {
      ox -= (vx + 0.6) * dt;
      oy -= (vy + 0.25) * dt;
      place(far, 0.06);
      place(near, 0.16);
    },
  };
}

const FRAME = 0x05061a; // the dark space around the field
const EDGE = 0x2c3f86; // the line along the field's edges
const EDGE_W = 0.12;
const FRAME_Z = 20; // in front of everything, also explosions and flashes

// A rectangle from (x0, y0) to (x1, y1), painted.
function rect(x0, y0, x1, y1, hex) {
  const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  return part(g, hex, (x0 + x1) / 2, (y0 + y1) / 2, 0);
}

// Screens of another shape than 3:2 show more than the field: wider ones at
// the sides, taller ones above and below. Rocks and bullets wrap at the
// field's edges, so the extra space is covered by a dark frame with a thin
// line along the field; the field itself is the same on every screen.
// viewW and viewH are the camera's view in world units. One mesh, and none
// at all on a 3:2 screen.
export function createFrame(scene, viewW, viewH) {
  const sideX = viewW / 2 - HALF_W > 0.01; // margins left and right
  const sideY = viewH / 2 - HALF_H > 0.01; // margins above and below
  if (!sideX && !sideY) return null;
  // The frame reaches past the screen's edges, so camera shake shows no gap.
  const w = viewW / 2 + 4;
  const h = viewH / 2 + 4;
  const e = EDGE_W;
  const pieces = [];
  if (sideX) {
    pieces.push(rect(-w, -h, -HALF_W - e, h, FRAME), rect(HALF_W + e, -h, w, h, FRAME));
    pieces.push(rect(-HALF_W - e, -HALF_H - e, -HALF_W, HALF_H + e, EDGE));
    pieces.push(rect(HALF_W, -HALF_H - e, HALF_W + e, HALF_H + e, EDGE));
  }
  if (sideY) {
    const x = sideX ? HALF_W + e : w;
    pieces.push(rect(-x, -h, x, -HALF_H - e, FRAME), rect(-x, HALF_H + e, x, h, FRAME));
    pieces.push(rect(-HALF_W - e, -HALF_H - e, HALF_W + e, -HALF_H, EDGE));
    pieces.push(rect(-HALF_W - e, HALF_H, HALF_W + e, HALF_H + e, EDGE));
  }
  const mesh = new THREE.Mesh(mergeGeometries(pieces), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.position.z = FRAME_Z;
  scene.add(mesh);
  return mesh;
}
