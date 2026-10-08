// The scenery behind the track, all pulsing with the kick: big neon frames
// floating in the dark, a row of equalizer bars on the horizon and a glow
// where the floor meets the sky. It scrolls slower than the track, so it
// reads as far away, and it is drawn without fog.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box } from './shared.js';

const FRAMES = 14;
const FRAME_SPACING = 9; // world units between frames
const FRAME_DRIFT = 0.3; // frames slide past at this share of the track's speed
const BARS = 44;
const BAR_SPACING = 1.6;
const BAR_DRIFT = 0.12;
const BAR_Z = -46;

// A square outline of unit size, or a diamond when turned 45 degrees.
function frameGeometry() {
  const t = 0.07;
  return mergeGeometries([
    box(1, t, t, 0, 0.5, 0, 0xffffff),
    box(1, t, t, 0, -0.5, 0, 0xffffff),
    box(t, 1 + t, t, -0.5, 0, 0, 0xffffff),
    box(t, 1 + t, t, 0.5, 0, 0, 0xffffff),
    box(0.62, t * 0.7, t, 0, 0.31, 0, 0x707070), // a smaller square inside
    box(0.62, t * 0.7, t, 0, -0.31, 0, 0x707070),
    box(t * 0.7, 0.62, t, -0.31, 0, 0, 0x707070),
    box(t * 0.7, 0.62, t, 0.31, 0, 0, 0x707070),
  ]);
}

// An equalizer bar of unit height standing on y = 0, bright at the top.
function barGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.deleteAttribute('uv');
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i) > 0.5 ? 1 : 0.12;
    colors[i * 3] = v;
    colors[i * 3 + 1] = v;
    colors[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

// A wide quad whose colour fades from the bottom edge up (added on top of
// the background, so black means nothing).
function horizonGeometry() {
  const g = new THREE.PlaneGeometry(200, 9, 1, 1);
  g.deleteAttribute('uv');
  g.translate(0, 4.5, 0);
  const colors = new Float32Array([0, 0, 0, 0, 0, 0, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14]);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function createBackdrop(scene) {
  const frameMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const frames = new THREE.InstancedMesh(frameGeometry(), frameMat, FRAMES);
  const barMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const bars = new THREE.InstancedMesh(barGeometry(), barMat, BARS);
  const horizonMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const horizon = new THREE.Mesh(horizonGeometry(), horizonMat);
  horizon.position.set(0, -2.2, BAR_Z - 1);
  horizon.renderOrder = -1;
  for (const mesh of [frames, bars]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  scene.add(horizon);

  // Each frame has its own height, depth, size, spin and shape.
  const fy = new Float32Array(FRAMES);
  const fz = new Float32Array(FRAMES);
  const fs = new Float32Array(FRAMES);
  const spin = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) {
    fy[i] = 3 + ((i * 37) % 11) * 0.9;
    fz[i] = -24 - ((i * 53) % 13);
    fs[i] = 2.6 + ((i * 29) % 7) * 0.7;
    spin[i] = (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.08);
  }
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  let time = 0;

  return {
    setLevel(level) {
      const p = level.def.palette;
      color.setHex(p.deco);
      frameMat.color.copy(color);
      barMat.color.copy(color).multiplyScalar(0.55);
      horizonMat.color.setHex(p.main);
    },

    update(dt, camX, camY, pulse) {
      time += dt;
      // Frames sit on a loop around the camera that slides slowly left.
      const loop = FRAMES * FRAME_SPACING;
      for (let i = 0; i < FRAMES; i++) {
        const rel = ((((i * FRAME_SPACING - camX * FRAME_DRIFT) % loop) + loop) % loop) - loop / 2;
        dummy.position.set(camX + rel, fy[i] + camY * 0.4, fz[i]);
        dummy.rotation.set(0, 0, time * spin[i] + (i % 3 === 0 ? Math.PI / 4 : 0));
        dummy.scale.setScalar(fs[i] * (1 + 0.1 * pulse));
        dummy.updateMatrix();
        frames.setMatrixAt(i, dummy.matrix);
      }
      frames.instanceMatrix.needsUpdate = true;
      frameMat.color.copy(color).multiplyScalar(0.24 + 0.5 * pulse);

      // Equalizer bars: a wave running through them, kicked up on the beat.
      // Each bar's wave follows its place in the world, so wrapping a bar
      // round to the other end does not make it jump.
      const slide = camX * BAR_DRIFT;
      const first = Math.floor(slide / BAR_SPACING);
      const off = slide - first * BAR_SPACING;
      for (let i = 0; i < BARS; i++) {
        const k = first + i;
        const x = camX - (BARS / 2) * BAR_SPACING + i * BAR_SPACING - off;
        const wave = 0.5 + 0.5 * Math.sin(time * 2.2 + k * 0.55 + Math.sin(k * 2.7) * 2);
        const h = 0.6 + 1.6 * wave * (0.35 + 0.65 * pulse);
        dummy.position.set(x, -1.2 + camY * 0.5, BAR_Z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(BAR_SPACING * 0.62, h * 2.2, 0.6);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
      }
      bars.instanceMatrix.needsUpdate = true;

      horizon.position.x = camX;
      horizon.position.y = -2.2 + camY * 0.5;
      horizon.scale.y = 1 + 0.25 * pulse;
    },
  };
}
