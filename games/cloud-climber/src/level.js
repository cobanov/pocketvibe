// The level generator. It lays a guaranteed path of clouds upwards, each one
// reachable from the one below (never higher than a safe jump, never further
// sideways than the climber can steer in that time), then sprinkles extras
// around it: spare clouds low down, storm-cloud traps, springs, stars, the
// rare propeller cap or rocket and, high up, pests and thunderclouds. Gaps
// widen and hazards get more common with height. A pest or a bolt of
// lightning is never placed where a straight bounce off a path cloud would
// meet it, so on one that stays the climber can bounce in place and pick its
// moment.

import {
  BODY_H,
  COL_W,
  CRUMBLE,
  HALF_W,
  JUMP_H,
  MOVING,
  NORMAL,
  ONESHOT,
  PLAT_X,
  SAFE_GAP,
  clamp,
  rand,
  reach,
  smoothstep,
  wrapDx,
} from './shared.js';
import { SPRING_H } from './models.js';
import { CAP, ROCKET } from './pickups.js';
import { BOLT } from './storms.js';

const HARDEST_AT = 1000; // metres: gaps and hazards stop growing here
const DEMO_CAP = 140; // the title-screen demo never gets harder than this
const MOVING_FROM = 40;
const CRUMBLE_FROM = 100;
const ONESHOT_FROM = 160;
const PEST_FROM = 250;
const STORM_FROM = 400;
const CAP_FROM = 120;
const ROCKET_FROM = 300;
const CAP_SPACING = 140;
const PEST_SPACING = 16;
const STORM_SPACING = 22;
// A straight bounce off a path cloud, landing anywhere on it, misses a pest's
// swing and a bolt of lightning: they keep this far from the path clouds
// beside them. From any other cloud, a bounce from its middle misses them.
const PEST_CLEAR = 1.9;
const BOLT_CLEAR = 2.0;
const PEST_CLEAR_OTHERS = 1.1;
const BOLT_CLEAR_OTHERS = 1.3;
const SPRING_JUMP = 11.3; // how high a spring sends the climber

// Brings x into the column, keeping its wrapped position where it can.
function intoColumn(x) {
  if (x > PLAT_X) return x - HALF_W * 2 >= -PLAT_X ? x - HALF_W * 2 : PLAT_X;
  if (x < -PLAT_X) return x + HALF_W * 2 <= PLAT_X ? x + HALF_W * 2 : -PLAT_X;
  return x;
}

// A centre for a moving cloud within room of x (round the wrap) whose swing
// stays inside the column (|centre| <= edge), or NaN if there is none. The
// stretch within reach is cut by the column, and its copies one column to
// either side may be cut too, so this picks from all three pieces.
const spans = new Float64Array(6);
function moverAt(x, room, edge) {
  let total = 0;
  for (let k = 0; k < 3; k++) {
    const shift = (k - 1) * COL_W;
    spans[k * 2] = Math.max(-edge, x + shift - room);
    spans[k * 2 + 1] = Math.min(edge, x + shift + room);
    total += Math.max(0, spans[k * 2 + 1] - spans[k * 2]);
  }
  if (total <= 0) return NaN;
  let r = Math.random() * total;
  for (let k = 0; k < 3; k++) {
    const len = Math.max(0, spans[k * 2 + 1] - spans[k * 2]);
    if (r <= len && len > 0) return spans[k * 2] + r;
    r -= len;
  }
  return NaN;
}

