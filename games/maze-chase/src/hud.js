// HUD and menus as HTML on top of the canvas: score, level and lives in a
// row above the maze, banners and panels in the middle. The DOM is touched
// only when a value changes or an event happens, never every frame.

const POPUPS = 5;
const MAX_LIVES = 5;

export function createHud(root) {
  root.innerHTML = `
    <div class="hud-row">
      <span class="stat"><small>SCORE</small><b id="score"></b></span>
      <span class="stat mid"><small>LEVEL</small><b id="level"></b></span>
      <span class="stat right" id="lives">${'<i class="life"></i>'.repeat(MAX_LIVES)}</span>
    </div>
    <div id="flash"></div>
    <div id="banner"></div>
    <div id="ready"></div>
    <div id="callout"></div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const levelEl = root.querySelector('#level');
  const lifeEls = root.querySelectorAll('.life');
  const flashEl = root.querySelector('#flash');
  const bannerEl = root.querySelector('#banner');
  const readyEl = root.querySelector('#ready');
  const calloutEl = root.querySelector('#callout');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');

  let shownScore = -1;
  let shownLevel = -1;
  let shownLives = -1;
  let shownReady = null;
  let nextPopup = 0;

  // Restarts a CSS animation class on an element.
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // forces a reflow so the animation starts again
    el.classList.add(cls);
  }

  return {
    score(value) {
      if (value === shownScore) return;
      const up = value > shownScore && shownScore >= 0;
      shownScore = value;
      scoreEl.textContent = value;
      if (up) replay(scoreEl, 'bump');
    },

    level(value) {
      if (value === shownLevel) return;
      shownLevel = value;
      levelEl.textContent = value;
    },

    lives(value) {
      if (value === shownLives) return;
      const gained = value > shownLives && shownLives >= 0;
      shownLives = value;
      for (let i = 0; i < lifeEls.length; i++) lifeEls[i].hidden = i >= value;
      if (gained && value > 0) replay(lifeEls[value - 1], 'gain');
    },

    showStats(visible) {
      row.hidden = !visible;
    },

    // A big animated banner ("LEVEL 2"); a new element restarts the animation.
    banner(title, sub) {
      bannerEl.innerHTML = title
        ? `<div class="pop"><div class="big">${title}</div><div class="sub">${sub}</div></div>`
        : '';
    },

    // "READY!" over the maze while a round is about to start.
    ready(text) {
      if (text === shownReady) return;
      shownReady = text;
      readyEl.textContent = text;
    },

    callout(text, color) {
      calloutEl.innerHTML = text ? `<div class="pop" style="color:${color}">${text}</div>` : '';
    },

    // Red flash around the screen when the player is caught.
    hurt() {
      flashEl.innerHTML = '<div class="hurt"></div>';
    },

    // Floating score at screen position (x, y) in px.
    popup(text, x, y, color) {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.style.color = color;
      replay(el, 'show');
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
