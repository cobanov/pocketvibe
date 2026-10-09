// The rules: a square board of exponents (3x3, 4x4 or 5x5), moves that
// slide and merge, a new tile after every move that changed something,
// scoring, one step of undo and the end of the game. Nothing is drawn here;
// every move leaves a record of where each tile went, which tiles.js animates.
// The board size is the one set in shared.js (setBoardSize).

import { CELLS, DOWN, GOAL_EXP, LEFT, MAX_CELLS, MAX_EXP, RIGHT, SIZE, SIZES, UP } from './shared.js';

const FOUR_CHANCE = 0.1;

// LINES[n][dir * n * n + line * n + k]: on the n x n board, the k-th cell
// of a line, counted from the wall the tiles slide towards.
const LINES = {};
for (const n of SIZES) {
  const cells = n * n;
  const lines = new Int8Array(4 * cells);
  for (let line = 0; line < n; line++) {
    for (let k = 0; k < n; k++) {
      lines[LEFT * cells + line * n + k] = line * n + k;
      lines[RIGHT * cells + line * n + k] = line * n + (n - 1 - k);
      lines[UP * cells + line * n + k] = k * n + line;
      lines[DOWN * cells + line * n + k] = (n - 1 - k) * n + line;
    }
  }
  LINES[n] = lines;
}

// The title demo's player values big tiles along a snake path that ends in
// the bottom left corner (halving along the bottom row, then a gentler fall
// back and forth up the board), and empty cells.
const CORNER_WEIGHT = {};
for (const n of SIZES) {
  const weights = new Float32Array(n * n);
  let w = 1024;
  for (let r = 0; r < n * n; r++) {
    const row = n - 1 - Math.floor(r / n);
    const k = r % n;
    const col = Math.floor(r / n) % 2 === 0 ? k : n - 1 - k;
    weights[row * n + col] = w;
    w *= r < n ? 0.5 : 0.75;
  }
  CORNER_WEIGHT[n] = weights;
}
const EMPTY_WEIGHT = 1000;
const UP_PENALTY = 2000; // UP pulls big tiles out of the corner
// The order the demo tries moves in, so ties keep it in its corner.
const DEMO_ORDER = [DOWN, LEFT, RIGHT, UP];

// Slides src in direction dir into out. dest[cell] gets the cell each tile
// went to (-1 for empty cells) and merged[cell] is 1 where two tiles met.
// Returns the points scored, or -1 when nothing moved.
export function slide(src, dir, out, dest, merged) {
  const lines = LINES[SIZE];
  let points = 0;
  let moved = false;
  out.fill(0);
  merged.fill(0);
  for (let line = 0; line < SIZE; line++) {
    const base = dir * CELLS + line * SIZE;
    let slot = 0; // next free position in the line
    let open = 0; // exponent of the last placed tile, if it may still merge
    for (let k = 0; k < SIZE; k++) {
      const from = lines[base + k];
      const e = src[from];
      if (e === 0) {
        dest[from] = -1;
        continue;
      }
      if (e === open && e < MAX_EXP) {
        // Joins the tile in the previous slot; that tile is done for this move.
        const to = lines[base + slot - 1];
        out[to] = e + 1;
        merged[to] = 1;
        dest[from] = to;
        points += 1 << (e + 1);
        open = 0;
        moved = true;
      } else {
        const to = lines[base + slot];
        out[to] = e;
        dest[from] = to;
        if (to !== from) moved = true;
        open = e;
        slot++;
      }
    }
  }
  return moved ? points : -1;
}

export function canMove(cells) {
  for (let i = 0; i < CELLS; i++) {
    const e = cells[i];
    if (e === 0) return true;
    if (e === MAX_EXP) continue; // the largest tiles never merge
    if (i % SIZE < SIZE - 1 && cells[i + 1] === e) return true;
    if (i < CELLS - SIZE && cells[i + SIZE] === e) return true;
  }
  return false;
}

