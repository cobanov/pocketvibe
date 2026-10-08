import './page.js';

// The hero's handheld runs the real launcher in a frame. public/sw.js stands
// in for the handheld's local service, so the launcher works as it does there.

const LAUNCHER = '/demo/';
const stage = document.querySelector('.stage');
const handheld = stage.querySelector('.handheld');
const screen = handheld.querySelector('.screen');
const frame = screen.querySelector('iframe');
const still = screen.querySelector('.still');
const startButton = screen.querySelector('.start');
const off = screen.querySelector('.off');
const status = document.getElementById('status');
const keyList = document.getElementById('keys');
const covers = document.querySelector('.covers');
// On a phone the handheld's own buttons are the controls; elsewhere, the keyboard.
const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// The handheld's buttons, as the keyboard keys the launcher and games read.
const KEY_NAMES = {
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  KeyX: 'x',
  KeyZ: 'z',
  KeyS: 's',
  KeyA: 'a',
  KeyQ: 'q',
  KeyW: 'w',
  Enter: 'Enter',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
};

// Each button by the name games use for it in their controls, and its keys.
const BUTTONS = {
  'D-PAD': ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  UP: ['ArrowUp'],
  DOWN: ['ArrowDown'],
  LEFT: ['ArrowLeft'],
  RIGHT: ['ArrowRight'],
  A: ['KeyX'],
  B: ['KeyZ'],
  X: ['KeyS'],
  Y: ['KeyA'],
  L: ['KeyQ'],
  R: ['KeyW'],
  START: ['Enter'],
  SELECT: ['ShiftLeft'],
};
const KEY_LABELS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'Enter', ShiftLeft: 'Shift' };
const BUTTON_LABELS = { 'D-PAD': 'D-pad', UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→', START: 'Start', SELECT: 'Select' };

let mode = 'launcher'; // or 'game', 'off', or 'still' when only a picture can be shown
let gameId = null;
let games = []; // the playable games, from public/play/catalog.json

function fit() {
  frame.style.transform = `scale(${screen.clientWidth / 720})`;
}
new ResizeObserver(fit).observe(screen);

const inGame = () => frame.contentWindow?.location.pathname.startsWith('/play/');

// ---------- Buttons ----------

const held = new Set();
let homeTimer = null;

// Light a pressed button, and its key in the help under the handheld. Leave a
// game when Start and Select are held for a second, as on the handheld.
function show(code, down) {
  const key = code === 'ShiftRight' ? 'ShiftLeft' : code;
  for (const el of stage.querySelectorAll(`[data-key~="${key}"]`)) el.classList.toggle('pressed', down);
  if (down) held.add(code);
  else held.delete(code);
  const both = held.has('Enter') && (held.has('ShiftLeft') || held.has('ShiftRight'));
  if (both && !homeTimer) homeTimer = setTimeout(goHome, 1000);
  if (!both) {
    clearTimeout(homeTimer);
    homeTimer = null;
  }
}

function send(code, down) {
  show(code, down);
  if (!off.hidden) {
    if (down && code === 'KeyX') reopen();
    return;
  }
  const win = frame.contentWindow;
  if (!win || !frame.src) return;
  win.dispatchEvent(new win.KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: KEY_NAMES[code], bubbles: true }));
}

function tap(code) {
  send(code, true);
  setTimeout(() => send(code, false), 120);
}

for (const button of handheld.querySelectorAll('[data-key]')) {
  const code = button.dataset.key;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    wake();
    send(code, true);
  });
  const release = () => held.has(code) && send(code, false);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  // Enter or Space on a focused button.
  button.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    wake();
    tap(code);
  });
}

// With the handheld focused, the keyboard plays it without scrolling the page.
for (const type of ['keydown', 'keyup']) {
  handheld.addEventListener(type, (e) => {
    if (e.target !== handheld || !(e.code in KEY_NAMES)) return;
    e.preventDefault();
    wake();
    if (!e.repeat) send(e.code, type === 'keydown');
  });
}

// ---------- Before the first press ----------

// Until someone plays, the screen invites a press of A and the d-pad walks
// the Library's cards on its own, so the handheld shows it is live.
const WALK = ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft'];
let woke = false;
let walkTimer = null;
let walkStep = 0;
let inView = false;
let pointerOver = false;

function walk() {
  clearTimeout(walkTimer);
  if (woke || calm.matches || !inView || pointerOver || document.hidden || mode !== 'launcher') return;
  walkTimer = setTimeout(() => {
    tap(WALK[walkStep++ % WALK.length]);
    walk();
  }, 2200);
}

function wake() {
  if (woke) return;
  woke = true;
  clearTimeout(walkTimer);
  handheld.classList.remove('attract');
  stage.classList.add('played');
  startButton.hidden = true;
  render();
}

startButton.addEventListener('click', () => {
  wake();
  handheld.focus({ preventScroll: true });
  tap('KeyX');
});

new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  walk();
}, { threshold: 0.5 }).observe(handheld);
handheld.addEventListener('pointerenter', () => {
  pointerOver = true;
  walk();
});
handheld.addEventListener('pointerleave', () => {
  pointerOver = false;
  walk();
});
document.addEventListener('visibilitychange', walk);

// ---------- The screen ----------

