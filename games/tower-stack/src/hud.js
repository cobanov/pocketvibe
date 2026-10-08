// HUD and menus as HTML on top of the canvas: the height in big numbers at
// the top, popups over the tower, callouts and panels. The DOM is touched only
// when a value changes or an event happens, never every frame.

const POPUPS = 4;

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div class="hud-top">
      <div id="score"></div>
      <div id="best"></div>
    </div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="callout"></div>
    <div id="message"></div>`;
  const top = root.querySelector('.hud-top');
  const scoreEl = root.querySelector('#score');
  const bestEl = root.querySelector('#best');
  const flashEl = root.querySelector('#flash');
  const calloutEl = root.querySelector('#callout');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');

  let shownScore = -1;
  let shownBest = null;
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

    // The line under the score ("BEST 40", or "NEW BEST" once beaten).
    best(text, gold) {
      if (text === shownBest) return;
      shownBest = text;
      bestEl.textContent = text;
      bestEl.classList.toggle('gold', gold);
    },

    showStats(visible) {
      top.hidden = !visible;
    },

    // Floating text at screen position (x, y) in px.
    popup(text, x, y, gold) {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.classList.toggle('gold', gold);
      replay(el, 'show');
    },

    // A big line that pops in under the score and fades; a new element
    // restarts the animation.
    callout(text) {
      calloutEl.innerHTML = text ? `<div class="pop">${text}</div>` : '';
    },

    // Freezes the CSS animations (popups, callouts) while the game is paused.
    pause(on) {
      root.classList.toggle('paused', on);
    },

    // A white flash over the whole screen.
    flash() {
      replay(flashEl, 'on');
    },

    // html is a fixed string from main.js; '' hides the message. place is
    // '' (centre), 'top' or 'side' (right half, the tower stays in view).
    message(html, place = '') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
