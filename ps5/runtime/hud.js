// Draws a game's HTML HUD with WebGL 2: lays the document out with css.js
// and layout.js when it changes, keeps one vertex range per layer (an
// element's box, borders, shadows, text and pictures, in HUD space), and each
// frame draws the layers with their CSS transform, opacity and clip. Animated
// transform and opacity never re-lay out; animated colors rebuild the layer.
//
// Boxes and box shadows are signed-distance rounded rectangles in the shader;
// text comes from a signed-distance glyph atlas, so it stays sharp at any
// scale and draws outlines and soft shadows from the same glyphs. Gradients,
// SVG and 2D canvases become textures.
//
// globalThis.__hud.create({ gl, fonts, makeImage, root, css, width, height })
//   fonts: face(cs), advance(cp, face), metrics(face),
//          glyph(cp, face) -> { w, h, xoff, yoff, base, pad, data } (SDF)
//   makeImage(w, h, draw(ctx)) -> { w, h, data } RGBA
// returns { frame(now, rect) } where rect is the HUD's place on the
// drawing buffer in pixels { x, y, w, h } (y from the bottom, as GL).

(() => {
  const g = globalThis;
  const { parseColor, splitTop, length, parseTransform, Styler, Animator } = g.__css;
  const { layout, restyle } = g.__layout;

  const VERT = `#version 300 es
in vec2 a_pos; in vec2 a_local; in vec2 a_half; in vec4 a_radius; in vec4 a_fill; in vec4 a_stroke; in vec4 a_params; in vec2 a_uv;
uniform mat3 u_m;
out vec2 v_local; out vec2 v_half; out vec4 v_radius; out vec4 v_fill; out vec4 v_stroke; out vec4 v_params; out vec2 v_uv;
void main() {
  v_local = a_local; v_half = a_half; v_radius = a_radius; v_fill = a_fill; v_stroke = a_stroke; v_params = a_params; v_uv = a_uv;
  vec3 p = u_m * vec3(a_pos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
}`;
  const FRAG = `#version 300 es
precision highp float;
in vec2 v_local; in vec2 v_half; in vec4 v_radius; in vec4 v_fill; in vec4 v_stroke; in vec4 v_params; in vec2 v_uv;
uniform sampler2D u_atlas; uniform sampler2D u_image; uniform float u_opacity; uniform vec4 u_clip;
out vec4 o;
float box(vec2 p, vec2 b, vec4 r) {
  float rad = p.x > 0.0 ? (p.y > 0.0 ? r.z : r.y) : (p.y > 0.0 ? r.w : r.x);
  rad = min(rad, min(b.x, b.y));
  vec2 q = abs(p) - b + rad;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
}
void main() {
  if (gl_FragCoord.x < u_clip.x || gl_FragCoord.x > u_clip.z || gl_FragCoord.y < u_clip.y || gl_FragCoord.y > u_clip.w) discard;
  float mode = v_params.z;
  vec4 c;
  if (mode < 0.5) {
    float d = box(v_local, v_half, v_radius);
    float fw = max(fwidth(d), 1e-4);
    float cov = clamp(0.5 - d / fw, 0.0, 1.0);
    vec4 col = v_fill;
    if (v_params.x > 0.0) {
      float inner = clamp(0.5 - (d + v_params.x) / fw, 0.0, 1.0);
      col = mix(v_stroke, v_fill, inner);
    }
    c = vec4(col.rgb, col.a * cov);
  } else if (mode < 1.5) {
    float d = box(v_local, v_half, v_radius);
    float s = max(v_params.y, fwidth(d));
    c = vec4(v_fill.rgb, v_fill.a * (1.0 - smoothstep(-s, s, d)));
  } else if (mode < 2.5) {
    float dist = texture(u_atlas, v_uv).r;
    float s = max(fwidth(dist) * 0.75, v_params.y);
    c = vec4(v_fill.rgb, v_fill.a * smoothstep(v_params.w - s, v_params.w + s, dist));
  } else {
    vec4 t = texture(u_image, v_uv);
    float d = box(v_local, v_half, v_radius);
    float cov = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
    c = vec4(t.rgb, t.a * cov * v_fill.a);
  }
  float a = c.a * u_opacity;
  o = vec4(c.rgb * a, a);
}`;
  const FLOATS = 24; // per vertex
  const ATLAS = 2048;
  const BOX = 0;
  const SHADOW = 1;
  const GLYPH = 2;
  const IMAGE = 3;

  const rgba = (text) => {
    const c = parseColor(text);
    return c ? [c[0] / 255, c[1] / 255, c[2] / 255, c[3]] : null;
  };

  // "x y blur spread color" lists (box-shadow, text-shadow, drop-shadow()).
  function parseShadows(text, fs) {
    if (!text || text === 'none') return [];
    return splitTop(text, ',').map((one) => {
      const lengths = [];
      let color = 'currentcolor';
      let inset = false;
      for (const t of splitTop(one, ' ')) {
        if (t === 'inset') inset = true;
        else if (/^-?[\d.]/.test(t)) lengths.push(length(t, 0, fs, 0));
        else color = t;
      }
      return { x: lengths[0] ?? 0, y: lengths[1] ?? 0, blur: lengths[2] ?? 0, spread: lengths[3] ?? 0, color, inset };
    });
  }

  // 2D affine [a b c d e f] maps (x, y) to (a x + c y + e, b x + d y + f).
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const ID = [1, 0, 0, 1, 0, 0];
  function cssMatrix(text, w, h, fs) {
    let m = ID;
    for (const [name, args] of parseTransform(text)) {
      const px = (a, basis) => (a.u === '%' ? (a.v / 100) * basis : a.u === 'em' ? a.v * fs : a.v);
      const deg = (a) => (a.u === 'rad' ? a.v : a.u === 'turn' ? a.v * Math.PI * 2 : a.u === 'grad' ? (a.v * Math.PI) / 200 : (a.v * Math.PI) / 180);
      const f = name.toLowerCase();
      let n = ID;
      if (f === 'translate' || f === 'translate3d') n = [1, 0, 0, 1, px(args[0] ?? { v: 0 }, w), px(args[1] ?? { v: 0 }, h)];
      else if (f === 'translatex') n = [1, 0, 0, 1, px(args[0], w), 0];
      else if (f === 'translatey') n = [1, 0, 0, 1, 0, px(args[0], h)];
      else if (f === 'scale' || f === 'scale3d') n = [args[0].v, 0, 0, (args[1] ?? args[0]).v, 0, 0];
      else if (f === 'scalex') n = [args[0].v, 0, 0, 1, 0, 0];
      else if (f === 'scaley') n = [1, 0, 0, args[0].v, 0, 0];
      else if (f === 'rotate' || f === 'rotatez') { const r = deg(args[0]); n = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]; }
      else if (f === 'skewx') n = [1, 0, Math.tan(deg(args[0])), 1, 0, 0];
      else if (f === 'skewy') n = [1, Math.tan(deg(args[0])), 0, 1, 0, 0];
      else if (f === 'skew') n = [1, Math.tan(deg(args[1] ?? { v: 0 })), Math.tan(deg(args[0])), 1, 0, 0];
      else if (f === 'matrix') n = args.map((a) => a.v);
      m = mul(m, n);
    }
    return m;
  }
  function originOf(text, w, h, fs) {
    const parts = splitTop(text ?? '50% 50%', ' ');
    const word = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
    let [x, y] = parts;
    if (x === 'top' || x === 'bottom') [x, y] = [y ?? 'center', x];
    return [length(word[x] ?? x ?? '50%', w, fs, w / 2), length(word[y] ?? y ?? '50%', h, fs, h / 2)];
  }

  function create({ gl, fonts, makeImage, loadImage, root, css, width, height, gameCanvas = null }) {
    const styler = new Styler(css);
    const animator = new Animator(styler.keyframes);
    const C = gl;

    // ---- GL objects
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, C.COMPILE_STATUS)) throw new Error(`HUD shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(C.VERTEX_SHADER, VERT));
    gl.attachShader(program, shader(C.FRAGMENT_SHADER, FRAG));
    const ATTRS = [['a_pos', 2], ['a_local', 2], ['a_half', 2], ['a_radius', 4], ['a_fill', 4], ['a_stroke', 4], ['a_params', 4], ['a_uv', 2]];
    ATTRS.forEach(([name], i) => gl.bindAttribLocation(program, i, name));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, C.LINK_STATUS)) throw new Error(`HUD program: ${gl.getProgramInfoLog(program)}`);
    const loc = (n) => gl.getUniformLocation(program, n);
    const U = { m: loc('u_m'), opacity: loc('u_opacity'), clip: loc('u_clip'), atlas: loc('u_atlas'), image: loc('u_image') };
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(C.ARRAY_BUFFER, vbo);
    let offset = 0;
    ATTRS.forEach(([, n], i) => {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, n, C.FLOAT, false, FLOATS * 4, offset);
      offset += n * 4;
    });
    const QUADS = 16384;
    const indices = new Uint16Array(QUADS * 6);
    for (let q = 0; q < QUADS; q++) indices.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);
    gl.bindBuffer(C.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(C.ELEMENT_ARRAY_BUFFER, indices, C.STATIC_DRAW);
    gl.bindVertexArray(null);

    const atlasTex = gl.createTexture();
    gl.activeTexture(C.TEXTURE0);
    gl.bindTexture(C.TEXTURE_2D, atlasTex);
    gl.texImage2D(C.TEXTURE_2D, 0, C.R8, ATLAS, ATLAS, 0, C.RED, C.UNSIGNED_BYTE, null);
    for (const [p, v] of [[C.TEXTURE_MIN_FILTER, C.LINEAR], [C.TEXTURE_MAG_FILTER, C.LINEAR], [C.TEXTURE_WRAP_S, C.CLAMP_TO_EDGE], [C.TEXTURE_WRAP_T, C.CLAMP_TO_EDGE]]) gl.texParameteri(C.TEXTURE_2D, p, v);

    // ---- Glyph atlas (shelves)
    const glyphs = new Map();
    let shelfX = 1;
    let shelfY = 1;
    let shelfH = 0;
    function glyph(cp, face) {
      const key = `${face}|${cp}`;
      let e = glyphs.get(key);
      if (e) return e;
      const tg = g.__now ? g.__now() : 0;
      const gd = fonts.glyph(cp, face);
      stats.glyphs++;
      stats.glyphMs += (g.__now ? g.__now() : 0) - tg;
      if (!gd || !gd.w || !gd.h) {
        glyphs.set(key, (e = { empty: true, base: gd?.base ?? 48, pad: gd?.pad ?? 6 }));
        return e;
      }
      if (shelfX + gd.w + 1 > ATLAS) { shelfX = 1; shelfY += shelfH + 1; shelfH = 0; }
      if (shelfY + gd.h + 1 > ATLAS) { glyphs.clear(); shelfX = 1; shelfY = 1; shelfH = 0; } // shortcut: a full atlas starts over
      e = { x: shelfX, y: shelfY, w: gd.w, h: gd.h, xoff: gd.xoff, yoff: gd.yoff, base: gd.base, pad: gd.pad };
      gl.activeTexture(C.TEXTURE0);
      gl.bindTexture(C.TEXTURE_2D, atlasTex);
      gl.pixelStorei(C.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(C.UNPACK_FLIP_Y_WEBGL, false);
      gl.texSubImage2D(C.TEXTURE_2D, 0, e.x, e.y, e.w, e.h, C.RED, C.UNSIGNED_BYTE, gd.data);
      shelfX += gd.w + 1;
      shelfH = Math.max(shelfH, gd.h);
      glyphs.set(key, e);
      return e;
    }

    // ---- Image textures (gradients, SVG, 2D canvases), cached by content key.
    const images = new Map();
    function image(key, w, h, draw) {
      let im = images.get(key);
      if (im) { im.used = true; return im; }
      const pw = Math.max(1, Math.min(2048, Math.ceil(w)));
      const ph = Math.max(1, Math.min(2048, Math.ceil(h)));
      const src = makeImage(pw, ph, draw);
      const tex = gl.createTexture();
      gl.activeTexture(C.TEXTURE1);
      gl.bindTexture(C.TEXTURE_2D, tex);
      gl.pixelStorei(C.UNPACK_ALIGNMENT, 4);
      gl.pixelStorei(C.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(C.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(C.TEXTURE_2D, 0, C.RGBA8, src.w, src.h, 0, C.RGBA, C.UNSIGNED_BYTE, src.data);
      for (const [p, v] of [[C.TEXTURE_MIN_FILTER, C.LINEAR], [C.TEXTURE_MAG_FILTER, C.LINEAR], [C.TEXTURE_WRAP_S, C.CLAMP_TO_EDGE], [C.TEXTURE_WRAP_T, C.CLAMP_TO_EDGE]]) gl.texParameteri(C.TEXTURE_2D, p, v);
      images.set(key, (im = { tex, used: true }));
      return im;
    }

    // ---- Geometry building
    let verts = new Float32Array(FLOATS * 4 * 1024);
    let count = 0; // vertices
    const grow = () => { const n = new Float32Array(verts.length * 2); n.set(verts); verts = n; };
    // A quad covering (x, y, w, h) in HUD space; the SDF shape is centered in
    // the rectangle (sx, sy, sw, sh).
    function quad(x, y, w, h, shape, radius, fill, stroke, params, uv) {
      if (count + 4 > QUADS * 4) return;
      while ((count + 4) * FLOATS > verts.length) grow();
      const cx = shape[0] + shape[2] / 2;
      const cy = shape[1] + shape[3] / 2;
      const corners = [[x, y, 0, 0], [x + w, y, 1, 0], [x + w, y + h, 1, 1], [x, y + h, 0, 1]];
      for (const [px, py, u, v] of corners) {
        const o = count * FLOATS;
        verts[o] = px; verts[o + 1] = py;
        verts[o + 2] = px - cx; verts[o + 3] = py - cy;
        verts[o + 4] = shape[2] / 2; verts[o + 5] = shape[3] / 2;
        verts.set(radius, o + 6);
        verts.set(fill, o + 10);
        verts.set(stroke, o + 14);
        verts.set(params, o + 18);
        verts[o + 22] = uv ? uv[0] + (uv[2] - uv[0]) * u : 0;
        verts[o + 23] = uv ? uv[1] + (uv[3] - uv[1]) * v : 0;
        count++;
      }
    }
    const NONE = [0, 0, 0, 0];

    const radiiOf = (cs, w, h) => ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => length(splitTop(cs[`border-${c}-radius`], ' ')[0], Math.min(w, h), cs.fontSize, 0));

    // The decorations of a box (or an inline box fragment) at (x, y, w, h).
    function decorate(cs, x, y, w, h, e, ov) {
      const radius = radiiOf(cs, w, h);
      const shadows = parseShadows(ov['box-shadow'] ?? cs['box-shadow'], cs.fontSize).reverse();
      for (const s of shadows) {
        if (s.inset) continue;
        const color = rgba(s.color === 'currentcolor' ? cs.color : s.color);
        if (!color || !color[3]) continue;
        const sx = x + s.x - s.spread;
        const sy = y + s.y - s.spread;
        const sw = w + 2 * s.spread;
        const sh = h + 2 * s.spread;
        const pad = s.blur;
        const r = radius.map((v) => (v > 0 ? v + s.spread : 0));
        quad(sx - pad, sy - pad, sw + 2 * pad, sh + 2 * pad, [sx, sy, sw, sh], r, color, NONE, [0, s.blur / 2, s.blur > 0 ? SHADOW : BOX, 0]);
      }
      const bg = rgba(cs['background-color']) ?? NONE;
      const widths = [e.bt, e.br, e.bb, e.bl];
      const colors = ['top', 'right', 'bottom', 'left'].map((s) => rgba(cs[`border-${s}-color`]) ?? NONE);
      const uniform = widths.every((v) => v === widths[0]) && colors.every((c) => c.join() === colors[0].join());
      const bgImage = cs['background-image'] !== 'none' ? cs['background-image'] : null;
      const url = bgImage && /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(bgImage);
      const image0 = bgImage && /gradient\(/.test(bgImage) ? bgImage : null;
      if (url) {
        // A picture, sized and placed by background-size and -position.
        if (bg[3] > 0 || (uniform && widths[0] > 0)) quad(x, y, w, h, [x, y, w, h], radius, bg, colors[0], [uniform ? widths[0] : 0, 0, BOX, 0]);
        const pic = picture(url[1]);
        if (pic) {
          const [px, py, pw, ph] = placePicture(cs, pic, x, y, w, h);
          quad(px, py, pw, ph, [x, y, w, h], radius, [1, 1, 1, 1], NONE, [0, 0, IMAGE, 0], [0, 0, 1, 1]);
          layerImage = pic.tex;
        }
      } else if (image0) {
        const im = image(`${image0}|${Math.round(w)}x${Math.round(h)}`, w * scale, h * scale, (ctx) => paintGradients(ctx, image0, w * scale, h * scale, cs, bg));
        quad(x, y, w, h, [x, y, w, h], radius, [1, 1, 1, 1], NONE, [0, 0, IMAGE, 0], [0, 0, 1, 1]);
        layerImage = im.tex;
        if (uniform && widths[0] > 0 && colors[0][3] > 0) quad(x, y, w, h, [x, y, w, h], radius, NONE, colors[0], [widths[0], 0, BOX, 0]);
      } else if (uniform) {
        if (bg[3] > 0 || (widths[0] > 0 && colors[0][3] > 0)) quad(x, y, w, h, [x, y, w, h], radius, bg, colors[0], [widths[0], 0, BOX, 0]);
      } else {
        if (bg[3] > 0) quad(x, y, w, h, [x, y, w, h], radius, bg, NONE, [0, 0, BOX, 0]);
        const sides = [[x, y, w, widths[0]], [x + w - widths[1], y, widths[1], h], [x, y + h - widths[2], w, widths[2]], [x, y, widths[3], h]];
        sides.forEach((r, i) => { if (widths[i] > 0 && colors[i][3] > 0) quad(...r, r, [0, 0, 0, 0], colors[i], NONE, [0, 0, BOX, 0]); });
      }
      // Inset shadows: a ring inside the padding box, as wide as spread plus offset
      // (shortcut: no blur inside, no offset direction).
      for (const s of shadows) {
        if (!s.inset) continue;
        const color = rgba(s.color === 'currentcolor' ? cs.color : s.color);
        const ring = s.spread + Math.max(Math.abs(s.x), Math.abs(s.y)) + s.blur / 2;
        if (!color || !color[3] || ring <= 0) continue;
        const ix = x + e.bl;
        const iy = y + e.bt;
        const iw = w - e.bl - e.br;
        const ih = h - e.bt - e.bb;
        quad(ix, iy, iw, ih, [ix, iy, iw, ih], radius.map((r) => Math.max(0, r - e.bl)), NONE, color, [ring, 0, BOX, 0]);
      }
    }
    let layerImage = null;
    let scale = 1; // drawing-buffer pixels per HUD pixel, for texture sizes

    // Pictures by URL (covers): decoded once by the host and kept.
    const pictures = new Map();
    function picture(src) {
      if (pictures.has(src)) return pictures.get(src);
      const img = loadImage?.(src) ?? null;
      let pic = null;
      if (img) {
        const tex = gl.createTexture();
        gl.activeTexture(C.TEXTURE1);
        gl.bindTexture(C.TEXTURE_2D, tex);
        gl.pixelStorei(C.UNPACK_ALIGNMENT, 4);
        gl.pixelStorei(C.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(C.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(C.TEXTURE_2D, 0, C.RGBA8, img.w, img.h, 0, C.RGBA, C.UNSIGNED_BYTE, img.data);
        for (const [p, v] of [[C.TEXTURE_MIN_FILTER, C.LINEAR], [C.TEXTURE_MAG_FILTER, C.LINEAR], [C.TEXTURE_WRAP_S, C.CLAMP_TO_EDGE], [C.TEXTURE_WRAP_T, C.CLAMP_TO_EDGE]]) gl.texParameteri(C.TEXTURE_2D, p, v);
        pic = { tex, w: img.w, h: img.h };
      }
      pictures.set(src, pic);
      return pic;
    }
    function placePicture(cs, pic, x, y, w, h) {
      const size = splitTop(cs['background-size'] ?? 'auto', ' ');
      let pw = pic.w;
      let ph = pic.h;
      if (size[0] === 'cover' || size[0] === 'contain') {
        const k = (size[0] === 'cover' ? Math.max : Math.min)(w / pic.w, h / pic.h);
        pw = pic.w * k;
        ph = pic.h * k;
      } else if (size[0] !== 'auto') {
        pw = length(size[0], w, cs.fontSize, pic.w);
        ph = size[1] && size[1] !== 'auto' ? length(size[1], h, cs.fontSize, pic.h) : (pw * pic.h) / pic.w;
      }
      const pos = splitTop(cs['background-position'] ?? '0% 0%', ' ');
      const word = { left: '0%', top: '0%', center: '50%', right: '100%', bottom: '100%' };
      let [px, py] = pos;
      if (px === 'top' || px === 'bottom') [px, py] = [py ?? 'center', px];
      const at = (v, free) => { const t = word[v] ?? v ?? '50%'; return t.endsWith('%') ? (parseFloat(t) / 100) * free : length(t, free, cs.fontSize, 0); };
      return [x + at(px, w - pw), y + at(py ?? 'center', h - ph), pw, ph];
    }

    function paintGradients(ctx, text, w, h, cs, bg) {
      if (bg[3] > 0) { ctx.fillStyle = `rgba(${bg[0] * 255},${bg[1] * 255},${bg[2] * 255},${bg[3]})`; ctx.fillRect(0, 0, w, h); }
      for (const layer of splitTop(text, ',').reverse()) {
        const m = /^(repeating-)?(linear|radial)-gradient\((.*)\)$/s.exec(layer.trim());
        if (!m) continue;
        const args = splitTop(m[3], ',');
        let grad;
        if (m[2] === 'linear') {
          let angle = Math.PI; // to bottom
          if (/deg|turn|rad/.test(args[0]) || /^to /.test(args[0])) {
            const a = args.shift();
            const sides = { 'to top': 0, 'to right': 90, 'to bottom': 180, 'to left': 270, 'to top right': 45, 'to bottom right': 135, 'to bottom left': 225, 'to top left': 315 };
            angle = a in sides ? (sides[a] * Math.PI) / 180 : a.endsWith('turn') ? parseFloat(a) * Math.PI * 2 : a.endsWith('rad') ? parseFloat(a) : (parseFloat(a) * Math.PI) / 180;
          }
          const dx = Math.sin(angle);
          const dy = -Math.cos(angle);
          const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
          grad = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half);
        } else {
          let cx = w / 2;
          let cy = h / 2;
          let r = Math.hypot(w, h) / 2;
          const first = args[0];
          if (/circle|ellipse|closest|farthest|^at /.test(first)) {
            args.shift();
            const at = /at\s+(\S+)(?:\s+(\S+))?/.exec(first);
            if (at) {
              const word = { left: '0%', center: '50%', right: '100%', top: '0%', bottom: '100%' };
              cx = length(word[at[1]] ?? at[1], w, cs.fontSize, w / 2);
              cy = length(word[at[2] ?? 'center'] ?? at[2], h, cs.fontSize, h / 2);
            }
            r = /closest-side/.test(first) ? Math.min(cx, cy, w - cx, h - cy) : Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
            const size = /circle\s+([\d.]+px)/.exec(first);
            if (size) r = parseFloat(size[1]) * scale;
          }
          grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        }
        const stops = args.map((a) => {
          const parts = splitTop(a, ' ');
          const pos = parts.slice(1).map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : null));
          return { color: parts[0], pos: pos[0] ?? null };
        });
        stops.forEach((s, i) => { if (s.pos === null) s.pos = i === 0 ? 0 : i === stops.length - 1 ? 1 : null; });
        for (let i = 1; i < stops.length - 1; i++) {
          if (stops[i].pos !== null) continue;
          let j = i;
          while (stops[j].pos === null) j++;
          const a = stops[i - 1].pos;
          for (let k = i; k < j; k++) stops[k].pos = a + ((stops[j].pos - a) * (k - i + 1)) / (j - i + 1);
        }
        for (const s of stops) grad.addColorStop(Math.max(0, Math.min(1, s.pos)), s.color);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // SVG children drawn with a 2D context (paths with M L H V C Q Z, rects, circles, lines).
    function paintSvg(ctx, svg, w, h) {
      const vb = (svg.getAttribute('viewBox') ?? `0 0 ${w / scale} ${h / scale}`).split(/[\s,]+/).map(Number);
      ctx.setTransform(w / vb[2], 0, 0, h / vb[3], (-vb[0] * w) / vb[2], (-vb[1] * h) / vb[3]);
      const walk = (el, inherited) => {
        for (const c of el.children) {
          const at = (n, d) => c.getAttribute(n) ?? inherited[n] ?? d;
          const style = { fill: at('fill', '#000'), stroke: at('stroke', 'none'), 'stroke-width': at('stroke-width', '1'), 'stroke-linecap': at('stroke-linecap', 'butt'), 'stroke-linejoin': at('stroke-linejoin', 'miter'), opacity: at('opacity', '1') };
          if (c.localName === 'g') { walk(c, style); continue; }
          ctx.beginPath();
          const n = (k) => parseFloat(c.getAttribute(k) ?? '0');
          if (c.localName === 'path') svgPath(ctx, c.getAttribute('d') ?? '');
          else if (c.localName === 'rect') ctx.rect(n('x'), n('y'), n('width'), n('height'));
          else if (c.localName === 'circle') ctx.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
          else if (c.localName === 'ellipse') ctx.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
          else if (c.localName === 'line') { ctx.moveTo(n('x1'), n('y1')); ctx.lineTo(n('x2'), n('y2')); }
          else if (c.localName === 'polyline' || c.localName === 'polygon') {
            const pts = (c.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
            for (let i = 0; i + 1 < pts.length; i += 2) (i ? ctx.lineTo : ctx.moveTo).call(ctx, pts[i], pts[i + 1]);
            if (c.localName === 'polygon') ctx.closePath();
          } else continue;
          ctx.globalAlpha = +style.opacity;
          if (style.fill !== 'none') { ctx.fillStyle = style.fill; ctx.fill(); }
          if (style.stroke !== 'none') {
            ctx.strokeStyle = style.stroke;
            ctx.lineWidth = +style['stroke-width'];
            ctx.lineCap = style['stroke-linecap'];
            ctx.lineJoin = style['stroke-linejoin'];
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      };
      walk(svg, {});
    }
    function svgPath(ctx, d) {
      const tokens = d.match(/[a-zA-Z]|-?[\d.]+(?:e-?\d+)?/g) ?? [];
      let i = 0;
      let cmd = '';
      let x = 0;
      let y = 0;
      let sx = 0;
      let sy = 0;
      const num = () => parseFloat(tokens[i++]);
      while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
        const rel = cmd === cmd.toLowerCase();
        const C2 = cmd.toUpperCase();
        if (C2 === 'Z') { ctx.closePath(); x = sx; y = sy; continue; }
        if (C2 === 'M' || C2 === 'L') {
          const nx = num() + (rel ? x : 0);
          const ny = num() + (rel ? y : 0);
          if (C2 === 'M') { ctx.moveTo(nx, ny); sx = nx; sy = ny; cmd = rel ? 'l' : 'L'; } else ctx.lineTo(nx, ny);
          x = nx; y = ny;
        } else if (C2 === 'H') { x = num() + (rel ? x : 0); ctx.lineTo(x, y); }
        else if (C2 === 'V') { y = num() + (rel ? y : 0); ctx.lineTo(x, y); }
        else if (C2 === 'C' || C2 === 'Q') {
          const k = C2 === 'C' ? 3 : 2;
          const p = [];
          for (let j = 0; j < k; j++) p.push([num() + (rel ? x : 0), num() + (rel ? y : 0)]);
          const pts = [[x, y], ...p];
          for (let s = 1; s <= 12; s++) {
            const t = s / 12;
            let q = pts;
            while (q.length > 1) q = q.slice(1).map((pt, j) => [q[j][0] + (pt[0] - q[j][0]) * t, q[j][1] + (pt[1] - q[j][1]) * t]);
            ctx.lineTo(q[0][0], q[0][1]);
          }
          [x, y] = p[p.length - 1];
        } else { i++; }
      }
    }

    // Glyph quads for one run of text at (x, baseline y).
    function text(run, x, y, color, shadows, cs) {
      const f = run.font;
      const face = f.face;
      const weight = cs['font-weight'];
      const edge = weight === '900' || weight === 'bolder' ? 0.44 : weight === '800' ? 0.47 : 0.5;
      const draw = (ox, oy, rgbaColor, blur) => {
        let pen = x + ox;
        for (const ch of run.text) {
          const cp = ch.codePointAt(0);
          const gl1 = glyph(cp, face);
          const adv = fonts.advance(cp, face) * f.size + f.letterSpacing;
          if (!gl1.empty) {
            const k = f.size / gl1.base;
            const soft = blur > 0 ? ((blur / 2) / k) * (0.5 / gl1.pad) : 0;
            const gx = pen + gl1.xoff * k;
            const gy = y + oy + gl1.yoff * k;
            quad(gx, gy, gl1.w * k, gl1.h * k, [gx, gy, 1, 1], NONE, rgbaColor, NONE, [0, soft, GLYPH, edge - (blur > 0 ? 0.04 : 0)], [gl1.x / ATLAS, gl1.y / ATLAS, (gl1.x + gl1.w) / ATLAS, (gl1.y + gl1.h) / ATLAS]);
          }
          pen += adv;
        }
      };
      for (const s of shadows.slice().reverse()) {
        const c = rgba(s.color === 'currentcolor' ? cs.color : s.color);
        if (c && c[3] > 0) draw(s.x, s.y, c, s.blur);
      }
      draw(0, 0, color, 0);
    }

    // ---- State
    let dirty = true;
    let layers = [];
    const prevPaint = new WeakMap();

    // Paint-only values for an element at `now`: the computed ones with its
    // running animations applied.
    function animated(box, now) {
      const cs = box.cs;
      if (cs['animation-name'] === 'none') return {};
      const r = animator.sample(box.pseudo ? box : box.el, cs, now, box.el);
      return r ? r.values : {};
    }

    function buildLayer(layer, ov) {
      const box = layer.box;
      const cs = box.cs;
      const start = count;
      layerImage = null;
      const visible = (ov.visibility ?? cs.visibility) !== 'hidden';
      const behindGame = box.el && gameCanvas && box.el.contains(gameCanvas);
      if (visible && box.el && !behindGame) {
        decorate(cs, box.ax, box.ay, box.w, box.h, box.e ?? { bt: 0, br: 0, bb: 0, bl: 0 }, ov);
        if (box.replaced) {
          const e = box.e;
          const x = box.ax + e.bl + e.pl;
          const y = box.ay + e.bt + e.pt;
          const w = box.cw;
          const h = box.ch;
          const el = box.el;
          let im = null;
          if (el.localName === 'svg') im = image(`svg|${el.innerHTML.length}|${hash(el.innerHTML)}|${Math.round(w)}x${Math.round(h)}`, w * scale, h * scale, (ctx, pw, ph) => paintSvg(ctx, el, pw ?? w * scale, ph ?? h * scale));
          else if (el.localName === 'canvas' && el.ctx2d) im = image(`canvas|${canvasId(el)}|${el.ctx2d.version ?? 0}`, el.width, el.height, (ctx) => ctx.putImageData({ width: el.width, height: el.height, data: el.ctx2d.data }, 0, 0));
          if (im) {
            quad(x, y, w, h, [x, y, w, h], NONE, [1, 1, 1, 1], NONE, [0, 0, IMAGE, 0], [0, 0, 1, 1]);
            layerImage = im.tex;
          }
        }
      }
      for (const ln of box.lines ?? []) {
        for (const d of ln.decor) {
          const dov = d.box.cs['animation-name'] !== 'none' ? animated(d.box, lastNow) : {};
          if ((dov.visibility ?? d.box.cs.visibility) !== 'hidden') decorate(d.box.cs, box.ax + d.x, box.ay + d.y, d.w, d.h, d.box.e, dov);
        }
        for (const run of ln.runs) {
          const rcs = run.cs;
          if (rcs.visibility === 'hidden' && !ov.visibility) continue;
          // Animated color comes from the run's own element or, when the color
          // is inherited, from the layer's element.
          const own = run.chain.length ? animated(run.chain[run.chain.length - 1], lastNow) : ov;
          const colorText = own.color ?? (rcs.specified?.color === undefined ? ov.color : undefined) ?? rcs.color;
          const color = rgba(colorText) ?? [0, 0, 0, 1];
          let alpha = 1;
          for (const b of run.chain) alpha *= +(animated(b, lastNow).opacity ?? b.cs.opacity);
          color[3] *= alpha;
          text(run, box.ax + run.x, box.ay + run.y, color, parseShadows(own['text-shadow'] ?? rcs['text-shadow'], rcs.fontSize), rcs);
        }
      }
      layer.first = start;
      layer.count = count - start;
      layer.image = layerImage;
    }

    const ids = new WeakMap();
    let nextId = 1;
    const canvasId = (el) => { if (!ids.has(el)) ids.set(el, nextId++); return ids.get(el); };
    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

    let lastNow = 0;
    let built = false; // layers' vertices match the current layout
    // Styles and layout only (for offsetTop and friends between frames);
    // animations notice elements that gained or lost one.
    const stats = (g.__hudStats = { layouts: 0, layoutMs: 0, builds: 0, buildMs: 0, glyphs: 0, glyphMs: 0 });
    let lastRoot = null;
    function layoutNow(now) {
      const treeChanged = g.__hudTreeDirty || dirty;
      g.__hudDirty = false;
      g.__hudTreeDirty = false;
      dirty = false;
      const t0 = g.__now ? g.__now() : 0;
      // Attribute changes that only change how things look keep the layout.
      if (!treeChanged && lastRoot && restyle(lastRoot, styler)) {
        stats.restyles = (stats.restyles ?? 0) + 1;
        stats.layoutMs += (g.__now ? g.__now() : 0) - t0;
        const walk = (b) => {
          if (b.el && b.display !== 'text') animator.sample(b.pseudo ? b : b.el, b.cs, now, b.el);
          b.children.forEach(walk);
        };
        walk(lastRoot);
        built = false;
        return;
      }
      const result = layout(root, width, height, styler, fonts);
      lastRoot = result.root;
      stats.layouts++;
      stats.layoutMs += (g.__now ? g.__now() : 0) - t0;
      layers = result.layers;
      const walk = (b) => {
        if (b.el && b.display !== 'text') animator.sample(b.pseudo ? b : b.el, b.cs, now, b.el);
        b.children.forEach(walk);
      };
      if (result.root) walk(result.root);
      built = false;
    }
    function relayout(now) {
      lastNow = now;
      if (g.__hudDirty || dirty) layoutNow(now);
      const tb = g.__now ? g.__now() : 0;
      for (const im of images.values()) im.used = false;
      count = 0;
      for (const layer of layers) {
        const ov = animated(layer.box, now);
        prevPaint.set(layer, paintKey(ov));
        buildLayer(layer, ov);
      }
      upload();
      for (const [k, im] of images) if (!im.used) { gl.deleteTexture(im.tex); images.delete(k); }
      built = true;
      stats.builds++;
      stats.buildMs += (g.__now ? g.__now() : 0) - tb;
    }
    const paintKey = (ov) => `${ov.color ?? ''}|${ov['box-shadow'] ?? ''}|${ov['text-shadow'] ?? ''}|${ov.visibility ?? ''}`;
    function upload() {
      gl.bindBuffer(C.ARRAY_BUFFER, vbo);
      gl.bufferData(C.ARRAY_BUFFER, verts.subarray(0, count * FLOATS), C.DYNAMIC_DRAW);
    }

    // ---- Frame
    function frame(now, rect) {
      lastNow = now;
      if (g.__hudDirty || dirty || !built) {
        relayout(now);
      } else {
        // Animated colors and shadows are baked into the vertices: rebuild when they change.
        let changed = false;
        for (const layer of layers) {
          if (layer.box.cs['animation-name'] === 'none' && !(layer.box.lines ?? []).some((l) => l.runs.some((r) => r.chain.some((b) => b.cs['animation-name'] !== 'none')))) continue;
          const key = paintKey(animated(layer.box, now));
          if (key !== prevPaint.get(layer)) { changed = true; break; }
        }
        if (changed) relayout(now);
      }
      if (!layers.length) return;

      scale = rect.w / width;
      // HUD space to clip space for this rect of the drawing buffer.
      const vp = gl.getParameter(C.VIEWPORT);
      const toClip = [(2 * rect.w) / width / vp[2], 0, 0, (-2 * rect.h) / height / vp[3], (2 * rect.x) / vp[2] - 1, (2 * (rect.y + rect.h)) / vp[3] - 1];
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.enable(C.BLEND);
      gl.blendFunc(C.ONE, C.ONE_MINUS_SRC_ALPHA);
      gl.disable(C.DEPTH_TEST);
      gl.disable(C.CULL_FACE);
      gl.disable(C.STENCIL_TEST);
      gl.disable(C.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);
      gl.uniform1i(U.atlas, 0);
      gl.uniform1i(U.image, 1);
      gl.activeTexture(C.TEXTURE0);
      gl.bindTexture(C.TEXTURE_2D, atlasTex);

      const state = new Map();
      for (const layer of layers) {
        const parent = layer.parent ? state.get(layer.parent) : { m: ID, opacity: 1, clip: [rect.x, rect.y, rect.x + rect.w, rect.y + rect.h] };
        const box = layer.box;
        const cs = box.cs;
        const ov = animated(box, now);
        const opacity = parent.opacity * +(ov.opacity ?? cs.opacity);
        const t = ov.transform ?? cs.transform;
        let m = parent.m;
        if (t && t !== 'none') {
          const [ox, oy] = originOf(cs['transform-origin'], box.w, box.h, cs.fontSize);
          const px = box.ax + ox;
          const py = box.ay + oy;
          m = mul(mul(mul(parent.m, [1, 0, 0, 1, px, py]), cssMatrix(t, box.w, box.h, cs.fontSize)), [1, 0, 0, 1, -px, -py]);
        }
        let clip = parent.clip;
        if (layer.clip) {
          // The padding box in drawing-buffer pixels (its bounding box when transformed).
          const e = box.e;
          const pts = [[box.ax + e.bl, box.ay + e.bt], [box.ax + box.w - e.br, box.ay + e.bt], [box.ax + e.bl, box.ay + box.h - e.bb], [box.ax + box.w - e.br, box.ay + box.h - e.bb]]
            .map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
            .map(([x, y]) => [rect.x + (x / width) * rect.w, rect.y + rect.h - (y / height) * rect.h]);
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          clip = [Math.max(clip[0], Math.min(...xs)), Math.max(clip[1], Math.min(...ys)), Math.min(clip[2], Math.max(...xs)), Math.min(clip[3], Math.max(...ys))];
        }
        // overflow clips the children, not the element's own border and background.
        state.set(layer, { m, opacity, clip });
        const own = parent.clip;
        if (!layer.count || opacity <= 0.001 || own[2] <= own[0] || own[3] <= own[1]) continue;
        const full = mul(toClip, m);
        gl.uniformMatrix3fv(U.m, false, new Float32Array([full[0], full[1], 0, full[2], full[3], 0, full[4], full[5], 1]));
        gl.uniform1f(U.opacity, opacity);
        gl.uniform4f(U.clip, own[0], own[1], own[2], own[3]);
        if (layer.image) {
          gl.activeTexture(C.TEXTURE1);
          gl.bindTexture(C.TEXTURE_2D, layer.image);
          gl.activeTexture(C.TEXTURE0);
        }
        gl.drawElements(C.TRIANGLES, (layer.count / 4) * 6, C.UNSIGNED_SHORT, (layer.first / 4) * 6 * 2);
      }
      gl.bindVertexArray(null);
    }

    return {
      frame,
      invalidate: () => { dirty = true; },
      reflow: () => { if (g.__hudDirty || dirty) layoutNow(lastNow); },
    };
  }

  g.__hud = { create };
})();
