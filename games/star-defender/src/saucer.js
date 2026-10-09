// The mystery saucer: crosses the far end of the field now and then and is
// worth a random bonus when shot down.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SAUCER_Z, part, prune, rand } from './shared.js';

const SPEED = 5.5;
const START_X = 26; // off screen on both sides, also on the wide 16:9 screen
const Y = 0.9;
export const SAUCER_HALF_W = 1.1;
export const SAUCER_HALF_D = 0.6;
const BONUS = [50, 100, 100, 150, 150, 300];

function saucerGeometry() {
  const disc = new THREE.SphereGeometry(1, 12, 6);
  disc.scale(1.05, 0.28, 0.8);
  const dome = new THREE.SphereGeometry(0.42, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const parts = [part(disc, 0, 0, 0, 0xff4466), part(dome, 0, 0.12, 0, 0x7ff6ff)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const light = new THREE.BoxGeometry(0.16, 0.12, 0.16);
    parts.push(part(light, Math.cos(a) * 0.9, 0.04, Math.sin(a) * 0.68, i % 2 ? 0xfff27a : 0xffffff));
  }
  const g = mergeGeometries(parts);
  // Leave out what never faces the camera (the underside): the saucer leans
  // towards the camera at every turn of its spin.
  const poses = [];
  const euler = new THREE.Euler();
  for (let k = 0; k < 16; k++) {
    for (const bank of [-0.12, 0.12]) poses.push(new THREE.Matrix4().makeRotationFromEuler(euler.set(0.35, (k / 16) * Math.PI * 2, bank)));
  }
  const at = [new THREE.Vector3(-START_X, Y - 0.15, SAUCER_Z), new THREE.Vector3(START_X, Y + 0.15, SAUCER_Z)];
  const eye = [new THREE.Vector3(-1.5, 23, 13.5), new THREE.Vector3(1.5, 24, 13.5)];
  return prune(g, poses, [at], eye);
}

export function createSaucer(scene) {
  const mesh = new THREE.Mesh(
    saucerGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.visible = false;
  scene.add(mesh);

  let dir = 1;
  let timer = 0;
  let spin = 0;

  const saucer = {
    active: false,
    x: 0,
    z: SAUCER_Z,

    // first is the wait in seconds before the first saucer.
    reset(first) {
      saucer.active = false;
      mesh.visible = false;
      timer = first;
    },

    // allowed is false while no new saucer may appear; one already flying
    // finishes its run.
    update(dt, allowed, minWait, maxWait) {
      spin += dt * 3;
      if (!saucer.active) {
        if (allowed) timer -= dt;
        if (timer <= 0) {
          saucer.active = true;
          dir = Math.random() < 0.5 ? 1 : -1;
          saucer.x = -dir * START_X;
          timer = rand(minWait, maxWait);
        }
      } else {
        saucer.x += dir * SPEED * dt;
        if (Math.abs(saucer.x) > START_X) saucer.active = false;
      }
      mesh.visible = saucer.active;
      mesh.position.set(saucer.x, Y + Math.sin(spin * 1.3) * 0.12, SAUCER_Z);
      mesh.rotation.set(0.35, spin, dir * -0.12);
    },

    // Returns the bonus if a shot moving from z0 to z1 along x hits, else 0.
    hit(x, z0, z1) {
      if (!saucer.active) return 0;
      if (Math.abs(x - saucer.x) > SAUCER_HALF_W) return 0;
      if (Math.min(z0, z1) > SAUCER_Z + SAUCER_HALF_D || Math.max(z0, z1) < SAUCER_Z - SAUCER_HALF_D) return 0;
      saucer.active = false;
      mesh.visible = false;
      return BONUS[Math.floor(Math.random() * BONUS.length)];
    },
  };

  return saucer;
}
