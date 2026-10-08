// Balls: a small pool (multi-ball keeps up to 3 in play) moved in sub-steps
// so a fast ball never tunnels through a brick or a wall. Each sub-step moves
// along x, resolves collisions, then moves along z and resolves again; the
// ball is treated as a square for bricks, which keeps seams between bricks
// clean.

import * as THREE from 'three';
import { BRICK_HD, BRICK_HW } from './bricks.js';
import {
  BALL_R,
  BALL_Y,
  FIELD_BOTTOM,
  FIELD_L,
  FIELD_R,
  FIELD_TOP,
  PADDLE_D,
  PADDLE_Z,
  clamp,
} from './shared.js';

const SLOTS = 5; // lost balls keep a slot while they fall off the edge
export const MAX_ALIVE = 3;
const STEP = 0.12; // longest move per sub-step, well under the ball radius
const MIN_DZ = 0.34; // at least this share of the motion goes up or down the field
const MIN_DX = Math.sqrt(1 - MIN_DZ * MIN_DZ);
const MAX_ANGLE = 1.05; // radians off vertical at the paddle's very edge
const IDLE_LIMIT = 6; // seconds without touching paddle or brick before a nudge
const IDLE_AGAIN = 2; // then a nudge every this many seconds
const FALL_TIME = 0.8;
const POP_TIME = 0.12;
const TRAIL = 6;
const HIST = TRAIL + 1; // positions kept per ball: the current one plus the trail
const EPS = 0.002;

