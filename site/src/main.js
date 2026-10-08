// The hero's handheld runs the real launcher in a frame. public/sw.js stands
// in for the handheld's local service, so the launcher works as it does there.

const LAUNCHER = '/demo/';
const handheld = document.querySelector('.handheld');
const screen = handheld.querySelector('.screen');
const frame = screen.querySelector('iframe');
const still = screen.querySelector('.still');
const off = screen.querySelector('.off');
const caption = document.getElementById('caption');
const captionText = caption.textContent.trim().replace(/\s+/g, ' ');

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

function fit() {
  frame.style.transform = `scale(${screen.clientWidth / 720})`;
}
new ResizeObserver(fit).observe(screen);

const inGame = () => frame.contentWindow?.location.pathname.startsWith('/play/');

// ---------- Buttons ----------

const held = new Set();
let homeTimer = null;

// Light a pressed button, and leave a game when Start and Select are held
// for a second, as on the handheld.
function show(code, down) {
  const key = code === 'ShiftRight' ? 'ShiftLeft' : code;
  for (const button of handheld.querySelectorAll(`[data-key="${key}"]`)) button.classList.toggle('pressed', down);
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

for (const button of handheld.querySelectorAll('[data-key]')) {
  const code = button.dataset.key;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    send(code, true);
  });
  const release = () => held.has(code) && send(code, false);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  // Enter or Space on a focused button.
  button.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    send(code, true);
    setTimeout(() => send(code, false), 120);
  });
}

// With the handheld focused, the keyboard plays it without scrolling the page.
for (const type of ['keydown', 'keyup']) {
  handheld.addEventListener(type, (e) => {
    if (e.target !== handheld || !(e.code in KEY_NAMES)) return;
    e.preventDefault();
    if (!e.repeat) send(e.code, type === 'keydown');
  });
}

// ---------- The screen ----------

frame.addEventListener('load', () => {
  const win = frame.contentWindow;
  // Keys typed into the screen itself light the buttons too.
  for (const type of ['keydown', 'keyup']) {
    win.addEventListener(type, (e) => e.isTrusted && e.code in KEY_NAMES && show(e.code, type === 'keydown'));
  }
  caption.textContent = inGame() ? 'Hold Start and Select for a second to go back to the launcher.' : captionText;
  fit();
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
});

function reopen() {
  off.hidden = true;
  frame.hidden = false;
  frame.src = LAUNCHER;
}
off.addEventListener('click', reopen);

async function start() {
  try {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    frame.src = LAUNCHER;
  } catch {
    // No service workers here (some private windows): show a picture instead.
    frame.hidden = true;
    still.hidden = false;
    caption.textContent = 'The PocketVibe launcher on the handheld.';
  }
}
start();

// ---------- Copy buttons ----------

for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    await navigator.clipboard.writeText(button.previousElementSibling.textContent.trim());
    button.textContent = 'Copied';
    setTimeout(() => (button.textContent = 'Copy'), 1500);
  });
}
