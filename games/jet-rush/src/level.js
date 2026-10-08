// The level generator: picks hazard patterns as the corridor scrolls, with
// coins in the gaps. Every pattern leaves a way through for a hero who is
// 1.5 units tall, and the gap between patterns is long enough (in time) to
// fly from floor to ceiling. Harder patterns unlock with distance, each one
// shown on its own the first time; past full speed (`late`) the mix keeps
// leaning towards the hardest ones. Coin shapes grow fancier the same way.

import { CEIL_Y, HERO_X, MID_Y, SPAWN_X } from './shared.js';
import { BEAM_R, LANES, fireEnd, fireStart } from './lasers.js';

const NODE_Y = 0.45; // a zapper standing on the floor has its lower node here
const TOP_Y = CEIL_Y - 0.45; // and one hanging from the ceiling its upper node
const VERTICAL_A = Math.PI / 2;
const DIAG_A = Math.PI / 4;
const MISSILE_LEAD = 1.45; // seconds between a missile warning and its arrival
// A laser run starts when its marker is this far ahead of the hero, just
// after the pattern before it has gone past.
const LASER_AHEAD = 4;

// The hero, for laying coins where the lasers leave room: feet from 0 up to
// HERO_TOP, hit points 0.3 to 1.12 above the feet with a radius of 0.27.
const HERO_TOP = CEIL_Y - 1.52;
const HERO_MID = 0.72;
const CLEAR = BEAM_R + 0.27 + 0.2; // with a little room to spare

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
const LASERS = 10;
const ELEVATOR = 11;
const SBEND = 12;
const CROSSFIRE = 13;
const KINDS = 14;

// Difficulty at which each kind first appears (0 = from the start). The
// first time, it comes on its own as the next pattern.
const UNLOCK = new Float32Array(KINDS);
UNLOCK[MISSILES] = 0.06;
UNLOCK[GATE] = 0.12;
UNLOCK[LASERS] = 0.15;
UNLOCK[COMBO] = 0.18;
UNLOCK[ROTATING] = 0.22;
UNLOCK[ELEVATOR] = 0.25;
UNLOCK[SLALOM] = 0.3;
UNLOCK[TUNNEL] = 0.4;
UNLOCK[SBEND] = 0.45;
UNLOCK[CROSSFIRE] = 0.85;

// Laser layouts as lane bit masks (bit 0 is the floor lane, see LANES).
const LASER_EASY = [0b00100, 0b10001, 0b00011, 0b11000];
const LASER_HARD = [0b01010, 0b10101, 0b00111, 0b11100, 0b00110, 0b01100, 0b01001, 0b10010, 0b01110];
const LASER_LATE = [0b11011, 0b10101, 0b01110];

const MAX_MARKERS = 6;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// True if a hero with feet at y is clear of every beam in mask.
function clearOf(mask, y) {
  for (let k = 0; k < LANES.length; k++) {
    if (mask & (1 << k) && LANES[k] > y + 0.3 - CLEAR && LANES[k] < y + 1.12 + CLEAR) return false;
  }
  return true;
}

// The middle of a random gap that the beams of mask leave open, as a coin
// height (the hero's middle), or -1 if there is none.
function laserGap(mask) {
  const step = 0.05;
  let pick = -1;
  let runs = 0;
  let from = -1;
  for (let y = 0; y <= HERO_TOP + step; y += step) {
    const ok = y <= HERO_TOP && clearOf(mask, y);
    if (ok && from < 0) from = y;
    if (!ok && from >= 0) {
      runs++;
      if (Math.random() * runs < 1) pick = (from + y - step) / 2;
      from = -1;
    }
  }
  return pick < 0 ? -1 : pick + HERO_MID;
}

