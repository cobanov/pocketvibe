// Scenery around a circuit: the sky, the start/finish arch, the grandstand,
// trackside boards, trees (or cacti and rocks) and the traffic cones cars can
// knock flying. The static parts go into the circuit's triangle soup.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, paint, seededRandom } from './shared.js';
import { EDGE, LIMIT } from './track.js';
import { CONE } from './fx.js';

const CROWD_COLORS = [0xe8433a, 0xffd23f, 0x2f6fdf, 0xffffff, 0x8a4fff, 0xff8a2a, 0x2ec27e];
const FAR_TREE = 30; // trees farther than this from the track use the simpler model

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Mowed stripes in two shades of white; the ground material's color gives
// each circuit its grass, sand or snow.
export function groundTexture() {
  const t = canvasTexture(2, 2, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1, 2);
    ctx.fillStyle = '#ebebeb';
    ctx.fillRect(1, 0, 1, 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// The sign on top of the arch: the circuit's name.
export function signTexture(name) {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e8433a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#1d2233';
    ctx.font = 'italic bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.toUpperCase(), w / 2, h / 2 + 2, w - 20);
  });
}

// Trees and other roadside things. Each kind is a part that keeps its colors
// (a trunk) and a part tinted per tree (a crown), both shaded a little per
// tree. Open-ended cones and cylinders: their caps are never seen from the
// car, so they are left out.
function cylinder(top, bottom, height, segments, y, hex) {
  const g = new THREE.CylinderGeometry(top, bottom, height, segments, 1, true);
  g.translate(0, y, 0);
  return paint(g, hex);
}

function kindGeometry(kind, colors) {
  const trunk = (h, segments = 4) => cylinder(0.22, 0.3, h, segments, h / 2, 0x7a5232);
  // Pines far from the track (only ever seen from a distance) have fewer sides.
  const pine = (low, top, sides) =>
    mergeGeometries([trunk(1.2, sides > 5 ? 4 : 3), cylinder(0, 1.6, 2.6, sides, 2.3, low), cylinder(0, 1.1, 2.0, sides, 3.6, top)]);
  switch (kind) {
    case 'pine':
      return { base: pine(0x2f8a46, 0x3c9e52, 7), far: { base: pine(0x2f8a46, 0x3c9e52, 5) } };
    case 'snowpine':
      return { base: pine(0x2c6a4c, 0xeef3f8, 7), far: { base: pine(0x2c6a4c, 0xeef3f8, 5) } };
    case 'round':
    case 'autumn': {
      const crown = new THREE.IcosahedronGeometry(1.6, 0);
      crown.translate(0, 2.7, 0);
      paint(crown, kind === 'round' ? 0x5cb84c : 0xffffff);
      return kind === 'round'
        ? { base: mergeGeometries([trunk(1.5).toNonIndexed(), crown]) }
        : { base: trunk(1.5), crown, tints: colors.autumn };
    }
    case 'cactus': {
      const green = 0x4f9a5a;
      const parts = [cylinder(0.34, 0.38, 2.8, 6, 1.4, green), cylinder(0, 0.34, 0.35, 6, 2.97, green)];
      // Two arms: a stub out to the side, then up.
      for (const [side, y, h] of [[1, 1.3, 1.1], [-1, 1.75, 0.8]]) {
        const stub = new THREE.CylinderGeometry(0.2, 0.2, 0.62, 4, 1, true);
        stub.rotateZ(Math.PI / 2);
        stub.translate(side * 0.62, y, 0);
        const arm = cylinder(0.2, 0.21, h, 4, y + h / 2 - 0.1, green);
        arm.translate(side * 0.92, 0, 0);
        const tip = cylinder(0, 0.2, 0.22, 4, y + h + 0.01, green);
        tip.translate(side * 0.92, 0, 0);
        parts.push(paint(stub, green), arm, tip);
      }
      return { base: mergeGeometries(parts.map((g) => g.toNonIndexed())) };
    }
    case 'rock': {
      const rock = new THREE.IcosahedronGeometry(1.2, 0);
      rock.scale(1.3, 0.75, 1);
      rock.translate(0, 0.45, 0);
      return { base: paint(rock, colors.rock) };
    }
    default:
      throw new Error(`unknown scenery kind ${kind}`);
  }
}

