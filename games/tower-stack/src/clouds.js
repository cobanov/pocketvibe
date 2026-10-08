// Clouds: a bank around the foot of the tower and a few loose ones drifting
// behind it at different heights (the farther ones sink more slowly as the
// camera climbs, for depth). All of them are one InstancedMesh of a low-poly
// puff, tinted by the sky. Only the bank puffs inside the view are drawn.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from './shared.js';

const BANK = 34;
const LOOSE = 12;
// Turns a puff's long side to face the camera, so it shows wide on screen.
const FACING = Math.PI / 4;
const TURN = 0.3; // each puff is turned up to this much more either way
const STRETCH = [1.15, 2]; // and stretched along its length between these
const PUFF_LENGTH = 1.7; // a puff reaches this far either side at scale 1

// Screen axes on the ground: RIGHT runs left to right across the screen, BACK
// away from the camera (which looks along -x -z).
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const BACK = new THREE.Vector3(-1, 0, -1).normalize();

const PUFF_SCALE = [1, 0.7, 0.8];

// The puff is five overlapping blobs. The camera is orthographic at a fixed
// angle and puffs only turn a little, so two kinds of triangles can never be
// seen and are left out (400 triangles become about 170): those inside
// another blob, and those facing away from the camera however the puff is
// turned and stretched.
function puffGeometry(cosE, sinE) {
  const blobs = [
    [0, 0, 0, 1],
    [0.95, -0.18, 0.1, 0.74],
    [-0.9, -0.22, -0.05, 0.68],
    [0.38, 0.36, -0.22, 0.66],
    [-0.36, 0.28, 0.26, 0.6],
  ];
  // A point closer than this to a blob's centre (times its radius) is inside
  // its 80-face polyhedron, not just inside its sphere.
  const INNER = 0.93;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const inside = (v, q) => v.distanceTo(centre.set(blobs[q][0], blobs[q][1], blobs[q][2])) < blobs[q][3] * INNER;
  // The colours run from top to bottom of the whole puff, as before the
  // hidden triangles went.
  const box = new THREE.Box3();
  const parts = blobs.map(([x, y, z, r], p) => {
    const src = new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
    src.computeBoundingBox();
    box.union(src.boundingBox);
    const pos = src.attributes.position;
    const nor = src.attributes.normal;
    const keepPos = [];
    const keepNor = [];
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t);
      b.fromBufferAttribute(pos, t + 1);
      c.fromBufferAttribute(pos, t + 2);
      let hidden = false;
      for (let q = 0; q < blobs.length && !hidden; q++) hidden = q !== p && inside(a, q) && inside(b, q) && inside(c, q);
      if (hidden || !canFace(n.subVectors(c, b).cross(a.sub(b)), cosE, sinE)) continue;
      for (let k = 0; k < 3; k++) {
        keepPos.push(pos.getX(t + k), pos.getY(t + k), pos.getZ(t + k));
        keepNor.push(nor.getX(t + k), nor.getY(t + k), nor.getZ(t + k));
      }
    }
    src.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(keepPos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(keepNor, 3));
    return g;
  });
  const g = mergeGeometries(parts);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  g.scale(PUFF_SCALE[0], PUFF_SCALE[1], PUFF_SCALE[2]);
  box.min.multiplyScalar(PUFF_SCALE[1]); // only y matters for the colours
  box.max.multiplyScalar(PUFF_SCALE[1]);
  return paint(g, 0xffffff, 0xaebdd8, box);
}

// Whether a face with normal n (in the blob's own space) can face the camera
// for some turn of the puff within TURN and some stretch along its length. A
// normal is carried through a scale by the inverse scale; the camera's
// direction, seen from a puff turned FACING + t, is (-cosE sin t, sinE,
// cosE cos t).
function canFace(n, cosE, sinE) {
  for (let i = -8; i <= 8; i++) {
    const t = (TURN * i) / 8;
    for (let s = STRETCH[0]; s <= STRETCH[1] + 1e-6; s += (STRETCH[1] - STRETCH[0]) / 6) {
      const dot =
        (n.x / (PUFF_SCALE[0] * s)) * -cosE * Math.sin(t) + (n.y / PUFF_SCALE[1]) * sinE + (n.z / PUFF_SCALE[2]) * cosE * Math.cos(t);
      if (dot > -0.02) return true;
    }
  }
  return false;
}

// Small deterministic random, so the bank looks the same every time.
let seed = 5;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

