// A circuit: a closed spline sampled at even spacing. Everything that needs
// to know "where on the track" something is uses these samples: the road mesh,
// lap counting, the AI's racing line and the scenery placement.

import * as THREE from 'three';
import { TOP_SPEED, angleDiff } from './shared.js';

export const ROAD_HALF = 7; // half the asphalt width
export const CURB_W = 1.3;
export const EDGE = ROAD_HALF + CURB_W; // the grass starts here
export const LIMIT = ROAD_HALF + 9; // cars cannot get farther from the centre line

const STEP = 2; // rough spacing of the samples along the track
const SEARCH = 12; // samples searched either side of a car's last position

export const PAD_LEN = 7;
export const PAD_HALF_W = 2.6;

const AI_GRIP = 62; // sideways acceleration the AI plans corners with
const AI_BRAKE = 22; // deceleration the AI plans braking with

// def: an entry of CIRCUITS (control points and boost pads).
export function buildCircuit(def) {
  const curve = new THREE.CatmullRomCurve3(
    def.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const length = curve.getLength();
  const n = Math.round(length / STEP);
  const step = length / n;
  const points = curve.getSpacedPoints(n);

  const px = new Float32Array(n);
  const pz = new Float32Array(n);
  const tx = new Float32Array(n); // unit tangent (driving direction)
  const tz = new Float32Array(n);
  const heading = new Float32Array(n);
  const curv = new Float32Array(n); // signed curvature, > 0 turns left
  const line = new Float32Array(n); // racing line offset (towards the inside)
  const aiSpeed = new Float32Array(n);
  const pad = new Int8Array(n); // index of the boost pad here + 1, or 0

  for (let i = 0; i < n; i++) {
    px[i] = points[i].x;
    pz[i] = points[i].z;
  }
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    const dx = px[b] - px[a];
    const dz = pz[b] - pz[a];
    const len = Math.hypot(dx, dz);
    tx[i] = dx / len;
    tz[i] = dz / len;
    heading[i] = Math.atan2(tx[i], tz[i]);
  }

  // Curvature from the heading change over a few samples, then smoothed.
  const K = 3;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    raw[i] = angleDiff(heading[(i + K) % n], heading[(i + n - K) % n]) / (2 * K * step);
  }
  smooth(raw, curv, 4);

  // The AI hugs the inside of corners and plans its speed from the corner
  // radius, then brakes early enough for each corner (two passes backwards
  // around the loop so the wrap-around is covered).
  const inside = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    inside[i] = -Math.max(-1, Math.min(1, curv[i] * 90)) * (ROAD_HALF - 2.2);
    aiSpeed[i] = Math.min(TOP_SPEED, Math.sqrt(AI_GRIP / Math.max(Math.abs(curv[i]), 1e-4)));
  }
  smooth(inside, line, 10);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = aiSpeed[(i + 1) % n];
      aiSpeed[i] = Math.min(aiSpeed[i], Math.sqrt(next * next + 2 * AI_BRAKE * step));
    }
  }

  const pads = def.pads;
  const padIndex = new Int32Array(pads.length);
  const padOffset = new Float32Array(pads.length);
  for (let p = 0; p < pads.length; p++) {
    padIndex[p] = Math.round(pads[p][0] * n) % n;
    padOffset[p] = pads[p][1];
    const span = Math.round(PAD_LEN / step / 2);
    for (let k = -span; k <= span; k++) pad[(padIndex[p] + k + n) % n] = p + 1;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, px[i]);
    maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]);
    maxZ = Math.max(maxZ, pz[i]);
  }

  return {
    n,
    step,
    length,
    px,
    pz,
    tx,
    tz,
    heading,
    curv,
    line,
    aiSpeed,
    pad,
    padIndex,
    padOffset,
    minX,
    maxX,
    minZ,
    maxZ,

    // Finds where a car is on the track. Searches only near car.idx so the
    // answer never jumps to another part of the circuit, then writes
    // car.idx (nearest sample), car.s (distance along the lap, not wrapped, so
    // it lines up with lap counting at sample 0) and car.off
    // (signed distance from the centre line, > 0 is to the right).
    locate(car) {
      let best = car.idx;
      let bestD = Infinity;
      for (let k = -SEARCH; k <= SEARCH; k++) {
        const i = (car.idx + k + n) % n;
        const dx = car.x - px[i];
        const dz = car.z - pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      const dx = car.x - px[best];
      const dz = car.z - pz[best];
      const along = dx * tx[best] + dz * tz[best];
      car.idx = best;
      car.s = best * step + along;
      car.off = -dx * tz[best] + dz * tx[best];
    },

    // Full search over every sample; used once when placing things.
    nearestDistance(x, z) {
      let bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const dx = x - px[i];
        const dz = z - pz[i];
        const d = dx * dx + dz * dz;
        if (d < bestD) bestD = d;
      }
      return Math.sqrt(bestD);
    },

    // Index of the sample `distance` units after sample i.
    ahead(i, distance) {
      return (i + Math.round(distance / step) + n) % n;
    },
  };
}

