// Things to grab: golden stars (one InstancedMesh, a small pool) and the rare
// propeller cap that carries the climber up for a few seconds.

import * as THREE from 'three';
import { BODY_H, lowPoly, wrapDx } from './shared.js';
import { bladeGeometry, capGeometry, starGeometry } from './models.js';

const MAX_STARS = 14;
const STAR_REACH = 0.55; // horizontal pickup distance
const CAP_REACH = 0.7;

export function createPickups(scene) {
  const starMesh = new THREE.InstancedMesh(
    starGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6a4a00 }),
    MAX_STARS,
  );
  starMesh.frustumCulled = false;
  starMesh.count = 0;
  scene.add(starMesh);

  const stars = [];
  for (let i = 0; i < MAX_STARS; i++) stars.push({ active: false, x: 0, y: 0, t: 0 });

  // The cap waiting on a cloud: two plain meshes, there is only ever one.
  const capMaterial = lowPoly(0x202020);
  const cap = new THREE.Group();
  const blades = new THREE.Mesh(bladeGeometry(), capMaterial);
  blades.position.y = 0.38;
  cap.add(new THREE.Mesh(capGeometry(), capMaterial), blades);
  cap.scale.setScalar(1.5); // bigger than when worn, so it catches the eye
  cap.visible = false;
  scene.add(cap);
  const capItem = { active: false, x: 0, y: 0, t: 0 };

  const dummy = new THREE.Object3D();
  let clock = 0;

  return {
    // Set by collect(): where the last thing grabbed was.
    hitX: 0,
    hitY: 0,

    clear() {
      for (let i = 0; i < MAX_STARS; i++) stars[i].active = false;
      capItem.active = false;
      cap.visible = false;
      starMesh.count = 0;
    },

    addStar(x, y) {
      for (let i = 0; i < MAX_STARS; i++) {
        const s = stars[i];
        if (s.active) continue;
        s.active = true;
        s.x = x;
        s.y = y;
        s.t = Math.random() * 6;
        return;
      }
    },

    // Puts the cap on a cloud top at (x, y). Returns false if one is out already.
    addCap(x, y) {
      if (capItem.active) return false;
      capItem.active = true;
      capItem.x = x;
      capItem.y = y;
      capItem.t = 0;
      return true;
    },

    // Checks the climber's box (feet at y) against the pickups. Returns
    // 0 for nothing, 1 for a star, 2 for the cap.
    collect(x, y) {
      for (let i = 0; i < MAX_STARS; i++) {
        const s = stars[i];
        if (!s.active) continue;
        if (Math.abs(wrapDx(s.x, x)) < STAR_REACH && y < s.y + 0.35 && y + BODY_H > s.y - 0.35) {
          s.active = false;
          this.hitX = s.x;
          this.hitY = s.y;
          return 1;
        }
      }
      if (capItem.active && Math.abs(wrapDx(capItem.x, x)) < CAP_REACH && y < capItem.y + 0.9 && y + BODY_H > capItem.y) {
        capItem.active = false;
        cap.visible = false;
        this.hitX = capItem.x;
        this.hitY = capItem.y + 0.3;
        return 2;
      }
      return 0;
    },

    update(dt, bottom, top) {
      clock += dt;
      let n = 0;
      for (let i = 0; i < MAX_STARS; i++) {
        const s = stars[i];
        if (!s.active) continue;
        if (s.y < bottom - 1) {
          s.active = false;
          continue;
        }
        s.t += dt;
        if (s.y > top + 1) continue;
        // Spins on the spot with a gentle bob and a little pulse.
        dummy.position.set(s.x, s.y + Math.sin(s.t * 3) * 0.08, 0.1);
        dummy.rotation.set(0, s.t * 2.6, 0);
        dummy.scale.setScalar(1 + Math.sin(s.t * 6) * 0.06);
        dummy.updateMatrix();
        starMesh.setMatrixAt(n++, dummy.matrix);
      }
      starMesh.count = n;
      starMesh.instanceMatrix.needsUpdate = true;

      if (capItem.active && capItem.y < bottom - 1) capItem.active = false;
      cap.visible = capItem.active;
      if (capItem.active) {
        capItem.t += dt;
        cap.position.set(capItem.x, capItem.y + 0.12 + Math.abs(Math.sin(capItem.t * 4)) * 0.18, 0.1);
        cap.rotation.set(0, Math.sin(clock * 1.5) * 0.5, Math.sin(clock * 4) * 0.08);
        blades.rotation.y = clock * 9;
      }
    },
  };
}
