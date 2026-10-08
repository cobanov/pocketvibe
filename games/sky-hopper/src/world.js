// Scenery: the sky gradient, far peaks, a sea of clouds, floating islands,
// drifting clouds and the grassy ledge at the bottom. Each background layer is
// one InstancedMesh whose pieces wrap around when they leave the left edge;
// layers further back scroll slower (parallax).

import * as THREE from 'three';
import { HORIZON, SKY_MID, SKY_TOP, box, lowPoly, merge, part } from './shared.js';

const LEDGE_FROM = -20; // the ledge mesh spans x = -20 .. 28, wide enough for 16:9 screens
const LEDGE_LEN = 48;
const LEDGE_PERIOD = 8; // its pattern repeats every 8 units, so it can wrap
const LEDGE_BACK = -6;
const LEDGE_FRONT = 1.7; // close enough that the lip and the dirt show at the bottom

// Big vertical plane far behind everything, colored by height: hazy at the
// horizon (the camera's eye level), deep blue at the top. Tall enough for the
// square screen, which shows the most sky.
function skyGeometry() {
  const g = new THREE.PlaneGeometry(150, 120, 1, 24);
  g.translate(0, 23, 0);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(HORIZON);
  const mid = new THREE.Color(SKY_MID);
  const top = new THREE.Color(SKY_TOP);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 4) c.copy(horizon);
    else if (y < 24) c.lerpColors(horizon, mid, (y - 4) / 20);
    else c.lerpColors(mid, top, Math.min(1, (y - 24) / 34));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// A mountain with a snow cap; unit size, scaled per instance.
function peakGeometry() {
  return merge([
    part(new THREE.ConeGeometry(1, 1, 7), 0, 0.5, 0, 0x93a6da),
    part(new THREE.ConeGeometry(0.33, 0.33, 7), 0, 0.84, 0, 0xf6f9ff),
  ]);
}

// A puffy cloud made of a few low-poly balls.
function cloudGeometry() {
  return merge([
    part(new THREE.IcosahedronGeometry(1, 1), 0, 0, 0, 0xffffff),
    part(new THREE.IcosahedronGeometry(0.75, 1), -1.1, -0.2, 0.1, 0xf2f8ff),
    part(new THREE.IcosahedronGeometry(0.8, 1), 1.1, -0.25, 0.1, 0xf2f8ff),
    part(new THREE.IcosahedronGeometry(0.72, 1), 0.5, 0.45, -0.2, 0xffffff),
    part(new THREE.IcosahedronGeometry(0.6, 1), -0.55, 0.35, -0.1, 0xffffff),
  ]);
}

// A floating island: grass on top, a rock hanging below, a little tree.
function islandGeometry() {
  const rock = new THREE.ConeGeometry(1, 1.7, 6);
  rock.rotateX(Math.PI);
  return merge([
    part(rock, 0, -1.0, 0, 0xb07a4a),
    part(new THREE.CylinderGeometry(1.0, 1.0, 0.25, 6), 0, -0.22, 0, 0x8a5a36),
    part(new THREE.CylinderGeometry(1.1, 1.02, 0.28, 6), 0, 0, 0, 0x86d65c),
    part(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5), 0.35, 0.38, 0, 0x7a5232),
    part(new THREE.IcosahedronGeometry(0.42, 0), 0.35, 0.85, 0, 0x3fae55),
    part(new THREE.IcosahedronGeometry(0.28, 0), -0.4, 0.3, 0.3, 0x5cc66a),
  ]);
}

// The ground the pipes stand on: striped grass with a darker lip, tufts and
// flowers. Its pattern repeats every LEDGE_PERIOD units.
function ledgeGeometry() {
  const depth = LEDGE_FRONT - LEDGE_BACK;
  const midZ = (LEDGE_FRONT + LEDGE_BACK) / 2;
  const parts = [];
  for (let i = 0; i < LEDGE_LEN; i++) {
    parts.push(box(1, 0.3, depth, LEDGE_FROM + i + 0.5, -0.15, midZ, i % 2 === 0 ? 0x7fd957 : 0x6ccb4a));
  }
  const center = LEDGE_FROM + LEDGE_LEN / 2;
  parts.push(box(LEDGE_LEN, 0.4, 0.36, center, -0.14, LEDGE_FRONT, 0x4aa338)); // lip
  parts.push(box(LEDGE_LEN, 6, depth, center, -3.3, midZ - 0.1, 0xdcb36c)); // dirt
  parts.push(box(LEDGE_LEN, 0.16, 0.06, center, -0.56, LEDGE_FRONT - 0.12, 0xc4934f)); // dirt band

  const tufts = [0.6, 2.8, 5.1, 6.7];
  const flowers = [1.8, 4.2, 7.4];
  const flowerZ = [-3.6, -1.8, 0.7];
  const petals = [0xffffff, 0xff7aa8, 0xffe04a];
  for (let p = LEDGE_FROM; p < LEDGE_FROM + LEDGE_LEN; p += LEDGE_PERIOD) {
    for (let t = 0; t < tufts.length; t++) {
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.ConeGeometry(0.1, 0.42 - k * 0.08, 4);
        blade.rotateZ((k - 1) * 0.35);
        parts.push(part(blade, p + tufts[t] + (k - 1) * 0.14, 0.18, LEDGE_FRONT - 0.5, 0x4fb83a));
      }
    }
    for (let f = 0; f < flowers.length; f++) {
      parts.push(box(0.05, 0.3, 0.05, p + flowers[f], 0.15, flowerZ[f], 0x3f9a34));
      parts.push(part(new THREE.IcosahedronGeometry(0.13, 0), p + flowers[f], 0.34, flowerZ[f], petals[f]));
    }
  }
  return merge(parts);
}

