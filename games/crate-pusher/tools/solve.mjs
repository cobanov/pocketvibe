// Level checker: solves every level in src/levels.js with a move-optimal A*
// search and compares the result with the par stored in the level.
//
//   node tools/solve.mjs            check all levels
//   node tools/solve.mjs 4 12       check levels 4 and 12 (1-based)
//   node tools/solve.mjs --path     also print each solution (u r d l, capitals push)
//
// The search runs over (worker cell, crate cells). Every step costs one move,
// so the first time the solved state is taken off the queue its move count is
// the minimum. The heuristic is the sum of each crate's push distance to the
// nearest spot plus the walk to the nearest crate: it never overestimates and
// is consistent, so A* stays exact. Crates are never pushed onto dead squares
// (cells from which no spot can be reached) or into a 2x2 block that is not
// all spots.

import { pathToFileURL } from 'node:url';

const INF = 1e9;

// Parses a map: # wall, . spot, $ crate, * crate on spot, @ worker,
// + worker on spot, anything else is floor (or outside, if not reachable).
export function parse(rows) {
  const H = rows.length;
  const W = Math.max(...rows.map((r) => r.length));
  const size = W * H;
  const wall = new Uint8Array(size);
  const goal = new Uint8Array(size);
  const floor = new Uint8Array(size);
  const crates = [];
  let player = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = rows[y][x] ?? ' ';
      const i = y * W + x;
      if (ch === '#') wall[i] = 1;
      if (ch === '.' || ch === '*' || ch === '+') goal[i] = 1;
      if (ch === '$' || ch === '*') crates.push(i);
      if (ch === '@' || ch === '+') {
        if (player >= 0) throw new Error('more than one worker');
        player = i;
      }
    }
  }
  if (player < 0) throw new Error('no worker');

  // The floor is everything the worker could walk to if no crate were there.
  const stack = [player];
  floor[player] = 1;
  while (stack.length) {
    const c = stack.pop();
    const x = c % W;
    const y = (c - x) / W;
    const next = [y > 0 ? c - W : -1, x < W - 1 ? c + 1 : -1, y < H - 1 ? c + W : -1, x > 0 ? c - 1 : -1];
    for (const n of next) {
      if (n < 0 || wall[n] || floor[n]) continue;
      if (n % W === 0 || n % W === W - 1 || n < W || n >= size - W) throw new Error('floor reaches the map edge');
      floor[n] = 1;
      stack.push(n);
    }
  }
  const goals = [];
  for (let i = 0; i < size; i++) if (goal[i]) goals.push(i);
  for (const c of crates) if (!floor[c]) throw new Error('crate outside the floor');
  for (const g of goals) if (!floor[g]) throw new Error('spot outside the floor');
  if (crates.length !== goals.length) throw new Error(`${crates.length} crates but ${goals.length} spots`);
  return { W, H, wall, goal, floor, crates: crates.sort((a, b) => a - b), goals, player };
}

// Push distance from every cell to the nearest spot, found by pulling crates
// backwards from all spots at once. INF marks a dead square.
export function pushDistance(lv) {
  const { W, floor, goals } = lv;
  const dist = new Int32Array(floor.length).fill(INF);
  const dirs = [-W, 1, W, -1];
  const queue = [];
  for (const g of goals) {
    dist[g] = 0;
    queue.push(g);
  }
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    for (const d of dirs) {
      // A crate at c+d pushed by a worker at c+2d lands on c.
      const from = c + d;
      if (floor[from] && floor[from + d] && dist[from] === INF) {
        dist[from] = dist[c] + 1;
        queue.push(from);
      }
    }
  }
  return dist;
}

const MOVE = 'urdl';
const PUSH = 'URDL';

