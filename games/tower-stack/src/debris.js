// Falling offcuts: the parts of a slab that hung over the edge, and the whole
// slab when it misses. A small pool in one InstancedMesh; each piece keeps its
// size and colour, tips over the edge it was cut from and tumbles down.

import * as THREE from 'three';
import { AX_X, LH } from './shared.js';

const MAX = 16;
const GRAVITY = 21;
const LIFE = 3.4;

export function createDebris(scene, geometry) {
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }), MAX);
  mesh.frustumCulled = false; // pieces move, so the cached bounds would be wrong
  mesh.count = 0;
  mesh.setColorAt(0, new THREE.Color()); // creates instanceColor once, up front
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const rx = new Float32Array(MAX);
  const rz = new Float32Array(MAX);
  const wx = new Float32Array(MAX);
  const wz = new Float32Array(MAX);
  const sx = new Float32Array(MAX);
  const sz = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  let next = 0; // ring-buffer slot for the next piece
  let live = 0;

  const dummy = new THREE.Object3D();

  return {
    // A w x d piece at (x, y, z) that came off the `sign` side of the tower
    // along `axis` while the slab slid at `vel`.
    spawn(x, y, z, w, d, axis, sign, vel, color, whole) {
      const i = next;
      next = (next + 1) % MAX;
      px[i] = x;
      py[i] = y;
      pz[i] = z;
      // Pushed away from the tower, a little more when the slab was sliding
      // outwards, but never back into it.
      const out = sign * Math.max(0.35, (whole ? 0.5 : 0.8) + sign * vel * 0.18);
      // Thin slivers flip faster than big chunks.
      const spin = (whole ? 1.6 : 2.2) + Math.random() * 1.2 + 0.6 / Math.max(0.3, Math.min(w, d));
      vy[i] = whole ? 0.6 : 1.1;
      if (axis === AX_X) {
        vx[i] = out;
        vz[i] = (Math.random() - 0.5) * 0.4;
        wz[i] = -sign * spin; // the outer end tips down
        wx[i] = (Math.random() - 0.5) * 0.6;
      } else {
        vz[i] = out;
        vx[i] = (Math.random() - 0.5) * 0.4;
        wx[i] = sign * spin;
        wz[i] = (Math.random() - 0.5) * 0.6;
      }
      rx[i] = 0;
      rz[i] = 0;
      sx[i] = w;
      sz[i] = d;
      life[i] = LIFE;
      mesh.setColorAt(i, color);
      mesh.instanceColor.needsUpdate = true;
      live++;
    },

    clear() {
      life.fill(0);
      live = 0;
      mesh.count = 0;
    },

    update(dt) {
      if (live === 0) return;
      live = 0;
      let top = 0; // one past the last live slot
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        vy[i] -= GRAVITY * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        // The tip speeds up as the piece leaves the edge.
        wx[i] *= 1 + dt * 0.9;
        wz[i] *= 1 + dt * 0.9;
        rx[i] += wx[i] * dt;
        rz[i] += wz[i] * dt;
        if (life[i] > 0) {
          live++;
          top = i + 1;
        }
      }
      // Dead slots below the last live one are drawn with zero scale, nothing
      // past it is drawn at all.
      for (let i = 0; i < top; i++) {
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(rx[i], 0, rz[i]);
        if (life[i] > 0) dummy.scale.set(sx[i], LH, sz[i]);
        else dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.count = top;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
