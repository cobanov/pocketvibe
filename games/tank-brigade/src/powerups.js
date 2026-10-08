// The power-up: one at a time, dropped when a flashing enemy is hit. A gold
// token hovers over the field with a 3D icon on it and a pulsing ring below;
// it blinks before it runs out.

import * as THREE from 'three';
import { iconGeometry, tokenGeometry } from './models.js';

export const STAR = 0;
export const HELMET = 1;
export const CLOCK = 2;
export const BOMB = 3;
export const SHOVEL = 4;
export const TANK = 5;

export const POWERS = [
  { name: 'GUN UP', color: '#ffd84a' },
  { name: 'SHIELD', color: '#7fe8ff' },
  { name: 'FREEZE', color: '#bfe8ff' },
  { name: 'BOMB!', color: '#ff8a4a' },
  { name: 'STEEL WALL', color: '#c8d6e6' },
  { name: 'EXTRA TANK', color: '#8dff86' },
];

const LIFETIME = 18;
const BLINK = 4; // seconds of blinking before it goes
const PICK_R = 0.8;
const Y = 0.55;
const SIZE = 1.3;

export function createPowerups(scene) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x303030 });
  const group = new THREE.Group();
  const token = new THREE.Mesh(tokenGeometry(), material);
  group.add(token);
  const icons = [];
  for (let k = 0; k < POWERS.length; k++) {
    const icon = new THREE.Mesh(iconGeometry(k), material);
    icon.position.y = 0.01;
    icon.visible = false;
    token.add(icon);
    icons.push(icon);
  }
  group.visible = false;
  scene.add(group);

  const ringGeometry = new THREE.RingGeometry(0.62, 0.74, 24);
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd25a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.y = 0.03;
  group.add(ring);

  const shadowGeometry = new THREE.CircleGeometry(0.4, 14);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  shadow.position.set(0.08, 0.012, 0.1);
  group.add(shadow);

  let kind = -1;
  let age = 0;

  return {
    get active() {
      return kind >= 0;
    },
    get x() {
      return group.position.x;
    },
    get z() {
      return group.position.z;
    },

    spawn(k, x, z) {
      if (kind >= 0) icons[kind].visible = false;
      kind = k;
      age = 0;
      icons[k].visible = true;
      group.position.set(x, 0, z);
      group.visible = true;
    },

    clear() {
      if (kind >= 0) icons[kind].visible = false;
      kind = -1;
      group.visible = false;
    },

    // Returns the kind picked up by a tank at (x, z), or -1.
    pick(x, z) {
      if (kind < 0 || Math.abs(x - group.position.x) > PICK_R || Math.abs(z - group.position.z) > PICK_R) return -1;
      const k = kind;
      this.clear();
      return k;
    },

    update(dt) {
      if (kind < 0) return;
      age += dt;
      if (age > LIFETIME) {
        this.clear();
        return;
      }
      const grow = Math.min(1, age * 5);
      const pop = grow < 1 ? 1 + Math.sin(grow * Math.PI) * 0.35 : 1;
      token.position.y = Y + Math.sin(age * 4) * 0.06;
      token.rotation.set(0.32, Math.sin(age * 2.2) * 0.5, 0);
      token.scale.setScalar(SIZE * grow * pop);
      const k = (age * 1.4) % 1;
      ring.scale.setScalar(0.9 + k * 0.7);
      ringMaterial.color.setHex(0xffd25a).multiplyScalar(1 - k);
      shadow.scale.setScalar(grow);
      group.visible = age < LIFETIME - BLINK || Math.floor(age * 8) % 2 === 0;
    },
  };
}
