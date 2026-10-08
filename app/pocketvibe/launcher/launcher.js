// PocketVibe launcher: Library, Store and Settings, driven by the handheld's
// buttons. Talks only to pocketvibed on the same origin.

import { LANGUAGES, getLanguage, setLanguage, t } from './i18n.js';
import { LauncherAudio } from './audio.js';
import { Keyboard } from './keyboard.js';
import { Celebration } from './celebrate.js';

const PADMAP = { 0: 'B', 1: 'A', 2: 'X', 3: 'Y', 4: 'L', 5: 'R', 8: 'SELECT', 9: 'START', 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };
const KEYMAP = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  KeyX: 'A', KeyZ: 'B', KeyS: 'X', KeyA: 'Y', KeyQ: 'L', KeyW: 'R',
  Enter: 'START', ShiftLeft: 'SELECT', ShiftRight: 'SELECT',
};
const REPEAT = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);
const ACTIVE_JOB = ['queued', 'downloading', 'installing'];
const TABS = ['library', 'store', 'settings'];
// How each tab can list its games, cycled with Y. The first is the default.
const VIEWS = {
  library: ['recent', 'az', 'categories'],
  store: ['latest', 'popular', 'az', 'categories'],
};
const COLUMNS = 3; // cards per row in the card layout
// A download's ring fills smoothly and takes at least this long, so even a
// small game that downloads in a blink shows its progress.
const MIN_DOWNLOAD_MS = 1600;
const RING = 2 * Math.PI * 17; // circumference of the progress ring
const CREDITS = 'Mert Cobanov · cobanov.dev\nmertcobanov@gmail.com · github.com/cobanov · x.com/mertcobanov';

const ui = {
  main: document.querySelector('main'),
  content: document.getElementById('content'),
  hints: document.getElementById('hints'),
  position: document.getElementById('position'),
  status: document.getElementById('status'),
  scrollbar: document.getElementById('scrollbar'),
  thumb: document.querySelector('#scrollbar .thumb'),
  dialog: document.getElementById('dialog'),
  picker: document.getElementById('picker'),
  toast: document.getElementById('toast'),
  tabs: [...document.querySelectorAll('.tab')],
};

const audio = new LauncherAudio();
const keyboard = new Keyboard(document.getElementById('keyboard'), t);
const celebration = new Celebration(document.getElementById('celebrate'));
const celebrations = []; // games waiting for their celebration

const state = {
  tab: 'library', // the launcher always opens on the Library
  focus: load('focus', { library: 0, store: 0, settings: 0 }),
  layout: load('layout2', { library: 'grid', store: 'grid' }),
  view: load('view', { library: 'recent', store: 'latest' }),
  library: [],
  store: { online: true, games: [], stores: [] },
  storeLoaded: false,
  settings: null,
  info: null,
  update: null, // { current, version, available, notes, error }
  jobs: {},
  dialog: null, // { text, onYes }
  picker: null, // { title, items: [{ label, value }], focus, onPick }
  detail: null, // id of the game whose detail screen is open
  status: null, // { time, battery, charging, wifi }
  rows: [], // rows of item indices as laid out on screen, for up/down
  settingRows: [], // the focusable rows of the settings tab, in order
  scroll: 0, // how far the current tab is scrolled, in px
};
state.focus.settings ??= 0;

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function save() {
  try {
    localStorage.setItem('focus', JSON.stringify(state.focus));
    localStorage.setItem('layout2', JSON.stringify(state.layout));
    localStorage.setItem('view', JSON.stringify(state.view));
  } catch {
    // Not important if it fails.
  }
}

async function api(path, method = 'GET', body) {
  const options = { method };
  if (body !== undefined) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ---------- Data shaping ----------

// Store categories. A game's free-form genre is mapped onto one of them by
// keyword, so "Arcade shooter" and "Shooter" land in the same section.
const CATEGORIES = [
  ['Shooter', /shoot|shmup|invader|blaster/],
  ['Racing', /rac(e|ing)|kart|driv/],
  ['Puzzle', /puzzle|tetris|match|block|sokoban|2048/],
  ['Platformer', /platform/],
  ['Sports', /sport|golf|soccer|football|tennis|basket/],
  ['Arcade', /arcade|runner|pinball|snake|breaker|flap|hopper|endless|casual/],
];

function genreOf(game) {
  const genre = (game.genre || '').toLowerCase();
  if (!genre) return 'Other';
  return CATEGORIES.find(([, pattern]) => pattern.test(genre))?.[0] ?? 'Other';
}

const byTitle = (a, b) => a.title.localeCompare(b.title);
const time = (iso) => Date.parse(iso || 0) || 0;
const SORTS = {
  recent: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || byTitle(a, b),
  latest: (a, b) => time(b.updated) - time(a.updated) || byTitle(a, b),
  popular: (a, b) => (b.downloads || 0) - (a.downloads || 0) || time(b.updated) - time(a.updated) || byTitle(a, b),
  az: byTitle,
};

// The games of a tab as sections for the current view: one section for a
// sorted view, or one per category. items() is the same games in order.
function sections(games, tab = state.tab) {
  const view = state.view[tab];
  if (view !== 'categories') {
    return games.length ? [{ name: view, games: [...games].sort(SORTS[view] ?? byTitle) }] : [];
  }
  const groups = new Map();
  for (const game of games) {
    const name = genreOf(game);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(game);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'Other') - (b === 'Other') || t(a).localeCompare(t(b)))
    .map(([name, list]) => ({ name, games: list.sort(byTitle) }));
}

