// Table layout in table units. x runs across the table (0 is between the
// flippers), y runs up the table from the drain. Pure data shared by the
// physics and the view; no three.js here.

export const BALL_R = 0.3;
export const WALL_R = 0.1;
export const DRAIN_Y = -0.9; // below this the ball is gone

// Cabinet floor extent (also the area the floor texture covers).
export const BOUNDS = { x0: -5.4, x1: 7.0, y0: -1.4, y1: 20.5 };

export const LANE_X = 5.6; // plunger lane center
export const LANE_WALL_X = 5.0; // wall between the lane and the playfield
export const LANE_TOP = 13.4; // top of that wall
export const PLUNGER_Y = 1.2; // top of the plunger at rest
export const PULL_DIST = 0.9; // how far a full pull draws it back

// Flippers: pivot at (±x, y), angles in radians measured upwards from the
// direction pointing at the table center.
export const FLIPPER = { x: 2.0, y: 2.4, len: 1.75, rb: 0.3, rt: 0.14, rest: -0.56, up: 0.52 };

// Segment kinds.
export const WALL = 0;
export const SLING = 1; // kicker face of a slingshot
export const TARGET = 2; // drop target, solid only while standing
export const GATE = 3; // one-way: solid only from its normal side

export const segments = [];
export const posts = []; // passive round posts { x, y, r }
export const bumpers = []; // pop bumpers { x, y, r }
export const slings = []; // kicker faces for the view { ax, ay, bx, by, nx, ny }
export const targets = []; // drop targets { x, y, angle, bank }
export const lanes = []; // rollover lane sensors { x, x0, x1, y0, y1 }
export const lamps = []; // floor lights { x, y, r, color }

// Style decides the neon color of a wall in the view.
function seg(ax, ay, bx, by, style, kind = WALL, id = 0, e = 0.45, r = WALL_R) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const pad = r + BALL_R;
  segments.push({
    ax,
    ay,
    bx,
    by,
    r,
    e,
    kind,
    id,
    style,
    len,
    invLen2: 1 / (len * len),
    // Left-hand normal; for a GATE this is the solid side.
    nx: -dy / len,
    ny: dx / len,
    // Bounding box grown by the contact distance, for a quick reject.
    minX: Math.min(ax, bx) - pad,
    maxX: Math.max(ax, bx) + pad,
    minY: Math.min(ay, by) - pad,
    maxY: Math.max(ay, by) + pad,
  });
}

function poly(points, style) {
  for (let i = 0; i + 1 < points.length; i++) {
    seg(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], style);
  }
}

// --- Outer shell ---------------------------------------------------------

const ARC_CX = 0.6;
const ARC_CY = 14.5;
const ARC_R = 5.6;
const arc = [];
for (let i = 0; i <= 28; i++) {
  const a = Math.PI - (i / 28) * Math.PI;
  arc.push([ARC_CX + Math.cos(a) * ARC_R, ARC_CY + Math.sin(a) * ARC_R]);
}
poly([[-5.0, -1.4], [-5.0, ARC_CY]], 'rail');
poly(arc, 'rail');
poly([[6.2, ARC_CY], [6.2, 0.0], [LANE_WALL_X, 0.0]], 'rail');
seg(LANE_WALL_X, -1.4, LANE_WALL_X, LANE_TOP, 'rail');
// The gate lets a launched ball out of the plunger lane but not back in.
seg(LANE_WALL_X, LANE_TOP, 6.2, 14.2, 'gate', GATE, 0, 0.3);

export const ARC = { x: ARC_CX, y: ARC_CY, r: ARC_R };

// --- Lower playfield, mirrored for both sides ------------------------------

