// The 2D canvas, drawn in software into the canvas's RGBA pixels: what games
// use to paint textures and labels (rectangles, colors and gradients, paths,
// strokes, text). texImage2D uploads canvas.ctx2d.data. Text comes from the
// console's fonts through __ps5.text (app/text.c).
//
// Edges are antialiased with four sub-scanlines; shadows are a blurred copy
// of the shape. Not drawn (no-ops): images (drawImage), curves
// (quadratic/bezier) and composite modes other than source-over; no game
// uses them yet.

(() => {
  const g = globalThis;

  // ---- Colors: CSS strings to [r, g, b, a] with a in 0..1.
  const NAMED = {
    black: '#000', white: '#fff', red: '#f00', green: '#008000', lime: '#0f0', blue: '#00f',
    yellow: '#ff0', cyan: '#0ff', aqua: '#0ff', magenta: '#f0f', fuchsia: '#f0f', gray: '#808080',
    grey: '#808080', silver: '#c0c0c0', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb',
    gold: '#ffd700', navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000',
    brown: '#a52a2a', transparent: '#0000',
  };
  const colors = new Map();
  const hsl = (h, s, l) => {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  };
  function parseColor(text) {
    const key = String(text).trim().toLowerCase();
    let c = colors.get(key);
    if (c) return c;
    const s = NAMED[key] ?? key;
    let m;
    if ((m = /^#([0-9a-f]{3,8})$/.exec(s))) {
      let h = m[1];
      if (h.length <= 4) h = [...h].map((x) => x + x).join('');
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      c = [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    } else if ((m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s))) {
      const parts = m[2].split(/[\s,/]+/).filter(Boolean);
      const num = (v, scale) => (v.endsWith('%') ? (parseFloat(v) / 100) * scale : parseFloat(v));
      const alpha = parts[3] === undefined ? 1 : num(parts[3], 1);
      if (m[1].startsWith('rgb')) {
        c = [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), alpha];
      } else {
        c = [...hsl(parseFloat(parts[0]) % 360, num(parts[1], 1), num(parts[2], 1)), alpha];
      }
    } else {
      c = [0, 0, 0, 1];
    }
    c = c.map((v, i) => (i < 3 ? Math.max(0, Math.min(255, v)) : Math.max(0, Math.min(1, v))));
    colors.set(key, c);
    return c;
  }

  // ---- Gradients, evaluated in the user space the canvas had when filling.
  class CanvasGradient {
    constructor(kind, args) {
      this.kind = kind;
      this.args = args;
      this.stops = [];
      this.lut = null;
    }
    addColorStop(t, color) {
      this.stops.push([Math.max(0, Math.min(1, +t)), parseColor(color)]);
      this.stops.sort((a, b) => a[0] - b[0]);
      this.lut = null;
    }
    // 256 colors along the gradient, for t in 0..1.
    table() {
      if (this.lut) return this.lut;
      const lut = new Float32Array(256 * 4);
      const stops = this.stops;
      for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let k = 0;
        while (k < stops.length - 1 && stops[k + 1][0] < t) k++;
        const [t0, c0] = stops[k] ?? [0, [0, 0, 0, 0]];
        const [t1, c1] = stops[k + 1] ?? [t0, c0];
        const f = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : t >= t1 ? 1 : 0;
        for (let j = 0; j < 4; j++) lut[i * 4 + j] = c0[j] + (c1[j] - c0[j]) * f;
      }
      return (this.lut = lut);
    }
    // t for the user-space point (x, y), or NaN where a radial gradient is undefined.
    at(x, y) {
      const a = this.args;
      if (this.kind === 'linear') {
        const dx = a[2] - a[0];
        const dy = a[3] - a[1];
        const len = dx * dx + dy * dy;
        return len ? ((x - a[0]) * dx + (y - a[1]) * dy) / len : 0;
      }
      const [x0, y0, r0, x1, y1, r1] = a;
      const cdx = x1 - x0;
      const cdy = y1 - y0;
      const dr = r1 - r0;
      const px = x - x0;
      const py = y - y0;
      const qa = cdx * cdx + cdy * cdy - dr * dr;
      const qb = px * cdx + py * cdy + r0 * dr;
      const qc = px * px + py * py - r0 * r0;
      if (Math.abs(qa) < 1e-9) return qb ? qc / (2 * qb) : NaN;
      const disc = qb * qb - qa * qc;
      if (disc < 0) return NaN;
      const s = Math.sqrt(disc);
      const t1 = (qb + s) / qa;
      const t2 = (qb - s) / qa;
      const t = Math.max(t1, t2);
      if (r0 + t * dr >= 0) return t;
      const u = Math.min(t1, t2);
      return r0 + u * dr >= 0 ? u : NaN;
    }
  }

  const multiply = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const invert = (m) => {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
      (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
  };

  const FONT_STYLE = (font) => {
    const px = parseFloat(/([\d.]+)px/.exec(font)?.[1] ?? '10');
    const bold = /\bbold\b|\b[6-9]00\b/.test(font) ? 1 : 0;
    const italic = /\bitalic\b|\boblique\b/.test(font) ? 2 : 0;
    return { px, style: bold | italic };
  };

  const SUB = 4; // sub-scanlines per pixel row

  class CanvasRenderingContext2D {
    constructor(canvas) {
      this.canvas = canvas;
      this.resize();
    }

    // A new bitmap (transparent) and default state, as when the canvas is resized.
    resize() {
      const { width, height } = this.canvas;
      this.w = width;
      this.h = height;
      this.data = new Uint8ClampedArray(width * height * 4);
      this.cover = new Float32Array(width * height);
      this.state = {
        fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineCap: 'butt',
        lineJoin: 'miter', miterLimit: 10, font: '10px sans-serif', textAlign: 'start',
        textBaseline: 'alphabetic', globalAlpha: 1, globalCompositeOperation: 'source-over',
        shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)', shadowOffsetX: 0, shadowOffsetY: 0,
        m: [1, 0, 0, 1, 0, 0],
      };
      this.stack = [];
      this.beginPath();
    }

    save() { this.stack.push({ ...this.state, m: [...this.state.m] }); }
    restore() { if (this.stack.length) this.state = this.stack.pop(); }

    setTransform(a, b, c, d, e, f) {
      this.state.m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f];
    }
    resetTransform() { this.state.m = [1, 0, 0, 1, 0, 0]; }
    getTransform() { const [a, b, c, d, e, f] = this.state.m; return { a, b, c, d, e, f }; }
    transform(a, b, c, d, e, f) { this.state.m = multiply(this.state.m, [a, b, c, d, e, f]); }
    translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
    scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
    rotate(r) { const c = Math.cos(r); const s = Math.sin(r); this.transform(c, s, -s, c, 0, 0); }

    createLinearGradient(x0, y0, x1, y1) { return new CanvasGradient('linear', [x0, y0, x1, y1]); }
    createRadialGradient(x0, y0, r0, x1, y1, r1) { return new CanvasGradient('radial', [x0, y0, r0, x1, y1, r1]); }
    createPattern() { return null; }

    // ---- Paths, kept in device space (points are transformed as they are added).
    beginPath() { this.paths = []; this.current = null; }
    point(x, y) {
      const m = this.state.m;
      return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    }
    moveTo(x, y) { this.current = { points: [this.point(x, y)], closed: false }; this.paths.push(this.current); }
    lineTo(x, y) {
      if (!this.current) return this.moveTo(x, y);
      this.current.points.push(this.point(x, y));
    }
    closePath() {
      if (!this.current) return;
      this.current.closed = true;
      const [x, y] = this.current.points[0];
      this.current = { points: [[x, y]], closed: false, implicit: true };
      this.paths.push(this.current);
    }
    rect(x, y, w, h) {
      this.moveTo(x, y);
      this.lineTo(x + w, y);
      this.lineTo(x + w, y + h);
      this.lineTo(x, y + h);
      this.closePath();
    }
    arc(x, y, r, a0, a1, ccw = false) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
    ellipse(x, y, rx, ry, rotation, a0, a1, ccw = false) {
      let sweep = a1 - a0;
      const full = Math.PI * 2;
      if (!ccw && sweep >= full) sweep = full;
      else if (ccw && -sweep >= full) sweep = -full;
      else if (!ccw) sweep = ((sweep % full) + full) % full;
      else sweep = -(((-sweep % full) + full) % full);
      const m = this.state.m;
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      const n = Math.max(8, Math.ceil((Math.abs(sweep) * Math.max(rx, ry) * scale) / 2));
      const cr = Math.cos(rotation);
      const sr = Math.sin(rotation);
      for (let i = 0; i <= n; i++) {
        const a = a0 + (sweep * i) / n;
        const ex = Math.cos(a) * rx;
        const ey = Math.sin(a) * ry;
        const px = x + ex * cr - ey * sr;
        const py = y + ex * sr + ey * cr;
        if (i === 0 && !this.current) this.moveTo(px, py);
        else this.lineTo(px, py);
      }
    }

    // ---- Coverage: polygons (device space) added into this.cover.
    region() { return { x0: this.w, y0: this.h, x1: 0, y1: 0 }; }
    // Fills polygons with the nonzero rule, adding coverage (capped at 1).
    raster(polygons, box) {
      const edges = [];
      let top = Infinity;
      let bottom = -Infinity;
      for (const pts of polygons) {
        for (let i = 0; i < pts.length; i++) {
          const [ax, ay] = pts[i];
          const [bx, by] = pts[(i + 1) % pts.length];
          if (ay === by) continue;
          edges.push(ay < by ? [ax, ay, bx, by, 1] : [bx, by, ax, ay, -1]);
          top = Math.min(top, ay, by);
          bottom = Math.max(bottom, ay, by);
        }
      }
      if (!edges.length) return;
      const y0 = Math.max(0, Math.floor(top));
      const y1 = Math.min(this.h, Math.ceil(bottom));
      const w = this.w;
      const cover = this.cover;
      const xs = [];
      for (let y = y0; y < y1; y++) {
        for (let s = 0; s < SUB; s++) {
          const sy = y + (s + 0.5) / SUB;
          xs.length = 0;
          for (const [ax, ay, bx, by, dir] of edges) {
            if (sy < ay || sy >= by) continue;
            xs.push([ax + ((sy - ay) * (bx - ax)) / (by - ay), dir]);
          }
          if (xs.length < 2) continue;
          xs.sort((a, b) => a[0] - b[0]);
          let wind = 0;
          for (let i = 0; i < xs.length - 1; i++) {
            wind += xs[i][1];
            if (!wind) continue;
            const xa = Math.max(0, xs[i][0]);
            const xb = Math.min(w, xs[i + 1][0]);
            if (xb <= xa) continue;
            const ia = Math.floor(xa);
            const ib = Math.min(w - 1, Math.ceil(xb) - 1);
            const row = y * w;
            for (let x = ia; x <= ib; x++) {
              const c = (Math.min(xb, x + 1) - Math.max(xa, x)) / SUB;
              const k = row + x;
              cover[k] = Math.min(1, cover[k] + c);
            }
            if (ia < box.x0) box.x0 = ia;
            if (ib + 1 > box.x1) box.x1 = ib + 1;
          }
        }
        if (y < box.y0) box.y0 = y;
        if (y + 1 > box.y1) box.y1 = y + 1;
      }
    }

    // Paints the covered pixels with a style, then clears the coverage.
    composite(style, box) {
      const { data, cover, w } = this;
      const alpha = this.state.globalAlpha;
      if (this.state.shadowBlur > 0 || this.state.shadowOffsetX || this.state.shadowOffsetY) {
        const color = parseColor(this.state.shadowColor);
        if (color[3] > 0 && box.x1 > box.x0) this.shadow(box, color, alpha);
      }
      let solid = null;
      let grad = null;
      let inv = null;
      let lut = null;
      if (style instanceof CanvasGradient) {
        grad = style;
        lut = style.table();
        inv = invert(this.state.m);
      } else {
        solid = parseColor(style);
      }
      for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) {
          const k = y * w + x;
          const c = cover[k];
          if (c <= 0) continue;
          cover[k] = 0;
          let r, gg, b, a;
          if (solid) {
            [r, gg, b, a] = solid;
          } else {
            const px = x + 0.5;
            const py = y + 0.5;
            const t = grad.at(inv[0] * px + inv[2] * py + inv[4], inv[1] * px + inv[3] * py + inv[5]);
            if (Number.isNaN(t)) continue;
            const i = Math.round(Math.max(0, Math.min(1, t)) * 255) * 4;
            r = lut[i]; gg = lut[i + 1]; b = lut[i + 2]; a = lut[i + 3];
          }
          blend(data, k * 4, r, gg, b, a * c * alpha);
        }
      }
    }

    // The coverage, blurred (three box blurs approximate the Gaussian the
    // canvas uses, sigma = shadowBlur / 2), offset and painted in the shadow color.
    shadow(box, color, alpha) {
      const { w, h, cover, data } = this;
      const sigma = this.state.shadowBlur / 2;
      const pad = Math.ceil(sigma * 3);
      const ox = Math.round(this.state.shadowOffsetX);
      const oy = Math.round(this.state.shadowOffsetY);
      const x0 = box.x0 - pad;
      const y0 = box.y0 - pad;
      const bw = box.x1 - box.x0 + 2 * pad;
      const bh = box.y1 - box.y0 + 2 * pad;
      let buf = new Float32Array(bw * bh);
      for (let y = box.y0; y < box.y1; y++) {
        for (let x = box.x0; x < box.x1; x++) buf[(y - y0) * bw + (x - x0)] = cover[y * w + x];
      }
      const r = Math.round(sigma * 0.94);
      if (r > 0) {
        let tmp = new Float32Array(bw * bh);
        const pass = (src, dst, n, lines, step, lineStep) => {
          for (let l = 0; l < lines; l++) {
            const base = l * lineStep;
            let sum = 0;
            for (let i = -r; i <= r; i++) if (i >= 0 && i < n) sum += src[base + i * step];
            for (let i = 0; i < n; i++) {
              dst[base + i * step] = sum / (2 * r + 1);
              const add = i + r + 1;
              const sub = i - r;
              if (add < n) sum += src[base + add * step];
              if (sub >= 0) sum -= src[base + sub * step];
            }
          }
        };
        for (let k = 0; k < 3; k++) {
          pass(buf, tmp, bw, bh, 1, bw);
          pass(tmp, buf, bh, bw, bw, 1);
        }
      }
      for (let y = 0; y < bh; y++) {
        const dy = y + y0 + oy;
        if (dy < 0 || dy >= h) continue;
        for (let x = 0; x < bw; x++) {
          const dx = x + x0 + ox;
          const c = buf[y * bw + x];
          if (dx < 0 || dx >= w || c <= 0.002) continue;
          blend(data, (dy * w + dx) * 4, color[0], color[1], color[2], color[3] * c * alpha);
        }
      }
    }

    fill() {
      const box = this.region();
      this.raster(this.paths.filter((p) => p.points.length > 2).map((p) => p.points), box);
      this.composite(this.state.fillStyle, box);
    }

    stroke() {
      const box = this.region();
      const m = this.state.m;
      const half = (this.state.lineWidth * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))) / 2;
      for (const path of this.paths) this.strokePath(path, half, box);
      this.composite(this.state.strokeStyle, box);
    }

    // Each segment is a quad, joins and caps are polygons; all add coverage.
    strokePath(path, half, box) {
      const pts = path.points.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
      const closed = path.closed && pts.length > 2;
      const { lineCap, lineJoin, miterLimit } = this.state;
      const disc = (x, y) => {
        const n = Math.max(8, Math.ceil(half * 2));
        return Array.from({ length: n }, (_, i) => [x + Math.cos((i / n) * Math.PI * 2) * half, y + Math.sin((i / n) * Math.PI * 2) * half]);
      };
      if (pts.length === 1) {
        if (lineCap === 'round' && !path.implicit) this.raster([disc(...pts[0])], box);
        return;
      }
      const polys = [];
      const count = closed ? pts.length : pts.length - 1;
      const normals = [];
      for (let i = 0; i < count; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[(i + 1) % pts.length];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const nx = (-(by - ay) / len) * half;
        const ny = ((bx - ax) / len) * half;
        normals.push([nx, ny, (bx - ax) / len, (by - ay) / len]);
        let [sx, sy, ex, ey] = [ax, ay, bx, by];
        if (!closed && lineCap === 'square') {
          const dx = ((bx - ax) / len) * half;
          const dy = ((by - ay) / len) * half;
          if (i === 0) { sx -= dx; sy -= dy; }
          if (i === count - 1) { ex += dx; ey += dy; }
        }
        polys.push([[sx + nx, sy + ny], [ex + nx, ey + ny], [ex - nx, ey - ny], [sx - nx, sy - ny]]);
      }
      // Joins between consecutive segments.
      for (let i = closed ? 0 : 1; i < count; i++) {
        const prev = normals[(i - 1 + count) % count];
        const next = normals[i];
        const [x, y] = pts[i];
        if (lineJoin === 'round') {
          polys.push(disc(x, y));
          continue;
        }
        const turn = prev[2] * next[3] - prev[3] * next[2];
        const side = turn > 0 ? -1 : 1; // the outer side of the turn
        const p1 = [x + prev[0] * side, y + prev[1] * side];
        const p2 = [x + next[0] * side, y + next[1] * side];
        const cos = prev[2] * next[2] + prev[3] * next[3];
        const miter = 1 / Math.sqrt(Math.max(1e-6, (1 + cos) / 2));
        if (lineJoin === 'miter' && miter <= miterLimit) {
          // The tip lies along the outer bisector, miter * half from the vertex.
          const bx = p1[0] + p2[0] - 2 * x;
          const by = p1[1] + p2[1] - 2 * y;
          const bl = Math.hypot(bx, by) || 1;
          polys.push([[x, y], p1, [x + (bx / bl) * half * miter, y + (by / bl) * half * miter], p2]);
        } else {
          polys.push([[x, y], p1, p2]);
        }
      }
      if (!closed && lineCap === 'round') polys.push(disc(...pts[0]), disc(...pts[pts.length - 1]));
      for (const poly of polys) this.raster([poly], box);
    }

    fillRect(x, y, w, h) {
      const m = this.state.m;
      if (m[1] === 0 && m[2] === 0 && !(this.state.fillStyle instanceof CanvasGradient) && this.state.globalAlpha === 1) {
        const [r, gg, b, a] = parseColor(this.state.fillStyle);
        let x0 = m[0] * x + m[4];
        let x1 = m[0] * (x + w) + m[4];
        let y0 = m[3] * y + m[5];
        let y1 = m[3] * (y + h) + m[5];
        if (x1 < x0) [x0, x1] = [x1, x0];
        if (y1 < y0) [y0, y1] = [y1, y0];
        // Pixel-aligned and opaque: whole rows at once.
        if (a === 1 && Number.isInteger(x0) && Number.isInteger(x1) && Number.isInteger(y0) && Number.isInteger(y1)) {
          const cx0 = Math.max(0, x0);
          const cx1 = Math.min(this.w, x1);
          const cy0 = Math.max(0, y0);
          const cy1 = Math.min(this.h, y1);
          if (cx1 <= cx0 || cy1 <= cy0) return;
          const word = new Uint32Array(new Uint8Array([r, gg, b, 255]).buffer)[0];
          const px32 = new Uint32Array(this.data.buffer);
          for (let row = cy0; row < cy1; row++) px32.fill(word, row * this.w + cx0, row * this.w + cx1);
          return;
        }
      }
      const saved = this.paths;
      this.beginPath();
      this.rect(x, y, w, h);
      this.fill();
      this.paths = saved;
    }

    strokeRect(x, y, w, h) {
      const saved = this.paths;
      this.beginPath();
      this.rect(x, y, w, h);
      this.stroke();
      this.paths = saved;
    }

    clearRect(x, y, w, h) {
      const m = this.state.m;
      const xs = [x, x + w].map((v, i) => m[0] * v + m[2] * (i ? y + h : y) + m[4]);
      const ys = [y, y + h].map((v, i) => m[1] * (i ? x + w : x) + m[3] * v + m[5]);
      const x0 = Math.max(0, Math.round(Math.min(...xs)));
      const x1 = Math.min(this.w, Math.round(Math.max(...xs)));
      const y0 = Math.max(0, Math.round(Math.min(...ys)));
      const y1 = Math.min(this.h, Math.round(Math.max(...ys)));
      for (let row = y0; row < y1; row++) this.data.fill(0, (row * this.w + x0) * 4, (row * this.w + x1) * 4);
    }

    // ---- Text
    layout(text, render) {
      const { px, style } = FONT_STYLE(this.state.font);
      const m = this.state.m;
      const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      const run = g.__ps5?.text?.(String(text), px * scale, style, render) ?? null;
      return { run, scale, px };
    }
    measureText(text) {
      const { run, scale, px } = this.layout(text, false);
      const width = run ? run.advance / scale : String(text).length * px * 0.55;
      const ascent = run ? run.ascent / scale : px * 0.8;
      const descent = run ? run.descent / scale : px * 0.2;
      return { width, actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent, fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width };
    }
    fillText(text, x, y, maxWidth) { this.drawText(text, x, y, maxWidth, 0, this.state.fillStyle); }
    strokeText(text, x, y, maxWidth) { this.drawText(text, x, y, maxWidth, this.state.lineWidth / 2, this.state.strokeStyle); }

    // The text's coverage mask, grown by `grow` user units for strokes, mapped
    // through the transform into the coverage buffer, then painted.
    drawText(text, x, y, maxWidth, grow, style) {
      const { run, scale } = this.layout(text, true);
      if (!run || !run.mask) return;
      let { mask, w: mw, h: mh, left, top } = run;
      const r = Math.ceil(grow * scale);
      if (r > 0) {
        const out = new Uint8Array((mw + 2 * r) * (mh + 2 * r));
        const ow = mw + 2 * r;
        for (let my = 0; my < mh; my++) {
          for (let mx = 0; mx < mw; mx++) {
            const v = mask[my * mw + mx];
            if (!v) continue;
            for (let dy = -r; dy <= r; dy++) {
              for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r + r) continue;
                const k = (my + r + dy) * ow + mx + r + dx;
                if (v > out[k]) out[k] = v;
              }
            }
          }
        }
        mask = out;
        mw = ow;
        mh += 2 * r;
        left -= r;
        top -= r;
      }
      const width = run.advance / scale;
      const squeeze = maxWidth !== undefined && width > maxWidth ? maxWidth / width : 1;
      const align = this.state.textAlign;
      const ax = align === 'center' ? -width / 2 : align === 'right' || align === 'end' ? -width : 0;
      const asc = run.ascent / scale;
      const desc = run.descent / scale;
      const base = this.state.textBaseline;
      const ay = base === 'top' ? asc : base === 'hanging' ? asc * 0.8 : base === 'middle' ? (asc - desc) / 2 : base === 'bottom' || base === 'ideographic' ? -desc : 0;
      // mask pixel -> user space -> device
      const toUser = [squeeze / scale, 0, 0, 1 / scale, x + ax * squeeze + (left / scale) * squeeze, y + ay + top / scale];
      const t = multiply(this.state.m, toUser);
      const inv = invert(t);
      const corners = [[0, 0], [mw, 0], [0, mh], [mw, mh]].map(([u, v]) => [t[0] * u + t[2] * v + t[4], t[1] * u + t[3] * v + t[5]]);
      const box = {
        x0: Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])))),
        x1: Math.min(this.w, Math.ceil(Math.max(...corners.map((c) => c[0])))),
        y0: Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1])))),
        y1: Math.min(this.h, Math.ceil(Math.max(...corners.map((c) => c[1])))),
      };
      const cover = this.cover;
      for (let dy = box.y0; dy < box.y1; dy++) {
        for (let dx = box.x0; dx < box.x1; dx++) {
          const u = inv[0] * (dx + 0.5) + inv[2] * (dy + 0.5) + inv[4] - 0.5;
          const v = inv[1] * (dx + 0.5) + inv[3] * (dy + 0.5) + inv[5] - 0.5;
          const u0 = Math.floor(u);
          const v0 = Math.floor(v);
          if (u0 < -1 || v0 < -1 || u0 >= mw || v0 >= mh) continue;
          const fu = u - u0;
          const fv = v - v0;
          const at = (uu, vv) => (uu < 0 || vv < 0 || uu >= mw || vv >= mh ? 0 : mask[vv * mw + uu]);
          const a = (at(u0, v0) * (1 - fu) + at(u0 + 1, v0) * fu) * (1 - fv) + (at(u0, v0 + 1) * (1 - fu) + at(u0 + 1, v0 + 1) * fu) * fv;
          if (a > 0) cover[dy * this.w + dx] = Math.min(1, cover[dy * this.w + dx] + a / 255);
        }
      }
      this.composite(style, box);
    }

    // ---- Pixels
    createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
    getImageData(x, y, w, h) {
      const img = this.createImageData(w, h);
      for (let row = 0; row < h; row++) {
        const sy = y + row;
        if (sy < 0 || sy >= this.h) continue;
        for (let col = 0; col < w; col++) {
          const sx = x + col;
          if (sx < 0 || sx >= this.w) continue;
          img.data.set(this.data.subarray((sy * this.w + sx) * 4, (sy * this.w + sx) * 4 + 4), (row * w + col) * 4);
        }
      }
      return img;
    }
    putImageData(img, x, y) {
      for (let row = 0; row < img.height; row++) {
        const dy = y + row;
        if (dy < 0 || dy >= this.h) continue;
        for (let col = 0; col < img.width; col++) {
          const dx = x + col;
          if (dx < 0 || dx >= this.w) continue;
          this.data.set(img.data.subarray((row * img.width + col) * 4, (row * img.width + col) * 4 + 4), (dy * this.w + dx) * 4);
        }
      }
    }
    drawImage() {}
    setLineDash() {}
    getLineDash() { return []; }
  }

  // Source-over with straight alpha.
  function blend(data, i, r, g, b, a) {
    if (a <= 0) return;
    if (a >= 1) {
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      return;
    }
    const da = data[i + 3] / 255;
    const oa = a + da * (1 - a);
    const k = (1 - a) * da;
    data[i] = (r * a + data[i] * k) / oa;
    data[i + 1] = (g * a + data[i + 1] * k) / oa;
    data[i + 2] = (b * a + data[i + 2] * k) / oa;
    data[i + 3] = oa * 255;
  }

  // Forward every state property to `state`, so save/restore covers them.
  for (const key of ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'font', 'textAlign', 'textBaseline', 'globalAlpha', 'globalCompositeOperation', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY']) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, key, {
      get() { return this.state[key]; },
      set(v) { this.state[key] = v; },
    });
  }

  g.CanvasRenderingContext2D = CanvasRenderingContext2D;
  g.CanvasGradient = CanvasGradient;
})();