// Circular moving average over +-radius samples.
function smooth(src, dst, radius) {
  const n = src.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[(i + k + n) % n];
    dst[i] = sum / (radius * 2 + 1);
  }
}

// Grid slot k (0 = pole): distance along the lap, sample and lateral offset.
export function gridSlot(c, k) {
  const back = 9 + k * 6.5;
  const s = c.length - back;
  return { s, idx: Math.round(s / c.step) % c.n, off: k % 2 ? 3.2 : -3.2 };
}

// ---------------------------------------------------------------------------
// Meshes

const CURB_RED = 0xe8433a;
const CURB_WHITE = 0xf4f1ea;
const LINE_WHITE = 0xf4f1ea;
const MERGE_SAG = 0.2; // how far (turn x length) a merged road quad may stray from the curve
const MERGE_MAX = 8; // samples one road quad may span

// One strip along the track between lateral offsets a and b (a < b),
// colored per sample. Neighbouring samples of the same color share one quad
// while the curve bends little over them (its chord strays from the curve by
// about turn x length / 8), so straights cost a few triangles.
function strip(soup, c, a, b, color, height) {
  const { n, step, px, pz, tx, tz, heading } = c;
  const X = (i, off) => px[i] - tz[i] * off;
  const Z = (i, off) => pz[i] + tx[i] * off;
  // Begin at a color change, so the last run ends where the first begins.
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (color(i) !== color(i - 1)) {
      start = i;
      break;
    }
  }
  let i = start;
  let done = 0;
  while (done < n) {
    const hex = color(i);
    const y = height(i);
    let len = 1;
    while (
      len < MERGE_MAX &&
      done + len < n &&
      color((i + len) % n) === hex &&
      height((i + len) % n) === y &&
      Math.abs(angleDiff(heading[(i + len) % n], heading[i])) * len * step < MERGE_SAG
    ) {
      len++;
    }
    const j = (i + len) % n;
    soup.quad(X(i, a), Z(i, a), X(i, b), Z(i, b), X(j, b), Z(j, b), X(j, a), Z(j, a), y, hex);
    i = j;
    done += len;
  }
}

