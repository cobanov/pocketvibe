// Low-poly models. Each is built once from boxes, cylinders and cones with
// baked vertex colors and merged into a single geometry, so a whole kind of
// object is one draw call.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SLOPE_ANGLE, box, disc, limb, paint, paintGradient, paintTop } from './shared.js';

const SNOW = 0xf6f9fd;
const SNOW_SHADE = 0xc6d6ea; // soft blue shadow baked under objects
const ORANGE = 0xff7a1a;

// The skier faces -z. Feet stand at y = 0 on top of the skis.
const JACKET = 0xff5a26;
const JACKET_DARK = 0xc8391a;
const PANTS = 0x263463;
const BOOT = 0x1c2433;
const HELMET = 0xf5f7fb;
const ACCENT = 0x2f6fe0;
export const HIP_Y = 0.98;
export const FOOT_X = 0.15;

// One ski, centered on x = 0, with the tip curling up at the front.
export function skiGeometry() {
  const tip = new THREE.BoxGeometry(0.11, 0.035, 0.24);
  tip.translate(0, 0, -0.12);
  tip.rotateX(0.55);
  tip.translate(0, 0.02, -0.74);
  paint(tip, 0xd8f23a);
  return mergeGeometries([
    box(0.11, 0.035, 1.5, 0, 0.018, 0.0, 0xd8f23a, 0xe9ff5e),
    tip,
    box(0.12, 0.05, 0.36, 0, 0.05, 0.02, 0x2b2f3a), // binding
  ]);
}

// Boots, legs and hips. The mesh is squashed in y to crouch.
export function skierLegsGeometry() {
  const parts = [box(0.42, 0.16, 0.24, 0, HIP_Y, 0.06, PANTS)];
  for (let s = -1; s <= 1; s += 2) {
    const x = s * FOOT_X;
    parts.push(
      box(0.15, 0.26, 0.32, x, 0.15, 0.0, BOOT, 0x3a4458),
      limb(x, 0.24, 0.02, x, 0.62, -0.15, 0.15, 0.17, PANTS),
      limb(x, 0.62, -0.15, s * 0.13, HIP_Y, 0.06, 0.17, 0.19, PANTS),
      box(0.16, 0.08, 0.17, x, 0.62, -0.15, 0x324173), // knee pad
    );
  }
  return mergeGeometries(parts);
}

// Torso, head, arms and poles, with the origin at the hips so the upper body
// can lean forward into a tuck.
export function skierUpperGeometry() {
  const parts = [
    box(0.46, 0.5, 0.28, 0, 0.3, 0, JACKET, 0xff8656),
    box(0.47, 0.08, 0.29, 0, 0.12, 0, JACKET_DARK), // belt line
    box(0.3, 0.28, 0.02, 0, 0.33, 0.145, 0xffffff), // race bib on the back
    box(0.05, 0.17, 0.025, 0.0, 0.33, 0.155, 0x1d2533), // bib number "1"
    box(0.2, 0.1, 0.18, 0, 0.58, -0.02, JACKET_DARK), // collar
    box(0.28, 0.28, 0.3, 0, 0.76, -0.04, HELMET, 0xffffff),
    box(0.07, 0.29, 0.31, 0, 0.77, -0.04, ACCENT), // helmet stripe
    box(0.29, 0.07, 0.31, 0, 0.72, -0.04, 0x1d2533), // goggle strap
    box(0.24, 0.09, 0.04, 0, 0.73, -0.2, 0xffb238), // goggle lens
  ];
  for (let s = -1; s <= 1; s += 2) {
    parts.push(
      limb(s * 0.24, 0.5, 0, s * 0.34, 0.28, -0.12, 0.12, 0.12, JACKET),
      limb(s * 0.34, 0.28, -0.12, s * 0.31, 0.2, -0.36, 0.11, 0.11, JACKET),
      box(0.11, 0.11, 0.11, s * 0.31, 0.19, -0.4, BOOT), // glove
      limb(s * 0.31, 0.26, -0.4, s * 0.46, -0.9, 0.42, 0.04, 0.04, 0x39414f), // pole
      box(0.14, 0.02, 0.14, s * 0.45, -0.8, 0.35, 0x39414f), // basket
    );
  }
  return mergeGeometries(parts);
}