export function createClouds(scene, cosE, sinE, viewW, viewH) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(puffGeometry(cosE, sinE), material, BANK + LOOSE);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const dummy = new THREE.Object3D();

  // World position from screen-ish coordinates: u across the screen, b away
  // from the camera, y up.
  function put(i, u, b, y, s, stretch, rot) {
    dummy.position.copy(RIGHT).multiplyScalar(u).addScaledVector(BACK, b);
    dummy.position.y = y;
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(s * stretch, s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  // The bank: three rows below the pedestal top, placed so that they show as
  // a band along the bottom of the first screen. Rows further back sit lower,
  // so on screen they line up behind the front ones. The loose clouds come
  // first in the mesh, then the bank from the middle outwards, so drawing
  // fewer instances leaves out the bank puffs furthest to the sides.
  const bank = [];
  for (let i = 0; i < BANK; i++) {
    const row = i % 3;
    const b = [6, -1, -8][row];
    const screenY = [-3.9, -4.3, -4.9][row]; // offset on screen from the pedestal top
    const y = (screenY - b * sinE) / cosE + (rand() - 0.5) * 0.5;
    const u = -40 + (i / BANK) * 80 + (rand() - 0.5) * 3;
    const s = 1.5 + rand() * 1.1;
    const stretch = 1.15 + rand() * 0.5;
    // Last: how far from the middle of the screen its nearer end is.
    bank.push([u, b, y, s, stretch, FACING + (rand() - 0.5) * TURN * 2, Math.abs(u) - PUFF_LENGTH * s * stretch]);
  }
  bank.sort((p, q) => p[6] - q[6]);
  const bankNear = new Float32Array(BANK);
  for (let i = 0; i < BANK; i++) {
    const [u, b, y, s, stretch, rot, near] = bank[i];
    put(LOOSE + i, u, b, y, s, stretch, rot);
    bankNear[i] = near;
  }
  // After the first upload only the loose clouds are sent again.
  const looseRange = { start: 0, count: LOOSE * 16 };

  // Loose clouds behind the tower.
  const lu = new Float32Array(LOOSE);
  const lb = new Float32Array(LOOSE);
  const ly = new Float32Array(LOOSE); // height at camera height 0
  const lp = new Float32Array(LOOSE); // how much they rise with the camera (0 = not at all)
  const ls = new Float32Array(LOOSE);
  const lst = new Float32Array(LOOSE);
  const lr = new Float32Array(LOOSE);
  const lv = new Float32Array(LOOSE);
  for (let i = 0; i < LOOSE; i++) {
    lu[i] = (rand() - 0.5) * viewW * 1.6;
    lb[i] = 9 + rand() * 14;
    lp[i] = 0.25 + rand() * 0.4;
    ly[i] = 2 + (i / LOOSE) * 22 + rand() * 2;
    ls[i] = 0.4 + rand() * 0.55;
    lst[i] = 1.2 + rand() * 0.8;
    lr[i] = FACING + (rand() - 0.5) * TURN * 2;
    lv[i] = (0.12 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1);
  }

  const emissive = new THREE.Color();

  return {
    // Drifts the loose clouds and tints them all with the sky. camU is how
    // far right of the tower's axis the view is centred.
    update(dt, camY, camU, zoom, tint) {
      material.color.copy(tint);
      material.emissive.copy(emissive.copy(tint).multiplyScalar(0.3));

      const halfW = viewW / 2 / zoom + 4;
      const halfH = viewH / 2 / zoom + 2;
      for (let i = 0; i < LOOSE; i++) {
        lu[i] += lv[i] * dt;
        if (lu[i] > halfW) lu[i] -= halfW * 2;
        else if (lu[i] < -halfW) lu[i] += halfW * 2;
        // Keep each cloud within a screen height above or below the view:
        // whatever leaves it comes back in on the other side.
        const y = ly[i] + camY * lp[i];
        const onScreen = (y - camY) * cosE + lb[i] * sinE;
        if (onScreen < -halfH) {
          ly[i] += (halfH * 2) / cosE;
          lu[i] = (rand() - 0.5) * halfW * 2;
        } else if (onScreen > halfH) {
          ly[i] -= (halfH * 2) / cosE;
        }
        put(i, lu[i], lb[i], ly[i] + camY * lp[i], ls[i], lst[i], lr[i]);
      }
      // The bank's tops are about 1.5 units below the pedestal top on
      // screen; once the bottom of the view (with its margin) has climbed
      // past that, none of it is drawn. Otherwise only the puffs that reach
      // into the view's width.
      let shown = 0;
      if (camY * cosE - halfH < 0) {
        const reach = halfW + Math.abs(camU);
        while (shown < BANK && bankNear[shown] < reach) shown++;
      }
      mesh.count = LOOSE + shown;
      const im = mesh.instanceMatrix;
      if (im.updateRanges.length === 0) im.updateRanges.push(looseRange);
      im.needsUpdate = true;
    },
  };
}
