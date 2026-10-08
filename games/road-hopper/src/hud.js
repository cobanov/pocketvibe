// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes.

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div id="warn"></div>
    <div class="hud-row">
      <div><div id="score"></div><div id="best"></div></div>
      <div id="coins"></div>
    </div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const bestEl = root.querySelector('#best');
  const coinsEl = root.querySelector('#coins');
  const flashEl = root.querySelector('#flash');
  const warnEl = root.querySelector('#warn');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  let shownBest = -1;
  let shownCoins = -1;
  let shownWarn = false;
  let scorePop = false;
  let coinPop = false;

  return {
    score(value) {
      if (value === shownScore) return;
      // Two classes with the same animation: switching restarts the pop.
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
      bestEl.textContent = value > 0 ? `TOP ${value}` : '';
    },

    coins(value) {
      if (value === shownCoins) return;
      if (shownCoins >= 0 && value > shownCoins) {
        coinPop = !coinPop;
        coinsEl.className = coinPop ? 'pop-a' : 'pop-b';
      }
      shownCoins = value;
      coinsEl.textContent = `● ${value}`;
    },

    showStats(visible) {
      row.hidden = !visible;
    },

    // A red pulse at the screen edges: the hawk is coming.
    warn(on) {
      if (on === shownWarn) return;
      shownWarn = on;
      warnEl.className = on ? 'on' : '';
    },

    // kind: 'hit' (white), 'water' (blue) or '' to clear.
    flash(kind) {
      flashEl.className = kind;
    },

    // html is a fixed string from main.js; '' hides the message. 'high'
    // places the panel near the top so the chicken stays in view.
    message(html, place = '') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
