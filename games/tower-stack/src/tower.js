// The placed layers: one InstancedMesh of unit boxes, scaled and tinted per
// instance. Layer 0 is the tall pedestal, layer n the top of the tower.
// While playing only the top WINDOW layers are drawn (everything below is far
// off the bottom of the screen); for the zoom out at the end the whole tower
// is written out once.

import * as THREE from 'three';
import { LH, MAX_LAYERS, PED_H, SIZE, backOut, layerColor } from './shared.js';

const WINDOW = 40;
const LAND_TIME = 0.3; // squash when a slab lands
const FLASH_TIME = 0.4; // white flash on a perfect drop
const DIP = 0.09; // the whole tower sinks this much under a landing slab

export function createTower(scene, geometry) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }), MAX_LAYERS + 1);
  mesh.frustumCulled = false; // the bounds would have to be recomputed as it grows
  mesh.count = 0;
  const color = new THREE.Color();
  mesh.setColorAt(0, color); // creates instanceColor once, up front
  scene.add(mesh);

  const lx = new Float32Array(MAX_LAYERS + 1);
  const lz = new Float32Array(MAX_LAYERS + 1);
  const lw = new Float32Array(MAX_LAYERS + 1);
  const ld = new Float32Array(MAX_LAYERS + 1);
  const cr = new Float32Array(MAX_LAYERS + 1);
  const cg = new Float32Array(MAX_LAYERS + 1);
  const cb = new Float32Array(MAX_LAYERS + 1);

  let n = 0; // layers on top of the pedestal
  let first = 0; // the layer drawn by instance 0
  let all = false; // whole tower drawn (game over)
  let baseHue = 0;
  // Animation of the top layer.
  let landT = LAND_TIME;
  let flashT = FLASH_TIME;
  let fromW = SIZE; // footprint it grows from after a combo
  let fromD = SIZE;
  let dipV = 0;
  let dip = 0;

  const dummy = new THREE.Object3D();
  const white = new THREE.Color(0xffffff);
  // In window mode only the drawn instances are uploaded. The range objects
  // are made once and handed to three.js again each time, so nothing is
  // allocated per frame.
  const matrixRange = { start: 0, count: 0 };
  const colorRange = { start: 0, count: 0 };

  function writeLayer(i) {
    const j = i - first;
    let h = LH;
    let y = (i - 0.5) * LH;
    let w = lw[i];
    let d = ld[i];
    color.setRGB(cr[i], cg[i], cb[i]);
    if (i === 0) {
      h = PED_H;
      y = -PED_H / 2;
    } else if (i === n) {
      // The top layer lands with a squash, grows into its new size after a
      // combo and flashes white on a perfect drop.
      const k = Math.min(1, landT / LAND_TIME);
      const s = 0.55 + 0.45 * backOut(k);
      h = LH * s;
      y = (i - 1) * LH + h / 2;
      const g = backOut(k);
      w = (fromW + (lw[i] - fromW) * g) * (1 + (1 - s) * 0.25);
      d = (fromD + (ld[i] - fromD) * g) * (1 + (1 - s) * 0.25);
      const f = 1 - Math.min(1, flashT / FLASH_TIME);
      if (f > 0) color.lerp(white, f * f * 0.85);
    }
    dummy.position.set(lx[i], y, lz[i]);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    mesh.setMatrixAt(j, dummy.matrix);
    mesh.setColorAt(j, color);
  }

  function upload() {
    const im = mesh.instanceMatrix;
    const ic = mesh.instanceColor;
    im.needsUpdate = true;
    ic.needsUpdate = true;
    if (all) {
      im.clearUpdateRanges();
      ic.clearUpdateRanges();
      return;
    }
    matrixRange.count = mesh.count * 16;
    colorRange.count = mesh.count * 3;
    if (im.updateRanges.length === 0) im.updateRanges.push(matrixRange);
    if (ic.updateRanges.length === 0) ic.updateRanges.push(colorRange);
  }

  function rewrite() {
    first = all ? 0 : Math.max(0, n + 1 - WINDOW);
    mesh.count = n + 1 - first;
    for (let i = first; i <= n; i++) writeLayer(i);
    upload();
  }

  function setLayer(i, x, z, w, d) {
    lx[i] = x;
    lz[i] = z;
    lw[i] = w;
    ld[i] = d;
    layerColor(i, baseHue, color);
    cr[i] = color.r;
    cg[i] = color.g;
    cb[i] = color.b;
  }

  return {
    get n() {
      return n;
    },
    get topX() {
      return lx[n];
    },
    get topZ() {
      return lz[n];
    },
    get topW() {
      return lw[n];
    },
    get topD() {
      return ld[n];
    },
    // Height of the top face.
    get height() {
      return n * LH;
    },
    get full() {
      return n >= MAX_LAYERS;
    },

    // A fresh tower: just the pedestal, in a new set of colours.
    reset(hue) {
      baseHue = hue;
      n = 0;
      all = false;
      landT = LAND_TIME;
      flashT = FLASH_TIME;
      dip = 0;
      dipV = 0;
      setLayer(0, 0, 0, SIZE, SIZE);
      rewrite();
    },

    // The colour layer i has (or will have) in this run.
    colorOf(i, out) {
      return layerColor(i, baseHue, out);
    },

    // A new top layer. (gw, gd) is the footprint it grew from (the same as
    // (w, d) unless a combo grew it back).
    add(x, z, w, d, perfect, gw, gd) {
      n++;
      setLayer(n, x, z, w, d);
      landT = 0;
      flashT = perfect ? 0 : FLASH_TIME;
      fromW = gw;
      fromD = gd;
      dipV = -DIP * 14;
      // Past the window every instance moves down a slot; otherwise only the
      // new one needs writing.
      if (all || n + 1 - first > WINDOW) rewrite();
      else {
        mesh.count = n + 1 - first;
        writeLayer(n);
        if (n > 1) writeLayer(n - 1); // the previous top ends its animation at rest
        upload();
      }
    },

    // true: draw every layer (for the zoom out); false: only the top window.
    showAll(on) {
      if (on === all) return;
      all = on;
      rewrite();
    },

    update(dt) {
      // A small spring: the tower dips under the landing slab and recovers.
      dipV += (-dip * 260 - dipV * 16) * dt;
      dip += dipV * dt;
      mesh.position.y = dip;
      if (landT < LAND_TIME || flashT < FLASH_TIME) {
        landT += dt;
        flashT += dt;
        writeLayer(n);
        upload();
      }
    },
  };
}
