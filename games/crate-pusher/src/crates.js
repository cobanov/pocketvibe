// The crates: one InstancedMesh of wooden crates, one of soft shadows and
// one of additive glows that light up the floor under every crate standing
// on a spot. Each crate slides towards its cell in the puzzle with easing,
// squashes when it lands and blushes red when it can no longer be saved.

import * as THREE from 'three';
import { blobTexture, easeOut } from './shared.js';
import { crateGeometry, quadGeometry } from './models.js';

const MAX = 8;
const DROP_TIME = 0.45; // crates fall onto a fresh board, one after another

export function createCrates(scene) {
  const blob = blobTexture();
  const quad = quadGeometry();

  const mesh = new THREE.InstancedMesh(crateGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), MAX);
  const shadows = new THREE.InstancedMesh(
    quad,
    new THREE.MeshBasicMaterial({ color: 0x1a1030, map: blob, transparent: true, opacity: 0.45, depthWrite: false }),
    MAX,
  );
  const glows = new THREE.InstancedMesh(
    quad,
    new THREE.MeshBasicMaterial({ map: blob, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    MAX,
  );
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX; i++) {
    mesh.setColorAt(i, white);
    glows.setColorAt(i, white);
  }
  for (const m of [mesh, shadows, glows]) {
    m.frustumCulled = false; // instances move, so cached bounds would be wrong
    m.count = 0;
  }
  glows.renderOrder = 1;
  scene.add(shadows, glows, mesh);

  const fromX = new Float32Array(MAX);
  const fromZ = new Float32Array(MAX);
  const toX = new Float32Array(MAX);
  const toZ = new Float32Array(MAX);
  const prog = new Float32Array(MAX); // 0..1 along the current slide
  const dur = new Float32Array(MAX);
  const squash = new Float32Array(MAX);
  const wiggle = new Float32Array(MAX);
  const glow = new Float32Array(MAX); // eases towards 1 on a spot
  const red = new Float32Array(MAX); // eases towards 1 when stuck
  const drop = new Float32Array(MAX); // < 0 waits, 0..1 falls in
  const landed = new Uint8Array(MAX); // set for one update when a slide ends

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let boost = 0; // extra glow while the level-clear party runs

  const crates = {
    count: 0,
    dropped: 0, // crates that landed from their fall in the last update

    // Puts every crate on its cell. With fall set they drop in one by one.
    load(p, fall) {
      this.count = Math.min(MAX, p.crates.length);
      mesh.count = shadows.count = glows.count = this.count;
      boost = 0;
      for (let i = 0; i < this.count; i++) {
        this.snap(i, p);
        glow[i] = p.goal[p.crates[i]] ? 1 : 0;
        red[i] = 0;
        drop[i] = fall ? -0.12 * i - 0.15 : 1;
      }
    },

    snap(i, p) {
      toX[i] = fromX[i] = p.x(p.crates[i]);
      toZ[i] = fromZ[i] = p.z(p.crates[i]);
      prog[i] = 1;
      squash[i] = 0;
    },

    // Starts a slide from wherever the crate is drawn now to its cell.
    slide(i, p, time) {
      const k = easeOut(Math.min(1, prog[i]));
      fromX[i] = fromX[i] + (toX[i] - fromX[i]) * k;
      fromZ[i] = fromZ[i] + (toZ[i] - fromZ[i]) * k;
      toX[i] = p.x(p.crates[i]);
      toZ[i] = p.z(p.crates[i]);
      prog[i] = 0;
      dur[i] = time;
    },

    // A shove that did not move the crate.
    jiggle(i) {
      wiggle[i] = 1;
    },

    // True for one update after crate i finished a slide.
    landed(i) {
      return landed[i] === 1;
    },

    // True when crate i is at rest on its cell.
    settled(i) {
      return prog[i] >= 1;
    },

    x(i) {
      return toX[i];
    },

    z(i) {
      return toZ[i];
    },

    party() {
      boost = 1;
    },

    update(dt, p, time) {
      this.dropped = 0;
      for (let i = 0; i < this.count; i++) {
        landed[i] = 0;
        if (prog[i] < 1) {
          prog[i] = Math.min(1, prog[i] + dt / dur[i]);
          if (prog[i] >= 1) {
            landed[i] = 1;
            squash[i] = 1;
          }
        }
        squash[i] = Math.max(0, squash[i] - dt * 6);
        wiggle[i] = Math.max(0, wiggle[i] - dt * 4);
        const cell = p.crates[i];
        // Only once it has arrived does a crate show what its cell means.
        if (prog[i] >= 1) {
          glow[i] += ((p.goal[cell] ? 1 : 0) - glow[i]) * Math.min(1, dt * 8);
          red[i] += ((p.stuck[i] ? 1 : 0) - red[i]) * Math.min(1, dt * 6);
        }
        let y = 0;
        if (drop[i] < 1) {
          drop[i] = Math.min(1, drop[i] + dt / DROP_TIME);
          const k = Math.max(0, drop[i]);
          y = (1 - k * k) * 4;
          if (drop[i] >= 1) {
            squash[i] = 1;
            this.dropped++;
          }
        }

        const k = easeOut(prog[i]);
        const x = fromX[i] + (toX[i] - fromX[i]) * k + Math.sin(wiggle[i] * 18) * wiggle[i] * 0.05;
        const z = fromZ[i] + (toZ[i] - fromZ[i]) * k;
        const sq = Math.sin(squash[i] * Math.PI) * 0.12;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, Math.sin(wiggle[i] * 14) * wiggle[i] * 0.08, 0);
        dummy.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        // Wood warms to gold on a spot and blushes red when stuck.
        const pulse = 0.85 + Math.sin(time * 5 + i) * 0.15;
        const g = glow[i] * (pulse + boost * 0.35);
        const r = red[i] * (0.75 + Math.sin(time * 9) * 0.25);
        color.setRGB(1 + g * 0.42 + r * 0.2, 1 + g * 0.32 - r * 0.62, 1 - g * 0.08 - r * 0.55);
        mesh.setColorAt(i, color);

        // The glow pool and the shadow stay on the floor.
        dummy.position.set(x, 0.012, z);
        dummy.rotation.set(0, 0, 0);
        const fall = Math.max(0, drop[i]);
        dummy.scale.setScalar(y > 0 ? 0.6 + fall * 0.5 : 1.15);
        dummy.updateMatrix();
        shadows.setMatrixAt(i, dummy.matrix);
        dummy.position.y = 0.02;
        dummy.scale.setScalar(1.9 + g * 0.2);
        dummy.updateMatrix();
        glows.setMatrixAt(i, dummy.matrix);
        const a = g * 0.75;
        color.setRGB(a, a * 0.78, a * 0.3);
        glows.setColorAt(i, color);
      }
      boost = Math.max(0, boost - dt * 0.4);
      if (this.count) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        shadows.instanceMatrix.needsUpdate = true;
        glows.instanceMatrix.needsUpdate = true;
        glows.instanceColor.needsUpdate = true;
      }
    },
  };

  return crates;
}
