// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const SKY = 0xb4e0fb; // the first circuit's horizon haze, until a circuit sets its own

// Car handling, in world units (1 unit is about 2 m) and seconds.
export const TOP_SPEED = 40; // on asphalt
export const GRASS_SPEED = 17; // top speed on the grass
export const BOOST_SPEED = 52; // top speed while a boost pad's turbo lasts
export const BOOST_TIME = 1.4;
export const KMH = 5.6; // world units per second to the km/h shown on the HUD

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

// A box of one color. `skip` lists faces nobody ever sees (the bottom, the
// side against a wall) to leave out: 'px', 'nx', 'py', 'ny', 'pz', 'nz'.
const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
export function box(w, h, d, x, y, z, hex, skip = null) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (skip) {
    const all = g.index.array;
    const index = [];
    g.groups.forEach((group, k) => {
      if (skip.includes(FACES[k])) return;
      for (let i = group.start; i < group.start + group.count; i++) index.push(all[i]);
    });
    g.setIndex(index);
    g.clearGroups();
  }
  g.translate(x, y, z);
  return paint(g, hex);
}

// Shortest signed difference between two angles, in -PI..PI.
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// 83.4 seconds -> "1:23.4".
export function formatTime(seconds) {
  const tenths = Math.floor(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor(tenths / 10) % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}.${tenths % 10}`;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th'];
export function ordinal(place) {
  return ORDINALS[place - 1];
}

// Small seeded random generator, so the scenery is the same on every start.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
