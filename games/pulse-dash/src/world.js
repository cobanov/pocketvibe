// The track: the glowing grid floor (with gaps), the obstacles and the
// finish gate. Every kind of thing is one InstancedMesh, and each frame only
// the things near the camera are written into it. Shapes are baked in grey
// vertex colours; the level's neon colour comes from the material, so a new
// level is only a colour change, and the beat pulse a brightness change.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAM_Z, PAD_COLOR, RING_COLOR, VIEW_AHEAD, VIEW_BACK, box, glowTexture, paint, quad } from './shared.js';

const FLOOR_DEPTH = 22; // the grid runs back this far
const FLOOR_FRONT = 1.3; // and comes this far towards the camera
const FLOOR_SPAN = 27; // columns drawn on each side on a 3:2 screen: the far floor is wide
const MAX_BLOCKS = 110;
const MAX_PILLARS = 60;
const MAX_SPIKES = 70;
const MAX_PADS = 10;
const MAX_RINGS = 12;
const MAX_LEVEL_ITEMS = 128; // rings or pads in one whole level, for their flash timers
const DIM = 0x3c3c3c;

function floorGeometry() {
  const parts = [
    quad(1, FLOOR_DEPTH + FLOOR_FRONT, 0, 0, (FLOOR_FRONT - FLOOR_DEPTH) / 2, 0x141414, true),
    // Grid lines: one along the depth at the column's left edge, and one
    // across every unit of depth.
    quad(0.05, FLOOR_DEPTH + FLOOR_FRONT, -0.5, 0.004, (FLOOR_FRONT - FLOOR_DEPTH) / 2, 0x9a9a9a, true),
    quad(1, 0.12, 0, 0.006, FLOOR_FRONT - 0.06, 0xffffff, true), // the bright front edge
    // The front face, dark, with a bright top line and two dim ones.
    quad(1, 7, 0, -3.5, FLOOR_FRONT, 0x0e0e0e, false),
    quad(1, 0.1, 0, -0.05, FLOOR_FRONT + 0.004, 0xffffff, false),
    quad(1, 0.05, 0, -0.75, FLOOR_FRONT + 0.004, 0x5a5a5a, false),
    quad(1, 0.05, 0, -1.7, FLOOR_FRONT + 0.004, 0x303030, false),
  ];
  for (let z = FLOOR_FRONT - 1; z > -FLOOR_DEPTH; z -= 1) {
    parts.push(quad(1, 0.05, 0, 0.004, z, z > -6 ? 0x9a9a9a : 0x6a6a6a, true));
  }
  return mergeGeometries(parts);
}

// A dark cube with a bright frame on its front face and lit top edges.
function blockGeometry() {
  const t = 0.08;
  const f = 0.52; // the frame stands a little proud of the face
  return mergeGeometries([
    box(0.98, 0.98, 0.98, 0, 0, 0, 0x1c1c1c),
    box(1, t, 0.04, 0, 0.5 - t / 2, f, 0xffffff),
    box(1, t, 0.04, 0, -0.5 + t / 2, f, 0xffffff),
    box(t, 1, 0.04, -0.5 + t / 2, 0, f, 0xffffff),
    box(t, 1, 0.04, 0.5 - t / 2, 0, f, 0xffffff),
    box(0.5, 0.05, 0.03, 0, 0.25, f, DIM), // a small inner square
    box(0.5, 0.05, 0.03, 0, -0.25, f, DIM),
    box(0.05, 0.5, 0.03, -0.25, 0, f, DIM),
    box(0.05, 0.5, 0.03, 0.25, 0, f, DIM),
    box(0.06, 0.06, 1, -0.5, 0.5, 0, 0xb0b0b0), // top edges, seen from above
    box(0.06, 0.06, 1, 0.5, 0.5, 0, 0xb0b0b0),
    box(1, 0.06, 0.06, 0, 0.5, -0.5, 0x6a6a6a),
  ]);
}

// One cell of a pillar: rails up the front edges and a dim band.
function pillarGeometry() {
  const f = 0.52;
  return mergeGeometries([
    box(0.94, 1, 0.94, 0, 0, 0, 0x1a1a1a),
    box(0.1, 1, 0.04, -0.45, 0, f, 0xffffff),
    box(0.1, 1, 0.04, 0.45, 0, f, 0xffffff),
    box(0.8, 0.05, 0.03, 0, 0, f, 0x505050),
    box(0.06, 1, 0.06, -0.47, 0, -0.47, 0x6a6a6a),
    box(0.06, 1, 0.06, 0.47, 0, -0.47, 0x6a6a6a),
  ]);
}

