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
  const STORE = 'https://pocketvibe-store.mertcobanov.workers.dev/catalog.json';
  const ROOT = '/data/pocketvibe/';
  const DEFAULT_SETTINGS = { language: 'en', music: true, musicVolume: 0.8, uiSounds: true, sfxVolume: 0.8, showFps: false, stores: [STORE] };
  let settings = { ...DEFAULT_SETTINGS, ...readJson(`${DATA}settings.json`, {}) };
  const plays = readJson(`${DATA}plays.json`, {});
  const bundled = readJson('/app0/assets/js/library.json', []);
  // Games from the store, in /data/pocketvibe/games/<id>; they win over bundled ones.
  const installed = readJson(`${ROOT}installed.json`, {});
  const saveInstalled = () => __ps5.writeText(`${ROOT}installed.json`, JSON.stringify(installed));
  const manifests = () => {
    const byId = new Map(bundled.map((m) => [m.id, { ...m, bundled: true }]));
    for (const m of Object.values(installed)) byId.set(m.id, m);
    return [...byId.values()];
  };
  const library = () => manifests()
    .map((m) => ({ ...m, lastPlayed: plays[m.id]?.last ?? 0, plays: plays[m.id]?.count ?? 0 }))
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
  const pad = (n) => String(n).padStart(2, '0');

  // A request through the native HTTPS client, resolved when it finishes.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function http(url, path = null, onProgress = null) {
    const id = __ps5.httpStart(url, path);
    if (id < 0) throw new Error('request refused');
    for (;;) {
      const st = __ps5.httpPoll(id);
      if (st.state === 'done' || st.state === 'failed') {
        const body = __ps5.httpTake(id);
        if (st.state === 'failed') throw new Error(st.error || 'download failed');
        return { ...st, body };
      }
      onProgress?.(st);
      await wait(100);
    }
  }

  // The catalog, with the last copy kept for when the network is not there.
  const STORE_FIELDS = ['title', 'author', 'version', 'description', 'genre', 'entry', 'download', 'cover', 'sha256', 'updated'];
  let catalog = readJson(`${ROOT}catalog.json`, { name: 'PocketVibe Store', games: [] });
  let online = false;
  const entries = () => (Array.isArray(catalog.games) ? catalog.games : []).filter((e) =>
    e && /^[a-z0-9][a-z0-9-]{0,63}$/.test(e.id ?? '') && typeof e.title === 'string' && typeof e.download === 'string' && e.download.startsWith('https://')
    && STORE_FIELDS.every((k) => e[k] === undefined || typeof e[k] === 'string'));
  async function refreshCatalog() {
    try {
      const r = await http(settings.stores?.[0] || STORE);
      const data = JSON.parse(r.body);
      if (data && Array.isArray(data.games)) {
        catalog = data;
        online = true;
        __ps5.writeText(`${ROOT}catalog.json`, r.body);
        fetchCovers();
      }
    } catch (e) {
      online = false;
      console.log(`store offline: ${e.message}`);
    }
  }
  function storeView() {
    const local = new Map(manifests().map((m) => [m.id, m]));
    const games = entries().map((e) => ({
      ...e,
      store: catalog.name ?? 'PocketVibe Store',
      installed: local.has(e.id),
      update: local.has(e.id) && local.get(e.id).version !== e.version,
    }));
    return { online, games, stores: [{ url: STORE, name: catalog.name ?? 'PocketVibe Store', online, count: games.length }] };
  }

  // Store covers, saved for good once fetched.
  const coverWaits = new Map();
  async function fetchCovers() {
    for (const e of entries()) {
      if (!e.cover?.startsWith('https://') || __ps5.readBinary(`${ROOT}covers/${e.id}.png`) || coverWaits.has(e.id)) continue;
      const done = http(e.cover, `${ROOT}covers/${e.id}.png`).catch(() => null);
      coverWaits.set(e.id, done);
      await done;
      coverWaits.delete(e.id);
      images.delete(`${ROOT}covers/${e.id}.png`);
      g.__hudDirty = true;
    }
  }

  // Installing: download, check, unpack beside the old copy, then swap.
  const jobs = {};
  async function install(id) {
    const entry = entries().find((e) => e.id === id);
    jobs[id] = { state: 'downloading', progress: 0, error: null };
    try {
      if (!entry) throw new Error('not in the store');
      const zip = `${ROOT}downloads/${id}.zip`;
      const r = await http(entry.download, zip, (st) => { if (st.total) jobs[id].progress = Math.min(st.got / st.total, 1); });
      if (entry.sha256 && r.sha256 !== entry.sha256) throw new Error('download is corrupted (checksum mismatch)');
      jobs[id] = { state: 'installing', progress: 1, error: null };
      const fresh = `${ROOT}games/.${id}.new`;
      __ps5.removeGame(fresh);
      const written = __ps5.unzip(zip, fresh);
      if (typeof written === 'string') throw new Error(written);
      const manifest = { ...readJson(`${fresh}/pocketvibe.json`, {}) };
      if (!__ps5.readBinary(`${fresh}/${entry.entry ?? manifest.entry ?? 'index.html'}`)) throw new Error('archive has no index.html');
      for (const k of ['title', 'author', 'version', 'description', 'genre', 'entry']) if (entry[k] !== undefined) manifest[k] = entry[k];
      if (entry.controls && typeof entry.controls === 'object') manifest.controls = entry.controls;
      manifest.id = id;
      manifest.entry ??= 'index.html';
      __ps5.writeText(`${fresh}/pocketvibe.json`, JSON.stringify(manifest, null, 2));
      const target = `${ROOT}games/${id}`;
      __ps5.removeGame(target);
      if (!__ps5.rename(fresh, target)) throw new Error('cannot install');
      installed[id] = manifest;
      saveInstalled();
      images.delete(`${target}/cover.png`);
      jobs[id] = { state: 'done', progress: 1, error: null };
    } catch (e) {
      jobs[id] = { state: 'error', progress: 0, error: e.message };
    }
  }

  async function route(path, method, body) {
    if (method === 'GET') {
      switch (path) {
        case '/api/library': return library();
        case '/api/store': await refreshCatalog(); return storeView();
        case '/api/status': { const d = new Date(); return { time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, battery: null, charging: false, wifi: online }; }
        case '/api/settings': return settings;
        case '/api/info': return { version: VERSION, free: 0, total: 0, games: 0, ip: null, gpu: null };
        // One screen inside the TV's title-safe area (5% in from each edge),
        // so a TV that crops the picture's edges does not cut the bars.
        case '/api/screens': {
          const [w, h] = [g.innerWidth, g.innerHeight];
          return { screens: [{ x: Math.round(w * 0.05), y: Math.round(h * 0.05), width: Math.round(w * 0.9), height: Math.round(h * 0.9) }], primary: 0 };
        }
        case '/api/saves': return [];
        case '/api/update': return { current: VERSION, available: false };
        case '/api/notice': return { notice: null };
        case '/api/jobs': return jobs;
      }
      return null;
    }
    if (path === '/api/settings') {
      for (const [k, v] of Object.entries(body ?? {})) if (k in DEFAULT_SETTINGS && typeof v === typeof DEFAULT_SETTINGS[k]) settings[k] = v;
      __ps5.writeText(`${DATA}settings.json`, JSON.stringify(settings));
      return settings;
    }
    const action = /^\/api\/(launch|install|remove)\/([a-z0-9-]+)$/.exec(path);
    if (action) {
      const [, verb, id] = action;
      if (verb === 'launch') {
        if (!manifests().some((m) => m.id === id)) return null;
        plays[id] = { count: (plays[id]?.count ?? 0) + 1, last: Date.now() / 1000 };
        __ps5.writeText(`${DATA}plays.json`, JSON.stringify(plays));
        return { url: `pocketvibe-game:${id}` };
      }
      if (verb === 'install') {
        if (jobs[id]?.state === 'downloading' || jobs[id]?.state === 'installing') return { ok: true };
        install(id);
        return { ok: true };
      }
      if (!installed[id]) return { error: 'built-in games stay' };
      __ps5.removeGame(`${ROOT}games/${id}`);
      delete installed[id];
      saveInstalled();
      return { ok: true };
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
  const files = g.fetch; // ps5.js: the launcher's own files (sounds, music)
  g.fetch = async (input, options = {}) => {
    const url = String(input?.url ?? input).replace(/^[a-z]+:\/\/[^/]+/i, '');
    const path = url.split('?')[0];
    const method = (options.method ?? 'GET').toUpperCase();
    let body;
    try { body = options.body ? JSON.parse(options.body) : undefined; } catch { body = undefined; }
    if (!path.startsWith('/api/')) return files(input, options);
    const data = await route(path, method, body);
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
    if (!cover) return null;
    const id = cover[1];
    const paths = [installed[id] && `${ROOT}games/${id}/cover.png`, `${GAMES}${id}.png`, `${ROOT}covers/${id}.png`].filter(Boolean);
    for (const path of paths) {
      if (!images.has(path)) images.set(path, __ps5.image(path));
      if (images.get(path)) return images.get(path);
    }
    // Still downloading: the picture element waits for it.
    const pending = coverWaits.get(id);
    return pending ? pending.then(() => g.__loadImage(src)) : null;
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
