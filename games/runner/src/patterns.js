// The course: hand-made obstacle patterns and the difficulty of each stage.
//
// A pattern is a few rows across the three lanes, read from the nearest one
// on. Each row is three characters (left, middle, right lane):
//   .  nothing        h  hurdle: jump        b  bar: slide under
//   w  wall: change lanes                     v  van driving at the runner
// A number in front of a row is how many steps after the previous row it
// comes (1 if left out). A step is a stage's `step` seconds of running, so
// the time between moves stays fair at every speed. Every pattern may be
// mirrored, and a stage only picks patterns of its tier or lower.
//
// Rules the patterns keep (checked by tools in testing): every row has a
// lane without a wall or van, and the lane of a van stays empty in the next
// row (the van overtakes what stands behind it while it is far away).

export const LOW = 0; // hurdle
export const BAR = 1;
export const TALL = 2; // wall
export const VAN = 3;

export const STAGE_LEN = 400; // metres per stage

// Per stage: running speed (units per second), seconds per step inside a
// pattern, and seconds of free road between patterns.
const SPEED = [14, 16, 18, 19.5, 21, 22.5, 24, 25.5, 27, 28, 29, 30, 31];
const STEP = [1.0, 0.95, 0.9, 0.86, 0.82, 0.78, 0.75, 0.72, 0.7, 0.68, 0.66, 0.65, 0.64];
const GAP = [1.5, 1.35, 1.25, 1.15, 1.08, 1.0, 0.95, 0.9, 0.86, 0.83, 0.8, 0.78, 0.76];
export const TOP_STAGE = SPEED.length - 1;

export const stageSpeed = (stage) => SPEED[Math.min(stage, TOP_STAGE)];
export const stageStep = (stage) => STEP[Math.min(stage, TOP_STAGE)];
export const stageGap = (stage) => GAP[Math.min(stage, TOP_STAGE)];

const SOURCE = [
  // Tier 0: one move at a time.
  [0, '.w.'],
  [0, 'w..'],
  [0, 'ww.'],
  [0, 'w.w'],
  [0, 'hhh'],
  [0, 'bbb'],
  [0, '.h.'],
  [0, 'b..'],
  [0, 'hw.'],
  [0, 'wbw'],
  [0, 'whw'],
  // Tier 1: two moves.
  [1, 'hhh', '2 bbb'],
  [1, 'bbb', '2 hhh'],
  [1, 'w.w', '.w.'],
  [1, '.w.', 'w.w'],
  [1, 'ww.', '2 .ww'],
  [1, 'hbw'],
  [1, 'whw', 'w.w', 'wbw'],
  [1, 'hh.', 'b.b'],
  // Tier 2: vans, and three moves.
  [2, '.v.'],
  [2, 'v..', '2 ..v'],
  [2, 'ww.', 'w.w', '.ww'],
  [2, 'hhh', 'bbb'],
  [2, 'v.v'],
  [2, 'hhw', 'wbb'],
  [2, '.w.', 'h.h'],
  // Tier 3: moves while changing lanes.
  [3, 'hww', 'whw', 'wwh'],
  [3, 'bww', 'wbw', 'wwb'],
  [3, 'vhv'],
  [3, 'hhh', 'bbb', 'hhh'],
  [3, '.v.', '2 v.v'],
  [3, 'w.w', 'bwb', 'w.w'],
  // Tier 4
  [4, 'v..', '2 ..v', '2 .v.'],
  [4, 'wbw', 'whw', 'wbw'],
  [4, 'hbh', 'bhb'],
  [4, 'vbv'],
  [4, 'ww.', '.ww', 'ww.'],
  [4, 'w.v', '2 v.w'],
  // Tier 5
  [5, 'whh', 'bbw', 'hwb'],
  [5, 'v.v', '.h.', '2 v.v'],
  [5, 'hhh', 'hhh', 'hhh'],
  [5, 'bww', 'hww', 'w.w', 'wwb'],
  [5, 'hbw', 'wbh', 'bwh'],
  // Tier 6
  [6, 'v.w', '2 w.v', '.w.'],
  [6, 'whw', 'bww', 'whw', 'wwb'],
  [6, 'vbv', '2 .w.', 'h.h'],
];

const CELL = { '.': -1, h: LOW, b: BAR, w: TALL, v: VAN };

// Parsed once: { tier, rows: [{ gap, cells: [k, k, k] }] }.
export const PATTERNS = SOURCE.map(([tier, ...rows]) => ({
  tier,
  rows: rows.map((text) => {
    const parts = text.split(' ');
    const cells = parts[parts.length - 1];
    return { gap: parts.length > 1 ? Number(parts[0]) : 1, cells: [...cells].map((c) => CELL[c]) };
  }),
}));

// A stretch of road with only coins on it, now and then.
export const BREATHER = { tier: 0, rows: [{ gap: 1, cells: [-1, -1, -1] }, { gap: 1, cells: [-1, -1, -1] }, { gap: 1, cells: [-1, -1, -1] }] };
