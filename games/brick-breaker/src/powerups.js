// Power-up pills that fall from broken bricks. One InstancedMesh per kind,
// each with a small letter texture; a shared pool of pills.

import * as THREE from 'three';
import { FIELD_BOTTOM, PADDLE_D, PADDLE_Z } from './shared.js';

export const WIDE = 0;
export const MULTI = 1;
export const SLOW = 2;
export const LIFE = 3;

export const KINDS = [
  { name: 'WIDE PADDLE', letter: 'W', color: '#4d9dff' },
  { name: 'MULTI BALL', letter: 'M', color: '#ff5fc4' },
  { name: 'SLOW BALL', letter: 'S', color: '#4fd468' },
  { name: 'EXTRA LIFE', letter: '+', color: '#ff4f62' },
];

const MAX_PILLS = 6;
const FALL_SPEED = 4.2;
const PILL_Y = 0.45;

function letterTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = kind.color;
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(0, 0, 64, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 28, 64, 4);
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.strokeText(kind.letter, 32, 17);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(kind.letter, 32, 17);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPowerups(scene) {
  const geometry = new THREE.BoxGeometry(1.3, 0.42, 0.65);
  const meshes = KINDS.map((kind) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshLambertMaterial({ map: letterTexture(kind), emissive: 0x404040 }),
      MAX_PILLS,
    );
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });

  const shadowGeometry = new THREE.CircleGeometry(0.5, 12);
  shadowGeometry.rotateX(-Math.PI / 2);
  shadowGeometry.scale(1.4, 1, 0.7);
  const shadows = new THREE.InstancedMesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    MAX_PILLS,
  );
  shadows.frustumCulled = false;
  shadows.count = 0;
  scene.add(shadows);

  const pills = [];
  for (let i = 0; i < MAX_PILLS; i++) pills.push({ active: false, kind: 0, x: 0, z: 0, t: 0 });
  const counts = new Int32Array(KINDS.length);
  const dummy = new THREE.Object3D();

  function draw() {
    counts.fill(0);
    let n = 0;
    for (let i = 0; i < MAX_PILLS; i++) {
      const p = pills[i];
      if (!p.active) continue;
      // Spawn pop, then a gentle bob and wiggle; the letter stays readable.
      const grow = Math.min(1, p.t * 6);
      dummy.position.set(p.x, PILL_Y + Math.sin(p.t * 7) * 0.12, p.z);
      dummy.rotation.set(0, Math.sin(p.t * 5) * 0.18, 0);
      dummy.scale.setScalar(grow * (1 + Math.sin(p.t * 14) * 0.04));
      dummy.updateMatrix();
      meshes[p.kind].setMatrixAt(counts[p.kind]++, dummy.matrix);

      dummy.position.set(p.x + 0.15, 0.02, p.z + 0.2);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(grow);
      dummy.updateMatrix();
      shadows.setMatrixAt(n++, dummy.matrix);
    }
    for (let k = 0; k < meshes.length; k++) {
      meshes[k].count = counts[k];
      meshes[k].instanceMatrix.needsUpdate = true;
    }
    shadows.count = n;
    shadows.instanceMatrix.needsUpdate = true;
  }

  return {
    falling() {
      let n = 0;
      for (let i = 0; i < MAX_PILLS; i++) if (pills[i].active) n++;
      return n;
    },

    spawn(x, z, kind) {
      for (let i = 0; i < MAX_PILLS; i++) {
        const p = pills[i];
        if (p.active) continue;
        p.active = true;
        p.kind = kind;
        p.x = x;
        p.z = z;
        p.t = 0;
        return;
      }
    },

    clear() {
      for (let i = 0; i < MAX_PILLS; i++) pills[i].active = false;
      draw();
    },

    // Moves the pills; returns the kind caught by the paddle this frame, or -1.
    update(dt, paddle) {
      let caught = -1;
      for (let i = 0; i < MAX_PILLS; i++) {
        const p = pills[i];
        if (!p.active) continue;
        p.t += dt;
        p.z += FALL_SPEED * dt;
        if (
          caught < 0 &&
          Math.abs(p.z - PADDLE_Z) < PADDLE_D / 2 + 0.33 &&
          Math.abs(p.x - paddle.x) < paddle.halfW + 0.55
        ) {
          p.active = false;
          caught = p.kind;
        } else if (p.z > FIELD_BOTTOM + 0.6) {
          p.active = false;
        }
      }
      draw();
      return caught;
    },
  };
}