// The asphalt, curbs, start line, grid marks and pad plates, into the soup.
export function roadInto(soup, c, colors) {
  const { n, px, pz, tx, tz, curv } = c;
  const X = (i, off) => px[i] - tz[i] * off;
  const Z = (i, off) => pz[i] + tx[i] * off;

  // Curbs are red and white where the track bends, a white line elsewhere.
  const bend = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let max = 0;
    for (let k = -6; k <= 6; k++) max = Math.max(max, Math.abs(curv[(i + k + n) % n]));
    bend[i] = max > 0.012 ? 1 : 0;
  }

  const [asphaltA, asphaltB] = colors.asphalt;
  strip(soup, c, -ROAD_HALF, ROAD_HALF, (i) => ((i >> 2) % 2 ? asphaltA : asphaltB), () => 0.02);
  const stripe = (i) => ((i >> 1) % 2 ? CURB_RED : CURB_WHITE);
  const inner = (i) => (bend[i] ? stripe(i) : LINE_WHITE);
  const outer = (i) => (bend[i] ? stripe(i) : colors.verge);
  const y = (i) => (bend[i] ? 0.06 : 0.03);
  // The inner strips reach a little under the asphalt edge, so merged quads
  // of different lengths never leave a gap between them.
  const m = ROAD_HALF + 0.45;
  strip(soup, c, ROAD_HALF - 0.1, m, inner, y);
  strip(soup, c, m, EDGE, outer, y);
  strip(soup, c, -m, -ROAD_HALF + 0.1, inner, y);
  strip(soup, c, -EDGE, -m, outer, y);

  // Checkered start/finish line across the road at sample 0.
  const cells = 14;
  const cell = (ROAD_HALF * 2) / cells;
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < cells; k++) {
      const a = -ROAD_HALF + k * cell;
      const along0 = (row - 1) * cell;
      const along1 = row * cell;
      const hex = (k + row) % 2 ? 0x222222 : 0xffffff;
      soup.quad(
        px[0] - tz[0] * a + tx[0] * along0, pz[0] + tx[0] * a + tz[0] * along0,
        px[0] - tz[0] * (a + cell) + tx[0] * along0, pz[0] + tx[0] * (a + cell) + tz[0] * along0,
        px[0] - tz[0] * (a + cell) + tx[0] * along1, pz[0] + tx[0] * (a + cell) + tz[0] * along1,
        px[0] - tz[0] * a + tx[0] * along1, pz[0] + tx[0] * a + tz[0] * along1,
        0.035, hex);
    }
  }

  // Red plates under the boost pads' glowing chevrons.
  for (let p = 0; p < c.padIndex.length; p++) {
    const i = c.padIndex[p];
    const a0 = c.padOffset[p] - PAD_HALF_W - 0.4;
    const a1 = c.padOffset[p] + PAD_HALF_W + 0.4;
    const l0 = -PAD_LEN / 2 - 0.7;
    const l1 = PAD_LEN / 2 + 0.9;
    soup.quad(X(i, a0) + tx[i] * l0, Z(i, a0) + tz[i] * l0, X(i, a1) + tx[i] * l0, Z(i, a1) + tz[i] * l0,
      X(i, a1) + tx[i] * l1, Z(i, a1) + tz[i] * l1, X(i, a0) + tx[i] * l1, Z(i, a0) + tz[i] * l1, 0.035, 0xc8352a);
  }

  // A white bar in front of each grid slot.
  for (let k = 0; k < 4; k++) {
    const g = gridSlot(c, k);
    const i = c.ahead(g.idx, 1.6);
    const a0 = g.off - 1.1;
    const a1 = g.off + 1.1;
    soup.quad(X(i, a0), Z(i, a0), X(i, a1), Z(i, a1), X(i, a1) + tx[i] * 0.4, Z(i, a1) + tz[i] * 0.4,
      X(i, a0) + tx[i] * 0.4, Z(i, a0) + tz[i] * 0.4, 0.035, LINE_WHITE);
  }
}

// Chevrons pointing along the track, one group per boost pad. They glow by
// pulsing their shared unlit material, so they are a mesh of their own.
export function padGeometry(c) {
  const { px, pz, tx, tz } = c;
  const pos = [];
  const quad = (ax, az, bx, bz, cx, cz, dx, dz) => pos.push(ax, 0.05, az, bx, 0.05, bz, cx, 0.05, cz, ax, 0.05, az, cx, 0.05, cz, dx, 0.05, dz);
  for (let p = 0; p < c.padIndex.length; p++) {
    const i = c.padIndex[p];
    const off = c.padOffset[p];
    // Local (across, along) to world (x, z) around the pad centre.
    const wx = (a, l) => px[i] - tz[i] * (a + off) + tx[i] * l;
    const wz = (a, l) => pz[i] + tx[i] * (a + off) + tz[i] * l;
    for (let k = 0; k < 3; k++) {
      const l = -PAD_LEN / 2 + k * 2.3;
      const w = PAD_HALF_W - 0.2;
      // Left and right arms of a chevron pointing forward.
      quad(wx(-w, l), wz(-w, l), wx(0, l + 1.8), wz(0, l + 1.8), wx(0, l + 3.1), wz(0, l + 3.1), wx(-w, l + 1.3), wz(-w, l + 1.3));
      quad(wx(0, l + 1.8), wz(0, l + 1.8), wx(w, l), wz(w, l), wx(w, l + 1.3), wz(w, l + 1.3), wx(0, l + 3.1), wz(0, l + 3.1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
