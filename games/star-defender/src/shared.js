// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const SPACE = 0x0d0b2e; // background and fog color

// The playfield lies on the y = 0 plane. The formation starts far away (-z)
// and marches towards the player's ship near the camera (+z).
export const FIELD_HALF = 10.4; // ship and formation stay within x = ±FIELD_HALF
export const PLAYER_Z = 8.4;
export const GROUND_Z = 9.5; // bombs that pass this line are gone
export const SHIELD_Z = 5.3;
export const SAUCER_Z = -10.2;
export const TOP_Z = -14; // player bullets vanish past this line
export const FACE_TILT = 0.75; // aliens lean back so their faces look at the camera

const tmpColor = new THREE.Color();

// Gives a geometry one flat vertex color, so differently colored parts can be
// merged into a single mesh that uses one material and one draw call. Returns
// a non-indexed copy so every part merges with every other kind of part.
export function paint(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  tmpColor.setHex(hex);
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz']; // BoxGeometry's groups, in order

// A box without the faces named in skip (e.g. 'py ny'): faces inside another
// part or always turned away from the camera are never seen, but the
// handheld still pays for every triangle it is sent.
export function boxGeometry(w, h, d, skip = '') {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!skip) return g;
  const index = [];
  for (let f = 0; f < 6; f++) {
    if (skip.includes(FACES[f])) continue;
    for (let k = 0; k < 6; k++) index.push(g.index.getX(f * 6 + k));
  }
  g.setIndex(index);
  g.clearGroups();
  return g;
}

export function box(w, h, d, x, y, z, hex, rotZ = 0, skip = '') {
  const g = boxGeometry(w, h, d, skip);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return paint(g, hex);
}

// Moves an already built geometry into place and paints it.
export function part(geometry, x, y, z, hex) {
  geometry.translate(x, y, z);
  return paint(geometry, hex);
}

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

const tmpN = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpNormal = new THREE.Matrix3();

// Drops the triangles of a non-indexed geometry that can never face the
// camera: they are culled anyway, but the handheld still pays for every
// triangle it is sent. poses are the model's possible rotations and scales
// (Matrix4, no translation); places a list of boxes ([min, max]) where the
// model's origin can be, eye the box where the camera can be. Facing is
// linear in both positions, so testing the corners of the boxes covers
// everything inside them.
export function prune(geometry, poses, places, eye, margin = 0.05) {
  const pos = geometry.attributes.position;
  const names = Object.keys(geometry.attributes);
  const keep = [];
  const n = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    tmpA.fromBufferAttribute(pos, t + 1).sub(tmpC.fromBufferAttribute(pos, t));
    tmpB.fromBufferAttribute(pos, t + 2).sub(tmpC);
    n.crossVectors(tmpA, tmpB).normalize();
    c.copy(tmpC).add(tmpA.fromBufferAttribute(pos, t + 1)).add(tmpB.fromBufferAttribute(pos, t + 2)).divideScalar(3);
    let seen = false;
    for (let p = 0; p < poses.length && !seen; p++) {
      tmpN.copy(n).applyMatrix3(tmpNormal.getNormalMatrix(poses[p])).normalize();
      const cw = tmpC.copy(c).applyMatrix4(poses[p]);
      for (let b = 0; b < places.length && !seen; b++) {
        const at = places[b];
        for (let k = 0; k < 32 && !seen; k++) {
          const vx = eye[k & 1].x - at[(k >> 2) & 1].x - cw.x;
          const vy = eye[(k >> 1) & 1].y - at[(k >> 3) & 1].y - cw.y;
          const vz = eye[0].z - at[(k >> 4) & 1].z - cw.z;
          const len = Math.hypot(vx, vy, vz);
          if (tmpN.x * vx + tmpN.y * vy + tmpN.z * vz > -margin * len) seen = true;
        }
      }
    }
    if (seen) keep.push(t);
  }
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const src = geometry.attributes[name];
    const size = src.itemSize;
    const data = new Float32Array(keep.length * 3 * size);
    for (let k = 0; k < keep.length; k++) {
      data.set(src.array.subarray(keep[k] * size, (keep[k] + 3) * size), k * 3 * size);
    }
    out.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  geometry.dispose();
  return out;
}
