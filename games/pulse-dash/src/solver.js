// Finds a way through a level for the title-screen autopilot: a depth-first
// search over "jump or not" at each step on the ground and "press or not"
// at each ring, run once per level at startup. Jumps are first tried only
// on eighth notes, so the demo jumps on the music; finer grids are a
// fallback. Dead ends on the ground are remembered, so it stays fast.
//
// The same search, cut off a little way ahead, tells practice mode where a
// checkpoint can still be survived (see checkpointMap()).

import { SUB, X0, copyState, createState, step, touchingRing } from './sim.js';

const GRIDS = [16, 8, 4, 1]; // steps between allowed jumps: eighth, sixteenth, ...
const VIABLE_GRIDS = [16, 4]; // a checkpoint test: on the music first, then finer
const VIABLE_STEPS = 256; // a checkpoint must lead at least this far (two bars)
export const CHECK_STEP = 4 / SUB; // checkpoints go on beats
export const CHECK_HEIGHTS = 8; // surface heights a checkpoint can stand on: 0 .. 7
const CHECK_SLACK = 6; // steps a respawned cube can roll on before the first press

// Searches from `from` (or the level's start) until the level is done or
// the cube has lived to step `until`. acts (optional) receives the moves.
function search(L, grid, acts, from, until) {
  const s = createState();
  if (from) copyState(s, from);
  const failed = new Set(); // grounded states known to lead nowhere: n * 64 + height
  const stack = []; // decision points: a saved state and the choice not yet tried
  const key = (st) => st.n * 64 + Math.round(st.y);
  let act = 0;

  for (;;) {
    if (s.done || s.n >= until) return true;
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
    if (acts) acts[s.n] = act;
    step(s, L, act === 1, act === 1);
  }
}

// Returns one byte per step (1: press there), or null if no way was found.
export function solve(L) {
  const steps = Math.ceil((L.endX + 1) / SUB) + 2;
  const acts = new Uint8Array(steps);
  for (const grid of GRIDS) {
    acts.fill(0);
    if (search(L, grid, acts, null, Infinity)) return acts;
  }
  return null;
}

// True if the cube can get on for two more bars from state s.
export function viable(L, s) {
  for (const grid of VIABLE_GRIDS) {
    if (search(L, grid, null, s, s.n + VIABLE_STEPS)) return true;
  }
  return false;
}

// Practice mode: for every beat and every height the cube can stand on
// there, 1 if a checkpoint fits: the cube can roll on a moment without a
// press (no jump needed the instant it comes back) and still get on.
// Index: n / CHECK_STEP * CHECK_HEIGHTS + height. Worked out once per level
// when practice starts, so the run only looks it up. (A standing cube's
// past rings do not matter: the rings ahead of it are all still unused.)
export function checkpointMap(L) {
  const beats = Math.ceil(L.endX / SUB / CHECK_STEP);
  const map = new Uint8Array(beats * CHECK_HEIGHTS);
  const s = createState();
  for (let beat = 1; beat < beats; beat++) {
    for (let h = 0; h < CHECK_HEIGHTS; h++) {
      s.n = beat * CHECK_STEP;
      s.x = X0 + s.n * SUB;
      s.y = h;
      s.vy = 0;
      s.grounded = true;
      s.ring = L.rings.start[Math.max(0, Math.min(L.cols, Math.floor(s.x - 1)))] - 1;
      s.dead = false;
      s.done = false;
      // Only where there is ground at this height (one step on, it still
      // stands), and the cube lives through the slack without a press.
      let ok = true;
      for (let k = 0; k < CHECK_SLACK && ok; k++) {
        step(s, L, false, false);
        ok = !s.dead && !s.done && (k > 0 || (s.grounded && s.y === h));
      }
      map[beat * CHECK_HEIGHTS + h] = ok && viable(L, s) ? 1 : 0;
    }
  }
  return map;
}
