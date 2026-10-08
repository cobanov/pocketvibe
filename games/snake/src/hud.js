// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes or an event happens, never every frame.

const POPUPS = 4;

export function createHud(root) {
  root.innerHTML = `
    <div class="hud-row">
      <span class="stat"><small>SCORE</small><b id="score"></b></span>
      <span class="stat"><small>LENGTH</small><b id="length"></b></span>
    </div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const lengthEl = root.querySelector('#length');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');

  let shownScore = -1;
  let shownLength = -1;
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

    length(value) {
      if (value === shownLength) return;
      shownLength = value;
      lengthEl.textContent = value;
    },

    showStats(visible) {
      row.hidden = !visible;
    },

    // Floating "+10" at screen position (x, y) in px.
    popup(text, x, y, gold) {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.classList.toggle('gold', gold);
      replay(el, 'show');
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
