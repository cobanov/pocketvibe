// Low-poly models built in code from boxes, cylinders and blobs with baked
// vertex colours, each merged into a single geometry so a whole kind of
// object is one draw call. Parts painted white or light grey take the
// instance colour (tank paint, brick tint); dark parts stay dark.

import * as THREE from 'three';
import { FLOOR_H, blob, box, cylinder, merge, paint, paintTop, tint } from './shared.js';

const TREAD = 0x232428;
const WHEEL = 0x7d828a;
const GUN = 0x3f4247;
const DECK = 0xffffff;
const SIDE = 0xb2b2b2;
const LIGHT = 0xe2e2e2;
const LAMP = 0xfff0a8;
const RED = 0xe8483c;

export const WALL_H = 0.5; // height of brick and steel walls

// A gun barrel lying along z, starting at z0 and pointing to -z.
function barrel(r, len, x, y, z0, hex, segments = 8) {
  const g = new THREE.CylinderGeometry(r, r, len, segments);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z0 - len / 2);
  return paint(g, hex);
}

// Tracks per tank kind (player, basic, fast, power, armoured). tanks.js runs
// the cleats along their tops.
export const TREADS = [
  { x: 0.35, w: 0.24, h: 0.22, len: 0.94 },
  { x: 0.35, w: 0.24, h: 0.2, len: 0.92 },
  { x: 0.33, w: 0.2, h: 0.17, len: 0.9 },
  { x: 0.35, w: 0.24, h: 0.22, len: 0.94 },
  { x: 0.36, w: 0.26, h: 0.24, len: 0.96 },
];

function treadParts(t) {
  const parts = [box(t.w, t.h, t.len, -t.x, t.h / 2, 0, TREAD), box(t.w, t.h, t.len, t.x, t.h / 2, 0, TREAD)];
  // Road wheels on the outer faces.
  for (let i = 0; i < 4; i++) {
    const z = -t.len / 2 + 0.15 + i * ((t.len - 0.3) / 3);
    parts.push(box(0.03, 0.1, 0.13, -t.x - t.w / 2 - 0.01, t.h * 0.45, z, WHEEL));
    parts.push(box(0.03, 0.1, 0.13, t.x + t.w / 2 + 0.01, t.h * 0.45, z, WHEEL));
  }
  return parts;
}

// Every tank faces -z and is about one tile big.
function playerTank() {
  return [
    ...treadParts(TREADS[0]),
    box(0.48, 0.18, 0.84, 0, 0.2, 0.02, SIDE, DECK), // hull
    box(0.46, 0.04, 0.12, 0, 0.3, -0.33, LIGHT), // glacis plate
    cylinder(0.2, 0.23, 0.14, 8, 0, 0.29, 0.06, SIDE, DECK), // turret
    cylinder(0.07, 0.07, 0.04, 6, 0.08, 0.43, 0.12, GUN), // hatch
    box(0.05, 0.012, 0.22, -0.07, 0.432, 0.05, RED), // turret stripe
    barrel(0.05, 0.42, 0, 0.36, -0.1, GUN),
    barrel(0.068, 0.08, 0, 0.36, -0.44, GUN), // muzzle
    box(0.08, 0.06, 0.04, -0.16, 0.24, -0.41, LAMP), // headlights
    box(0.08, 0.06, 0.04, 0.16, 0.24, -0.41, LAMP),
    box(0.08, 0.05, 0.06, -0.12, 0.29, 0.42, GUN), // exhausts
    box(0.08, 0.05, 0.06, 0.12, 0.29, 0.42, GUN),
  ];
}

function basicTank() {
  return [
    ...treadParts(TREADS[1]),
    box(0.46, 0.17, 0.82, 0, 0.19, 0.02, SIDE, DECK),
    box(0.34, 0.13, 0.36, 0, 0.34, 0.06, SIDE, DECK), // turret
    box(0.2, 0.03, 0.02, 0, 0.36, -0.125, RED), // vision slit
    barrel(0.045, 0.36, 0, 0.34, -0.1, GUN),
    box(0.3, 0.02, 0.12, 0, 0.285, 0.33, GUN), // engine grille
  ];
}