export function solve(rows, { maxStates = 40e6 } = {}) {
  const lv = parse(rows);
  const { W, floor, goal } = lv;
  const dist = pushDistance(lv);
  const dirs = [-W, 1, W, -1];
  const n = lv.crates.length;
  const boxAt = new Uint8Array(floor.length);
  for (const c of lv.crates) if (dist[c] === INF) return { solvable: false, reason: 'crate starts on a dead square' };

  const px = (c) => c % W;
  const py = (c) => Math.floor(c / W);

  function heuristic(player, crates) {
    let pushes = 0;
    let walk = INF;
    for (let i = 0; i < n; i++) {
      pushes += dist[crates[i]];
      const m = Math.abs(px(player) - px(crates[i])) + Math.abs(py(player) - py(crates[i])) - 1;
      if (m < walk) walk = m;
    }
    return pushes === 0 ? 0 : pushes + Math.max(0, walk);
  }

  // A crate that ends up in a 2x2 block of walls and crates can never move
  // again; that is only fine when every crate in the block is on a spot.
  function frozen(t) {
    const offsets = [0, -1, -W, -W - 1];
    for (const o of offsets) {
      const a = t + o;
      const block = [a, a + 1, a + W, a + W + 1];
      let solid = true;
      let loose = false;
      for (const b of block) {
        if (boxAt[b]) {
          if (!goal[b]) loose = true;
        } else if (!lv.wall[b]) {
          solid = false;
          break;
        }
      }
      if (solid && loose) return true;
    }
    return false;
  }

  const key = (player, crates) => String.fromCharCode(player, ...crates);
  const best = new Map(); // key -> g * 8 + last move (0..7)
  const parent = new Map();
  const closed = new Set();
  const buckets = [];
  const push = (k, f) => {
    (buckets[f] || (buckets[f] = [])).push(k);
  };

  const startKey = key(lv.player, lv.crates);
  best.set(startKey, 0);
  push(startKey, heuristic(lv.player, lv.crates));
  const crates = new Array(n);
  let explored = 0;

  for (let f = 0; f < buckets.length; f++) {
    const bucket = buckets[f];
    if (!bucket) continue;
    while (bucket.length) {
      const k = bucket.pop();
      if (closed.has(k)) continue;
      closed.add(k);
      explored++;
      if (explored > maxStates) return { solvable: null, reason: `gave up after ${explored} states` };
      const player = k.charCodeAt(0);
      for (let i = 0; i < n; i++) crates[i] = k.charCodeAt(i + 1);
      const g = best.get(k) >> 3;

      let solved = true;
      for (let i = 0; i < n; i++) if (!goal[crates[i]]) solved = false;
      if (solved) {
        let path = '';
        let cur = k;
        while (cur !== startKey) {
          const code = best.get(cur) & 7;
          path = (code < 4 ? MOVE[code] : PUSH[code - 4]) + path;
          cur = parent.get(cur);
        }
        let pushes = 0;
        for (const ch of path) if (ch === ch.toUpperCase()) pushes++;
        return { solvable: true, moves: g, pushes, path, explored };
      }

      for (let i = 0; i < n; i++) boxAt[crates[i]] = 1;
      for (let d = 0; d < 4; d++) {
        const to = player + dirs[d];
        if (!floor[to]) continue;
        let nextKey;
        let code = d;
        if (boxAt[to]) {
          const t = to + dirs[d];
          if (!floor[t] || boxAt[t] || dist[t] === INF) continue;
          boxAt[to] = 0;
          boxAt[t] = 1;
          const stuck = frozen(t);
          boxAt[t] = 0;
          boxAt[to] = 1;
          if (stuck) continue;
          const moved = crates.map((c) => (c === to ? t : c)).sort((a, b) => a - b);
          nextKey = key(to, moved);
          code = 4 + d;
          if (closed.has(nextKey)) continue;
          const old = best.get(nextKey);
          if (old !== undefined && old >> 3 <= g + 1) continue;
          best.set(nextKey, (g + 1) * 8 + code);
          parent.set(nextKey, k);
          push(nextKey, g + 1 + heuristic(to, moved));
        } else {
          nextKey = key(to, crates);
          if (closed.has(nextKey)) continue;
          const old = best.get(nextKey);
          if (old !== undefined && old >> 3 <= g + 1) continue;
          best.set(nextKey, (g + 1) * 8 + code);
          parent.set(nextKey, k);
          push(nextKey, g + 1 + heuristic(to, crates));
        }
      }
      for (let i = 0; i < n; i++) boxAt[crates[i]] = 0;
    }
  }
  return { solvable: false, reason: 'no solution', explored };
}

// Replays a solution on the map and checks that it really solves it.
export function verify(rows, path) {
  const lv = parse(rows);
  const { W, floor, goal } = lv;
  const dirs = { u: -W, r: 1, d: W, l: -1 };
  const crates = new Set(lv.crates);
  let p = lv.player;
  for (const ch of path) {
    const d = dirs[ch.toLowerCase()];
    const to = p + d;
    if (!floor[to]) return false;
    if (crates.has(to)) {
      if (ch === ch.toLowerCase()) return false;
      if (!floor[to + d] || crates.has(to + d)) return false;
      crates.delete(to);
      crates.add(to + d);
    } else if (ch !== ch.toLowerCase()) {
      return false;
    }
    p = to;
  }
  for (const c of crates) if (!goal[c]) return false;
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const showPath = args.includes('--path');
  const picks = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const { LEVELS } = await import('../src/levels.js');
  let failed = 0;
  console.log(' #  name                  crates  par  moves pushes  states    time');
  for (let i = 0; i < LEVELS.length; i++) {
    if (picks.length && !picks.includes(i + 1)) continue;
    const level = LEVELS[i];
    const t0 = performance.now();
    let result;
    try {
      result = solve(level.map);
    } catch (e) {
      result = { solvable: false, reason: e.message };
    }
    const ms = performance.now() - t0;
    const crates = (level.map.join('').match(/[$*]/g) || []).length;
    const name = level.name.padEnd(22);
    if (!result.solvable) {
      failed++;
      console.log(`${String(i + 1).padStart(2)}  ${name}${String(crates).padStart(6)}  ${result.reason}`);
      continue;
    }
    const ok = verify(level.map, result.path) && result.moves === level.par;
    if (!ok) failed++;
    console.log(
      `${String(i + 1).padStart(2)}  ${name}${String(crates).padStart(6)} ${String(level.par).padStart(4)} ` +
        `${String(result.moves).padStart(6)} ${String(result.pushes).padStart(6)} ${String(result.explored).padStart(8)} ` +
        `${(ms / 1000).toFixed(1).padStart(6)}s${ok ? '' : '  PAR MISMATCH'}`,
    );
    if (showPath) console.log(`    ${result.path}`);
  }
  if (failed) {
    console.log(`\n${failed} level(s) failed`);
    process.exit(1);
  }
  console.log('\nAll levels solvable and every par is the minimum.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
