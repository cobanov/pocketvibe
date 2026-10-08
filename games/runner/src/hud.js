// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes.

export function createHud(root) {
  root.innerHTML = `
    <div class="hud-row"><span id="score"></span><span id="coins"></span></div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const coinsEl = root.querySelector('#coins');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  let shownCoins = -1;

  return {
    score(value) {
      if (value === shownScore) return;
      shownScore = value;
      scoreEl.textContent = value;
    },

    coins(value) {
      if (value === shownCoins) return;
      shownCoins = value;
      coinsEl.textContent = `● ${value}`;
    },

    showStats(visible) {
      row.hidden = !visible;
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