function fastTank() {
  const nose = new THREE.BoxGeometry(0.4, 0.08, 0.18);
  nose.rotateX(0.45);
  nose.translate(0, 0.19, -0.36);
  paintTop(nose, DECK, SIDE);
  return [
    ...treadParts(TREADS[2]),
    box(0.42, 0.13, 0.74, 0, 0.15, 0.06, SIDE, DECK),
    nose,
    cylinder(0.15, 0.17, 0.1, 6, 0, 0.215, 0.08, SIDE, DECK), // turret
    barrel(0.035, 0.42, 0, 0.27, -0.04, GUN),
    box(0.05, 0.006, 0.56, -0.13, 0.218, 0.05, RED), // racing stripes
    box(0.05, 0.006, 0.56, 0.13, 0.218, 0.05, RED),
    box(0.46, 0.03, 0.1, 0, 0.31, 0.4, LIGHT), // spoiler
    box(0.03, 0.08, 0.04, -0.15, 0.25, 0.4, GUN),
    box(0.03, 0.08, 0.04, 0.15, 0.25, 0.4, GUN),
  ];
}

function powerTank() {
  return [
    ...treadParts(TREADS[3]),
    box(0.48, 0.19, 0.84, 0, 0.2, 0.03, SIDE, DECK),
    box(0.4, 0.15, 0.42, 0, 0.37, 0.08, SIDE, DECK), // turret
    box(0.18, 0.11, 0.08, 0, 0.37, -0.16, LIGHT), // mantlet
    cylinder(0.06, 0.06, 0.04, 6, -0.1, 0.445, 0.14, GUN),
    barrel(0.06, 0.44, 0, 0.37, -0.18, GUN),
    box(0.15, 0.08, 0.08, 0, 0.37, -0.6, GUN), // muzzle brake
    box(0.36, 0.02, 0.04, 0, 0.3, -0.42, RED),
  ];
}

function armourTank() {
  return [
    ...treadParts(TREADS[4]),
    box(0.05, 0.13, 0.9, -0.51, 0.2, 0, SIDE, DECK), // side skirts
    box(0.05, 0.13, 0.9, 0.51, 0.2, 0, SIDE, DECK),
    box(0.5, 0.21, 0.88, 0, 0.215, 0.02, SIDE, DECK),
    box(0.52, 0.1, 0.06, 0, 0.24, -0.44, LIGHT), // front armour
    cylinder(0.23, 0.26, 0.15, 8, 0, 0.32, 0.08, SIDE, DECK), // turret
    box(0.26, 0.08, 0.06, 0, 0.4, -0.15, LIGHT),
    barrel(0.042, 0.4, -0.07, 0.4, -0.14, GUN),
    barrel(0.042, 0.4, 0.07, 0.4, -0.14, GUN),
    cylinder(0.07, 0.07, 0.04, 6, 0.1, 0.47, 0.16, GUN),
  ];
}

const TANK_PARTS = [playerTank, basicTank, fastTank, powerTank, armourTank];

export function tankGeometry(kind) {
  return merge(TANK_PARTS[kind]());
}

// One track cleat, run along the top of a tread: a flat bar, seen from above.
export function cleatGeometry() {
  const g = new THREE.PlaneGeometry(1, 0.07);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.0175, 0);
  return paint(g, 0x55585e);
}

// A shell pointing along -z.
export function shellGeometry() {
  const g = new THREE.OctahedronGeometry(0.1, 0);
  g.scale(0.85, 0.85, 2.2);
  return g;
}

// Faces of a BoxGeometry, in its index order: +x, -x, top, bottom, front
// (+z), back (-z), six indices each.
const FACE_PX = 0;
const FACE_NX = 1;
const FACE_TOP = 2;
const FACE_FRONT = 4;

