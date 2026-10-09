// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes.

const MAX_ICONS = 6; // beyond this, lives show as "x N"

export function createHud(root) {
  root.innerHTML = `
    <div class="hud-row"><span id="score"></span><span id="wave"></span><span id="lives"></span></div>
    <div id="toast"></div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const waveEl = root.querySelector('#wave');
  const livesEl = root.querySelector('#lives');
  const toastEl = root.querySelector('#toast');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  let shownWave = -1;
  let shownLives = -1;
  let shownMessage = null;
  let flip = false;

  return {
    score(value) {
      if (value === shownScore) return;
      // Alternate two identical animations so each change restarts the pop.
      if (value > shownScore && shownScore >= 0) {
        flip = !flip;
        scoreEl.className = flip ? 'pop-a' : 'pop-b';
      }
      shownScore = value;
      scoreEl.textContent = value;
    },

    wave(value) {
      if (value === shownWave) return;
      shownWave = value;
      waveEl.textContent = `WAVE ${value}`;
    },

    lives(value) {
      if (value === shownLives) return;
      shownLives = value;
      if (value > MAX_ICONS) {
        livesEl.innerHTML = `<i class="life"></i> × ${value}`;
      } else {
        livesEl.innerHTML = '<i class="life"></i>'.repeat(Math.max(0, value));
      }
    },

    showStats(visible) {
      row.hidden = !visible;
    },

    // A short banner in the upper middle of the screen, with an optional
    // smaller line under it; '' hides it.
    toast(html, cls, sub) {
      toastEl.className = cls || '';
      toastEl.innerHTML = html ? `${html}${sub ? `<div class="sub">${sub}</div>` : ''}` : '';
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
