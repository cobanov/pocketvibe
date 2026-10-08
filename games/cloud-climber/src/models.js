// Low-poly models. Each is built once from painted boxes and balls merged into
// a single geometry (vertex colors), so a whole kind of object is one draw call.

import * as THREE from 'three';
import { box, merge, paint, part, puff } from './shared.js';

const INK = 0x2a2238;

// The climber faces the camera (+z). Its origin is the middle of the body,
// BODY_MID above the feet, so spins turn around the belly.
const CLIMBER_SCALE = 1.2;
export const BODY_MID = 0.42 * CLIMBER_SCALE;

export function climberGeometry() {
  const coral = 0xff8a5b;
  const cream = 0xffe6c7;
  const y = -0.42;
  const parts = [
    puff(0.36, 1, 0.95, 0.86, 0, y + 0.47, 0, coral), // round body
    puff(0.22, 1, 0.9, 0.45, 0, y + 0.38, 0.22, cream), // belly
    puff(0.11, 1, 1.1, 0.5, -0.13, y + 0.57, 0.25, 0xffffff), // eyes
    puff(0.11, 1, 1.1, 0.5, 0.13, y + 0.57, 0.25, 0xffffff),
    puff(0.055, 1, 1.2, 0.6, -0.12, y + 0.56, 0.3, INK, 0),
    puff(0.055, 1, 1.2, 0.6, 0.12, y + 0.56, 0.3, INK, 0),
    puff(0.05, 1.3, 0.8, 0.5, -0.25, y + 0.45, 0.22, 0xff5f7e, 0), // cheeks
    puff(0.05, 1.3, 0.8, 0.5, 0.25, y + 0.45, 0.22, 0xff5f7e, 0),
    puff(0.085, 1, 1, 1, -0.36, y + 0.37, 0.02, coral, 0), // arms
    puff(0.085, 1, 1, 1, 0.36, y + 0.37, 0.02, coral, 0),
    box(0.17, 0.1, 0.24, -0.13, y + 0.05, 0.04, 0x8a4b2a), // boots
    box(0.17, 0.1, 0.24, 0.13, y + 0.05, 0.04, 0x8a4b2a),
  ];
  // Aviator goggles pushed up on the forehead, joined by a strap.
  for (let s = -1; s <= 1; s += 2) {
    const rim = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 8);
    rim.rotateX(Math.PI / 2);
    parts.push(part(rim, s * 0.12, y + 0.74, 0.2, 0x6b4226));
    const lens = new THREE.CylinderGeometry(0.06, 0.06, 0.07, 8);
    lens.rotateX(Math.PI / 2);
    parts.push(part(lens, s * 0.12, y + 0.74, 0.215, 0x8fe3ff));
  }
  parts.push(box(0.68, 0.06, 0.46, 0, y + 0.74, -0.02, 0x6b4226));
  // A teal scarf with a tail that flies out behind.
  const scarf = new THREE.CylinderGeometry(0.33, 0.33, 0.09, 10);
  parts.push(part(scarf, 0, y + 0.3, 0, 0x2fc3b5));
  const tail = box(0.1, 0.24, 0.05, 0, 0, 0, 0x2fc3b5);
  tail.rotateZ(0.6);
  tail.translate(0.24, y + 0.2, -0.24);
  parts.push(tail);
  return merge(parts).scale(CLIMBER_SCALE, CLIMBER_SCALE, CLIMBER_SCALE);
}

// The propeller cap: a striped dome with a button and a stem. The blades are
// a separate mesh so they can spin.
export function capGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.SphereGeometry(0.24, 2, 3, (i * Math.PI) / 3, Math.PI / 3, 0, Math.PI / 2);
    parts.push(paint(g, i % 2 ? 0xff5a5f : 0xffd23f));
  }
  parts.push(box(0.5, 0.04, 0.5, 0, 0.01, 0, 0x3d7fe0)); // brim
  parts.push(box(0.04, 0.14, 0.04, 0, 0.3, 0, 0x6b4226)); // stem
  return merge(parts);
}

export function bladeGeometry() {
  return merge([
    box(0.86, 0.03, 0.12, 0, 0, 0, 0x4dd0ff),
    box(0.1, 0.06, 0.1, 0, 0.01, 0, 0xff5a5f),
  ]);
}

// Clouds have their walkable top at y = 0 and hang below it. A puff list is
// [radius, sx, sy, sz, x, y, z, color].
function cloud(puffs) {
  const parts = [];
  for (let i = 0; i < puffs.length; i++) {
    const p = puffs[i];
    parts.push(puff(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7]));
  }
  return merge(parts);
}

