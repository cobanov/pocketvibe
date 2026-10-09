// The bonus pickup: shows up twice per maze below the base, spins for a few
// seconds and is worth more on every level. Like the fruit of the arcade
// mazes it changes with the level: a nut, a battery, a chip, a gem, a star,
// a bell, a crown and a key. Every shape is built while loading and the one
// mesh swaps between them.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { START_X, START_Y } from './mazes.js';
import { elastic, glowDisc, glowMaterial, paint, worldX, worldZ } from './shared.js';

export const GEM_POINTS = [100, 300, 500, 700, 1000, 2000, 3000, 5000];
const GEM_COLORS = [0xff3b5c, 0xffb02e, 0x2fe08a, 0x3d8bff, 0xc06bff, 0xeaf6ff, 0xff6fc8, 0x4ff0ff];
export const GEM_NAMES = ['NUT', 'BATTERY', 'CHIP', 'GEM', 'STAR', 'BELL', 'CROWN', 'KEY'];
export const GEM_TIME = 9.5;
const POP_TIME = 0.5;
const SCALE = 1.3;
const DARK = 0x262b44;
const SILVER = 0xdfe6f0;

// Polyhedra and extrusions come without an index, the rest with one;
// mergeGeometries needs them alike.
function merge(parts) {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat);
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  return merged;
}

function nut(c) {
  const body = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 6);
  const hole = new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8);
  return merge([paint(body, c), paint(hole, DARK)]);
}

function battery(c) {
  const body = new THREE.CylinderGeometry(0.17, 0.17, 0.5, 10);
  const band = new THREE.CylinderGeometry(0.176, 0.176, 0.14, 10);
  band.translate(0, -0.13, 0);
  const tip = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 8);
  tip.translate(0, 0.29, 0);
  const parts = [paint(body, c), paint(band, 0xffffff), paint(tip, SILVER)];
  for (const g of parts) g.rotateZ(Math.PI / 2);
  return merge(parts);
}

function chip(c) {
  const parts = [paint(new THREE.BoxGeometry(0.46, 0.1, 0.36), c)];
  const label = new THREE.BoxGeometry(0.14, 0.02, 0.14);
  label.translate(0, 0.06, 0);
  parts.push(paint(label, 0xffffff));
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.05, 0.04, 0.1);
      leg.translate(-0.15 + i * 0.1, -0.03, side * 0.22);
      parts.push(paint(leg, SILVER));
    }
  }
  return merge(parts);
}

function gem(c) {
  const crown = new THREE.CylinderGeometry(0.17, 0.3, 0.16, 8);
  crown.translate(0, 0.08, 0);
  const pavilion = new THREE.ConeGeometry(0.3, 0.38, 8);
  pavilion.rotateX(Math.PI);
  pavilion.translate(0, -0.19, 0);
  return merge([paint(crown, c), paint(pavilion, c)]);
}

function star(c) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.15 : 0.36;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
  g.translate(0, 0, -0.06);
  g.rotateX(-Math.PI / 2);
  return merge([paint(g, c)]);
}

function bell(c) {
  const profile = [
    [0, -0.22],
    [0.28, -0.22],
    [0.27, -0.17],
    [0.17, -0.02],
    [0.14, 0.16],
    [0.08, 0.25],
    [0, 0.27],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(profile, 10);
  const clapper = new THREE.SphereGeometry(0.07, 6, 4);
  clapper.translate(0, -0.24, 0);
  const loop = new THREE.TorusGeometry(0.06, 0.025, 3, 8);
  loop.translate(0, 0.32, 0);
  return merge([paint(body, c), paint(clapper, 0xffd34a), paint(loop, SILVER)]);
}

function crown(c) {
  const parts = [paint(new THREE.CylinderGeometry(0.27, 0.24, 0.16, 10), c)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.ConeGeometry(0.075, 0.2, 5);
    spike.translate(Math.cos(a) * 0.22, 0.18, Math.sin(a) * 0.22);
    parts.push(paint(spike, c));
    const jewel = new THREE.OctahedronGeometry(0.05, 0);
    jewel.translate(Math.cos(a) * 0.255, 0, Math.sin(a) * 0.255);
    parts.push(paint(jewel, 0xffffff));
  }
  return merge(parts);
}

function key(c) {
  const bow = new THREE.TorusGeometry(0.13, 0.05, 4, 10);
  bow.rotateX(Math.PI / 2);
  bow.translate(-0.2, 0, 0);
  const shaft = new THREE.BoxGeometry(0.38, 0.07, 0.08);
  shaft.translate(0.1, 0, 0);
  const tooth1 = new THREE.BoxGeometry(0.06, 0.07, 0.12);
  tooth1.translate(0.2, 0, 0.09);
  const tooth2 = new THREE.BoxGeometry(0.06, 0.07, 0.09);
  tooth2.translate(0.28, 0, 0.075);
  return merge([paint(bow, c), paint(shaft, c), paint(tooth1, c), paint(tooth2, c)]);
}

const SHAPES = [nut, battery, chip, gem, star, bell, crown, key];

export function createBonus(scene) {
  const geometries = SHAPES.map((make, i) => make(GEM_COLORS[i]));
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000, flatShading: true });
  const mesh = new THREE.Mesh(geometries[0], material);
  scene.add(mesh);
  const glowMat = glowMaterial(0xffffff, 0.75);
  const glow = new THREE.Mesh(glowDisc(1.2), glowMat);
  glow.position.y = 0.02;
  scene.add(glow);
  const x = worldX(START_X);
  const z = worldZ(START_Y);

  let time = 0;

  const bonus = {
    on: false,
    age: 0,
    left: 0,
    points: 0,
    tier: 0,
    color: 0xffffff,
    cx: START_X,
    cy: START_Y,
    shapes: SHAPES.length,

    spawn(level) {
      const k = Math.min(level - 1, GEM_POINTS.length - 1);
      this.on = true;
      this.age = 0;
      this.left = GEM_TIME;
      this.tier = k;
      this.points = GEM_POINTS[k];
      this.color = GEM_COLORS[k];
      mesh.geometry = geometries[k];
      material.emissive.setHex(this.color).multiplyScalar(0.32);
      glowMat.color.setHex(this.color);
    },

    clear() {
      this.on = false;
      this.draw(0);
    },

    // Returns true on the frame the pickup runs out.
    update(dt) {
      time += dt;
      if (!this.on) return false;
      this.age += dt;
      this.left -= dt;
      if (this.left <= 0) {
        this.on = false;
        return true;
      }
      return false;
    },

    draw() {
      const blinking = this.on && this.left < 2 && Math.floor(this.left * 8) % 2 === 0;
      mesh.visible = this.on && !blinking;
      glow.visible = this.on;
      if (!this.on) return;
      const pop = elastic(this.age / POP_TIME);
      mesh.position.set(x, 0.66 + Math.sin(time * 3.5) * 0.08, z);
      mesh.rotation.set(0.3, time * 2.4, 0);
      mesh.scale.setScalar(Math.max(0.01, pop * SCALE));
      glow.position.x = x;
      glow.position.z = z;
      glow.scale.setScalar(Math.max(0.01, pop) * (0.9 + Math.sin(time * 6) * 0.1));
    },
  };

  bonus.clear();
  return bonus;
}