// A box with only the faces the camera can see. Field blocks are never
// turned, and the camera always looks at them from the front and above, so
// their bottom and back never show.
function openBox(w, h, d, x, y, z, hex, topHex, faces = [FACE_PX, FACE_NX, FACE_TOP, FACE_FRONT]) {
  const g = box(w, h, d, x, y, z, hex, topHex);
  const index = [];
  for (const f of faces) for (let k = 0; k < 6; k++) index.push(g.index.getX(f * 6 + k));
  g.setIndex(index);
  return g;
}

// The brickwork of one cell: two courses of two bricks each, the top course
// turned across the lower one, drawn as one block with the mortar joints in
// a texture (brickTexture). Variant 1 is the same block turned a quarter, so
// neighbouring cells alternate like laid brickwork. The gaps between cells
// are real.
const BRICK_W = 0.474;
const BRICK_H = 0.49;

export function brickGeometry(variant) {
  const g = openBox(BRICK_W, BRICK_H, BRICK_W, 0, BRICK_H / 2, 0, SIDE, DECK);
  // Each face shows one 32 x 32 quarter of the texture; a small inset keeps
  // the neighbouring quarter from bleeding in.
  const front = variant ? [0.5, 0.5] : [0, 0.5]; // lower course split, upper whole, or the other way
  const sides = variant ? [0, 0.5] : [0.5, 0.5];
  const top = variant ? [0.5, 0] : [0, 0]; // the joint along x, or along z
  const regions = [sides, sides, top, null, front, null];
  const uv = g.attributes.uv;
  const inset = 0.6 / 64;
  for (let f = 0; f < 6; f++) {
    const r = regions[f];
    if (!r) continue;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, r[0] + inset + uv.getX(i) * (0.5 - 2 * inset), r[1] + inset + uv.getY(i) * (0.5 - 2 * inset));
    }
  }
  return g;
}

// The mortar for brickGeometry, as a 64 x 64 grey map that darkens the
// joints (the brick colour comes from the instance). Quarters: lower course
// split / upper whole (u 0..0.5, v 0.5..1), lower whole / upper split
// (u 0.5..1, v 0.5..1), top joint along x (u 0..0.5, v 0..0.5), top joint
// along z (u 0.5..1, v 0..0.5).
export function brickTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const MORTAR = 40;
  const EDGE = 176;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const qx = col >> 5;
      const qy = row >> 5;
      const x = col & 31;
      const y = row & 31;
      let v = 255;
      if (qy === 1) {
        // A side face: two courses, the lower a little darker.
        const lower = y < 16;
        const split = lower === (qx === 0);
        if (lower) v = 238;
        if (y === 15 || y === 16) v = y === 16 ? MORTAR : 130;
        else if (split && (x === 15 || x === 16)) v = x === 16 ? MORTAR : 130;
        // A slight variation between the two bricks of a split course.
        else if (split && x > 16) v -= 14;
      } else {
        // The top: two bricks side by side.
        const across = qx === 0 ? y : x;
        if (across === 15 || across === 16) v = across === 16 ? MORTAR : 130;
        else if (across > 16) v -= 12;
      }
      // Rounded-off brick edges at the block's rim.
      if (x === 0 || y === 0 || x === 31 || y === 31) v = Math.min(v, EDGE);
      const o = (row * size + col) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

// A steel block with a raised plate and a bolt.
export function steelGeometry() {
  return merge([
    openBox(0.48, 0.44, 0.48, 0, 0.22, 0, 0x9c9c9c, 0xcfcfcf),
    openBox(0.34, 0.05, 0.34, 0, 0.465, 0, 0xc8c8c8, DECK),
    openBox(0.1, 0.03, 0.1, 0, 0.5, 0, 0x8a8a8a, undefined, [FACE_TOP, FACE_FRONT]),
  ]);
}

