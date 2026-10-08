// The apple and the bonus star: where they are on the grid, how they pop in,
// bob and get swallowed. The star has a countdown ring and vanishes when it
// runs out.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLS, ROWS, ball, cellX, cellZ, paint, shadowDisc } from './shared.js';

export const BONUS_TIME = 6; // seconds the star stays on the board
const POP_TIME = 0.55;
const RING_SEGMENTS = 32;

function appleGeometry() {
  const stem = new THREE.CylinderGeometry(0.035, 0.05, 0.22, 5);
  stem.translate(0, 0.38, 0);
  const leaf = new THREE.SphereGeometry(0.13, 6, 4);
  leaf.scale(1.4, 0.35, 0.7);
  leaf.rotateZ(-0.5);
  leaf.translate(0.13, 0.42, 0);
  return mergeGeometries([
    ball(0.36, 1, 0.88, 1, 0, 0, 0, 0xe8403a, 10),
    ball(0.1, 1, 0.6, 1, -0.12, 0.17, 0.2, 0xff8a7a, 6), // shine
    paint(stem, 0x6b4426),
    paint(leaf, 0x4bbf4b),
  ]);
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.22;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 1,
  });
  g.translate(0, 0, -0.06);
  return g;
}

// 0 -> 1 with a springy overshoot.
function elastic(x) {
  if (x >= 1) return 1;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((Math.PI * 2) / 3)) + 1;
}

export function createFood(scene, snake) {
  const apple = new THREE.Mesh(appleGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(apple);
  const appleShadow = shadowDisc(0.36, 0.25);
  scene.add(appleShadow);

  const star = new THREE.Mesh(
    starGeometry(),
    new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x7a4c00 }),
  );
  scene.add(star);
  const starShadow = shadowDisc(0.4, 0.25);
  scene.add(starShadow);

  // Countdown ring around the star: drawRange shortens the arc as time runs out.
  const ringGeometry = new THREE.RingGeometry(0.52, 0.66, RING_SEGMENTS, 1, Math.PI / 2, Math.PI * 2);
  ringGeometry.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xffb21f }));
  ring.position.y = 0.02;
  scene.add(ring);

  let time = 0;

  const food = {
    appleOn: false,
    appleX: 0,
    appleZ: 0,
    appleAge: 0,
    bonusOn: false,
    bonusX: 0,
    bonusZ: 0,
    bonusAge: 0,
    bonusLeft: 0,
    pickX: 0, // result of pick()
    pickZ: 0,

    // Picks a free cell, preferably not right next to the head, and stores it
    // in this.pickX / this.pickZ. Returns false when the board is full.
    pick() {
      for (let tries = 0; tries < 40; tries++) {
        const cx = Math.floor(Math.random() * COLS);
        const cz = Math.floor(Math.random() * ROWS);
        if (!this.usable(cx, cz)) continue;
        if (Math.abs(cx - snake.headX) + Math.abs(cz - snake.headZ) < 3) continue;
        this.pickX = cx;
        this.pickZ = cz;
        return true;
      }
      // Crowded board: take the first usable cell from a random start.
      const start = Math.floor(Math.random() * COLS * ROWS);
      for (let k = 0; k < COLS * ROWS; k++) {
        const c = (start + k) % (COLS * ROWS);
        const cx = c % COLS;
        const cz = (c - cx) / COLS;
        if (!this.usable(cx, cz)) continue;
        this.pickX = cx;
        this.pickZ = cz;
        return true;
      }
      return false;
    },

    usable(cx, cz) {
      if (!snake.isFree(cx, cz)) return false;
      if (this.appleOn && cx === this.appleX && cz === this.appleZ) return false;
      if (this.bonusOn && cx === this.bonusX && cz === this.bonusZ) return false;
      return true;
    },

    spawnApple() {
      this.appleOn = false;
      if (!this.pick()) return;
      this.appleOn = true;
      this.appleX = this.pickX;
      this.appleZ = this.pickZ;
      this.appleAge = 0;
    },

    spawnBonus() {
      this.bonusOn = false;
      if (!this.pick()) return;
      this.bonusOn = true;
      this.bonusX = this.pickX;
      this.bonusZ = this.pickZ;
      this.bonusAge = 0;
      this.bonusLeft = BONUS_TIME;
    },

    clear() {
      this.appleOn = false;
      this.bonusOn = false;
      this.draw(0);
    },

    // Advances the animations and, if countdown is set, the star's timer.
    // Returns true on the frame the star runs out.
    update(dt, countdown) {
      time += dt;
      this.appleAge += dt;
      if (!this.bonusOn || !countdown) return false;
      this.bonusAge += dt;
      this.bonusLeft -= dt;
      if (this.bonusLeft <= 0) {
        this.bonusOn = false;
        return true;
      }
      return false;
    },

    // squash: 0..1, how far the head has moved into the apple's cell.
    draw(squash) {
      apple.visible = this.appleOn;
      appleShadow.visible = this.appleOn;
      if (this.appleOn) {
        const pop = elastic(this.appleAge / POP_TIME);
        const s = Math.max(0.01, pop * (1 - 0.45 * squash * squash));
        const x = cellX(this.appleX);
        const z = cellZ(this.appleZ);
        apple.position.set(x, 0.36 + Math.sin(time * 3.2) * 0.05 * pop, z);
        apple.rotation.y = time * 0.9;
        apple.scale.set(s, s, s);
        appleShadow.position.x = x;
        appleShadow.position.z = z;
        appleShadow.scale.setScalar(Math.max(0.01, pop));
      }

      const blinking = this.bonusLeft < 1.6 && Math.floor(this.bonusLeft * 8) % 2 === 0;
      star.visible = this.bonusOn && !blinking;
      starShadow.visible = this.bonusOn;
      ring.visible = this.bonusOn;
      if (this.bonusOn) {
        const pop = elastic(this.bonusAge / POP_TIME);
        const x = cellX(this.bonusX);
        const z = cellZ(this.bonusZ);
        star.position.set(x, 0.55 + Math.sin(time * 4) * 0.07, z);
        // Tilted back to face the camera, turning in its own plane with a wobble.
        star.rotation.set(-0.95, Math.sin(time * 5) * 0.45, time * 2.2);
        star.scale.setScalar(Math.max(0.01, pop));
        starShadow.position.x = x;
        starShadow.position.z = z;
        ring.position.x = x;
        ring.position.z = z;
        const left = Math.ceil((this.bonusLeft / BONUS_TIME) * RING_SEGMENTS);
        ringGeometry.setDrawRange(0, left * 6);
      }
    },
  };

  food.clear();
  return food;
}
