// Ball physics on the table plane, written by hand: one ball against capsule
// segments (walls, slingshots, drop targets, the lane gate), circles (posts
// and pop bumpers) and two rotating flippers. Fixed small sub-steps keep a
// fast ball from passing through thin walls. No three.js, no allocations
// after creation.

import {
  BALL_R,
  BOUNDS,
  DRAIN_Y,
  FLIPPER,
  GATE,
  LANE_WALL_X,
  LANE_X,
  PLUNGER_Y,
  PULL_DIST,
  SLING,
  TARGET,
  bumpers,
  lanes,
  posts,
  segments,
  targets,
} from './table.js';

const GRAVITY = 22; // table units per s², down the table
const STEP = 1 / 480; // seconds per physics sub-step
const MAX_STEPS = 24;
const MAX_SPEED = 36;
const DAMPING = 0.06; // share of speed lost per second (rolling friction, air)
const REST_SPEED = 0.9; // slower impacts do not bounce, so the ball settles

const FLIP_UP_SPEED = 24; // rad/s while the button is held
const FLIP_DOWN_SPEED = 14; // rad/s falling back
const FLIP_E = 0.3; // flipper rubber restitution

const BUMPER_KICK = 14; // speed a pop bumper throws the ball away with
const SLING_KICK = 12; // extra speed from a slingshot
const SLING_MIN = 2.5; // impact speed that fires a slingshot
const TARGET_MIN = 2.0; // impact speed that drops a target
const POST_E = 0.6;

const PULL_TIME = 1.2; // seconds to pull the plunger all the way back
const LAUNCH_MIN = 15;
const LAUNCH_MAX = 36;

// Events reported through onEvent(type, id, x, y).
export const EV_BUMPER = 1;
export const EV_SLING = 2;
export const EV_TARGET = 3;
export const EV_LANE = 4;
export const EV_LAUNCH = 5;
export const EV_FLIPPER = 6;

// Results of the last contact test, kept in module scope to avoid allocations.
let hitNx = 0;
let hitNy = 0;
let hitT = 0;