// A floor tile: a slab with its top at y = 0. Only its top and its front
// show (the front where water lies in front of it).
export function floorGeometry() {
  return openBox(1, FLOOR_H, 1, 0, -FLOOR_H / 2, 0, 0x6a6a6a, DECK, [FACE_TOP, FACE_FRONT]);
}

// A tile of trees: a clump over every cell, of different heights, high
// enough to hide a tank driving under them.
export function treesGeometry() {
  const greens = [0x2f8c3c, 0x3ea34a, 0x4fb653, 0x5cc35a];
  const lift = [0.04, 0.12, 0.0, 0.08];
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const x = k % 2 ? 0.25 : -0.25;
    const z = k < 2 ? -0.25 : 0.25;
    const g = blob(0.35, 1, 0.78, 1, 0, 0, 0, greens[k]);
    g.rotateY(k * 1.3); // the clumps' facets point different ways
    g.translate(x, 0.68 + lift[k], z);
    parts.push(g);
  }
  return merge(parts);
}

// Glints scratched into an ice tile: two flat strokes.
export function glintGeometry() {
  const a = new THREE.PlaneGeometry(0.5, 0.045);
  a.rotateX(-Math.PI / 2);
  a.rotateY(0.7);
  a.translate(-0.12, 0.011, 0.12);
  const b = new THREE.PlaneGeometry(0.26, 0.04);
  b.rotateX(-Math.PI / 2);
  b.rotateY(0.7);
  b.translate(0.22, 0.011, -0.2);
  return merge([paint(a, 0xffffff), paint(b, 0xffffff)]);
}

// A ripple crest on the water.
export function rippleGeometry() {
  return box(0.3, 0.01, 0.045, 0, 0, 0, 0xbff4ff);
}

// The core the player defends: a stepped hexagonal plinth with four pylons.
// The crystal floating above it is a separate mesh so it can spin.
export function coreGeometry() {
  const parts = [
    cylinder(0.47, 0.5, 0.14, 6, 0, 0, 0, 0x6c7480, 0x9aa3ae),
    cylinder(0.33, 0.38, 0.12, 6, 0, 0.14, 0, 0x7b8490, 0xb4bcc6),
    cylinder(0.16, 0.2, 0.06, 6, 0, 0.26, 0, 0x2f6f7a, 0x58d8e8),
  ];
  for (let k = 0; k < 4; k++) {
    const x = k % 2 ? 0.36 : -0.36;
    const z = k < 2 ? -0.36 : 0.36;
    parts.push(box(0.1, 0.32, 0.1, x, 0.16, z, 0x5a626c, 0x7d8692));
    parts.push(box(0.07, 0.07, 0.07, x, 0.36, z, 0x7ff4ff));
  }
  return merge(parts);
}

export function crystalGeometry() {
  const g = new THREE.OctahedronGeometry(0.2, 0);
  g.scale(1, 1.55, 1);
  return paint(g, 0xffffff);
}

// What is left of the core once it has been hit.
export function rubbleGeometry() {
  return merge([
    cylinder(0.47, 0.5, 0.1, 6, 0, 0, 0, 0x3a3d42, 0x4c5056),
    blob(0.2, 1.2, 0.6, 1, -0.15, 0.12, 0.1, 0x55595f),
    blob(0.16, 1, 0.7, 1.2, 0.2, 0.1, -0.12, 0x4a4e54),
    blob(0.12, 1, 0.8, 1, 0.05, 0.16, 0.22, 0x2a2c30),
    box(0.1, 0.18, 0.1, -0.36, 0.09, -0.36, 0x3d4248),
    box(0.1, 0.1, 0.1, 0.36, 0.05, 0.36, 0x3d4248),
  ]);
}

