// Runs inside a game page in Chrome: lays the HUD out with the PS5 runtime's
// css.js and layout.js and compares every element's box with Chrome's own
// layout (offsetLeft/Top/Width/Height, which ignore transforms like ours),
// on the title screen, in play and in the pause menu. Posts a report.

(() => {
  if (!/[?&]layoutcheck/.test(location.search)) return;
  const report = (o) => fetch('/report', { method: 'POST', body: JSON.stringify(o) });
  const game = location.pathname.split('/')[1];
  const ctx = document.createElement('canvas').getContext('2d');
  // Text metrics from Chrome's own fonts, so both layouts measure the same text.
  const fonts = {
    // Measured at the real size: system fonts change shape with size.
    face: (cs) => `${cs['font-style']} ${cs['font-weight']} ${cs.fontSize}px ${cs['font-family']}`,
    advance(cp, face) { ctx.font = face; return ctx.measureText(String.fromCodePoint(cp)).width / parseFloat(/([\d.]+)px/.exec(face)[1]); },
    metrics(face) {
      ctx.font = face;
      const m = ctx.measureText('Hg');
      const size = parseFloat(/([\d.]+)px/.exec(face)[1]);
      return { ascent: m.fontBoundingBoxAscent / size, descent: m.fontBoundingBoxDescent / size, lineGap: 0 };
    },
  };
  const press = (code) => {
    dispatchEvent(new KeyboardEvent('keydown', { code, key: code }));
    setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, key: code })), 80);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const name = (el) => `${el.localName}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`;

  async function check(label, styler) {
    const screen = document.getElementById('screen');
    const t0 = performance.now();
    const { root } = __layout.layout(screen, screen.offsetWidth, screen.offsetHeight, styler, fonts);
    const ms = performance.now() - t0;
    const origin = new Map([[screen, { x: 0, y: 0 }]]);
    const theirs = (el) => {
      if (origin.has(el)) return origin.get(el);
      const p = el.offsetParent;
      const base = p && p !== document.body ? theirs(p) : { x: NaN, y: NaN };
      const o = { x: base.x + el.offsetLeft + (p?.clientLeft ?? 0), y: base.y + el.offsetTop + (p?.clientTop ?? 0) };
      origin.set(el, o);
      return o;
    };
    const diffs = [];
    let checked = 0;
    const walk = (box) => {
      if (box.el && !box.pseudo && box.display !== 'inline' && box.display !== 'text' && box.el !== screen) {
        const el = box.el;
        if (el.offsetParent || getComputedStyle(el).position === 'fixed') {
          const t = theirs(el);
          const them = [t.x, t.y, el.offsetWidth, el.offsetHeight];
          const us = [box.ax, box.ay, box.w, box.h];
          checked++;
          if (us.some((v, i) => !(Math.abs(v - them[i]) <= 2))) diffs.push({ el: name(el), us: us.map((v) => Math.round(v)), chrome: them, kids: box.children.map((c) => `${c.display}${c.outOfFlow ? '(abs)' : ''}:${c.text ?? c.el?.localName ?? ''}`).slice(0, 6), lines: box.lines?.length, html: el.innerHTML.slice(0, 120) });
        }
      }
      box.children.forEach(walk);
    };
    if (root) walk(root);
    // Elements Chrome shows that we did not lay out at all.
    const ours = new Set();
    const mark = (b) => { if (b.el) ours.add(b.el); b.children.forEach(mark); };
    if (root) mark(root);
    const missing = [...screen.querySelectorAll('*')].filter((el) => el.offsetParent && !ours.has(el) && el.localName !== 'canvas').map(name);
    await report({ game, label, ms: Math.round(ms), checked, diffs: diffs.slice(0, 25), diffCount: diffs.length, missing: missing.slice(0, 10) });
  }

  addEventListener('load', async () => {
    try {
      const css = await Promise.all([...document.querySelectorAll('link[rel=stylesheet]')].map((l) => fetch(l.href).then((r) => r.text())));
      const styler = new __css.Styler(css);
      await wait(1500);
      await check('title', styler);
      press('Enter');
      await wait(1200);
      await check('play', styler);
      press('Enter');
      await wait(800);
      await check('pause', styler);
      await report({ game, done: true });
    } catch (e) {
      await report({ game, error: String(e), stack: e.stack });
    }
  });
})();
