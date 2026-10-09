// The rules: the well, the falling piece, SRS rotation with wall kicks and
// T-spins, lock delay, line clears, scoring, levels and the three modes.
// Nothing is drawn here; well.js shows this state and main.js reacts to the
// events in `ev`.

import { BOARD_ROWS, COLS, GARBAGE, ROWS, T } from './shared.js';
import { SHAPES, SPAWN_X, SPAWN_Y, kicksFor } from './pieces.js';

const DAS = 0.15; // hold left/right this long before auto-repeat starts
const ARR = 0.033; // then move one column this often (every other frame)
const SOFT_DROP = 0.03; // seconds per row while DOWN is held
const LOCK_DELAY = 0.5;
const MAX_RESETS = 15; // moves/rotations on the ground that restart the lock delay
const CLEAR_TIME = 0.3; // cleared rows flash this long, then collapse
const READY_TIME = 0.9; // READY ... GO: the first piece appears after this
const LINE_POINTS = [0, 100, 300, 500, 800];
const TSPIN_POINTS = [400, 800, 1200, 1600];
const MINI_POINTS = [100, 200, 400];
const ALL_CLEAR_POINTS = [0, 800, 1200, 1800, 2000];
const MAX_LEVEL = 20;

export const SPRINT_LINES = 40; // Sprint: clear this many lines
export const DIG_ROWS = 10; // Dig: the well starts with this many rows of garbage

// The four cells diagonal to the T's centre (x, y): top left, top right,
// bottom right, bottom left. The T points at corners rot and rot + 1.
const CORNERS = [-1, 1, 1, 1, 1, -1, -1, -1];

// Seconds per row at each level (the usual guideline curve).
function gravity(level) {
  const l = Math.min(level, MAX_LEVEL) - 1;
  return Math.pow(0.8 - l * 0.007, l);
}

