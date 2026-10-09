// Ball physics on the table plane, written by hand: up to two balls against
// capsule segments (walls, slingshots, drop targets, the lane gate), circles
// (posts and pop bumpers), two rotating flippers and each other. Fixed small
// sub-steps keep a fast ball from passing through thin walls. No three.js, no
// allocations after creation.

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
  SPINNER,
  TARGET,
  bumpers,
  lanes,
  posts,
  segments,
  targets,
} from './table.js';

export const MAX_BALLS = 2; // multiball plays two

const GRAVITY = 22; // table units per s², down the table
const STEP = 1 / 480; // seconds per physics sub-step
const MAX_STEPS = 24;
const MAX_SPEED = 36;
const DAMPING = 0.06; // share of speed lost per second (rolling friction, air)
const REST_SPEED = 0.9; // slower impacts do not bounce, so the ball settles
const BALL_E = 0.85; // ball against ball

const FLIP_UP_SPEED = 24; // rad/s while the button is held
const FLIP_DOWN_SPEED = 14; // rad/s falling back
const FLIP_E = 0.3; // flipper rubber restitution

const BUMPER_KICK = 14; // speed a pop bumper throws the ball away with
const SLING_KICK = 12; // extra speed from a slingshot
const SLING_MIN = 2.5; // impact speed that fires a slingshot
const TARGET_MIN = 2.0; // impact speed that drops a target
const POST_E = 0.6;
const WALL_MIN = 5; // impact speed reported as a wall hit (for the sound)

const SPIN_KICK = 2.6; // spinner rad/s per unit of ball speed through it
const SPIN_DRAG = 0.8; // share of spin lost per second
const SPIN_FRICTION = 3; // rad/s² that always slows it, so it comes to rest

const PULL_TIME = 1.2; // seconds to pull the plunger all the way back
const LAUNCH_MIN = 15;
const LAUNCH_MAX = 36;
const AUTO_LAUNCH = 30; // a ball the table kicks out itself (multiball)

const NUDGE_UP = 4.5; // a nudge lifts every ball up the table...
const NUDGE_IN = 1.5; // ...and a little towards the middle

// Events reported through onEvent(type, id, x, y, power).
export const EV_BUMPER = 1;
export const EV_SLING = 2;
export const EV_TARGET = 3;
export const EV_LANE = 4;
export const EV_LAUNCH = 5; // id 0: the player's plunger, 1: kicked out by the table
export const EV_FLIPPER = 6; // the ball hit a flipper; id is the side, power the impact
export const EV_SPIN = 7; // the spinner turned half a turn; power is its speed (rad/s)
export const EV_WALL = 8; // the ball hit a wall or post hard; power is the impact

// Results of the last contact test, kept in module scope to avoid allocations.
let hitNx = 0;
let hitNy = 0;
let hitT = 0;

