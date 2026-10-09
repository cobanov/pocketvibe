// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes. CSS animations are restarted by swapping between two class
// names with the same keyframes, so no reflow is forced.

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div class="hud-row">
      <div class="left"><span id="score"></span><span id="dist"></span></div>
      <span id="coins"><i class="coin"></i><b id="coin-count"></b></span>
    </div>
    <div id="powers">
      <div class="power magnet" hidden><span>MAGNET</span><i><b></b></i></div>
      <div class="power shield" hidden><span>SHIELD</span><i><b></b></i></div>
    </div>
    <div id="toast"></div>
    <div id="pop"></div>
    <div id="message"></div>`;
  const row = root.querySelector('.hud-row');
  const scoreEl = root.querySelector('#score');
  const distEl = root.querySelector('#dist');
  const coinsEl = root.querySelector('#coins');
  const coinCountEl = root.querySelector('#coin-count');
  const powersEl = root.querySelector('#powers');
  const powerEls = [root.querySelector('.power.magnet'), root.querySelector('.power.shield')];
  const toastEl = root.querySelector('#toast');
  const popEl = root.querySelector('#pop');
  const flashEl = root.querySelector('#flash');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  let shownDist = -1;
  let shownCoins = -1;
  let bump = false;
  let toastFlip = false;
  let popFlip = false;
  let flashFlip = false;
  const powerFlip = [false, false];

  return {
    score(value) {
      if (value === shownScore) return;
      shownScore = value;
      scoreEl.textContent = value;
    },

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

    // A power-up's bar, draining over `seconds` by a CSS animation; 0 hides it.
    power(index, seconds) {
      const el = powerEls[index];
      el.hidden = seconds <= 0;
      if (seconds <= 0) return;
      powerFlip[index] = !powerFlip[index];
      el.className = `power ${index === 0 ? 'magnet' : 'shield'} ${powerFlip[index] ? 'run-a' : 'run-b'}`;
      el.style.setProperty('--time', `${seconds}s`);
    },

    // The power-up bars stop draining while the game is paused.
    freeze(on) {
      powersEl.classList.toggle('frozen', on);
    },

    // A big message that pops up under the HUD row and fades.
    toast(text) {
      toastEl.textContent = text;
      toastFlip = !toastFlip;
      toastEl.className = toastFlip ? 'show-a' : 'show-b';
    },

    // A small note that rises from under the score.
    pop(text) {
      popEl.textContent = text;
      popFlip = !popFlip;
      popEl.className = popFlip ? 'show-a' : 'show-b';
    },

    // A full-screen flash of the given CSS color.
    flash(color) {
      flashEl.style.background = color;
      flashFlip = !flashFlip;
      flashEl.className = flashFlip ? 'show-a' : 'show-b';
    },

    showStats(visible) {
      row.hidden = !visible;
      powersEl.hidden = !visible;
      if (!visible) {
        toastEl.className = '';
        popEl.className = '';
      }
    },

    // html is a fixed string from main.js; '' hides the message. place puts
    // the panel higher (title) or in the middle.
    message(html, place = 'middle') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
