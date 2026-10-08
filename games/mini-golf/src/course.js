// Turns a hole definition (an ASCII map plus terrain and moving obstacles)
// into what the physics and the renderer need: tile kinds, wall segments, a
// smooth height field and a per-tile list of nearby walls. No three.js in
// here, so the same code runs in Node to check that every hole is playable.
//
// Map coordinates: column u grows to the right, row v grows towards the tee
// (towards the camera in the overview). One tile is one world unit and the
// map is centred on the origin, so world x = u - cols / 2, z = v - rows / 2.

export const EMPTY = 0; // outside the course, behind a wooden border
export const GREEN = 1;
export const SAND = 2; // slows the ball down a lot
export const WATER = 3; // a stroke penalty, no border
export const VOID = 4; // an open edge: the ball drops off, a stroke penalty
export const BLOCK = 5; // a solid coloured block
export const CUT_NW = 6; // green tiles with one corner cut off by a diagonal border
export const CUT_NE = 7;
export const CUT_SE = 8;
export const CUT_SW = 9;

// What a wall segment is made of.
export const WOOD = 0;
export const STONE = 1; // the sides of a block

export const WALL_HALF = 0.12; // half the thickness of a border board
export const BUMPER_R = 0.3;
export const BAR_R = 0.11; // half the thickness of a spinner bar
export const HUB_R = 0.2;

export const SPINNER = 0;
export const SLIDER = 1;

const CHARS = {
  ' ': EMPTY,
  '.': GREEN,
  T: GREEN, // the tee
  O: GREEN, // the cup
  o: GREEN, // a round bumper in the middle of the tile
  s: SAND,
  '~': WATER,
  ':': VOID,
  X: BLOCK,
  1: CUT_NW,
  2: CUT_NE,
  3: CUT_SE,
  4: CUT_SW,
};

// Sides of a tile, clockwise from the top.
const N = 0;
const E = 1;
const S = 2;
const W = 3;
const OPPOSITE = [S, W, N, E];
const STEP_U = [0, 1, 0, -1];
const STEP_V = [-1, 0, 1, 0];

// Whether a tile's course surface reaches all along one of its sides.
function opens(kind, side) {
  switch (kind) {
    case GREEN:
    case SAND:
    case WATER:
      return true;
    case CUT_NW:
      return side === E || side === S;
    case CUT_NE:
      return side === S || side === W;
    case CUT_SE:
      return side === N || side === W;
    case CUT_SW:
      return side === N || side === E;
    default:
      return false;
  }
}

// Inside test for the green half of a cut tile, at (fu, fv) within the tile.
export function cutInside(kind, fu, fv) {
  if (kind === CUT_NW) return fu + fv >= 1;
  if (kind === CUT_NE) return fv >= fu;
  if (kind === CUT_SE) return fu + fv <= 1;
  return fu >= fv; // CUT_SW
}

export function isCut(kind) {
  return kind >= CUT_NW;
}

// Smooth height field: a sum of smoothstep ramps and cosine hills. Ramps
// run along one axis and may be limited to a band of the other axis; the
// edges of such a band must be walls, since the height jumps there.
function makeTerrain(terms, ox, oz) {
  const ramps = [];
  const hills = [];
  for (const t of terms) {
    if (t.ramp) {
      const alongX = t.ramp === 'u';
      const o = alongX ? ox : oz;
      const oc = alongX ? oz : ox;
      ramps.push({
        alongX,
        a: t.from + o,
        b: t.to + o,
        dh: t.dh,
        lo: t.range ? t.range[0] + oc : -1e9,
        hi: t.range ? t.range[1] + oc : 1e9,
      });
    } else if (t.hill) {
      hills.push({ x: t.hill[0] + ox, z: t.hill[1] + oz, r: t.r, dh: t.dh });
    }
  }

  function height(x, z) {
    let h = 0;
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      const p = r.alongX ? x : z;
      const q = r.alongX ? z : x;
      if (q < r.lo || q > r.hi) continue;
      let s = (p - r.a) / (r.b - r.a);
      s = s < 0 ? 0 : s > 1 ? 1 : s;
      h += r.dh * s * s * (3 - 2 * s);
    }
    for (let i = 0; i < hills.length; i++) {
      const k = hills[i];
      const d = Math.hypot(x - k.x, z - k.z);
      if (d < k.r) h += k.dh * 0.5 * (1 + Math.cos((Math.PI * d) / k.r));
    }
    return h;
  }

  // Writes dh/dx and dh/dz into out[0] and out[1].
  function grad(x, z, out) {
    let gx = 0;
    let gz = 0;
    for (let i = 0; i < ramps.length; i++) {
      const r = ramps[i];
      const p = r.alongX ? x : z;
      const q = r.alongX ? z : x;
      if (q < r.lo || q > r.hi) continue;
      const s = (p - r.a) / (r.b - r.a);
      if (s <= 0 || s >= 1) continue;
      const d = (r.dh * 6 * s * (1 - s)) / (r.b - r.a);
      if (r.alongX) gx += d;
      else gz += d;
    }
    for (let i = 0; i < hills.length; i++) {
      const k = hills[i];
      const dx = x - k.x;
      const dz = z - k.z;
      const d = Math.hypot(dx, dz);
      if (d >= k.r || d < 1e-6) continue;
      const slope = (-k.dh * 0.5 * Math.PI * Math.sin((Math.PI * d) / k.r)) / k.r;
      gx += (slope * dx) / d;
      gz += (slope * dz) / d;
    }
    out[0] = gx;
    out[1] = gz;
  }

  return { height, grad, flat: terms.length === 0 };
}