export function createGame() {
  const cells = new Uint8Array(MAX_CELLS);
  const undoCells = new Uint8Array(MAX_CELLS);
  const scratch = new Uint8Array(MAX_CELLS);
  const scratchDest = new Int8Array(MAX_CELLS);
  const scratchMerged = new Uint8Array(MAX_CELLS);
  const reply = new Uint8Array(MAX_CELLS);

  // The value of the best move from board b, one move deep (a big loss if
  // there is none).
  function bestReply(b) {
    let best = -50000;
    for (let k = 0; k < 4; k++) {
      const dir = DEMO_ORDER[k];
      const points = slide(b, dir, reply, scratchDest, scratchMerged);
      if (points < 0) continue;
      const value = points * 2 + evaluate(reply) - (dir === UP ? UP_PENALTY : 0);
      if (value > best) best = value;
    }
    return best;
  }

  const game = {
    cells,
    score: 0,
    canUndo: false,
    undoScore: 0,
    undoWon: false,
    won: false, // the goal tile was made (the message was shown)
    startBest: 0, // the best score when this game began, set by the caller

    // What the last move did, for the animation and the effects.
    before: new Uint8Array(MAX_CELLS),
    dest: new Int8Array(MAX_CELLS),
    merged: new Uint8Array(MAX_CELLS),
    spawned: -1,
    gained: 0,
    grew: 0, // the new biggest tile's exponent if the move made one, else 0
    justWon: false,

    // An empty board (no game).
    clear() {
      cells.fill(0);
      game.score = 0;
      game.canUndo = false;
      game.won = false;
      game.justWon = false;
    },

    newGame() {
      game.clear();
      game.spawn();
      game.spawn();
    },

    // A 2 (or sometimes a 4) on a random empty cell. Returns the cell or -1.
    spawn() {
      let empty = 0;
      for (let i = 0; i < CELLS; i++) if (cells[i] === 0) empty++;
      if (empty === 0) return -1;
      let pick = Math.floor(Math.random() * empty);
      for (let i = 0; i < CELLS; i++) {
        if (cells[i] !== 0) continue;
        if (pick-- === 0) {
          cells[i] = Math.random() < FOUR_CHANCE ? 2 : 1;
          return i;
        }
      }
      return -1;
    },

    // Slides the board. Returns false (and changes nothing) if no tile moved.
    move(dir) {
      const points = slide(cells, dir, scratch, game.dest, game.merged);
      if (points < 0) return false;
      const top = game.biggest();
      game.before.set(cells);
      undoCells.set(cells);
      game.undoScore = game.score;
      game.undoWon = game.won;
      game.canUndo = true;
      cells.set(scratch);
      game.score += points;
      game.gained = points;
      game.justWon = false;
      const e = game.biggest();
      game.grew = e > top ? e : 0;
      if (!game.won && e >= GOAL_EXP[SIZE]) {
        game.won = true;
        game.justWon = true;
      }
      game.spawned = game.spawn();
      return true;
    },

    // Puts the board back to before the last move (one step only).
    undo() {
      if (!game.canUndo) return false;
      cells.set(undoCells);
      game.score = game.undoScore;
      game.won = game.undoWon; // a goal tile taken back can be made again
      game.justWon = false;
      game.canUndo = false;
      return true;
    },

    canMove() {
      return canMove(cells);
    },

    biggest() {
      let e = 0;
      for (let i = 0; i < CELLS; i++) if (cells[i] > e) e = cells[i];
      return e;
    },

    // The title screen's player: for every move, the average over each
    // place a new 2 could land of the best reply. Returns a direction or -1.
    autoMove() {
      let bestDir = -1;
      let bestValue = -Infinity;
      for (let k = 0; k < 4; k++) {
        const dir = DEMO_ORDER[k];
        const points = slide(cells, dir, scratch, scratchDest, scratchMerged);
        if (points < 0) continue;
        let sum = 0;
        let n = 0;
        for (let i = 0; i < CELLS; i++) {
          if (scratch[i] !== 0) continue;
          scratch[i] = 1;
          sum += bestReply(scratch);
          scratch[i] = 0;
          n++;
        }
        let value = points * 2 + (n > 0 ? sum / n : evaluate(scratch));
        if (dir === UP) value -= UP_PENALTY;
        if (value > bestValue) {
          bestValue = value;
          bestDir = dir;
        }
      }
      return bestDir;
    },

    // Writes the game into a plain object for hh.save.
    snapshot(out) {
      for (let i = 0; i < CELLS; i++) {
        out.cells[i] = cells[i];
        out.undo[i] = undoCells[i];
      }
      out.score = game.score;
      out.undoScore = game.undoScore;
      out.canUndo = game.canUndo;
      out.undoWon = game.undoWon;
      out.won = game.won;
      out.startBest = game.startBest;
      return out;
    },

    // Loads a saved game of the current board size; anything malformed is
    // refused (returns false and leaves an empty board).
    restore(data) {
      game.clear();
      if (!data || !validBoard(data.cells) || !Number.isFinite(data.score) || data.score < 0) return false;
      let tiles = 0;
      for (let i = 0; i < CELLS; i++) if (data.cells[i] > 0) tiles++;
      if (tiles === 0) return false;
      for (let i = 0; i < CELLS; i++) cells[i] = data.cells[i];
      game.score = Math.floor(data.score);
      game.won = data.won === true;
      game.undoWon = data.undoWon === true;
      // Games saved before there was one count from where they were.
      game.startBest = Number.isFinite(data.startBest) && data.startBest >= 0 ? Math.floor(data.startBest) : game.score;
      game.canUndo = data.canUndo === true && validBoard(data.undo) && Number.isFinite(data.undoScore);
      if (game.canUndo) {
        for (let i = 0; i < CELLS; i++) undoCells[i] = data.undo[i];
        game.undoScore = Math.floor(data.undoScore);
      }
      return true;
    },
  };
  return game;
}

function evaluate(b) {
  let value = 0;
  const weights = CORNER_WEIGHT[SIZE];
  for (let i = 0; i < CELLS; i++) value += b[i] === 0 ? EMPTY_WEIGHT : weights[i] * (1 << b[i]) * 0.02;
  return value;
}

function validBoard(list) {
  if (!Array.isArray(list) || list.length !== CELLS) return false;
  for (let i = 0; i < CELLS; i++) {
    const e = list[i];
    if (!Number.isInteger(e) || e < 0 || e > MAX_EXP) return false;
  }
  return true;
}
