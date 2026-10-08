// HUD and menus as HTML on top of the canvas: score and best on the left, the
// undo chip on the right, floating "+N" popups and the centre message. The
// DOM is touched only when a value changes or something happens.

const POPUPS = 4;

export function createHud(root) {
  root.innerHTML = `
    <div id="stats">
      <div class="box"><div class="label">SCORE</div><div id="score" class="value">0</div></div>
      <div class="box"><div class="label">BEST</div><div id="best" class="value">0</div></div>
      <div id="gain"></div>
    </div>
    <div id="undo" class="chip"><b>X</b> undo</div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="message"></div>`;
  const stats = root.querySelector('#stats');
  const scoreEl = root.querySelector('#score');
  const bestEl = root.querySelector('#best');
  const gainEl = root.querySelector('#gain');
  const undoEl = root.querySelector('#undo');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');

  let shownScore = -1;
  let shownBest = -1;
  let shownUndo = null;
  let scoreFlip = false;
  let gainFlip = false;
  let nextPopup = 0;

  return {
    score(value) {
      if (value === shownScore) return;
      // Two classes with the same animation: switching restarts the bump.
      if (shownScore >= 0 && value > shownScore) {
        scoreFlip = !scoreFlip;
        scoreEl.className = `value ${scoreFlip ? 'bump-a' : 'bump-b'}`;
      }
      shownScore = value;
      scoreEl.textContent = value;
    },

    best(value) {
      if (value === shownBest) return;
      shownBest = value;
      bestEl.textContent = value;
    },

    // "+N" rising out of the score box.
    gain(points) {
      gainEl.textContent = `+${points}`;
      gainFlip = !gainFlip;
      gainEl.className = gainFlip ? 'rise-a' : 'rise-b';
    },

    // The undo chip is bright while an undo is available.
    undo(available) {
      if (available === shownUndo) return;
      shownUndo = available;
      undoEl.classList.toggle('off', !available);
    },

    showStats(visible) {
      stats.hidden = !visible;
      undoEl.hidden = !visible;
      if (!visible) gainEl.className = '';
    },

    // A floating word at screen position (x, y) in px, over a big merge.
    popup(text, x, y) {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.classList.remove('show');
      void el.offsetWidth; // forces a reflow so the animation starts again
      el.classList.add('show');
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html, extra = '') {
      messageEl.innerHTML = html ? `<div class="panel ${extra}">${html}</div>` : '';
    },
  };
}
