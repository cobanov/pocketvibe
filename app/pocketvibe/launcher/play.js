// The game shell: shows a game made for one 720x480 screen on any other.
// pocketvibed serves it on the game's own port, so the game in the frame keeps
// its origin, and with it its saves. The game gets a 720x480 frame, fitted to
// the main screen; a game that says it fits any screen shape ("responsive":
// true in its pocketvibe.json) gets a frame of the screen's shape instead, and
// its size as ?screen=WxH. A second screen shows the game's controls. A
// splash with the game's cover and name stays until the game has drawn.
//
//   /__pocketvibe__/play.html?entry=index.html&perf=0&lang=en&screens=0,0,640,480;640,0,640,480&primary=0
//
// &perflog is handed on to the game (PERF lines in the browser's log).

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
const splash = document.getElementById('splash');
const splashInner = splash.querySelector('.splash-inner');
let size = NATIVE; // the game's screen
let second = null; // { width, height, layout } when the game uses the second screen too
let swapped = false; // a two-screen game takes the other screen as its first (see gameScreens)

// Where the second screen is, seen from the first: the game lays its two
// screens out the same way, so one frame covers both.
function secondLayout(main, other) {
  if (other.x >= main.x + main.width && Math.abs(other.y - main.y) < 2 && other.height === main.height) return 'right';
  if (other.y >= main.y + main.height && Math.abs(other.x - main.x) < 2 && other.width === main.width) return 'below';
  return null;
}

function placeSplash(main) {
  place(splashInner, main, uiScale(main));
  splashInner.classList.add('placed');
}

// The game's first screen and the other one. Usually the first is the
// handheld's main screen (where EmulationStation was). But a game that uses
// two screens lays the second out right of or below the first, so when the
// main screen is the lower one (EmulationStation on an RG DS's bottom
// screen), the game takes the top screen as its first, as on a DS.
function gameScreens() {
  const { main, other } = fitScreens(screens, primary, innerWidth, innerHeight);
  return swapped ? { main: other, other: main } : { main, other };
}

function layout() {
  const { main, other } = gameScreens();
  placeSplash(main);
  if (second && other) {
    // One frame over both screens, scaled as one.
    const right = second.layout === 'right';
    const box = right
      ? { width: size.width + second.width, height: size.height }
      : { width: size.width, height: size.height + second.height };
    place(game, { x: main.x, y: main.y, width: right ? other.x + other.width - main.x : main.width, height: right ? main.height : other.y + other.height - main.y });
    frame.style.width = `${box.width}px`;
    frame.style.height = `${box.height}px`;
    frame.style.transform = `scale(${main.width / size.width})`;
    side.hidden = true;
    return;
  }
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

// The splash stays until the game has drawn a few frames: until its script has
// run, a game's page shows what it shows in a desktop browser (the starter
// project's keyboard legend, an empty frame). The game is on this page's
// origin, so its page can be watched. Ready once it has a canvas (or, for a
// page without one, a moment after it loaded) and three frames have gone by
// after that; the first frame is the one that compiles the shaders.
const SPLASH_MIN = 800; // ms: long enough not to flicker
const SPLASH_MAX = 15000; // ms: whatever happens, the game is shown then
const shellStart = performance.now();
let splashDone = false;

function hideSplash() {
  if (splashDone) return;
  splashDone = true;
  setTimeout(() => {
    splash.classList.add('gone');
    setTimeout(() => splash.remove(), 300);
  }, Math.max(0, SPLASH_MIN - (performance.now() - shellStart)));
}

function watchGame() {
  let win, doc;
  try {
    win = frame.contentWindow;
    doc = frame.contentDocument;
  } catch {
    return hideSplash();
  }
  if (!doc || win.location.href === 'about:blank') return;
  const loaded = performance.now();
  let frames = 0;
  const tick = () => {
    if (splashDone) return;
    if (frames > 0 || doc.querySelector('canvas') || performance.now() - loaded > 1500) frames++;
    if (frames >= 3) hideSplash();
    else win.requestAnimationFrame(tick);
  };
  win.requestAnimationFrame(tick);
}

function fillSplash(meta) {
  splash.querySelector('.splash-title').textContent = meta.title ?? '';
  splash.querySelector('.splash-meta').textContent = [meta.author, meta.genre].filter(Boolean).join(' · ');
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

// The splash shows from the start; the game's name follows its manifest.
placeSplash(fitScreens(screens, primary, innerWidth, innerHeight).main);
splash.querySelector('.splash-leave').innerHTML = `<b class="hint">START</b>+<b class="hint">SELECT</b>${t('holdToLeave')}`;
setTimeout(hideSplash, SPLASH_MAX);

const meta = await manifest();
fillSplash(meta);
if (meta.responsive === true) {
  const fitted = fitScreens(screens, primary, innerWidth, innerHeight);
  swapped = meta.screens === 2 && fitted.other !== null && !secondLayout(fitted.main, fitted.other) && secondLayout(fitted.other, fitted.main) !== null;
  const { main, other } = gameScreens();
  size = gameSize(main.width / main.height);
  // A game that uses two screens ("screens": 2) gets the second one too,
  // instead of the controls card, when it sits beside or below the first.
  const where = meta.screens === 2 && other ? secondLayout(main, other) : null;
  if (where) second = { ...gameSize(other.width / other.height), layout: where };
}
layout();
let entry = new URL(params.get('entry') || 'index.html', `${location.origin}/`);
if (entry.origin !== location.origin) entry = new URL('/index.html', location.origin); // a game runs on its own port only
entry.search = `?handheld${params.get('perf') === '1' ? '&perf' : ''}${params.has('perflog') ? '&perflog' : ''}${size === NATIVE ? '' : `&screen=${size.width}x${size.height}`}${second ? `&second=${second.width}x${second.height}&layout=${second.layout}` : ''}`;
frame.addEventListener('load', watchGame);
frame.src = entry.href;
fillSide(meta);
