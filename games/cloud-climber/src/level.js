// The level generator. It lays a guaranteed path of clouds upwards, each one
// reachable from the one below (never higher than a safe jump, never further
// sideways than the climber can steer in that time), then sprinkles extras
// around it: spare clouds low down, storm-cloud traps, springs, stars, the
// rare propeller cap and, high up, pests. Gaps widen and hazards get more
// common with height.

import {
  CRUMBLE,
  HALF_W,
  MOVING,
  NORMAL,
  ONESHOT,
  PLAT_X,
  SAFE_GAP,
  clamp,
  rand,
  reach,
  wrapDx,
} from './shared.js';
import { SPRING_H } from './models.js';

const HARDEST_AT = 1000; // metres: gaps and hazards stop growing here
const DEMO_CAP = 140; // the title-screen demo never gets harder than this
const MOVING_FROM = 40;
const CRUMBLE_FROM = 100;
const ONESHOT_FROM = 160;
const PEST_FROM = 250;
const CAP_FROM = 120;
const CAP_SPACING = 140;
const PEST_SPACING = 16;

// Brings x into the column, keeping its wrapped position where it can.
function intoColumn(x) {
  if (x > PLAT_X) return x - (HALF_W * 2) >= -PLAT_X ? x - HALF_W * 2 : PLAT_X;
  if (x < -PLAT_X) return x + HALF_W * 2 <= PLAT_X ? x + HALF_W * 2 : -PLAT_X;
  return x;
}

export function createLevel(platforms, pickups, enemies) {
  let pathY = 0; // the top cloud of the guaranteed path so far
  let pathX = 0;
  let pathAmp = 0; // its swing, if it moves
  let lastCap = 0;
  let lastPest = 0;
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

  function addPath() {
    const h = pathY;
    const hard = demo ? Math.min(h, DEMO_CAP) : h;
    const d = clamp(hard / HARDEST_AT, 0, 1);

    const dy = rand(1.15 + 1.25 * d, Math.min(SAFE_GAP, 1.85 + 1.6 * d));
    const pMoving = ramp(hard, MOVING_FROM, 0.1, 0.36);
    const pOneShot = demo ? 0 : ramp(hard, ONESHOT_FROM, 0.06, 0.28);
    const r = Math.random();
    let kind = r < pMoving ? MOVING : r < pMoving + pOneShot ? ONESHOT : NORMAL;

    // How far sideways the next cloud may be: the climber may take off from
    // anywhere on the swing of the last one, and a mover can be anywhere on its own.
    const lim = reach(dy);
    let amp = kind === MOVING ? rand(1, 1.2 + 1.8 * d) : 0;
    if (kind === MOVING && lim - pathAmp - amp < 0.3) {
      amp = lim - pathAmp - 0.3;
      if (amp < 0.8) {
        kind = NORMAL;
        amp = 0;
      }
    }
    const room = Math.max(0.3, Math.min(HALF_W, lim - pathAmp - amp));
    const x = intoColumn(pathX + rand(-room, room));
    const y = pathY + dy;
    const p = platforms.spawn(kind, x, y);
    if (!p) return false;
    if (kind === MOVING) {
      // Swing around x, but stay inside the column.
      p.cx = clamp(x, -PLAT_X + amp, PLAT_X - amp);
      p.amp = amp;
      p.rate = (1 + 1.6 * d) / Math.max(0.8, p.amp);
      p.phase = Math.random() * Math.PI * 2;
      p.x = p.cx + Math.sin(p.phase) * p.amp;
    }

    // Low down, spare clouds make the climb forgiving; they thin out with height.
    const spares = (1 - d) * (1 - d);
    if (Math.random() < spares * 0.9) extra(NORMAL, pathY + 0.6, y - 0.4, x, y, p.cx, p.amp);
    if (Math.random() < spares * 0.4) extra(NORMAL, pathY + 0.6, y - 0.4, x, y, p.cx, p.amp);
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
      if (pickups.addCap(x, y)) {
        lastCap = h;
        busy = true;
      }
    }
    if (!busy && h > 8 && Math.random() < 0.16) pickups.addStar(p.cx, y + 1.5);

    // Pests hover in the middle of a wide gap, away from both path clouds.
    if (!demo && h > PEST_FROM && h - lastPest > PEST_SPACING && dy > 2 && Math.random() < ramp(h, PEST_FROM, 0.12, 0.3)) {
      const amp2 = rand(0.6, 1.4);
      for (let tries = 0; tries < 6; tries++) {
        const ex = rand(-HALF_W + 0.6 + amp2, HALF_W - 0.6 - amp2);
        const clear = 1.5 + amp2;
        if (Math.abs(wrapDx(ex, pathX)) - pathAmp < clear || Math.abs(wrapDx(ex, p.cx)) - p.amp < clear) continue;
        if (enemies.spawn(ex, pathY + dy * 0.5, amp2, rand(1.2, 2.2))) lastPest = h;
        break;
      }
    }

    pathY = y;
    pathX = p.cx;
    pathAmp = p.amp;
    return true;
  }

  return {
    // The climber starts on the meadow at y = 0.
    reset(isDemo) {
      demo = isDemo;
      pathY = 0;
      pathX = 0;
      pathAmp = 0;
      lastCap = 0;
      lastPest = 0;
    },

    // Builds the level up to height top, as far as the pools allow.
    fill(top) {
      while (pathY < top && platforms.free() > 3) {
        if (!addPath()) break;
      }
    },
  };
}