export function createLevel(platforms, pickups, enemies, storms) {
  let pathY = 0; // the top cloud of the guaranteed path so far
  let pathX = 0;
  let pathAmp = 0; // its swing, if it moves
  let pathKind = NORMAL;
  let lastCap = 0;
  let lastPest = 0;
  let lastStorm = 0;
  let demo = false;

  // Chance of each hazard at height h, ramping in after its start height.
  function ramp(h, from, lo, hi) {
    if (h < from) return 0;
    return lo + (hi - lo) * clamp((h - from) / (HARDEST_AT - from), 0, 1);
  }

  // A cloud between y0 and y1 that does not crowd the path. If nextY is
  // given, the next path cloud (at nextX, swinging nextAmp) must stay
  // reachable from it.
  function extra(kind, y0, y1, avoidX, nextY, nextX, nextAmp) {
    for (let tries = 0; tries < 6; tries++) {
      const y = rand(y0, y1);
      const x = rand(-PLAT_X, PLAT_X);
      if (Math.abs(wrapDx(x, avoidX)) < 1.8) continue;
      if (!platforms.roomAt(x, y, 0.7, 0)) continue;
      if (nextY !== undefined && Math.abs(wrapDx(x, nextX)) + nextAmp > reach(nextY - y)) continue;
      platforms.spawn(kind, x, y);
      return true;
    }
    return false;
  }

  // Whether x keeps dist clear of the path clouds below and above the gap.
  function offPath(x, p, dist) {
    return Math.abs(wrapDx(x, pathX)) - pathAmp >= dist && Math.abs(wrapDx(x, p.cx)) - p.amp >= dist;
  }

  // A pest hovering in the middle of the gap from the last path cloud to p.
  function addPest(p, dy) {
    const amp = rand(0.6, 1.4);
    const ey = pathY + dy * 0.5;
    const low = ey - JUMP_H - BODY_H - 0.4;
    for (let tries = 0; tries < 6; tries++) {
      const ex = rand(-HALF_W + 0.6 + amp, HALF_W - 0.6 - amp);
      if (!offPath(ex, p, PEST_CLEAR + amp)) continue;
      if (!platforms.clearOfBounces(ex, low, ey + 0.4, low - SPRING_JUMP + JUMP_H, PEST_CLEAR_OTHERS + amp)) continue;
      return enemies.spawn(ex, ey, amp, rand(1.2, 2.2));
    }
    return false;
  }

  // A thundercloud in the gap below p, its bolt clear of the bounces off the
  // clouds under it.
  function addStorm(p, dy) {
    const sy = pathY + dy * rand(0.55, 0.8);
    const tip = sy - BOLT - BODY_H;
    for (let tries = 0; tries < 6; tries++) {
      const sx = rand(-PLAT_X + 0.3, PLAT_X - 0.3);
      if (!offPath(sx, p, BOLT_CLEAR)) continue;
      if (!platforms.clearOfBounces(sx, tip - JUMP_H, sy + 0.6, tip - SPRING_JUMP, BOLT_CLEAR_OTHERS)) continue;
      return storms.spawn(sx, sy);
    }
    return false;
  }

  function addPath() {
    const h = pathY;
    const hard = demo ? Math.min(h, DEMO_CAP) : h;
    const d = clamp(hard / HARDEST_AT, 0, 1);

    const dy = rand(1.25 + 1.15 * d, Math.min(SAFE_GAP, 1.95 + 1.5 * d));
    const pMoving = ramp(hard, MOVING_FROM, 0.1, 0.36);
    const pOneShot = demo ? 0 : ramp(hard, ONESHOT_FROM, 0.06, 0.28);
    const r = Math.random();
    let kind = r < pMoving ? MOVING : r < pMoving + pOneShot ? ONESHOT : NORMAL;

    // How far sideways the next cloud may be: the climber may take off from
    // anywhere on the swing of the last one, and a mover can be anywhere on
    // its own, which has to stay inside the column.
    const lim = reach(dy);
    let amp = 0;
    let x = NaN;
    if (kind === MOVING) {
      amp = Math.min(rand(1, 1.2 + 1.8 * d), lim - pathAmp - 0.3);
      if (amp >= 0.8) x = moverAt(pathX, lim - pathAmp - amp, PLAT_X - amp);
      if (Number.isNaN(x)) {
        kind = NORMAL;
        amp = 0;
      }
    }
    if (kind !== MOVING) {
      const room = Math.max(0.3, Math.min(HALF_W, lim - pathAmp));
      x = intoColumn(pathX + rand(-room, room));
    }
    const y = pathY + dy;
    const p = platforms.spawn(kind, x, y);
    if (!p) return false;
    if (kind === MOVING) {
      p.amp = amp;
      p.rate = (1 + 1.6 * d) / Math.max(0.8, p.amp);
      p.phase = Math.random() * Math.PI * 2;
      p.x = p.cx + Math.sin(p.phase) * p.amp;
    }

    // Low down, spare clouds make the climb forgiving; they thin out with
    // height. Right above the meadow, which catches every fall, none are needed.
    const spares = (1 - d) * (1 - d) * smoothstep(6, 24, h);
    if (Math.random() < spares * 0.7) extra(NORMAL, pathY + 0.6, y - 0.4, x, y, p.cx, p.amp);
    if (Math.random() < spares * 0.25) extra(NORMAL, pathY + 0.6, y - 0.4, x, y, p.cx, p.amp);
    // Storm clouds look like a way up but break underfoot.
    if (Math.random() < ramp(hard, CRUMBLE_FROM, 0.18, 0.55)) extra(CRUMBLE, pathY + 0.4, y + 0.4, x);

    // Springs sit on plain or moving clouds; stars hang where the jump goes.
    let busy = false;
    if (kind !== ONESHOT && h > 20 && Math.random() < 0.075) {
      p.spring = true;
      p.springX = rand(-0.45, 0.45);
      busy = true;
      if (Math.random() < 0.6 && kind === NORMAL) {
        for (let k = 0; k < 3; k++) pickups.addStar(x + p.springX, y + SPRING_H + 3 + k * 2.2);
      }
    } else if (kind === NORMAL && !demo && h > CAP_FROM && h - lastCap > CAP_SPACING && Math.random() < 0.04) {
      const gear = h > ROCKET_FROM && Math.random() < 0.4 ? ROCKET : CAP;
      if (pickups.addGear(gear, x, y)) {
        lastCap = h;
        busy = true;
      }
    }
    if (!busy && h > 8 && Math.random() < 0.16) pickups.addStar(p.cx, y + 1.5);

    // Pests hover in wide gaps; thunderclouds hang in others, never over a
    // lemon cloud (the climber cannot wait on one for the bolt to pass).
    if (!demo && dy > 2) {
      if (h > PEST_FROM && h - lastPest > PEST_SPACING && Math.random() < ramp(h, PEST_FROM, 0.15, 0.36)) {
        if (addPest(p, dy)) lastPest = h;
      } else if (
        h > STORM_FROM &&
        h - lastStorm > STORM_SPACING &&
        h - lastPest > 4 &&
        pathKind !== ONESHOT &&
        Math.random() < ramp(h, STORM_FROM, 0.14, 0.32)
      ) {
        if (addStorm(p, dy)) lastStorm = h;
      }
    }

    pathY = y;
    pathX = p.cx;
    pathAmp = p.amp;
    pathKind = kind;
    return true;
  }

  return {
    // The climber starts on the meadow at y = 0.
    reset(isDemo) {
      demo = isDemo;
      pathY = 0;
      pathX = 0;
      pathAmp = 0;
      pathKind = NORMAL;
      lastCap = 0;
      lastPest = 0;
      lastStorm = 0;
    },

    // Builds the level up to height top, as far as the pools allow.
    fill(top) {
      while (pathY < top && platforms.free() > 3) {
        if (!addPath()) break;
      }
    },
  };
}
