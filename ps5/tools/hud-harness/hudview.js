// Runs inside a game page in Chrome with ?hudview: draws the HUD with the PS5
// runtime (css.js, layout.js, hud.js) on a WebGL 2 canvas over the game, for
// screenshots next to Chrome's own rendering. __mode('chrome' | 'ours')
// switches which one shows; __press(code) presses a key.

(() => {
  if (!/[?&]hudview/.test(location.search)) return;
  const BASE = 48;
  const PAD = 6;
  const measure = document.createElement('canvas').getContext('2d');
  const sizeOf = (face) => face; // faces are CSS font strings without a size
  const fonts = {
    face: (cs) => `${cs['font-style']} ${cs['font-weight']} ${BASE}px ${cs['font-family']}`,
    advance(cp, face) { measure.font = sizeOf(face); return measure.measureText(String.fromCodePoint(cp)).width / BASE; },
    metrics(face) {
      measure.font = face;
      const m = measure.measureText('Hg');
      return { ascent: m.fontBoundingBoxAscent / BASE, descent: m.fontBoundingBoxDescent / BASE, lineGap: 0 };
    },
    // A signed-distance glyph from Chrome's own rendering of the character.
    glyph(cp, face) {
      measure.font = face;
      const ch = String.fromCodePoint(cp);
      const m = measure.measureText(ch);
      const asc = Math.ceil(m.fontBoundingBoxAscent);
      const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + PAD * 2 + 2;
      const h = Math.ceil(asc + m.fontBoundingBoxDescent) + PAD * 2;
      if (!ch.trim()) return { w: 0, h: 0, base: BASE, pad: PAD };
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.font = face;
      x.fillStyle = '#fff';
      const left = PAD + 1 + Math.ceil(m.actualBoundingBoxLeft);
      x.fillText(ch, left, PAD + asc);
      const alpha = x.getImageData(0, 0, w, h).data;
      const inside = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) inside[i] = alpha[i * 4 + 3] > 127 ? 1 : 0;
      const data = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let xx = 0; xx < w; xx++) {
          const me = inside[y * w + xx];
          let best = PAD + 1;
          for (let dy = -PAD; dy <= PAD; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -PAD; dx <= PAD; dx++) {
              const x2 = xx + dx;
              if (x2 < 0 || x2 >= w || inside[yy * w + x2] === me) continue;
              const d = Math.hypot(dx, dy);
              if (d < best) best = d;
            }
          }
          const signed = me ? best - 0.5 : -(best - 0.5);
          data[y * w + xx] = Math.max(0, Math.min(255, 128 + (signed * 128) / PAD));
        }
      }
      return { w, h, xoff: -left, yoff: -(PAD + asc), base: BASE, pad: PAD, data };
    },
  };
  const makeImage = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    return { w, h, data: new Uint8Array(ctx.getImageData(0, 0, w, h).data.buffer) };
  };

  let hud = null;
  let overlay = null;
  const hide = document.createElement('style');
  hide.textContent = '#hud, #perf { visibility: hidden !important; }';
  window.__mode = (mode) => {
    overlay.style.display = mode === 'ours' ? 'block' : 'none';
    if (mode === 'ours') document.head.appendChild(hide);
    else hide.remove();
  };
  window.__press = (code) => {
    dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
    setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key: code })), 80);
  };

  addEventListener('load', async () => {
    const css = await Promise.all([...document.querySelectorAll('link[rel=stylesheet]')].map((l) => fetch(l.href).then((r) => r.text())));
    const screen = document.getElementById('screen');
    const w = screen.offsetWidth;
    const h = screen.offsetHeight;
    overlay = document.createElement('canvas');
    overlay.width = w;
    overlay.height = h;
    Object.assign(overlay.style, { position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${h}px`, zIndex: 10, display: 'none', pointerEvents: 'none' });
    screen.appendChild(overlay);
    const gl = overlay.getContext('webgl2', { premultipliedAlpha: true, alpha: true });
    // The HUD must not lay out its own canvas.
    const hudRoot = screen;
    const realChildren = hudRoot.childNodes;
    hud = __hud.create({ gl, fonts, makeImage, root: hudRoot, css, width: w, height: h, gameCanvas: screen.querySelector('canvas') });
    const loop = (now) => {
      try {
        overlay.remove();
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        globalThis.__hudDirty = true; // Chrome's DOM does not tell us; lay out every frame here
        hud.frame(now, { x: 0, y: 0, w, h });
      } catch (e) {
        window.__hudError = String(e.stack ?? e);
      } finally {
        screen.appendChild(overlay);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__shotReady = true;
    void realChildren;
  });
})();