// Joins unit edges that lie on one line and touch into longer segments.
function mergeEdges(edges, horizontal) {
  edges.sort((p, q) => (p.line - q.line) || (p.kind - q.kind) || (p.from - q.from));
  const out = [];
  let cur = null;
  for (const e of edges) {
    if (cur && cur.line === e.line && cur.kind === e.kind && cur.to === e.from) {
      cur.to = e.to;
    } else {
      cur = { line: e.line, kind: e.kind, from: e.from, to: e.to };
      out.push(cur);
    }
  }
  return out.map((m) =>
    horizontal
      ? { ax: m.from, az: m.line, bx: m.to, bz: m.line, kind: m.kind }
      : { ax: m.line, az: m.from, bx: m.line, bz: m.to, kind: m.kind },
  );
}

export function buildCourse(def) {
  const rows = def.map.length;
  const cols = def.map[0].length;
  const ox = -cols / 2;
  const oz = -rows / 2;
  const tiles = new Uint8Array(cols * rows);
  const bumpers = [];
  let tee = null;
  let cup = null;

  for (let v = 0; v < rows; v++) {
    const line = def.map[v];
    if (line.length !== cols) throw new Error(`${def.name}: row ${v} is ${line.length} wide, not ${cols}`);
    for (let u = 0; u < cols; u++) {
      const ch = line[u];
      const kind = CHARS[ch];
      if (kind === undefined) throw new Error(`${def.name}: unknown map character '${ch}'`);
      tiles[v * cols + u] = kind;
      const x = ox + u + 0.5;
      const z = oz + v + 0.5;
      if (ch === 'T') tee = { x, z };
      if (ch === 'O') cup = { x, z };
      if (ch === 'o') bumpers.push({ x, z });
    }
  }
  if (!tee || !cup) throw new Error(`${def.name}: the map needs a T and an O`);

  const tileAt = (u, v) => (u < 0 || v < 0 || u >= cols || v >= rows ? EMPTY : tiles[v * cols + u]);

  // Borders go on every tile side where the course surface ends against
  // something that is not an open drop. Edges where the green ends at water
  // or a drop are kept too: the renderer gives them a bank.
  const hEdges = [];
  const vEdges = [];
  const banks = [];
  for (let v = 0; v < rows; v++) {
    for (let u = 0; u < cols; u++) {
      const a = tiles[v * cols + u];
      for (let side = 0; side < 4; side++) {
        if (!opens(a, side)) continue;
        const b = tileAt(u + STEP_U[side], v + STEP_V[side]);
        const bOpen = opens(b, OPPOSITE[side]);
        // Corners of the side, in map coordinates.
        const u0 = side === E ? u + 1 : u;
        const v0 = side === S ? v + 1 : v;
        const u1 = side === W ? u : u + 1;
        const v1 = side === N ? v : v + 1;
        if (!bOpen && b !== VOID) {
          const kind = b === BLOCK ? STONE : WOOD;
          if (side === N || side === S) hEdges.push({ line: v0 + oz, from: u0 + ox, to: u1 + ox, kind });
          else vEdges.push({ line: u0 + ox, from: v0 + oz, to: v1 + oz, kind });
        } else if (a !== WATER && (b === VOID || b === WATER)) {
          banks.push({ ax: u0 + ox, az: v0 + oz, bx: u1 + ox, bz: v1 + oz, nx: STEP_U[side], nz: STEP_V[side], to: b });
        }
      }
    }
  }
  const segs = mergeEdges(hEdges, true).concat(mergeEdges(vEdges, false));

  // The diagonal borders of cut tiles.
  for (let v = 0; v < rows; v++) {
    for (let u = 0; u < cols; u++) {
      const k = tiles[v * cols + u];
      if (!isCut(k)) continue;
      const x = ox + u;
      const z = oz + v;
      if (k === CUT_NW || k === CUT_SE) segs.push({ ax: x + 1, az: z, bx: x, bz: z + 1, kind: WOOD });
      else segs.push({ ax: x, az: z, bx: x + 1, bz: z + 1, kind: WOOD });
    }
  }

  const terrain = makeTerrain(def.terrain || [], ox, oz);

  // For each tile, the segments that come close enough to touch a ball in
  // it, so a physics step only looks at a handful of walls.
  const reach = 0.13 + WALL_HALF + 0.05;
  const lists = [];
  for (let i = 0; i < cols * rows; i++) lists.push([]);
  segs.forEach((s, index) => {
    const u0 = Math.max(0, Math.floor(Math.min(s.ax, s.bx) - reach - ox));
    const u1 = Math.min(cols - 1, Math.floor(Math.max(s.ax, s.bx) + reach - ox));
    const v0 = Math.max(0, Math.floor(Math.min(s.az, s.bz) - reach - oz));
    const v1 = Math.min(rows - 1, Math.floor(Math.max(s.az, s.bz) + reach - oz));
    for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) lists[v * cols + u].push(index);
  });
  const cellStart = new Int32Array(cols * rows + 1);
  for (let i = 0; i < lists.length; i++) cellStart[i + 1] = cellStart[i] + lists[i].length;
  const cellSegs = new Int32Array(cellStart[lists.length]);
  lists.forEach((list, i) => cellSegs.set(list, cellStart[i]));

  const movers = (def.movers || []).map((m) =>
    m.spin
      ? { type: SPINNER, x: m.spin[0] + ox, z: m.spin[1] + oz, len: m.len, speed: m.speed, phase: m.phase || 0 }
      : {
          type: SLIDER,
          x0: m.slide[0] + ox,
          z0: m.slide[1] + oz,
          x1: m.slide[2] + ox,
          z1: m.slide[3] + oz,
          hw: m.size[0] / 2,
          hd: m.size[1] / 2,
          period: m.period,
          phase: m.phase || 0,
        },
  );

  // What lies under a point: a tile kind, with cut tiles resolved to GREEN
  // or EMPTY.
  function kindAt(x, z) {
    const fu = x - ox;
    const fv = z - oz;
    const u = Math.floor(fu);
    const v = Math.floor(fv);
    if (u < 0 || v < 0 || u >= cols || v >= rows) return EMPTY;
    const k = tiles[v * cols + u];
    if (!isCut(k)) return k;
    return cutInside(k, fu - u, fv - v) ? GREEN : EMPTY;
  }

  function cellIndex(x, z) {
    const u = Math.floor(x - ox);
    const v = Math.floor(z - oz);
    if (u < 0 || v < 0 || u >= cols || v >= rows) return -1;
    return v * cols + u;
  }

  // Walking distance from every tile to the cup, around borders and water,
  // so the game can suggest a sensible aim on doglegs.
  const cupDist = new Float32Array(cols * rows).fill(Infinity);
  {
    const walk = (k) => k === GREEN || k === SAND || isCut(k);
    const open = [cellIndex(cup.x, cup.z)];
    cupDist[open[0]] = 0;
    while (open.length) {
      let at = 0;
      for (let i = 1; i < open.length; i++) if (cupDist[open[i]] < cupDist[open[at]]) at = i;
      const i = open[at];
      open[at] = open[open.length - 1];
      open.pop();
      const u = i % cols;
      const v = (i / cols) | 0;
      for (let dv = -1; dv <= 1; dv++) {
        for (let du = -1; du <= 1; du++) {
          if (!du && !dv) continue;
          const nu = u + du;
          const nv = v + dv;
          if (!walk(tileAt(nu, nv))) continue;
          // Diagonal steps only where both straight neighbours are open.
          if (du && dv && (!walk(tileAt(nu, v)) || !walk(tileAt(u, nv)))) continue;
          const d = cupDist[i] + (du && dv ? Math.SQRT2 : 1);
          const j = nv * cols + nu;
          if (d < cupDist[j]) {
            if (cupDist[j] === Infinity) open.push(j);
            cupDist[j] = d;
          }
        }
      }
    }
  }

  function pathDistance(x, z) {
    const i = cellIndex(x, z);
    if (i < 0 || cupDist[i] === Infinity) return 1e9;
    if (cupDist[i] === 0) return Math.hypot(x - cup.x, z - cup.z);
    return cupDist[i] + Math.hypot(x - (ox + (i % cols) + 0.5), z - (oz + ((i / cols) | 0) + 0.5)) * 0.5;
  }

  return {
    name: def.name,
    par: def.par,
    cols,
    rows,
    ox,
    oz,
    tiles,
    tileAt,
    segs,
    banks,
    bumpers,
    movers,
    tee,
    cup,
    cellStart,
    cellSegs,
    cellIndex,
    kindAt,
    pathDistance,
    height: terrain.height,
    grad: terrain.grad,
    flat: terrain.flat,
  };
}
