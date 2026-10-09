// HUD and menus as HTML on top of the canvas: panel labels, three stats
// (score, level and lines, or time and what is left in Sprint and Dig), the
// best box, a pop-up for line clears and the centre message with menus. The
// DOM is touched only when a value changes.

export function createHud(root) {
  root.innerHTML = `
    <div id="label-hold" class="label">HOLD</div>
    <div id="label-next" class="label">NEXT</div>
    <div id="stats">
      <div class="stat-label"></div><div class="stat-value"></div>
      <div class="stat-label"></div><div class="stat-value"></div>
      <div class="stat-label"></div><div class="stat-value"></div>
    </div>
    <div id="best-box"><div class="stat-label">BEST</div><div id="best" class="stat-value"></div></div>
    <div id="popup"><div id="popup-tag"></div><div id="popup-main"></div><div id="popup-sub"></div></div>
    <div id="message"></div>`;
  const holdLabel = root.querySelector('#label-hold');
  const nextLabel = root.querySelector('#label-next');
  const stats = root.querySelector('#stats');
  const labelEls = stats.querySelectorAll('.stat-label');
  const valueEls = stats.querySelectorAll('.stat-value');
  const bestBox = root.querySelector('#best-box');
  const bestEl = root.querySelector('#best');
  const popup = root.querySelector('#popup');
  const popupTag = root.querySelector('#popup-tag');
  const popupMain = root.querySelector('#popup-main');
  const popupSub = root.querySelector('#popup-sub');
  const messageEl = root.querySelector('#message');

  const shown = [null, null, null];
  const bumpFlip = [false, false, false];
  let shownBest = null;
  let popFlip = false;

  function placeAt(el, p) {
    el.style.left = `${Math.round(p.x)}px`;
    el.style.top = `${Math.round(p.y)}px`;
    el.style.width = `${Math.round(p.w)}px`;
  }

  function set(i, value) {
    if (value === shown[i]) return;
    shown[i] = value;
    valueEls[i].textContent = value;
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

    // The names of the three stats, set when a game starts.
    labels(a, b, c) {
      labelEls[0].textContent = a;
      labelEls[1].textContent = b;
      labelEls[2].textContent = c;
      for (let i = 0; i < 3; i++) {
        shown[i] = null;
        valueEls[i].className = 'stat-value';
      }
    },

    stats(a, b, c) {
      set(0, a);
      set(1, b);
      set(2, c);
    },

    // Pulses one stat (the level going up); alternating names restart the animation.
    bump(i) {
      bumpFlip[i] = !bumpFlip[i];
      valueEls[i].className = `stat-value ${bumpFlip[i] ? 'bump-a' : 'bump-b'}`;
    },

    // The stats and the best show only during a game.
    showStats(visible) {
      stats.hidden = !visible;
      bestBox.hidden = !visible;
      if (!visible) popup.className = '';
    },

    // A short message over the well that pops in and fades out by itself:
    // a small tag line above (B2B, T-SPIN), the main word and a line below.
    popup(main, sub, big, tag = '') {
      popupTag.textContent = tag;
      popupMain.textContent = main;
      popupSub.textContent = sub;
      popFlip = !popFlip;
      popup.className = `${popFlip ? 'pop-a' : 'pop-b'}${big ? ' big' : ''}`;
    },

    // Freezes the CSS animations while the game is paused.
    pause(on) {
      root.classList.toggle('paused', on);
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },

    // A panel with a menu: head above it, foot below, the entry sel
    // highlighted. Redrawn only when the menu changes.
    menu(head, items, sel, foot) {
      let list = '';
      for (let i = 0; i < items.length; i++) list += `<div class="item${i === sel ? ' sel' : ''}">${items[i]}</div>`;
      this.message(`${head}<div class="menu">${list}</div>${foot}`);
    },
  };
}
