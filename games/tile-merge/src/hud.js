// HUD and menus as HTML on top of the canvas: score, best and the goal tile
// on the left, the undo chip on the right, floating "+N" popups and the
// centre message (menus included). The DOM is touched only when a value
// changes or something happens.

const POPUPS = 4;

export function createHud(root) {
  root.innerHTML = `
    <div id="stats">
      <div class="box"><div class="label">SCORE</div><div id="score" class="value">0</div></div>
      <div id="bestBox" class="box"><div class="label">BEST</div><div id="best" class="value">0</div></div>
      <div class="box goal"><div id="goalLabel" class="label">GOAL</div><div id="goal" class="value">2048</div></div>
      <div id="gain"></div>
    </div>
    <div id="undo" class="chip"><b>X</b> undo</div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="message"></div>`;
  const stats = root.querySelector('#stats');
  const scoreEl = root.querySelector('#score');
  const bestEl = root.querySelector('#best');
  const bestBox = root.querySelector('#bestBox');
  const goalLabel = root.querySelector('#goalLabel');
  const goalEl = root.querySelector('#goal');
  const gainEl = root.querySelector('#gain');
  const undoEl = root.querySelector('#undo');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');

  let shownScore = -1;
  let shownBest = -1;
  let shownGlow = null;
  let shownGoal = '';
  let shownUndo = null;
  let scoreFlip = false;
  let gainFlip = false;
  let nextPopup = 0;

  return {
    score(value) {
      if (value === shownScore) return;
      // Two classes with the same animation: switching restarts the bump.
      // Seven digits and more get a smaller font to fit the box.
      const size = value >= 1e6 ? ' long' : '';
      if (shownScore >= 0 && value > shownScore) {
        scoreFlip = !scoreFlip;
        scoreEl.className = `value${size} ${scoreFlip ? 'bump-a' : 'bump-b'}`;
      } else {
        scoreEl.className = `value${size}`;
      }
      shownScore = value;
      scoreEl.textContent = value;
    },

    // glow: the score on the board is the new best.
    best(value, glow = false) {
      if (value !== shownBest) {
        shownBest = value;
        bestEl.textContent = value;
        bestEl.className = value >= 1e6 ? 'value long' : 'value';
      }
      if (glow !== shownGlow) {
        shownGlow = glow;
        bestBox.classList.toggle('glow', glow);
      }
    },

    // The tile to make: the goal, then (once made) the next doubling.
    goal(label, value) {
      const key = `${label}${value}`;
      if (key === shownGoal) return;
      shownGoal = key;
      goalLabel.textContent = label;
      goalEl.textContent = value;
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

    // A panel with a menu: head above it, foot below, the entry sel
    // highlighted. Redrawn only when the menu changes.
    menu(head, items, sel, foot, extra = '') {
      let list = '';
      for (let i = 0; i < items.length; i++) list += `<div class="item${i === sel ? ' sel' : ''}">${items[i]}</div>`;
      this.message(`${head}<div class="menu">${list}</div>${foot}`, extra);
    },
  };
}