for (let s = -1; s <= 1; s += 2) {
  const side = s < 0 ? 0 : 1;
  // Outlane divider and inlane guide that feeds the flipper.
  poly([[s * 3.95, 6.55], [s * 3.95, 4.6], [s * 2.25, 2.75]], 'guide');
  posts.push({ x: s * 3.95, y: 6.6, r: 0.18 });

  // Slingshot: a triangle whose long face kicks the ball away.
  const top = [s * 2.95, 6.35];
  const bl = [s * 2.95, 4.99];
  const br = [s * 1.93, 3.88];
  seg(top[0], top[1], bl[0], bl[1], 'slingbody');
  seg(bl[0], bl[1], br[0], br[1], 'slingbody');
  seg(top[0], top[1], br[0], br[1], 'sling', SLING, side, 0.5);
  const kx = br[0] - top[0];
  const ky = br[1] - top[1];
  const kl = Math.hypot(kx, ky);
  // Normal pointing into the playfield (towards x = 0).
  slings.push({ ax: top[0], ay: top[1], bx: br[0], by: br[1], nx: (-s * -ky) / kl, ny: (-s * kx) / kl });

  // Drop target bank: a wedge against the side wall with three targets in
  // front of its lower face.
  const a = [s * 4.9, 7.2];
  const b = [s * 3.95, 9.9];
  poly([a, b, [s * 4.9, 10.7]], 'bank');
  const ux = (b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  const uy = (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = s < 0 ? uy : -uy; // outward normal, towards the playfield
  const ny = s < 0 ? -ux : ux;
  for (let i = 0; i < 3; i++) {
    const t = (i + 1) / 4;
    const cx = a[0] + (b[0] - a[0]) * t + nx * 0.2;
    const cy = a[1] + (b[1] - a[1]) * t + ny * 0.2;
    const id = side * 3 + i;
    seg(cx - ux * 0.25, cy - uy * 0.25, cx + ux * 0.25, cy + uy * 0.25, 'target', TARGET, id, 0.35);
    targets.push({ x: cx, y: cy, angle: Math.atan2(uy, ux), bank: side, nx, ny });
  }
}

// --- Upper playfield -------------------------------------------------------

bumpers.push({ x: -1.7, y: 13.2, r: 0.7 }, { x: 1.7, y: 13.2, r: 0.7 }, { x: 0, y: 11.0, r: 0.7 });

// Rollover lanes at the top, between four short dividers.
for (let i = 0; i < 4; i++) {
  const x = -2.4 + i * 1.6;
  seg(x, 16.5, x, 17.8, 'divider', WALL, 0, 0.45, 0.12);
}
for (let i = 0; i < 3; i++) {
  const x = -1.6 + i * 1.6;
  lanes.push({ x, x0: x - 0.55, x1: x + 0.55, y0: 16.6, y1: 17.7 });
}

// --- Lamps (floor lights). Index ranges are used by main.js ----------------

export const LAMP_LANE = lamps.length; // 3, under the rollover lanes
for (let i = 0; i < 3; i++) lamps.push({ x: lanes[i].x, y: 15.9, r: 0.28, color: 0x3cf0ff });

export const LAMP_TARGET = lamps.length; // 6, in front of the drop targets
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  lamps.push({ x: t.x + t.nx * 0.75, y: t.y + t.ny * 0.75, r: 0.17, color: 0x7dff4f });
}

export const LAMP_MULT = lamps.length; // 4: 2x, 3x, 4x, 5x
for (let i = 0; i < 4; i++) lamps.push({ x: -1.5 + i, y: 6.9, r: 0.27, color: 0xffd23f });

export const LAMP_SAVE = lamps.length; // 1, shoot again
lamps.push({ x: 0, y: 0.75, r: 0.32, color: 0xff3b6b });

export const LAMP_POWER = lamps.length; // 6, plunger power meter beside the lane
for (let i = 0; i < 6; i++) lamps.push({ x: 6.62, y: 0.7 + i * 0.62, r: 0.17, color: i < 4 ? 0x3cf0ff : 0xff3fd2 });

export const LAMP_COUNT = lamps.length;
