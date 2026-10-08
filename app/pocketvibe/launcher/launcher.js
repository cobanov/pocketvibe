// PocketVibe launcher: Library and Store, driven by the handheld's buttons.
// Talks only to pocketvibed on the same origin.

const PADMAP = { 0: 'B', 1: 'A', 2: 'X', 3: 'Y', 4: 'L', 5: 'R', 8: 'SELECT', 9: 'START', 12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT' };
const KEYMAP = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  KeyX: 'A', KeyZ: 'B', KeyS: 'X', KeyA: 'Y', KeyQ: 'L', KeyW: 'R',
  Enter: 'START', ShiftLeft: 'SELECT', ShiftRight: 'SELECT',
};
const REPEAT = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);
const COLUMNS = 3;
const ROWS_VISIBLE = { library: 2, store: 4 };

const ui = {
  content: document.getElementById('content'),
  hints: document.getElementById('hints'),
  status: document.getElementById('status'),
  dialog: document.getElementById('dialog'),
  toast: document.getElementById('toast'),
  tabs: [...document.querySelectorAll('.tab')],
};

const state = {
  tab: load('tab', 'library'),
  focus: load('focus', { library: 0, store: 0 }),
  library: [],
  store: { online: true, games: [] },
  storeLoaded: false,
  jobs: {},
  dialog: null, // { text, onYes }
  detail: null, // id of the game whose detail screen is open
  status: null, // { time, battery, charging, wifi }
};

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
    localStorage.setItem('tab', JSON.stringify(state.tab));
    localStorage.setItem('focus', JSON.stringify(state.focus));
  } catch {
    // Not important if it fails.
  }
}

