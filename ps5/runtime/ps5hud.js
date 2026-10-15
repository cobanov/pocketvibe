// The HUD on the PS5: hud.js with the console's fonts (SST faces through
// __ps5.glyph/advance/fontMetrics), the software 2D canvas for gradients and
// pictures, and the game's stylesheet (__gameCss). The native host calls
// __hudDraw(now, x, y, w, h) after drawing the game, with the game's place on
// the screen in pixels (from the bottom left).

(() => {
  const g = globalThis;
  const FACES = {
    sans: { normal: ['SST-Roman.otf', 'SST-Italic.otf'], medium: ['SST-Medium.otf', 'SST-MediumItalic.otf'], bold: ['SST-Bold.otf', 'SST-BoldItalic.otf'], light: ['SST-Light.otf', 'SST-LightItalic.otf'] },
    mono: { normal: ['SSTTypewriter-Roman.otf', 'SSTTypewriter-Roman.otf'], bold: ['SSTTypewriter-Bd.otf', 'SSTTypewriter-Bd.otf'] },
  };
  const advances = new Map();
  const metrics = new Map();
  const fonts = {
    face(cs) {
      const family = /mono/i.test(cs['font-family']) ? FACES.mono : FACES.sans;
      const w = cs['font-weight'];
      const n = w === 'bold' || w === 'bolder' ? 700 : w === 'normal' ? 400 : w === 'lighter' ? 300 : +w || 400;
      const weight = n >= 600 ? 'bold' : n >= 500 ? 'medium' : n <= 300 ? 'light' : 'normal';
      const pair = family[weight] ?? family.normal;
      return pair[cs['font-style'] === 'italic' || cs['font-style'] === 'oblique' ? 1 : 0];
    },
    advance(cp, face) {
      const key = `${face}|${cp}`;
      let a = advances.get(key);
      if (a === undefined) advances.set(key, (a = __ps5.advance(cp, face)));
      return a;
    },
    metrics(face) {
      let m = metrics.get(face);
      if (!m) metrics.set(face, (m = __ps5.fontMetrics(face) ?? { ascent: 0.9, descent: 0.25, lineGap: 0 }));
      return m;
    },
    glyph: (cp, face) => __ps5.glyph(cp, face),
  };
  const makeImage = (w, h, draw) => {
    const ctx = new g.CanvasRenderingContext2D({ width: w, height: h });
    draw(ctx, w, h);
    return { w, h, data: ctx.data };
  };

  let hud = null;
  g.__hudDraw = (now, x, y, w, h) => {
    if (!hud) {
      const canvas = g.__gl.canvas;
      if (!canvas) return;
      hud = g.__hud.create({
        gl: g.__gl, fonts, makeImage, root: document.getElementById('screen'), css: [g.__gameCss ?? ''],
        width: canvas.width, height: canvas.height, gameCanvas: canvas,
      });
    }
    hud.frame(now, { x, y, w, h });
  };
  g.__reflow = () => hud?.reflow();
})();