// Plain cloud: white on top, lilac underneath.
export function normalCloudGeometry() {
  const top = 0xffffff;
  const side = 0xfbf8ff;
  const under = 0xdcc4f4;
  return cloud([
    [0.42, 1.25, 0.72, 0.95, 0, -0.22, 0, side],
    [0.32, 1.1, 0.8, 0.95, -0.56, -0.26, 0.02, side],
    [0.34, 1.1, 0.8, 0.95, 0.56, -0.25, 0.02, side],
    [0.3, 1.15, 0.62, 1, -0.24, -0.1, -0.02, top],
    [0.3, 1.15, 0.62, 1, 0.25, -0.11, -0.02, top],
    [0.36, 1.6, 0.48, 0.85, 0, -0.42, 0.06, under],
  ]);
}

// Moving cloud: sky blue, with little wings that say it flies.
export function movingCloudGeometry() {
  const top = 0xeaf8ff;
  const side = 0xc4ebff;
  const under = 0x8fd0f5;
  const g = [
    puff(0.42, 1.25, 0.72, 0.95, 0, -0.22, 0, side),
    puff(0.32, 1.1, 0.8, 0.95, -0.54, -0.26, 0.02, side),
    puff(0.32, 1.1, 0.8, 0.95, 0.54, -0.26, 0.02, side),
    puff(0.3, 1.15, 0.62, 1, -0.22, -0.1, -0.02, top),
    puff(0.3, 1.15, 0.62, 1, 0.24, -0.11, -0.02, top),
    puff(0.34, 1.6, 0.48, 0.85, 0, -0.42, 0.06, under),
  ];
  for (let s = -1; s <= 1; s += 2) {
    for (let k = 0; k < 3; k++) {
      const f = box(0.34 - k * 0.07, 0.05, 0.12, 0, 0, 0, 0xffffff);
      f.translate(s * (0.17 - k * 0.035), 0, 0);
      f.rotateZ(s * (0.5 - k * 0.32));
      f.translate(s * 0.86, -0.18 - k * 0.04, -0.05);
      g.push(f);
    }
  }
  return merge(g);
}

// Storm cloud that breaks: built from two halves with a crack between them.
// The left half is its own geometry; the right half is the same one turned
// half way round, so the broken pieces need only one mesh.
export function crumbleHalfGeometry() {
  const top = 0xb4b2c6;
  const side = 0x9493ab;
  const under = 0x6c6a86;
  return cloud([
    [0.36, 1, 0.72, 0.95, -0.24, -0.22, 0, side],
    [0.3, 1.1, 0.8, 0.95, -0.6, -0.27, 0.02, side],
    [0.27, 1.1, 0.62, 1, -0.3, -0.1, -0.02, top],
    [0.3, 1.2, 0.5, 0.85, -0.34, -0.44, 0.04, under],
  ]);
}

export function crumbleCloudGeometry() {
  const left = crumbleHalfGeometry();
  const right = crumbleHalfGeometry();
  right.rotateY(Math.PI);
  const crack = box(0.05, 0.36, 0.5, 0, -0.24, 0.32, 0x4a4862);
  return merge([left, right, crack]);
}

// One-shot cloud: a loose row of small lemon puffs that looks fragile.
export function oneShotCloudGeometry() {
  const top = 0xfffbe2;
  const side = 0xfff0b0;
  const under = 0xffd77a;
  return cloud([
    [0.26, 1, 0.75, 1, -0.6, -0.2, 0, side],
    [0.3, 1, 0.75, 1, -0.2, -0.17, 0.02, top],
    [0.3, 1, 0.75, 1, 0.22, -0.17, 0.02, top],
    [0.26, 1, 0.75, 1, 0.62, -0.2, 0, side],
    [0.2, 1.4, 0.6, 1, -0.4, -0.38, 0.04, under],
    [0.2, 1.4, 0.6, 1, 0.42, -0.38, 0.04, under],
  ]);
}

// Spring: a grey foot, three coils and a red pad. Its pad is SPRING_H above
// the cloud top.
export const SPRING_H = 0.44;

export function springGeometry() {
  const parts = [box(0.42, 0.06, 0.32, 0, 0.03, 0, 0x7d8594)];
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.TorusGeometry(0.15, 0.035, 4, 10);
    coil.rotateX(Math.PI / 2);
    parts.push(part(coil, 0, 0.11 + i * 0.1, 0, 0xc9d1dc));
  }
  const pad = new THREE.CylinderGeometry(0.22, 0.24, 0.1, 10);
  parts.push(part(pad, 0, SPRING_H - 0.05, 0, 0xff4f5e));
  const shine = new THREE.CylinderGeometry(0.12, 0.12, 0.02, 8);
  parts.push(part(shine, -0.04, SPRING_H + 0.005, 0.03, 0xff9aa3));
  return merge(parts);
}

// A five-pointed star, standing up and facing the camera.
export function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.14 : 0.32;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  g.translate(0, 0, -0.06);
  return paint(g, 0xffd23f);
}

