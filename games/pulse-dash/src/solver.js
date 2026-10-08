// Finds a way through a level for the title-screen autopilot: a depth-first
// search over "jump or not" at each step on the ground and "press or not"
// at each ring, run once per level at startup. Jumps are first tried only
// on eighth notes, so the demo jumps on the music; finer grids are a
// fallback. Dead ends on the ground are remembered, so it stays fast.

import { SUB, copyState, createState, step, touchingRing } from './sim.js';

const GRIDS = [16, 8, 4, 1]; // steps between allowed jumps: eighth, sixteenth, ...

function search(L, grid, acts) {
  const s = createState();
  const failed = new Set(); // grounded states known to lead nowhere: n * 64 + height
  const stack = []; // decision points: a saved state and the choice not yet tried
  const key = (st) => st.n * 64 + Math.round(st.y);
  let act = 0;

  for (;;) {
    if (s.done) return true;
    if (s.dead || (s.grounded && s.n % grid === 0 && failed.has(key(s)))) {
      // Back up to the latest decision with an untried choice.
      let resumed = false;
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.alt >= 0) {
          copyState(s, top.state);
          act = top.alt;
          top.alt = -1;
          resumed = true;
          break;
        }
        stack.pop();
        if (top.state.grounded) failed.add(key(top.state));
      }
      if (!resumed) return false;
    } else {
      act = 0;
      let first = -1;
      if (s.grounded && s.n % grid === 0) {
        first = 0; // wait first: jump at the last moment that still works
      } else if (s.n % 2 === 0) {
        const r = touchingRing(s, L);
        // Press when the cube is closest to the ring's middle.
        if (r >= 0) first = Math.abs(s.x - L.rings.col[r] - 0.5) < 0.3 ? 1 : 0;
      }
      if (first >= 0) {
        const saved = createState();
        copyState(saved, s);
        stack.push({ state: saved, alt: 1 - first });
        act = first;
      }
    }
    acts[s.n] = act;
    step(s, L, act === 1, act === 1);
  }
}

// Returns one byte per step (1: press there), or null if no way was found.
export function solve(L) {
  const steps = Math.ceil((L.endX + 1) / SUB) + 2;
  const acts = new Uint8Array(steps);
  for (const grid of GRIDS) {
    acts.fill(0);
    if (search(L, grid, acts)) return acts;
  }
  return null;
}
