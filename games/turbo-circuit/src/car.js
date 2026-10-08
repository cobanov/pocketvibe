// Cars: the arcade physics shared by every car, the AI driver and the model.
// The player and the AI drive the same way; they only differ in who sets
// throttle, brake and steer.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOOST_SPEED, BOOST_TIME, GRASS_SPEED, TOP_SPEED, angleDiff, box } from './shared.js';
import { EDGE, LIMIT, PAD_HALF_W, ROAD_HALF } from './track.js';

const ACCEL = 21;
const BRAKE = 36;
const COAST = 6; // slowdown with no pedal pressed
const REVERSE_SPEED = 9;
const TURN = 2.15; // yaw rate (rad/s) at low speed
const GRIP = 7.5; // how quickly sideways sliding dies out on asphalt
const SLIDE_GRIP = 2.6; // braking while steering: a power slide
const GRASS_GRIP = 3.2;
const STEER_IN = 7; // the d-pad is digital, so steering ramps in and out
const STEER_OUT = 10;

// Two collision circles per car, one over each axle.
const AXLE = 0.58;
const RADIUS = 0.66;
const BOUNCE = 0.45;

export const SURFACE_ROAD = 0;
export const SURFACE_CURB = 1;
export const SURFACE_GRASS = 2;

export function createCar(index, isPlayer) {
  return {
    index,
    isPlayer,
    x: 0,
    z: 0,
    heading: 0,
    fx: 0, // forward direction (sin, cos of heading)
    fz: 1,
    vx: 0,
    vz: 0,
    fwd: 0, // speed along the heading
    lat: 0, // sideways slide speed
    spin: 0, // extra yaw rate from bumps
    throttle: 0,
    brake: 0,
    steer: 0,
    steerTarget: 0,
    idx: 0,
    s: 0,
    off: 0,
    laps: -1, // start-line crossings; the grid is behind the line
    progress: 0,
    surface: SURFACE_ROAD,
    boost: 0,
    padCooldown: 0,
    boosted: false, // set on the frame the car hits a boost pad
    wallHit: 0, // speed into the barrier this frame
    finished: false,
    finishTime: 0,
    place: 0,
    lapStart: 0,
    bestLap: 0,
    skill: 1,
    bias: 0,
    phase: 0,
    avoid: 0,
    roll: 0,
    pitch: 0,
  };
}

export function placeCar(car, track, s, off) {
  const i = Math.round(s / track.step) % track.n;
  car.x = track.px[i] - track.tz[i] * off;
  car.z = track.pz[i] + track.tx[i] * off;
  car.heading = track.heading[i];
  car.fx = Math.sin(car.heading);
  car.fz = Math.cos(car.heading);
  car.vx = car.vz = car.fwd = car.lat = car.spin = 0;
  car.throttle = car.brake = car.steer = car.steerTarget = 0;
  car.idx = i;
  car.laps = -1;
  car.boost = car.padCooldown = 0;
  car.finished = false;
  car.finishTime = car.place = car.lapStart = car.bestLap = 0;
  car.avoid = car.roll = car.pitch = 0;
  track.locate(car);
  car.progress = car.laps * track.length + car.s;
}

