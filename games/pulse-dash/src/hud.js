// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes. CSS animations are restarted by swapping between two class
// names with the same keyframes, so no reflow is forced.

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div id="progress">
      <div class="track"><div class="fill"></div><div class="best"></div></div>
      <b class="pct"></b>
    </div>
    <div id="tag" hidden>PRACTICE</div>
    <div id="toast"></div>
    <div id="message"></div>`;
  const progressEl = root.querySelector('#progress');
  const trackEl = root.querySelector('.track');
  const fillEl = root.querySelector('.fill');
  const bestEl = root.querySelector('.best');
  const pctEl = root.querySelector('.pct');
  const tagEl = root.querySelector('#tag');
  const toastEl = root.querySelector('#toast');
  const flashEl = root.querySelector('#flash');
  const messageEl = root.querySelector('#message');

  let shownPct = -1;
  let toastFlip = false;
  let flashFlip = false;
  let cheerFlip = false;

  return {
    showProgress(visible) {
      progressEl.hidden = !visible;
    },

    progress(pct) {
      if (pct === shownPct) return;
      shownPct = pct;
      fillEl.style.transform = `scaleX(${pct / 100})`;
      pctEl.textContent = `${pct}%`;
    },

    // A thin mark on the bar where the best run ended.
    bestMark(pct) {
      bestEl.hidden = pct <= 0 || pct >= 100;
      bestEl.style.left = `${pct}%`;
    },

    // The bar flares up when the run passes the best mark.
    cheer() {
      cheerFlip = !cheerFlip;
      trackEl.className = `track ${cheerFlip ? 'cheer-a' : 'cheer-b'}`;
    },

    // The PRACTICE tag in the corner.
    practice(on) {
      tagEl.hidden = !on;
    },

    // A big word that pops up mid-screen and fades.
    toast(text) {
      toastEl.textContent = text;
      toastFlip = !toastFlip;
      toastEl.className = toastFlip ? 'show-a' : 'show-b';
    },

    // A full-screen flash of the given CSS colour.
    flash(color) {
      flashEl.style.background = color;
      flashFlip = !flashFlip;
      flashEl.className = flashFlip ? 'show-a' : 'show-b';
    },

    // The level's neon colour, for panel borders and glows.
    accent(hex) {
      root.style.setProperty('--accent', `#${hex.toString(16).padStart(6, '0')}`);
    },

    // html is a fixed string from main.js; '' hides the message. 'high'
    // lifts the panel so the cube stays in view under it.
    message(html, place = '') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },

    // A panel with a menu: head above it, foot below, the entry sel
    // highlighted. Redrawn only when the menu changes.
    menu(head, items, sel, foot, place = '') {
      let list = '';
      for (let i = 0; i < items.length; i++) list += `<div class="item${i === sel ? ' sel' : ''}">${items[i]}</div>`;
      this.message(`${head}<div class="menu">${list}</div>${foot}`, place);
    },
  };
}