frame.addEventListener('load', () => {
  const win = frame.contentWindow;
  // Keys typed into the screen itself light the buttons too.
  for (const type of ['keydown', 'keyup']) {
    win.addEventListener(type, (e) => {
      if (!e.isTrusted || !(e.code in KEY_NAMES)) return;
      wake();
      show(e.code, type === 'keydown');
    });
  }
  gameId = inGame() ? win.location.pathname.split('/')[2] : null;
  mode = gameId ? 'game' : 'launcher';
  if (gameId) wake();
  else if (!woke) {
    startButton.hidden = false;
    handheld.classList.add('attract');
  }
  for (const button of covers.querySelectorAll('button')) button.setAttribute('aria-current', button.dataset.id === gameId);
  render();
  fit();
  walk();
});

function goHome() {
  homeTimer = null;
  if (!inGame()) return;
  for (const code of [...held]) show(code, false);
  frame.src = LAUNCHER;
}

// Quit in the launcher switches the handheld off.
new BroadcastChannel('pocketvibe-demo').addEventListener('message', (e) => {
  if (e.data !== 'quit') return;
  frame.hidden = true;
  off.hidden = false;
  mode = 'off';
  render();
});

function reopen() {
  off.hidden = true;
  frame.hidden = false;
  frame.src = LAUNCHER;
}
off.addEventListener('click', reopen);

function play(id) {
  const game = games.find((g) => g.id === id);
  wake();
  off.hidden = true;
  still.hidden = true;
  frame.hidden = false;
  frame.src = `/play/${id}/${game.entry || 'index.html'}?handheld`;
  handheld.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'center' });
  handheld.focus({ preventScroll: true });
}

async function start() {
  try {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    frame.src = LAUNCHER;
  } catch {
    // No service workers here (some private windows): show a picture instead.
    // The games below still play, as they need nothing from the service.
    frame.hidden = true;
    still.hidden = false;
    mode = 'still';
    render();
  }
}

// ---------- What to press ----------

function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children);
  return node;
}

// A button's keys on a keyboard, or the button itself on a phone.
function caps(name) {
  if (touch) {
    const cap = el('b', 'btn', BUTTON_LABELS[name] ?? name);
    cap.dataset.key = BUTTONS[name].join(' ');
    return [cap];
  }
  return BUTTONS[name].map((code) => {
    const key = el('kbd', '', KEY_LABELS[code] ?? code.slice(3));
    key.dataset.key = code;
    return key;
  });
}

// "A / UP" names two buttons; anything else stays as the game wrote it.
function capsFor(names) {
  const parts = names.toUpperCase().split(/\s*\/\s*/);
  if (!parts.every((p) => p in BUTTONS)) return [el('b', 'btn', names)];
  return parts.flatMap(caps);
}

function capturing() {
  return handheld.contains(document.activeElement);
}

function statusLine() {
  if (mode === 'still') return ['The PocketVibe launcher on the handheld.'];
  if (mode === 'off') return ['PocketVibe is closed.'];
  if (mode === 'game') {
    const title = games.find((g) => g.id === gameId)?.title ?? 'a game';
    return ['Playing ', el('b', '', title), '. Hold ', ...caps('START'), ' and ', ...caps('SELECT'), ' to go back to the launcher.'];
  }
  if (!woke) return ["The real launcher, with every game in the store."];
  if (touch) return ["Tap the handheld's buttons to play."];
  return [capturing() ? 'Your keyboard plays the handheld.' : 'Click the handheld to play it with your keyboard.'];
}

function keyRows() {
  if (mode === 'game') {
    const controls = games.find((g) => g.id === gameId)?.controls ?? {};
    return Object.entries(controls).map(([names, does]) => [capsFor(names), does]);
  }
  if (mode !== 'launcher' || touch) return [];
  // Each key next to the handheld button it presses.
  return [['D-PAD'], ['A'], ['B'], ['X'], ['Y'], ['L', 'R'], ['START'], ['SELECT']].map((names) => [
    names.flatMap(caps),
    names.map((n) => el('b', 'btn', BUTTON_LABELS[n] ?? n)),
  ]);
}

function render() {
  status.replaceChildren(...statusLine());
  keyList.className = mode === 'game' ? 'controls' : '';
  keyList.replaceChildren(...keyRows().map(([keys, does]) => el('div', '', el('dt', '', ...keys), el('dd', '', ...[does].flat()))));
}

for (const type of ['focusin', 'focusout']) document.addEventListener(type, () => setTimeout(render));
addEventListener('blur', () => setTimeout(render));

// ---------- The store's games ----------

async function shelf() {
  games = await fetch('/play/catalog.json')
    .then((r) => r.json())
    .catch(() => []);
  covers.replaceChildren(
    ...games.map((game) => {
      const img = el('img');
      img.src = `/play/${game.id}/cover.png`;
      img.alt = '';
      img.loading = 'lazy';
      const button = el('button', '', img, el('strong', '', game.title), el('span', '', game.genre || 'Game'));
      button.type = 'button';
      button.dataset.id = game.id;
      button.title = game.description || '';
      button.setAttribute('aria-current', game.id === gameId);
      button.addEventListener('click', () => play(game.id));
      return el('li', '', button);
    }),
  );
  render();
}

render();
shelf();
start();
