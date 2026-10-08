// Camera framing. Each board is fitted into a rectangle of the screen (under
// the HUD while playing, above the menu on the title screen) by measuring
// its projected corners, then shifted there with a view offset. The camera
// eases from one framing to the next.

import * as THREE from 'three';
import { PLINTH_H, WALL_H } from './shared.js';

const PITCH = 1.02; // radians above the horizon
const LOOK_Y = 0.2;
const EASE = 6;

export function createView(camera, scene, width, height) {
  const probe = new THREE.PerspectiveCamera(camera.fov, width / height, 0.5, 200);
  const corner = new THREE.Vector3();
  const sin = Math.sin(PITCH);
  const cos = Math.cos(PITCH);
  const cur = { dist: 16, ox: 0, oy: 0 };
  const goal = { dist: 16, ox: 0, oy: 0 };
  const box = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

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
    },

    // sway turns the camera around the board (radians); shake is in units.
    update(dt, sway, shakeX, shakeY) {
      const k = Math.min(1, dt * EASE);
      cur.dist += (goal.dist - cur.dist) * k;
      cur.ox += (goal.ox - cur.ox) * k;
      cur.oy += (goal.oy - cur.oy) * k;
      const d = cur.dist;
      camera.position.set(Math.sin(sway) * cos * d + shakeX, sin * d + shakeY, Math.cos(sway) * cos * d);
      camera.lookAt(shakeX * 0.5, LOOK_Y, 0);
      camera.setViewOffset(width, height, cur.ox, cur.oy, width, height);
      camera.far = d * 2.4;
      camera.updateProjectionMatrix();
      scene.fog.near = d * 1.05;
      scene.fog.far = d * 2.1;
    },
  };
}
