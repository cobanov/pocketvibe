// The PocketVibe launcher on the PS5, unchanged: its page (launcher/index.html
// and launcher.css) drawn by the HUD renderer over a blank screen, and the
// local service it talks to (pocketvibed's /api) answered here. Launching a
// game restarts the app into that game (__ps5.launch); START + SELECT in a
// game comes back. The store needs the network, which the console does not
// have, so it is empty.

(() => {
  const g = globalThis;
  const DIR = '/app0/assets/js/launcher/';
  const GAMES = '/app0/assets/js/games/';
  const DATA = '/data/pocketvibe/storage/';
  const VERSION = 'ps5-dev';
  const read = (path) => __ps5.readText(path);
  const readJson = (path, fallback) => {
    try { return JSON.parse(read(path) ?? 'null') ?? fallback; } catch { return fallback; }
  };

  // ---- The page
  const html = read(`${DIR}index.html`) ?? '';
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');
  document.title = 'PocketVibe';

  // ---- The service (pocketvibed's routes)
  const DEFAULT_SETTINGS = { language: 'en', music: true, musicVolume: 0.8, uiSounds: true, sfxVolume: 0.8, showFps: false, stores: [] };
  let settings = { ...DEFAULT_SETTINGS, ...readJson(`${DATA}settings.json`, {}) };
  const plays = readJson(`${DATA}plays.json`, {});
  const manifests = readJson('/app0/assets/js/library.json', []);
  const library = () => manifests
    .map((m) => ({ ...m, lastPlayed: plays[m.id]?.last ?? 0, plays: plays[m.id]?.count ?? 0 }))
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
  const pad = (n) => String(n).padStart(2, '0');

  function route(path, method, body) {
    if (method === 'GET') {
      switch (path) {
        case '/api/library': return library();
        case '/api/store': return { online: false, games: [], stores: [] };
        case '/api/status': { const d = new Date(); return { time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, battery: null, charging: false, wifi: false }; }
        case '/api/settings': return settings;
        case '/api/info': return { version: VERSION, free: 0, total: 0, games: 0, ip: null, gpu: null };
        case '/api/screens': return { screens: null, primary: 0 };
        case '/api/saves': return [];
        case '/api/update': return { current: VERSION, available: false };
        case '/api/notice': return { notice: null };
        case '/api/jobs': return {};
      }
      return null;
    }
    if (path === '/api/settings') {
      for (const [k, v] of Object.entries(body ?? {})) if (k in DEFAULT_SETTINGS && typeof v === typeof DEFAULT_SETTINGS[k]) settings[k] = v;
      __ps5.writeText(`${DATA}settings.json`, JSON.stringify(settings));
      return settings;
    }
    const launch = /^\/api\/launch\/([a-z0-9-]+)$/.exec(path);
    if (launch) {
      const id = launch[1];
      if (!manifests.some((m) => m.id === id)) return null;
      plays[id] = { count: (plays[id]?.count ?? 0) + 1, last: Date.now() / 1000 };
      __ps5.writeText(`${DATA}plays.json`, JSON.stringify(plays));
      return { url: `pocketvibe-game:${id}` };
    }
    if (path === '/api/quit') { g.__flushStorage?.(); __ps5.exit(); return {}; }
    if (path === '/api/unlock-audio' || path === '/api/report') return {};
    return null;
  }

  const response = (status, text) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    headers: { get: (k) => (/content-type/i.test(k) ? 'application/json' : null) },
    json: async () => JSON.parse(text),
    text: async () => text,
  });
  g.fetch = async (input, options = {}) => {
    const url = String(input?.url ?? input).replace(/^[a-z]+:\/\/[^/]+/i, '');
    const path = url.split('?')[0];
    const method = (options.method ?? 'GET').toUpperCase();
    let body;
    try { body = options.body ? JSON.parse(options.body) : undefined; } catch { body = undefined; }
    const data = path.startsWith('/api/') ? route(path, method, body) : null;
    return data === null ? response(404, JSON.stringify({ error: 'not here' })) : response(200, JSON.stringify(data));
  };

  // ---- Leaving: a game's URL from /api/launch restarts into that game.
  g.__navigate = (url) => {
    g.__flushStorage?.();
    const game = /^pocketvibe-game:([a-z0-9-]+)$/.exec(url);
    __ps5.launch(game ? game[1] : 'launcher');
  };

  // ---- Pictures: covers are the games' cover.png, packaged by id.
  const images = new Map();
  g.__loadImage = (src) => {
    const cover = /\/api\/cover\/([a-z0-9-]+)/.exec(src);
    const path = cover ? `${GAMES}${cover[1]}.png` : null;
    if (!path) return null;
    if (!images.has(path)) images.set(path, __ps5.image(path));
    return images.get(path);
  };

  // ---- The screen: a blank canvas under the page, the page drawn over it.
  const width = innerWidth;
  const height = innerHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2');
  const tick = g.__frame;
  g.__frame = (now) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    tick(now);
  };

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
      return (family[weight] ?? family.normal)[cs['font-style'] === 'italic' ? 1 : 0];
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
  const hud = g.__hud.create({
    gl, fonts, makeImage, loadImage: g.__loadImage, root: document.documentElement,
    css: [read(`${DIR}launcher.css`) ?? ''], width, height,
  });
  g.__reflow = () => hud.reflow();
  let frames = 0;
  const started = __now();
  g.__hudDraw = (now, x, y, w, h) => {
    hud.frame(now, { x, y, w, h });
    // The HUD's costs over the first seconds and then every ten, for tuning.
    if (++frames === 120 || frames % 600 === 0) {
      const s = g.__hudStats;
      console.log(`HUDSTATS ${JSON.stringify({ t: Math.round(now - started), layouts: s.layouts, layoutMs: Math.round(s.layoutMs), builds: s.builds, buildMs: Math.round(s.buildMs), glyphs: s.glyphs, glyphMs: Math.round(s.glyphMs) })}`);
    }
  };
})();
