// The sky behind the well: a gradient that changes colour with every level and
// a few big blocks drifting upwards in the fog.

import * as THREE from 'three';
import { PIECE_HEX, bevelBox } from './shared.js';

// Top and bottom colour of the sky for each level, repeating.
const THEMES = [
  [0x3b2f92, 0xe8729f], // indigo to pink
  [0x14507e, 0x45cfae], // deep sea to mint
  [0x2a1f62, 0xf3a04a], // night to orange
  [0x5a2a86, 0x58b9f2], // purple to sky
  [0x18493c, 0xb4d94c], // forest to lime
  [0x6c1d44, 0xf5c94a], // wine to gold
];
const FLOATERS = 18;

export function createBackdrop(scene) {
  const plane = new THREE.PlaneGeometry(120, 80);
  const colors = new Float32Array(plane.attributes.position.count * 3);
  plane.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }));
  sky.position.z = -48;
  sky.renderOrder = -1;
  scene.add(sky);

  const floaters = new THREE.InstancedMesh(bevelBox(1, 1, 1, 0.18), new THREE.MeshLambertMaterial(), FLOATERS);
  floaters.frustumCulled = false; // instances move
  scene.add(floaters);

  const fx = new Float32Array(FLOATERS);
  const fy = new Float32Array(FLOATERS);
  const fz = new Float32Array(FLOATERS);
  const speed = new Float32Array(FLOATERS);
  const spin = new Float32Array(FLOATERS);
  const size = new Float32Array(FLOATERS);
  const tint = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < FLOATERS; i++) {
    fx[i] = (i / FLOATERS - 0.5) * 64 + Math.random() * 3;
    fy[i] = Math.random() * 52 - 26;
    fz[i] = -12 - Math.random() * 20;
    speed[i] = 0.6 + Math.random() * 0.9;
    spin[i] = 0.2 + Math.random() * 0.5;
    size[i] = 1.6 + Math.random() * 1.6;
    floaters.setColorAt(i, tint.setHex(PIECE_HEX[1 + (i % 7)]).lerp(white, 0.35));
  }

  const top = new THREE.Color(THEMES[0][0]);
  const bottom = new THREE.Color(THEMES[0][1]);
  const topTarget = new THREE.Color().copy(top);
  const bottomTarget = new THREE.Color().copy(bottom);
  const fogColor = new THREE.Color();
  const dummy = new THREE.Object3D();
  let time = 0;

  function paintSky() {
    const pos = plane.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const c = pos.getY(i) > 0 ? top : bottom;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    plane.attributes.color.needsUpdate = true;
    fogColor.copy(top).lerp(bottom, 0.55);
    scene.fog.color.copy(fogColor);
  }

  return {
    // Switches the sky to the colours of a level (eases over a second).
    theme(level, instant) {
      const t = THEMES[(level - 1) % THEMES.length];
      topTarget.setHex(t[0]);
      bottomTarget.setHex(t[1]);
      if (instant) {
        top.copy(topTarget);
        bottom.copy(bottomTarget);
        paintSky();
      }
    },

    update(dt) {
      time += dt;
      if (!top.equals(topTarget) || !bottom.equals(bottomTarget)) {
        const k = Math.min(1, dt * 2.5);
        top.lerp(topTarget, k);
        bottom.lerp(bottomTarget, k);
        // Snap once close, so the sky stops being repainted.
        if (Math.abs(top.r - topTarget.r) + Math.abs(top.g - topTarget.g) + Math.abs(top.b - topTarget.b) < 0.002) {
          top.copy(topTarget);
          bottom.copy(bottomTarget);
        }
        paintSky();
      }

      for (let i = 0; i < FLOATERS; i++) {
        fy[i] += speed[i] * dt;
        if (fy[i] > 28) fy[i] -= 56;
        dummy.position.set(fx[i] + Math.sin(time * 0.3 + i) * 1.5, fy[i], fz[i]);
        dummy.rotation.set(time * spin[i] + i, time * spin[i] * 0.7, i * 0.5);
        dummy.scale.setScalar(size[i]);
        dummy.updateMatrix();
        floaters.setMatrixAt(i, dummy.matrix);
      }
      floaters.instanceMatrix.needsUpdate = true;
    },
  };
}
