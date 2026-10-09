// Rocks: jittered low-poly icosahedrons, one InstancedMesh per size, drawn from
// one fixed pool. Large rocks split into two medium, medium into two small.

import * as THREE from 'three';
import { HALF_H, HALF_W, TAU, rand, wrap } from './shared.js';

export const LARGE = 0;
export const MEDIUM = 1;
export const SMALL = 2;

// radius: drawn size. hit: collision radius, a little smaller for fairness.
// mass: the shots it takes to clear the rock and all its pieces (the
// heartbeat speeds up as the total falls).
export const SIZES = [
  { radius: 2.0, hit: 1.8, speedMin: 2.0, speedMax: 3.6, points: 20, mass: 7, detail: 1, cap: 16, tint: 0xf08a5d, sparks: 26, shake: 0.22 },
  { radius: 1.2, hit: 1.08, speedMin: 3.0, speedMax: 5.4, points: 50, mass: 3, detail: 1, cap: 32, tint: 0xf6b25e, sparks: 16, shake: 0.13 },
  { radius: 0.68, hit: 0.64, speedMin: 4.2, speedMax: 7.4, points: 100, mass: 1, detail: 0, cap: 64, tint: 0xffd98a, sparks: 10, shake: 0.07 },
];

const POOL = 96;
// The distance a large rock travels to come round to where it was.
const WRAP_W = (HALF_W + SIZES[LARGE].radius) * 2;
const WRAP_H = (HALF_H + SIZES[LARGE].radius) * 2;

const tmpColor = new THREE.Color();
const dummy = new THREE.Object3D();

