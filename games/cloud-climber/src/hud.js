// HUD and menus as HTML on top of the canvas: height and best in the left
// margin, stars in the right one, toasts and popups over the column, panels
// in the middle. The DOM is touched only when a value changes or an event
// happens, never every frame.

const POPUPS = 5;

export function createHud(root) {
  root.innerHTML = `
    <div class="shade left"></div>
    <div class="shade right"></div>
    <div class="side left">
      <div class="label">HEIGHT</div>
      <div class="value"><b id="height">0</b><small> m</small></div>
      <div class="label">BEST</div>
      <div class="value dim"><span id="best">0</span><small> m</small></div>
    </div>
    <div class="side right">
      <div class="label">STARS</div>
      <div class="value star"><span class="icon">★</span> <b id="stars">0</b></div>
    </div>
    <div id="flash"></div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="toast"></div>
    <div id="message"></div>`;
  const sides = root.querySelectorAll('.side');
  const heightEl = root.querySelector('#height');
  const bestEl = root.querySelector('#best');
  const starsEl = root.querySelector('#stars');
  const flashEl = root.querySelector('#flash');
  const toastEl = root.querySelector('#toast');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');

  let shownHeight = -1;
  let shownBest = -1;
  let shownStars = -1;
  let nextPopup = 0;

  // Restarts a CSS animation class on an element.
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // forces a reflow so the animation starts again
    el.classList.add(cls);
  }

  return {
    height(value) {
      if (value === shownHeight) return;
      shownHeight = value;
      heightEl.textContent = value;
    },

    best(value) {
      if (value === shownBest) return;
      shownBest = value;
      bestEl.textContent = value;
    },

    stars(value) {
      if (value === shownStars) return;
      const up = value > shownStars && shownStars >= 0;
      shownStars = value;
      starsEl.textContent = value;
      if (up) replay(starsEl, 'bump');
    },

    showStats(visible) {
      for (let i = 0; i < sides.length; i++) sides[i].hidden = !visible;
    },

    // Floating text at screen position (x, y) in px; kind is '', 'gold' or 'big'.
    popup(text, x, y, kind) {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.className = `popup ${kind}`;
      replay(el, 'show');
    },

    // A word that pops in over the top of the column and fades by itself.
    toast(text, kind) {
      toastEl.textContent = text;
      toastEl.className = kind;
      replay(toastEl, 'show');
    },

    // A short flash over the whole screen ('hit' white, 'boost' gold).
    flash(kind) {
      flashEl.className = kind;
      replay(flashEl, 'on');
    },

    // html is a fixed string from main.js; '' hides the message. layout is
    // 'center' (one box) or 'split' (logo at the top, box at the bottom, the
    // demo climber in between).
    message(html, layout = 'center') {
      messageEl.className = layout;
      messageEl.innerHTML = !html ? '' : layout === 'split' ? html : `<div class="panel">${html}</div>`;
    },
  };
}
