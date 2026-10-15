// Layout for the HUD: turns an element tree and its computed styles into
// positioned boxes (block flow, inline text with line breaking, flexbox, a
// simple grid, absolute and relative positioning), then into paint layers.
// Coordinates are the game's screen (hh.width x hh.height), before CSS
// transforms; layers carry their transform and opacity separately so that
// animating those never needs a new layout.
//
// Needs a font provider: fonts.advance(cp, face) (in em), fonts.metrics(face)
// ({ascent, descent} in em) and fonts.face(cs) (a face name for a style).
// globalThis.__layout = { layout }

(() => {
  const g = globalThis;
  const { length, splitTop, parseColor, parseTransform } = g.__css;

  const BORDER_WIDTHS = { thin: 1, medium: 3, thick: 5 };
  const SIDES = ['top', 'right', 'bottom', 'left'];

  // ---- Box tree

  class Box {
    constructor(el, cs, parent, pseudo = null) {
      this.el = el;
      this.cs = cs;
      this.parent = parent;
      this.pseudo = pseudo;
      this.children = [];
      this.abs = []; // absolutely positioned boxes whose containing block is this one
      const d = cs.display;
      this.display = d === 'list-item' || d === 'table' || d === 'table-row' || d === 'flow-root' ? 'block' : d === 'table-cell' ? 'inline-block' : d;
      this.position = cs.position;
      this.x = 0; this.y = 0; this.w = 0; this.h = 0;
    }
    get inline() { return this.display === 'inline' || this.display === 'text'; }
    get inlineLevel() { return this.display === 'inline' || this.display === 'text' || this.display === 'inline-block' || this.display === 'inline-flex' || this.display === 'inline-grid'; }
    get positioned() { return this.position !== 'static'; }
    get outOfFlow() { return this.position === 'absolute' || this.position === 'fixed'; }
  }

  const textContentOf = (content) => {
    if (!content || content === 'none' || content === 'normal') return null;
    let out = '';
    for (const m of content.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
      out += (m[1] ?? m[2]).replace(/\\([0-9a-fA-F]{1,6})\s?/g, (x, h) => String.fromCodePoint(parseInt(h, 16))).replace(/\\(.)/g, '$1');
    }
    return out;
  };

  // Builds boxes for el and its descendants; returns null when not displayed.
  function build(el, parentCs, parentBox, styler, overrides, cbStack) {
    const base = styler.compute(el, parentCs);
    const cs = overrides.get(el) ? { ...base, ...overrides.get(el) } : base;
    if (cs.display === 'none') return null;
    const box = new Box(el, cs, parentBox);
    el.__box = box;
    box.gen = g.__layoutGen;
    // Flex and grid items, and absolutely positioned boxes, are block-level.
    const parentDisplay = parentBox?.display ?? '';
    if (/flex|grid/.test(parentDisplay) || box.outOfFlow) box.display = BLOCKIFY[box.display] ?? box.display;
    resolveCh(cs);
    const cb = box.positioned || !cbStack ? box : cbStack;
    const add = (child) => {
      if (!child) return;
      if (child.outOfFlow) (child.position === 'fixed' ? rootOf(box) : cb).abs.push(child);
      box.children.push(child);
    };
    const pseudo = (name) => {
      const pcs = styler.compute(el, cs, name);
      const text = textContentOf(pcs.content);
      if (text === null || pcs.display === 'none') return null;
      const pbox = new Box(el, pcs, box, name);
      if (/flex|grid/.test(box.display) || pbox.outOfFlow) pbox.display = BLOCKIFY[pbox.display] ?? pbox.display;
      resolveCh(pcs);
      if (text) pbox.children.push(textBox(text, pcs, pbox));
      return pbox;
    };
    if (REPLACED.has(el.localName)) {
      // Pictures: sized by their attributes, drawn whole, no children laid out.
      const attr = (n) => parseFloat(el.getAttribute(n) ?? (el.localName === 'canvas' ? el[n] : '')) || 0;
      box.replaced = { w: attr('width') || (el.localName === 'svg' ? 300 : 0), h: attr('height') || (el.localName === 'svg' ? 150 : 0) };
      return box;
    }
    add(pseudo('before'));
    for (const node of el.childNodes) {
      if (node.nodeType === 3) {
        if (node.data) box.children.push(textBox(node.data, cs, box));
      } else if (node.nodeType === 1) {
        if (node.localName === 'br') {
          const br = new Box(node, cs, box);
          br.display = 'text';
          br.position = 'static';
          br.text = '\n';
          br.forced = true;
          box.children.push(br);
        } else if (!(node.localName === 'canvas' && node === g.__gl?.canvas) && node.localName !== 'script' && node.localName !== 'style') {
          add(build(node, cs, box, styler, overrides, cb));
        }
      }
    }
    add(pseudo('after'));
    return box;
  }
  const REPLACED = new Set(['svg', 'img', 'canvas']);
  const BLOCKIFY = { inline: 'block', 'inline-block': 'block', 'inline-flex': 'flex', 'inline-grid': 'grid' };
  // `ch` is the width of "0" in the element's own font.
  const CH_PROPS = ['width', 'min-width', 'max-width', 'height', 'min-height', 'max-height', 'margin-left', 'margin-right', 'padding-left', 'padding-right', 'left', 'right', 'letter-spacing', 'flex-basis'];
  function resolveCh(cs) {
    for (const p of CH_PROPS) {
      const v = cs[p];
      if (typeof v === 'string' && v.includes('ch')) {
        const zero = fonts.advance(48, fonts.face(cs)) * cs.fontSize;
        cs[p] = v.replace(/(-?[\d.]+)ch\b/g, (m, n) => `${n * zero}px`);
      }
    }
  }
  const rootOf = (box) => { while (box.parent) box = box.parent; return box; };
  const textBox = (text, cs, parent) => {
    const t = new Box(null, cs, parent);
    t.display = 'text';
    t.position = 'static'; // text takes its style from its element, but never its position
    t.text = text;
    return t;
  };

  // ---- Measurements

  function edges(box, cbW) {
    const cs = box.cs;
    const fs = cs.fontSize;
    const e = { mt: 0, mr: 0, mb: 0, ml: 0, pt: 0, pr: 0, pb: 0, pl: 0, bt: 0, br: 0, bb: 0, bl: 0, autoL: false, autoR: false, autoT: false, autoB: false };
    for (const s of SIDES) {
      const k = s[0];
      const m = cs[`margin-${s}`];
      if (m === 'auto') e[`auto${k.toUpperCase()}`] = true;
      else e[`m${k}`] = length(m, cbW, fs, 0);
      e[`p${k}`] = Math.max(0, length(cs[`padding-${s}`], cbW, fs, 0));
      const style = cs[`border-${s}-style`];
      const w = cs[`border-${s}-width`];
      e[`b${k}`] = style === 'none' || style === 'hidden' ? 0 : BORDER_WIDTHS[w] ?? Math.max(0, length(w, cbW, fs, 0));
    }
    e.h = e.pl + e.pr + e.bl + e.br; // horizontal padding + border
    e.v = e.pt + e.pb + e.bt + e.bb;
    return e;
  }

  // A specified size as a content-box size, or null for auto.
  function specSize(box, prop, basis, e) {
    const v = box.cs[prop];
    if (v === 'auto' || v === undefined || (String(v).endsWith('%') && (basis === null || Number.isNaN(basis)))) return null;
    let n = length(v, basis, box.cs.fontSize, null);
    if (n === null) return null;
    if (box.cs['box-sizing'] === 'border-box') n -= prop.includes('width') ? e.h : e.v;
    return Math.max(0, n);
  }
  function clampSize(box, size, axis, basis, e) {
    const max = specSize(box, `max-${axis}`, basis, e);
    const min = specSize(box, `min-${axis}`, basis, e);
    if (max !== null) size = Math.min(size, max);
    if (min !== null) size = Math.max(size, min);
    return size;
  }

  // A picture's content size: specified sizes win; one given keeps the aspect ratio.
  function replacedSize(box, cbW, cbH, e) {
    const sw = specSize(box, 'width', cbW, e);
    const sh = specSize(box, 'height', cbH, e);
    const { w, h } = box.replaced;
    if (sw !== null && sh !== null) return [sw, sh];
    if (sw !== null) return [sw, w ? (sw * h) / w : h];
    if (sh !== null) return [h ? (sh * w) / h : w, sh];
    return [w, h];
  }

  // ---- Text

  let fonts = null;
  const TRANSFORMS = {
    uppercase: (t) => t.toUpperCase(),
    lowercase: (t) => t.toLowerCase(),
    capitalize: (t) => t.replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()),
  };
  function fontOf(cs) {
    if (cs.font) return cs.font;
    const face = fonts.face(cs);
    const size = cs.fontSize;
    const m = fonts.metrics(face);
    const lh = cs['line-height'];
    const lineHeight = lh === 'normal' ? size * (m.ascent + m.descent + (m.lineGap ?? 0)) : /^[\d.]+$/.test(lh) ? +lh * size : length(lh, size, size, size * 1.2);
    const ls = cs['letter-spacing'] === 'normal' ? 0 : length(cs['letter-spacing'], 0, size, 0);
    return (cs.font = { face, size, ascent: m.ascent * size, descent: m.descent * size, lineHeight, letterSpacing: ls });
  }
  const widthCache = new Map();
  function textWidth(text, font) {
    const key = `${font.face}|${font.size}|${font.letterSpacing}|${text}`;
    let w = widthCache.get(key);
    if (w !== undefined) return w;
    w = 0;
    for (const ch of text) w += fonts.advance(ch.codePointAt(0), font.face) * font.size + font.letterSpacing;
    if (widthCache.size > 5000) widthCache.clear();
    widthCache.set(key, w);
    return w;
  }

  // Words and spaces of a text box after white-space processing.
  function pieces(box) {
    const ws = box.cs['white-space'];
    let text = box.text;
    const tf = TRANSFORMS[box.cs['text-transform']];
    if (tf) text = tf(text);
    const pre = ws === 'pre' || ws === 'pre-wrap' || ws === 'break-spaces';
    const keepLines = pre || ws === 'pre-line';
    if (!pre) text = keepLines ? text.replace(/[ \t]+/g, ' ') : text.replace(/\s+/g, ' ');
    const out = [];
    for (const part of text.split(/(\n| +)/)) {
      if (part === '') continue;
      if (part === '\n') out.push({ kind: keepLines || box.forced ? 'break' : 'space', text: ' ' });
      else if (part[0] === ' ') out.push({ kind: 'space', text: pre ? part : ' ' });
      else out.push({ kind: 'word', text: part });
    }
    return out;
  }
  const wraps = (cs) => cs['white-space'] !== 'nowrap' && cs['white-space'] !== 'pre';

  // ---- Intrinsic widths (margin-box): [min-content, max-content]

  function intrinsic(box) {
    if (box.intrinsic) return box.intrinsic;
    let result;
    if (box.display === 'text') {
      const font = fontOf(box.cs);
      let min = 0;
      let line = 0;
      let max = 0;
      const wrap = wraps(box.cs);
      for (const p of pieces(box)) {
        if (p.kind === 'break') { max = Math.max(max, line); line = 0; continue; }
        const w = textWidth(p.text, font);
        line += w;
        if (p.kind === 'word') min = wrap ? Math.max(min, w) : min;
      }
      max = Math.max(max, line);
      result = [wrap ? min : max, max];
    } else {
      const e = edges(box, 0);
      const marg = e.ml + e.mr + e.h;
      const fixed = specSize(box, 'width', null, e) ?? (box.replaced ? replacedSize(box, null, null, e)[0] : null);
      if (fixed !== null) {
        const w = clampSize(box, fixed, 'width', null, e) + marg;
        result = [w, w];
      } else {
        const kids = box.children.filter((c) => !c.outOfFlow);
        const items = kids.filter((c) => !(c.display === 'text' && !c.text.trim() && wraps(c.cs)));
        let min = 0;
        let max = 0;
        const d = box.display;
        if ((d === 'flex' || d === 'inline-flex') && !box.cs['flex-direction'].startsWith('column')) {
          const gap = length(box.cs['column-gap'], 0, box.cs.fontSize, 0) * Math.max(0, items.length - 1);
          for (const k of items) { const [a, b] = intrinsic(k); min += a; max += b; }
          min += gap; max += gap;
        } else if (d === 'grid' || d === 'inline-grid') {
          const cols = Math.max(1, gridColumns(box).length);
          const gap = length(box.cs['column-gap'], 0, box.cs.fontSize, 0) * (cols - 1);
          let mn = 0; let mx = 0;
          for (const k of items) { const [a, b] = intrinsic(k); mn = Math.max(mn, a); mx = Math.max(mx, b); }
          min = mn * cols + gap; max = mx * cols + gap;
        } else {
          // Inline runs add up along a line; blocks stack. Collapsible white
          // space at either end of a run takes no room.
          let line = 0;
          const blank = (k) => k.display === 'text' && wraps(k.cs) && !k.forced && !k.text.trim();
          // A blank text counts only between content of the same inline run.
          const contentAt = (i, step) => {
            for (let j = i + step; j >= 0 && j < kids.length; j += step) {
              if (!kids[j].inlineLevel) return false;
              if (!blank(kids[j])) return true;
            }
            return false;
          };
          for (const [i, k] of kids.entries()) {
            if (blank(k) && (!contentAt(i, -1) || !contentAt(i, 1) || blank(kids[i - 1]))) continue;
            const [a, b] = intrinsic(k);
            if (k.inlineLevel && !k.forced) {
              line += b;
              min = Math.max(min, a);
            } else {
              max = Math.max(max, line);
              line = 0;
              min = Math.max(min, a);
              max = Math.max(max, b);
            }
          }
          max = Math.max(max, line);
        }
        result = [clampSize(box, min, 'width', null, e) + marg, clampSize(box, max, 'width', null, e) + marg];
      }
    }
    return (box.intrinsic = result);
  }

  // ---- Layout. Each function sets box.w/h (border box) and positions the
  // children relative to the box's border-box origin (x, y local).

  // Lays out a box whose border-box width is decided by the caller (or auto:
  // fills `avail`), inside a containing block of cbW x cbH.
  function layoutBox(box, cbW, cbH, avail, forcedW = null, forcedH = null) {
    const e = (box.e = edges(box, cbW));
    let w;
    if (forcedW !== null) w = forcedW - e.h;
    else {
      const spec = specSize(box, 'width', cbW, e);
      if (spec !== null) w = spec;
      else if (box.shrink) w = Math.min(Math.max(intrinsic(box)[0], avail), intrinsic(box)[1]) - e.ml - e.mr - e.h;
      else w = avail - e.ml - e.mr - e.h;
    }
    w = Math.max(0, clampSize(box, w, 'width', cbW, e));
    let specH = forcedH !== null ? forcedH - e.v : specSize(box, 'height', cbH, e);
    if (specH !== null) specH = clampSize(box, specH, 'height', cbH, e);
    box.cw = w;
    box.ch = specH;
    box.lastBaseline = undefined;
    box.firstBaseline = undefined;
    const d = box.display;
    let contentH;
    if (box.replaced) {
      const [rw, rh] = replacedSize(box, cbW, cbH, e);
      if (forcedW === null && specSize(box, 'width', cbW, e) === null) { w = rw; box.cw = w; }
      contentH = rh;
    } else if (d === 'flex' || d === 'inline-flex') contentH = layoutFlex(box, w, specH);
    else if (d === 'grid' || d === 'inline-grid') contentH = layoutGrid(box, w, specH);
    else contentH = layoutFlow(box, w, specH);
    box.flowH = contentH;
    const ratio = box.cs['aspect-ratio'];
    if (specH === null && ratio && ratio !== 'auto') {
      const [a, b] = ratio.split('/').map((x) => parseFloat(x));
      if (a > 0) specH = Math.max(contentH, (w + (box.cs['box-sizing'] === 'border-box' ? e.h : 0)) * (b || 1) / a - (box.cs['box-sizing'] === 'border-box' ? e.v : 0));
    }
    let h = specH !== null ? specH : clampSize(box, contentH, 'height', cbH, e);
    box.ch = h;
    box.w = w + e.h;
    box.h = h + e.v;
    layoutAbsolute(box);
  }

  // Block flow: block children stack; runs of inline-level children become lines.
  function layoutFlow(box, w, h) {
    const e = box.e;
    const ox = e.bl + e.pl;
    let y = e.bt + e.pt;
    const kids = box.children.filter((c) => !c.outOfFlow);
    for (const c of box.children) if (c.outOfFlow) { c.staticParent = box; c.staticX = ox; c.staticY = y; }
    if (!kids.length) return 0;
    if (kids.every((k) => k.inlineLevel)) return layoutInline(box, kids, w, ox, y);
    let run = [];
    const flush = () => {
      if (!run.length) return;
      if (run.some((k) => k.display !== 'text' || k.forced || k.text.trim() || !/normal|nowrap/.test(k.cs['white-space']))) y += layoutInline(box, run, w, ox, y);
      run = [];
    };
    const all = box.children;
    for (const k of kids) {
      // Out-of-flow siblings before this one get the current position as their static one.
      for (let i = all.indexOf(k) - 1; i >= 0 && all[i].outOfFlow; i--) all[i].staticY = y;
      if (k.inlineLevel) { run.push(k); continue; }
      flush();
      layoutBox(k, w, h, w);
      const ke = k.e;
      let x = ox + ke.ml;
      if (ke.autoL && ke.autoR) x = ox + (w - k.w) / 2;
      else if (ke.autoL) x = ox + w - k.w - ke.mr;
      k.x = x;
      k.y = y + ke.mt;
      if (k.lastBaseline !== undefined) box.lastBaseline = k.y + k.lastBaseline;
      y += ke.mt + k.h + ke.mb;
    }
    flush();
    for (let i = all.length - 1; i >= 0 && all[i].outOfFlow; i--) all[i].staticY = y;
    return y - (e.bt + e.pt);
  }

  // Inline formatting: words, spaces and atomic boxes broken into lines.
  // Records box.lines = [{ runs: [{x, y(baseline), text, cs, font}], decor: [...] }].
  function layoutInline(box, kids, w, ox, oy) {
    const strut = fontOf(box.cs);
    const items = [];
    const walk = (k, chain) => {
      if (k.display === 'text') {
        for (const p of pieces(k)) items.push({ ...p, cs: k.cs, font: fontOf(k.cs), chain, wrap: wraps(k.cs) });
      } else if (k.display === 'inline') {
        const e = (k.e = edges(k, w));
        items.push({ kind: 'open', box: k, width: e.ml + e.bl + e.pl, chain });
        for (const c of k.children) if (!c.outOfFlow) walk(c, [...chain, k]);
        items.push({ kind: 'close', box: k, width: e.mr + e.br + e.pr, chain });
      } else {
        k.shrink = true;
        layoutBox(k, w, box.ch, w);
        items.push({ kind: 'atom', box: k, width: k.w + k.e.ml + k.e.mr, chain });
      }
    };
    for (const k of kids) walk(k, []);
    // Only collapsible white space: no line box at all.
    if (items.every((it) => (it.kind === 'space' && it.wrap) || ((it.kind === 'open' || it.kind === 'close') && !it.width))) {
      box.lines = [];
      return 0;
    }

    // Break into lines.
    const lines = [];
    let line = { items: [], width: 0 };
    const newLine = () => { lines.push(line); line = { items: [], width: 0 }; };
    for (const it of items) {
      if (it.kind === 'break') { line.items.push(it); newLine(); continue; }
      const width = it.width ?? textWidth(it.text, it.font);
      it.width = width;
      if (it.kind === 'space' && line.items.every((x) => x.kind === 'open' || x.kind === 'space') && it.wrap) continue;
      const canBreak = it.kind === 'word' || it.kind === 'atom' ? it.wrap !== false : false;
      if (canBreak && line.width + width > w + 0.5 && line.items.some((x) => x.kind === 'word' || x.kind === 'atom')) {
        // Trailing spaces stay on the old line but do not count.
        newLine();
      }
      line.items.push(it);
      line.width += width;
    }
    if (line.items.length || !lines.length) lines.push(line);

    // Place lines: baselines from the tallest ascent/descent with half-leading.
    const align = box.cs['text-align'];
    let y = oy;
    box.lines = [];
    for (const ln of lines) {
      while (ln.items.length && ln.items[ln.items.length - 1].kind === 'space' && ln.items[ln.items.length - 1].wrap) ln.width -= ln.items.pop().width;
      const half = (f) => (f.lineHeight - (f.ascent + f.descent)) / 2;
      let above = strut.ascent + half(strut);
      let below = strut.descent + half(strut);
      for (const it of ln.items) {
        if (it.kind === 'word' || it.kind === 'space') {
          above = Math.max(above, it.font.ascent + half(it.font));
          below = Math.max(below, it.font.descent + half(it.font));
        } else if (it.kind === 'atom') {
          const [a, d] = atomExtent(it.box, strut, strut.lineHeight);
          above = Math.max(above, a);
          below = Math.max(below, d);
        }
      }
      const baseline = y + above;
      let x = ox + (align === 'center' ? (w - ln.width) / 2 : align === 'right' || align === 'end' ? w - ln.width : 0);
      const out = { runs: [], decor: [], top: y, bottom: baseline + below };
      const open = new Map();
      for (const it of ln.items) {
        if (it.kind === 'word' || it.kind === 'space') {
          if (it.kind === 'word' || !it.wrap || it.text.length > 1) out.runs.push({ x, y: baseline, text: it.text, cs: it.cs, font: it.font, chain: it.chain });
          x += it.width;
        } else if (it.kind === 'open') {
          open.set(it.box, x + it.box.e.ml);
          x += it.width;
        } else if (it.kind === 'close') {
          x += it.width;
          out.decor.push(inlineDecor(it.box, open.get(it.box) ?? ox, x - it.box.e.mr, baseline));
          open.delete(it.box);
        } else if (it.kind === 'atom') {
          const b = it.box;
          b.x = x + b.e.ml;
          b.y = baseline - atomExtent(b, strut, strut.lineHeight)[0] + b.e.mt;
          x += it.width;
        }
      }
      // Inline boxes still open at the line's end continue on the next line.
      for (const [b, x0] of open) out.decor.push(inlineDecor(b, x0, x, baseline));
      out.baseline = baseline;
      box.lines.push(out);
      y = baseline + below;
    }
    if (box.lines.length) {
      box.firstBaseline = box.lines[0].baseline;
      box.lastBaseline = box.lines[box.lines.length - 1].baseline;
    }
    return y - oy;
  }
  // How far an atomic inline box reaches above and below the line's baseline:
  // its own last baseline sits on it (or its bottom edge when it has no text),
  // moved by vertical-align.
  function atomExtent(b, strut, lineHeight) {
    const va = b.cs['vertical-align'];
    const hgt = b.h + b.e.mt + b.e.mb;
    const fs = b.parent?.cs.fontSize ?? b.cs.fontSize;
    if (va === 'middle') return [hgt / 2 + fs * 0.25, hgt / 2 - fs * 0.25];
    if (va === 'top' || va === 'text-top') return [strut.ascent, hgt - strut.ascent];
    if (va === 'bottom' || va === 'text-bottom') return [hgt - strut.descent, strut.descent];
    const base = b.lastBaseline !== undefined && b.cs['overflow-x'] === 'visible' ? b.e.mt + b.lastBaseline : hgt;
    let shift = 0;
    if (va === 'sub') shift = -fs * 0.2;
    else if (va === 'super') shift = fs * 0.33;
    else if (/^-?[\d.]/.test(va)) shift = length(va, lineHeight, fs, 0);
    return [base + shift, hgt - base - shift];
  }

  function inlineDecor(b, x0, x1, baseline) {
    const f = fontOf(b.cs);
    return { box: b, x: x0, y: baseline - f.ascent - b.e.pt - b.e.bt, w: x1 - x0, h: f.ascent + f.descent + b.e.v };
  }

  // ---- Flexbox (single line)
  function layoutFlex(box, w, h) {
    const cs = box.cs;
    const e = box.e;
    for (const c of box.children) if (c.outOfFlow) { c.staticParent = box; c.staticX = e.bl + e.pl; c.staticY = e.bt + e.pt; }
    const dir = cs['flex-direction'];
    const row = !dir.startsWith('column');
    const reverse = dir.endsWith('reverse');
    const fs = cs.fontSize;
    const gap = length(cs[row ? 'column-gap' : 'row-gap'], row ? w : h, fs, 0);
    const items = box.children.filter((c) => !c.outOfFlow && !(c.display === 'text' && !c.text.trim()))
      .map((c) => (c.display === 'text' ? wrapAnon(c, box) : c))
      .sort((a, b) => (+a.cs.order || 0) - (+b.cs.order || 0));
    if (reverse) items.reverse();
    const mainSize = row ? w : h;
    const alignItems = cs['align-items'];

    // Hypothetical main sizes.
    for (const it of items) {
      it.e = edges(it, w);
      const basis = it.cs['flex-basis'];
      let size;
      const b = basis === 'auto' || basis === 'content' ? null : length(basis, mainSize ?? NaN, it.cs.fontSize, null);
      if (b !== null && !Number.isNaN(b)) size = b + (it.cs['box-sizing'] === 'border-box' ? 0 : row ? it.e.h : it.e.v);
      else if (row) {
        const spec = specSize(it, 'width', w, it.e);
        size = spec !== null ? spec + it.e.h : intrinsic(it)[1] - it.e.ml - it.e.mr;
      } else {
        const crossW = stretchW(it, w, alignItems);
        it.shrink = crossW === null;
        layoutBox(it, w, h, w, crossW);
        size = specSize(it, 'height', h, it.e) !== null ? specSize(it, 'height', h, it.e) + it.e.v : it.h;
      }
      it.base = size;
      if (!row) it.minMain = 0;
      else if (it.cs['min-width'] !== 'auto') it.minMain = (specSize(it, 'min-width', w, it.e) ?? 0) + it.e.h;
      else if (it.cs['overflow-x'] !== 'visible') it.minMain = 0;
      else {
        const spec = specSize(it, 'width', w, it.e);
        it.minMain = Math.min(intrinsic(it)[0] - it.e.ml - it.e.mr, spec === null ? Infinity : spec + it.e.h);
      }
      it.main = Math.max(it.minMain, size);
      it.margins = row ? it.e.ml + it.e.mr : it.e.mt + it.e.mb;
    }

    // Grow or shrink to fit a definite main size: share the free space left
    // by the flex base sizes, then freeze items held at their minimum.
    const gaps = gap * Math.max(0, items.length - 1);
    const outer = items.reduce((s, it) => s + it.main + it.margins, 0) + gaps;
    let free = mainSize === null ? 0 : mainSize - outer;
    if (mainSize !== null && free !== 0) {
      const growing = free > 0;
      const factor = (it) => (growing ? +it.cs['flex-grow'] || 0 : (+it.cs['flex-shrink'] || 0) * it.base);
      if (items.some((it) => factor(it) > 0)) {
        const frozen = new Set(items.filter((it) => factor(it) === 0));
        for (const it of items) if (!frozen.has(it)) it.main = it.base;
        for (let round = 0; round < items.length + 1; round++) {
          const space = mainSize - gaps - items.reduce((s, it) => s + it.main + it.margins, 0);
          const active = items.filter((it) => !frozen.has(it));
          const total = active.reduce((s, it) => s + factor(it), 0);
          if (!active.length || total <= 0) break;
          let violated = false;
          for (const it of active) {
            const target = it.main + (space * factor(it)) / total;
            if (target < it.minMain) { it.main = it.minMain; frozen.add(it); violated = true; }
          }
          if (!violated) {
            for (const it of active) it.main += (space * factor(it)) / total;
            break;
          }
          for (const it of active) if (!frozen.has(it)) it.main = it.base;
        }
      }
      free = mainSize - gaps - items.reduce((s, it) => s + it.main + it.margins, 0);
    }

    // Final layout of each item, then the cross size of the line.
    for (const it of items) {
      if (row) {
        layoutBox(it, w, h, it.main, it.main, null);
      } else {
        const crossW = stretchW(it, w, alignItems);
        it.shrink = crossW === null;
        layoutBox(it, w, h, w, crossW, it.main);
      }
    }
    const crossSize = row
      ? (h !== null ? h : items.reduce((m, it) => Math.max(m, it.h + it.e.mt + it.e.mb), 0))
      : w;
    // Stretch items without a cross size.
    if (row) {
      for (const it of items) {
        const a = it.cs['align-self'] === 'auto' ? alignItems : it.cs['align-self'];
        if ((a === 'stretch' || a === 'normal') && specSize(it, 'height', h, it.e) === null && !it.e.autoT && !it.e.autoB) {
          const target = crossSize - it.e.mt - it.e.mb;
          if (Math.abs(target - it.h) > 0.01) layoutBox(it, w, h, it.main, it.main, target);
        }
      }
    }

    // Main-axis positions.
    const autoMargins = items.reduce((n, it) => n + (row ? (it.e.autoL ? 1 : 0) + (it.e.autoR ? 1 : 0) : (it.e.autoT ? 1 : 0) + (it.e.autoB ? 1 : 0)), 0);
    const jc = cs['justify-content'];
    let start = 0;
    let between = gap;
    const n = items.length;
    if (free > 0 && autoMargins === 0) {
      if (jc === 'center') start = free / 2;
      else if (jc === 'flex-end' || jc === 'end' || jc === 'right') start = free;
      else if (jc === 'space-between' && n > 1) between += free / (n - 1);
      else if (jc === 'space-around') { start = free / n / 2; between += free / n; }
      else if (jc === 'space-evenly') { start = free / (n + 1); between += free / (n + 1); }
      else if (jc === 'space-between' || jc === 'space-around' || jc === 'space-evenly') start = jc === 'space-between' ? 0 : free / 2;
    }
    const perAuto = autoMargins && free > 0 ? free / autoMargins : 0;
    let pos = (row ? e.bl + e.pl : e.bt + e.pt) + start;
    for (const it of items) {
      const lead = row ? it.e.ml + (it.e.autoL ? perAuto : 0) : it.e.mt + (it.e.autoT ? perAuto : 0);
      const trail = row ? it.e.mr + (it.e.autoR ? perAuto : 0) : it.e.mb + (it.e.autoB ? perAuto : 0);
      const a = it.cs['align-self'] === 'auto' ? alignItems : it.cs['align-self'];
      const itemCross = row ? it.h + it.e.mt + it.e.mb : it.w + it.e.ml + it.e.mr;
      let cross = 0;
      if (a === 'center') cross = (crossSize - itemCross) / 2;
      else if (a === 'flex-end' || a === 'end') cross = crossSize - itemCross;
      if (row) {
        it.x = pos + lead;
        it.y = e.bt + e.pt + cross + it.e.mt;
        pos += lead + it.w + trail + between;
      } else {
        it.y = pos + lead;
        it.x = e.bl + e.pl + cross + it.e.ml;
        pos += lead + it.h + trail + between;
      }
    }
    // align-items: baseline lines up the items' first baselines.
    if (row) {
      const based = items.filter((it) => (it.cs['align-self'] === 'auto' ? alignItems : it.cs['align-self']) === 'baseline');
      if (based.length) {
        const offset = (it) => it.e.mt + (it.firstBaseline ?? it.lastBaseline ?? it.h);
        const top = Math.max(...based.map(offset));
        for (const it of based) it.y = e.bt + e.pt + top - offset(it) + it.e.mt;
      }
    }
    const withBase = items.find((it) => it.lastBaseline !== undefined);
    if (withBase) box.lastBaseline = withBase.y + withBase.lastBaseline;
    if (!items.length) return row ? crossSize : 0;
    return row ? crossSize : pos - between - (e.bt + e.pt);
  }
  // The width a column flex item stretches to, or null when it shrinks to fit.
  function stretchW(it, w, alignItems) {
    const a = it.cs['align-self'] === 'auto' ? alignItems : it.cs['align-self'];
    if ((a === 'stretch' || a === 'normal') && specSize(it, 'width', w, it.e) === null && !it.e.autoL && !it.e.autoR) return w - it.e.ml - it.e.mr;
    return null;
  }
  const ANON = { display: 'block', 'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', order: '0', 'align-self': 'auto', width: 'auto', height: 'auto', 'min-width': 'auto', 'min-height': 'auto', 'max-width': 'none', 'max-height': 'none', position: 'static', 'background-color': 'transparent', 'background-image': 'none', 'box-shadow': 'none', ...Object.fromEntries(SIDES.flatMap((s) => [[`margin-${s}`, '0'], [`padding-${s}`, '0'], [`border-${s}-style`, 'none']])), transform: 'none', opacity: '1', 'animation-name': 'none' };
  // The block a flex or grid container wraps its loose text in.
  function wrapAnon(textChild, parent) {
    const anon = new Box(null, { ...parent.cs, ...ANON }, parent);
    anon.anon = true;
    anon.children = [textChild];
    textChild.parent = anon;
    const i = parent.children.indexOf(textChild);
    if (i >= 0) parent.children[i] = anon;
    return anon;
  }

  // ---- Grid: explicit columns, auto rows, items in order.
  function gridColumns(box, w = 0) {
    const fs = box.cs.fontSize;
    const text = box.cs['grid-template-columns'];
    if (!text || text === 'none') return [{ kind: 'auto' }];
    const tracks = [];
    const add = (t) => {
      const mm = /^minmax\(([^,]+),(.+)\)$/.exec(t);
      if (mm) return add(mm[2].trim().endsWith('fr') ? mm[2].trim() : mm[1].trim());
      if (t.endsWith('fr')) tracks.push({ kind: 'fr', n: parseFloat(t) });
      else if (t === 'auto' || t === 'min-content' || t === 'max-content') tracks.push({ kind: 'auto' });
      else tracks.push({ kind: 'px', n: length(t, w, fs, 0) });
    };
    for (const t of splitTop(text, ' ')) {
      const r = /^repeat\(\s*(\d+)\s*,(.*)\)$/.exec(t);
      if (r) for (let i = 0; i < +r[1]; i++) for (const x of splitTop(r[2].trim(), ' ')) add(x);
      else add(t);
    }
    return tracks;
  }
  function layoutGrid(box, w, h) {
    const cs = box.cs;
    const e = box.e;
    const fs = cs.fontSize;
    for (const c of box.children) if (c.outOfFlow) { c.staticParent = box; c.staticX = e.bl + e.pl; c.staticY = e.bt + e.pt; }
    const colGap = length(cs['column-gap'], w, fs, 0);
    const rowGap = length(cs['row-gap'], h ?? 0, fs, 0);
    const tracks = gridColumns(box, w);
    const items = box.children.filter((c) => !c.outOfFlow && !(c.display === 'text' && !c.text.trim())).map((c) => (c.display === 'text' ? wrapAnon(c, box) : c));
    const n = tracks.length;
    // Place items: span from grid-column-end "span N" or "-1".
    const cells = [];
    let col = 0;
    let rowIndex = 0;
    for (const it of items) {
      const start = it.cs['grid-column-start'];
      const end = it.cs['grid-column-end'];
      let span = 1;
      const sm = /span\s+(\d+)/.exec(`${start} ${end}`);
      if (sm) span = +sm[1];
      if (end === '-1' && /^\d+$/.test(start)) { col = +start - 1; span = n - col; }
      else if (/^\d+$/.test(start)) col = +start - 1;
      span = Math.min(span, n);
      if (col + span > n) { col = 0; rowIndex++; }
      cells.push({ it, col, span, row: rowIndex });
      col += span;
      if (col >= n) { col = 0; rowIndex++; }
    }
    // Column widths: fixed, then auto from content, then fr share the rest.
    const widths = tracks.map((t) => (t.kind === 'px' ? t.n : 0));
    for (const c of cells) if (c.span === 1 && tracks[c.col].kind === 'auto') widths[c.col] = Math.max(widths[c.col], intrinsic(c.it)[1]);
    const frTotal = tracks.reduce((s, t) => s + (t.kind === 'fr' ? t.n : 0), 0);
    const rest = w - widths.reduce((s, x) => s + x, 0) - colGap * (n - 1);
    if (frTotal > 0) tracks.forEach((t, i) => { if (t.kind === 'fr') widths[i] = Math.max(0, (rest * t.n) / frTotal); });
    const colX = [];
    let x = e.bl + e.pl;
    for (let i = 0; i < n; i++) { colX.push(x); x += widths[i] + colGap; }
    // Rows from item heights.
    const rows = [];
    for (const c of cells) {
      const cw = widths.slice(c.col, c.col + c.span).reduce((s, v) => s + v, 0) + colGap * (c.span - 1);
      c.cw = cw;
      const ji = c.it.cs['justify-self'] === 'auto' ? cs['justify-items'] : c.it.cs['justify-self'];
      c.justify = ji;
      const stretch = !ji || ji === 'normal' || ji === 'stretch';
      c.it.shrink = !stretch;
      layoutBox(c.it, cw, null, cw, stretch && specSize(c.it, 'width', cw, edges(c.it, cw)) === null ? cw - edges(c.it, cw).ml - edges(c.it, cw).mr : null);
      rows[c.row] = Math.max(rows[c.row] ?? 0, c.it.h + c.it.e.mt + c.it.e.mb);
    }
    const rowY = [];
    let y = e.bt + e.pt;
    for (let r = 0; r < rows.length; r++) { rowY.push(y); y += rows[r] + rowGap; }
    const ai = cs['align-items'];
    for (const c of cells) {
      const it = c.it;
      const ji = c.justify;
      let dx = 0;
      if (ji === 'center') dx = (c.cw - it.w - it.e.ml - it.e.mr) / 2;
      else if (ji === 'end' || ji === 'flex-end' || ji === 'right') dx = c.cw - it.w - it.e.ml - it.e.mr;
      let dy = 0;
      if (ai === 'center') dy = (rows[c.row] - it.h - it.e.mt - it.e.mb) / 2;
      else if (ai === 'end' || ai === 'flex-end') dy = rows[c.row] - it.h - it.e.mt - it.e.mb;
      it.x = colX[c.col] + it.e.ml + dx;
      it.y = rowY[c.row] + it.e.mt + dy;
    }
    return rows.length ? y - rowGap - (e.bt + e.pt) : 0;
  }

  // ---- Absolutely positioned descendants, against this box's padding box.
  function layoutAbsolute(box) {
    const e = box.e;
    const cbW = box.w - e.bl - e.br;
    const cbH = box.h - e.bt - e.bb;
    for (const a of box.abs) {
      const cs = a.cs;
      const fs = cs.fontSize;
      const L = length(cs.left, cbW, fs, null);
      const R = length(cs.right, cbW, fs, null);
      const T = length(cs.top, cbH, fs, null);
      const B = length(cs.bottom, cbH, fs, null);
      const ae = edges(a, cbW);
      let width = null;
      if (L !== null && R !== null && specSize(a, 'width', cbW, ae) === null) width = cbW - L - R - ae.ml - ae.mr;
      a.shrink = width === null;
      let height = null;
      if (T !== null && B !== null && specSize(a, 'height', cbH, ae) === null) height = cbH - T - B - ae.mt - ae.mb;
      layoutBox(a, cbW, cbH, cbW - (L ?? 0) - (R ?? 0), width, height);
      const ml = ae.autoL && ae.autoR && L !== null && R !== null ? (cbW - L - R - a.w) / 2 : ae.ml;
      const mt = ae.autoT && ae.autoB && T !== null && B !== null ? (cbH - T - B - a.h) / 2 : ae.mt;
      a.staticAxisX = L === null && R === null;
      a.staticAxisY = T === null && B === null;
      a.x = e.bl + (L !== null ? L + ml : R !== null ? cbW - R - ae.mr - a.w : e.pl + ae.ml);
      a.y = e.bt + (T !== null ? T + mt : B !== null ? cbH - B - ae.mb - a.h : e.pt + ae.mt);
    }
  }

  // ---- Absolute coordinates (HUD space) for every box, relative offsets included.
  function place(box, ox, oy) {
    let x = ox + box.x;
    let y = oy + box.y;
    if (box.position === 'relative') {
      const fs = box.cs.fontSize;
      const pw = box.parent?.cw ?? 0;
      const ph = box.parent?.ch ?? 0;
      const L = length(box.cs.left, pw, fs, null);
      const T = length(box.cs.top, ph, fs, null);
      x += L !== null ? L : -length(box.cs.right, pw, fs, 0);
      y += T !== null ? T : -length(box.cs.bottom, ph, fs, 0);
    }
    box.ax = x;
    box.ay = y;
    for (const c of box.children) {
      if (c.display === 'text' || c.display === 'inline') continue;
      if (!c.outOfFlow) { place(c, x, y); continue; }
      // Out of flow: from the containing block, or where it would have been in flow.
      const o = positionedOrigin(c);
      const sp = c.staticParent ?? box;
      if (c.staticAxisX) c.x = (sp === box ? x : sp.ax) - o.x + (c.staticX ?? 0) + (c.e?.ml ?? 0);
      if (c.staticAxisY) c.y = (sp === box ? y : sp.ay) - o.y + (c.staticY ?? 0) + (c.e?.mt ?? 0);
      place(c, o.x, o.y);
    }
    for (const ln of box.lines ?? []) for (const d of ln.decor) markInline(d.box, x, y);
  }
  // Inline boxes have no position of their own; their atoms are placed from the block.
  const markInline = (b, x, y) => {
    b.ax = x; b.ay = y;
    for (const c of b.children) if (c.display !== 'text' && c.display !== 'inline') place(c, x, y);
  };
  function positionedOrigin(a) {
    let p = a.parent;
    while (p && !p.abs.includes(a)) p = p.parent;
    return p ? { x: p.ax, y: p.ay } : { x: 0, y: 0 };
  }

  // ---- Paint layers: one per box that is not inline text, in paint order.
  // Each holds its own decorations and the text of its lines, in HUD space.
  function paint(root) {
    const layers = [];
    const visit = (box, parentLayer) => {
      if (box.display === 'text' || box.display === 'inline') return;
      const cs = box.cs;
      const layer = {
        box, el: box.el, pseudo: box.pseudo, parent: parentLayer,
        x: box.ax, y: box.ay, w: box.w, h: box.h,
        opacity: +cs.opacity,
        transform: cs.transform,
        origin: cs['transform-origin'],
        clip: cs['overflow-x'] === 'hidden' || cs['overflow-y'] === 'hidden' || cs['overflow-x'] === 'clip',
        visible: cs.visibility !== 'hidden',
        cs,
      };
      layers.push(layer);
      const kids = box.children.filter((c) => c.display !== 'text' && c.display !== 'inline' || (c.display === 'inline' && hasAtoms(c)));
      const order = (c) => (c.positioned && c.cs['z-index'] !== 'auto' ? +c.cs['z-index'] : 0);
      const sorted = kids.map((c, i) => [c, i]).sort((a, b) => order(a[0]) - order(b[0]) || a[1] - b[1]).map(([c]) => c);
      for (const c of sorted) {
        if (c.display === 'inline') for (const k of atomsOf(c)) visit(k, layer);
        else visit(c, layer);
      }
    };
    visit(root, null);
    return layers;
  }
  const hasAtoms = (b) => b.children.some((c) => c.display !== 'text' && (c.display !== 'inline' || hasAtoms(c)));
  const atomsOf = (b) => b.children.flatMap((c) => (c.display === 'text' ? [] : c.display === 'inline' ? atomsOf(c) : [c]));

  // ---- Entry: computed styles, layout and layers for the subtree at `root`
  // laid out as a w x h viewport (the game's screen). `overrides` maps
  // elements to animated property values.
  function layout(rootEl, w, h, styler, fontProvider, overrides = new Map()) {
    fonts = fontProvider;
    g.__layoutGen = (g.__layoutGen ?? 0) + 1;
    g.__css.viewport.w = w;
    g.__css.viewport.h = h;
    let parentCs = null;
    // Ancestors' styles, for inheritance (their own layout does not matter).
    const chain = [];
    for (let p = rootEl.parentNode; p && p.localName; p = p.parentNode) chain.unshift(p);
    for (const p of chain) parentCs = styler.compute(p, parentCs);
    const root = build(rootEl, parentCs, null, styler, overrides, null);
    if (!root) return { root: null, layers: [] };
    layoutBox(root, w, h, w, w, h);
    root.x = 0;
    root.y = 0;
    place(root, 0, 0);
    return { root, layers: paint(root) };
  }

  // New styles for the boxes of the last layout. Returns false (and changes
  // nothing) when any box would move or resize, so a full layout is needed.
  function restyle(root, styler) {
    const updates = [];
    const walk = (box, parentCs) => {
      if (box.display === 'text') { updates.push([box, parentCs]); return true; }
      if (box.anon) {
        const cs = { ...parentCs, ...ANON };
        if (box.cs.font) cs.font = box.cs.font;
        updates.push([box, cs]);
        return box.children.every((c) => walk(c, cs));
      }
      if (!box.el || box.el.__box !== box && !box.pseudo) return false;
      const cs = box.pseudo ? styler.compute(box.el, parentCs, box.pseudo) : styler.compute(box.el, parentCs);
      if (cs.display === 'none' || !g.__css.sameLayout(cs, box.cs)) return false;
      updates.push([box, cs]);
      for (const c of box.children) if (!walk(c, c.pseudo ? parentCs : cs)) return false;
      return true;
    };
    let parentCs = null;
    const chain = [];
    for (let p = root.el.parentNode; p && p.localName; p = p.parentNode) chain.unshift(p);
    for (const p of chain) parentCs = styler.compute(p, parentCs);
    if (!walk(root, parentCs)) return false;
    for (const [box, cs] of updates) {
      if (box.display === 'text') { box.cs = cs; continue; }
      // Keep what layout derived and stored on the old style.
      if (box.cs.font && !cs.font) cs.font = box.cs.font;
      box.cs = cs;
    }
    return true;
  }

  g.__layout = { layout, restyle, parseColor, parseTransform };
})();
