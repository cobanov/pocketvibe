// The autopilot behind the title screen: after each bounce it picks the
// highest cloud it can reach and steers for it; if it misses, it looks for
// something to land on below.

import { CRUMBLE, JUMP_H, MAX_VX, clamp, reach, wrapDx } from './shared.js';
import { LIVE } from './platforms.js';

export function createPilot(platforms) {
  const list = platforms.list;
  let target = null;

  function solid(p) {
    return p.active && p.state === LIVE && p.kind !== CRUMBLE;
  }

  // The highest solid cloud reachable with a jump from (x, y).
  function pickAbove(x, y) {
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!solid(p) || p.y < y + 0.3 || p.y > y + JUMP_H * 0.9) continue;
      if (Math.abs(wrapDx(x, p.cx)) + p.amp > reach(p.y - y) * 1.1) continue;
      if (!best || p.y > best.y) best = p;
    }
    return best;
  }

  // The closest solid cloud under the climber.
  function pickBelow(x, y) {
    let best = null;
    let bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!solid(p) || p.y > y - 0.1) continue;
      const score = Math.abs(wrapDx(x, p.x)) * 1.5 + (y - p.y);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  return {
    reset() {
      target = null;
    },

    bounced(x, y) {
      target = pickAbove(x, y);
    },

    // Returns a D-pad x for the climber.
    steer(player) {
      if (target && !solid(target)) target = null;
      if (player.vy < 0 && (!target || player.y < target.y - 0.05)) target = pickBelow(player.x, player.y);
      const dx = target ? wrapDx(player.x, target.x) : 0;
      // Aim for a speed that closes the gap, and brake on the way in.
      const want = clamp(dx * 5, -MAX_VX, MAX_VX);
      const diff = want - player.vx;
      return diff > 0.8 ? 1 : diff < -0.8 ? -1 : 0;
    },
  };
}
