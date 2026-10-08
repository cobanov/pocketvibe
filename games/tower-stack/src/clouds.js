// Clouds: a bank around the foot of the tower and a few loose ones drifting
// behind it at different heights (the farther ones sink more slowly as the
// camera climbs, for depth). All of them are one InstancedMesh of a low-poly
// puff, tinted by the sky.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint } from './shared.js';

const BANK = 34;
const LOOSE = 12;
// Turns a puff's long side to face the camera, so it shows wide on screen.
const FACING = Math.PI / 4;

// Screen axes on the ground: RIGHT runs left to right across the screen, BACK
// away from the camera (which looks along -x -z).
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const BACK = new THREE.Vector3(-1, 0, -1).normalize();

function puffGeometry() {
  const blobs = [
    [0, 0, 0, 1],
    [0.95, -0.18, 0.1, 0.74],
    [-0.9, -0.22, -0.05, 0.68],
    [0.38, 0.36, -0.22, 0.66],
    [-0.36, 0.28, 0.26, 0.6],
  ];
  const parts = blobs.map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z));
  const g = mergeGeometries(parts);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  g.scale(1, 0.7, 0.8);
  return paint(g, 0xffffff, 0xaebdd8);
}

// Small deterministic random, so the bank looks the same every time.
let seed = 5;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

export function createClouds(scene, cosE, sinE, viewW, viewH) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(puffGeometry(), material, BANK + LOOSE);
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
  // so on screen they line up behind the front ones.
  for (let i = 0; i < BANK; i++) {
    const row = i % 3;
    const b = [6, -1, -8][row];
    const screenY = [-3.9, -4.3, -4.9][row]; // offset on screen from the pedestal top
    const y = (screenY - b * sinE) / cosE + (rand() - 0.5) * 0.5;
    const u = -40 + (i / BANK) * 80 + (rand() - 0.5) * 3;
    const s = 1.5 + rand() * 1.1;
    put(i, u, b, y, s, 1.15 + rand() * 0.5, FACING + (rand() - 0.5) * 0.6);
  }

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
    lr[i] = FACING + (rand() - 0.5) * 0.6;
    lv[i] = (0.12 + rand() * 0.3) * (rand() < 0.5 ? -1 : 1);
  }

  const emissive = new THREE.Color();

  return {
    // Drifts the loose clouds and tints them all with the sky.
    update(dt, camY, zoom, tint) {
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
        put(BANK + i, lu[i], lb[i], ly[i] + camY * lp[i], ls[i], lst[i], lr[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
