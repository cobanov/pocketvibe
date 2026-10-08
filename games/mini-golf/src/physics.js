// Ball physics on a course from course.js, in fixed sub-steps of 1/240 s so
// a fast ball never tunnels through a border and every shot plays out the
// same way. Rolling friction and a little drag slow the ball, slopes pull it
// downhill, borders bounce it, bumpers kick it, spinners and sliders push it,
// and the cup takes it if it arrives slowly enough. No three.js in here.

import { BAR_R, BUMPER_R, HUB_R, SAND, SPINNER, STONE, VOID, WALL_HALF, WATER, EMPTY, BLOCK } from './course.js';

export const BALL_R = 0.13;
export const CUP_R = 0.28;
export const STEP = 1 / 240;
export const MAX_SPEED = 12;

const G = 9; // gravity along the slopes
const FRICTION = 2.1; // rolling friction, units per second squared
const SAND_FRICTION = 7;
const DRAG = 0.06; // extra slowdown per unit of speed
const SHOT_RANGE = 26; // flat distance of a full-power putt, before drag
const STOP_SPEED = 0.05;
const WALL_E = 0.66; // restitution of borders and blocks
const MOVER_E = 0.6;
const BUMPER_E = 0.85;
const BUMPER_KICK = 1.6; // bumpers add a little speed on every hit
const CUP_PULL_R = 0.46; // the green dips slightly around the cup...
const CUP_PULL = 2.4; // ...so a slow ball on the lip still drops in
const CAPTURE_EDGE = 1.5; // fastest speed the cup takes at its rim
const CAPTURE_CENTER = 2.6; // ...and dead centre
const LIP_MAX = 4.4; // faster than this, the ball just hops over the cup
const LIP_TURN = 0.75;

// Hit kinds, for effects.
export const HIT_NONE = 0;
export const HIT_WOOD = 1;
export const HIT_STONE = 2;
export const HIT_BUMPER = 3;
export const HIT_MOVER = 4;

// What a step reports.
export const EV_NONE = 0;
export const EV_HIT = 1; // see ball.hitKind
export const EV_STOP = 2;
export const EV_CUP = 3;
export const EV_LIP = 4;
export const EV_WATER = 5;
export const EV_OUT = 6;

export function createBall() {
  return {
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    moving: false,
    inCup: false, // inside the cup's rim on this pass, after a lip-out
    onSand: false,
    hitKind: HIT_NONE, // the hardest hit of the last step
    hitSpeed: 0,
    hitX: 0,
    hitZ: 0,
    hitIndex: -1, // bumper or mover index
  };
}

// Launch speed for a power between 0 and 1. The square root makes the
// distance on flat ground grow about linearly with the meter.
export function shotSpeed(power) {
  return Math.sqrt(2 * FRICTION * SHOT_RANGE * power);
}

export function shoot(b, angle, power) {
  const s = shotSpeed(power);
  b.vx = Math.cos(angle) * s;
  b.vz = Math.sin(angle) * s;
  b.moving = true;
  b.inCup = false;
}

// Pose and velocity of a moving obstacle at time t.
export function moverPose(m, t, out) {
  if (m.type === SPINNER) {
    out.x = m.x;
    out.z = m.z;
    out.angle = m.phase + m.speed * t;
    out.vx = 0;
    out.vz = 0;
  } else {
    const w = (Math.PI * 2) / m.period;
    const a = w * t + m.phase;
    const s = 0.5 - 0.5 * Math.cos(a);
    const ds = 0.5 * Math.sin(a) * w;
    out.x = m.x0 + (m.x1 - m.x0) * s;
    out.z = m.z0 + (m.z1 - m.z0) * s;
    out.angle = 0;
    out.vx = (m.x1 - m.x0) * ds;
    out.vz = (m.z1 - m.z0) * ds;
  }
  return out;
}

const grad = [0, 0];
const pose = { x: 0, z: 0, angle: 0, vx: 0, vz: 0 };
let contactX = 0; // normal of the last static contact in a step, for resting
let contactZ = 0;

function noteHit(b, kind, speed, x, z, index) {
  if (speed <= b.hitSpeed) return;
  b.hitKind = kind;
  b.hitSpeed = speed;
  b.hitX = x;
  b.hitZ = z;
  b.hitIndex = index;
}

