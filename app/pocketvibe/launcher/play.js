// The game shell: shows a game made for one 720x480 screen on any other.
// pocketvibed serves it on the game's own port, so the game in the frame keeps
// its origin, and with it its saves. The game gets a 720x480 frame, fitted to
// the main screen; a game that says it fits any screen shape ("responsive":
// true in its pocketvibe.json) gets a frame of the screen's shape instead, and
// its size as ?screen=WxH. A second screen shows the game's controls.
//
//   /__pocketvibe__/play.html?entry=index.html&perf=0&lang=en&screens=0,0,640,480;640,0,640,480&primary=0

import { setLanguage, t } from './i18n.js';
import { NATIVE, fitScreens, gameSize, parseScreens, place, uiScale } from './screens.js';

const params = new URLSearchParams(location.search);
setLanguage(params.get('lang') || 'en');
const screens = parseScreens(params.get('screens'));
const primary = Number(params.get('primary')) || 0;

const game = document.getElementById('game');
const frame = document.getElementById('frame');
const side = document.getElementById('side');
const inner = side.querySelector('.side-inner');
let size = NATIVE; // the game's screen

function layout() {
  const { main, other } = fitScreens(screens, primary, innerWidth, innerHeight);
  place(game, main);
  frame.style.width = `${size.width}px`;
  frame.style.height = `${size.height}px`;
  const scale = Math.min(main.width / size.width, main.height / size.height);
  const x = Math.round((main.width - size.width * scale) / 2);
  const y = Math.round((main.height - size.height * scale) / 2);
  frame.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  side.hidden = !other;
  if (other) {
    place(side, other);
    place(inner, { x: 0, y: 0, width: other.width, height: other.height }, uiScale(other));
  }
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The game's listing sits next to its files (openboy.json in older games).
async function manifest() {
  for (const name of ['pocketvibe.json', 'openboy.json']) {
    try {
      const res = await fetch(`/${name}`, { cache: 'no-cache' });
      if (res.ok) return await res.json();
    } catch {
      // Try the next name.
    }
  }
  return {};
}

function fillSide(meta) {
  if (meta.title) document.title = meta.title;
  const controls = Object.entries(meta.controls ?? {})
    .slice(0, 8)
    .map(([button, action]) => `<tr><td>${escapeHtml(button)}</td><td>${escapeHtml(action)}</td></tr>`)
    .join('');
  inner.innerHTML = `
    <div class="side-top">
      <div class="side-cover"></div>
      <div>
        <div class="side-title">${escapeHtml(meta.title ?? '')}</div>
        <div class="side-meta">${[meta.author, meta.genre].filter(Boolean).map(escapeHtml).join(' · ')}</div>
      </div>
    </div>
    ${controls ? `<div class="side-heading">${t('controls')}</div><table class="controls">${controls}</table>` : ''}
    <div class="leave"><b class="hint">START</b>+<b class="hint">SELECT</b>${t('holdToLeave')}</div>`;
  const cover = new Image();
  cover.onload = () => (inner.querySelector('.side-cover').style.backgroundImage = 'url(/cover.png)');
  cover.src = '/cover.png';
}

// Keys (and the handheld's arrows, which arrive as keys) go to the focused
// frame, so keep the game focused, even after a touch on the second screen.
const focusGame = () => frame.contentWindow?.focus();
frame.addEventListener('load', focusGame);
addEventListener('focus', focusGame);
addEventListener('pointerdown', (e) => {
  e.preventDefault();
  focusGame();
});
addEventListener('resize', layout);

const meta = await manifest();
if (meta.responsive === true) {
  const { main } = fitScreens(screens, primary, innerWidth, innerHeight);
  size = gameSize(main.width / main.height);
}
layout();
let entry = new URL(params.get('entry') || 'index.html', `${location.origin}/`);
if (entry.origin !== location.origin) entry = new URL('/index.html', location.origin); // a game runs on its own port only
entry.search = `?handheld${params.get('perf') === '1' ? '&perf' : ''}${size === NATIVE ? '' : `&screen=${size.width}x${size.height}`}`;
frame.src = entry.href;
fillSide(meta);