// Moves one car by dt using its throttle, brake and steer.
export function stepCar(car, dt, track) {
  const fx = car.fx;
  const fz = car.fz;
  const rx = -fz; // right-hand side
  const rz = fx;
  let fwd = car.vx * fx + car.vz * fz;
  let lat = car.vx * rx + car.vz * rz;
  const grass = car.surface === SURFACE_GRASS;

  let top = grass ? GRASS_SPEED : TOP_SPEED;
  if (car.boost > 0) {
    car.boost -= dt;
    top = grass ? GRASS_SPEED + 8 : BOOST_SPEED;
  }
  car.padCooldown -= dt;

  const before = fwd;
  if (car.brake > 0) {
    if (fwd > 0.5) fwd = Math.max(0, fwd - BRAKE * dt);
    else fwd = Math.max(-REVERSE_SPEED, fwd - ACCEL * 0.5 * dt);
  } else if (car.throttle > 0) {
    if (fwd < 0) fwd = Math.min(0, fwd + BRAKE * dt);
    else if (fwd < top) fwd = Math.min(top, fwd + ACCEL * (1 - (0.55 * fwd) / TOP_SPEED) * dt);
  } else if (fwd > 0) {
    fwd = Math.max(0, fwd - COAST * dt);
  } else {
    fwd = Math.min(0, fwd + COAST * dt);
  }
  // Over the limit (after a boost, or just run onto the grass): bleed speed.
  if (fwd > top) fwd = Math.max(top, fwd - (grass ? 30 : 9) * dt);

  // Steering ramps towards the d-pad, and turns less at very low speed.
  const rate = car.steerTarget === 0 ? STEER_OUT : STEER_IN;
  const ds = car.steerTarget - car.steer;
  car.steer += Math.abs(ds) < rate * dt ? ds : Math.sign(ds) * rate * dt;
  const grip = Math.min(1, Math.abs(fwd) / 7) * Math.sign(fwd);
  const yaw = TURN * grip * (1 - 0.3 * Math.min(Math.abs(fwd) / TOP_SPEED, 1.3));

  // Sideways sliding fades out with grip; the old heading's sideways part is
  // what makes the car drift a little in corners.
  const sliding = car.brake > 0 && Math.abs(car.steer) > 0.3 && fwd > 14;
  lat *= Math.exp(-(grass ? GRASS_GRIP : sliding ? SLIDE_GRIP : GRIP) * dt);

  car.vx = fx * fwd + rx * lat;
  car.vz = fz * fwd + rz * lat;
  car.fwd = fwd;
  car.lat = lat;

  car.spin *= Math.exp(-5 * dt);
  car.heading -= car.steer * yaw * dt;
  car.heading += car.spin * dt;
  car.fx = Math.sin(car.heading);
  car.fz = Math.cos(car.heading);

  car.x += car.vx * dt;
  car.z += car.vz * dt;

  // Body lean for the model: roll with the slide, pitch with the pedals.
  const accel = (fwd - before) / Math.max(dt, 1e-3);
  car.roll += (Math.max(-0.09, Math.min(0.09, -lat * 0.014)) - car.roll) * Math.min(1, dt * 10);
  car.pitch += (Math.max(-0.05, Math.min(0.05, -accel * 0.0022)) - car.pitch) * Math.min(1, dt * 8);

  trackCar(car, track);
}

// Where the car is on the track: laps, surface, barrier and boost pads.
function trackCar(car, track) {
  const n = track.n;
  const prev = car.idx;
  track.locate(car);
  if (prev > n * 0.75 && car.idx < n * 0.25) car.laps++;
  else if (prev < n * 0.25 && car.idx > n * 0.75) car.laps--;
  car.progress = car.laps * track.length + car.s;

  const a = Math.abs(car.off);
  car.surface = a > EDGE ? SURFACE_GRASS : a > ROAD_HALF ? SURFACE_CURB : SURFACE_ROAD;

  // An invisible barrier keeps cars near the track: push back, bounce off.
  car.wallHit = 0;
  if (a > LIMIT) {
    const side = Math.sign(car.off);
    const nx = -track.tz[car.idx] * side; // outward normal
    const nz = track.tx[car.idx] * side;
    car.x -= nx * (a - LIMIT);
    car.z -= nz * (a - LIMIT);
    const vn = car.vx * nx + car.vz * nz;
    if (vn > 0) {
      car.vx -= nx * vn * 1.5;
      car.vz -= nz * vn * 1.5;
      car.wallHit = vn;
    }
  }

  car.boosted = false;
  const pad = track.pad[car.idx];
  if (pad && car.padCooldown <= 0 && Math.abs(car.off - track.padOffset[pad - 1]) < PAD_HALF_W + 0.5) {
    car.boost = BOOST_TIME;
    car.padCooldown = 1;
    car.boosted = true;
    // An instant kick on top of the higher top speed.
    const kick = Math.max(0, TOP_SPEED * 1.15 - car.fwd);
    car.vx += car.fx * kick;
    car.vz += car.fz * kick;
  }
}