// An icosahedron with every corner pushed in or out a little. Faces get
// slightly different greys so the flat shading reads as chipped stone; the
// per-size tint comes from the instance color.
function rockGeometry(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail); // non-indexed: 3 vertices per face
  const pos = g.attributes.position;
  const bumps = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Vertices shared by several faces must move together, or the rock cracks.
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let s = bumps.get(key);
    if (s === undefined) {
      s = 0.78 + Math.random() * 0.36;
      bumps.set(key, s);
    }
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals(); // face normals, since no vertex is shared

  const colors = new Float32Array(pos.count * 3);
  for (let f = 0; f < pos.count; f += 3) {
    const shade = 0.72 + Math.random() * 0.28;
    for (let k = 0; k < 3; k++) {
      colors[(f + k) * 3] = shade;
      colors[(f + k) * 3 + 1] = shade * 0.96;
      colors[(f + k) * 3 + 2] = shade * 0.93;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function createRocks(scene, fx) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const meshes = [];
  for (let s = 0; s < SIZES.length; s++) {
    const mesh = new THREE.InstancedMesh(rockGeometry(SIZES[s].detail), material, SIZES[s].cap);
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    tmpColor.setHex(SIZES[s].tint);
    for (let i = 0; i < SIZES[s].cap; i++) mesh.setColorAt(i, tmpColor);
    mesh.count = 0;
    scene.add(mesh);
    meshes.push(mesh);
  }

  const rocks = [];
  for (let i = 0; i < POOL; i++) {
    rocks.push({
      active: false, size: 0, x: 0, y: 0, vx: 0, vy: 0,
      rx: 0, ry: 0, rz: 0, sx: 0, sy: 0, sz: 0, // rotation and tumble speed
      kx: 1, ky: 1, kz: 1, // per-rock stretch, so no two look alike
      r: 1, g: 1, b: 1, // instance tint
      flash: 0, // seconds of white hit flash left (on the halves of a split)
    });
  }
  const counts = new Int32Array(SIZES.length);
  let active = 0;
  let mass = 0; // shots still needed to clear the field

  function add(size, x, y, vx, vy) {
    for (let i = 0; i < POOL; i++) {
      const r = rocks[i];
      if (r.active) continue;
      r.active = true;
      r.size = size;
      r.x = x;
      r.y = y;
      r.vx = vx;
      r.vy = vy;
      r.rx = Math.random() * TAU;
      r.ry = Math.random() * TAU;
      r.rz = Math.random() * TAU;
      r.sx = rand(-1.6, 1.6);
      r.sy = rand(-1.6, 1.6);
      r.sz = rand(-1.2, 1.2);
      r.kx = rand(0.85, 1.15);
      r.ky = rand(0.85, 1.15);
      r.kz = rand(0.85, 1.15);
      // A touch of brightness and hue variation around the size's tint.
      tmpColor.setHex(SIZES[size].tint);
      const v = rand(0.85, 1.1);
      r.r = tmpColor.r * v;
      r.g = tmpColor.g * v * rand(0.92, 1.05);
      r.b = tmpColor.b * v * rand(0.9, 1.15);
      r.flash = 0;
      active++;
      mass += SIZES[size].mass;
      return r;
    }
    return null;
  }

  function launch(size, x, y, speedMul) {
    const a = Math.random() * TAU;
    const s = rand(SIZES[size].speedMin, SIZES[size].speedMax) * speedMul;
    return add(size, x, y, Math.cos(a) * s, Math.sin(a) * s);
  }

  function draw() {
    counts.fill(0);
    for (let i = 0; i < POOL; i++) {
      const r = rocks[i];
      if (!r.active) continue;
      const mesh = meshes[r.size];
      const n = counts[r.size];
      if (n >= SIZES[r.size].cap) continue;
      const rad = SIZES[r.size].radius;
      dummy.position.set(r.x, r.y, 0);
      dummy.rotation.set(r.rx, r.ry, r.rz);
      // A hit flash also puffs the rock up for a few frames.
      const pop = 1 + r.flash * 1.6;
      dummy.scale.set(rad * r.kx * pop, rad * r.ky * pop, rad * r.kz * pop);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      const w = Math.min(1, r.flash * 9);
      tmpColor.setRGB(r.r + (1.6 - r.r) * w, r.g + (1.6 - r.g) * w, r.b + (1.6 - r.b) * w);
      mesh.setColorAt(n, tmpColor);
      counts[r.size] = n + 1;
    }
    for (let s = 0; s < meshes.length; s++) {
      meshes[s].count = counts[s];
      meshes[s].instanceMatrix.needsUpdate = true;
      meshes[s].instanceColor.needsUpdate = true;
    }
  }

  return {
    get count() {
      return active;
    },

    // Shots still needed to clear every rock (a large one takes seven).
    get mass() {
      return mass;
    },

    clear() {
      for (let i = 0; i < POOL; i++) rocks[i].active = false;
      active = 0;
      mass = 0;
      draw();
    },

    // count large rocks entering from the screen edges, away from (ax, ay).
    spawnWave(count, ax, ay, speedMul) {
      for (let i = 0; i < count; i++) {
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 20; tries++) {
          // A random point on the border of the field.
          if (Math.random() < 0.6) {
            x = (Math.random() < 0.5 ? -1 : 1) * (HALF_W + 1);
            y = rand(-HALF_H, HALF_H);
          } else {
            x = rand(-HALF_W, HALF_W);
            y = (Math.random() < 0.5 ? -1 : 1) * (HALF_H + 1);
          }
          // Measured around the wrap too: a rock just past one edge comes
          // in at the other one at once.
          let dx = Math.abs(x - ax);
          let dy = Math.abs(y - ay);
          dx = Math.min(dx, WRAP_W - dx);
          dy = Math.min(dy, WRAP_H - dy);
          if (dx * dx + dy * dy > 100) break;
        }
        launch(LARGE, x, y, speedMul);
      }
      draw();
    },

    // A calm mix of sizes for the title screen.
    spawnAttract() {
      for (let i = 0; i < 9; i++) {
        launch(i < 3 ? LARGE : i < 6 ? MEDIUM : SMALL, rand(-HALF_W, HALF_W), rand(-HALF_H, HALF_H), 0.6);
      }
      draw();
    },

    update(dt) {
      for (let i = 0; i < POOL; i++) {
        const r = rocks[i];
        if (!r.active) continue;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.rx += r.sx * dt;
        r.ry += r.sy * dt;
        r.rz += r.sz * dt;
        if (r.flash > 0) r.flash = Math.max(0, r.flash - dt);
        wrap(r, SIZES[r.size].radius);
      }
      draw();
    },

    // Index of a rock overlapping the circle (x, y, radius), or -1.
    hit(x, y, radius) {
      for (let i = 0; i < POOL; i++) {
        const r = rocks[i];
        if (!r.active) continue;
        const d = SIZES[r.size].hit + radius;
        const dx = r.x - x;
        const dy = r.y - y;
        if (dx * dx + dy * dy < d * d) return i;
      }
      return -1;
    },

    // True if no rock comes within `radius` of (x, y), counting rock size.
    clearAt(x, y, radius) {
      return this.hit(x, y, radius) < 0;
    },

    // Breaks rock i, pushed along (dx, dy) by the hit. Returns the points.
    destroy(i, dx, dy, speedMul) {
      const r = rocks[i];
      const size = r.size;
      const def = SIZES[size];
      r.active = false;
      active--;
      mass -= def.mass;

      // Sparks in the rock's own tint, plus a few bright chips.
      fx.burst(r.x, r.y, def.tint, def.sparks, 9 + def.radius * 2, 0.55 + def.radius * 0.15, 0.32 + def.radius * 0.12);
      fx.burst(r.x, r.y, 0xfff4d8, def.sparks >> 1, 12, 0.35, 0.22);
      if (size !== SMALL) fx.ring(r.x, r.y, def.tint, def.radius * 2.0, 0.4);

      if (size !== SMALL) {
        // Two halves fly apart across the line of the hit.
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const child = size + 1;
        const c = SIZES[child];
        const off = c.radius * 0.6;
        for (let k = -1; k <= 1; k += 2) {
          const s = rand(c.speedMin, c.speedMax) * speedMul;
          const spread = rand(0.35, 0.8);
          let vx = (px * k + (dx / len) * (1 - spread)) * s;
          let vy = (py * k + (dy / len) * (1 - spread)) * s;
          // Keep a bit of the parent's motion so the break looks physical.
          vx += r.vx * 0.35;
          vy += r.vy * 0.35;
          const h = add(child, r.x + px * k * off, r.y + py * k * off, vx, vy);
          if (h) h.flash = 0.12;
        }
      }
      return def.points;
    },

    // Position and tint of rock i, for effects that need them.
    get(i) {
      return rocks[i];
    },
  };
}
