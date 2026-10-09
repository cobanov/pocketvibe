// Constants and small helpers shared by the game modules.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Sky colors from the top of the screen down to the hazy horizon.
export const SKY_TOP = 0x3d97e6;
export const SKY_MID = 0x7cc6f6;
export const HORIZON = 0xd4efff;

// The game is played in the plane z = 0, seen from the side. The bird stays at
// BIRD_X and the world scrolls towards -x.
export const BIRD_X = -4;
export const CEILING_Y = 14.2; // the bird cannot fly above this (top of the screen)
export const SPAWN_X = 13.4; // new pipes appear here, just off the right edge
export const DESPAWN_X = -15; // and are recycled once they and their shadows are past the left edge

const tmpColor = new THREE.Color();

// Gives a geometry one flat vertex color, so differently colored parts can be
// merged into a single mesh that uses one material and one draw call.
export function paint(geometry, hex) {
  tmpColor.setHex(hex);
  const n = geometry.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Moves a geometry into place and paints it.
export function part(geometry, x, y, z, hex) {
  geometry.translate(x, y, z);
  return paint(geometry, hex);
}

export function box(w, h, d, x, y, z, hex) {
  return part(new THREE.BoxGeometry(w, h, d), x, y, z, hex);
}

// Merges painted parts into one geometry. Boxes and cylinders are indexed and
// icosahedrons are not, so everything is converted to non-indexed first.
// hideInside drops the triangles that lie inside another part (where a
// cloud's balls overlap): they can never be seen. Every part must then be a
// closed convex shape (a ball, a cone, a box).
export function merge(parts, hideInside = false) {
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].index) {
      const flat = parts[i].toNonIndexed();
      parts[i].dispose();
      parts[i] = flat;
    }
  }
  if (hideInside) dropInside(parts);
  const merged = mergeGeometries(parts);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  return merged;
}

// A new non-indexed geometry with only the triangles whose numbers are in keep.
function keepTriangles(geometry, keep) {
  const out = new THREE.BufferGeometry();
  for (const name in geometry.attributes) {
    const attr = geometry.attributes[name];
    const size = attr.itemSize;
    const src = attr.array;
    const dst = new Float32Array(keep.length * 3 * size);
    for (let k = 0; k < keep.length; k++) {
      const from = keep[k] * 3 * size;
      for (let j = 0; j < 3 * size; j++) dst[k * 3 * size + j] = src[from + j];
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, size));
  }
  return out;
}

const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vn = new THREE.Vector3();
const ve = new THREE.Vector3();

// The outward normal of triangle t of a non-indexed position array into vn,
// its first corner into va.
function faceOf(pos, t) {
  va.fromArray(pos, t * 9);
  vb.fromArray(pos, t * 9 + 3);
  vc.fromArray(pos, t * 9 + 6);
  vn.subVectors(vb, va).cross(ve.subVectors(vc, va)).normalize();
}

// Replaces each part with a copy that leaves out its triangles lying wholly
// inside another part (see merge).
function dropInside(parts) {
  // Each convex part as a list of planes: normal x, y, z and offset.
  const planes = parts.map((g) => {
    const pos = g.attributes.position.array;
    const n = pos.length / 9;
    const list = new Float32Array(n * 4);
    for (let t = 0; t < n; t++) {
      faceOf(pos, t);
      list.set([vn.x, vn.y, vn.z, vn.dot(va)], t * 4);
    }
    return list;
  });
  const inside = (list, pos, i) => {
    for (let p = 0; p < list.length; p += 4) {
      if (list[p] * pos[i] + list[p + 1] * pos[i + 1] + list[p + 2] * pos[i + 2] - list[p + 3] > -1e-4) return false;
    }
    return true;
  };
  for (let i = 0; i < parts.length; i++) {
    const pos = parts[i].attributes.position.array;
    const keep = [];
    for (let t = 0; t < pos.length / 9; t++) {
      let hidden = false;
      for (let j = 0; j < parts.length && !hidden; j++) {
        if (j === i) continue;
        hidden =
          inside(planes[j], pos, t * 9) && inside(planes[j], pos, t * 9 + 3) && inside(planes[j], pos, t * 9 + 6);
      }
      if (!hidden) keep.push(t);
    }
    const trimmed = keepTriangles(parts[i], keep);
    parts[i].dispose();
    parts[i] = trimmed;
  }
}

// A copy of a non-indexed geometry with only the triangles that face at least
// one of the eyes (camera positions in the geometry's own space). The others
// are never drawn, but would still cost vertex work and count towards the
// triangle budget.
export function keepFacing(geometry, eyes) {
  const pos = geometry.attributes.position.array;
  const keep = [];
  for (let t = 0; t < pos.length / 9; t++) {
    faceOf(pos, t);
    for (let e = 0; e < eyes.length; e++) {
      // A little slack, as the eyes are only samples of where the camera can be.
      if (ve.subVectors(eyes[e], va).normalize().dot(vn) > -0.04) {
        keep.push(t);
        break;
      }
    }
  }
  return keepTriangles(geometry, keep);
}

// Flat-shaded vertex-color material: the faceted low-poly look.
export function lowPoly() {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}