// The AI: aims at a point ahead on its racing line and keeps to the planned
// speed for the corner coming up. `rubber` scales that speed (catch-up).
export function driveAI(car, track, time, cars, rubber, dt) {
  const look = 7 + Math.max(car.fwd, 0) * 0.32;
  const j = track.ahead(car.idx, look);

  // Steer around a slower car right in front.
  let avoid = 0;
  const rx = -car.fz;
  const rz = car.fx;
  for (let i = 0; i < cars.length; i++) {
    const o = cars[i];
    if (o === car) continue;
    const dx = o.x - car.x;
    const dz = o.z - car.z;
    const ahead = dx * car.fx + dz * car.fz;
    const side = dx * rx + dz * rz;
    if (ahead > 0 && ahead < 11 && Math.abs(side) < 2.6 && o.fwd < car.fwd + 1) avoid = side > 0 ? -3 : 3;
  }
  car.avoid += (avoid - car.avoid) * Math.min(1, dt * 3);

  let off = track.line[j] * 0.9 + car.bias + Math.sin(time * 0.33 + car.phase) * 1.2 + car.avoid;
  off = Math.max(-ROAD_HALF + 1.3, Math.min(ROAD_HALF - 1.3, off));
  const tx = track.px[j] - track.tz[j] * off;
  const tz = track.pz[j] + track.tx[j] * off;
  const d = angleDiff(Math.atan2(tx - car.x, tz - car.z), car.heading);
  car.steerTarget = Math.max(-1, Math.min(1, -d * 2.6));

  const target = track.aiSpeed[track.ahead(car.idx, 4)] * car.skill * rubber;
  car.throttle = car.fwd < target ? 1 : 0;
  car.brake = car.fwd > target + 2.5 ? 1 : 0;
}

// Pushes overlapping cars apart and bounces them off each other. Returns the
// hardest impact speed between a and b (0 when they do not touch) and writes
// the contact point into hit.
export function collideCars(a, b, hit) {
  let impact = 0;
  for (let ia = -1; ia <= 1; ia += 2) {
    for (let ib = -1; ib <= 1; ib += 2) {
      const ax = a.x + a.fx * AXLE * ia;
      const az = a.z + a.fz * AXLE * ia;
      const bx = b.x + b.fx * AXLE * ib;
      const bz = b.z + b.fz * AXLE * ib;
      const dx = bx - ax;
      const dz = bz - az;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS * 4 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const push = (RADIUS * 2 - d) * 0.5;
      a.x -= nx * push;
      a.z -= nz * push;
      b.x += nx * push;
      b.z += nz * push;
      const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vrel >= 0) continue;
      const j = (-(1 + BOUNCE) * vrel) / 2;
      a.vx -= j * nx;
      a.vz -= j * nz;
      b.vx += j * nx;
      b.vz += j * nz;
      // A hit away from the middle of the car turns it a little.
      const cx = (ax + bx) * 0.5;
      const cz = (az + bz) * 0.5;
      a.spin += ((cz - a.z) * -j * nx - (cx - a.x) * -j * nz) * 0.35;
      b.spin += ((cz - b.z) * j * nx - (cx - b.x) * j * nz) * 0.35;
      if (-vrel > impact) {
        impact = -vrel;
        hit.x = cx;
        hit.z = cz;
      }
    }
  }
  return impact;
}

// Low-poly race car facing +z, all parts merged with vertex colors.
export function carGeometry(body, stripe) {
  const glass = 0x243246;
  const tyre = 0x1d1d22;
  const parts = [
    box(1.3, 0.36, 2.4, 0, 0.38, 0, body),
    box(1.2, 0.2, 0.5, 0, 0.32, 1.42, body), // nose
    box(1.0, 0.36, 1.05, 0, 0.74, -0.22, glass), // cabin
    box(1.02, 0.08, 0.82, 0, 0.94, -0.26, body), // roof
    box(0.34, 0.02, 2.42, 0, 0.57, 0, stripe), // racing stripe
    box(0.34, 0.02, 0.52, 0, 0.43, 1.42, stripe),
    box(0.34, 0.02, 0.84, 0, 0.99, -0.26, stripe),
    box(1.44, 0.08, 0.36, 0, 0.94, -1.08, stripe), // rear wing
    box(0.08, 0.36, 0.14, -0.46, 0.74, -1.08, tyre),
    box(0.08, 0.36, 0.14, 0.46, 0.74, -1.08, tyre),
    box(0.28, 0.12, 0.04, -0.4, 0.48, 1.21, 0xfff4c0), // headlights
    box(0.28, 0.12, 0.04, 0.4, 0.48, 1.21, 0xfff4c0),
    box(0.3, 0.12, 0.04, -0.4, 0.46, -1.21, 0xff2a2a), // tail lights
    box(0.3, 0.12, 0.04, 0.4, 0.46, -1.21, 0xff2a2a),
  ];
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) parts.push(box(0.32, 0.44, 0.58, sx * 0.67, 0.22, sz * 0.8, tyre));
  }
  return mergeGeometries(parts);
}

export function createCarMesh(scene, material, body, stripe) {
  const mesh = new THREE.Mesh(carGeometry(body, stripe), material);
  mesh.rotation.order = 'YXZ'; // yaw first, then pitch and roll
  scene.add(mesh);
  return mesh;
}