function tabGames(tab = state.tab) {
  if (tab === 'library') return state.library;
  if (tab === 'store') return state.store.games;
  return [];
}

function items() {
  return sections(tabGames()).flatMap((s) => s.games);
}

// ---------- Rendering helpers ----------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function placeholder(game) {
  let hash = 0;
  for (const c of game.id) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const initials = game.title.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return { style: `background-image: linear-gradient(135deg, hsl(${hue} 60% 40%), hsl(${(hue + 50) % 360} 60% 25%))`, initials };
}

const covers = new Map(); // game id -> 'loading' | 'ok' | 'none'

function coverHtml(game) {
  if (covers.get(game.id) === 'ok') {
    return `<div class="cover" style="background-image: url(/api/cover/${game.id})"></div>`;
  }
  // A colored placeholder with initials until (and unless) a cover loads.
  const p = placeholder(game);
  return `<div class="cover" style="${p.style}"><span>${escapeHtml(p.initials)}</span></div>`;
}

function loadCovers() {
  for (const el of ui.content.querySelectorAll('[data-id] .cover')) {
    const id = el.closest('[data-id]').dataset.id;
    if (covers.has(id)) continue;
    covers.set(id, 'loading');
    const img = new Image();
    img.onload = () => {
      covers.set(id, 'ok');
      for (const c of ui.content.querySelectorAll(`[data-id="${id}"] .cover`)) {
        c.style.backgroundImage = `url(/api/cover/${id})`;
        c.textContent = '';
      }
    };
    img.onerror = () => covers.set(id, 'none');
    img.src = `/api/cover/${id}`;
  }
}