// A snowy pine: trunk, three tiers of branches with snow on top, and a blue
// shadow on the snow, tilted to lie on the slope (pines are never turned, so
// the tilt stays right). About 2.9 units tall.
export function pineGeometry() {
  const parts = [disc(1.3, 0.03, SNOW_SHADE, 9).rotateX(-SLOPE_ANGLE)];
  const trunk = new THREE.CylinderGeometry(0.13, 0.18, 0.7, 5, 1, true);
  trunk.translate(0, 0.35, 0);
  parts.push(paint(trunk, 0x6b4426));
  const tiers = [
    [1.2, 1.4, 0.45],
    [0.95, 1.2, 1.12],
    [0.68, 1.05, 1.78],
  ];
  for (let i = 0; i < tiers.length; i++) {
    const [r, h, y] = tiers[i];
    const cone = new THREE.ConeGeometry(r, h, 7, 1, true);
    cone.rotateY(i * 0.45);
    cone.translate(0, y + h / 2, 0);
    parts.push(paintGradient(cone, 0x1e4a34, 0x3d8452, y, y + h));
    const cap = new THREE.ConeGeometry(r * 0.56, h * 0.5, 7, 1, true);
    cap.rotateY(i * 0.45);
    cap.translate(0, y + h * 0.76, 0);
    parts.push(paintGradient(cap, 0xdfe9f5, 0xffffff, y + h * 0.5, y + h));
  }
  return mergeGeometries(parts);
}

// The forest's pine, seen only from afar on the banks: the same three
// snowy tiers on five sides instead of seven, no trunk (it stands in deep
// snow) and no shadow, 30 triangles instead of 61.
export function forestPineGeometry() {
  const parts = [];
  const tiers = [
    [1.2, 1.4, 0.15],
    [0.95, 1.2, 0.82],
    [0.68, 1.05, 1.48],
  ];
  for (let i = 0; i < tiers.length; i++) {
    const [r, h, y] = tiers[i];
    const cone = new THREE.ConeGeometry(r, h, 5, 1, true);
    cone.rotateY(i * 0.6);
    cone.translate(0, y + h / 2, 0);
    parts.push(paintGradient(cone, 0x1e4a34, 0x3d8452, y, y + h));
    const cap = new THREE.ConeGeometry(r * 0.56, h * 0.5, 5, 1, true);
    cap.rotateY(i * 0.6);
    cap.translate(0, y + h * 0.76, 0);
    parts.push(paintGradient(cap, 0xdfe9f5, 0xffffff, y + h * 0.5, y + h));
  }
  return mergeGeometries(parts);
}

// A grey boulder with snow on its top faces.
export function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(0.8, 0);
  g.scale(1.25, 0.72, 1.05);
  g.translate(0, 0.38, 0);
  paintTop(g, 0xf2f6fb, 0x7d8796, 0.55);
  const g2 = new THREE.IcosahedronGeometry(0.42, 0);
  g2.scale(1.1, 0.8, 1);
  g2.rotateY(0.6);
  g2.translate(0.62, 0.2, 0.28);
  paintTop(g2, 0xf2f6fb, 0x6c7685, 0.55);
  return mergeGeometries([disc(1.25, 0.02, SNOW_SHADE, 9), g, g2].map(toPlain));
}

// mergeGeometries needs every part indexed the same way and with the same
// attributes; this strips the index and uv so mixed parts merge.
function toPlain(g) {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  return out;
}

// An orange safety net between two posts, 3.6 units wide.
export const FENCE_HALF = 1.8;
export function fenceGeometry() {
  const parts = [
    box(3.9, 0.02, 0.7, 0, 0.01, 0.12, SNOW_SHADE),
    box(3.5, 0.72, 0.05, 0, 0.62, 0, ORANGE),
    box(3.5, 0.06, 0.07, 0, 0.99, 0, 0xc4520d),
    box(3.5, 0.05, 0.07, 0, 0.26, 0, 0xc4520d),
  ];
  for (let s = -1; s <= 1; s += 2) {
    parts.push(box(0.1, 1.15, 0.1, s * FENCE_HALF, 0.575, 0, 0x2b2f3a, 0xffffff));
  }
  return mergeGeometries(parts);
}