// The flying pest: a grumpy purple puffball with horns. Its wings are a
// separate mesh so they can flap.
export function pestGeometry() {
  const body = 0x7a52c7;
  return merge([
    puff(0.34, 1, 0.9, 0.85, 0, 0, 0, body),
    puff(0.2, 1.1, 0.8, 0.5, 0, -0.1, 0.18, 0xb79cf0),
    puff(0.1, 1, 1, 0.5, -0.12, 0.07, 0.25, 0xffffff),
    puff(0.1, 1, 1, 0.5, 0.12, 0.07, 0.25, 0xffffff),
    puff(0.05, 1, 1, 0.6, -0.1, 0.05, 0.31, 0xd61f3c, 0),
    puff(0.05, 1, 1, 0.6, 0.1, 0.05, 0.31, 0xd61f3c, 0),
    angled(box(0.16, 0.04, 0.05, 0, 0, 0, INK), -0.12, 0.19, 0.27, -0.45), // angry brows
    angled(box(0.16, 0.04, 0.05, 0, 0, 0, INK), 0.12, 0.19, 0.27, 0.45),
    part(new THREE.ConeGeometry(0.06, 0.18, 5), -0.16, 0.34, 0, 0xffd23f), // horns
    part(new THREE.ConeGeometry(0.06, 0.18, 5), 0.16, 0.34, 0, 0xffd23f),
    upsideDown(part(new THREE.ConeGeometry(0.035, 0.08, 4), -0.06, -0.14, 0.28, 0xffffff)), // fangs
    upsideDown(part(new THREE.ConeGeometry(0.035, 0.08, 4), 0.06, -0.14, 0.28, 0xffffff)),
  ]);
}

function angled(g, x, y, z, rz) {
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

function upsideDown(g) {
  g.computeBoundingBox();
  const c = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.rotateX(Math.PI);
  g.translate(c.x, c.y, c.z);
  return g;
}

// One wing reaching out along +x from the shoulder, flat towards the camera
// so its flapping shows.
export function wingGeometry() {
  return merge([
    box(0.3, 0.2, 0.03, 0.15, 0, 0, 0xeee4ff),
    box(0.18, 0.13, 0.03, 0.36, 0.04, -0.01, 0xd2c0ff),
  ]);
}

// Background hot-air balloon: a striped envelope (white and grey stripes, so
// the instance color tints it), a basket and four ropes.
export function balloonGeometry() {
  const env = new THREE.SphereGeometry(1, 10, 8).toNonIndexed();
  env.scale(1, 1.15, 1);
  const pos = env.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const seg = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 10 + 0.5) % 10;
    const v = seg % 2 ? 1 : 0.72;
    for (let k = 0; k < 3; k++) colors.set([v, v, v], (i + k) * 3);
  }
  env.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const neck = new THREE.CylinderGeometry(0.62, 0.28, 0.5, 10);
  const parts = [env, part(neck, 0, -1.2, 0, 0xd8d8d8), box(0.42, 0.3, 0.42, 0, -2.02, 0, 0xe0b98a)];
  for (let s = 0; s < 4; s++) {
    const dx = s % 2 ? 0.18 : -0.18;
    const dz = s < 2 ? 0.18 : -0.18;
    parts.push(box(0.03, 0.5, 0.03, dx, -1.64, dz, 0x8a6a4a));
  }
  return merge(parts);
}

// Background bird: a little V. Flapping flips it upside down, so its
// material is double sided.
export function birdGeometry() {
  const l = box(0.34, 0.05, 0.08, -0.15, 0.05, 0, 0x34405a);
  l.rotateZ(0.42);
  const r = box(0.34, 0.05, 0.08, 0.15, 0.05, 0, 0x34405a);
  r.rotateZ(-0.42);
  return merge([l, r, box(0.12, 0.08, 0.1, 0, 0, 0, 0x34405a)]);
}

// Big soft background cloud, flatter and bluer than the ones to climb.
export function skyCloudGeometry() {
  return merge([
    puff(1, 1.3, 0.7, 0.6, 0, 0, 0, 0xf2f6ff),
    puff(0.75, 1.2, 0.75, 0.6, -1.3, -0.2, 0.1, 0xe4ecfb),
    puff(0.8, 1.2, 0.75, 0.6, 1.35, -0.22, 0.1, 0xe4ecfb),
    puff(0.7, 1.1, 0.8, 0.6, 0.5, 0.4, -0.2, 0xf2f6ff),
    puff(0.62, 1.1, 0.8, 0.6, -0.6, 0.32, -0.1, 0xf2f6ff),
  ]);
}

// A flat disc for the sun or the moon, with optional craters given as
// [x, y, radius] in units of r.
export function discGeometry(r, hex, craters) {
  const parts = [paint(new THREE.CircleGeometry(r, 24), hex)];
  for (let i = 0; i < craters.length; i++) {
    const c = craters[i];
    parts.push(part(new THREE.CircleGeometry(c[2] * r, 10), c[0] * r, c[1] * r, 0.05, 0xd9d6ef));
  }
  return merge(parts);
}
