// The cube's physics on the level grid. Units are cells, and time is
// distance: the cube moves SUB cells per step whatever the frame rate, and
// the caller steps it up to the position the music clock gives. The same
// code drives the player, the title-screen autopilot and its solver, so all
// three behave exactly alike.

export const SUB = 0.125; // cells per physics step (a power of two, so x stays exact)
export const X0 = 0.5; // the cube's centre at song time 0: the middle of cell 0

// One jump lasts exactly one beat (4 cells) and peaks at 2.1 cells, so a
// held button jumps on every beat once the first jump was on one.
const G = 1.05; // gravity, cells per cell per cell
const JUMP_V = 2.1;
const PAD_V = 3.15; // 6 cells long, 4.7 high
const RING_V = 2.1;

const SNAP = 0.35; // landing tolerance: a top this far above the cube still catches it
const CORE = 0.38; // half width of the cube for side hits, a little lenient
const HEAD = 0.15; // the cube may touch a ceiling by this much
const LAND_W = 0.95; // a top supports the cube while their centres are this close
const EPS = 1e-6;

// Hazard boxes, smaller than the drawn shapes so near misses feel fair.
const CUBE_HW = 0.33;
const SPIKE_HW = 0.14;
const SPIKE_H = 0.45;

export const NONE = 0;
export const JUMP = 1;
export const LAND = 2;
export const PAD = 3;
export const RING = 4;
export const DIE = 5;
export const DONE = 6;

export function createState() {
  return { n: 0, x: X0, y: 0, vy: 0, grounded: true, ring: -1, pad: -1, dead: false, done: false };
}

export function resetState(s) {
  s.n = 0;
  s.x = X0;
  s.y = 0;
  s.vy = 0;
  s.grounded = true;
  s.ring = -1;
  s.pad = -1;
  s.dead = false;
  s.done = false;
}

export function copyState(dst, src) {
  dst.n = src.n;
  dst.x = src.x;
  dst.y = src.y;
  dst.vy = src.vy;
  dst.grounded = src.grounded;
  dst.ring = src.ring;
  dst.pad = src.pad;
  dst.dead = src.dead;
  dst.done = src.done;
}

function isGap(L, col) {
  return col >= 0 && col < L.cols && L.gap[col] === 1;
}

// The highest surface under the cube that it is above (or within SNAP of).
function support(L, x, prevY) {
  let best = -Infinity;
  if ((!isGap(L, Math.floor(x - 0.45)) || !isGap(L, Math.floor(x + 0.45))) && prevY >= -SNAP) best = 0;
  const so = L.solids;
  const c0 = Math.max(0, Math.floor(x - 1.5));
  const c1 = Math.min(L.cols, Math.floor(x + 0.5) + 1);
  for (let i = so.start[c0]; i < so.start[c1]; i++) {
    const top = so.top[i];
    if (top > best && Math.abs(x - so.col[i] - 0.5) < LAND_W && prevY >= top - SNAP) best = top;
  }
  return best;
}

function hits(s, L) {
  const x = s.x;
  const y = s.y;
  const c0 = Math.max(0, Math.floor(x - 1.5));
  const c1 = Math.min(L.cols, Math.floor(x + 0.5) + 1);
  const so = L.solids;
  for (let i = so.start[c0]; i < so.start[c1]; i++) {
    if (Math.abs(x - so.col[i] - 0.5) < 0.5 + CORE && y < so.top[i] - SNAP && y + 1 > so.bottom[i] + HEAD) return true;
  }
  const sp = L.spikes;
  for (let i = sp.start[c0]; i < sp.start[c1]; i++) {
    if (Math.abs(x - sp.col[i] - 0.5) >= CUBE_HW + SPIKE_HW) continue;
    const lo = sp.dir[i] > 0 ? sp.row[i] : sp.row[i] + 1 - SPIKE_H;
    if (y + 0.05 < lo + SPIKE_H && y + 0.9 > lo) return true;
  }
  return false;
}

function touchingPad(s, L) {
  const p = L.pads;
  const c0 = Math.max(0, Math.floor(s.x - 1.5));
  const c1 = Math.min(L.cols, Math.floor(s.x + 0.5) + 1);
  for (let i = p.start[c0]; i < p.start[c1]; i++) {
    if (Math.abs(s.x - p.col[i] - 0.5) < 0.6 && Math.abs(s.y - p.row[i]) < 0.3) return i;
  }
  return -1;
}

// A ring the cube touches and has not used yet, or -1.
export function touchingRing(s, L) {
  const r = L.rings;
  const c0 = Math.max(0, Math.floor(s.x - 1.5));
  const c1 = Math.min(L.cols, Math.floor(s.x + 0.5) + 1);
  for (let i = r.start[c0]; i < r.start[c1]; i++) {
    if (i > s.ring && Math.abs(s.x - r.col[i] - 0.5) < 0.85 && Math.abs(s.y - r.row[i]) < 0.85) return i;
  }
  return -1;
}

// One step of SUB cells. hold: the jump button is held (jump whenever on
// the ground); press: a fresh press is waiting (also used by rings).
// Returns what happened, one of the constants above.
export function step(s, L, hold, press) {
  let ev = NONE;
  if (press) {
    const r = touchingRing(s, L);
    if (r >= 0) {
      s.ring = r;
      s.vy = RING_V;
      s.grounded = false;
      ev = RING;
    }
  }
  if (ev === NONE && s.grounded && (hold || press)) {
    s.vy = JUMP_V;
    s.grounded = false;
    ev = JUMP;
  }

  const prevY = s.y;
  s.n++;
  s.x = X0 + s.n * SUB;
  if (!s.grounded) {
    s.y += s.vy * SUB - 0.5 * G * SUB * SUB;
    s.vy -= G * SUB;
  }

  const sup = support(L, s.x, prevY);
  if (s.grounded) {
    // Walked off an edge: start falling from here.
    if (sup < s.y - EPS) {
      s.grounded = false;
      s.vy = 0;
    }
  } else if (s.vy <= 0 && s.y <= sup + EPS) {
    s.y = sup;
    s.vy = 0;
    s.grounded = true;
    if (ev === NONE) ev = LAND;
  }

  if (s.grounded) {
    const p = touchingPad(s, L);
    if (p >= 0) {
      s.pad = p;
      s.vy = PAD_V;
      s.grounded = false;
      ev = PAD;
    }
  }

  if (s.y < -SNAP || hits(s, L)) {
    s.dead = true;
    return DIE;
  }
  if (s.x >= L.endX) {
    s.done = true;
    return DONE;
  }
  return ev;
}