// Reflects the ball's velocity relative to a surface moving at (svx, svz)
// with normal (nx, nz). Returns the speed of the impact.
function bounce(b, nx, nz, e, svx, svz) {
  const vn = (b.vx - svx) * nx + (b.vz - svz) * nz;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx;
  b.vz -= (1 + e) * vn * nz;
  return -vn;
}

// Pushes the ball out of a segment thickened to radius r. Returns the
// contact normal through contactX/Z, or false if there is no contact.
function pushOutOfSegment(b, ax, az, bx, bz, r) {
  const ex = bx - ax;
  const ez = bz - az;
  let s = ((b.x - ax) * ex + (b.z - az) * ez) / (ex * ex + ez * ez);
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const qx = ax + ex * s;
  const qz = az + ez * s;
  let dx = b.x - qx;
  let dz = b.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    dx = -ez;
    dz = ex;
    d = Math.hypot(dx, dz);
  }
  contactX = dx / d;
  contactZ = dz / d;
  b.x = qx + contactX * r;
  b.z = qz + contactZ * r;
  return true;
}

function pushOutOfCircle(b, cx, cz, r) {
  const dx = b.x - cx;
  const dz = b.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  const d = Math.sqrt(d2) || 1e-6;
  contactX = d2 > 0 ? dx / d : 1;
  contactZ = d2 > 0 ? dz / d : 0;
  b.x = cx + contactX * r;
  b.z = cz + contactZ * r;
  return true;
}

function collideMovers(b, c, t) {
  const movers = c.movers;
  for (let i = 0; i < movers.length; i++) {
    const m = movers[i];
    moverPose(m, t, pose);
    if (m.type === SPINNER) {
      if (pushOutOfCircle(b, pose.x, pose.z, HUB_R + BALL_R)) {
        const v = bounce(b, contactX, contactZ, WALL_E, 0, 0);
        noteHit(b, HIT_MOVER, v, b.x - contactX * BALL_R, b.z - contactZ * BALL_R, i);
      }
      const ex = Math.cos(pose.angle) * m.len;
      const ez = Math.sin(pose.angle) * m.len;
      if (pushOutOfSegment(b, pose.x - ex, pose.z - ez, pose.x + ex, pose.z + ez, BAR_R + BALL_R)) {
        // The bar's surface moves with the spin: omega x r at the contact.
        const px = b.x - contactX * (BAR_R + BALL_R) - pose.x;
        const pz = b.z - contactZ * (BAR_R + BALL_R) - pose.z;
        const v = bounce(b, contactX, contactZ, MOVER_E, -m.speed * pz, m.speed * px);
        noteHit(b, HIT_MOVER, Math.max(v, 0.5), pose.x + px, pose.z + pz, i);
      }
    } else {
      // An axis-aligned box: find the closest point of it to the ball.
      const minX = pose.x - m.hw;
      const maxX = pose.x + m.hw;
      const minZ = pose.z - m.hd;
      const maxZ = pose.z + m.hd;
      const qx = b.x < minX ? minX : b.x > maxX ? maxX : b.x;
      const qz = b.z < minZ ? minZ : b.z > maxZ ? maxZ : b.z;
      let dx = b.x - qx;
      let dz = b.z - qz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= BALL_R * BALL_R) continue;
      let nx;
      let nz;
      if (d2 < 1e-12) {
        // The centre got inside: leave by the nearest face.
        const l = b.x - minX;
        const r = maxX - b.x;
        const u = b.z - minZ;
        const w = maxZ - b.z;
        const least = Math.min(l, r, u, w);
        nx = least === l ? -1 : least === r ? 1 : 0;
        nz = nx !== 0 ? 0 : least === u ? -1 : 1;
        b.x = nx < 0 ? minX - BALL_R : nx > 0 ? maxX + BALL_R : b.x;
        b.z = nz < 0 ? minZ - BALL_R : nz > 0 ? maxZ + BALL_R : b.z;
      } else {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        b.x = qx + nx * BALL_R;
        b.z = qz + nz * BALL_R;
      }
      const v = bounce(b, nx, nz, MOVER_E, pose.vx, pose.vz);
      noteHit(b, HIT_MOVER, Math.max(v, 0.5), qx, qz, i);
    }
  }
}