export function createBalls(scene, bricks, paddle, events) {
  const ballMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(BALL_R, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x6a6a80 }),
    SLOTS,
  );
  ballMesh.frustumCulled = false;
  scene.add(ballMesh);

  const trailMaterial = new THREE.MeshBasicMaterial({ color: 0x8fe9ff });
  const trailMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(BALL_R * 0.75, 0),
    trailMaterial,
    SLOTS * TRAIL,
  );
  trailMesh.frustumCulled = false;
  scene.add(trailMesh);

  const shadowGeometry = new THREE.CircleGeometry(BALL_R * 1.1, 12);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadowMesh = new THREE.InstancedMesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    SLOTS,
  );
  shadowMesh.frustumCulled = false;
  scene.add(shadowMesh);

  const list = [];
  for (let i = 0; i < SLOTS; i++) {
    list.push({
      active: false,
      attached: false, // sitting on the paddle, waiting for A
      falling: 0, // seconds left of the fall off the edge
      x: 0,
      y: BALL_Y,
      z: 0,
      dx: 0, // unit direction on the field
      dz: -1,
      vy: 0,
      offset: 0, // x offset on the paddle while attached
      idle: 0,
      pop: 0,
    });
  }
  // The last positions of each ball, newest at head[i], for the trail.
  const hist = new Float32Array(SLOTS * HIST * 3);
  const head = new Int32Array(SLOTS);

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const m = new THREE.Matrix4();

  function fillTrail(i) {
    const b = list[i];
    for (let k = 0; k < HIST; k++) {
      const o = (i * HIST + k) * 3;
      hist[o] = b.x;
      hist[o + 1] = b.y;
      hist[o + 2] = b.z;
    }
  }

  // Never let the ball fly (almost) sideways forever.
  function fixDir(b) {
    if (Math.abs(b.dz) < MIN_DZ) {
      b.dz = b.dz < 0 ? -MIN_DZ : MIN_DZ;
      b.dx = b.dx < 0 ? -MIN_DX : MIN_DX;
    }
  }

  // A ball that has bounced between walls and gold bricks for a long time
  // gets its angle nudged so it cannot loop forever.
  function unstick(b) {
    if (b.idle < IDLE_LIMIT) return;
    const a = (Math.random() < 0.5 ? -1 : 1) * (0.2 + Math.random() * 0.2);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const dx = b.dx * ca - b.dz * sa;
    const dz = b.dx * sa + b.dz * ca;
    const len = Math.hypot(dx, dz);
    b.dx = dx / len;
    b.dz = dz / len;
    b.idle = IDLE_LIMIT - IDLE_AGAIN;
  }

  function bounced(b) {
    unstick(b);
    fixDir(b);
    b.pop = POP_TIME;
  }

  // Sends the ball up from the paddle; t is where it touched, -1 (left edge)
  // to 1 (right edge). The paddle's own motion adds a little spin.
  function aim(b, t) {
    const a = clamp(t * MAX_ANGLE + clamp(paddle.v * 0.01, -0.15, 0.15), -MAX_ANGLE, MAX_ANGLE);
    b.dx = Math.sin(a);
    b.dz = -Math.cos(a);
  }

  // Moves ball b by h units. Returns false once it has left the field.
  function step(b, h) {
    // Along x: side walls and the sides of bricks.
    b.x += b.dx * h;
    let cell = bricks.find(b.x, b.z, BALL_R, 0);
    if (cell >= 0) {
      const cx = bricks.cellX(cell);
      if (b.x < cx) {
        b.x = cx - BRICK_HW - BALL_R - EPS;
        b.dx = -Math.abs(b.dx);
      } else {
        b.x = cx + BRICK_HW + BALL_R + EPS;
        b.dx = Math.abs(b.dx);
      }
      if (events.brick(cell, b) > 0) b.idle = 0;
      bounced(b);
    }
    if (b.x < FIELD_L + BALL_R) {
      b.x = FIELD_L + BALL_R;
      b.dx = Math.abs(b.dx);
      bounced(b);
      events.wall(b);
    } else if (b.x > FIELD_R - BALL_R) {
      b.x = FIELD_R - BALL_R;
      b.dx = -Math.abs(b.dx);
      bounced(b);
      events.wall(b);
    }

    // Along z: top wall, the fronts and backs of bricks, the paddle.
    b.z += b.dz * h;
    cell = bricks.find(b.x, b.z, BALL_R, 1);
    if (cell >= 0) {
      const cz = bricks.cellZ(cell);
      if (b.z < cz) {
        b.z = cz - BRICK_HD - BALL_R - EPS;
        b.dz = -Math.abs(b.dz);
      } else {
        b.z = cz + BRICK_HD + BALL_R + EPS;
        b.dz = Math.abs(b.dz);
      }
      if (events.brick(cell, b) > 0) b.idle = 0;
      bounced(b);
    }
    if (b.z < FIELD_TOP + BALL_R) {
      b.z = FIELD_TOP + BALL_R;
      b.dz = Math.abs(b.dz);
      bounced(b);
      events.wall(b);
    }

    const top = PADDLE_Z - PADDLE_D / 2;
    if (
      b.dz > 0 &&
      b.z + BALL_R >= top &&
      b.z <= PADDLE_Z + PADDLE_D / 2 &&
      Math.abs(b.x - paddle.x) <= paddle.halfW + BALL_R
    ) {
      b.z = top - BALL_R - EPS;
      aim(b, clamp((b.x - paddle.x) / (paddle.halfW + BALL_R * 0.5), -1, 1));
      b.idle = 0;
      b.pop = POP_TIME;
      events.paddle(b);
    }

    if (b.z > FIELD_BOTTOM + BALL_R) {
      b.falling = FALL_TIME;
      b.vy = 0;
      events.fell(b);
      return false;
    }
    return true;
  }

  function freeSlot() {
    for (let i = 0; i < SLOTS; i++) if (!list[i].active) return i;
    return -1;
  }

  const balls = {
    list,

    reset() {
      for (let i = 0; i < SLOTS; i++) list[i].active = false;
      this.draw();
    },

    // Puts a new ball on the paddle.
    serve() {
      const i = freeSlot();
      if (i < 0) return;
      const b = list[i];
      b.active = true;
      b.attached = true;
      b.falling = 0;
      b.offset = 0.4;
      b.x = paddle.x + b.offset;
      b.y = BALL_Y;
      b.z = PADDLE_Z - PADDLE_D / 2 - BALL_R - EPS;
      b.idle = 0;
      b.pop = 0;
      fillTrail(i);
    },

    // Launches every ball sitting on the paddle.
    launch() {
      for (let i = 0; i < SLOTS; i++) {
        const b = list[i];
        if (!b.active || !b.attached) continue;
        b.attached = false;
        aim(b, b.offset / paddle.halfW);
        b.pop = POP_TIME;
      }
    },

    // Balls in play (not falling off the edge).
    alive() {
      let n = 0;
      for (let i = 0; i < SLOTS; i++) if (list[i].active && list[i].falling <= 0) n++;
      return n;
    },

    hasAttached() {
      for (let i = 0; i < SLOTS; i++) if (list[i].active && list[i].attached) return true;
      return false;
    },

    // Multi-ball: splits the first ball in play into up to MAX_ALIVE balls.
    split() {
      let src = null;
      for (let i = 0; i < SLOTS && !src; i++) {
        if (list[i].active && list[i].falling <= 0) src = list[i];
      }
      if (!src) return;
      if (src.attached) this.launch();
      let spread = 0.5;
      while (this.alive() < MAX_ALIVE) {
        const i = freeSlot();
        if (i < 0) return;
        const b = list[i];
        b.active = true;
        b.attached = false;
        b.falling = 0;
        b.x = src.x;
        b.y = BALL_Y;
        b.z = src.z;
        const ca = Math.cos(spread);
        const sa = Math.sin(spread);
        b.dx = src.dx * ca - src.dz * sa;
        b.dz = src.dx * sa + src.dz * ca;
        fixDir(b);
        b.idle = 0;
        b.pop = POP_TIME;
        fillTrail(i);
        spread = -spread;
      }
    },

    // Lowest ball heading for the paddle (for the title screen demo), or null.
    lowest() {
      let best = null;
      for (let i = 0; i < SLOTS; i++) {
        const b = list[i];
        if (!b.active || b.attached || b.falling > 0) continue;
        if (!best || (b.dz > 0 && (best.dz < 0 || b.z > best.z))) best = b;
      }
      return best;
    },

    setSlowLook(on) {
      trailMaterial.color.setHex(on ? 0x8dff86 : 0x8fe9ff);
    },

    update(dt, speed) {
      for (let i = 0; i < SLOTS; i++) {
        const b = list[i];
        if (!b.active) continue;
        if (b.attached) {
          b.x = paddle.x + b.offset;
          b.z = PADDLE_Z - PADDLE_D / 2 - BALL_R - EPS;
        } else if (b.falling > 0) {
          // Off the edge: keep drifting and drop out of sight.
          b.falling -= dt;
          b.vy -= 40 * dt;
          b.y += b.vy * dt;
          b.x += b.dx * speed * 0.5 * dt;
          b.z += b.dz * speed * 0.5 * dt;
          if (b.falling <= 0) b.active = false;
        } else {
          b.idle += dt;
          const dist = speed * dt;
          const n = Math.ceil(dist / STEP);
          for (let s = 0; s < n; s++) {
            if (!step(b, dist / n)) break;
          }
        }
        if (b.pop > 0) b.pop = Math.max(0, b.pop - dt);
        head[i] = (head[i] + 1) % HIST;
        const o = (i * HIST + head[i]) * 3;
        hist[o] = b.x;
        hist[o + 1] = b.y;
        hist[o + 2] = b.z;
      }
      this.draw();
    },

    draw() {
      // Only slots up to the last active one are drawn.
      let top = 0;
      for (let i = 0; i < SLOTS; i++) if (list[i].active) top = i + 1;
      ballMesh.count = top;
      shadowMesh.count = top;
      trailMesh.count = top * TRAIL;
      for (let i = 0; i < top; i++) {
        const b = list[i];
        if (!b.active) {
          ballMesh.setMatrixAt(i, ZERO);
          shadowMesh.setMatrixAt(i, ZERO);
          for (let k = 0; k < TRAIL; k++) trailMesh.setMatrixAt(i * TRAIL + k, ZERO);
          continue;
        }
        const s = 1 + Math.sin((b.pop / POP_TIME) * Math.PI) * 0.35;
        m.makeScale(s, s, s).setPosition(b.x, b.y, b.z);
        ballMesh.setMatrixAt(i, m);

        if (b.falling > 0) shadowMesh.setMatrixAt(i, ZERO);
        else {
          m.makeScale(1, 1, 1).setPosition(b.x + 0.1, 0.02, b.z + 0.12);
          shadowMesh.setMatrixAt(i, m);
        }

        // Trail: older positions, smaller and smaller. Hidden on the paddle.
        for (let k = 0; k < TRAIL; k++) {
          if (b.attached) {
            trailMesh.setMatrixAt(i * TRAIL + k, ZERO);
            continue;
          }
          const o = (i * HIST + ((head[i] - k - 1 + HIST) % HIST)) * 3;
          const ts = 0.85 * (1 - (k + 1) / (TRAIL + 1));
          m.makeScale(ts, ts, ts).setPosition(hist[o], hist[o + 1], hist[o + 2]);
          trailMesh.setMatrixAt(i * TRAIL + k, m);
        }
      }
      ballMesh.instanceMatrix.needsUpdate = true;
      shadowMesh.instanceMatrix.needsUpdate = true;
      trailMesh.instanceMatrix.needsUpdate = true;
    },
  };

  balls.reset();
  return balls;
}
