// Things to grab: golden stars (one InstancedMesh, a small pool), the rare
// propeller cap that carries the climber up for a few seconds and, higher
// up, the even rarer rocket that carries it faster and further.

import * as THREE from 'three';
import { BODY_H, lowPoly, wrapDx } from './shared.js';
import { bladeGeometry, capGeometry, flameGeometry, rocketGeometry, starGeometry } from './models.js';
import { CAP, ROCKET } from './player.js';

// What collect() reports.
export const NOTHING = 0;
export const STAR = 3;
export { CAP, ROCKET };

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

  // The cap or the rocket waiting on a cloud: plain meshes, there is only
  // ever one of them out.
  const gearMaterial = lowPoly(0x202020);
  const cap = new THREE.Group();
  const blades = new THREE.Mesh(bladeGeometry(), gearMaterial);
  blades.position.y = 0.38;
  cap.add(new THREE.Mesh(capGeometry(), gearMaterial), blades);
  cap.scale.setScalar(1.5); // bigger than when worn, so they catch the eye
  cap.visible = false;
  const rocket = new THREE.Group();
  const flame = new THREE.Mesh(flameGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }));
  flame.scale.setScalar(0.4);
  rocket.add(new THREE.Mesh(rocketGeometry(), gearMaterial), flame);
  rocket.scale.setScalar(1.35);
  rocket.visible = false;
  scene.add(cap, rocket);
  const item = { active: false, kind: CAP, x: 0, y: 0, t: 0 };

  const dummy = new THREE.Object3D();
  let clock = 0;

  return {
    // Set by collect(): where the last thing grabbed was.
    hitX: 0,
    hitY: 0,

    clear() {
      for (let i = 0; i < MAX_STARS; i++) stars[i].active = false;
      item.active = false;
      cap.visible = false;
      rocket.visible = false;
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

    // Puts the cap or the rocket (CAP or ROCKET) on a cloud top at (x, y).
    // Returns false if one is out already.
    addGear(kind, x, y) {
      if (item.active) return false;
      item.active = true;
      item.kind = kind;
      item.x = x;
      item.y = y;
      item.t = 0;
      return true;
    },

    // Checks the climber's box (feet at y) against the pickups. Returns
    // NOTHING, STAR, CAP or ROCKET.
    collect(x, y) {
      for (let i = 0; i < MAX_STARS; i++) {
        const s = stars[i];
        if (!s.active) continue;
        if (Math.abs(wrapDx(s.x, x)) < STAR_REACH && y < s.y + 0.35 && y + BODY_H > s.y - 0.35) {
          s.active = false;
          this.hitX = s.x;
          this.hitY = s.y;
          return STAR;
        }
      }
      if (item.active && Math.abs(wrapDx(item.x, x)) < CAP_REACH && y < item.y + 0.9 && y + BODY_H > item.y) {
        item.active = false;
        cap.visible = false;
        rocket.visible = false;
        this.hitX = item.x;
        this.hitY = item.y + 0.3;
        return item.kind;
      }
      return NOTHING;
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

      if (item.active && item.y < bottom - 1) item.active = false;
      cap.visible = item.active && item.kind === CAP;
      rocket.visible = item.active && item.kind === ROCKET;
      if (cap.visible) {
        item.t += dt;
        cap.position.set(item.x, item.y + 0.12 + Math.abs(Math.sin(item.t * 4)) * 0.18, 0.1);
        cap.rotation.set(0, Math.sin(clock * 1.5) * 0.5, Math.sin(clock * 4) * 0.08);
        blades.rotation.y = clock * 9;
      } else if (rocket.visible) {
        // Stands on the cloud, rocking, with a little pilot flame.
        item.t += dt;
        rocket.position.set(item.x, item.y + 0.12 + Math.abs(Math.sin(item.t * 3)) * 0.1, 0.1);
        rocket.rotation.set(0, Math.sin(clock * 1.2) * 0.6, Math.sin(clock * 5) * 0.06);
        flame.scale.set(0.4, 0.3 + Math.random() * 0.25, 0.4);
      }
    },
  };
}
