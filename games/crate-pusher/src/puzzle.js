// The rules: the grid, the worker, the crates and the move history. No
// drawing here; the scene reads this state and animates towards it.

import { LEVELS } from './levels.js';

export function createPuzzle() {
  let start = null; // the level as loaded, for restarts

  const puzzle = {
    index: 0,
    W: 0,
    H: 0,
    wall: null,
    goal: null,
    floor: null,
    dead: null, // cells a crate can never leave towards a spot
    goals: [],
    crates: [], // cell of each crate; a crate keeps its index for life
    crateAt: null, // cell -> crate index, or -1
    stuck: [], // per crate: true when it can no longer reach a spot
    player: 0,
    moves: 0,
    onGoal: 0,
    history: [], // per move: dir + 4 * (pushed crate + 1)
    beforeRestart: null, // the history a restart threw away, so B can bring it back
    lastCrate: -1, // the crate the last move or undo pushed or pulled

    load(index) {
      const map = LEVELS[index].map;
      this.index = index;
      const H = map.length;
      let W = 0;
      for (let y = 0; y < H; y++) W = Math.max(W, map[y].length);
      this.W = W;
      this.H = H;
      const size = W * H;
      this.wall = new Uint8Array(size);
      this.goal = new Uint8Array(size);
      this.floor = new Uint8Array(size);
      this.crateAt = new Int16Array(size).fill(-1);
      this.goals = [];
      const crates = [];
      let player = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ch = map[y][x] || ' ';
          const c = y * W + x;
          if (ch === '#') this.wall[c] = 1;
          if (ch === '.' || ch === '*' || ch === '+') {
            this.goal[c] = 1;
            this.goals.push(c);
          }
          if (ch === '$' || ch === '*') crates.push(c);
          if (ch === '@' || ch === '+') player = c;
        }
      }
      // The floor is everything the worker can reach with the crates ignored.
      const stack = [player];
      this.floor[player] = 1;
      while (stack.length) {
        const c = stack.pop();
        for (let d = 0; d < 4; d++) {
          const n = c + this.step(d);
          if (!this.wall[n] && !this.floor[n]) {
            this.floor[n] = 1;
            stack.push(n);
          }
        }
      }
      this.dead = findDead(this);
      start = { crates, player };
      this.beforeRestart = null;
      this.reset();
    },

    reset() {
      this.crates = start.crates.slice();
      this.stuck = this.crates.map(() => false);
      this.player = start.player;
      this.moves = 0;
      this.history = [];
      this.crateAt.fill(-1);
      for (let i = 0; i < this.crates.length; i++) this.crateAt[this.crates[i]] = i;
      this.update();
    },

    // Cell offset of one step in direction d.
    step(d) {
      return d === 0 ? -this.W : d === 1 ? 1 : d === 2 ? this.W : -1;
    },

    x(c) {
      return (c % this.W) - (this.W - 1) / 2;
    },

    z(c) {
      return Math.floor(c / this.W) - (this.H - 1) / 2;
    },

    // Moves the worker one cell. Returns 0 when blocked, 1 for a walk and
    // 2 for a push (lastCrate is then the pushed crate).
    move(d) {
      const s = this.step(d);
      const to = this.player + s;
      if (!this.floor[to]) return 0;
      const k = this.crateAt[to];
      this.lastCrate = k;
      if (k >= 0) {
        const t = to + s;
        if (!this.floor[t] || this.crateAt[t] >= 0) return 0;
        this.crateAt[to] = -1;
        this.crateAt[t] = k;
        this.crates[k] = t;
      }
      this.player = to;
      this.moves++;
      this.history.push(d + 4 * (k + 1));
      this.beforeRestart = null;
      if (k >= 0) this.update();
      return k >= 0 ? 2 : 1;
    },

    // Takes back the last move. Returns its direction, or -1 with nothing
    // to undo. lastCrate is the crate pulled back, or -1.
    undo() {
      if (!this.history.length) return -1;
      const e = this.history.pop();
      const d = e & 3;
      const k = (e >> 2) - 1;
      const s = this.step(d);
      if (k >= 0) {
        this.crateAt[this.crates[k]] = -1;
        this.crates[k] = this.player;
        this.crateAt[this.player] = k;
      }
      this.player -= s;
      this.moves--;
      this.lastCrate = k;
      if (k >= 0) this.update();
      return d;
    },

    // Back to the start; the moves made so far can be brought back once.
    restart() {
      const kept = this.history.length ? this.history.slice() : this.beforeRestart;
      this.reset();
      this.beforeRestart = kept;
    },

    // Replays the moves a restart threw away. Returns false when there are none.
    undoRestart() {
      const list = this.beforeRestart;
      if (!list || this.history.length) return false;
      for (let i = 0; i < list.length; i++) this.move(list[i] & 3);
      this.beforeRestart = null;
      return true;
    },

    solved() {
      return this.onGoal === this.crates.length;
    },

    // Recounts crates on spots and marks the ones that can never reach one.
    update() {
      this.onGoal = 0;
      for (let i = 0; i < this.crates.length; i++) {
        const c = this.crates[i];
        if (this.goal[c]) this.onGoal++;
        this.stuck[i] = !this.goal[c] && (this.dead[c] === 1 || frozen(this, c));
      }
    },
  };

  return puzzle;
}

// Cells from which a crate can never be pushed onto any spot, found by
// pulling crates backwards from every spot at once.
function findDead(p) {
  const live = new Uint8Array(p.floor.length);
  const queue = p.goals.slice();
  for (let i = 0; i < queue.length; i++) live[queue[i]] = 1;
  for (let q = 0; q < queue.length; q++) {
    for (let d = 0; d < 4; d++) {
      const s = p.step(d);
      const from = queue[q] + s;
      if (p.floor[from] && p.floor[from + s] && !live[from]) {
        live[from] = 1;
        queue.push(from);
      }
    }
  }
  const dead = new Uint8Array(p.floor.length);
  for (let c = 0; c < dead.length; c++) dead[c] = p.floor[c] && !live[c] ? 1 : 0;
  return dead;
}

// True when the crate at c sits in a 2x2 block of walls and crates with a
// crate off its spot in it: nothing in that block can ever move again.
function frozen(p, c) {
  const W = p.W;
  for (let o = 0; o < 4; o++) {
    const a = c - (o & 1) - (o >> 1) * W;
    let solid = true;
    let loose = false;
    for (let b = 0; b < 4; b++) {
      const cell = a + (b & 1) + (b >> 1) * W;
      if (p.crateAt[cell] >= 0) {
        if (!p.goal[cell]) loose = true;
      } else if (!p.wall[cell]) {
        solid = false;
        break;
      }
    }
    if (solid && loose) return true;
  }
  return false;
}
