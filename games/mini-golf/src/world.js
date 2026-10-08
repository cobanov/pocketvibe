// Everything that is drawn for the courses. Each hole is built once at load:
// green, borders, blocks, banks, cup, tee and the scenery around it are one
// merged vertex-colored mesh; water is a second mesh so it can shimmer, and
// each spinner or slider is a mesh of its own. The meadow, the flag and the
// bumpers (one InstancedMesh) are shared and moved to the hole being shown.

import * as THREE from 'three';
import {
  BAR_R,
  BLOCK,
  BUMPER_R,
  GREEN,
  HUB_R,
  SAND,
  SPINNER,
  STONE,
  VOID,
  WALL_HALF,
  WATER,
  buildCourse,
  cutInside,
  isCut,
} from './course.js';
import { CUP_R, moverPose } from './physics.js';
import { GROUND_Y, WALL_H, box, cylinder, merge, paint, paintTop, seeded } from './shared.js';

const GREEN_A = 0x5fd35a;
const GREEN_B = 0x53c64f;
const SAND_COLOR = 0xf3dc9c;
const MEADOW = 0x9ccf68;
const WOOD = 0xc4874c;
const WOOD_TOP = 0xe8b273;
const WOOD_DARK = 0x7a4f2c;
const POST = 0xfff6e8;
const EARTH = 0x8f5f3b;
const STONE_BANK = 0xa9b4bf;
const WATER_DEEP = 0x2fa6e6;
const WATER_FOAM = 0xbdf0ff;
const BLOCK_COLORS = [0xff5a5f, 0xffc23d, 0x4d8dff, 0xa66bff, 0xff8a3d];
const BUMPER_COLORS = [0xff4f7a, 0x4fc3ff, 0xffd23f, 0x8a6bff, 0x4fe08a];
const MAX_BUMPERS = 8;
const WATER_DROP = 0.2; // water sits this far below the green

const tmpColor = new THREE.Color();
const tmpColor2 = new THREE.Color();
const grad = [0, 0];

function playable(k) {
  return k === GREEN || k === SAND || isCut(k);
}