async function api(path, method = 'GET') {
  const res = await fetch(path, { method });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// ---------- Rendering ----------

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
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(bytes / 1e3)} KB`;
}

function stateHtml(game) {
  const job = state.jobs[game.id];
  if (job && ['queued', 'downloading', 'installing'].includes(job.state)) {
    const label = job.state === 'installing' ? 'Installing' : 'Downloading';
    return `<div class="state">${label}<div class="bar"><span style="width:${Math.round(job.progress * 100)}%"></span></div></div>`;
  }
  if (job?.state === 'error') return `<div class="state error">Failed</div>`;
  if (game.update) return `<div class="state update">Update</div>`;
  if (game.installed) return `<div class="state installed">Installed</div>`;
  return `<div class="state">${sizeText(game.size) || 'Get'}</div>`;
}

function renderStatus() {
  const s = state.status;
  if (!s) return;
  const parts = [s.time];
  parts.push(s.wifi ? 'Wi-Fi' : 'No Wi-Fi');
  if (s.battery !== null) parts.push(`${s.charging ? '⚡' : ''}${s.battery}%`);
  ui.status.textContent = parts.join('   ');
}

function items() {
  return state.tab === 'library' ? state.library : state.store.games;
}

function detailGame() {
  const id = state.detail;
  return state.store.games.find((g) => g.id === id) ?? state.library.find((g) => g.id === id);
}

function detailStateHtml(game, installed) {
  const job = state.jobs[game.id];
  if (job && ['queued', 'downloading', 'installing', 'error'].includes(job.state)) return stateHtml(game);
  if (game.update) return `<div class="state update">Update available</div>`;
  if (installed) return `<div class="state installed">Installed</div>`;
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

function render() {
  ui.tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
  if (state.detail) {
    const game = detailGame();
    if (game) {
      ui.content.innerHTML = detailHtml(game);
      loadCovers();
      renderHints();
      return;
    }
    state.detail = null;
  }
  const list = items();
  const focus = Math.min(state.focus[state.tab], Math.max(list.length - 1, 0));
  state.focus[state.tab] = focus;

  if (state.tab === 'library') {
    ui.content.innerHTML = list.length
      ? `<div class="grid">${list
          .map((g, i) => `<div class="card${i === focus ? ' focus' : ''}" data-id="${g.id}">${coverHtml(g)}<div class="title">${escapeHtml(g.title)}</div></div>`)
          .join('')}</div>`
      : `<div class="empty">No games yet.<br>Press R to open the Store.</div>`;
  } else {
    ui.content.innerHTML = !state.storeLoaded
      ? `<div class="empty">Loading the store...</div>`
      : list.length
        ? `<div class="list">${list
            .map((g, i) => `
              <div class="row${i === focus ? ' focus' : ''}" data-id="${g.id}">
                ${coverHtml(g)}
                <div class="info">
                  <div class="title">${escapeHtml(g.title)}</div>
                  <div class="meta">${escapeHtml(g.author || '')}${g.version ? ` · v${escapeHtml(g.version)}` : ''}</div>
                </div>
                ${stateHtml(g)}
              </div>`)
            .join('')}</div>`
        : `<div class="empty">${state.store.online ? 'The store is empty.' : 'Cannot reach the store.<br>Check the Wi-Fi connection.'}</div>`;
  }
  scrollToFocus();
  loadCovers();
  renderHints();
}

function scrollToFocus() {
  const focus = state.focus[state.tab];
  const perRow = state.tab === 'library' ? COLUMNS : 1;
  const row = Math.floor(focus / perRow);
  const firstVisible = Math.max(0, row - ROWS_VISIBLE[state.tab] + 1);
  const container = ui.content.firstElementChild;
  if (!container) return;
  const step = state.tab === 'library' ? 168 : 84; // row height + gap
  container.style.transform = `translateY(${-firstVisible * step}px)`;
}

function renderHints() {
  const hint = (button, text) => `<span><b class="hint">${button}</b>${text}</span>`;
  const game = items()[state.focus[state.tab]];
  const parts = [];
  if (state.dialog) {
    parts.push(hint('A', 'Yes'), hint('B', 'No'));
  } else if (state.detail) {
    const g = detailGame();
    const installed = state.library.some((l) => l.id === g?.id);
    if (g) parts.push(hint('A', g.update ? 'Update' : installed ? 'Play' : 'Download'));
    if (installed) parts.push(hint('Y', 'Remove'));
    parts.push(hint('B', 'Back'));
  } else if (state.tab === 'library') {
    if (game) parts.push(hint('A', 'Play'), hint('X', 'Info'), hint('Y', 'Remove'));
    parts.push(hint('B', 'Quit'));
  } else {
    if (game) parts.push(hint('A', 'Open'));
    parts.push(hint('X', 'Refresh'), hint('B', 'Quit'));
  }
  ui.hints.innerHTML = parts.join('');
}

function showDialog(text, onYes) {
  state.dialog = { text, onYes };
  ui.dialog.innerHTML = `<div class="box"><p>${escapeHtml(text)}</p><span class="hint">A</span> Yes &nbsp;&nbsp; <span class="hint">B</span> No</div>`;
  ui.dialog.hidden = false;
  renderHints();
}

function closeDialog() {
  state.dialog = null;
  ui.dialog.hidden = true;
  renderHints();
}

let toastTimer = 0;
function toast(text) {
  ui.toast.textContent = text;
  ui.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast.hidden = true), 3000);
}

// ---------- Data ----------

async function refreshLibrary() {
  state.library = await api('/api/library');
}

async function refreshStore() {
  try {
    state.store = await api('/api/store');
  } catch {
    state.store = { online: false, games: [] };
  }
  state.storeLoaded = true;
}

let polling = false;
async function pollJobs() {
  if (polling) return;
  polling = true;
  while (true) {
    const before = state.jobs;
    state.jobs = await api('/api/jobs');
    for (const [id, job] of Object.entries(state.jobs)) {
      if (before[id]?.state !== job.state && job.state === 'done') {
        await Promise.all([refreshLibrary(), refreshStore()]);
        toast(`${items().find((g) => g.id === id)?.title ?? id} is ready to play.`);
      }
      if (before[id]?.state !== job.state && job.state === 'error') toast(`Download failed: ${job.error}`);
    }
    render();
    const active = Object.values(state.jobs).some((j) => ['queued', 'downloading', 'installing'].includes(j.state));
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
    toast(`Cannot start: ${e.message}`);
  }
}

async function install(game) {
  try {
    await api(`/api/install/${game.id}`, 'POST');
    pollJobs();
  } catch (e) {
    toast(`Cannot download: ${e.message}`);
  }
}

function confirmRemove(game) {
  showDialog(`Remove ${game.title}?`, async () => {
    await api(`/api/remove/${game.id}`, 'POST');
    await Promise.all([refreshLibrary(), refreshStore()]);
    render();
  });
}

function onButton(button) {
  if (state.dialog) {
    if (button === 'A') {
      const { onYes } = state.dialog;
      closeDialog();
      onYes();
    } else if (button === 'B') {
      closeDialog();
    }
    return;
  }

  if (state.detail) {
    const g = detailGame();
    const installed = state.library.some((l) => l.id === g?.id);
    if (button === 'B') {
      state.detail = null;
      render();
    } else if (button === 'A' && g) {
      if (!installed || g.update) install(g);
      else play(g);
    } else if (button === 'Y' && g && installed) {
      confirmRemove(g);
    }
    return;
  }

  const list = items();
  const perRow = state.tab === 'library' ? COLUMNS : 1;
  const focus = state.focus[state.tab];
  const game = list[focus];
  const move = (delta) => {
    const next = Math.max(0, Math.min(list.length - 1, focus + delta));
    if (next === focus) return;
    state.focus[state.tab] = next;
    const nodes = ui.content.querySelectorAll('[data-id]');
    nodes[focus]?.classList.remove('focus');
    nodes[next]?.classList.add('focus');
    scrollToFocus();
    renderHints();
  };

  switch (button) {
    case 'LEFT':
      if (perRow > 1) move(-1);
      break;
    case 'RIGHT':
      if (perRow > 1) move(1);
      break;
    case 'UP':
      move(-perRow);
      break;
    case 'DOWN':
      move(perRow);
      break;
    case 'L':
    case 'R':
      state.tab = state.tab === 'library' ? 'store' : 'library';
      save();
      render();
      if (state.tab === 'store') refreshStore().then(render);
      break;
    case 'A':
      if (!game) break;
      if (state.tab === 'store') {
        state.detail = game.id;
        render();
      } else {
        play(game);
      }
      break;
    case 'Y':
      if (game && (state.tab === 'library' || game.installed)) confirmRemove(game);
      break;
    case 'X':
      if (state.tab === 'library' && game) {
        state.detail = game.id;
        render();
      } else if (state.tab === 'store') {
        state.storeLoaded = false;
        render();
        refreshStore().then(render);
      }
      break;
    case 'B':
      showDialog('Quit PocketVibe?', () => api('/api/quit', 'POST'));
      break;
  }
}

// ---------- Input ----------

const keys = new Set();
addEventListener('keydown', (e) => {
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

async function refreshStatus() {
  try {
    state.status = await api('/api/status');
    renderStatus();
  } catch {
    // The header simply keeps its last value.
  }
}

// ---------- Start ----------

(async () => {
  refreshStatus();
  setInterval(refreshStatus, 20000);
  render();
  await Promise.all([refreshLibrary(), refreshStore()]);
  render();
  pollJobs();
  requestAnimationFrame(poll);
})();