export function createPhysics(onEvent) {
  const balls = [];
  for (let i = 0; i < MAX_BALLS; i++) balls.push({ x: LANE_X, y: 0, vx: 0, vy: 0, active: false, still: 0 });
  let o = balls[0]; // the ball being stepped

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
  const laneInside = new Uint8Array(lanes.length * MAX_BALLS);
  const plunger = { pull: 0, y: PLUNGER_Y };
  const spinner = { angle: 0, speed: 0 };
  let gravity = GRAVITY;
  let tilted = false; // flippers, bumpers and slingshots dead
  let flipperTouch = 0;
  let flipperSide = 0;
  let wallTouch = 0;
  let touchX = 0;
  let touchY = 0;

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
    let t = ((o.x - ax) * abx + (o.y - ay) * aby) * invLen2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = o.x - (ax + abx * t);
    const dy = o.y - (ay + aby * t);
    const min = BALL_R + radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return -1;
    const d = Math.sqrt(d2);
    hitNx = dx / d;
    hitNy = dy / d;
    hitT = t;
    o.x += hitNx * (min - d);
    o.y += hitNy * (min - d);
    const vn = o.vx * hitNx + o.vy * hitNy;
    if (vn >= 0) return 0;
    const k = (-vn > REST_SPEED ? 1 + e : 1) * vn;
    o.vx -= k * hitNx;
    o.vy -= k * hitNy;
    return -vn;
  }

  function circle(cx, cy, radius, e) {
    const dx = o.x - cx;
    const dy = o.y - cy;
    const min = BALL_R + radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return -1;
    const d = Math.sqrt(d2);
    hitNx = dx / d;
    hitNy = dy / d;
    o.x += hitNx * (min - d);
    o.y += hitNy * (min - d);
    const vn = o.vx * hitNx + o.vy * hitNy;
    if (vn >= 0) return 0;
    const k = (-vn > REST_SPEED ? 1 + e : 1) * vn;
    o.vx -= k * hitNx;
    o.vy -= k * hitNy;
    return -vn;
  }

  function wallHit(impact) {
    if (impact > WALL_MIN && impact > wallTouch) {
      wallTouch = impact;
      touchX = o.x;
      touchY = o.y;
    }
  }

  // A flipper is a tapered capsule turning around its pivot. The rubber moves
  // with the flipper, so the bounce uses the ball speed relative to it.
  function flipper(f) {
    const len = FLIPPER.len;
    let t = ((o.x - f.px) * f.dx + (o.y - f.py) * f.dy) / len;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const rx = f.dx * len * t;
    const ry = f.dy * len * t;
    const dx = o.x - (f.px + rx);
    const dy = o.y - (f.py + ry);
    const min = BALL_R + FLIPPER.rb + (FLIPPER.rt - FLIPPER.rb) * t;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    o.x += nx * (min - d);
    o.y += ny * (min - d);
    // Velocity of the rubber at the contact point.
    const pvx = -f.omega * ry;
    const pvy = f.omega * rx;
    const rvx = o.vx - pvx;
    const rvy = o.vy - pvy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const k = (-vn > REST_SPEED ? 1 + FLIP_E : 1) * vn;
    o.vx -= k * nx;
    o.vy -= k * ny;
    if (-vn > 4 && -vn > flipperTouch) {
      flipperTouch = -vn;
      flipperSide = f.side > 0 ? 0 : 1;
      touchX = o.x;
      touchY = o.y;
    }
  }

  // One sub-step of the ball in o (number k).
  function moveBall(h, k) {
    o.vy -= gravity * h;
    const damp = 1 - DAMPING * h;
    o.vx *= damp;
    o.vy *= damp;
    const py = o.y;
    o.x += o.vx * h;
    o.y += o.vy * h;

    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (o.x < s.minX || o.x > s.maxX || o.y < s.minY || o.y > s.maxY) continue;
      if (s.kind === TARGET && !targetUp[s.id]) continue;
      if (s.kind === GATE) {
        // Solid only for a ball above it that moves towards it.
        if ((o.x - s.ax) * s.nx + (o.y - s.ay) * s.ny < 0) continue;
        if (o.vx * s.nx + o.vy * s.ny > 0) continue;
      }
      const impact = capsule(s.ax, s.ay, s.bx, s.by, s.invLen2, s.r, s.e);
      if (impact < 0) continue;
      if (s.kind === SLING) {
        if (!tilted && impact > SLING_MIN && hitT > 0.06 && hitT < 0.94 && slingCool[s.id] <= 0) {
          o.vx += hitNx * SLING_KICK;
          o.vy += hitNy * SLING_KICK;
          slingCool[s.id] = 0.12;
          onEvent(EV_SLING, s.id, o.x, o.y, impact);
        } else wallHit(impact);
      } else if (s.kind === TARGET) {
        if (impact > TARGET_MIN) {
          targetUp[s.id] = 0;
          onEvent(EV_TARGET, s.id, o.x, o.y, impact);
        }
      } else wallHit(impact);
    }

    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      wallHit(circle(p.x, p.y, p.r, POST_E));
    }

    for (let i = 0; i < bumpers.length; i++) {
      const b = bumpers[i];
      if (circle(b.x, b.y, b.r, 0.5) < 0 || tilted) continue;
      // The bumper fires and throws the ball away from its center.
      const vn = o.vx * hitNx + o.vy * hitNy;
      if (vn < BUMPER_KICK) {
        o.vx += (BUMPER_KICK - vn) * hitNx;
        o.vy += (BUMPER_KICK - vn) * hitNy;
      }
      if (bumperCool[i] <= 0) {
        bumperCool[i] = 0.1;
        onEvent(EV_BUMPER, i, b.x, b.y, 1);
      }
    }

    flipper(flippers[0]);
    flipper(flippers[1]);

    // The plunger is a floor in the lane that only pushes up.
    if (o.x > LANE_WALL_X && o.y < plunger.y + BALL_R + 0.1) {
      o.y = plunger.y + BALL_R + 0.1;
      if (o.vy < 0) o.vy = -o.vy > 3 ? -o.vy * 0.15 : 0;
    }

    const v2 = o.vx * o.vx + o.vy * o.vy;
    if (v2 > MAX_SPEED * MAX_SPEED) {
      const s = MAX_SPEED / Math.sqrt(v2);
      o.vx *= s;
      o.vy *= s;
    }

    // A ball rolling through the spinner lane sets the spinner turning (in
    // its direction) and loses a little speed to it.
    if ((py - SPINNER.y) * (o.y - SPINNER.y) < 0 && o.x > SPINNER.x0 && o.x < SPINNER.x1) {
      const kick = Math.abs(o.vy) * SPIN_KICK;
      if (kick > Math.abs(spinner.speed)) spinner.speed = o.vy > 0 ? kick : -kick;
      o.vy *= 0.94;
    }

    // Rollover lanes report the moment the ball enters them.
    for (let i = 0; i < lanes.length; i++) {
      const l = lanes[i];
      const inside = o.x > l.x0 && o.x < l.x1 && o.y > l.y0 && o.y < l.y1 ? 1 : 0;
      const j = k * lanes.length + i;
      if (inside && !laneInside[j]) onEvent(EV_LANE, i, l.x, (l.y0 + l.y1) / 2, 1);
      laneInside[j] = inside;
    }
  }

  // Two balls touching bounce off each other like billiard balls.
  function collideBalls() {
    const a = balls[0];
    const b = balls[1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const min = BALL_R * 2;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 < 1e-12) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const push = (min - d) / 2;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn >= 0) return;
    const j = (-vn > REST_SPEED ? (1 + BALL_E) / 2 : 0.5) * vn;
    a.vx += j * nx;
    a.vy += j * ny;
    b.vx -= j * nx;
    b.vy -= j * ny;
    if (-vn > WALL_MIN && -vn > wallTouch) {
      wallTouch = -vn;
      touchX = a.x + nx * BALL_R;
      touchY = a.y + ny * BALL_R;
    }
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
    for (let k = 0; k < MAX_BALLS; k++) {
      o = balls[k];
      if (o.active) moveBall(h, k);
    }
    if (balls[0].active && balls[1].active) collideBalls();
  }

  function place(b, x, y) {
    b.x = x;
    b.y = y;
    b.vx = 0;
    b.vy = 0;
    b.still = 0;
    b.active = true;
  }

  return {
    balls,
    flippers,
    targetUp,
    plunger,
    spinner,

    // Puts ball i on the plunger and takes the others off the table.
    serve(i = 0) {
      for (let k = 0; k < MAX_BALLS; k++) balls[k].active = false;
      place(balls[i], LANE_X, PLUNGER_Y + BALL_R + 0.1);
      plunger.pull = 0;
      plunger.y = PLUNGER_Y;
      laneInside.fill(0);
      spinner.speed = 0;
    },

    // The table kicks ball i out of the plunger lane by itself (multiball,
    // a saved ball during multiball). Returns false if the lane is busy.
    kickOut(i) {
      for (let k = 0; k < MAX_BALLS; k++) {
        const b = balls[k];
        if (k !== i && b.active && b.x > LANE_WALL_X && b.y < 4) return false;
      }
      const b = balls[i];
      place(b, LANE_X, PLUNGER_Y + BALL_R + 0.1);
      b.vy = AUTO_LAUNCH + Math.random() * 2;
      for (let j = 0; j < lanes.length; j++) laneInside[i * lanes.length + j] = 0;
      onEvent(EV_LAUNCH, 1, b.x, b.y, 1);
      return true;
    },

    // An inactive ball, or -1.
    freeBall() {
      for (let k = 0; k < MAX_BALLS; k++) if (!balls[k].active) return k;
      return -1;
    },

    activeCount() {
      let n = 0;
      for (let k = 0; k < MAX_BALLS; k++) if (balls[k].active) n++;
      return n;
    },

    // Takes ball i off the table (drained), or every ball without i.
    park(i) {
      for (let k = 0; k < MAX_BALLS; k++) {
        if (i !== undefined && k !== i) continue;
        const b = balls[k];
        b.active = false;
        b.x = 0;
        b.y = DRAIN_Y - 3;
        b.vx = 0;
        b.vy = 0;
      }
    },

    // Gravity scale, so the table can get a little faster as the game goes on.
    setGravity(scale) {
      gravity = GRAVITY * scale;
    },

    // A tilted table: flippers, bumpers and slingshots stop working.
    setTilt(on) {
      tilted = on;
    },

    // Bumps the cabinet: every ball on the playfield jumps a little.
    nudge() {
      for (let k = 0; k < MAX_BALLS; k++) {
        const b = balls[k];
        if (!b.active || b.x > LANE_WALL_X) continue;
        b.vy += NUDGE_UP;
        b.vx += b.x > 0 ? -NUDGE_IN : NUDGE_IN;
      }
    },

    inLane(i = 0) {
      const b = balls[i];
      return b.active && b.x > LANE_WALL_X;
    },

    // Stands the targets of a bank up again. Returns false (and leaves them
    // down) while a ball is right in front of the bank.
    raiseBank(bank) {
      for (let k = 0; k < MAX_BALLS; k++) {
        const b = balls[k];
        if (!b.active) continue;
        for (let i = bank * 3; i < bank * 3 + 3; i++) {
          const t = targets[i];
          if (Math.hypot(b.x - t.x, b.y - t.y) < 1.0) return false;
        }
      }
      for (let i = bank * 3; i < bank * 3 + 3; i++) targetUp[i] = 1;
      return true;
    },

    raiseAll() {
      targetUp.fill(1);
    },

    // True if ball i somehow left the cabinet (a safety net, never expected).
    lost(i = 0) {
      const b = balls[i];
      return b.active && !(b.x > BOUNDS.x0 && b.x < BOUNDS.x1 && b.y < BOUNDS.y1 && b.y > BOUNDS.y0 - 2);
    },

    // left/right: flipper buttons held. pull: plunger button held.
    update(dt, left, right, pull) {
      flippers[0].held = left && !tilted;
      flippers[1].held = right && !tilted;

      // Plunger: holding pulls it back, letting go fires the ball on it.
      if (pull) {
        plunger.pull = Math.min(1, plunger.pull + dt / PULL_TIME);
      } else if (plunger.pull > 0) {
        for (let k = 0; k < MAX_BALLS; k++) {
          const b = balls[k];
          const onPlunger = b.active && b.x > LANE_WALL_X && b.y < plunger.y + BALL_R + 0.3;
          if (onPlunger && plunger.pull > 0.04) {
            // S-shaped power curve (cubic, 0 -> 1): flat in the middle of the
            // pull, where the launch speeds that reach the top lanes are, so a
            // skill shot is a matter of timing rather than luck.
            const p = plunger.pull;
            const power = p * (3.06 + p * (-4.66 + p * 2.6));
            b.vy = LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * power;
            b.y = PLUNGER_Y + BALL_R + 0.1;
            onEvent(EV_LAUNCH, 0, b.x, b.y, p);
          }
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
      wallTouch = 0;
      for (let i = 0; i < n; i++) step(h);
      if (flipperTouch > 0) onEvent(EV_FLIPPER, flipperSide, touchX, touchY, flipperTouch);
      else if (wallTouch > 0) onEvent(EV_WALL, 0, touchX, touchY, wallTouch);

      // The spinner turns down; every half turn is reported (at most one a
      // frame, which keeps up with the fastest spin).
      if (spinner.speed !== 0) {
        const before = Math.floor(spinner.angle / Math.PI);
        spinner.angle += spinner.speed * dt;
        const slow = (Math.abs(spinner.speed) * SPIN_DRAG + SPIN_FRICTION) * dt;
        spinner.speed = Math.abs(spinner.speed) <= slow ? 0 : spinner.speed - Math.sign(spinner.speed) * slow;
        if (Math.floor(spinner.angle / Math.PI) !== before) onEvent(EV_SPIN, 0, (SPINNER.x0 + SPINNER.x1) / 2, SPINNER.y, Math.abs(spinner.speed));
        // Let it come to rest flat (hanging straight down) when it stops.
        if (spinner.speed === 0) spinner.angle = Math.round(spinner.angle / Math.PI) * Math.PI;
      }

      // Safety net: a ball that sits still away from the flippers and the
      // plunger gets a small nudge, so it can never stay stuck.
      for (let k = 0; k < MAX_BALLS; k++) {
        const b = balls[k];
        if (!b.active) continue;
        const speed2 = b.vx * b.vx + b.vy * b.vy;
        if (speed2 < 0.25 && b.x < LANE_WALL_X && !(left && !tilted) && !(right && !tilted)) {
          b.still += dt;
          if (b.still > 2.5) {
            b.still = 0;
            b.vy += 7;
            b.vx += b.x > 0 ? -3 : 3;
          }
        } else {
          b.still = 0;
        }
      }
    },
  };
}
