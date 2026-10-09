// Camera framing. Each board is fitted into a rectangle of the screen (under
// the HUD while playing, above the menu on the title screen) by measuring
// its projected corners, then shifted there with a view offset. The camera
// eases from one framing to the next. It also tells the world where the
// camera can be while a board is shown (eyes and frustums), so faces and
// props that can never be seen are left out.

import * as THREE from 'three';
import { PLINTH_H, WALL_H } from './shared.js';

const PITCH = 1.02; // radians above the horizon
const LOOK_Y = 0.2;
const EASE = 6;
export const SWAY = 0.14; // the title screen turns the camera this far each way

export function createView(camera, scene, width, height) {
  const probe = new THREE.PerspectiveCamera(camera.fov, width / height, 0.5, 200);
  const corner = new THREE.Vector3();
  const sin = Math.sin(PITCH);
  const cos = Math.cos(PITCH);
  const cur = { dist: 16, ox: 0, oy: 0, sway: 0 };
  const goal = { dist: 16, ox: 0, oy: 0 };
  const box = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

  // Where the camera can be between the current framing and the new one,
  // swaying or not: six eyes and the six views from them.
  const eyes = [];
  const frustums = [];
  for (let i = 0; i < 6; i++) {
    eyes.push(new THREE.Vector3());
    frustums.push(new THREE.Frustum());
  }
  const look = new THREE.PerspectiveCamera(camera.fov, width / height, 0.5, 200);
  const viewProj = new THREE.Matrix4();
  const sphere = new THREE.Sphere();

  function prepare() {
    for (let i = 0; i < 6; i++) {
      const f = i < 3 ? cur : goal;
      const sway = ((i % 3) - 1) * SWAY;
      look.position.set(Math.sin(sway) * cos * f.dist, sin * f.dist, Math.cos(sway) * cos * f.dist);
      look.lookAt(0, LOOK_Y, 0);
      look.setViewOffset(width, height, f.ox, f.oy, width, height);
      look.far = f.dist * 2.4;
      look.updateProjectionMatrix();
      look.updateMatrixWorld();
      eyes[i].copy(look.position);
      viewProj.multiplyMatrices(look.projectionMatrix, look.matrixWorldInverse);
      frustums[i].setFromProjectionMatrix(viewProj);
    }
  }

  // Screen-space bounds (px) of a board hw x hd seen from distance dist.
  function measure(dist, hw, hd) {
    probe.position.set(0, sin * dist, cos * dist);
    probe.lookAt(0, LOOK_Y, 0);
    probe.updateMatrixWorld();
    box.minX = box.minY = Infinity;
    box.maxX = box.maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? hw : -hw, i & 2 ? WALL_H + 0.3 : -PLINTH_H * 0.6, i & 4 ? hd : -hd);
      corner.project(probe);
      const x = (corner.x + 1) * 0.5 * width;
      const y = (1 - corner.y) * 0.5 * height;
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minY = Math.min(box.minY, y);
      box.maxY = Math.max(box.maxY, y);
    }
  }

  return {
    // Frames a W x H board inside the screen rectangle (x, y, w, h).
    fit(W, H, x, y, w, h, snap) {
      // Small boards are framed as if they were bigger, so they do not fill
      // the screen with giant blocks.
      const hw = Math.max(W, 9) / 2;
      const hd = Math.max(H, 6.5) / 2;
      let dist = 16;
      for (let i = 0; i < 6; i++) {
        measure(dist, hw, hd);
        const s = Math.max((box.maxX - box.minX) / w, (box.maxY - box.minY) / h);
        dist *= s;
      }
      measure(dist, hw, hd);
      goal.dist = dist;
      goal.ox = (box.minX + box.maxX) / 2 - (x + w / 2);
      goal.oy = (box.minY + box.maxY) / 2 - (y + h / 2);
      if (snap) {
        cur.dist = goal.dist;
        cur.ox = goal.ox;
        cur.oy = goal.oy;
      }
      prepare();
    },

    // Camera positions the board may be seen from until the next fit.
    eyes,

    // True when a ball of radius r at (x, y, z) can show on screen.
    sees(x, y, z, r) {
      sphere.center.set(x, y, z);
      sphere.radius = r;
      for (let i = 0; i < 6; i++) if (frustums[i].intersectsSphere(sphere)) return true;
      return false;
    },

    // sway turns the camera around the board (radians); shake is in units.
    update(dt, sway, shakeX, shakeY) {
      const k = Math.min(1, dt * EASE);
      cur.dist += (goal.dist - cur.dist) * k;
      cur.ox += (goal.ox - cur.ox) * k;
      cur.oy += (goal.oy - cur.oy) * k;
      cur.sway += (sway - cur.sway) * k;
      const d = cur.dist;
      const a = cur.sway;
      camera.position.set(Math.sin(a) * cos * d + shakeX, sin * d + shakeY, Math.cos(a) * cos * d);
      camera.lookAt(shakeX * 0.5, LOOK_Y, 0);
      camera.setViewOffset(width, height, cur.ox, cur.oy, width, height);
      camera.far = d * 2.4;
      camera.updateProjectionMatrix();
      scene.fog.near = d * 1.05;
      scene.fog.far = d * 2.1;
    },
  };
}
