// Scenery: the sky gradient, far peaks, a sea of clouds, floating islands,
// drifting clouds and the grassy ledge at the bottom. Each background layer is
// one InstancedMesh whose pieces wrap around when they leave the left edge;
// layers further back scroll slower (parallax).
//
// The camera only ever sees the scenery from the front, so every piece keeps
// only the triangles that can face it (see keepFacing in shared.js), and the
// clouds also lose the insides of their overlapping balls: the same look with
// about half the triangles.

import * as THREE from 'three';
import { HORIZON, SKY_MID, SKY_TOP, box, keepFacing, lowPoly, merge, part } from './shared.js';

const LEDGE_FROM = -20; // the ledge mesh spans x = -20 .. 28, wide enough for 16:9 screens
const LEDGE_LEN = 48;
const LEDGE_PERIOD = 8; // its pattern repeats every 8 units, so it can wrap
const LEDGE_BACK = -6;
const LEDGE_FRONT = 1.7; // close enough that the lip and the dirt show at the bottom
const SHAKE = 0.3; // how far the screen shake can move the camera

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

// A puffy cloud made of a few low-poly balls (without their hidden insides).
function cloudGeometry() {
  return merge(
    [
      part(new THREE.IcosahedronGeometry(1, 1), 0, 0, 0, 0xffffff),
      part(new THREE.IcosahedronGeometry(0.75, 1), -1.1, -0.2, 0.1, 0xf2f8ff),
      part(new THREE.IcosahedronGeometry(0.8, 1), 1.1, -0.25, 0.1, 0xf2f8ff),
      part(new THREE.IcosahedronGeometry(0.72, 1), 0.5, 0.45, -0.2, 0xffffff),
      part(new THREE.IcosahedronGeometry(0.6, 1), -0.55, 0.35, -0.1, 0xffffff),
    ],
    true,
  );
}

// A floating island: grass on top, a rock hanging below, a little tree.
function islandGeometry() {
  const rock = new THREE.ConeGeometry(1, 1.7, 6);
  rock.rotateX(Math.PI);
  return merge(
    [
      part(rock, 0, -1.0, 0, 0xb07a4a),
      part(new THREE.CylinderGeometry(1.0, 1.0, 0.25, 6), 0, -0.22, 0, 0x8a5a36),
      part(new THREE.CylinderGeometry(1.1, 1.02, 0.28, 6), 0, 0, 0, 0x86d65c),
      part(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5), 0.35, 0.38, 0, 0x7a5232),
      part(new THREE.IcosahedronGeometry(0.42, 0), 0.35, 0.85, 0, 0x3fae55),
      part(new THREE.IcosahedronGeometry(0.28, 0), -0.4, 0.3, 0.3, 0x5cc66a),
    ],
    true,
  );
}