// The green surface: every tile is cut into n x n cells that follow the
// height field. Cells on the diagonal of a cut tile become triangles.
function greenGeometry(c) {
  const n = c.flat ? 2 : 4;
  const pos = [];
  const nor = [];
  const col = [];
  const cu = [0, 0, 0, 0];
  const cv = [0, 0, 0, 0];

  function vertex(x, z, hex, tint) {
    c.grad(x, z, grad);
    const h = c.height(x, z);
    const len = Math.hypot(grad[0], 1, grad[1]);
    pos.push(x, h, z);
    nor.push(-grad[0] / len, 1 / len, -grad[1] / len);
    // Slopes get darker and high ground lighter, so ramps and hills read
    // from any angle.
    const slope = Math.min(0.3, Math.hypot(grad[0], grad[1]) * 0.8);
    tmpColor.setHex(hex).multiplyScalar(tint * (1 - slope) * (1 + h * 0.25));
    col.push(tmpColor.r, tmpColor.g, tmpColor.b);
  }

  for (let v = 0; v < c.rows; v++) {
    for (let u = 0; u < c.cols; u++) {
      const k = c.tiles[v * c.cols + u];
      if (!playable(k)) continue;
      const hex = k === SAND ? SAND_COLOR : v % 2 ? GREEN_A : GREEN_B;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          // Corners counter-clockwise seen from above: NW, SW, SE, NE.
          cu[0] = i / n;
          cv[0] = j / n;
          cu[1] = i / n;
          cv[1] = (j + 1) / n;
          cu[2] = (i + 1) / n;
          cv[2] = (j + 1) / n;
          cu[3] = (i + 1) / n;
          cv[3] = j / n;
          let inside = 4;
          let out = -1;
          if (isCut(k)) {
            inside = 0;
            for (let q = 0; q < 4; q++) {
              if (cutInside(k, cu[q], cv[q])) inside++;
              else out = q;
            }
          }
          if (inside < 3) continue;
          // Sand gets a little grain, the green a soft checker.
          const tint = k === SAND ? 0.94 + ((i * 7 + j * 3 + u * 5 + v) % 4) * 0.025 : (i + j) % 2 ? 1 : 0.97;
          const x0 = c.ox + u;
          const z0 = c.oz + v;
          const corner = (q) => vertex(x0 + cu[q], z0 + cv[q], hex, tint);
          if (inside === 4) {
            corner(0);
            corner(1);
            corner(3);
            corner(3);
            corner(1);
            corner(2);
          } else {
            for (let q = 0; q < 4; q++) if (q !== out) corner(q);
          }
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// A box from (x0, z0) to (x1, z1), `thick` wide, whose top follows the
// green (plus `top`) and whose bottom sits at `bottom` (a height, or a
// function of the green height).
function strip(c, x0, z0, x1, z1, thick, top, bottom, sideHex, topHex, bottomHex) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(len, 1, thick);
  g.rotateY(-Math.atan2(dz, dx));
  g.translate((x0 + x1) / 2, 0.5, (z0 + z1) / 2);
  paintTop(g, topHex, sideHex);
  const p = g.attributes.position;
  const colors = g.attributes.color;
  tmpColor.setHex(bottomHex);
  for (let i = 0; i < p.count; i++) {
    const h = c.height(p.getX(i), p.getZ(i));
    if (p.getY(i) > 0.5) {
      p.setY(i, h + top);
    } else {
      p.setY(i, typeof bottom === 'function' ? bottom(h) : bottom);
      colors.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
    }
  }
  return g;
}

function bordersAndPosts(c, parts, accent) {
  const posts = new Map();
  const addPost = (x, z) => posts.set(`${Math.round(x * 100)},${Math.round(z * 100)}`, [x, z]);
  for (const s of c.segs) {
    if (s.kind === STONE) continue; // blocks draw their own sides
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
    const ux = (s.bx - s.ax) / len;
    const uz = (s.bz - s.az) / len;
    // Short pieces so the top follows slopes; the ends reach a little
    // further to close the corners.
    const pieces = Math.max(1, Math.ceil(len / (c.flat ? 4 : 0.5)));
    for (let i = 0; i < pieces; i++) {
      const a = (i / pieces) * len - (i === 0 ? WALL_HALF : 0);
      const b = ((i + 1) / pieces) * len + (i === pieces - 1 ? WALL_HALF : 0);
      parts.push(
        strip(c, s.ax + ux * a, s.az + uz * a, s.ax + ux * b, s.az + uz * b, WALL_HALF * 2, WALL_H, GROUND_Y, WOOD, WOOD_TOP, WOOD_DARK),
      );
    }
    addPost(s.ax, s.az);
    addPost(s.bx, s.bz);
    if (len > 5) addPost((s.ax + s.bx) / 2, (s.az + s.bz) / 2);
  }
  for (const [x, z] of posts.values()) {
    const h = c.height(x, z);
    const tall = h + WALL_H + 0.1 - GROUND_Y;
    parts.push(box(0.34, tall, 0.34, x, GROUND_Y + tall / 2, z, POST, POST));
    parts.push(box(0.4, 0.08, 0.4, x, h + WALL_H + 0.14, z, accent, accent));
  }
}

function blocks(c, parts) {
  // Neighbouring block tiles form one block of one color.
  const group = new Int16Array(c.cols * c.rows).fill(-1);
  let groups = 0;
  for (let i = 0; i < group.length; i++) {
    if (c.tiles[i] !== BLOCK || group[i] >= 0) continue;
    const stack = [i];
    group[i] = groups;
    while (stack.length) {
      const j = stack.pop();
      const u = j % c.cols;
      const v = (j / c.cols) | 0;
      const near = [u > 0 ? j - 1 : -1, u < c.cols - 1 ? j + 1 : -1, v > 0 ? j - c.cols : -1, v < c.rows - 1 ? j + c.cols : -1];
      for (const q of near) {
        if (q >= 0 && c.tiles[q] === BLOCK && group[q] < 0) {
          group[q] = groups;
          stack.push(q);
        }
      }
    }
    groups++;
  }
  for (let i = 0; i < group.length; i++) {
    if (group[i] < 0) continue;
    const x = c.ox + (i % c.cols) + 0.5;
    const z = c.oz + ((i / c.cols) | 0) + 0.5;
    const h = c.height(x, z);
    const hex = BLOCK_COLORS[group[i] % BLOCK_COLORS.length];
    tmpColor.setHex(hex).lerp(tmpColor2.setHex(0xffffff), 0.35);
    const w = 1 + WALL_HALF * 2;
    parts.push(box(w, 0.5, w, x, h + 0.2, z, hex, tmpColor.getHex()));
    parts.push(box(w + 0.04, 0.06, w + 0.04, x, h + 0.02, z, 0x3a3a46)); // dark foot
  }
}

function banks(c, parts) {
  for (const b of c.banks) {
    // Thin faces just outside the green's edge, down to the water or the
    // meadow, with a bright lip on top.
    const ox = b.nx * 0.03;
    const oz = b.nz * 0.03;
    const toWater = b.to === WATER;
    const bottom = toWater ? (h) => h - WATER_DROP - 0.15 : GROUND_Y;
    parts.push(
      strip(c, b.ax + ox, b.az + oz, b.bx + ox, b.bz + oz, 0.06, 0.02, bottom,
        toWater ? STONE_BANK : EARTH, toWater ? 0xe6edf2 : 0x74c95a, toWater ? 0x6d7a86 : 0x5a3a22),
    );
  }
}

function waterGeometry(c) {
  const pos = [];
  const col = [];
  const landAt = (x, z) => {
    // Any land tile touching this point gets foam.
    for (let dv = -1; dv <= 0; dv++) {
      for (let du = -1; du <= 0; du++) {
        const u = Math.round(x - c.ox) + du;
        const v = Math.round(z - c.oz) + dv;
        if (playable(c.tileAt(u, v))) return true;
      }
    }
    return false;
  };
  for (let v = 0; v < c.rows; v++) {
    for (let u = 0; u < c.cols; u++) {
      if (c.tiles[v * c.cols + u] !== WATER) continue;
      const x0 = c.ox + u;
      const z0 = c.oz + v;
      const y = c.height(x0 + 0.5, z0 + 0.5) - WATER_DROP;
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const xs = [x0 + i * 0.5, x0 + i * 0.5, x0 + i * 0.5 + 0.5, x0 + i * 0.5 + 0.5];
          const zs = [z0 + j * 0.5, z0 + j * 0.5 + 0.5, z0 + j * 0.5 + 0.5, z0 + j * 0.5];
          for (const q of [0, 1, 3, 3, 1, 2]) {
            pos.push(xs[q], y, zs[q]);
            // Foam only along edges that are exactly on a tile border.
            const onEdge = (xs[q] === x0 || xs[q] === x0 + 1 || zs[q] === z0 || zs[q] === z0 + 1) && landAt(xs[q], zs[q]);
            tmpColor.setHex(onEdge ? WATER_FOAM : WATER_DEEP);
            col.push(tmpColor.r, tmpColor.g, tmpColor.b);
          }
        }
      }
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function cupAndTee(c, parts, accent) {
  const hc = c.height(c.cup.x, c.cup.z);
  const hole = new THREE.CircleGeometry(CUP_R, 18);
  hole.rotateX(-Math.PI / 2);
  hole.translate(c.cup.x, hc + 0.006, c.cup.z);
  parts.push(paint(hole, 0x14200f));
  const rim = new THREE.RingGeometry(CUP_R, CUP_R + 0.045, 18);
  rim.rotateX(-Math.PI / 2);
  rim.translate(c.cup.x, hc + 0.008, c.cup.z);
  parts.push(paint(rim, 0xf6f6f0));

  const ht = c.height(c.tee.x, c.tee.z);
  parts.push(box(0.86, 0.04, 0.86, c.tee.x, ht + 0.01, c.tee.z, 0x2c7d36, 0x34913f));
  for (let s = -1; s <= 1; s += 2) {
    const marker = new THREE.IcosahedronGeometry(0.09, 0);
    marker.translate(c.tee.x + s * 0.62, ht + 0.07, c.tee.z + 0.3);
    parts.push(paint(marker, accent));
  }
}

function sliderRails(c, parts) {
  for (const m of c.movers) {
    if (m.type === SPINNER) continue;
    const dx = m.x1 - m.x0;
    const dz = m.z1 - m.z0;
    const len = Math.hypot(dx, dz);
    const ux = dx / len;
    const uz = dz / len;
    // A dark slot the slider glides along, as long as its whole travel.
    const reach = m.hw * Math.abs(ux) + m.hd * Math.abs(uz);
    const g = strip(c, m.x0 - ux * reach, m.z0 - uz * reach, m.x1 + ux * reach, m.z1 + uz * reach, 0.16, 0.01, (h) => h - 0.02, 0x5a5f6b, 0x3d414b, 0x3d414b);
    parts.push(g);
  }
}

// Scenery on the meadow around the course: trees far enough out not to
// block the camera, bushes, rocks and flowers closer in.
function scenery(c, parts, rand) {
  const land = [];
  for (let v = 0; v < c.rows; v++) {
    for (let u = 0; u < c.cols; u++) {
      const k = c.tiles[v * c.cols + u];
      if (k !== 0 && k !== VOID) land.push(c.ox + u, c.oz + v);
    }
  }
  const distance = (x, z) => {
    let best = 1e9;
    for (let i = 0; i < land.length; i += 2) {
      const dx = Math.max(land[i] - x, 0, x - land[i] - 1);
      const dz = Math.max(land[i + 1] - z, 0, z - land[i + 1] - 1);
      best = Math.min(best, dx * dx + dz * dz);
    }
    return Math.sqrt(best);
  };
  const reachX = c.cols / 2 + 14;
  const reachZ = c.rows / 2 + 14;
  const y = GROUND_Y;
  for (let i = 0; i < 160; i++) {
    const x = (rand() * 2 - 1) * reachX;
    const z = (rand() * 2 - 1) * reachZ;
    const d = distance(x, z);
    if (d < 0.8) continue;
    const r = rand();
    const s = 0.75 + rand() * 0.5;
    const rot = rand() * Math.PI;
    if (d > 6.5 && r < 0.55) {
      const trunk = cylinder(0.14 * s, 0.2 * s, 0.9 * s, 5, x, y + 0.45 * s, z, 0x7a5232);
      const low = new THREE.IcosahedronGeometry(0.95 * s, 0);
      low.rotateY(rot);
      low.translate(x, y + 1.35 * s, z);
      const high = new THREE.IcosahedronGeometry(0.65 * s, 0);
      high.rotateY(rot + 1);
      high.translate(x + 0.15 * s, y + 2.0 * s, z - 0.1 * s);
      const leaf = [0x3fae55, 0x4fbf5a, 0x2f9e4f][Math.floor(rand() * 3)];
      parts.push(trunk, paint(low, leaf), paint(high, 0x63cf6a));
    } else if (r < 0.45) {
      const g = new THREE.IcosahedronGeometry(0.5 * s, 0);
      g.scale(1.2, 0.75, 1);
      g.rotateY(rot);
      g.translate(x, y + 0.3 * s, z);
      parts.push(paint(g, rand() < 0.5 ? 0x48b85a : 0x3aa64f));
    } else if (r < 0.6) {
      const g = new THREE.DodecahedronGeometry(0.32 * s, 0);
      g.scale(1.3, 0.7, 1);
      g.rotateY(rot);
      g.translate(x, y + 0.12 * s, z);
      parts.push(paint(g, 0xb2bcc6));
    } else {
      // A little clump of flowers.
      const hex = [0xff6b8a, 0xffe14d, 0xffffff, 0xb784ff, 0xff9f45][Math.floor(rand() * 5)];
      for (let k = 0; k < 3; k++) {
        const fx = x + (rand() - 0.5) * 0.7;
        const fz = z + (rand() - 0.5) * 0.7;
        parts.push(box(0.05, 0.28, 0.05, fx, y + 0.14, fz, 0x3a8f3a));
        parts.push(box(0.18, 0.08, 0.18, fx, y + 0.3, fz, hex, hex));
      }
    }
  }
  // Lily pads on the water.
  for (let v = 0; v < c.rows; v++) {
    for (let u = 0; u < c.cols; u++) {
      if (c.tiles[v * c.cols + u] !== WATER || rand() < 0.55) continue;
      const x = c.ox + u + 0.25 + rand() * 0.5;
      const z = c.oz + v + 0.25 + rand() * 0.5;
      const h = c.height(x, z) - WATER_DROP + 0.015;
      parts.push(cylinder(0.24, 0.24, 0.025, 9, x, h, z, 0x3fa34a, 0x5cc15a));
      if (rand() < 0.4) parts.push(box(0.1, 0.07, 0.1, x + 0.08, h + 0.04, z, 0xff8fc8, 0xffc2e2));
    }
  }
}

function spinnerGeometry(m) {
  const parts = [cylinder(HUB_R, HUB_R + 0.02, 0.55, 10, 0, 0.27, 0, 0xf2f2f2, 0xff4f5e)];
  // A striped bar, red and white.
  const pieces = 6;
  const pieceLen = (m.len * 2) / pieces;
  for (let i = 0; i < pieces; i++) {
    const x = -m.len + pieceLen * (i + 0.5);
    parts.push(box(pieceLen, 0.2, BAR_R * 2, x, 0.14, 0, i % 2 ? 0xffffff : 0xff4f5e, i % 2 ? 0xffffff : 0xff7a85));
  }
  parts.push(cylinder(0.08, 0.08, 0.2, 6, 0, 0.62, 0, 0xffd23f, 0xffe680));
  return merge(parts);
}

function sliderGeometry(m) {
  const parts = [];
  const w = m.hw * 2;
  const pieces = Math.max(3, Math.round(w / 0.4));
  const pw = w / pieces;
  for (let i = 0; i < pieces; i++) {
    parts.push(box(pw, 0.36, m.hd * 2, -m.hw + pw * (i + 0.5), 0.18, 0, i % 2 ? 0x2b2b31 : 0xffc12e, i % 2 ? 0x45454d : 0xffd966));
  }
  parts.push(box(w + 0.06, 0.06, m.hd * 2 + 0.06, 0, 0.39, 0, 0xf2f2f2, 0xffffff));
  return merge(parts);
}

function buildHole(def, index, materials) {
  const c = buildCourse(def);
  const rand = seeded(101 + index * 37);
  const group = new THREE.Group();
  const parts = [greenGeometry(c)];
  bordersAndPosts(c, parts, def.flag);
  blocks(c, parts);
  banks(c, parts);
  cupAndTee(c, parts, def.flag);
  sliderRails(c, parts);
  scenery(c, parts, rand);
  group.add(new THREE.Mesh(merge(parts), materials.solid));

  const waterGeo = waterGeometry(c);
  let water = null;
  if (waterGeo) {
    water = new THREE.Mesh(waterGeo, materials.water);
    group.add(water);
  }

  const movers = c.movers.map((m) => {
    const mesh = new THREE.Mesh(m.type === SPINNER ? spinnerGeometry(m) : sliderGeometry(m), materials.solid);
    group.add(mesh);
    return mesh;
  });

  group.visible = false;
  return { def, course: c, group, movers };
}

function bumperGeometry() {
  // The body takes the instance color; the rubber ring stays dark.
  return merge([
    cylinder(BUMPER_R * 0.92, BUMPER_R, 0.24, 14, 0, 0.12, 0, 0xffffff, 0xffffff),
    cylinder(BUMPER_R + 0.03, BUMPER_R + 0.03, 0.08, 14, 0, 0.14, 0, 0x2a2a35, 0x2a2a35),
    cylinder(BUMPER_R * 0.55, BUMPER_R * 0.7, 0.1, 12, 0, 0.29, 0, 0xffffff, 0xffffff),
  ]);
}

function poleGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(cylinder(0.03, 0.03, 0.25, 6, 0, 0.125 + i * 0.25, 0, i % 2 ? 0xff4f5e : 0xffffff));
  const knob = new THREE.SphereGeometry(0.055, 8, 6);
  knob.translate(0, 1.52, 0);
  parts.push(paint(knob, 0xffd23f));
  return merge(parts);
}

// The meadow and every hole. `holes` holds { def, course, group, movers }
// for each, all hidden until shown.
export function createWorld(scene, defs) {
  const materials = {
    solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
    water: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0d4f7a, emissiveIntensity: 0.5 }),
  };
  const ground = new THREE.PlaneGeometry(220, 220);
  ground.rotateX(-Math.PI / 2);
  ground.translate(0, GROUND_Y, 0);
  scene.add(new THREE.Mesh(ground, new THREE.MeshLambertMaterial({ color: MEADOW })));

  const holes = defs.map((def, i) => {
    const hole = buildHole(def, i, materials);
    scene.add(hole.group);
    return hole;
  });

  let time = 0;
  return {
    holes,
    // The water glints slowly.
    update(dt) {
      time += dt;
      materials.water.emissiveIntensity = 0.45 + Math.sin(time * 2.2) * 0.12;
    },
  };
}

