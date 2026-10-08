// Turns a level from levels.js into flat, column-sorted arrays for the
// physics, the renderer and the music. Built once per level at startup.

import { X0 } from './sim.js';
import { BAR, CHUNKS } from './levels.js';

const FINISH_BEFORE_END = 2; // bars of run-out music after the finish gate

// A list of things on the grid, sorted by column, with an index for quick
// lookups: things in columns [a, b) are items start[a] .. start[b] - 1.
function list(items, cols, fields) {
  const out = { n: items.length, start: new Int32Array(cols + 1) };
  for (const f of fields) out[f] = new Float32Array(items.map((it) => it[f]));
  let i = 0;
  for (let c = 0; c <= cols; c++) {
    while (i < items.length && items[i].col < c) i++;
    out.start[c] = i;
  }
  return out;
}

export function buildLevel(def) {
  const barChunks = [];
  const barInfo = [];
  for (const section of def.sections) {
    const names = section.bars.trim().split(/\s+/);
    names.forEach((name, k) => {
      const chunk = CHUNKS[name];
      if (!chunk) throw new Error(`${def.name}: unknown chunk ${name}`);
      for (const row of chunk) {
        if (row.length !== BAR) throw new Error(`${def.name}: chunk ${name} has a row of ${row.length}`);
      }
      barChunks.push(chunk);
      barInfo.push({
        drums: section.drums,
        bass: section.bass || '',
        arp: !!section.arp,
        pad: !!section.pad,
        crash: !!section.crash && k === 0,
        riser: !!section.riser && k === names.length - 2, // a riser spans the last two bars
        fill: section.drums === 'full' && k % 4 === 3 && k !== names.length - 1,
      });
    });
  }

  const bars = barChunks.length;
  const cols = bars * BAR;
  const cell = (c, r) => {
    const chunk = barChunks[Math.floor(c / BAR)];
    return r < chunk.length ? chunk[chunk.length - 1 - r][c % BAR] : '.';
  };

  const gap = new Uint8Array(cols);
  const solids = [];
  const blocks = [];
  const pillars = [];
  const spikes = [];
  const pads = [];
  const rings = [];
  for (let c = 0; c < cols; c++) {
    const height = barChunks[Math.floor(c / BAR)].length;
    if (cell(c, 0) === '_') gap[c] = 1;
    let runStart = -1;
    for (let r = 0; r <= height; r++) {
      const ch = cell(c, r);
      const solid = ch === '#' || ch === 'I';
      // Stacked solid cells become one solid, so only the top of a stack
      // catches the cube.
      if (solid && runStart < 0) runStart = r;
      if (!solid && runStart >= 0) {
        solids.push({ col: c, bottom: runStart, top: r });
        runStart = -1;
      }
      if (ch === '#') blocks.push({ col: c, row: r });
      else if (ch === 'I') pillars.push({ col: c, row: r, cap: cell(c, r + 1) === 'I' ? 0 : 1 });
      else if (ch === '^') spikes.push({ col: c, row: r, dir: 1 });
      else if (ch === 'v') spikes.push({ col: c, row: r, dir: -1 });
      else if (ch === 'o') pads.push({ col: c, row: r });
      else if (ch === 'O') rings.push({ col: c, row: r });
    }
  }

  // Bars where the kick plays, for the beat pulse of the scenery.
  const kick = new Uint8Array(bars);
  barInfo.forEach((b, i) => (kick[i] = b.drums !== 'none' ? 1 : 0));

  return {
    def,
    name: def.name,
    bpm: def.bpm,
    speed: (def.bpm / 60) * 4, // cells per second: a cell is a sixteenth note
    bars,
    cols,
    endX: X0 + (bars - FINISH_BEFORE_END) * BAR,
    gap,
    barInfo,
    kick,
    solids: list(solids, cols, ['col', 'bottom', 'top']),
    blocks: list(blocks, cols, ['col', 'row']),
    pillars: list(pillars, cols, ['col', 'row', 'cap']),
    spikes: list(spikes, cols, ['col', 'row', 'dir']),
    pads: list(pads, cols, ['col', 'row']),
    rings: list(rings, cols, ['col', 'row']),
  };
}