// One InstancedMesh of `count` pieces spread over `span` units around x = 0.
// place(item) picks a new y, z, scale and turn for a piece when it wraps.
function createLayer(scene, geometry, material, count, span, factor, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  scene.add(mesh);

  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const sx = new Float32Array(count);
  const sy = new Float32Array(count);
  const sz = new Float32Array(count);
  const turn = new Float32Array(count);
  const item = { y: 0, z: 0, sx: 1, sy: 1, sz: 1, turn: 0 };
  const dummy = new THREE.Object3D();

  function respawn(i) {
    place(item);
    y[i] = item.y;
    z[i] = item.z;
    sx[i] = item.sx;
    sy[i] = item.sy;
    sz[i] = item.sz;
    turn[i] = item.turn;
  }

  function write() {
    for (let i = 0; i < count; i++) {
      dummy.position.set(x[i], y[i], z[i]);
      dummy.rotation.y = turn[i];
      dummy.scale.set(sx[i], sy[i], sz[i]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  for (let i = 0; i < count; i++) {
    x[i] = -span / 2 + ((i + Math.random() * 0.7) * span) / count;
    respawn(i);
  }
  write();

  return {
    update(move) {
      if (move === 0) return;
      const m = move * factor;
      for (let i = 0; i < count; i++) {
        x[i] -= m;
        if (x[i] < -span / 2) {
          x[i] += span;
          respawn(i);
        }
      }
      write();
    },
  };
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// widen: how much wider the view is than on the 3:2 screen (1 or more). Each
// layer of scenery is that much wider, with as many more pieces, so wide
// screens show the same density of scenery and nothing wraps in view.
export function createWorld(scene, widen = 1) {
  const sky = new THREE.Mesh(skyGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  sky.position.z = -78; // inside the camera's far distance even at the top corners
  scene.add(sky);

  const material = lowPoly();
  // Clouds get a bluish glow so their shaded sides stay light.
  const cloudMaterial = lowPoly();
  cloudMaterial.emissive.setHex(0x5d6a80);
  const cloud = cloudGeometry();

  const peaks = createLayer(scene, peakGeometry(), material, Math.round(7 * widen), 136 * widen, 0.08, (p) => {
    const r = rand(9, 14);
    p.y = -10;
    p.z = rand(-66, -58);
    p.sx = r;
    p.sy = rand(13, 21);
    p.sz = r;
    p.turn = rand(0, 1);
  });

  // The sea of clouds around the horizon.
  const bank = createLayer(scene, cloud, cloudMaterial, Math.round(12 * widen), 124 * widen, 0.2, (p) => {
    p.y = rand(-5, -2.5);
    p.z = rand(-48, -40);
    p.sx = rand(5, 8);
    p.sy = rand(2.6, 3.6);
    p.sz = 4;
    p.turn = rand(-0.3, 0.3);
  });

  const islands = createLayer(scene, islandGeometry(), material, Math.round(5 * widen), 66 * widen, 0.9, (p) => {
    const s = rand(0.8, 1.4);
    p.y = rand(-1.5, 4.5);
    p.z = rand(-26, -18);
    p.sx = s;
    p.sy = s;
    p.sz = s;
    p.turn = rand(0, Math.PI);
  });

  const clouds = createLayer(scene, cloud, cloudMaterial, Math.round(7 * widen), 78 * widen, 0.45, (p) => {
    const s = rand(1.8, 3);
    p.y = rand(10, 17);
    p.z = rand(-30, -16);
    p.sx = s;
    p.sy = s * 0.72;
    p.sz = s * 0.8;
    p.turn = rand(-0.4, 0.4);
  });

  const ledge = new THREE.Mesh(ledgeGeometry(), material);
  scene.add(ledge);
  let scrolled = 0;

  return {
    // Moves the scenery left by `move` world units (the speed of the pipes).
    update(move) {
      if (move === 0) return;
      scrolled = (scrolled + move) % LEDGE_PERIOD;
      ledge.position.x = -scrolled;
      peaks.update(move);
      bank.update(move);
      islands.update(move);
      clouds.update(move);
    },
  };
}