// Advances the ball by one sub-step at simulation tick `tick` and reports
// what happened.
export function step(b, c, tick) {
  b.hitKind = HIT_NONE;
  b.hitSpeed = 0;
  const t = tick * STEP;

  if (!b.moving) {
    // A resting ball can still be hit by a spinner or a slider.
    b.vx = 0;
    b.vz = 0;
    collideMovers(b, c, t);
    if (b.hitKind === HIT_NONE) return EV_NONE;
    b.moving = true;
    return EV_HIT;
  }

  // Forces: the slope, the dip around the cup, friction and drag.
  c.grad(b.x, b.z, grad);
  let ax = -G * grad[0];
  let az = -G * grad[1];
  const cdx = c.cup.x - b.x;
  const cdz = c.cup.z - b.z;
  const cd = Math.hypot(cdx, cdz);
  if (cd < CUP_PULL_R && cd > 1e-4) {
    const k = (CUP_PULL * (1 - cd / CUP_PULL_R)) / cd;
    ax += cdx * k;
    az += cdz * k;
  }
  b.onSand = c.kindAt(b.x, b.z) === SAND;
  const friction = b.onSand ? SAND_FRICTION : FRICTION;
  let speed = Math.hypot(b.vx, b.vz);
  if (speed > 0) {
    // Friction can stop the ball but never push it backwards.
    const slower = Math.max(0, speed - (friction + DRAG * speed) * STEP);
    b.vx *= slower / speed;
    b.vz *= slower / speed;
  }
  b.vx += ax * STEP;
  b.vz += az * STEP;
  speed = Math.hypot(b.vx, b.vz);
  if (speed > MAX_SPEED) {
    b.vx *= MAX_SPEED / speed;
    b.vz *= MAX_SPEED / speed;
  }
  b.x += b.vx * STEP;
  b.z += b.vz * STEP;

  // Collisions: moving obstacles first, then bumpers, then the borders.
  collideMovers(b, c, t);
  const bumpers = c.bumpers;
  for (let i = 0; i < bumpers.length; i++) {
    const p = bumpers[i];
    if (!pushOutOfCircle(b, p.x, p.z, BUMPER_R + BALL_R)) continue;
    const v = bounce(b, contactX, contactZ, BUMPER_E, 0, 0);
    if (v > 0) {
      b.vx += contactX * BUMPER_KICK;
      b.vz += contactZ * BUMPER_KICK;
    }
    noteHit(b, HIT_BUMPER, v + 1, p.x + contactX * BUMPER_R, p.z + contactZ * BUMPER_R, i);
  }
  let touchX = 0;
  let touchZ = 0;
  const cell = c.cellIndex(b.x, b.z);
  if (cell >= 0) {
    const segs = c.segs;
    const r = BALL_R + WALL_HALF;
    // Two passes, so a ball pushed out of one wall into another in a corner
    // ends up clear of both.
    for (let pass = 0; pass < 2; pass++) {
      for (let k = c.cellStart[cell]; k < c.cellStart[cell + 1]; k++) {
        const s = segs[c.cellSegs[k]];
        if (!pushOutOfSegment(b, s.ax, s.az, s.bx, s.bz, r)) continue;
        touchX = contactX;
        touchZ = contactZ;
        const v = bounce(b, contactX, contactZ, WALL_E, 0, 0);
        noteHit(b, s.kind === STONE ? HIT_STONE : HIT_WOOD, v, b.x - contactX * r, b.z - contactZ * r, -1);
      }
    }
  }

  // The cup. Each pass over it is decided once, when the ball crosses the
  // rim, by its speed and how close its line passes the centre: a slow ball
  // drops in, a quicker one lips out, a fast one hops over.
  const dx = c.cup.x - b.x;
  const dz = c.cup.z - b.z;
  const d = Math.hypot(dx, dz);
  speed = Math.hypot(b.vx, b.vz);
  if (d < CUP_R) {
    if (!b.inCup) {
      b.inCup = true;
      const off = speed > 1e-6 ? Math.abs(b.vx * dz - b.vz * dx) / speed : 0;
      const k = 1 - Math.min(1, off / CUP_R);
      if (speed < CAPTURE_EDGE + (CAPTURE_CENTER - CAPTURE_EDGE) * k) {
        b.moving = false;
        return EV_CUP;
      }
      if (speed < LIP_MAX) {
        // Swing the ball around the rim: the further off centre, the more.
        const side = b.vx * dz - b.vz * dx > 0 ? -1 : 1;
        const turn = side * LIP_TURN * (1 - k * 0.6) * (1 - (speed / LIP_MAX) * 0.7);
        const cs = Math.cos(turn) * 0.88;
        const sn = Math.sin(turn) * 0.88;
        const vx = b.vx * cs - b.vz * sn;
        b.vz = b.vx * sn + b.vz * cs;
        b.vx = vx;
        return EV_LIP;
      }
    } else if (speed < CAPTURE_EDGE * 0.4) {
      // Lipped out but rolled back in.
      b.moving = false;
      return EV_CUP;
    }
  } else if (d > CUP_R + 0.04) {
    b.inCup = false;
  }

  const under = c.kindAt(b.x, b.z);
  if (under === WATER) return EV_WATER;
  if (under === VOID || under === EMPTY || under === BLOCK) return EV_OUT;

  // Rest: slow enough, and the pull that is left (minus whatever a wall is
  // holding back) is weaker than friction.
  if (speed < STOP_SPEED) {
    let rx = ax;
    let rz = az;
    const into = rx * touchX + rz * touchZ;
    if (into < 0) {
      rx -= into * touchX;
      rz -= into * touchZ;
    }
    if (Math.hypot(rx, rz) < friction) {
      b.vx = 0;
      b.vz = 0;
      b.moving = false;
      return EV_STOP;
    }
  }
  return b.hitKind === HIT_NONE ? EV_NONE : EV_HIT;
}

