// HUD and menus as HTML on top of the canvas: the height in big numbers at
// the top, popups over the tower, callouts, the best-height tag and panels
// with menus. The DOM is touched only when a value changes or an event
// happens, never every frame.

const POPUPS = 4;

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div class="hud-top">
      <div id="score"></div>
      <div id="best"></div>
    </div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="marker" hidden></div>
    <div id="callout"></div>
    <div id="message"></div>`;
  const top = root.querySelector('.hud-top');
  const scoreEl = root.querySelector('#score');
  const bestEl = root.querySelector('#best');
  const flashEl = root.querySelector('#flash');
  const calloutEl = root.querySelector('#callout');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');
  const markerEl = root.querySelector('#marker');

  let shownScore = -1;
  let shownBest = null;
  let nextPopup = 0;
  let markerY = -1; // px, -1 hidden

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

    // A big line that pops in under the score and fades, with an optional
    // smaller one under it; a new element restarts the animation.
    callout(text, sub = '') {
      calloutEl.innerHTML = text ? `<div class="pop">${text}${sub ? `<div class="sub">${sub}</div>` : ''}</div>` : '';
    },

    // The tag at the right edge on the best run's height line: its text, and
    // its height on screen in px (or -1 to hide it). Only a change of a whole
    // pixel touches the DOM.
    markerText(text) {
      markerEl.textContent = text;
    },
    marker(y) {
      const px = y < 0 ? -1 : Math.round(y);
      if (px === markerY) return;
      if ((px < 0) !== (markerY < 0)) markerEl.hidden = px < 0;
      markerY = px;
      if (px >= 0) markerEl.style.transform = `translateY(${px}px)`;
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

    // A panel with a menu: head above it, foot below, the entry sel
    // highlighted. Redrawn only when the menu changes.
    menu(head, items, sel, foot, place = '') {
      let list = '';
      for (let i = 0; i < items.length; i++) list += `<div class="item${i === sel ? ' sel' : ''}">${items[i]}</div>`;
      this.message(`${head}<div class="menu">${list}</div>${foot}`, place);
    },
  };
}