// The flag in the cup, with a cloth that waves.
export function createFlag(scene) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(poleGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(pole);
  const clothGeometry = new THREE.PlaneGeometry(0.62, 0.38, 6, 1);
  clothGeometry.translate(0.31, 1.3, 0);
  const rest = Float32Array.from(clothGeometry.attributes.position.array);
  const clothMaterial = new THREE.MeshLambertMaterial({ color: 0xff4f5e, side: THREE.DoubleSide });
  const cloth = new THREE.Mesh(clothGeometry, clothMaterial);
  cloth.frustumCulled = false;
  pole.add(cloth);
  scene.add(group);

  let time = 0;
  let lift = 0; // the pole is pulled out a little while the ball comes close
  let liftTarget = 0;
  let jump = 0; // a celebration hop and spin when the ball drops

  return {
    group,
    place(x, y, z, hex) {
      group.position.set(x, y - 0.12, z);
      clothMaterial.color.setHex(hex);
      lift = liftTarget = 0;
      jump = 0;
    },
    lift(on) {
      liftTarget = on ? 1 : 0;
    },
    celebrate() {
      jump = 1;
    },
    update(dt) {
      time += dt;
      lift += (liftTarget - lift) * Math.min(1, dt * 6);
      jump = Math.max(0, jump - dt * 0.8);
      const hop = jump > 0 ? Math.sin((1 - jump) * Math.PI) * 0.9 : 0;
      pole.position.y = lift * 0.55 + hop;
      pole.rotation.y = jump > 0 ? (1 - jump) * (1 - jump) * Math.PI * 4 : 0;
      // Waves run from the pole to the free edge and grow along it.
      const p = clothGeometry.attributes.position;
      const speed = jump > 0 ? 16 : 6;
      for (let i = 0; i < p.count; i++) {
        const x = rest[i * 3];
        const k = x / 0.62;
        p.setZ(i, Math.sin(time * speed - x * 7) * 0.07 * k);
        p.setY(i, rest[i * 3 + 1] - k * k * 0.04 + Math.sin(time * speed * 0.7 - x * 5) * 0.02 * k);
      }
      p.needsUpdate = true;
    },
  };
}