// The twinkle that marks a tank about to appear: a flat four-pointed star.
export function sparkleGeometry() {
  const a = new THREE.OctahedronGeometry(0.5, 0);
  a.scale(1, 0.12, 0.22);
  const b = new THREE.OctahedronGeometry(0.5, 0);
  b.scale(0.22, 0.12, 1);
  return merge([paint(a, 0xffffff), paint(b, 0xffffff)]);
}

// Power-up token: a round plate that carries one of the icons below.
export function tokenGeometry() {
  return merge([
    cylinder(0.4, 0.42, 0.07, 12, 0, -0.07, 0, 0xb8862a, 0xffd25a),
    cylinder(0.33, 0.33, 0.02, 12, 0, 0, 0, 0x203450),
  ]);
}

function starIcon() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.11 : 0.27;
    const x = Math.sin(a) * r;
    const y = Math.cos(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return [paintTop(g, 0xffe45a, 0xd99a1c)];
}

function helmetIcon() {
  const dome = new THREE.SphereGeometry(0.21, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  return [
    paint(dome, 0x6fa84c),
    cylinder(0.27, 0.27, 0.03, 12, 0, 0, 0, 0x4f7d36),
    box(0.06, 0.012, 0.3, 0, 0.2, 0, 0xffe45a),
  ];
}

function clockIcon() {
  return [
    cylinder(0.25, 0.25, 0.05, 14, 0, 0, 0, 0xd03a32, 0xd03a32),
    cylinder(0.2, 0.2, 0.06, 14, 0, 0.01, 0, 0xffffff),
    box(0.035, 0.02, 0.15, 0, 0.075, -0.06, 0x1d2430), // minute hand
    box(0.11, 0.02, 0.035, 0.045, 0.075, 0, 0x1d2430), // hour hand
    box(0.07, 0.07, 0.07, 0, 0.04, -0.28, 0xd03a32), // knob
  ];
}

function bombIcon() {
  return [
    blob(0.2, 1, 1, 1, 0, 0.18, 0.02, 0x59627a),
    blob(0.06, 1, 1, 1, -0.07, 0.3, -0.05, 0xffffff), // shine
    cylinder(0.06, 0.06, 0.06, 6, 0.08, 0.32, -0.1, 0x55595f),
    box(0.03, 0.03, 0.12, 0.1, 0.4, -0.16, 0xc79a5a), // fuse
    blob(0.06, 1, 1, 1, 0.1, 0.42, -0.23, 0xffd84a), // spark
  ];
}

function shovelIcon() {
  const parts = [
    box(0.22, 0.03, 0.2, 0, 0.04, 0.16, 0x9aa6b4, 0xd6dee8), // blade
    box(0.05, 0.05, 0.3, 0, 0.05, -0.08, 0xb07a40, 0xd29a58), // shaft
    box(0.16, 0.05, 0.05, 0, 0.05, -0.24, 0x3a3d42), // grip
  ];
  for (let i = 0; i < parts.length; i++) parts[i].rotateY(Math.PI / 4);
  return parts;
}

// A little player tank: tracks, hull, turret and gun.
function tankIcon() {
  const t = TREADS[0];
  const parts = [
    box(t.w, t.h, t.len, -t.x, t.h / 2, 0, TREAD),
    box(t.w, t.h, t.len, t.x, t.h / 2, 0, TREAD),
    box(0.48, 0.18, 0.84, 0, 0.2, 0.02, SIDE, DECK),
    cylinder(0.2, 0.23, 0.14, 8, 0, 0.29, 0.06, SIDE, DECK),
    barrel(0.05, 0.42, 0, 0.36, -0.1, GUN),
  ];
  for (let i = 0; i < parts.length; i++) {
    parts[i].scale(0.52, 0.52, 0.52);
    tint(parts[i], 0xf2c53d);
  }
  return parts;
}

const ICONS = [starIcon, helmetIcon, clockIcon, bombIcon, shovelIcon, tankIcon];

export function iconGeometry(kind) {
  return merge(ICONS[kind]());
}