// A snow mogul: a low dome with a blue-shaded base.
export function mogulGeometry() {
  const g = new THREE.SphereGeometry(1, 9, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  return paintGradient(g, 0xdbe6f3, 0xffffff, 0, 0.8);
}

// The kicker: a snow wedge rising towards -z with an orange lip.
export const RAMP_HALF = 1.6;
export const RAMP_LEN = 3.6;
export const RAMP_H = 1.0;
export function rampGeometry() {
  const g = new THREE.BoxGeometry(RAMP_HALF * 2, RAMP_H, RAMP_LEN);
  g.translate(0, RAMP_H / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) > 0 && pos.getY(i) > RAMP_H / 2) pos.setY(i, 0.02);
  }
  g.computeVertexNormals();
  paintTop(g, SNOW, ACCENT, 0.4);
  const parts = [
    disc(2.6, 0.02, SNOW_SHADE, 10),
    g,
    box(RAMP_HALF * 2 + 0.04, 0.07, 0.3, 0, RAMP_H - 0.02, -RAMP_LEN / 2 + 0.15, ORANGE),
  ];
  for (let s = -1; s <= 1; s += 2) {
    const cone = new THREE.ConeGeometry(0.14, 0.5, 6);
    cone.translate(s * (RAMP_HALF + 0.12), RAMP_H + 0.25, -RAMP_LEN / 2 + 0.15);
    parts.push(paint(cone, ORANGE));
    // orange edges along the run-in so the kicker reads from far away
    parts.push(limb(s * RAMP_HALF, 0.04, RAMP_LEN / 2, s * RAMP_HALF, RAMP_H + 0.01, -RAMP_LEN / 2, 0.1, 0.1, ORANGE));
  }
  return mergeGeometries(parts.map(toPlain));
}

// A gate flag: a pole with the panel reaching out along +x. Everything is
// white so the instance color paints it red or blue. The panel and its
// stripe are thin, so they are two quads back to back rather than boxes.
export function flagGeometry() {
  const pole = new THREE.CylinderGeometry(0.055, 0.055, 2.0, 5, 1, true);
  pole.translate(0, 1.0, 0);
  paint(pole, 0xffffff);
  return mergeGeometries(
    [pole, ...card(0.78, 0.4, 0.43, 1.69, 0.012, 0xffffff), ...card(0.78, 0.1, 0.43, 1.44, 0.012, 0xcfd6e0)].map(toPlain),
  );
}

// A flat rectangle w x h centered on (x, y) facing both +z and -z, `gap`
// apart: a flag's panel.
function card(w, h, x, y, gap, hex) {
  const front = new THREE.PlaneGeometry(w, h);
  front.translate(x, y, gap / 2);
  const back = new THREE.PlaneGeometry(w, h);
  back.rotateY(Math.PI);
  back.translate(x, y, -gap / 2);
  return [paint(front, hex), paint(back, hex)];
}

// A bonus flag: a short white pole with a gold pennant and a gold gem on
// top, turning slowly so it catches the eye.
export function bonusFlagGeometry() {
  const pole = new THREE.CylinderGeometry(0.045, 0.045, 1.7, 5, 1, true);
  pole.translate(0, 0.85, 0);
  paint(pole, 0xffffff);
  const pennant = new THREE.BufferGeometry();
  // Front and back faces of one triangle.
  pennant.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 1.66, 0, 0, 1.18, 0, 0.8, 1.42, 0, 0, 1.66, 0, 0.8, 1.42, 0, 0, 1.18, 0], 3),
  );
  pennant.computeVertexNormals();
  paint(pennant, 0xffc021);
  const gem = new THREE.OctahedronGeometry(0.22);
  gem.scale(1, 1.3, 1);
  gem.translate(0, 1.95, 0);
  paint(gem, 0xffe066);
  return mergeGeometries([pole, pennant, gem].map(toPlain));
}

// A sheet of ice: a flat disc, pale blue fading to white in the middle,
// with two glints across it. Unit size; the instance stretches it.
export function iceGeometry() {
  const disc = new THREE.CircleGeometry(1, 16);
  disc.rotateX(-Math.PI / 2);
  paint(disc, 0xa9d3f2);
  const colors = disc.attributes.color;
  const pos = disc.attributes.position;
  const c = new THREE.Color();
  const rim = new THREE.Color(0x9cc9ee);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    c.setHex(0xe9f6ff).lerp(rim, r);
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  const glint = (w, d, x, z, angle) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.rotateY(angle);
    g.translate(x, 0.01, z);
    return paint(g, 0xffffff);
  };
  return mergeGeometries([disc, glint(1.1, 0.07, -0.15, 0.12, 0.6), glint(0.55, 0.05, 0.3, -0.3, 0.6)].map(toPlain));
}

