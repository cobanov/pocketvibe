// The level generator: picks hazard patterns as the corridor scrolls, with
// coins in the gaps. Every pattern leaves a way through for a hero who is
// 1.5 units tall, and the gap between patterns is long enough (in time) to
// fly from floor to ceiling. Harder patterns unlock as the speed rises.

import { CEIL_Y, HERO_X, SPAWN_X } from './shared.js';

const NODE_Y = 0.45; // a zapper standing on the floor has its lower node here
const TOP_Y = CEIL_Y - 0.45; // and one hanging from the ceiling its upper node
const VERTICAL_A = Math.PI / 2;
const DIAG_A = Math.PI / 4;
const MISSILE_LEAD = 1.45; // seconds between a missile warning and its arrival

const COINS = 0;
const VERTICAL = 1;
const HORIZONTAL = 2;
const DIAGONAL = 3;
const GATE = 4;
const SLALOM = 5;
const ROTATING = 6;
const MISSILES = 7;
const TUNNEL = 8;
const COMBO = 9;
const KINDS = 10;

const MAX_MARKERS = 6;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function createLevel(zappers, coins, missiles) {
  const weights = new Float32Array(KINDS);
  // Missile triggers ride along with the world like everything else.
  const markerX = new Float32Array(MAX_MARKERS);
  const markerOn = new Uint8Array(MAX_MARKERS);
  let untilNext = 0;
  let count = 0;
  let last = -1;

  function addMarker(x) {
    for (let i = 0; i < MAX_MARKERS; i++) {
      if (markerOn[i]) continue;
      markerOn[i] = 1;
      markerX[i] = x;
      return;
    }
  }

  // A coin shape somewhere between ylo and yhi, starting at x. Returns width.
  function coinShape(x, ylo, yhi) {
    const r = Math.random();
    const G = coins.GAP;
    if (r < 0.25) return coins.line(x, rand(ylo, yhi), 8 + Math.floor(Math.random() * 5));
    if (r < 0.45) return coins.arc(x, rand(ylo, Math.max(ylo, yhi - 1.6)), 9, 1.6);
    if (r < 0.65) return coins.block(x, rand(ylo, Math.max(ylo, yhi - 2 * G)), 6 + Math.floor(Math.random() * 3), 3);
    if (r < 0.85) return coins.wave(x, rand(ylo + 0.9, Math.max(ylo + 0.9, yhi - 0.9)), 14, 0.9);
    const up = Math.random() < 0.5;
    return coins.diagonal(x, up ? rand(ylo, ylo + 1) : rand(yhi - 1, yhi), 9, up ? 0.42 : -0.42);
  }

  // A row of coins centred on cx, at height y.
  function coinRow(cx, y, n) {
    coins.line(cx - ((n - 1) * coins.GAP) / 2, y, n);
  }

  function vertical(x, d) {
    const len = rand(2.8, 3.4 + d);
    const r = Math.random();
    const cx = x + 0.5;
    if (r < 0.4) {
      zappers.add(cx, NODE_Y + len / 2, len, VERTICAL_A, 0); // from the floor
      coinRow(cx, rand(NODE_Y + len + 0.9, coins.HIGH), 7);
    } else if (r < 0.8) {
      zappers.add(cx, TOP_Y - len / 2, len, VERTICAL_A, 0); // from the ceiling
      coinRow(cx, rand(coins.LOW, TOP_Y - len - 0.9), 7);
    } else {
      const cy = rand(2.6, 4.6);
      zappers.add(cx, cy, 2.6, VERTICAL_A, 0); // floating in the middle
      coinRow(cx, cy < 3.6 ? cy + 2.2 : cy - 2.2, 7);
    }
    return 1;
  }

  function horizontal(x, d) {
    const len = rand(3, 4 + d * 1.5);
    const cy = rand(1.8, 5.3);
    zappers.add(x + 0.4 + len / 2, cy, len, 0, 0);
    if (Math.random() < 0.7) coins.line(x + 0.4, cy < 3.6 ? cy + 1.3 : cy - 1.3, Math.floor(len / coins.GAP) + 1);
    return len + 0.8;
  }

  function diagonal(x, d) {
    const len = rand(3, 3.8 + d * 0.6);
    const cy = rand(2.2, 5.0);
    const w = len * Math.cos(DIAG_A);
    zappers.add(x + 0.4 + w / 2, cy, len, Math.random() < 0.5 ? DIAG_A : -DIAG_A, 0);
    coins.arc(x, cy < 3.6 ? cy + 1.6 : coins.LOW, 7, cy < 3.6 ? 0.8 : 1.0);
    return w + 0.8;
  }

  function gate(x, d) {
    const gy = rand(2.1, 4.9);
    const half = 1.5 - 0.1 * d;
    const cx = x + 0.5;
    const low = gy - half - NODE_Y;
    if (low > 0.9) zappers.add(cx, NODE_Y + low / 2, low, VERTICAL_A, 0);
    const high = TOP_Y - (gy + half);
    if (high > 0.9) zappers.add(cx, TOP_Y - high / 2, high, VERTICAL_A, 0);
    coinRow(cx, gy, 7);
    return 1;
  }

  function slalom(x, d, speed) {
    const n = d > 0.6 ? 3 : 2;
    const gap = speed * 0.8 + 2.4;
    let floor = Math.random() < 0.5;
    for (let i = 0; i < n; i++) {
      const len = rand(3.3, 3.5 + d * 0.8);
      const cx = x + 0.5 + i * gap;
      if (floor) {
        zappers.add(cx, NODE_Y + len / 2, len, VERTICAL_A, 0);
        coinRow(cx, NODE_Y + len + 1.1, 5);
      } else {
        zappers.add(cx, TOP_Y - len / 2, len, VERTICAL_A, 0);
        coinRow(cx, coins.LOW, 5);
      }
      floor = !floor;
    }
    return (n - 1) * gap + 1;
  }

  function rotating(x, d) {
    const len = rand(2.6, 3.0 + d * 0.4);
    const cy = rand(2.6, 4.6);
    zappers.add(x + 0.4 + len / 2, cy, len, Math.random() * Math.PI, (Math.random() < 0.5 ? -1 : 1) * (1.3 + d * 1.2));
    coins.arc(x, cy < 3.6 ? cy + len / 2 + 0.8 : coins.LOW, Math.floor(len / coins.GAP) + 2, 0.5);
    return len + 0.8;
  }

  function missileRun(x, d, speed) {
    const n = 1 + (d > 0.35 ? 1 : 0) + (d > 0.7 ? 1 : 0);
    const step = speed * 0.55;
    for (let i = 0; i < n; i++) addMarker(x + 1 + i * step);
    if (Math.random() < 0.6) coinShape(x, coins.LOW, coins.HIGH);
    return (n - 1) * step + 2;
  }

  function tunnel(x, d) {
    const len = rand(4, 4 + d * 1.5);
    const low = rand(1.6, 2.2);
    const cx = x + 0.4 + len / 2;
    zappers.add(cx, low, len, 0, 0);
    zappers.add(cx, low + 3.3, len, 0, 0);
    coins.line(x + 0.4, low + 1.65, Math.floor(len / coins.GAP) + 1);
    return len + 0.8;
  }

  // Two or three single zappers in a row, a short flight apart.
  function combo(x, d, speed) {
    const n = d > 0.65 ? 3 : 2;
    const step = speed * 0.55 + 1.5;
    let cx = x;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const w = r < 0.4 ? vertical(cx, d) : r < 0.7 ? diagonal(cx, d) : horizontal(cx, d);
      cx += w + step;
    }
    return cx - step - x;
  }

  function pick(d) {
    weights[COINS] = 1.0 - 0.75 * d;
    weights[VERTICAL] = 1;
    weights[HORIZONTAL] = 0.9;
    weights[DIAGONAL] = 0.8;
    weights[GATE] = d >= 0.12 ? 0.5 + 0.5 * d : 0;
    weights[SLALOM] = d >= 0.3 ? 0.3 + 0.6 * d : 0;
    weights[ROTATING] = d >= 0.22 ? 0.4 + 0.5 * d : 0;
    weights[MISSILES] = d >= 0.06 && last !== MISSILES ? 0.55 + 0.4 * d : 0;
    weights[TUNNEL] = d >= 0.4 ? 0.5 * d : 0;
    weights[COMBO] = d >= 0.18 ? 0.4 + 0.9 * d : 0;
    if (last >= 0) weights[last] *= 0.3; // variety
    let total = 0;
    for (let k = 0; k < KINDS; k++) total += weights[k];
    let r = Math.random() * total;
    for (let k = 0; k < KINDS; k++) {
      r -= weights[k];
      if (r <= 0 && weights[k] > 0) return k;
    }
    return VERTICAL;
  }

  // Places one pattern starting at x and returns its width.
  function spawn(x, d, speed) {
    const kind = count === 0 ? COINS : pick(d);
    count++;
    last = kind;
    if (kind === COINS) return coinShape(x, coins.LOW, coins.HIGH);
    if (kind === VERTICAL) return vertical(x, d);
    if (kind === HORIZONTAL) return horizontal(x, d);
    if (kind === DIAGONAL) return diagonal(x, d);
    if (kind === GATE) return gate(x, d);
    if (kind === SLALOM) return slalom(x, d, speed);
    if (kind === ROTATING) return rotating(x, d);
    if (kind === MISSILES) return missileRun(x, d, speed);
    if (kind === COMBO) return combo(x, d, speed);
    return tunnel(x, d);
  }

  return {
    reset() {
      untilNext = 3;
      count = 0;
      last = -1;
      markerOn.fill(0);
    },

    // move: how far the world scrolled. d: difficulty from 0 to 1.
    update(move, d, speed, heroY) {
      untilNext -= move;
      while (untilNext <= 0) {
        const width = spawn(SPAWN_X + untilNext, d, speed);
        untilNext += width + speed * (0.9 - 0.45 * d) + 1.4;
      }
      for (let i = 0; i < MAX_MARKERS; i++) {
        if (!markerOn[i]) continue;
        markerX[i] -= move;
        if (markerX[i] <= HERO_X + speed * MISSILE_LEAD) {
          markerOn[i] = 0;
          missiles.launch(heroY);
        }
      }
    },
  };
}
