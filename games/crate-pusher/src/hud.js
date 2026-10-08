// HUD and menus as HTML on top of the canvas: the play bar, the title menu
// with its level grid, banners, callouts and panels. The DOM is touched only
// when a value changes or an event happens, never every frame.

export const COLUMNS = 10; // level grid columns on the title screen
const POPUPS = 4;

export function createHud(root, count) {
  let tiles = '';
  for (let i = 0; i < count; i++) tiles += `<div class="tile"><b>${i + 1}</b><span></span></div>`;
  root.innerHTML = `
    <div id="bar">
      <div class="left"><div><small>LEVEL</small> <b id="level"></b></div><div id="name"></div></div>
      <div class="right"><div><small>MOVES</small> <b id="moves"></b></div><div id="par"></div></div>
    </div>
    <div id="hint">B undo · X restart · L/R level · START pause</div>
    <div id="menu">
      <div class="menu-head">
        <div class="logo">CRATE<span>PUSHER</span></div>
        <div class="menu-press"><div class="blink">Press A to play</div><div class="small">D-pad choose · A play</div></div>
      </div>
      <div class="grid">${tiles}</div>
      <div class="menu-foot"><div id="info"></div><div id="summary"></div></div>
    </div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="banner"></div>
    <div id="callout"></div>
    <div id="message"></div>`;
  const bar = root.querySelector('#bar');
  const hint = root.querySelector('#hint');
  const levelEl = root.querySelector('#level');
  const nameEl = root.querySelector('#name');
  const movesEl = root.querySelector('#moves');
  const parEl = root.querySelector('#par');
  const menu = root.querySelector('#menu');
  const tileEls = root.querySelectorAll('.tile');
  const infoEl = root.querySelector('#info');
  const summaryEl = root.querySelector('#summary');
  const bannerEl = root.querySelector('#banner');
  const calloutEl = root.querySelector('#callout');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');

  let shownMoves = -1;
  let nextPopup = 0;
  let movesPop = false;
  let selected = -1;

  // Restarts a CSS animation class on an element.
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // forces a reflow so the animation starts again
    el.classList.add(cls);
  }

  return {
    showPlay(visible) {
      bar.hidden = !visible;
      hint.hidden = !visible;
    },

    level(n, name, par, best) {
      levelEl.textContent = n;
      nameEl.textContent = name;
      parEl.innerHTML = `<small>PAR</small> ${par}` + (best > 0 ? ` · <small>BEST</small> ${best}${best <= par ? ' ★' : ''}` : '');
    },

    moves(value) {
      if (value === shownMoves) return;
      // Two classes with the same animation: switching restarts the pop.
      if (shownMoves >= 0 && value > shownMoves) {
        movesPop = !movesPop;
        movesEl.className = movesPop ? 'pop-a' : 'pop-b';
      }
      shownMoves = value;
      movesEl.textContent = value;
    },

    showMenu(visible) {
      menu.hidden = !visible;
    },

    // Redraws every tile: locked, open, solved (best moves) or solved at par (star).
    tiles(best, pars, isOpen) {
      let solved = 0;
      let stars = 0;
      for (let i = 0; i < tileEls.length; i++) {
        const el = tileEls[i];
        const open = isOpen(i);
        const done = best[i] > 0;
        const star = done && best[i] <= pars[i];
        if (done) solved++;
        if (star) stars++;
        el.classList.toggle('locked', !open);
        el.classList.toggle('done', done);
        el.classList.toggle('star', star);
        el.lastChild.textContent = done ? `${best[i]}${star ? '★' : ''}` : '';
      }
      summaryEl.textContent = `Solved ${solved}/${tileEls.length} · ★ ${stars}`;
    },

    select(i, html) {
      if (selected >= 0) tileEls[selected].classList.remove('sel');
      selected = i;
      tileEls[i].classList.add('sel');
      infoEl.innerHTML = html;
    },

    // A locked tile shakes its head.
    deny(i) {
      replay(tileEls[i], 'no');
    },

    // Floating text at screen position (x, y) in px; gold for the last crate.
    popup(text, x, y, gold) {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.classList.toggle('gold', gold);
      replay(el, 'show');
    },

    // A big animated banner ("LEVEL 7"); a new element restarts the animation.
    banner(title, sub) {
      bannerEl.innerHTML = title ? `<div class="pop"><div class="big">${title}</div><div class="sub">${sub}</div></div>` : '';
    },

    // A short message in the middle of the screen; kind picks the color.
    callout(text, kind = '') {
      calloutEl.innerHTML = text ? `<div class="pop ${kind}">${text}</div>` : '';
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
