// Effects: pooled particles (snow spray, crash bursts, sparkles, debris) in
// one InstancedMesh, and ski tracks as a ring of flat quads laid behind the
// skis in another.

import * as THREE from 'three';
import { SLOPE_ANGLE, slopeY } from './shared.js';
import { quadGeometry } from './models.js';

const MAX = 220;
const TRACKS = 260;
const SEG = 0.7; // length of one piece of ski track

export function createFx(scene) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ emissive: 0x1c2430 }),
    MAX,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, white);
  scene.add(mesh);

  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const vx = new Float32Array(MAX);
  const vy = new Float32Array(MAX);
  const vz = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const gravity = new Float32Array(MAX);
  const drag = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  const colors = [];
  for (let i = 0; i < MAX; i++) colors.push(new THREE.Color());
  let cursor = 0;
  const dummy = new THREE.Object3D();

  function spawn(x, y, z, sx, sy, sz, s, t, hex, g, d) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    px[i] = x;
    py[i] = y;
    pz[i] = z;
    vx[i] = sx;
    vy[i] = sy;
    vz[i] = sz;
    size[i] = s;
    life[i] = t;
    maxLife[i] = t;
    gravity[i] = g;
    drag[i] = d;
    spin[i] = (Math.random() - 0.5) * 14;
    colors[i].setHex(hex);
  }

  // n particles flying out of (x, y, z) in all directions.
  function burst(x, y, z, n, hex, speed, up, s, t, g, d) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = speed * (0.35 + Math.random() * 0.65);
      spawn(
        x,
        y,
        z,
        Math.cos(a) * r,
        up * (0.4 + Math.random() * 0.8),
        Math.sin(a) * r,
        s * (0.7 + Math.random() * 0.6),
        t * (0.7 + Math.random() * 0.5),
        hex,
        g,
        d,
      );
    }
  }

  // Ski tracks.
  const tracks = new THREE.InstancedMesh(
    quadGeometry(),
    new THREE.MeshLambertMaterial({
      color: 0xb9cce4,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    TRACKS,
  );
  tracks.frustumCulled = false;
  tracks.count = 0;
  scene.add(tracks);
  const lastX = new Float32Array(2);
  const lastZ = new Float32Array(2);
  const laying = new Uint8Array(2);
  let trackCursor = 0;
  const m = new THREE.Matrix4();
  const axisX = new THREE.Vector3();
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3();

  // A flat quad from (x0, z0) to (x1, z1) on the slope, w wide.
  function lay(x0, z0, x1, z1, w) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dz * dz);
    axisX.set((dz / len) * w, 0, (-dx / len) * w);
    axisZ.set(dx, slopeY(z1) - slopeY(z0), dz);
    m.makeBasis(axisX, axisY, axisZ);
    m.setPosition((x0 + x1) / 2, slopeY((z0 + z1) / 2) + 0.025, (z0 + z1) / 2);
    tracks.setMatrixAt(trackCursor, m);
    trackCursor = (trackCursor + 1) % TRACKS;
    if (tracks.count < TRACKS) tracks.count++;
    tracks.instanceMatrix.needsUpdate = true;
  }

  return {
    burst,

    // Snow thrown out sideways from a carving ski: (dx, dz) is the way out.
    spray(x, y, z, dx, dz, n, speed) {
      for (let k = 0; k < n; k++) {
        const r = speed * (0.5 + Math.random() * 0.7);
        spawn(
          x + (Math.random() - 0.5) * 0.3,
          y + 0.1,
          z + (Math.random() - 0.5) * 0.3,
          dx * r + (Math.random() - 0.5) * 1.5,
          2.2 + Math.random() * 3,
          dz * r + (Math.random() - 0.5) * 1.5,
          0.1 + Math.random() * 0.14,
          0.4 + Math.random() * 0.35,
          Math.random() < 0.5 ? 0xffffff : 0xc2d8f2,
          9,
          2.5,
        );
      }
    },

    // Ski `side` (0 left, 1 right) is at (x, z): extend its track, or break
    // it when the ski is off the snow.
    track(side, x, z, onSnow, w) {
      if (!onSnow) {
        laying[side] = 0;
        return;
      }
      if (!laying[side]) {
        laying[side] = 1;
        lastX[side] = x;
        lastZ[side] = z;
        return;
      }
      const dx = x - lastX[side];
      const dz = z - lastZ[side];
      if (dx * dx + dz * dz < SEG * SEG) return;
      lay(lastX[side], lastZ[side], x, z, w);
      lastX[side] = x;
      lastZ[side] = z;
    },

    clear() {
      life.fill(0);
      mesh.count = 0;
      tracks.count = 0;
      trackCursor = 0;
      laying.fill(0);
    },

    update(dt) {
      let n = 0;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) continue;
        const slow = Math.max(0, 1 - drag[i] * dt);
        vx[i] *= slow;
        vz[i] *= slow;
        vy[i] -= gravity[i] * dt;
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;
        pz[i] += vz[i] * dt;
        // Settle on the slope.
        const floor = slopeY(pz[i]) + size[i] * 0.5;
        if (py[i] < floor) {
          py[i] = floor;
          vy[i] = 0;
          vx[i] *= 0.6;
          vz[i] *= 0.6;
        }
        const k = life[i] / maxLife[i];
        dummy.position.set(px[i], py[i], pz[i]);
        dummy.rotation.set(-SLOPE_ANGLE + life[i] * spin[i], life[i] * spin[i] * 0.7, 0);
        dummy.scale.setScalar(size[i] * Math.min(1, k * 2.2));
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, colors[i]);
        n++;
      }
      mesh.count = n;
      if (n > 0) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