export function createPhysics(onEvent) {
  const ball = { x: LANE_X, y: 0, vx: 0, vy: 0 };

  function makeFlipper(side) {
    return {
      side, // 1 = left, -1 = right
      px: -side * FLIPPER.x,
      py: FLIPPER.y,
      angle: FLIPPER.rest,
      omega: 0, // world angular velocity, counter-clockwise positive
      held: false,
      dx: 0,
      dy: 0,
    };
  }
  const flippers = [makeFlipper(1), makeFlipper(-1)];

  const targetUp = new Uint8Array(targets.length).fill(1);
  const bumperCool = new Float32Array(bumpers.length);
  const slingCool = new Float32Array(2);
  const laneInside = new Uint8Array(lanes.length);
  const plunger = { pull: 0, y: PLUNGER_Y };
  let gravity = GRAVITY;
  let still = 0; // seconds the ball has barely moved
  let parked = false; // between balls the ball is off the table
  let flipperTouch = 0;

  function aim(f) {
    f.dx = f.side * Math.cos(f.angle);
    f.dy = Math.sin(f.angle);
  }
  aim(flippers[0]);
  aim(flippers[1]);

  // Pushes the ball out of a capsule from (ax, ay) to (bx, by) and bounces it.
  // Returns the impact speed, or -1 without contact.
  function capsule(ax, ay, bx, by, invLen2, radius, e) {
    const abx = bx - ax;
    const aby = by - ay;
    let t = ((ball.x - ax) * abx + (ball.y - ay) * aby) * invLen2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = ball.x - (ax + abx * t);
    const dy = ball.y - (ay + aby * t);
    const min = BALL_R + radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return -1;
    const d = Math.sqrt(d2);
    hitNx = dx / d;
    hitNy = dy / d;
    hitT = t;
    ball.x += hitNx * (min - d);
    ball.y += hitNy * (min - d);
    const vn = ball.vx * hitNx + ball.vy * hitNy;
    if (vn >= 0) return 0;
    const k = (-vn > REST_SPEED ? 1 + e : 1) * vn;
    ball.vx -= k * hitNx;
    ball.vy -= k * hitNy;
    return -vn;
  }

  function circle(cx, cy, radius, e) {
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const min = BALL_R + radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return -1;
    const d = Math.sqrt(d2);
    hitNx = dx / d;
    hitNy = dy / d;
    ball.x += hitNx * (min - d);
    ball.y += hitNy * (min - d);
    const vn = ball.vx * hitNx + ball.vy * hitNy;
    if (vn >= 0) return 0;
    const k = (-vn > REST_SPEED ? 1 + e : 1) * vn;
    ball.vx -= k * hitNx;
    ball.vy -= k * hitNy;
    return -vn;
  }

  // A flipper is a tapered capsule turning around its pivot. The rubber moves
  // with the flipper, so the bounce uses the ball speed relative to it.
  function flipper(f) {
    const len = FLIPPER.len;
    let t = ((ball.x - f.px) * f.dx + (ball.y - f.py) * f.dy) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const rx = f.dx * len * t;
    const ry = f.dy * len * t;
    const dx = ball.x - (f.px + rx);
    const dy = ball.y - (f.py + ry);
    const min = BALL_R + FLIPPER.rb + (FLIPPER.rt - FLIPPER.rb) * t;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    ball.x += nx * (min - d);
    ball.y += ny * (min - d);
    // Velocity of the rubber at the contact point.
    const pvx = -f.omega * ry;
    const pvy = f.omega * rx;
    const rvx = ball.vx - pvx;
    const rvy = ball.vy - pvy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const k = (-vn > REST_SPEED ? 1 + FLIP_E : 1) * vn;
    ball.vx -= k * nx;
    ball.vy -= k * ny;
    if (-vn > 4) flipperTouch = -vn;
  }

  function step(h) {
    // Flippers move first, so a rising flipper pushes the ball this step.
    for (let i = 0; i < 2; i++) {
      const f = flippers[i];
      const prev = f.angle;
      if (f.held) f.angle = Math.min(FLIPPER.up, f.angle + FLIP_UP_SPEED * h);
      else f.angle = Math.max(FLIPPER.rest, f.angle - FLIP_DOWN_SPEED * h);
      f.omega = (f.side * (f.angle - prev)) / h;
      if (f.angle !== prev) aim(f);
    }

    if (parked) return;
    ball.vy -= gravity * h;
    const damp = 1 - DAMPING * h;
    ball.vx *= damp;
    ball.vy *= damp;
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (ball.x < s.minX || ball.x > s.maxX || ball.y < s.minY || ball.y > s.maxY) continue;
      if (s.kind === TARGET && !targetUp[s.id]) continue;
      if (s.kind === GATE) {
        // Solid only for a ball above it that moves towards it.
        if ((ball.x - s.ax) * s.nx + (ball.y - s.ay) * s.ny < 0) continue;
        if (ball.vx * s.nx + ball.vy * s.ny > 0) continue;
      }
      const impact = capsule(s.ax, s.ay, s.bx, s.by, s.invLen2, s.r, s.e);
      if (impact < 0) continue;
      if (s.kind === SLING) {
        if (impact > SLING_MIN && hitT > 0.06 && hitT < 0.94 && slingCool[s.id] <= 0) {
          ball.vx += hitNx * SLING_KICK;
          ball.vy += hitNy * SLING_KICK;
          slingCool[s.id] = 0.12;
          onEvent(EV_SLING, s.id, ball.x, ball.y);
        }
      } else if (s.kind === TARGET) {
        if (impact > TARGET_MIN) {
          targetUp[s.id] = 0;
          onEvent(EV_TARGET, s.id, ball.x, ball.y);
        }
      }
    }

    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      circle(p.x, p.y, p.r, POST_E);
    }

    for (let i = 0; i < bumpers.length; i++) {
      const b = bumpers[i];
      if (circle(b.x, b.y, b.r, 0.5) < 0) continue;
      // The bumper fires and throws the ball away from its center.
      const vn = ball.vx * hitNx + ball.vy * hitNy;
      if (vn < BUMPER_KICK) {
        ball.vx += (BUMPER_KICK - vn) * hitNx;
        ball.vy += (BUMPER_KICK - vn) * hitNy;
      }
      if (bumperCool[i] <= 0) {
        bumperCool[i] = 0.1;
        onEvent(EV_BUMPER, i, b.x, b.y);
      }
    }

    flipper(flippers[0]);
    flipper(flippers[1]);

    // The plunger is a floor in the lane that only pushes up.
    if (ball.x > LANE_WALL_X && ball.y < plunger.y + BALL_R + 0.1) {
      ball.y = plunger.y + BALL_R + 0.1;
      if (ball.vy < 0) ball.vy = -ball.vy > 3 ? -ball.vy * 0.15 : 0;
    }

    const v2 = ball.vx * ball.vx + ball.vy * ball.vy;
    if (v2 > MAX_SPEED * MAX_SPEED) {
      const k = MAX_SPEED / Math.sqrt(v2);
      ball.vx *= k;
      ball.vy *= k;
    }

    // Rollover lanes report the moment the ball enters them.
    for (let i = 0; i < lanes.length; i++) {
      const l = lanes[i];
      const inside = ball.x > l.x0 && ball.x < l.x1 && ball.y > l.y0 && ball.y < l.y1 ? 1 : 0;
      if (inside && !laneInside[i]) onEvent(EV_LANE, i, l.x, (l.y0 + l.y1) / 2);
      laneInside[i] = inside;
    }
  }

  return {
    ball,
    flippers,
    targetUp,
    plunger,

    // Puts the ball on the plunger.
    serve() {
      ball.x = LANE_X;
      ball.y = PLUNGER_Y + BALL_R + 0.1;
      ball.vx = 0;
      ball.vy = 0;
      plunger.pull = 0;
      plunger.y = PLUNGER_Y;
      still = 0;
      parked = false;
      laneInside.fill(0);
    },

    // Takes the ball off the table (after a drain, on game over).
    park() {
      parked = true;
      ball.x = 0;
      ball.y = DRAIN_Y - 3;
      ball.vx = 0;
      ball.vy = 0;
    },

    // Gravity scale, so the table can get a little faster as the game goes on.
    setGravity(scale) {
      gravity = GRAVITY * scale;
    },

    inLane() {
      return !parked && ball.x > LANE_WALL_X;
    },

    // Stands the targets of a bank up again. Returns false (and leaves them
    // down) while the ball is right in front of the bank.
    raiseBank(bank) {
      for (let i = bank * 3; i < bank * 3 + 3; i++) {
        const t = targets[i];
        if (Math.hypot(ball.x - t.x, ball.y - t.y) < 1.0) return false;
      }
      for (let i = bank * 3; i < bank * 3 + 3; i++) targetUp[i] = 1;
      return true;
    },

    raiseAll() {
      targetUp.fill(1);
    },

    // True if the ball somehow left the cabinet (a safety net, never expected).
    lost() {
      return !parked && !(ball.x > BOUNDS.x0 && ball.x < BOUNDS.x1 && ball.y < BOUNDS.y1 && ball.y > BOUNDS.y0 - 2);
    },

    // left/right: flipper buttons held. pull: plunger button held.
    update(dt, left, right, pull) {
      flippers[0].held = left;
      flippers[1].held = right;

      // Plunger: holding pulls it back, letting go fires the ball.
      if (pull) {
        plunger.pull = Math.min(1, plunger.pull + dt / PULL_TIME);
      } else if (plunger.pull > 0) {
        const onPlunger = ball.x > LANE_WALL_X && ball.y < plunger.y + BALL_R + 0.3;
        if (onPlunger && plunger.pull > 0.04) {
          // S-shaped power curve (cubic, 0 -> 1): flat in the middle of the
          // pull, where the launch speeds that reach the top lanes are, so a
          // skill shot is a matter of timing rather than luck.
          const p = plunger.pull;
          const power = p * (3.06 + p * (-4.66 + p * 2.6));
          ball.vy = LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * power;
          ball.y = PLUNGER_Y + BALL_R + 0.1;
          onEvent(EV_LAUNCH, 0, ball.x, ball.y);
        }
        plunger.pull = 0;
      }
      plunger.y = PLUNGER_Y - plunger.pull * PULL_DIST;

      for (let i = 0; i < bumpers.length; i++) bumperCool[i] -= dt;
      slingCool[0] -= dt;
      slingCool[1] -= dt;

      let n = Math.ceil(dt / STEP);
      if (n > MAX_STEPS) n = MAX_STEPS;
      const h = dt / n;
      flipperTouch = 0;
      for (let i = 0; i < n; i++) step(h);
      if (flipperTouch > 0) onEvent(EV_FLIPPER, 0, ball.x, ball.y);

      // Safety net: a ball that sits still away from the flippers and the
      // plunger gets a small nudge, so it can never stay stuck.
      const speed2 = ball.vx * ball.vx + ball.vy * ball.vy;
      if (!parked && speed2 < 0.25 && ball.x < LANE_WALL_X && !left && !right) {
        still += dt;
        if (still > 2.5) {
          still = 0;
          ball.vy += 7;
          ball.vx += ball.x > 0 ? -3 : 3;
        }
      } else {
        still = 0;
      }
    },
  };
}