// Distance along a ray from (x, z) in direction (dx, dz) to the first border
// or bumper a ball would touch, up to maxDist. The surface normal there is
// written to out[0], out[1] (both 0 if nothing was hit).
export function castRay(c, x, z, dx, dz, maxDist, out) {
  let best = maxDist;
  out[0] = 0;
  out[1] = 0;
  const segs = c.segs;
  const r = BALL_R + WALL_HALF;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ex = s.bx - s.ax;
    const ez = s.bz - s.az;
    const len = Math.hypot(ex, ez);
    const nx = -ez / len;
    const nz = ex / len;
    // The two sides of the thickened segment...
    const dn = dx * nx + dz * nz;
    const off = (x - s.ax) * nx + (z - s.az) * nz;
    if ((off >= r && dn < -1e-9) || (off <= -r && dn > 1e-9)) {
      const tHit = ((off > 0 ? r : -r) - off) / dn;
      if (tHit < best) {
        const px = x + dx * tHit - s.ax;
        const pz = z + dz * tHit - s.az;
        const along = (px * ex + pz * ez) / (len * len);
        if (along >= 0 && along <= 1) {
          best = tHit;
          out[0] = off > 0 ? nx : -nx;
          out[1] = off > 0 ? nz : -nz;
        }
      }
    }
    // ...and its round ends.
    best = rayCircle(x, z, dx, dz, s.ax, s.az, r, best, out);
    best = rayCircle(x, z, dx, dz, s.bx, s.bz, r, best, out);
  }
  const bumpers = c.bumpers;
  for (let i = 0; i < bumpers.length; i++) {
    best = rayCircle(x, z, dx, dz, bumpers[i].x, bumpers[i].z, BUMPER_R + BALL_R, best, out);
  }
  return best;
}

function rayCircle(x, z, dx, dz, cx, cz, r, best, out) {
  const fx = x - cx;
  const fz = z - cz;
  const bq = fx * dx + fz * dz;
  const cq = fx * fx + fz * fz - r * r;
  if (cq < 0 && bq < 0) return best; // starting inside: ignore
  const disc = bq * bq - cq;
  if (disc < 0) return best;
  const tHit = -bq - Math.sqrt(disc);
  if (tHit <= 0 || tHit >= best) return best;
  const hx = fx + dx * tHit;
  const hz = fz + dz * tHit;
  const hl = Math.hypot(hx, hz);
  out[0] = hx / hl;
  out[1] = hz / hl;
  return tHit;
}