// Trees on a jittered grid, away from the track and thinning out with
// distance. def.trees: kinds (two), mix (share of the first), density.
export function treesInto(soup, track, def, rand) {
  const { kinds, mix, density } = def.trees;
  const types = kinds.map((k) => kindGeometry(k, def.colors));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const shade = new THREE.Color();
  const tint = new THREE.Color();
  for (let x = track.minX - 70; x <= track.maxX + 70; x += 8.5) {
    for (let z = track.minZ - 70; z <= track.maxZ + 70; z += 8.5) {
      const tx = x + (rand() - 0.5) * 6;
      const tz = z + (rand() - 0.5) * 6;
      const d = track.nearestDistance(tx, tz);
      if (d < LIMIT + 3.5 || rand() > (1.05 - d / 58) * density) continue;
      const near = types[rand() < mix ? 0 : 1];
      const type = d > FAR_TREE && near.far ? near.far : near;
      const size = 0.8 + rand() * 0.55;
      const yaw = rand() * 6.3;
      const k = 0.82 + rand() * 0.18;
      shade.setRGB(k, k * 1.02, k);
      m.compose(p.set(tx, 0, tz), q.setFromAxisAngle(up, yaw), s.set(size, size * (0.9 + (k - 0.82) * 2), size));
      soup.add(type.base, m, shade);
      if (type.crown) {
        tint.setHex(type.tints[Math.floor(rand() * type.tints.length)]).multiply(shade);
        soup.add(type.crown, m, tint);
      }
    }
  }
}

// The matrix that moves geometry built in a local frame (x = left of the
// driving direction, z = along it) to sample i of the track.
function atSample(track, i) {
  const m = new THREE.Matrix4().makeRotationY(track.heading[i]);
  m.setPosition(track.px[i], 0, track.pz[i]);
  return m;
}

export function archInto(soup, track) {
  const m = atSample(track, 0);
  const half = EDGE + 1.1;
  for (let s = -1; s <= 1; s += 2) {
    soup.add(box(1.3, 0.6, 1.3, s * half, 0.3, 0, 0x3a3f4f, ['ny']), m);
    soup.add(box(0.9, 7.2, 0.9, s * half, 3.6, 0, 0xf4f1ea, ['ny', 'py']), m);
    for (let k = 0; k < 3; k++) soup.add(box(0.94, 0.5, 0.94, s * half, 1.4 + k * 2, 0, 0xe8433a, ['py', 'ny']), m);
  }
  soup.add(box(half * 2 + 1, 1.7, 0.7, 0, 7.6, 0, 0x262a38), m);
  // Checkered bands on both faces of the beam.
  const cells = 20;
  const cw = (half * 2) / cells;
  for (let face = -1; face <= 1; face += 2) {
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < cells; k++) {
        if ((k + row) % 2) continue;
        const q = new THREE.PlaneGeometry(cw, 0.6);
        if (face < 0) q.rotateY(Math.PI);
        q.translate(-half + (k + 0.5) * cw, 7.3 + row * 0.6, face * 0.36);
        soup.add(paint(q, 0xffffff), m);
      }
    }
  }
}

// A grandstand full of colorful spectators on the outside of the main
// straight, facing the track.
export function grandstandInto(soup, track, side, rand) {
  const m = atSample(track, track.ahead(0, 4));
  const len = 46;
  const base = -side * (LIMIT + 5); // local x is to the left, offsets are to the right
  const dir = -side;
  // The spectators' backs face away from the track and are never seen.
  const back = side > 0 ? 'nx' : 'px';
  for (let k = 0; k < 4; k++) {
    const x = base + dir * (1.1 + k * 2.2);
    const h = 0.9 * (k + 1);
    soup.add(box(2.2, h, len, x, h / 2, 0, k % 2 ? 0xb9bfcc : 0xa7aebd, ['ny']), m);
    for (let p = -len / 2 + 0.6; p < len / 2 - 0.4; p += 0.85) {
      if (rand() < 0.18) continue;
      const color = CROWD_COLORS[Math.floor(rand() * CROWD_COLORS.length)];
      soup.add(box(0.55, 0.7, 0.5, x + (rand() - 0.5) * 0.5, h + 0.35, p, color, ['ny', back]), m);
    }
  }
  const rear = base + dir * 9.4;
  for (let p = -1; p <= 1; p++) soup.add(box(0.4, 7.6, 0.4, rear, 3.8, p * (len / 2 - 1), 0xf4f1ea, ['ny', 'py']), m);
  soup.add(box(10.5, 0.35, len + 2, base + dir * 4.8, 7.7, 0, 0xe8433a), m);
  soup.add(box(10.5, 0.3, len + 2, base + dir * 4.8, 7.4, 0, 0xf4f1ea, ['py']), m);
  soup.add(box(0.3, 1.2, len, base - dir * 0.2, 0.6, 0, 0x2f6fdf, ['ny']), m); // front wall
}

