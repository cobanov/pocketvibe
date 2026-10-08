// Piece shapes, their four rotation states and the SRS wall kick tables.
// Coordinates are inside each piece's rotation box with y pointing up, the
// same way the board counts rows.

import { I, O } from './shared.js';

// Spawn orientation, top row first.
const SPAWN = [
  null,
  ['....', '####', '....', '....'], // I
  ['.##.', '.##.', '....', '....'], // O
  ['.#.', '###', '...'], // T
  ['.##', '##.', '...'], // S
  ['##.', '.##', '...'], // Z
  ['#..', '###', '...'], // J
  ['..#', '###', '...'], // L
];

// SHAPES[type][rotation] holds 4 cells as x0, y0, x1, y1, ...
export const SHAPES = [null];
// Where each piece appears: column of its box and the row of its box bottom,
// chosen so its lowest cells sit in the top visible row.
export const SPAWN_X = new Int8Array(8);
export const SPAWN_Y = new Int8Array(8);
// Centre of the spawn shape, used to centre pieces in the hold and next boxes.
export const CENTER_X = new Float32Array(8);
export const CENTER_Y = new Float32Array(8);

for (let t = 1; t <= 7; t++) {
  const rows = SPAWN[t];
  const n = rows.length;
  const states = [];
  let cells = new Int8Array(8);
  let k = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (rows[r][c] === '#') {
        cells[k++] = c;
        cells[k++] = n - 1 - r;
      }
    }
  }
  states.push(cells);
  for (let s = 1; s < 4; s++) {
    // Clockwise turn inside the box: (x, y) -> (y, n - 1 - x). O never turns.
    const prev = states[s - 1];
    cells = new Int8Array(8);
    for (let i = 0; i < 8; i += 2) {
      cells[i] = t === O ? prev[i] : prev[i + 1];
      cells[i + 1] = t === O ? prev[i + 1] : n - 1 - prev[i];
    }
    states.push(cells);
  }
  SHAPES.push(states);

  let minX = 9, maxX = -9, minY = 9, maxY = -9;
  const s0 = states[0];
  for (let i = 0; i < 8; i += 2) {
    minX = Math.min(minX, s0[i]);
    maxX = Math.max(maxX, s0[i]);
    minY = Math.min(minY, s0[i + 1]);
    maxY = Math.max(maxY, s0[i + 1]);
  }
  SPAWN_X[t] = 3;
  SPAWN_Y[t] = 19 - minY;
  CENTER_X[t] = (minX + maxX) / 2;
  CENTER_Y[t] = (minY + maxY) / 2;
}

// SRS kick offsets (x, y with y up) tried in order for each rotation.
// Keys are "from" and "to" rotation states: 0 spawn, 1 right, 2 flipped, 3 left.
const KICKS_JLSTZ = {
  '01': [0, 0, -1, 0, -1, 1, 0, -2, -1, -2],
  '10': [0, 0, 1, 0, 1, -1, 0, 2, 1, 2],
  '12': [0, 0, 1, 0, 1, -1, 0, 2, 1, 2],
  '21': [0, 0, -1, 0, -1, 1, 0, -2, -1, -2],
  '23': [0, 0, 1, 0, 1, 1, 0, -2, 1, -2],
  '32': [0, 0, -1, 0, -1, -1, 0, 2, -1, 2],
  '30': [0, 0, -1, 0, -1, -1, 0, 2, -1, 2],
  '03': [0, 0, 1, 0, 1, 1, 0, -2, 1, -2],
};

const KICKS_I = {
  '01': [0, 0, -2, 0, 1, 0, -2, -1, 1, 2],
  '10': [0, 0, 2, 0, -1, 0, 2, 1, -1, -2],
  '12': [0, 0, -1, 0, 2, 0, -1, 2, 2, -1],
  '21': [0, 0, 1, 0, -2, 0, 1, -2, -2, 1],
  '23': [0, 0, 2, 0, -1, 0, 2, 1, -1, -2],
  '32': [0, 0, -2, 0, 1, 0, -2, -1, 1, 2],
  '30': [0, 0, 1, 0, -2, 0, 1, -2, -2, 1],
  '03': [0, 0, -1, 0, 2, 0, -1, 2, 2, -1],
};

function table(source) {
  const out = [];
  for (let from = 0; from < 4; from++) {
    for (let to = 0; to < 4; to++) {
      const k = source[`${from}${to}`];
      out.push(k ? Int8Array.from(k) : null);
    }
  }
  return out;
}

// kicksFor(type)[from * 4 + to] -> Int8Array of 5 (x, y) offsets.
const JLSTZ_TABLE = table(KICKS_JLSTZ);
const I_TABLE = table(KICKS_I);

export function kicksFor(type) {
  return type === I ? I_TABLE : JLSTZ_TABLE;
}