// The time trial's finish: blue posts on both piste edges with a checkered
// banner between them, and a checkered band across the snow. Built for a
// piste `half` wide on each side; the band lies on the slope.
export function finishGeometry(half) {
  const parts = [];
  const top = 5.8;
  const sq = 0.75;
  for (let s = -1; s <= 1; s += 2) {
    parts.push(box(0.5, top, 0.5, s * (half + 0.6), top / 2, 0, 0x2f6fe0, 0xffffff));
  }
  const width = 2 * (half + 0.6);
  parts.push(box(width, sq * 2 + 0.2, 0.12, 0, top - sq - 0.2, 0, 0x1d2533));
  const cols = Math.floor(width / sq);
  const x0 = -(cols * sq) / 2;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < 2; r++) {
      if ((c + r) % 2) continue;
      const q = new THREE.PlaneGeometry(sq, sq);
      q.translate(x0 + (c + 0.5) * sq, top - 0.3 - (r + 0.5) * sq, 0.07);
      parts.push(paint(q, 0xffffff));
    }
  }
  // The band on the snow: dark squares on white.
  const bandCols = Math.floor((2 * half) / sq);
  const bx0 = -(bandCols * sq) / 2;
  for (let c = 0; c < bandCols; c++) {
    for (let r = 0; r < 2; r++) {
      if ((c + r) % 2 === 0) continue;
      const q = new THREE.PlaneGeometry(sq, sq);
      q.rotateX(-Math.PI / 2);
      q.translate(bx0 + (c + 0.5) * sq, 0, (r - 1 + 0.5) * sq);
      q.rotateX(-SLOPE_ANGLE);
      q.translate(0, 0.05, 0);
      parts.push(paint(q, 0x1d2533));
    }
  }
  return mergeGeometries(parts.map(toPlain));
}

// A blue piste marker pole with an orange tip.
export function markerGeometry() {
  const low = new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5, 1, true);
  low.translate(0, 0.55, 0);
  const tip = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5, 1, true);
  tip.translate(0, 1.3, 0);
  return mergeGeometries([paint(low, 0x2a55c4), paint(tip, ORANGE)]);
}

// A flat unit quad on the ground (ski tracks).
export function quadGeometry() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

// Far mountains and a sky gradient behind them, drawn without fog as a
// backdrop that travels with the camera. Facing +z, base at y = 0.
export function backdropGeometry() {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  function vert(x, y, hex) {
    pos.push(x, y, 0);
    c.setHex(hex);
    col.push(c.r, c.g, c.b);
  }
  function tri(ax, ay, ah, bx, by, bh, cx, cy, ch) {
    vert(ax, ay, ah);
    vert(bx, by, bh);
    vert(cx, cy, ch);
  }
  // Sky: deeper blue overhead fading to haze at the horizon.
  const W = 520;
  tri(-W, -30, 0xd3e6f4, W, -30, 0xd3e6f4, W, 34, 0xc0dcf1);
  tri(-W, -30, 0xd3e6f4, W, 34, 0xc0dcf1, -W, 34, 0xc0dcf1);
  tri(-W, 34, 0xc0dcf1, W, 34, 0xc0dcf1, W, 200, 0x7fb4e6);
  tri(-W, 34, 0xc0dcf1, W, 200, 0x7fb4e6, -W, 200, 0x7fb4e6);
  // Two ranges of peaks, the far one paler. Each peak has a lit and a shaded face.
  const ranges = [
    { n: 15, h0: 26, h1: 50, base: 0xc9dced, lit: 0xf6f9fd, dark: 0xb4cbe2, y: 0 },
    { n: 11, h0: 16, h1: 28, base: 0xbfd4e8, lit: 0xeef4fb, dark: 0x9fbad6, y: -6 },
  ];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (const r of ranges) {
    const step = (W * 2) / r.n;
    for (let i = 0; i < r.n; i++) {
      const x = -W + step * (i + 0.2 + rnd() * 0.6);
      const h = r.h0 + rnd() * (r.h1 - r.h0);
      const w = h * (1.1 + rnd() * 0.6);
      const ax = x + (rnd() - 0.5) * w * 0.3;
      tri(x - w, r.y, r.base, ax, r.y, r.base, ax, r.y + h, r.lit);
      tri(ax, r.y, r.base, x + w, r.y, r.base, ax, r.y + h, r.dark);
    }
  }
  // Haze over the foot of the mountains, melting into the fog.
  tri(-W, -30, 0xd3e6f4, W, -30, 0xd3e6f4, W, 8, 0xd3e6f4);
  tri(-W, -30, 0xd3e6f4, W, 8, 0xd3e6f4, -W, 8, 0xd3e6f4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