// The bright slab on top of a pillar.
function capGeometry() {
  return mergeGeometries([
    box(1.06, 0.16, 1.06, 0, 0.42, 0, 0xffffff),
    box(0.9, 0.05, 0.03, 0, 0.26, 0.53, 0x9a9a9a),
  ]);
}

// A square pyramid, faceted, brightest at the tip and on the front face.
function spikeGeometry() {
  const h = 0.92;
  let g = new THREE.ConeGeometry(0.6, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.translate(0, h / 2 - 0.5, 0); // base on the cell's floor, centred in the cell
  g.deleteAttribute('uv');
  g = g.toNonIndexed();
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const up = (pos.getY(i) + 0.5) / h;
    const nz = nor.getZ(i);
    const shade = nor.getY(i) < -0.9 ? 0.1 : nz > 0.3 ? 1 : nz < -0.3 ? 0.35 : 0.6;
    const v = (0.22 + 0.78 * up) * shade;
    colors[i * 3] = v;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function padGeometry() {
  const dome = new THREE.SphereGeometry(0.4, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.deleteAttribute('uv');
  dome.scale(1, 0.5, 1);
  dome.translate(0, -0.46, 0);
  return mergeGeometries([paint(dome, PAD_COLOR), box(0.9, 0.08, 0.9, 0, -0.46, 0, 0xb89a1f)]);
}

function ringGeometry() {
  const g = new THREE.TorusGeometry(0.4, 0.075, 6, 18);
  g.deleteAttribute('uv');
  return paint(g, RING_COLOR);
}

// The finish: a doorway facing the camera, filled with an additive curtain
// of light that the cube runs through.
function gateGeometry() {
  return mergeGeometries([
    box(0.16, 8, 0.16, -0.85, 4, -0.6, 0xffffff),
    box(0.16, 8, 0.16, 0.85, 4, -0.6, 0xffffff),
    box(1.86, 0.16, 0.16, 0, 8, -0.6, 0xffffff),
  ]);
}

function curtainGeometry() {
  const g = new THREE.PlaneGeometry(1.54, 8, 1, 1);
  g.deleteAttribute('uv');
  g.translate(0, 4, -0.65);
  // Additive blending: black adds nothing, so the gradient fades upwards.
  const colors = new Float32Array([0, 0, 0, 0, 0, 0, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75]);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function instanced(scene, geometry, material, max) {
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

// halfTan: tan of half the camera's horizontal view. Wide screens see more
// of the far floor at the sides, so it gets more columns there.
export function createWorld(scene, halfTan) {
  const span = Math.max(FLOOR_SPAN, Math.ceil((CAM_Z + FLOOR_DEPTH) * halfTan) + 2);
  const floorMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const blockMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const spikeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const yellowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: RING_COLOR,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const floor = instanced(scene, floorGeometry(), floorMat, span * 2 + 2);
  const blocks = instanced(scene, blockGeometry(), blockMat, MAX_BLOCKS);
  const pillars = instanced(scene, pillarGeometry(), blockMat, MAX_PILLARS);
  const caps = instanced(scene, capGeometry(), blockMat, MAX_PILLARS);
  const spikes = instanced(scene, spikeGeometry(), spikeMat, MAX_SPIKES);
  const pads = instanced(scene, padGeometry(), yellowMat, MAX_PADS);
  const rings = instanced(scene, ringGeometry(), yellowMat, MAX_RINGS);
  const glows = instanced(scene, new THREE.PlaneGeometry(1, 1), glowMat, MAX_RINGS + MAX_PADS);

  const gateMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const gate = new THREE.Mesh(gateGeometry(), gateMat);
  const curtainMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const curtain = new THREE.Mesh(curtainGeometry(), curtainMat);
  scene.add(gate, curtain);

  const main = new THREE.Color();
  const dummy = new THREE.Object3D();
  let L = null;
  const ringFlash = new Float32Array(MAX_LEVEL_ITEMS);
  const padFlash = new Float32Array(MAX_LEVEL_ITEMS);
  let time = 0;

  // Writes the instance at (x, y, 0) with a uniform scale and a z rotation.
  function put(mesh, i, x, y, z, s, rz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, rz);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  return {
    setLevel(level) {
      L = level;
      const p = L.def.palette;
      main.setHex(p.main);
      spikeMat.color.setHex(p.spike);
      gateMat.color.setHex(p.main);
      curtainMat.color.setHex(p.main);
      ringFlash.fill(0);
      padFlash.fill(0);
      gate.position.x = L.endX;
      curtain.position.x = L.endX;
    },

    // Rings and pads light up when used.
    flashRing(i) {
      ringFlash[i] = 1;
    },
    flashPad(i) {
      padFlash[i] = 1;
    },
    clearFlashes() {
      ringFlash.fill(0);
      padFlash.fill(0);
    },

    // camX: the camera's x; pulse: the beat, 0 to 1.
    update(dt, camX, pulse) {
      time += dt;
      floorMat.color.copy(main).multiplyScalar(0.62 + 0.55 * pulse);
      blockMat.color.copy(main).multiplyScalar(0.9 + 0.25 * pulse);

      // Floor: one tile per column, none over a gap.
      const f0 = Math.floor(camX) - span;
      let n = 0;
      for (let c = f0; c <= f0 + span * 2; c++) {
        if (c >= 0 && c < L.cols && L.gap[c] === 1) continue;
        put(floor, n++, c + 0.5, 0, 0, 1, 0);
      }
      floor.count = n;
      floor.instanceMatrix.needsUpdate = true;

      const c0 = Math.max(0, Math.min(L.cols, Math.floor(camX - VIEW_BACK)));
      const c1 = Math.max(0, Math.min(L.cols, Math.floor(camX + VIEW_AHEAD)));

      const b = L.blocks;
      n = 0;
      for (let i = b.start[c0]; i < b.start[c1] && n < MAX_BLOCKS; i++) put(blocks, n++, b.col[i] + 0.5, b.row[i] + 0.5, 0, 1, 0);
      blocks.count = n;
      blocks.instanceMatrix.needsUpdate = true;

      const pl = L.pillars;
      n = 0;
      let nc = 0;
      for (let i = pl.start[c0]; i < pl.start[c1] && n < MAX_PILLARS; i++) {
        put(pillars, n++, pl.col[i] + 0.5, pl.row[i] + 0.5, 0, 1, 0);
        if (pl.cap[i]) put(caps, nc++, pl.col[i] + 0.5, pl.row[i] + 0.5, 0, 1, 0);
      }
      pillars.count = n;
      caps.count = nc;
      pillars.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;

      const sp = L.spikes;
      n = 0;
      for (let i = sp.start[c0]; i < sp.start[c1] && n < MAX_SPIKES; i++) {
        put(spikes, n++, sp.col[i] + 0.5, sp.row[i] + 0.5, 0, 1, sp.dir[i] > 0 ? 0 : Math.PI);
      }
      spikes.count = n;
      spikes.instanceMatrix.needsUpdate = true;

      // Pads and rings breathe with the beat and flash when used; each has
      // a soft glow behind it.
      let ng = 0;
      const pd = L.pads;
      n = 0;
      for (let i = pd.start[c0]; i < pd.start[c1] && n < MAX_PADS; i++) {
        padFlash[i] = Math.max(0, padFlash[i] - dt * 3);
        const s = 1 + 0.12 * pulse + 0.4 * padFlash[i];
        put(pads, n++, pd.col[i] + 0.5, pd.row[i] + 0.5, 0, s, 0);
        put(glows, ng++, pd.col[i] + 0.5, pd.row[i] + 0.15, -0.3, 1.3 + 0.4 * pulse + padFlash[i] * 2, 0);
      }
      pads.count = n;
      pads.instanceMatrix.needsUpdate = true;

      const rg = L.rings;
      n = 0;
      for (let i = rg.start[c0]; i < rg.start[c1] && n < MAX_RINGS; i++) {
        ringFlash[i] = Math.max(0, ringFlash[i] - dt * 2.5);
        const x = rg.col[i] + 0.5;
        const y = rg.row[i] + 0.5;
        dummy.position.set(x, y, 0);
        dummy.rotation.set(0, Math.sin(time * 2 + i) * 0.5, 0);
        dummy.scale.setScalar(1 + 0.1 * pulse + 0.5 * ringFlash[i]);
        dummy.updateMatrix();
        rings.setMatrixAt(n++, dummy.matrix);
        put(glows, ng++, x, y, -0.2, 1.9 + 0.5 * pulse + ringFlash[i] * 2.5, 0);
      }
      rings.count = n;
      rings.instanceMatrix.needsUpdate = true;
      glows.count = ng;
      glows.instanceMatrix.needsUpdate = true;

      const gateNear = Math.abs(L.endX - camX) < 16;
      gate.visible = gateNear;
      curtain.visible = gateNear;
      curtain.scale.y = 0.9 + 0.15 * pulse;
    },
  };
}