// Advertising boards just beyond the barrier: on both sides of straights and
// on the outside of bends, so the edge of the drivable area is visible. One
// continuous fence per side, a few samples per colored board.
export function boardsInto(soup, track, colors) {
  const { n, px, pz, tx, tz, curv } = track;
  const color = new THREE.Color();
  const X = (i, off) => px[i] - tz[i] * off;
  const Z = (i, off) => pz[i] + tx[i] * off;
  // A vertical quad from (x0, z0) to (x1, z1) facing right of that direction.
  const wall = (x0, z0, x1, z1, hex) => {
    color.setHex(hex);
    soup.tri(x0, 0, z0, x1, 0, z1, x1, 1, z1, color.r, color.g, color.b);
    soup.tri(x0, 0, z0, x1, 1, z1, x0, 1, z0, color.r, color.g, color.b);
  };
  for (let side = -1; side <= 1; side += 2) {
    const near = side * (LIMIT + 1.4 - 0.125);
    const far = side * (LIMIT + 1.4 + 0.125);
    const lo = Math.min(near, far);
    const hi = Math.max(near, far);
    const shown = (i) => Math.abs(curv[i]) < 0.008 || side === Math.sign(curv[i]);
    for (let i = 0; i < n; i++) {
      if (!shown(i)) continue;
      // Each board is a flat panel over three samples (fewer where the
      // fence starts or ends).
      let j = i + 1;
      while (j < n && j % 3 !== 0 && shown(j)) j++;
      const k = j % n;
      const hex = colors[Math.floor(i / 3) % colors.length];
      if (side > 0) {
        wall(X(k, near), Z(k, near), X(i, near), Z(i, near), hex);
        wall(X(i, far), Z(i, far), X(k, far), Z(k, far), hex);
      } else {
        wall(X(i, near), Z(i, near), X(k, near), Z(k, near), hex);
        wall(X(k, far), Z(k, far), X(i, far), Z(i, far), hex);
      }
      soup.quad(X(i, lo), Z(i, lo), X(i, hi), Z(i, hi), X(k, hi), Z(k, hi), X(k, lo), Z(k, lo), 1, hex);
      i = j - 1;
    }
  }
}

