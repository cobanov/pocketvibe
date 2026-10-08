// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes. CSS animations are restarted by swapping between two class
// names with the same keyframes, so no reflow is forced.

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div class="hud-row">
      <span id="dist"></span>
      <span id="coins"><i class="coin"></i><b id="coin-count"></b></span>
    </div>
    <div id="toast"></div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const distEl = root.querySelector('#dist');
  const coinsEl = root.querySelector('#coins');
  const coinCountEl = root.querySelector('#coin-count');
  const toastEl = root.querySelector('#toast');
  const flashEl = root.querySelector('#flash');
  const messageEl = root.querySelector('#message');

  let shownDist = -1;
  let shownCoins = -1;
  let bump = false;
  let toastFlip = false;
  let flashFlip = false;

  return {
    distance(meters) {
      if (meters === shownDist) return;
      shownDist = meters;
      distEl.textContent = `${meters} m`;
    },

    coins(value) {
      if (value === shownCoins) return;
      const grew = value > shownCoins && shownCoins >= 0;
      shownCoins = value;
      coinCountEl.textContent = value;
      if (grew) {
        bump = !bump;
        coinsEl.className = bump ? 'bump-a' : 'bump-b';
      }
    },

    // A short message that pops up under the HUD row and fades.
    toast(text) {
      toastEl.textContent = text;
      toastFlip = !toastFlip;
      toastEl.className = toastFlip ? 'show-a' : 'show-b';
    },

    // A full-screen flash of the given CSS color.
    flash(color) {
      flashEl.style.background = color;
      flashFlip = !flashFlip;
      flashEl.className = flashFlip ? 'show-a' : 'show-b';
    },

    showStats(visible) {
      row.hidden = !visible;
      if (!visible) toastEl.className = '';
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
