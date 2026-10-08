// The bonus gem: shows up twice per maze below the base, spins for a few
// seconds and is worth more on every level.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { START_X, START_Y } from './mazes.js';
import { elastic, glowDisc, glowMaterial, worldX, worldZ } from './shared.js';

export const GEM_POINTS = [100, 300, 500, 700, 1000, 2000, 3000, 5000];
const GEM_COLORS = [0xff3b5c, 0xffb02e, 0x2fe08a, 0x3d8bff, 0xc06bff, 0xeaf6ff, 0xff6fc8, 0x4ff0ff];
export const GEM_TIME = 9.5;
const POP_TIME = 0.5;

// A cut gem: an eight-sided crown over a deeper pointed pavilion.
function gemGeometry() {
  const crown = new THREE.CylinderGeometry(0.17, 0.3, 0.16, 8);
  crown.translate(0, 0.08, 0);
  const pavilion = new THREE.ConeGeometry(0.3, 0.38, 8);
  pavilion.rotateX(Math.PI);
  pavilion.translate(0, -0.19, 0);
  const g = mergeGeometries([crown, pavilion]);
  crown.dispose();
  pavilion.dispose();
  return g;
}

export function createBonus(scene) {
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000, flatShading: true });
  const gem = new THREE.Mesh(gemGeometry(), material);
  scene.add(gem);
  const glowMat = glowMaterial(0xffffff, 0.7);
  const glow = new THREE.Mesh(glowDisc(1.1), glowMat);
  glow.position.y = 0.02;
  scene.add(glow);
  const x = worldX(START_X);
  const z = worldZ(START_Y);

  let time = 0;

  const bonus = {
    on: false,
    age: 0,
    left: 0,
    points: 0,
    color: 0xffffff,
    cx: START_X,
    cy: START_Y,

    spawn(level) {
      const k = Math.min(level - 1, GEM_POINTS.length - 1);
      this.on = true;
      this.age = 0;
      this.left = GEM_TIME;
      this.points = GEM_POINTS[k];
      this.color = GEM_COLORS[k];
      material.color.setHex(this.color);
      material.emissive.setHex(this.color).multiplyScalar(0.35);
      glowMat.color.setHex(this.color);
    },

    clear() {
      this.on = false;
      this.draw(0);
    },

    // Returns true on the frame the gem runs out.
    update(dt) {
      time += dt;
      if (!this.on) return false;
      this.age += dt;
      this.left -= dt;
      if (this.left <= 0) {
        this.on = false;
        return true;
      }
      return false;
    },

    draw() {
      const blinking = this.on && this.left < 2 && Math.floor(this.left * 8) % 2 === 0;
      gem.visible = this.on && !blinking;
      glow.visible = this.on;
      if (!this.on) return;
      const pop = elastic(this.age / POP_TIME);
      gem.position.set(x, 0.62 + Math.sin(time * 3.5) * 0.08, z);
      gem.rotation.set(0.25, time * 2.4, 0);
      gem.scale.setScalar(Math.max(0.01, pop * 1.1));
      glow.position.x = x;
      glow.position.z = z;
      glow.scale.setScalar(Math.max(0.01, pop) * (0.9 + Math.sin(time * 6) * 0.1));
    },
  };

  bonus.clear();
  return bonus;
}
