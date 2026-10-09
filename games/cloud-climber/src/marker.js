// Bunting strung across the column at the best height so far, so the climber
// can see the record coming. It flutters when the climber passes it.

import * as THREE from 'three';
import { COL_W } from './shared.js';
import { buntingGeometry } from './models.js';

export function createMarker(scene) {
  const mesh = new THREE.Mesh(buntingGeometry(COL_W), new THREE.MeshBasicMaterial({ vertexColors: true }));
  mesh.visible = false;
  scene.add(mesh);
  let waveT = 9;
  let clock = 0;

  return {
    // At height y, or hidden if y <= 0.
    place(y) {
      mesh.visible = y > 0;
      mesh.position.set(0, y, -0.2);
      mesh.rotation.set(0, 0, 0);
      waveT = 9;
    },

    hide() {
      mesh.visible = false;
    },

    wave() {
      waveT = 0;
    },

    update(dt) {
      if (!mesh.visible) return;
      clock += dt;
      waveT += dt;
      // A gentle sway, and a shake that dies away after the climber passes.
      const shake = waveT < 1.2 ? Math.sin(waveT * 30) * 0.08 * (1 - waveT / 1.2) : 0;
      mesh.rotation.x = Math.sin(clock * 2) * 0.12 + shake * 3;
      mesh.scale.y = 1 + shake;
    },
  };
}