// Sky dome with a gradient and two rings of distant hills, one mesh that
// follows the camera. Unlit and unfogged; its colors already fade into the
// horizon haze. radius stays inside the camera's far plane.
export function skyGeometry(def, radius) {
  const rand = seededRandom(def.skySeed ?? def.seed + 1);
  const { colors } = def;
  const dome = new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const pos = dome.attributes.position;
  const domeColors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(colors.skyTop);
  const low = new THREE.Color(colors.sky);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / (radius * 0.62)));
    c.copy(low).lerp(top, Math.sqrt(t));
    domeColors[i * 3] = c.r;
    domeColors[i * 3 + 1] = c.g;
    domeColors[i * 3 + 2] = c.b;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(domeColors, 3));
  const parts = [dome.toNonIndexed()];
  parts[0].deleteAttribute('uv');
  parts[0].deleteAttribute('normal');

  // A ring of peaks: a strip of triangles whose top edge is jagged. Mesas
  // keep the same height for a few segments, so their tops are flat.
  const ring = (r, minH, maxH, hex, segments, mesa) => {
    const p = [];
    const col = [];
    const peak = new THREE.Color(hex);
    const heights = [];
    while (heights.length < segments) {
      const h = minH + (maxH - minH) * Math.pow(rand(), 1.5);
      const run = mesa ? 2 + Math.floor(rand() * 4) : 1;
      for (let k = 0; k < run; k++) heights.push(mesa && k === 0 ? minH : h);
    }
    heights.length = segments;
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const h0 = heights[i];
      const h1 = heights[(i + 1) % segments];
      const x0 = Math.cos(a0) * r;
      const z0 = Math.sin(a0) * r;
      const x1 = Math.cos(a1) * r;
      const z1 = Math.sin(a1) * r;
      p.push(x0, -4, z0, x1, -4, z1, x1, h1, z1, x0, -4, z0, x1, h1, z1, x0, h0, z0);
      for (const y of [-4, -4, h1, -4, h1, h0]) {
        c.copy(low).lerp(peak, Math.min(1, Math.max(0, y / maxH) * 1.6));
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  const k = radius / 146; // the hills were designed for a sky of radius 146
  const hills = def.hills ?? {};
  parts.push(ring(radius * 0.96, 8 * k, (hills.far ?? 30) * k, colors.far, 40, hills.mesa));
  parts.push(ring(radius * 0.877, 3 * k, (hills.near ?? 13) * k, colors.near, 56, false));
  return mergeGeometries(parts);
}

// A traffic cone: hollow (open at both ends) like a real one, on a square base.
export function coneGeometry() {
  const body = new THREE.CylinderGeometry(0.07, 0.32, 0.8, 6, 1, true);
  body.translate(0, 0.48, 0);
  const band = new THREE.CylinderGeometry(0.2, 0.245, 0.18, 6, 1, true);
  band.translate(0, 0.45, 0);
  return mergeGeometries([paint(body, CONE), paint(band, 0xffffff), box(0.72, 0.08, 0.72, 0, 0.04, 0, CONE)]);
}

// Cones in groups of three on the inside of the sharpest corners, as one
// InstancedMesh; returns it with the code that knocks them flying.
export function createCones(track, geometry, material) {
  const { n, px, pz } = track;
  const homes = [];
  let last = -100;
  for (let i = 0; i < n; i++) {
    const c = Math.abs(track.curv[i]);
    if (c < 0.03 || i - last < 25) continue;
    let peak = true;
    for (let k = -8; k <= 8; k++) if (Math.abs(track.curv[(i + k + n) % n]) > c) peak = false;
    if (!peak) continue;
    last = i;
    const off = -Math.sign(track.curv[i]) * (EDGE + 1.1);
    for (let k = -1; k <= 1; k++) {
      const j = (i + k * 4 + n) % n;
      homes.push(px[j] - track.tz[j] * off, pz[j] + track.tx[j] * off);
    }
  }
  const coneCount = homes.length / 2;
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, coneCount));
  mesh.count = coneCount;
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const cxs = new Float32Array(coneCount);
  const cys = new Float32Array(coneCount);
  const czs = new Float32Array(coneCount);
  const cvx = new Float32Array(coneCount);
  const cvy = new Float32Array(coneCount);
  const cvz = new Float32Array(coneCount);
  const tumble = new Float32Array(coneCount);
  const tumbleV = new Float32Array(coneCount);
  const yaw = new Float32Array(coneCount);
  const state = new Uint8Array(coneCount); // 0 standing, 1 flying, 2 knocked over
  let dirty = true;

  function draw() {
    for (let i = 0; i < coneCount; i++) {
      dummy.position.set(cxs[i], cys[i], czs[i]);
      dummy.rotation.set(tumble[i], yaw[i], 0, 'YXZ');
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    mesh,

    reset() {
      for (let i = 0; i < coneCount; i++) {
        cxs[i] = homes[i * 2];
        czs[i] = homes[i * 2 + 1];
        cys[i] = 0;
        tumble[i] = 0;
        yaw[i] = i;
        state[i] = 0;
      }
      dirty = true;
    },

    // Knocks cones that cars touch into the air. Returns how many the
    // player hit this frame.
    update(dt, cars, fx) {
      let playerHits = 0;
      for (let i = 0; i < coneCount; i++) {
        if (state[i] === 0) {
          for (let c = 0; c < cars.length; c++) {
            const car = cars[c];
            const dx = cxs[i] - car.x;
            const dz = czs[i] - car.z;
            if (dx * dx + dz * dz > 1.4) continue;
            const speed = Math.hypot(car.vx, car.vz);
            if (speed < 2) continue;
            state[i] = 1;
            cvx[i] = car.vx * 0.8 + dx * 3;
            cvz[i] = car.vz * 0.8 + dz * 3;
            cvy[i] = 5 + speed * 0.18;
            tumbleV[i] = 8 + Math.random() * 6;
            yaw[i] = Math.atan2(cvx[i], cvz[i]);
            car.vx *= 0.96;
            car.vz *= 0.96;
            fx.burst(4, cxs[i], 0.5, czs[i], 4, 4, 0.22, 0.5, CONE, 14);
            if (car.isPlayer) playerHits++;
            break;
          }
        } else if (state[i] === 1) {
          dirty = true;
          cvy[i] -= 26 * dt;
          cxs[i] += cvx[i] * dt;
          cys[i] += cvy[i] * dt;
          czs[i] += cvz[i] * dt;
          tumble[i] += tumbleV[i] * dt;
          if (cys[i] <= 0 && cvy[i] < 0) {
            cys[i] = 0;
            cvx[i] *= 0.5;
            cvz[i] *= 0.5;
            cvy[i] *= -0.35;
            if (cvy[i] < 1.5) {
              // Settle lying on its side.
              state[i] = 2;
              tumble[i] = Math.PI / 2;
              cys[i] = 0.3;
            }
          }
        }
      }
      if (dirty) {
        draw();
        dirty = false;
      }
      return playerHits;
    },
  };
}