export function createGame() {
  const board = new Int8Array(COLS * BOARD_ROWS);
  const queue = new Int8Array(16);
  const bag = new Int8Array(7);
  let queueLen = 0;

  let fallTimer = 0;
  let lockTimer = 0;
  let resets = 0;
  let lowestY = 0;
  let dasDir = 0;
  let dasTimer = 0;
  let arrTimer = 0;
  let clearTimer = 0;
  let readyTimer = 0;
  // A T-spin needs the piece's last move to be a rotation; the fifth kick
  // always makes it a full one.
  let lastRotate = false;
  let lastKick = 0;
  // Buttons pressed while rows clear (or before GO), applied to the next
  // piece when it appears.
  let pendingRot = 0;
  let pendingShift = 0;
  let pendingHold = false;

  const g = {
    board,
    mode: 'marathon', // marathon | sprint | dig
    phase: 'idle', // idle | ready | fall | clear | dead | done
    type: 0,
    rot: 0,
    x: 0,
    y: 0,
    ghostY: 0,
    hold: 0,
    canHold: true,
    next: queue, // the first three entries are the next pieces
    score: 0,
    lines: 0,
    level: 1,
    left: 0, // Sprint: lines still to clear; Dig: rows of garbage left
    pieces: 0,
    time: 0, // seconds since GO, while pieces fall
    combo: -1,
    b2b: false,
    lockProgress: 0, // 0..1 while the piece rests on the stack
    clearProgress: 0, // 0..1 while cleared rows flash
    clearedRows: new Int8Array(4),
    clearedTypes: new Int8Array(4 * COLS), // the cells of the cleared rows
    clearCount: 0, // rows in clearedRows; kept until the next lock

    // Events of the last update, for effects. Reset at the start of update().
    ev: {
      go: false, // the first piece appeared
      shiftX: 0, // columns moved
      shiftY: 0, // rows fallen (not counting hard drops)
      softRows: 0, // rows of those soft dropped
      rotated: 0, // 1 clockwise, -1 counter-clockwise
      twist: false, // the rotation left a T where it would score a T-spin
      hardRows: 0,
      locked: false,
      lockedCells: new Int16Array(4),
      tspin: 0, // the lock was a T-spin: 1 mini, 2 full
      cleared: 0,
      points: 0,
      backToBack: false,
      allClear: false,
      collapsed: false,
      rowShift: new Int8Array(BOARD_ROWS), // rows each row fell in the collapse
      levelUp: false,
      held: false,
      denied: false, // hold pressed when it is used up for this piece
      dead: false,
      finished: false, // Sprint or Dig done
    },
  };
  const ev = g.ev;

  function fits(type, rot, x, y) {
    const s = SHAPES[type][rot];
    for (let i = 0; i < 8; i += 2) {
      const cx = x + s[i];
      const cy = y + s[i + 1];
      if (cx < 0 || cx >= COLS || cy < 0 || cy >= BOARD_ROWS) return false;
      if (board[cy * COLS + cx] !== 0) return false;
    }
    return true;
  }

  // A cell counts as blocked for the T-spin check if it is filled or
  // outside the walls or the floor.
  function blocked(x, y) {
    if (x < 0 || x >= COLS || y < 0) return true;
    return y < BOARD_ROWS && board[y * COLS + x] !== 0;
  }

  // The three-corner rule: 0 no T-spin, 1 mini, 2 full.
  function spinKind() {
    if (g.type !== T || !lastRotate) return 0;
    const cx = g.x + 1;
    const cy = g.y + 1;
    let n = 0;
    for (let i = 0; i < 8; i += 2) if (blocked(cx + CORNERS[i], cy + CORNERS[i + 1])) n++;
    if (n < 3) return 0;
    const a = g.rot * 2;
    const b = ((g.rot + 1) & 3) * 2;
    const front = blocked(cx + CORNERS[a], cy + CORNERS[a + 1]) && blocked(cx + CORNERS[b], cy + CORNERS[b + 1]);
    return front || lastKick === 4 ? 2 : 1;
  }

  // 7-bag randomizer: every run of seven pieces holds each piece once.
  function refill() {
    for (let i = 0; i < 7; i++) bag[i] = i + 1;
    for (let i = 6; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = bag[i];
      bag[i] = bag[j];
      bag[j] = t;
    }
    for (let i = 0; i < 7; i++) queue[queueLen++] = bag[i];
  }

  function takeNext() {
    if (queueLen < 8) refill();
    const t = queue[0];
    queue.copyWithin(0, 1, queueLen);
    queueLen--;
    return t;
  }

  function spawn(type) {
    g.type = type;
    g.rot = 0;
    g.x = SPAWN_X[type];
    g.y = SPAWN_Y[type];
    fallTimer = 0;
    lockTimer = 0;
    resets = 0;
    lowestY = g.y;
    lastRotate = false;
    g.phase = 'fall';
    // A blocked spawn gets one row of leeway above the well before the game ends.
    if (!fits(type, 0, g.x, g.y)) g.y++;
    if (!fits(type, 0, g.x, g.y)) {
      g.phase = 'dead';
      ev.dead = true;
    }
  }

  function onGround() {
    return !fits(g.type, g.rot, g.x, g.y - 1);
  }

  // A successful move or rotation on the ground restarts the lock delay, a
  // limited number of times per piece.
  function moved(wasGrounded) {
    if (wasGrounded && resets < MAX_RESETS) {
      lockTimer = 0;
      resets++;
    }
  }

  function shift(dx) {
    if (g.phase !== 'fall') return false;
    if (!fits(g.type, g.rot, g.x + dx, g.y)) return false;
    const grounded = onGround();
    g.x += dx;
    ev.shiftX += dx;
    lastRotate = false;
    moved(grounded);
    return true;
  }

  function rotate(dir) {
    if (g.phase !== 'fall') return;
    const from = g.rot;
    const to = (from + dir + 4) & 3;
    const kicks = kicksFor(g.type)[from * 4 + to];
    const grounded = onGround();
    for (let i = 0; i < 10; i += 2) {
      const nx = g.x + kicks[i];
      const ny = g.y + kicks[i + 1];
      if (fits(g.type, to, nx, ny)) {
        g.x = nx;
        g.y = ny;
        g.rot = to;
        ev.rotated = dir;
        lastRotate = true;
        lastKick = i / 2;
        ev.twist = spinKind() > 0;
        moved(grounded);
        if (g.y < lowestY) {
          lowestY = g.y;
          resets = 0;
        }
        return;
      }
    }
  }

  function stepDown() {
    if (!fits(g.type, g.rot, g.x, g.y - 1)) return false;
    g.y--;
    lockTimer = 0;
    lastRotate = false;
    if (g.y < lowestY) {
      lowestY = g.y;
      resets = 0;
    }
    return true;
  }

  // Sprint: lines still to clear. Dig: rows that still hold garbage.
  function countLeft() {
    if (g.mode === 'sprint') {
      g.left = Math.max(0, SPRINT_LINES - g.lines);
    } else if (g.mode === 'dig') {
      let n = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (board[r * COLS + c] === GARBAGE) {
            n++;
            break;
          }
        }
      }
      g.left = n;
    }
  }

  function lock() {
    const spin = spinKind();
    const s = SHAPES[g.type][g.rot];
    let above = 0;
    for (let i = 0; i < 4; i++) {
      const cx = g.x + s[i * 2];
      const cy = g.y + s[i * 2 + 1];
      const cell = cy * COLS + cx;
      board[cell] = g.type;
      ev.lockedCells[i] = cell;
      if (cy >= ROWS) above++;
    }
    ev.locked = true;
    g.canHold = true;
    g.lockProgress = 0;
    g.pieces++;

    // Full rows, bottom first, and how many cells are filled in all.
    let n = 0;
    let filled = 0;
    for (let r = 0; r < BOARD_ROWS; r++) {
      let count = 0;
      for (let c = 0; c < COLS; c++) if (board[r * COLS + c] !== 0) count++;
      filled += count;
      if (count === COLS && n < 4) {
        for (let c = 0; c < COLS; c++) g.clearedTypes[n * COLS + c] = board[r * COLS + c];
        g.clearedRows[n++] = r;
      }
    }
    g.clearCount = n;
    const level = g.level;

    if (n === 0) {
      g.combo = -1;
      // A T-spin that clears nothing still scores (and keeps back-to-back).
      if (spin > 0) {
        const points = (spin === 2 ? TSPIN_POINTS[0] : MINI_POINTS[0]) * level;
        g.score += points;
        ev.tspin = spin;
        ev.points = points;
      }
      // Locked entirely above the well: the stack topped out.
      if (above === 4) {
        g.phase = 'dead';
        ev.dead = true;
        return;
      }
      spawn(takeNext());
      return;
    }

    // Scoring: quads and T-spins in a row earn a back-to-back bonus,
    // consecutive clears a combo, an empty well an all clear bonus.
    const kind = spin === 1 && n === 3 ? 2 : spin; // there is no mini triple
    let points = (kind === 2 ? TSPIN_POINTS[n] : kind === 1 ? MINI_POINTS[n] : LINE_POINTS[n]) * level;
    if (n === 4 || kind > 0) {
      if (g.b2b) {
        points = Math.floor(points * 1.5);
        ev.backToBack = true;
      }
      g.b2b = true;
    } else {
      g.b2b = false;
    }
    g.combo++;
    if (g.combo > 0) points += 50 * g.combo * level;
    if (filled === n * COLS) {
      points += ALL_CLEAR_POINTS[n] * level;
      ev.allClear = true;
    }
    g.score += points;
    g.lines += n;
    if (g.mode === 'marathon') {
      g.level = 1 + Math.floor(g.lines / 10);
      ev.levelUp = g.level > level;
    }
    ev.tspin = kind;
    ev.cleared = n;
    ev.points = points;

    g.phase = 'clear';
    clearTimer = 0;
    g.clearProgress = 0;
  }

  // Removes the flashed rows and lets everything above fall into place.
  function collapse() {
    const rowShift = ev.rowShift;
    rowShift.fill(0);
    let write = 0;
    let gone = 0;
    for (let r = 0; r < BOARD_ROWS; r++) {
      if (gone < g.clearCount && g.clearedRows[gone] === r) {
        gone++;
        continue;
      }
      if (write !== r) board.copyWithin(write * COLS, r * COLS, r * COLS + COLS);
      rowShift[write] = gone;
      write++;
    }
    board.fill(0, write * COLS);
    ev.collapsed = true;
    countLeft();
    if (g.mode !== 'marathon' && g.left === 0) {
      g.phase = 'done';
      ev.finished = true;
      return;
    }
    spawn(takeNext());
  }

  // Hold: swap with the held piece (or take the next one) once per piece.
  function doHold() {
    if (g.phase !== 'fall') return;
    if (!g.canHold) {
      ev.denied = true;
      return;
    }
    const current = g.type;
    const incoming = g.hold === 0 ? takeNext() : g.hold;
    g.hold = current;
    g.canHold = false;
    ev.held = true;
    spawn(incoming);
  }

  // Between pieces (rows clearing, or before GO) presses wait for the next one.
  function buffer(input) {
    if (input.pressed('A')) pendingRot++;
    if (input.pressed('B')) pendingRot--;
    if (input.pressed('L') || input.pressed('R')) pendingHold = true;
    if (input.pressed('LEFT')) pendingShift--;
    if (input.pressed('RIGHT')) pendingShift++;
  }

  function applyPending() {
    if (g.phase === 'fall') {
      if (pendingHold) doHold();
      const turns = ((pendingRot % 4) + 4) % 4;
      if (turns === 3) rotate(-1);
      else for (let i = 0; i < turns; i++) rotate(1);
      for (; pendingShift < 0; pendingShift++) shift(-1);
      for (; pendingShift > 0; pendingShift--) shift(1);
    }
    pendingRot = 0;
    pendingShift = 0;
    pendingHold = false;
  }

  function updateGhost() {
    let y = g.y;
    while (fits(g.type, g.rot, g.x, y - 1)) y--;
    g.ghostY = y;
  }

  function resetEvents() {
    ev.go = false;
    ev.shiftX = 0;
    ev.shiftY = 0;
    ev.softRows = 0;
    ev.rotated = 0;
    ev.twist = false;
    ev.hardRows = 0;
    ev.locked = false;
    ev.tspin = 0;
    ev.cleared = 0;
    ev.points = 0;
    ev.backToBack = false;
    ev.allClear = false;
    ev.collapsed = false;
    ev.levelUp = false;
    ev.held = false;
    ev.denied = false;
    ev.dead = false;
    ev.finished = false;
  }

  function handleShift(dt, input) {
    const left = input.down('LEFT');
    const right = input.down('RIGHT');
    if (input.pressed('LEFT')) {
      dasDir = -1;
      dasTimer = 0;
      shift(-1);
    } else if (input.pressed('RIGHT')) {
      dasDir = 1;
      dasTimer = 0;
      shift(1);
    }
    // Releasing one direction hands over to the other if it is still held.
    if ((dasDir === -1 && !left) || (dasDir === 1 && !right)) {
      dasDir = left ? -1 : right ? 1 : 0;
      dasTimer = 0;
    }
    if (dasDir === 0) return;
    // The timer keeps charging during line clears, so the next piece can slide at once.
    const before = dasTimer;
    dasTimer += dt;
    if (dasTimer < DAS) return;
    if (before < DAS) {
      arrTimer = 0;
      shift(dasDir);
      return;
    }
    arrTimer += dt;
    while (arrTimer >= ARR) {
      arrTimer -= ARR;
      shift(dasDir);
    }
  }

  return Object.assign(g, {
    // Empties the well (Dig fills its bottom with garbage) and starts a new
    // game; the first piece appears after READY_TIME.
    start(mode) {
      g.mode = mode;
      board.fill(0);
      if (mode === 'dig') {
        // One hole per row, never straight above the one below.
        let hole = -1;
        for (let r = 0; r < DIG_ROWS; r++) {
          let h = Math.floor(Math.random() * (hole < 0 ? COLS : COLS - 1));
          if (hole >= 0 && h >= hole) h++;
          hole = h;
          for (let c = 0; c < COLS; c++) board[r * COLS + c] = c === hole ? 0 : GARBAGE;
        }
      }
      queueLen = 0;
      refill();
      g.hold = 0;
      g.canHold = true;
      g.score = 0;
      g.lines = 0;
      g.level = 1;
      g.pieces = 0;
      g.time = 0;
      g.combo = -1;
      g.b2b = false;
      g.clearCount = 0;
      g.clearProgress = 0;
      g.lockProgress = 0;
      countLeft();
      dasDir = 0;
      pendingRot = 0;
      pendingShift = 0;
      pendingHold = false;
      readyTimer = 0;
      resetEvents();
      g.phase = 'ready';
    },

    // A colourful leftover stack for the title screen, with no falling piece.
    decorate() {
      board.fill(0);
      g.phase = 'idle';
      g.hold = 3; // a T waiting in the hold box
      g.canHold = true;
      g.clearCount = 0;
      const heights = [5, 4, 4, 3, 1, 2, 3, 4, 5, 6];
      for (let c = 0; c < COLS; c++) {
        for (let r = 0; r < heights[c]; r++) {
          board[r * COLS + c] = 1 + ((c * 3 + r * 5 + ((c * r) % 4)) % 7);
        }
      }
      // Holes so the stack does not look like finished lines.
      board[0 * COLS + 4] = 0;
      board[1 * COLS + 6] = 0;
      board[2 * COLS + 1] = 0;
      board[3 * COLS + 8] = 0;
      queueLen = 0;
      refill();
    },

    update(dt, input) {
      resetEvents();

      if (g.phase === 'ready') {
        readyTimer += dt;
        buffer(input);
        handleShift(dt, input);
        if (readyTimer >= READY_TIME) {
          spawn(takeNext());
          ev.go = true;
          applyPending();
          if (g.phase === 'fall') updateGhost();
        }
        return;
      }

      if (g.phase === 'clear') {
        g.time += dt;
        clearTimer += dt;
        g.clearProgress = Math.min(1, clearTimer / CLEAR_TIME);
        buffer(input);
        handleShift(dt, input);
        if (clearTimer >= CLEAR_TIME) {
          collapse();
          applyPending();
        }
        if (g.phase === 'fall') updateGhost();
        return;
      }
      if (g.phase !== 'fall') return;
      g.time += dt;

      // Every press acts on the frame it arrives: hold, then rotation, then
      // sideways moves, then the drop.
      if (input.pressed('L') || input.pressed('R')) {
        doHold();
        if (g.phase === 'dead') return;
      }

      if (input.pressed('A')) rotate(1);
      if (input.pressed('B')) rotate(-1);
      handleShift(dt, input);

      if (input.pressed('UP')) {
        updateGhost();
        const rows = g.y - g.ghostY;
        g.y = g.ghostY;
        if (rows > 0) lastRotate = false;
        g.score += rows * 2;
        ev.hardRows = Math.max(1, rows);
        lock();
        if (g.phase === 'fall') updateGhost();
        return;
      }

      // Gravity, faster while DOWN is held (1 point per row soft dropped).
      const soft = input.down('DOWN');
      const fall = gravity(g.level);
      const interval = soft ? Math.min(fall, SOFT_DROP) : fall;
      // DOWN moves the piece a row on the frame it is pressed. Time saved up
      // under slow gravity must not turn into a jump of several rows.
      if (input.pressed('DOWN')) fallTimer = Math.max(fallTimer, interval);
      fallTimer = Math.min(fallTimer + dt, interval + dt);
      while (fallTimer >= interval) {
        fallTimer -= interval;
        if (!stepDown()) {
          fallTimer = 0;
          break;
        }
        ev.shiftY++;
        if (soft) {
          g.score++;
          ev.softRows++;
        }
      }

      if (onGround()) {
        lockTimer += dt;
        g.lockProgress = Math.min(1, lockTimer / LOCK_DELAY);
        if (lockTimer >= LOCK_DELAY) {
          lock();
          if (g.phase === 'fall') updateGhost();
          return;
        }
      } else {
        g.lockProgress = 0;
      }
      updateGhost();
    },
  });
}