function sizeText(bytes) {
  if (!bytes) return '';
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(bytes / 1e3)} KB`;
}

// ---------- Downloads ----------

// Downloads started here, as shown on screen: game id -> { started, shown }.
const downloads = new Map();

function downloading(id) {
  return downloads.has(id) || ACTIVE_JOB.includes(state.jobs[id]?.state);
}

// How full the ring should be now: the real progress, but never faster than
// MIN_DOWNLOAD_MS. Unpacking shows as the last few percent.
function downloadTarget(id, now) {
  const job = state.jobs[id];
  const real = { downloading: (job?.progress ?? 0) * 0.92, installing: 0.96, done: 1 }[job?.state] ?? 0;
  const started = downloads.get(id)?.started ?? now - MIN_DOWNLOAD_MS;
  return Math.min(real, (now - started) / MIN_DOWNLOAD_MS);
}

function shownProgress(id) {
  return downloads.get(id)?.shown ?? (state.jobs[id]?.progress ?? 0) * 0.92;
}

// A circular progress ring with the percentage in the middle.
function ringHtml(id) {
  const shown = shownProgress(id);
  const spin = (performance.now() * 0.3) % 360;
  return `
    <div class="ring" data-ring="${id}">
      <svg viewBox="0 0 40 40">
        <circle class="track" cx="20" cy="20" r="17" />
        <circle class="spin" cx="20" cy="20" r="17" stroke-dasharray="10 ${RING}" transform="rotate(${spin} 20 20)" />
        <circle class="fill" cx="20" cy="20" r="17" stroke-dasharray="${RING}" stroke-dashoffset="${RING * (1 - shown)}" />
      </svg>
      <span>${Math.round(shown * 100)}%</span>
    </div>`;
}

function downloadLabel(id) {
  return state.jobs[id]?.state === 'installing' || shownProgress(id) > 0.95 ? t('installing') : t('downloading');
}

// Runs every frame: moves the rings toward their target and starts the
// celebration once a finished download's ring is full.
function tickDownloads(now) {
  if (!downloads.size) return;
  for (const [id, d] of downloads) {
    const job = state.jobs[id];
    if (job?.state === 'error') {
      downloads.delete(id);
      render();
      continue;
    }
    const target = downloadTarget(id, now);
    d.shown += (target - d.shown) * 0.12;
    if (target - d.shown < 0.002) d.shown = target;
    for (const el of document.querySelectorAll(`[data-ring="${id}"]`)) {
      el.querySelector('.fill').setAttribute('stroke-dashoffset', RING * (1 - d.shown));
      el.querySelector('.spin').setAttribute('transform', `rotate(${(now * 0.3) % 360} 20 20)`);
      el.querySelector('span').textContent = `${Math.round(d.shown * 100)}%`;
    }
    for (const el of document.querySelectorAll(`[data-ring-label="${id}"]`)) el.textContent = downloadLabel(id);
    if (job?.state === 'done' && d.shown >= 1) {
      downloads.delete(id);
      celebrations.push({ id, update: d.update });
      if (!celebration.active) celebrateNext();
    }
  }
}

function celebrateNext() {
  const next = celebrations.shift();
  if (!next) return;
  const game = state.library.find((g) => g.id === next.id) ?? state.store.games.find((g) => g.id === next.id);
  if (!game) return celebrateNext();
  const cover = covers.get(game.id) === 'ok'
    ? `<div class="cover" style="background-image: url(/api/cover/${game.id})"></div>`
    : `<div class="cover" style="${placeholder(game).style}"><span>${escapeHtml(placeholder(game).initials)}</span></div>`;
  const hint = (button, text) => `<span><b class="hint">${button}</b>${text}</span>`;
  celebration.show(
    `<div class="glow"></div>
     <div class="celebrate-cover">${cover}<div class="shine"></div><div class="check">✓</div></div>
     <div class="celebrate-heading">${t(next.update ? 'updatedHeading' : 'readyHeading')}</div>
     <div class="celebrate-title">${escapeHtml(game.title)}${next.update && game.version ? ` <small>v${escapeHtml(game.version)}</small>` : ''}</div>
     <div class="celebrate-hints">${hint('A', t('playNow'))}${hint('B', t('later'))}</div>`,
    game,
  );
  audio.sound('ready');
}

function stateHtml(game) {
  if (downloading(game.id)) {
    return `<div class="state progress">${ringHtml(game.id)}<span data-ring-label="${game.id}">${downloadLabel(game.id)}</span></div>`;
  }
  const job = state.jobs[game.id];
  if (job?.state === 'error') return `<div class="state error">${t('failed')}</div>`;
  if (game.update) return `<div class="state update">${t('update')}</div>`;
  if (game.installed) return `<div class="state installed">${t('installed')}</div>`;
  return `<div class="state">${sizeText(game.size) || t('get')}</div>`;
}

// Small label over a store card's cover: download progress or install state.
function badgeHtml(game) {
  if (downloading(game.id)) return `<div class="downloading">${ringHtml(game.id)}</div>`;
  const job = state.jobs[game.id];
  if (job?.state === 'error') return `<div class="badge error">${t('failed')}</div>`;
  if (game.update) return `<div class="badge update">${t('update')}</div>`;
  if (game.installed) return `<div class="badge installed">${t('installed')}</div>`;
  return '';
}

function cardHtml(game, index, focused) {
  const store = state.tab === 'store';
  const meta = store ? [game.author, sizeText(game.size)] : [game.author, game.version && `v${game.version}`];
  return `
    <div class="card${focused ? ' focus' : ''}" data-id="${game.id}" data-index="${index}">
      <div class="cover-wrap">${coverHtml(game)}${store ? badgeHtml(game) : ''}</div>
      <div class="title">${escapeHtml(game.title)}</div>
      <div class="meta">${escapeHtml(meta.filter(Boolean).join(' · '))}</div>
    </div>`;
}

function rowHtml(game, index, focused) {
  const meta = [game.author, game.version && `v${game.version}`];
  return `
    <div class="row${focused ? ' focus' : ''}" data-id="${game.id}" data-index="${index}">
      ${coverHtml(game)}
      <div class="info">
        <div class="title">${escapeHtml(game.title)}</div>
        <div class="meta">${escapeHtml(meta.filter(Boolean).join(' · '))}</div>
      </div>
      ${state.tab === 'store' ? stateHtml(game) : ''}
    </div>`;
}

// ---------- Detail screen ----------

function detailGame() {
  const id = state.detail;
  return state.store.games.find((g) => g.id === id) ?? state.library.find((g) => g.id === id);
}

function detailStateHtml(game, installed) {
  if (downloading(game.id) || state.jobs[game.id]?.state === 'error') return stateHtml(game);
  if (game.update) return `<div class="state update">${t('updateAvailable')}</div>`;
  if (installed) return `<div class="state installed">${t('installed')}</div>`;
  return '';
}

function detailHtml(game) {
  const installed = state.library.some((g) => g.id === game.id);
  const meta = [game.author, game.genre, game.version && `v${game.version}`, sizeText(game.size)].filter(Boolean);
  const controls = Object.entries(game.controls ?? {})
    .slice(0, 6)
    .map(([button, action]) => `<tr><td>${escapeHtml(button)}</td><td>${escapeHtml(action)}</td></tr>`)
    .join('');
  return `
    <div class="detail" data-id="${game.id}">
      <div class="detail-top">
        ${coverHtml(game)}
        <div class="detail-info">
          <div class="detail-title">${escapeHtml(game.title)}</div>
          <div class="meta">${meta.map(escapeHtml).join(' · ')}</div>
          ${detailStateHtml(game, installed)}
        </div>
      </div>
      ${game.description ? `<p class="description">${escapeHtml(game.description)}</p>` : ''}
      ${controls ? `<table class="controls">${controls}</table>` : ''}
    </div>`;
}

// ---------- Settings ----------

function onOff(value) {
  return `<span class="${value ? 'on' : 'off'}">${value ? t('on') : t('off')}</span>`;
}

function volumeBar(value) {
  const filled = Math.round(value * 10);
  return `<span class="volume">${'<i class="lit"></i>'.repeat(filled)}${'<i></i>'.repeat(10 - filled)}</span>`;
}

// The settings tab as sections of rows. Rows with an id can be focused.
function settingsSections() {
  const s = state.settings ?? {};
  const info = state.info ?? {};
  const stores = state.store.stores?.length ? state.store.stores : (s.stores ?? []).map((url) => ({ url, name: url }));
  return [
    {
      title: t('sound'),
      rows: [
        { id: 'music', label: t('menuMusic'), value: onOff(s.music) },
        { id: 'musicVolume', label: t('musicVolume'), value: volumeBar(s.musicVolume ?? 0.5) },
        { id: 'uiSounds', label: t('uiSounds'), value: onOff(s.uiSounds) },
      ],
    },
    {
      title: t('stores'),
      rows: [
        ...stores.map((store) => ({
          id: `store:${store.url}`,
          label: escapeHtml(store.name),
          sub: escapeHtml(store.url),
          value: store.online === false ? t('storeOfflineShort') : store.count !== undefined ? t('storeGames', { count: store.count }) : '',
        })),
        { id: 'addStore', label: `+ ${t('addStore')}`, value: '' },
      ],
    },
    {
      title: t('general'),
      rows: [{ id: 'language', label: t('language'), value: `‹ ${LANGUAGES[getLanguage()]} ›` }],
    },
    {
      title: t('saveData'),
      note: t('backupsWhere'),
      rows: [
        { id: 'backup', label: t('backupSaves'), value: '' },
        { id: 'restore', label: t('restoreSaves'), value: '' },
      ],
    },
    {
      title: t('developer'),
      rows: [{ id: 'showFps', label: t('showFps'), value: onOff(s.showFps) }],
    },
    {
      title: t('device'),
      rows: [
        { id: 'storage', label: t('storage'), value: info.free ? t('storageValue', { games: sizeText(info.games) || '0 KB', free: sizeText(info.free) }) : '' },
        { id: 'ip', label: t('ipAddress'), value: info.ip ?? '' },
      ],
    },
    {
      title: t('about'),
      note: CREDITS,
      rows: [
        { id: 'update', label: t('appUpdate'), value: updateValue() },
        { id: 'version', label: 'PocketVibe', value: info.version ? `${t('version')} ${info.version}` : '' },
      ],
    },
  ];
}

function updateValue() {
  const job = state.jobs.__app__;
  if (job && ACTIVE_JOB.includes(job.state)) {
    const label = job.state === 'installing' ? t('installing') : t('downloading');
    return `${label} <span class="bar inline"><span style="width:${Math.round(job.progress * 100)}%"></span></span>`;
  }
  const u = state.update;
  if (!u) return '';
  if (u.available) return `<span class="update-badge">${escapeHtml(t('versionAvailable', { version: u.version }))}</span>`;
  return u.error ? t('updateCheckFailed') : t('upToDate');
}

async function checkUpdate(force = false) {
  try {
    state.update = await api(`/api/update${force ? '?force' : ''}`);
  } catch {
    state.update = { available: false, error: 'offline' };
  }
}

function renderSettings() {
  state.rows = [];
  state.settingRows = [];
  let index = 0;
  let html = '';
  for (const section of settingsSections()) {
    html += `<div class="section-title">${escapeHtml(section.title)}</div><div class="settings">`;
    for (const row of section.rows) {
      state.rows.push([index]);
      state.settingRows.push(row.id);
      const focused = index === state.focus.settings;
      html += `
        <div class="setting${focused ? ' focus' : ''}" data-index="${index}">
          <div class="label">${row.label}${row.sub ? `<div class="sub">${row.sub}</div>` : ''}</div>
          <div class="value">${row.value}</div>
        </div>`;
      index++;
    }
    const note = section.note ? section.note.split('\n').map(escapeHtml).join('<br>') : '';
    html += `</div>${note ? `<div class="note">${note}</div>` : ''}`;
  }
  ui.content.innerHTML = html;
}

async function updateSettings(changes) {
  try {
    state.settings = await api('/api/settings', 'POST', changes);
    applySettings();
    const { music, uiSounds } = state.settings;
    if ((music || uiSounds) && audio.ctx?.state !== 'running') unlockAudio();
  } catch (e) {
    toast(e.message);
  }
  render();
}

function applySettings() {
  const s = state.settings;
  if (!s) return;
  setLanguage(s.language);
  audio.configure(s);
}

function addStore() {
  keyboard.open({
    title: t('storeAddress'),
    value: 'https://',
    onDone: async (url) => {
      if (!/^https?:\/\/\S+$/.test(url) || /^https?:\/\/$/.test(url)) {
        toast(t('badUrl'));
        return;
      }
      await updateSettings({ stores: [...state.settings.stores, url] });
      await refreshStore();
      render();
      toast(t('storeAdded'));
    },
    onCancel: () => renderHints(),
  });
  renderHints();
}

async function pickBackup() {
  const backups = await api('/api/saves');
  if (!backups.length) {
    toast(t('noBackups'));
    return;
  }
  openPicker(t('restoreSaves'), backups.map((b) => ({ label: b.name, value: sizeText(b.size) })), (item) => {
    showDialog(t('restoreConfirm', { name: item.label }), () => api(`/api/saves/restore/${item.label}`, 'POST'));
  });
}

function settingsAction(button) {
  const id = state.settingRows[state.focus.settings];
  const s = state.settings;
  if (!id || !s) return;
  const sideways = button === 'LEFT' || button === 'RIGHT';
  const step = button === 'LEFT' ? -1 : 1;

  if (id === 'music' || id === 'uiSounds' || id === 'showFps') {
    if (button === 'A' || sideways) updateSettings({ [id]: !s[id] });
  } else if (id === 'musicVolume') {
    if (sideways) updateSettings({ musicVolume: Math.round(Math.min(1, Math.max(0, s.musicVolume + step * 0.1)) * 10) / 10 });
    if (button === 'A') updateSettings({ musicVolume: s.musicVolume >= 1 ? 0.2 : Math.round((s.musicVolume + 0.2) * 10) / 10 });
  } else if (id === 'language') {
    if (button === 'A' || sideways) {
      const codes = Object.keys(LANGUAGES);
      const next = codes[(codes.indexOf(getLanguage()) + (button === 'LEFT' ? -1 : 1) + codes.length) % codes.length];
      updateSettings({ language: next });
    }
  } else if (id === 'addStore' && button === 'A') {
    addStore();
  } else if (id.startsWith('store:') && button === 'Y') {
    const url = id.slice(6);
    showDialog(t('removeStoreConfirm'), async () => {
      await updateSettings({ stores: s.stores.filter((u) => u !== url) });
      await refreshStore();
      render();
    });
  } else if (id === 'backup' && button === 'A') {
    api('/api/saves/backup', 'POST')
      .then(({ name }) => toast(t('backupDone', { name })))
      .catch((e) => toast(e.message));
  } else if (id === 'restore' && button === 'A') {
    pickBackup();
  } else if (id === 'update' && button === 'A') {
    if (state.update?.available) {
      showDialog(t('updateConfirm', { version: state.update.version }), async () => {
        await api('/api/update/install', 'POST');
        pollJobs();
      });
    } else {
      checkUpdate(true).then(() => {
        render();
        toast(state.update.available ? t('updateAvailableToast', { version: state.update.version }) : t(state.update.error ? 'updateCheckFailed' : 'upToDate'));
      });
    }
  }
}

// ---------- Rendering ----------

function renderStatus() {
  const s = state.status;
  if (!s) return;
  const battery = s.battery !== null ? `${s.charging ? '⚡' : ''}${s.battery}%` : '';
  ui.status.innerHTML = `<i class="wifi ${s.wifi ? 'on' : 'off'}" title="Wi-Fi"></i>${escapeHtml(s.time)}<span>${escapeHtml(battery)}</span>`;
}

function renderTabs() {
  for (const tab of ui.tabs) {
    const name = tab.dataset.tab;
    tab.classList.toggle('active', name === state.tab);
    const loaded = name === 'library' || (name === 'store' && state.storeLoaded);
    const count = loaded ? ` <span class="count">${tabGames(name).length}</span>` : '';
    const dot = name === 'settings' && state.update?.available ? ' <span class="dot"></span>' : '';
    tab.innerHTML = `${t(name)}${count}${dot}`;
  }
}

function render() {
  renderTabs();
  renderStatus();
  if (state.detail) {
    const game = detailGame();
    if (game) {
      ui.content.innerHTML = detailHtml(game);
      ui.content.style.transform = '';
      ui.scrollbar.hidden = true;
      ui.position.textContent = '';
      loadCovers();
      renderHints();
      return;
    }
    state.detail = null;
  }

  if (state.tab === 'settings') {
    renderSettings();
    scrollToFocus(true);
    renderHints();
    return;
  }

  const groups = sections(tabGames());
  const count = groups.reduce((n, s) => n + s.games.length, 0);
  const focus = Math.min(state.focus[state.tab], Math.max(count - 1, 0));
  state.focus[state.tab] = focus;
  state.rows = [];

  if (state.tab === 'store' && !state.storeLoaded) {
    ui.content.innerHTML = `<div class="empty">${t('loadingStore')}</div>`;
  } else if (!count) {
    ui.content.innerHTML =
      state.tab === 'library'
        ? `<div class="empty">${t('noGames')}</div>`
        : `<div class="empty">${state.store.online ? t('storeEmpty') : t('storeOffline')}</div>`;
  } else {
    const grid = state.layout[state.tab] === 'grid';
    const perRow = grid ? COLUMNS : 1;
    let index = 0;
    let html = '';
    for (const section of groups) {
      html += `<div class="section-title">${escapeHtml(t(section.name))}<span>${section.games.length}</span></div>`; // a view or a category
      html += `<div class="${grid ? 'grid' : 'list'}">`;
      section.games.forEach((game, i) => {
        if (i % perRow === 0) state.rows.push([]);
        state.rows.at(-1).push(index);
        html += grid ? cardHtml(game, index, index === focus) : rowHtml(game, index, index === focus);
        index++;
      });
      html += '</div>';
    }
    ui.content.innerHTML = html;
  }
  scrollToFocus(true);
  loadCovers();
  renderHints();
}

// Scroll just enough to show the focused item (and its section title when it
// is in a section's first row), then update the scrollbar and position.
function scrollToFocus(instant = false) {
  const count = state.rows.reduce((n, r) => n + r.length, 0);
  const focus = state.focus[state.tab];
  const viewport = ui.main.clientHeight - 12;
  const total = ui.content.scrollHeight;
  const el = ui.content.querySelector(`[data-index="${focus}"]`);
  if (el) {
    let top = el.offsetTop;
    const title = el.parentElement.previousElementSibling;
    if (title?.classList.contains('section-title') && el.offsetTop - el.parentElement.offsetTop < 10) {
      top = title.offsetTop; // first item of a section: keep its title in view
    }
    let bottom = el.offsetTop + el.offsetHeight + 8;
    if (focus === count - 1) bottom = total; // the last item: show any notes after it too
    if (top < state.scroll) state.scroll = top;
    else if (bottom > state.scroll + viewport) state.scroll = bottom - viewport;
  }
  state.scroll = Math.max(0, Math.min(state.scroll, Math.max(0, total - viewport)));
  ui.content.style.transition = instant ? 'none' : '';
  ui.content.style.transform = `translateY(${-state.scroll}px)`;

  ui.scrollbar.hidden = total <= viewport;
  if (!ui.scrollbar.hidden) {
    const track = ui.scrollbar.clientHeight;
    const thumb = Math.max(28, (viewport / total) * track);
    ui.thumb.style.height = `${thumb}px`;
    ui.thumb.style.transform = `translateY(${(state.scroll / (total - viewport)) * (track - thumb)}px)`;
  }
  ui.position.textContent = count && state.tab !== 'settings' ? `${focus + 1} / ${count}` : '';
}

function renderHints() {
  const hint = (button, text) => `<span><b class="hint">${button}</b>${text}</span>`;
  const parts = [];
  if (keyboard.active) {
    ui.hints.innerHTML = '';
    return;
  }
  if (state.dialog) {
    parts.push(hint('A', t('yes')), hint('B', t('no')));
  } else if (state.picker) {
    parts.push(hint('A', t('select')), hint('B', t('back')));
  } else if (state.detail) {
    const g = detailGame();
    const installed = state.library.some((l) => l.id === g?.id);
    if (g && !downloading(g.id)) parts.push(hint('A', g.update ? t('update') : installed ? t('play') : t('download')));
    if (installed) parts.push(hint('Y', t('remove')));
    parts.push(hint('B', t('back')));
  } else if (state.tab === 'settings') {
    const id = state.settingRows[state.focus.settings] ?? '';
    if (['music', 'uiSounds', 'showFps', 'musicVolume', 'language'].includes(id)) parts.push(hint('A', t('change')));
    if (['addStore', 'backup', 'restore'].includes(id)) parts.push(hint('A', t('select')));
    if (id === 'update') parts.push(hint('A', state.update?.available ? t('update') : t('check')));
    if (id.startsWith('store:')) parts.push(hint('Y', t('remove')));
    parts.push(hint('B', t('quit')));
  } else {
    const game = items()[state.focus[state.tab]];
    if (game) parts.push(hint('A', state.tab === 'library' ? t('play') : t('open')));
    if (game && state.tab === 'library') parts.push(hint('X', t('info')));
    if (state.tab === 'store') parts.push(hint('X', t('refresh')));
    if (game) parts.push(hint('Y', t(state.view[state.tab])));
    if (game) parts.push(hint('Sel', state.layout[state.tab] === 'grid' ? t('list') : t('cards')));
    parts.push(hint('B', t('quit')));
  }
  ui.hints.innerHTML = parts.join('');
}

function showDialog(text, onYes) {
  state.dialog = { text, onYes };
  ui.dialog.innerHTML = `<div class="box"><p>${escapeHtml(text)}</p><span class="hint">A</span> ${t('yes')} &nbsp;&nbsp; <span class="hint">B</span> ${t('no')}</div>`;
  ui.dialog.hidden = false;
  renderHints();
}

function closeDialog() {
  state.dialog = null;
  ui.dialog.hidden = true;
  renderHints();
}

function openPicker(title, list, onPick) {
  state.picker = { title, items: list, focus: 0, onPick };
  renderPicker();
  renderHints();
}

function renderPicker() {
  const p = state.picker;
  if (!p) {
    ui.picker.hidden = true;
    return;
  }
  const rows = p.items
    .map((item, i) => `<div class="pick${i === p.focus ? ' focus' : ''}"><span>${escapeHtml(item.label)}</span><span>${escapeHtml(item.value ?? '')}</span></div>`)
    .join('');
  ui.picker.innerHTML = `<div class="box"><p>${escapeHtml(p.title)}</p>${rows}</div>`;
  ui.picker.hidden = false;
}

let toastTimer = 0;
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast.hidden = true), 4500);
}

// ---------- Data ----------

async function refreshLibrary() {
  state.library = await api('/api/library');
}

async function refreshStore() {
  try {
    state.store = await api('/api/store');
  } catch {
    state.store = { online: false, games: [], stores: [] };
  }
  state.storeLoaded = true;
}

async function refreshStatus() {
  try {
    state.status = await api('/api/status');
    renderStatus();
  } catch {
    // The header simply keeps its last value.
  }
}

async function refreshInfo() {
  try {
    state.info = await api('/api/info');
  } catch {
    // Settings show empty values until it works.
  }
}

let polling = false;
async function pollJobs() {
  if (polling) return;
  polling = true;
  while (true) {
    const before = state.jobs;
    state.jobs = await api('/api/jobs');
    for (const [id, job] of Object.entries(state.jobs)) {
      if (id === '__app__') {
        if (before[id]?.state !== job.state && job.state === 'error') toast(t('updateFailed', { error: job.error }));
        continue;
      }
      if (before[id]?.state !== job.state && job.state === 'done') {
        await Promise.all([refreshLibrary(), refreshStore()]);
        const game = state.store.games.find((g) => g.id === id);
        if (!downloads.has(id)) toast(t('readyToPlay', { title: game?.title ?? id }));
      }
      if (before[id]?.state !== job.state && job.state === 'error') toast(t('downloadFailed', { error: job.error }));
    }
    if (!keyboard.active) render();
    const active = Object.values(state.jobs).some((j) => ACTIVE_JOB.includes(j.state));
    if (!active) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  polling = false;
}

// ---------- Actions ----------

async function play(game) {
  try {
    const { url } = await api(`/api/launch/${game.id}`, 'POST');
    save();
    location.href = url;
  } catch (e) {
    toast(t('cannotStart', { error: e.message }));
  }
}

async function install(game) {
  if (downloading(game.id)) return;
  // Show the ring right away, before the service answers.
  downloads.set(game.id, { started: performance.now(), shown: 0, update: Boolean(game.update) });
  state.jobs = { ...state.jobs, [game.id]: { state: 'queued', progress: 0, error: null } };
  render();
  try {
    await api(`/api/install/${game.id}`, 'POST');
    pollJobs();
  } catch (e) {
    downloads.delete(game.id);
    delete state.jobs[game.id];
    render();
    toast(t('cannotDownload', { error: e.message }));
  }
}

function confirmRemove(game) {
  showDialog(t('removeConfirm', { title: game.title }), async () => {
    await api(`/api/remove/${game.id}`, 'POST');
    await Promise.all([refreshLibrary(), refreshStore()]);
    render();
  });
}

function setFocus(next) {
  const current = state.focus[state.tab];
  if (next === current) return;
  state.focus[state.tab] = next;
  ui.content.querySelector(`[data-index="${current}"]`)?.classList.remove('focus');
  ui.content.querySelector(`[data-index="${next}"]`)?.classList.add('focus');
  scrollToFocus();
  renderHints();
  audio.sound('move');
}

// Up and down move between rows (skipping section titles), keeping the
// column where possible; left and right step through the games in order.
function moveRow(delta) {
  const focus = state.focus[state.tab];
  const row = state.rows.findIndex((r) => r.includes(focus));
  const target = state.rows[row + delta];
  if (!target) return;
  const column = state.rows[row].indexOf(focus);
  setFocus(target[Math.min(column, target.length - 1)]);
}

function switchTab(delta) {
  state.tab = TABS[(TABS.indexOf(state.tab) + delta + TABS.length) % TABS.length];
  state.scroll = 0;
  save();
  audio.sound('tab');
  render();
  if (state.tab === 'store') refreshStore().then(render);
  if (state.tab === 'settings') Promise.all([refreshInfo(), refreshStore()]).then(render);
}

function onButton(button) {
  audio.ensure();
  if (keyboard.handle(button)) {
    audio.sound(button === 'B' ? 'back' : button === 'A' ? 'select' : 'move');
    if (!keyboard.active) renderHints();
    return;
  }

  if (celebration.active) {
    if (button === 'A') {
      audio.sound('select');
      const game = celebration.hide();
      state.detail = null;
      play(game);
    } else if (button === 'B') {
      audio.sound('back');
      celebration.hide();
      render();
      celebrateNext();
    }
    return;
  }

  if (state.dialog) {
    if (button === 'A') {
      const { onYes } = state.dialog;
      closeDialog();
      audio.sound('select');
      onYes();
    } else if (button === 'B') {
      closeDialog();
      audio.sound('back');
    }
    return;
  }

  if (state.picker) {
    const p = state.picker;
    if (button === 'UP' || button === 'DOWN') {
      p.focus = Math.max(0, Math.min(p.items.length - 1, p.focus + (button === 'UP' ? -1 : 1)));
      renderPicker();
      audio.sound('move');
    } else if (button === 'A') {
      state.picker = null;
      renderPicker();
      audio.sound('select');
      p.onPick(p.items[p.focus]);
    } else if (button === 'B') {
      state.picker = null;
      renderPicker();
      renderHints();
      audio.sound('back');
    }
    return;
  }

  if (state.detail) {
    const g = detailGame();
    const installed = state.library.some((l) => l.id === g?.id);
    if (button === 'B') {
      state.detail = null;
      audio.sound('back');
      render();
    } else if (button === 'A' && g) {
      audio.sound('select');
      if (downloading(g.id)) return;
      if (!installed || g.update) install(g);
      else play(g);
    } else if (button === 'Y' && g && installed) {
      confirmRemove(g);
    }
    return;
  }

  if (button === 'L' || button === 'R') {
    switchTab(button === 'L' ? -1 : 1);
    return;
  }
  if (button === 'B') {
    audio.sound('back');
    showDialog(t('quitConfirm'), () => api('/api/quit', 'POST'));
    return;
  }

  if (state.tab === 'settings') {
    if (button === 'UP') moveRow(-1);
    else if (button === 'DOWN') moveRow(1);
    else {
      if (button === 'A') audio.sound('select');
      settingsAction(button);
    }
    return;
  }

  const list = items();
  const focus = state.focus[state.tab];
  const game = list[focus];

  switch (button) {
    case 'LEFT':
      if (focus > 0) setFocus(focus - 1);
      break;
    case 'RIGHT':
      if (focus < list.length - 1) setFocus(focus + 1);
      break;
    case 'UP':
      moveRow(-1);
      break;
    case 'DOWN':
      moveRow(1);
      break;
    case 'A':
      if (!game) break;
      audio.sound('select');
      if (state.tab === 'store') {
        state.detail = game.id;
        render();
      } else {
        play(game);
      }
      break;
    case 'X':
      if (state.tab === 'library' && game) {
        state.detail = game.id;
        audio.sound('select');
        render();
      } else if (state.tab === 'store') {
        state.storeLoaded = false;
        render();
        refreshStore().then(render);
      }
      break;
    case 'Y': {
      const views = VIEWS[state.tab];
      state.view[state.tab] = views[(views.indexOf(state.view[state.tab]) + 1) % views.length];
      state.focus[state.tab] = 0;
      state.scroll = 0;
      save();
      audio.sound('tab');
      render();
      break;
    }
    case 'SELECT':
      state.layout[state.tab] = state.layout[state.tab] === 'grid' ? 'list' : 'grid';
      save();
      audio.sound('tab');
      render();
      break;
  }
}

// ---------- Input ----------

const keys = new Set();
addEventListener('keydown', (e) => {
  // Any real key press lets the page start audio (see unlockAudio).
  audio.ensure();
  const b = KEYMAP[e.code];
  if (b) {
    keys.add(b);
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => keys.delete(KEYMAP[e.code]));

const held = new Map(); // button -> time it was first held
const repeatAt = new Map(); // button -> time of the next repeat
// Ignore buttons for a moment after loading, so the Start + Select used to
// leave a game does not act in the launcher.
const readyAt = performance.now() + 500;

function poll(now) {
  tickDownloads(now);
  const down = new Set(keys);
  for (const pad of navigator.getGamepads?.() ?? []) {
    if (!pad) continue;
    pad.buttons.forEach((b, i) => b.pressed && PADMAP[i] && down.add(PADMAP[i]));
    if (pad.axes[0] < -0.5) down.add('LEFT');
    if (pad.axes[0] > 0.5) down.add('RIGHT');
    if (pad.axes[1] < -0.5) down.add('UP');
    if (pad.axes[1] > 0.5) down.add('DOWN');
  }
  for (const b of [...held.keys()]) if (!down.has(b)) held.delete(b);
  for (const b of down) {
    if (!held.has(b)) {
      held.set(b, now);
      repeatAt.set(b, now + 350);
      if (now > readyAt) onButton(b);
    } else if (REPEAT.has(b) && now >= repeatAt.get(b)) {
      repeatAt.set(b, now + 110);
      onButton(b);
    }
  }
  requestAnimationFrame(poll);
}

// The browser only starts audio after a real key press, and gamepad buttons
// do not count. pocketvibed taps a virtual key (F13) for us; the keydown
// handler above then resumes the audio. Tries a few times, as the virtual
// keyboard can take a moment to appear.
async function unlockAudio() {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (audio.ctx?.state === 'running') return;
    await api('/api/unlock-audio', 'POST').catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
  }
}

// ---------- Start ----------

(async () => {
  try {
    state.settings = await api('/api/settings');
    applySettings();
  } catch {
    // Defaults until the service answers.
  }
  refreshStatus();
  setInterval(refreshStatus, 20000);
  render();
  await Promise.all([refreshLibrary(), refreshStore(), refreshInfo()]);
  render();
  const { notice } = await api('/api/notice').catch(() => ({}));
  if (notice === 'restored') toast(t('restored'));
  else if (notice?.startsWith('updated:')) toast(t('updatedTo', { version: notice.slice(8) }));
  else if (notice?.startsWith('restore-failed:')) toast(t('restoreFailed', { error: notice.slice(15) }));
  pollJobs();
  requestAnimationFrame(poll);
  if (state.settings?.music || state.settings?.uiSounds) unlockAudio();
  await checkUpdate();
  renderTabs();
  if (state.tab === 'settings') render();
  if (state.update?.available && !notice) toast(t('updateAvailableToast', { version: state.update.version }));
})();
