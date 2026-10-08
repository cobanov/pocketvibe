// The rules: a 4x4 board of exponents, moves that slide and merge, a new tile
// after every move that changed something, scoring, one step of undo and the
// end of the game. Nothing is drawn here; every move leaves a record of where
// each tile went, which tiles.js animates.

import { CELLS, DOWN, LEFT, MAX_EXP, RIGHT, SIZE, UP, WIN_EXP } from './shared.js';

const FOUR_CHANCE = 0.1;

// LINES[dir * 16 + line * 4 + k]: the k-th cell of a line, counted from the
// wall the tiles slide towards.
const LINES = new Int8Array(4 * CELLS);
for (let line = 0; line < SIZE; line++) {
  for (let k = 0; k < SIZE; k++) {
    LINES[LEFT * CELLS + line * SIZE + k] = line * SIZE + k;
    LINES[RIGHT * CELLS + line * SIZE + k] = line * SIZE + (SIZE - 1 - k);
    LINES[UP * CELLS + line * SIZE + k] = k * SIZE + line;
    LINES[DOWN * CELLS + line * SIZE + k] = (SIZE - 1 - k) * SIZE + line;
  }
}

// The title demo's player values big tiles along a snake path that ends in
// the bottom left corner, and empty cells.
const CORNER_WEIGHT = new Float32Array([
  1, 2, 3, 4,
  16, 12, 8, 6,
  24, 32, 48, 64,
  1024, 512, 256, 128,
]);
const EMPTY_WEIGHT = 1000;
const UP_PENALTY = 2000; // UP pulls big tiles out of the corner
// The order the demo tries moves in, so ties keep it in its corner.
const DEMO_ORDER = [DOWN, LEFT, RIGHT, UP];

// Slides src in direction dir into out. dest[cell] gets the cell each tile
// went to (-1 for empty cells) and merged[cell] is 1 where two tiles met.
// Returns the points scored, or -1 when nothing moved.
export function slide(src, dir, out, dest, merged) {
  let points = 0;
  let moved = false;
  out.fill(0);
  merged.fill(0);
  for (let line = 0; line < SIZE; line++) {
    const base = dir * CELLS + line * SIZE;
    let slot = 0; // next free position in the line
    let open = 0; // exponent of the last placed tile, if it may still merge
    for (let k = 0; k < SIZE; k++) {
      const from = LINES[base + k];
      const e = src[from];
      if (e === 0) {
        dest[from] = -1;
        continue;
      }
      if (e === open) {
        // Joins the tile in the previous slot; that tile is done for this move.
        const to = LINES[base + slot - 1];
        out[to] = e + 1;
        merged[to] = 1;
        dest[from] = to;
        points += 1 << (e + 1);
        open = 0;
        moved = true;
      } else {
        const to = LINES[base + slot];
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
    if (i % SIZE < SIZE - 1 && cells[i + 1] === e) return true;
    if (i < CELLS - SIZE && cells[i + SIZE] === e) return true;
  }
  return false;
}

export function createGame() {
  const cells = new Uint8Array(CELLS);
  const undoCells = new Uint8Array(CELLS);
  const scratch = new Uint8Array(CELLS);
  const scratchDest = new Int8Array(CELLS);
  const scratchMerged = new Uint8Array(CELLS);
  const reply = new Uint8Array(CELLS);

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
    won: false, // the 2048 tile was made (the message was shown)

    // What the last move did, for the animation and the effects.
    before: new Uint8Array(CELLS),
    dest: new Int8Array(CELLS),
    merged: new Uint8Array(CELLS),
    spawned: -1,
    gained: 0,
    justWon: false,

    newGame() {
      cells.fill(0);
      game.score = 0;
      game.canUndo = false;
      game.won = false;
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
      game.before.set(cells);
      undoCells.set(cells);
      game.undoScore = game.score;
      game.canUndo = true;
      cells.set(scratch);
      game.score += points;
      game.gained = points;
      game.justWon = false;
      if (!game.won && game.biggest() >= WIN_EXP) {
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
      out.won = game.won;
      return out;
    },

    // Loads a saved game; anything malformed is refused (returns false).
    restore(data) {
      if (!data || !validBoard(data.cells) || !Number.isFinite(data.score) || data.score < 0) return false;
      let tiles = 0;
      for (let i = 0; i < CELLS; i++) {
        cells[i] = data.cells[i];
        if (cells[i] > 0) tiles++;
      }
      if (tiles === 0) return false;
      game.score = Math.floor(data.score);
      game.won = data.won === true;
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
  for (let i = 0; i < CELLS; i++) value += b[i] === 0 ? EMPTY_WEIGHT : CORNER_WEIGHT[i] * (1 << b[i]) * 0.02;
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
