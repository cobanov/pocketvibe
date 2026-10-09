// HUD and menus as HTML on top of the canvas: score, level and lives in a
// row above the maze, banners and panels in the middle, and small arrows at
// the screen's edges pointing at drones the close view does not show. The
// DOM is touched only when a value changes or an event happens.

const POPUPS = 5;
const MAX_LIVES = 5;
const MARKERS = 4;

export function createHud(root) {
  root.innerHTML = `
    <div class="hud-row">
      <span class="stat"><small>SCORE</small><b id="score"></b></span>
      <span class="stat mid"><small>LEVEL</small><b id="level"></b></span>
      <span class="stat right" id="lives">${'<i class="life"></i>'.repeat(MAX_LIVES)}</span>
    </div>
    <div id="markers">${'<div class="marker"><i></i></div>'.repeat(MARKERS)}</div>
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
  const markers = root.querySelectorAll('.marker');

  let shownScore = -1;
  let shownLevel = -1;
  let shownLives = -1;
  let shownReady = null;
  let shownReadyY = -1;
  let shownMessage = null;
  let nextPopup = 0;
  // Per marker: shown or not, last position and angle, frightened look.
  const markerOn = new Int8Array(MARKERS);
  const markerX = new Int16Array(MARKERS);
  const markerY = new Int16Array(MARKERS);
  const markerA = new Int16Array(MARKERS);
  const markerScared = new Int8Array(MARKERS).fill(-1);

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

    // A big animated banner; a new element restarts the animation.
    banner(title, sub) {
      bannerEl.innerHTML = title
        ? `<div class="pop"><div class="big">${title}</div><div class="sub">${sub}</div></div>`
        : '';
    },

    // The card when a level comes up: its number, the maze's name and a pip
    // per maze (done, this one, still to come); after the last maze the
    // mazes come round again, faster.
    levelCard(number, name, index, total, loop) {
      let pips = '';
      for (let i = 0; i < total; i++) pips += `<i class="${i < index ? 'done' : i === index ? 'now' : ''}"></i>`;
      bannerEl.innerHTML =
        `<div class="pop card"><div class="big">LEVEL ${number}</div>` +
        `<div class="sub">${name}${loop > 0 ? ` <span class="loop">ROUND ${loop + 1} · FASTER</span>` : ''}</div>` +
        `<div class="pips">${pips}</div></div>`;
    },

    // "READY!" over the maze while a round is about to start, y px from the
    // top of the screen.
    ready(text, y = shownReadyY) {
      if (text !== shownReady) {
        shownReady = text;
        readyEl.textContent = text;
      }
      const top = Math.round(y);
      if (text && top !== shownReadyY) {
        shownReadyY = top;
        readyEl.style.top = `${top}px`;
      }
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

    // An arrow at the screen's edge for drone i, at (x, y) px, pointing
    // `angle` degrees (0 = right); on = false hides it.
    marker(i, on, x = 0, y = 0, angle = 0, scared = false) {
      const el = markers[i];
      if (!on) {
        if (markerOn[i]) {
          markerOn[i] = 0;
          el.classList.remove('on');
        }
        return;
      }
      if (!markerOn[i]) {
        markerOn[i] = 1;
        el.classList.add('on');
      }
      const s = scared ? 1 : 0;
      if (s !== markerScared[i]) {
        markerScared[i] = s;
        el.classList.toggle('scared', scared);
      }
      const px = Math.round(x);
      const py = Math.round(y);
      const pa = Math.round(angle / 5) * 5;
      if (Math.abs(px - markerX[i]) < 2 && Math.abs(py - markerY[i]) < 2 && pa === markerA[i]) return;
      markerX[i] = px;
      markerY[i] = py;
      markerA[i] = pa;
      el.style.transform = `translate(${px}px, ${py}px) rotate(${pa}deg)`;
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
