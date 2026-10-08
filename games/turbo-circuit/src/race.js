// The race: four cars on the grid, who drives them, bumps between them,
// standings, lap times and the effects they kick up.

import * as THREE from 'three';
import { LAPS, TOP_SPEED } from './shared.js';
import { gridSlot } from './track.js';
import {
  SURFACE_CURB,
  SURFACE_GRASS,
  collideCars,
  createCar,
  createCarMesh,
  driveAI,
  placeCar,
  stepCar,
} from './car.js';
import { DIRT, FLAME, GRASS, SMOKE, SPARK } from './fx.js';

// Car 0 is the player.
export const CAR_COLORS = [
  { body: 0xe63946, stripe: 0xffffff, css: '#ff4b55' },
  { body: 0x2f6fdf, stripe: 0xffd23f, css: '#4d8cff' },
  { body: 0xffc93c, stripe: 0x262a38, css: '#ffd23f' },
  { body: 0x8a4fff, stripe: 0xffffff, css: '#b28cff' },
];

const AI_SKILLS = [0.955, 0.925, 0.895];
const PLAYER_SLOT = 3; // the player starts at the back of the grid
const ATTRACT_SKILL = 0.9;

export function createRace(scene, track, fx, scenery) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cars = [];
  const meshes = [];
  for (let i = 0; i < 4; i++) {
    cars.push(createCar(i, i === 0));
    meshes.push(createCarMesh(scene, material, CAR_COLORS[i].body, CAR_COLORS[i].stripe));
  }
  const player = cars[0];

  // Fake shadows: one dark transparent disc under each car.
  const shadowGeometry = new THREE.CircleGeometry(1, 14);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
    cars.length,
  );
  shadows.frustumCulled = false;
  scene.add(shadows);

  const dummy = new THREE.Object3D();
  const hit = { x: 0, z: 0 };
  const skills = AI_SKILLS.slice();
  let finishCount = 0;
  let clock = 0; // race time in seconds, from GO
  let time = 0; // always running, makes the AI weave a little

  // What happened to the player this frame, for camera shake and the HUD.
  const events = { bump: 0, wall: 0, boost: false, lap: 0, finished: false, cones: 0 };

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
  }

  // Smoke, dirt and flames for one car, a few particles per frame at most.
  function emit(car, dt) {
    const speed = Math.abs(car.fwd);
    const rearX = car.x - car.fx * 1.15;
    const rearZ = car.z - car.fz * 1.15;
    const sideX = -car.fz * 0.62;
    const sideZ = car.fx * 0.62;
    const side = Math.random() < 0.5 ? -1 : 1;
    if (car.surface === SURFACE_GRASS && speed > 4 && Math.random() < dt * 40) {
      fx.spawn(rearX + sideX * side, 0.3, rearZ + sideZ * side,
        -car.vx * 0.15 + (Math.random() - 0.5) * 3, 2 + Math.random() * 3, -car.vz * 0.15 + (Math.random() - 0.5) * 3,
        0.32, 0.5, Math.random() < 0.5 ? DIRT : GRASS, 16);
    } else if ((Math.abs(car.lat) > 5.5 || (car.brake > 0 && car.fwd > 16)) && Math.random() < dt * 35) {
      fx.spawn(rearX + sideX * side, 0.25, rearZ + sideZ * side,
        (Math.random() - 0.5) * 2, 1.2 + Math.random(), (Math.random() - 0.5) * 2, 0.55, 0.55, SMOKE, -1);
    }
    if (car.boost > 0 && Math.random() < dt * 50) {
      fx.spawn(rearX + (Math.random() - 0.5) * 0.4, 0.45, rearZ + (Math.random() - 0.5) * 0.4,
        car.vx * 0.6 - car.fx * 6, 0.5, car.vz * 0.6 - car.fz * 6, 0.4, 0.22, Math.random() < 0.5 ? FLAME : SPARK, 0);
    }
    if (car.wallHit > 3) fx.burst(6, car.x, 0.5, car.z, 6, 4, 0.18, 0.35, SPARK, 20);
  }

  const race = {
    cars,
    player,
    events,
    get clock() {
      return clock;
    },

    // Puts the cars on the grid. The AI's skills are shuffled so a different
    // rival leads each time.
    reset() {
      shuffle(skills);
      let ai = 0;
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        const slot = car.isPlayer ? PLAYER_SLOT : ai < PLAYER_SLOT ? ai : ai + 1;
        const g = gridSlot(track, slot);
        placeCar(car, track, g.s, g.off);
        if (!car.isPlayer) {
          car.skill = skills[ai];
          car.bias = (Math.random() - 0.5) * 3;
          car.phase = Math.random() * 6;
          ai++;
        }
      }
      finishCount = 0;
      clock = 0;
      scenery.resetCones();
      fx.clear();
      this.draw(0);
    },

    // mode: 'race' (player drives with input), 'attract' (everyone is AI,
    // title screen) or 'cruise' (player finished, autopilot takes over).
    update(dt, input, mode) {
      events.bump = 0;
      events.wall = 0;
      events.boost = false;
      events.lap = 0;
      events.finished = false;
      if (mode !== 'attract') clock += dt;
      time += dt;

      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        if (car.isPlayer && mode === 'race') {
          car.throttle = input.down('A') ? 1 : 0;
          car.brake = input.down('B') ? 1 : 0;
          car.steerTarget = input.dpad.x;
        } else if (car.isPlayer || mode === 'attract') {
          car.skill = car.isPlayer && mode === 'cruise' ? 0.8 : ATTRACT_SKILL;
          driveAI(car, track, time + i * 9, cars, 1, dt);
        } else {
          // Rubber band: rivals far ahead of the player ease off a little,
          // rivals far behind push a little harder.
          const gap = car.progress - player.progress;
          const rubber = gap > 0 ? 1 - Math.min(gap / 220, 1) * 0.13 : 1 + Math.min(-gap / 220, 1) * 0.06;
          driveAI(car, track, time, cars, car.finished ? 0.75 : rubber, dt);
        }
        const laps = car.laps;
        stepCar(car, dt, track);

        if (mode !== 'attract' && car.laps > laps && car.laps >= 1 && !car.finished) {
          const lapTime = clock - car.lapStart;
          car.lapStart = clock;
          if (car.bestLap === 0 || lapTime < car.bestLap) car.bestLap = lapTime;
          if (car.laps >= LAPS) {
            car.finished = true;
            car.finishTime = clock;
            car.place = ++finishCount;
            if (car.isPlayer) events.finished = true;
          }
          if (car.isPlayer) events.lap = car.laps;
        }
        emit(car, dt);
      }

      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const impact = collideCars(cars[i], cars[j], hit);
          if (impact <= 0) continue;
          if (impact > 3) fx.burst(Math.min(10, impact | 0), hit.x, 0.6, hit.z, 5, 4, 0.16, 0.35, SPARK, 20);
          if (i === 0) events.bump = Math.max(events.bump, impact);
        }
      }

      if (player.wallHit > 0) events.wall = player.wallHit;
      events.boost = player.boosted;
      events.cones = scenery.updateCones(dt, cars, fx);
      this.draw(dt);
    },

    // Place of a car in the race: finished cars by finish order, the rest by
    // how far round the circuit they are.
    placeOf(car) {
      if (car.finished) return car.place;
      let place = 1;
      for (let i = 0; i < cars.length; i++) {
        const o = cars[i];
        if (o !== car && (o.finished || o.progress > car.progress)) place++;
      }
      return place;
    },

    // True once any car has crossed the line for the last time.
    leaderFinished() {
      return finishCount > 0;
    },

    draw(dt) {
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        const mesh = meshes[i];
        // A little rumble on the grass and over the curbs.
        const rumble = car.surface === SURFACE_GRASS ? 0.05 : car.surface === SURFACE_CURB ? 0.025 : 0;
        const bob = rumble * Math.abs(car.fwd) / TOP_SPEED * (Math.random() - 0.5);
        mesh.position.set(car.x, bob, car.z);
        mesh.rotation.set(car.pitch, car.heading, car.roll);

        dummy.position.set(car.x, 0.08, car.z);
        dummy.rotation.set(0, car.heading, 0);
        dummy.scale.set(0.95, 1, 1.5);
        dummy.updateMatrix();
        shadows.setMatrixAt(i, dummy.matrix);
      }
      shadows.instanceMatrix.needsUpdate = true;
      fx.update(dt);
    },
  };
  return race;
}