// All bumpers of the hole being shown, as one InstancedMesh. A hit makes a
// bumper swell and wobble.
export function createBumpers(scene) {
  const mesh = new THREE.InstancedMesh(bumperGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), MAX_BUMPERS);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const color = new THREE.Color();
  for (let i = 0; i < MAX_BUMPERS; i++) mesh.setColorAt(i, color.setHex(BUMPER_COLORS[i % BUMPER_COLORS.length]));
  scene.add(mesh);

  const px = new Float32Array(MAX_BUMPERS);
  const py = new Float32Array(MAX_BUMPERS);
  const pz = new Float32Array(MAX_BUMPERS);
  const pulse = new Float32Array(MAX_BUMPERS); // seconds since the last hit
  const dummy = new THREE.Object3D();

  return {
    colorOf: (i) => BUMPER_COLORS[i % BUMPER_COLORS.length],
    show(course) {
      mesh.count = course.bumpers.length;
      for (let i = 0; i < mesh.count; i++) {
        const b = course.bumpers[i];
        px[i] = b.x;
        py[i] = course.height(b.x, b.z);
        pz[i] = b.z;
        pulse[i] = 9;
      }
    },
    hit(i) {
      pulse[i] = 0;
    },
    update(dt) {
      for (let i = 0; i < mesh.count; i++) {
        pulse[i] += dt;
        const t = pulse[i];
        const wobble = t < 1 ? Math.exp(-t * 7) * Math.cos(t * 26) * 0.35 : 0;
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.scale.set(1 + wobble, 1 - wobble * 0.8, 1 + wobble);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Poses the spinner and slider meshes of a hole for simulation time t.
const pose = { x: 0, z: 0, angle: 0, vx: 0, vz: 0 };
export function poseMovers(hole, t) {
  const movers = hole.course.movers;
  for (let i = 0; i < movers.length; i++) {
    moverPose(movers[i], t, pose);
    const mesh = hole.movers[i];
    mesh.position.set(pose.x, hole.course.height(pose.x, pose.z), pose.z);
    mesh.rotation.y = -pose.angle;
  }
}
