// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes or something happens (a banner, a score pop, a flash); the
// animations themselves run in CSS. When an animation ends its element is
// emptied, so a faded-out layer never stays on screen for the compositor.

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
      <span class="left"><small>SCORE</small> <b id="score"></b><span class="best"><small>BEST</small> <b id="best"></b></span></span>
      <span class="center"><small>WAVE</small> <b id="wave"></b></span>
      <span class="right" id="lives"></span>
    </div>
    <div id="banner"><div class="big"></div><div class="sub"></div></div>
    <div id="pops">${'<div class="pop"></div>'.repeat(POPS)}</div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const bestEl = root.querySelector('#best');
  const waveEl = root.querySelector('#wave');
  const livesEl = root.querySelector('#lives');
  const bannerEl = root.querySelector('#banner');
  const bannerBig = bannerEl.querySelector('.big');
  const bannerSub = bannerEl.querySelector('.sub');
  const flashEl = root.querySelector('#flash');
  const messageEl = root.querySelector('#message');
  const pops = root.querySelectorAll('.pop');

  flashEl.addEventListener('animationend', () => (flashEl.className = ''));
  bannerEl.addEventListener('animationend', () => {
    bannerEl.className = '';
    bannerBig.textContent = '';
    bannerSub.textContent = '';
  });
  for (const el of pops) {
    el.addEventListener('animationend', () => {
      el.className = 'pop';
      el.textContent = '';
    });
  }

  let shownScore = -1;
  let shownBest = -1;
  let shownWave = -1;
  let shownLives = -1;
  let shownMessage = null;
  let nextPop = 0;

  return {
    score(value) {
      if (value === shownScore) return;
      shownScore = value;
      scoreEl.textContent = value;
    },

    best(value) {
      if (value === shownBest) return;
      shownBest = value;
      bestEl.textContent = value;
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

    // A big line of text (and a smaller one under it) that zooms in and
    // fades out by itself; '' takes it away at once.
    banner(text, sub = '') {
      bannerBig.textContent = text;
      bannerSub.textContent = sub;
      if (text) replay(bannerEl, 'show');
      else bannerEl.className = '';
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

    // A full-screen color flash: 'hit' (red), 'clear' (white) or 'warn'.
    flash(kind) {
      flashEl.className = kind;
      replay(flashEl, 'show');
    },

    // html is built from fixed strings in main.js; '' hides the message.
    // Unchanged html leaves the DOM alone.
    message(html, kind = '') {
      const key = kind + html;
      if (key === shownMessage) return;
      shownMessage = key;
      messageEl.innerHTML = html ? `<div class="panel ${kind}">${html}</div>` : '';
    },
  };
}
