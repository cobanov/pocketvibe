// The title-screen autopilot: steers the player towards the nearest dot (or
// a frightened drone) while keeping away from the dangerous ones. It works on
// breadth-first distance maps over the maze, all in preallocated arrays.

import { H, W } from './mazes.js';
import { DX, DY, NONE, opposite, wrapX } from './shared.js';
import { COUNT, LEAVING, ROAMING } from './drones.js';

const CELLS = W * H;
const FAR = 999;
const RETHINK = 0.15; // seconds between fresh looks at the drones

export function createAutopilot(maze, drones) {
  const toDot = new Int16Array(CELLS);
  const toDanger = new Int16Array(CELLS);
  const toPrey = new Int16Array(CELLS);
  const queue = new Int16Array(CELLS);
  let sources = 0;
  let lastTile = -1;
  let clock = 0;
  let choice = NONE;

  function seed(dist, c) {
    if (dist[c] === 0) return;
    dist[c] = 0;
    queue[sources++] = c;
  }

  // Fills dist from the cells already seeded in queue[0..sources).
  function spread(dist) {
    let head = 0;
    let tail = sources;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let d = 0; d < 4; d++) {
        const ny = cy + DY[d];
        const nx = wrapX(cx + DX[d]);
        if (!maze.open(nx, ny)) continue;
        const n = ny * W + nx;
        if (dist[n] <= dist[c] + 1) continue;
        dist[n] = dist[c] + 1;
        queue[tail++] = n;
      }
    }
  }

  function cellOf(x, y) {
    return Math.round(y) * W + wrapX(Math.round(x));
  }

  function think(player) {
    toDot.fill(FAR);
    sources = maze.forEachDot(queue);
    for (let i = 0; i < sources; i++) toDot[queue[i]] = 0;
    spread(toDot);

    toDanger.fill(FAR);
    toPrey.fill(FAR);
    sources = 0;
    for (let i = 0; i < COUNT; i++) {
      const d = drones.list[i];
      if (d.mode !== ROAMING && d.mode !== LEAVING) continue;
      if (d.fright) continue;
      seed(toDanger, cellOf(d.x, d.y));
      const ax = Math.round(d.x) + DX[d.dir];
      const ay = Math.round(d.y) + DY[d.dir];
      if (maze.open(ax, ay)) seed(toDanger, ay * W + wrapX(ax));
    }
    spread(toDanger);
    sources = 0;
    for (let i = 0; i < COUNT; i++) {
      const d = drones.list[i];
      if (d.mode === ROAMING && d.fright) seed(toPrey, cellOf(d.x, d.y));
    }
    spread(toPrey);

    // Decide at the cell the player is about to reach.
    let cx = Math.round(player.x);
    let cy = Math.round(player.y);
    const ahead = (player.x - cx) * DX[player.dir] + (player.y - cy) * DY[player.dir];
    if (player.moving && ahead > 0.05) {
      cx += DX[player.dir];
      cy += DY[player.dir];
    }
    cx = wrapX(cx);
    const here = cy * W + cx;
    const hunting = toPrey[here] < 10;

    let best = NONE;
    let bestCost = Infinity;
    for (let d = 0; d < 4; d++) {
      const nx = wrapX(cx + DX[d]);
      const ny = cy + DY[d];
      if (!maze.open(nx, ny)) continue;
      const n = ny * W + nx;
      let cost = hunting ? toPrey[n] : toDot[n];
      const danger = toDanger[n];
      if (danger <= 1) cost += 500;
      else if (danger <= 3) cost += (4 - danger) * 30;
      else if (danger <= 6) cost += (7 - danger) * 2;
      if (d === opposite(player.dir)) cost += 1.5;
      cost += Math.random() * 0.3;
      if (cost < bestCost) {
        bestCost = cost;
        best = d;
      }
    }
    return best;
  }

  return {
    reset() {
      lastTile = -1;
      clock = 0;
      choice = NONE;
    },

    // The direction the autopilot wants this frame.
    steer(dt, player) {
      clock -= dt;
      const tile = cellOf(player.x, player.y);
      if (tile !== lastTile || clock <= 0) {
        lastTile = tile;
        clock = RETHINK;
        choice = think(player);
      }
      return choice;
    },
  };
}
