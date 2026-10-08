// The launcher demo's handheld. It answers the launcher's /api calls the way
// the app's local service (pocketvibed.py) does on the handheld, with the real
// store's games. Installed games, settings and plays are kept in Cache Storage,
// so they survive reloads.

const STORE = 'https://pocketvibe-store.mertcobanov.workers.dev/catalog.json';
const CACHE = 'pocketvibe-demo-v1';
const STATE_KEY = '/__demo/state';
const DOWNLOAD_MS = 2200; // how long a pretend download takes
const INSTALL_MS = 700; // then unpacking
const FIRST_GAMES = 5; // installed on a first visit, so the Library has games
// The service's settings; the demo starts without music.
const SETTINGS = { language: 'en', music: false, musicVolume: 0.8, uiSounds: true, sfxVolume: 0.8, showFps: false, stores: [STORE] };

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return;
  event.respondWith(handle(event.request, url.pathname).catch((e) => json({ error: e.message }, 500)));
});

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// ---------- Catalog and state ----------

let catalog = null; // { name, games, online, at }
async function getCatalog() {
  if (catalog && Date.now() - catalog.at < 60_000) return catalog;
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(STORE, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.statusText);
    await cache.put(STORE, res.clone());
    catalog = { ...(await res.json()), online: true, at: Date.now() };
  } catch {
    const saved = await cache.match(STORE);
    catalog = { ...(saved ? await saved.json() : { games: [] }), online: false, at: Date.now() };
  }
  return catalog;
}

let playable = null;
async function getPlayable() {
  playable ??= new Set(await fetch('/play/games.json').then((r) => r.json()).catch(() => []));
  return playable;
}

let version = null;
async function getVersion() {
  version ??= await fetch('/demo/app.json').then((r) => r.json()).then((a) => a.version).catch(() => '');
  return version;
}

let state = null;
async function getState() {
  if (state) return state;
  const saved = await (await caches.open(CACHE)).match(STATE_KEY);
  state = saved ? await saved.json() : null;
  // Settings added since the visitor's last visit get their defaults.
  if (state) state.settings = { ...SETTINGS, ...state.settings };
  if (!state) {
    const { games, online } = await getCatalog();
    const popular = [...games].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, FIRST_GAMES);
    state = {
      settings: { ...SETTINGS },
      installed: Object.fromEntries(popular.map((g) => [g.id, { version: g.version, last: 0, plays: 0 }])),
      jobs: {},
      backups: [],
    };
    // Offline on a first visit: start empty, but do not keep it.
    if (online) await saveState();
  }
  return state;
}

async function saveState() {
  await (await caches.open(CACHE)).put(STATE_KEY, json(state));
}

// ---------- The service's answers ----------

function library(games) {
  return Object.entries(state.installed)
    .map(([id, local]) => {
      const entry = games.find((g) => g.id === id);
      return entry && { ...entry, version: local.version, lastPlayed: local.last, plays: local.plays };
    })
    .filter(Boolean)
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
}

// A pretend download: its progress comes from the time since it started.
async function jobs() {
  const out = {};
  let changed = false;
  for (const [id, job] of Object.entries(state.jobs)) {
    const elapsed = Date.now() - job.started;
    if (elapsed < DOWNLOAD_MS) {
      out[id] = { state: 'downloading', progress: elapsed / DOWNLOAD_MS, error: null };
    } else if (elapsed < DOWNLOAD_MS + INSTALL_MS) {
      out[id] = { state: 'installing', progress: 1, error: null };
    } else {
      if (!job.done) {
        state.installed[id] = { ...state.installed[id], version: job.version, last: state.installed[id]?.last ?? 0, plays: state.installed[id]?.plays ?? 0 };
        job.done = true;
        changed = true;
      }
      out[id] = { state: 'done', progress: 1, error: null };
    }
  }
  if (changed) await saveState();
  return out;
}

function stamp(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

async function handle(request, path) {
  const method = request.method;
  await getState();

  const { name, games, online } = await getCatalog();
  if (path.startsWith('/api/cover/')) {
    const cover = games.find((g) => g.id === path.slice(11))?.cover;
    return cover ? Response.redirect(cover, 302) : json({ error: 'no cover' }, 404);
  }

  if (method === 'GET') {
    switch (path) {
      case '/api/library':
        return json(library(games));
      case '/api/store':
        return json({
          online,
          games: games.map((g) => ({ ...g, store: name, installed: g.id in state.installed, update: g.id in state.installed && state.installed[g.id].version !== g.version })),
          stores: [{ url: STORE, name: name || 'PocketVibe Store', online, count: games.length }],
        });
      case '/api/status': {
        const now = new Date();
        return json({ time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, battery: 86, charging: false, wifi: true });
      }
      case '/api/settings':
        return json(state.settings);
      case '/api/info': {
        const size = library(games).reduce((n, g) => n + (g.size || 0) * 3, 0);
        return json({ version: await getVersion(), free: 58.4e9, total: 64e9, games: size, ip: '192.168.1.42' });
      }
      case '/api/saves':
        return json(state.backups);
      case '/api/update': {
        const current = await getVersion();
        return json({ version: current, current, notes: '', available: false });
      }
      case '/api/notice':
        return json({ notice: null });
      case '/api/screens':
        // One screen, the page's 720x480 frame.
        return json({ screens: null, primary: 0 });
      case '/api/jobs':
        return json(await jobs());
    }
    return json({ error: 'unknown action' }, 404);
  }

  if (path === '/api/settings') {
    Object.assign(state.settings, await request.json());
    await saveState();
    return json(state.settings);
  }
  if (path === '/api/unlock-audio' || path === '/api/update/install') return json({ ok: false });
  if (path === '/api/saves/backup') {
    const backup = { name: `saves-${stamp(new Date())}.zip`, size: 18_432 };
    state.backups.unshift(backup);
    await saveState();
    return json({ name: backup.name });
  }
  if (path.startsWith('/api/saves/restore/')) return json({ ok: true });
  if (path === '/api/quit') {
    // The handheld would close the app; the page shows it as switched off.
    new BroadcastChannel('pocketvibe-demo').postMessage('quit');
    return json({ ok: true });
  }

  const [, , action, id] = path.split('/');
  const game = games.find((g) => g.id === id);
  if (!game) return json({ error: 'not in the store' }, 404);
  if (action === 'install') {
    if (!state.jobs[id] || state.jobs[id].done) state.jobs[id] = { started: Date.now(), version: game.version };
    await saveState();
    return json({ ok: true });
  }
  if (action === 'remove') {
    delete state.installed[id];
    delete state.jobs[id];
    await saveState();
    return json({ ok: true });
  }
  if (action === 'launch') {
    if (!(id in state.installed)) return json({ error: 'not installed' }, 404);
    if (!(await getPlayable()).has(id)) return json({ error: 'this game only plays on the handheld' }, 404);
    state.installed[id].last = Date.now() / 1000;
    state.installed[id].plays += 1;
    await saveState();
    return json({ url: `/play/${id}/${game.entry || 'index.html'}?handheld${state.settings.showFps ? '&perf' : ''}` });
  }
  return json({ error: 'unknown action' }, 404);
}