// sideRoom: how much further than on the 3:2 screen the view reaches to the
// right. Patterns start that much further out, so they never pop in on a wide
// screen; they keep their spacing, so the run plays the same.
export function createLevel(zappers, coins, missiles, lasers, sideRoom = 0) {
  const spawnX = SPAWN_X + sideRoom;
  const weights = new Float32Array(KINDS);
  const introduced = new Uint8Array(KINDS);
  // Missile triggers ride along with the world like everything else.
  const markerX = new Float32Array(MAX_MARKERS);
  const markerOn = new Uint8Array(MAX_MARKERS);
  // So does the one laser run waiting to start.
  const plan = new Uint8Array(3);
  let planWaves = 0;
  let laserX = 0;
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
  // Further on, the fancier shapes come up more often.
  function coinShape(x, ylo, yhi, d) {
    const r = Math.random() * (0.55 + 0.45 * d);
    const G = coins.GAP;
    const mid = (ylo + yhi) / 2;
    if (r < 0.13) return coins.line(x, rand(ylo, yhi), 8 + Math.floor(Math.random() * (5 + 5 * d)));
    if (r < 0.23) return coins.arc(x, rand(ylo, Math.max(ylo, yhi - 1.6)), 9, 1.6);
    if (r < 0.34) return coins.block(x, rand(ylo, Math.max(ylo, yhi - 2 * G)), 6 + Math.floor(Math.random() * 3), 3);
    if (r < 0.45) return coins.wave(x, rand(ylo + 0.9, Math.max(ylo + 0.9, yhi - 0.9)), 14, 0.9);
    if (r < 0.55) {
      const up = Math.random() < 0.5;
      return coins.diagonal(x, up ? rand(ylo, ylo + 1) : rand(yhi - 1, yhi), 9, up ? 0.42 : -0.42);
    }
    if (r < 0.66) return coins.zigzag(x, rand(Math.min(mid, ylo + 1.2), Math.max(mid, yhi - 1.2)), 13, 1.2);
    if (r < 0.76) return coins.ring(x, rand(Math.min(mid, ylo + 1.4), Math.max(mid, yhi - 1.4)), 1.4);
    if (r < 0.86) return coins.chevron(x, rand(Math.min(mid, ylo + 2), Math.max(mid, yhi - 2)), 4, 0.5);
    if (r < 0.94) return coins.diamond(x, rand(Math.min(mid, ylo + 1.2), Math.max(mid, yhi - 1.2)), 3);
    const y = rand(ylo, Math.max(ylo, yhi - 1.6));
    coins.line(x, y + 1.6, 10);
    return coins.line(x, y, 10);
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

  // Two zappers from floor and ceiling with a hole between them at gy.
  function gate(x, d, gy = rand(2.1, 4.9)) {
    const half = 1.5 - 0.1 * d;
    const cx = x + 0.5;
    const low = gy - half - NODE_Y;
    if (low > 0.9) zappers.add(cx, NODE_Y + low / 2, low, VERTICAL_A, 0);
    const high = TOP_Y - (gy + half);
    if (high > 0.9) zappers.add(cx, TOP_Y - high / 2, high, VERTICAL_A, 0);
    coinRow(cx, gy, 7);
    return 1;
  }

  // Two gates close behind each other, the second hole higher or lower:
  // a quick S through the wall.
  function sbend(x, d, speed) {
    const g1 = rand(2.1, 4.9);
    const g2 = Math.max(2.1, Math.min(4.9, g1 + (g1 < MID_Y ? 1 : -1) * rand(1.4, 2.4)));
    const step = speed * 0.5 + 2.2;
    gate(x, d, g1);
    gate(x + step, d, g2);
    coins.trail(x + 3.4, g1, x + step - 2.4, g2, coins.GAP * 1.2);
    return step + 1;
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

  // Zappers riding up and down a rail across the middle of the corridor;
  // two of them move in opposite directions. There is always room above or
  // below, but which one changes as they move.
  function elevator(x, d, speed) {
    const n = d > 0.55 && Math.random() < 0.5 ? 2 : 1;
    const step = speed * 0.55 + 2.4;
    const omega = 2 + d;
    let phase = Math.random() * Math.PI * 2;
    let cx = x;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.55) {
        zappers.add(cx + 0.5, MID_Y, 2.2, VERTICAL_A, 0, 1.5, omega, phase);
        cx += 1 + step;
      } else {
        zappers.add(cx + 1.7, MID_Y, 2.6, 0, 0, 1.8, omega, phase);
        cx += 3.4 + step;
      }
      phase += Math.PI;
    }
    const width = cx - step - x;
    // Coins along the middle; those in the zappers' way are left out.
    coins.line(x - 1.5, MID_Y, Math.floor((width + 3) / coins.GAP) + 1);
    return width;
  }

  function missileRun(x, d, late, speed) {
    const n = 1 + (d > 0.35 ? 1 : 0) + (d > 0.7 ? 1 : 0) + (late > 0.5 ? 1 : 0);
    const step = speed * 0.55;
    for (let i = 0; i < n; i++) addMarker(x + 1 + i * step);
    if (Math.random() < 0.6) coinShape(x, coins.LOW, coins.HIGH, d);
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

  // Two to four single zappers in a row, a short flight apart.
  function combo(x, d, late, speed) {
    const n = (d > 0.65 ? 3 : 2) + (late > 0.6 && Math.random() < 0.5 ? 1 : 0);
    const step = speed * 0.55 + 1.5;
    let cx = x;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      let w;
      if (r < 0.35) w = vertical(cx, d);
      else if (r < 0.6) w = diagonal(cx, d);
      else if (r < 0.85 || d < 0.5) w = horizontal(cx, d);
      else w = rotating(cx, d);
      cx += w + step;
    }
    return cx - step - x;
  }

  // A slalom with a missile timed to arrive halfway through it.
  function crossfire(x, d, speed) {
    const width = slalom(x, d, speed);
    addMarker(x + width / 2 + 0.5);
    return width;
  }

  function laserLayout(d, late) {
    const pool = late > 0.3 && Math.random() < 0.35 ? LASER_LATE : d < 0.35 || Math.random() < 0.3 ? LASER_EASY : LASER_HARD;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // A laser run of one to three waves. Its marker starts it once the pattern
  // before has gone by; coins line a gap of each wave where the corridor
  // passes the hero while it fires, with a trail from one gap to the next.
  function laserRun(x, d, late, speed) {
    const waves = d < 0.35 ? 1 : d < 0.7 ? (Math.random() < 0.6 ? 2 : 1) : Math.random() < 0.3 + 0.5 * late ? 3 : 2;
    for (let i = 0; i < waves; i++) {
      let mask = laserLayout(d, late);
      while (i > 0 && mask === plan[i - 1]) mask = laserLayout(d, late);
      plan[i] = mask;
    }
    planWaves = waves;
    laserX = x;
    // The corridor at x + s passes the hero s / speed after the run starts.
    const at = x - LASER_AHEAD;
    let prevY = -1;
    for (let i = 0; i < waves; i++) {
      const y = laserGap(plan[i]);
      if (y < 0) continue;
      const x0 = at + (fireStart(i) + 0.1) * speed;
      const x1 = at + (fireEnd(i) - 0.1) * speed;
      if (prevY >= 0) coins.trail(at + (fireEnd(i - 1) + 0.15) * speed, prevY, at + (fireStart(i) - 0.15) * speed, y, coins.GAP * 1.4);
      coins.line(x0, y, Math.min(16, Math.floor((x1 - x0) / coins.GAP) + 1));
      prevY = y;
    }
    // The run holds the corridor; the next pattern comes a moment after it.
    return speed * (fireEnd(waves - 1) + 0.25) - LASER_AHEAD;
  }

  function pick(d, late) {
    // A kind that has just unlocked comes first, on its own.
    for (let k = 0; k < KINDS; k++) {
      if (UNLOCK[k] > 0 && !introduced[k] && d >= UNLOCK[k] && k !== last) {
        introduced[k] = 1;
        return k;
      }
    }
    const plain = 1 - 0.4 * late;
    weights[COINS] = 1.0 - 0.75 * d;
    weights[VERTICAL] = plain;
    weights[HORIZONTAL] = 0.9 * plain;
    weights[DIAGONAL] = 0.8 * plain;
    weights[GATE] = 0.5 + 0.5 * d;
    weights[SLALOM] = 0.3 + 0.6 * d;
    weights[ROTATING] = 0.4 + 0.5 * d;
    weights[MISSILES] = last !== MISSILES ? 0.55 + 0.4 * d : 0;
    weights[TUNNEL] = 0.5 * d;
    weights[COMBO] = 0.4 + 0.9 * d + 0.4 * late;
    weights[LASERS] = last !== LASERS ? 0.4 + 0.3 * d + 0.3 * late : 0;
    weights[ELEVATOR] = 0.4 + 0.5 * d;
    weights[SBEND] = 0.3 + 0.5 * d;
    weights[CROSSFIRE] = 0.2 + 0.7 * late;
    for (let k = 0; k < KINDS; k++) if (d < UNLOCK[k]) weights[k] = 0;
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
  function spawn(x, d, late, speed) {
    const kind = count === 0 ? COINS : pick(d, late);
    count++;
    last = kind;
    if (kind === COINS) return coinShape(x, coins.LOW, coins.HIGH, d);
    if (kind === VERTICAL) return vertical(x, d);
    if (kind === HORIZONTAL) return horizontal(x, d);
    if (kind === DIAGONAL) return diagonal(x, d);
    if (kind === GATE) return gate(x, d);
    if (kind === SLALOM) return slalom(x, d, speed);
    if (kind === ROTATING) return rotating(x, d);
    if (kind === MISSILES) return missileRun(x, d, late, speed);
    if (kind === COMBO) return combo(x, d, late, speed);
    if (kind === LASERS) return laserRun(x, d, late, speed);
    if (kind === ELEVATOR) return elevator(x, d, speed);
    if (kind === SBEND) return sbend(x, d, speed);
    if (kind === CROSSFIRE) return crossfire(x, d, speed);
    return tunnel(x, d);
  }

  return {
    reset() {
      untilNext = 3;
      count = 0;
      last = -1;
      planWaves = 0;
      markerOn.fill(0);
      introduced.fill(0);
    },

    // move: how far the world scrolled. d: difficulty from 0 to 1 (full
    // speed at 1); late: 0 to 1 past that.
    update(move, d, late, speed, heroY) {
      untilNext -= move;
      while (untilNext <= 0) {
        const width = spawn(spawnX + untilNext, d, late, speed);
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
      if (planWaves > 0) {
        laserX -= move;
        if (laserX <= HERO_X + LASER_AHEAD) {
          lasers.start(plan, planWaves);
          planWaves = 0;
        }
      }
    },
  };
}