// The ground the pipes stand on: striped grass with a darker lip, tufts and
// flowers. Its pattern repeats every LEDGE_PERIOD units. Of each grass stripe
// only the top shows (the lip hides its front), so it is just that.
function ledgeGeometry() {
  const depth = LEDGE_FRONT - LEDGE_BACK;
  const midZ = (LEDGE_FRONT + LEDGE_BACK) / 2;
  const parts = [];
  for (let i = 0; i < LEDGE_LEN; i++) {
    const top = new THREE.PlaneGeometry(1, depth);
    top.rotateX(-Math.PI / 2);
    parts.push(part(top, LEDGE_FROM + i + 0.5, 0, midZ, i % 2 === 0 ? 0x7fd957 : 0x6ccb4a));
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

function rand(range) {
  return range[0] + Math.random() * (range[1] - range[0]);
}

// Where the camera can be in the own space of a layer's piece, for a piece
// anywhere in the layer: the corners of its ranges (a position enters
// linearly, so corners cover everything between; the camera's shake just
// widens them) at several turns. A face that faces none of them can be
// dropped.
function layerEyes(layer, span, eye) {
  const xs = [-span / 2 - SHAKE, span / 2 + SHAKE];
  const ys = [layer.y[0] - SHAKE, layer.y[1] + SHAKE];
  const eyes = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const size = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const turns = layer.turn[1] - layer.turn[0] > 1 ? 24 : 8;
  for (let k = 0; k <= turns; k++) {
    q.setFromAxisAngle(up, layer.turn[0] + ((layer.turn[1] - layer.turn[0]) * k) / turns);
    for (let c = 0; c < 8 * 4; c++) {
      // Corner c: x from bit 0, y from bit 1, z from bit 2, size from bits 3 and 4.
      at.set(xs[c & 1], ys[(c >> 1) & 1], layer.z[(c >> 2) & 1]);
      size.fromArray(layer.scale((c >> 3) & 1, c >> 4));
      m.compose(at, q, size).invert();
      eyes.push(eye.clone().applyMatrix4(m));
    }
  }
  return eyes;
}

// One InstancedMesh of layer.count pieces spread over layer.span units around
// x = 0, both times widen. A piece that wraps gets a new height (layer.y),
// depth (layer.z), turn and size: layer.scale(a, b) gives its x, y and z
// scale for two random numbers from 0 to 1.
function createLayer(scene, geometry, material, layer, widen, eye) {
  const count = Math.round(layer.count * widen);
  const span = layer.span * widen;
  const mesh = new THREE.InstancedMesh(keepFacing(geometry, layerEyes(layer, span, eye)), material, count);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  scene.add(mesh);

  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const sx = new Float32Array(count);
  const sy = new Float32Array(count);
  const sz = new Float32Array(count);
  const turn = new Float32Array(count);
  const dummy = new THREE.Object3D();

  function respawn(i) {
    const size = layer.scale(Math.random(), Math.random());
    y[i] = rand(layer.y);
    z[i] = rand(layer.z);
    sx[i] = size[0];
    sy[i] = size[1];
    sz[i] = size[2];
    turn[i] = rand(layer.turn);
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
      const m = move * layer.factor;
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

const lerp = (a, b, k) => a + (b - a) * k;

const PEAKS = {
  count: 7,
  span: 136,
  factor: 0.08,
  y: [-10, -10],
  z: [-66, -58],
  turn: [0, 1],
  scale: (a, b) => [lerp(9, 14, a), lerp(13, 21, b), lerp(9, 14, a)],
};

// The sea of clouds around the horizon.
const BANK = {
  count: 12,
  span: 124,
  factor: 0.2,
  y: [-5, -2.5],
  z: [-48, -40],
  turn: [-0.3, 0.3],
  scale: (a, b) => [lerp(5, 8, a), lerp(2.6, 3.6, b), 4],
};

const ISLANDS = {
  count: 5,
  span: 66,
  factor: 0.9,
  y: [-1.5, 4.5],
  z: [-26, -18],
  turn: [0, Math.PI],
  scale: (a) => [lerp(0.8, 1.4, a), lerp(0.8, 1.4, a), lerp(0.8, 1.4, a)],
};

const CLOUDS = {
  count: 7,
  span: 78,
  factor: 0.45,
  y: [10, 17],
  z: [-30, -16],
  turn: [-0.4, 0.4],
  scale: (a) => [lerp(1.8, 3, a), lerp(1.8, 3, a) * 0.72, lerp(1.8, 3, a) * 0.8],
};

// widen: how much wider the view is than on the 3:2 screen (1 or more). Each
// layer of scenery is that much wider, with as many more pieces, so wide
// screens show the same density of scenery and nothing wraps in view.
// eye: where the camera stands (it only shakes a little around it).
export function createWorld(scene, widen, eye) {
  const sky = new THREE.Mesh(skyGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  sky.position.z = -78; // inside the camera's far distance even at the top corners
  // Drawn after the rest of the scenery, so the sky behind it is skipped.
  sky.renderOrder = 1;
  scene.add(sky);

  const material = lowPoly();
  // Clouds get a bluish glow so their shaded sides stay light.
  const cloudMaterial = lowPoly();
  cloudMaterial.emissive.setHex(0x5d6a80);
  const cloud = cloudGeometry();
  const peak = peakGeometry();
  const island = islandGeometry();

  const peaks = createLayer(scene, peak, material, PEAKS, widen, eye);
  const bank = createLayer(scene, cloud, cloudMaterial, BANK, widen, eye);
  const islands = createLayer(scene, island, material, ISLANDS, widen, eye);
  const clouds = createLayer(scene, cloud, cloudMaterial, CLOUDS, widen, eye);
  cloud.dispose();
  peak.dispose();
  island.dispose();

  // The ledge only moves left by up to one pattern, so the camera sees it
  // from x = 0 to LEDGE_PERIOD in its own space.
  const ledgeEyes = [];
  for (const dx of [-SHAKE, LEDGE_PERIOD + SHAKE]) {
    for (const dy of [-SHAKE, SHAKE]) ledgeEyes.push(new THREE.Vector3(eye.x + dx, eye.y + dy, eye.z));
  }
  const full = ledgeGeometry();
  const ledge = new THREE.Mesh(keepFacing(full, ledgeEyes), material);
  full.dispose();
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
