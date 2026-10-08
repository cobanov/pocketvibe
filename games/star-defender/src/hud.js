// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes or something happens (a banner, a score pop, a flash); the
// animations themselves run in CSS.

const POPS = 4;

// Restarts a CSS animation by taking its class off and putting it back.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // forces a style flush so the animation starts over
  el.classList.add(cls);
}

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div class="hud-row">
      <span class="left"><small>SCORE</small> <b id="score"></b></span>
      <span class="center"><small>WAVE</small> <b id="wave"></b></span>
      <span class="right" id="lives"></span>
    </div>
    <div id="banner"></div>
    <div id="pops">${'<div class="pop"></div>'.repeat(POPS)}</div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const waveEl = root.querySelector('#wave');
  const livesEl = root.querySelector('#lives');
  const bannerEl = root.querySelector('#banner');
  const flashEl = root.querySelector('#flash');
  const messageEl = root.querySelector('#message');
  const pops = root.querySelectorAll('.pop');

  let shownScore = -1;
  let shownWave = -1;
  let shownLives = -1;
  let nextPop = 0;

  return {
    score(value) {
      if (value === shownScore) return;
      shownScore = value;
      scoreEl.textContent = value;
    },

    wave(value) {
      if (value === shownWave) return;
      shownWave = value;
      waveEl.textContent = value;
    },

    lives(value) {
      if (value === shownLives) return;
      shownLives = value;
      livesEl.textContent = '▲'.repeat(Math.max(0, value));
    },

    // Freezes the banner, pop and flash animations while the game is paused.
    paused(value) {
      root.classList.toggle('paused', value);
    },

    showStats(visible) {
      row.hidden = !visible;
    },

    // A big line of text that zooms in and fades out by itself.
    banner(text) {
      bannerEl.textContent = text;
      replay(bannerEl, 'show');
    },

    // A short text that floats up from screen position (x, y) and fades.
    pop(text, x, y, cls) {
      const el = pops[nextPop];
      nextPop = (nextPop + 1) % POPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.className = `pop ${cls}`;
      replay(el, 'show');
    },

    // A full-screen color flash: 'hit' (red) or 'clear' (white).
    flash(kind) {
      flashEl.className = kind;
      replay(flashEl, 'show');
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
