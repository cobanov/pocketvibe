// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes or an event happens, never every frame.

const POPUPS = 4;

export function createHud(root) {
  root.innerHTML = `
    <div class="hud-row">
      <div class="left">
        <span class="stat"><small>SCORE</small><b id="score"></b></span>
        <div id="best"></div>
      </div>
      <span class="stat"><small>SPEED</small><b id="speed"></b></span>
      <span class="stat right"><small>LENGTH</small><b id="length"></b></span>
    </div>
    <div id="toast"></div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const bestEl = root.querySelector('#best');
  const speedEl = root.querySelector('#speed');
  const lengthEl = root.querySelector('#length');
  const toastEl = root.querySelector('#toast');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');

  let shownScore = -1;
  let shownBest = -1;
  let shownSpeed = -1;
  let shownLength = -1;
  let nextPopup = 0;
  // Two classes with the same animation: switching between them restarts it
  // without forcing a layout.
  let scorePop = false;
  let speedPop = false;
  let toastPop = false;

  return {
    score(value) {
      if (value === shownScore) return;
      if (shownScore >= 0 && value > shownScore) {
        scorePop = !scorePop;
        scoreEl.className = scorePop ? 'pop-a' : 'pop-b';
      }
      shownScore = value;
      scoreEl.textContent = value;
    },

    best(value) {
      if (value === shownBest) return;
      shownBest = value;
      bestEl.textContent = value > 0 ? `BEST ${value}` : '';
    },

    speed(value) {
      if (value === shownSpeed) return;
      if (shownSpeed >= 0 && value > shownSpeed) {
        speedPop = !speedPop;
        speedEl.className = speedPop ? 'pop-a' : 'pop-b';
      }
      shownSpeed = value;
      speedEl.textContent = value;
    },

    length(value) {
      if (value === shownLength) return;
      shownLength = value;
      lengthEl.textContent = value;
    },

    showStats(visible) {
      row.hidden = !visible;
      if (!visible) toastEl.className = '';
    },

    // A short cheer under the HUD row that pops up and fades: FASTER!, NEW BEST!
    toast(text, kind = '') {
      toastPop = !toastPop;
      toastEl.textContent = text;
      toastEl.className = `${toastPop ? 'show-a' : 'show-b'} ${kind}`;
    },

    // Floating "+10" at screen position (x, y) in px.
    popup(text, x, y, gold) {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      // Alternating the animation's class restarts it.
      el.className = `popup${gold ? ' gold' : ''} ${el.classList.contains('show-a') ? 'show-b' : 'show-a'}`;
    },

    // html is a fixed string from main.js; '' hides the message. 'dim'
    // darkens the frozen game behind the pause menu.
    message(html, place = '') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
