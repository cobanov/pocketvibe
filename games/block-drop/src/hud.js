// HUD and menus as HTML on top of the canvas: panel labels, score, level and
// lines, a pop-up for line clears and the centre message. The DOM is touched
// only when a value changes.

export function createHud(root) {
  root.innerHTML = `
    <div id="label-hold" class="label">HOLD</div>
    <div id="label-next" class="label">NEXT</div>
    <div id="stats">
      <div class="stat-label">SCORE</div><div id="score" class="stat-value">0</div>
      <div class="stat-label">LEVEL</div><div id="level" class="stat-value">1</div>
      <div class="stat-label">LINES</div><div id="lines" class="stat-value">0</div>
    </div>
    <div id="best-box"><div class="stat-label">BEST</div><div id="best" class="stat-value">0</div></div>
    <div id="popup"><div id="popup-main"></div><div id="popup-sub"></div></div>
    <div id="message"></div>`;
  const holdLabel = root.querySelector('#label-hold');
  const nextLabel = root.querySelector('#label-next');
  const stats = root.querySelector('#stats');
  const scoreEl = root.querySelector('#score');
  const levelEl = root.querySelector('#level');
  const linesEl = root.querySelector('#lines');
  const bestBox = root.querySelector('#best-box');
  const bestEl = root.querySelector('#best');
  const popup = root.querySelector('#popup');
  const popupMain = root.querySelector('#popup-main');
  const popupSub = root.querySelector('#popup-sub');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  let shownLevel = -1;
  let shownLines = -1;
  let shownBest = -1;
  let popFlip = false;
  let levelFlip = false;

  function placeAt(el, p) {
    el.style.left = `${Math.round(p.x)}px`;
    el.style.top = `${Math.round(p.y)}px`;
    el.style.width = `${Math.round(p.w)}px`;
  }

  return {
    // Screen rectangles (x, y of the top left corner, w) of the side panels,
    // projected once from the 3D layout by main.js.
    layout(hold, next, statsBox, bestPanel, well) {
      placeAt(holdLabel, hold);
      placeAt(nextLabel, next);
      placeAt(stats, statsBox);
      placeAt(bestBox, bestPanel);
      placeAt(popup, well);
    },

    best(value) {
      if (value === shownBest) return;
      shownBest = value;
      bestEl.textContent = value;
    },

    stats(score, level, lines) {
      if (score !== shownScore) {
        shownScore = score;
        scoreEl.textContent = score;
      }
      if (level !== shownLevel) {
        // Pulse the level when it goes up (alternating names restart the animation).
        if (shownLevel > 0 && level > shownLevel) {
          levelFlip = !levelFlip;
          levelEl.className = `stat-value ${levelFlip ? 'bump-a' : 'bump-b'}`;
        }
        shownLevel = level;
        levelEl.textContent = level;
      }
      if (lines !== shownLines) {
        shownLines = lines;
        linesEl.textContent = lines;
      }
    },

    // Score, level, lines and best show only during a game.
    showStats(visible) {
      stats.hidden = !visible;
      bestBox.hidden = !visible;
      if (!visible) {
        popup.className = '';
        levelEl.className = 'stat-value';
      }
    },

    // A short message over the well that pops in and fades out by itself.
    popup(main, sub, big) {
      popupMain.textContent = main;
      popupSub.textContent = sub;
      popFlip = !popFlip;
      popup.className = `${popFlip ? 'pop-a' : 'pop-b'}${big ? ' big' : ''}`;
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
