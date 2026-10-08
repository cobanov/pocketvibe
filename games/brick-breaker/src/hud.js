// HUD and menus as HTML on top of the canvas: score on the left, level and
// lives on the right, banners and panels in the middle. The DOM is touched
// only when a value changes.

export function createHud(root) {
  root.innerHTML = `
    <div class="side left">
      <div class="label">SCORE</div><div class="value" id="score"></div>
      <div class="label">BEST</div><div class="value dim" id="best"></div>
    </div>
    <div class="side right">
      <div class="label">LEVEL</div><div class="value" id="level"></div>
      <div class="label">LIVES</div><div class="value lives" id="lives"></div>
      <div id="powers"></div>
    </div>
    <div id="flash"></div>
    <div id="banner"></div>
    <div id="callout"></div>
    <div id="hint"></div>
    <div id="message"></div>`;
  const sides = root.querySelectorAll('.side');
  const scoreEl = root.querySelector('#score');
  const bestEl = root.querySelector('#best');
  const levelEl = root.querySelector('#level');
  const livesEl = root.querySelector('#lives');
  const powersEl = root.querySelector('#powers');
  const flashEl = root.querySelector('#flash');
  const bannerEl = root.querySelector('#banner');
  const calloutEl = root.querySelector('#callout');
  const hintEl = root.querySelector('#hint');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  let shownBest = -1;
  let shownLevel = -1;
  let shownLives = -1;
  let shownWide = -1;
  let shownSlow = -1;
  let shownHint = null;
  let shownMessage = null;

  return {
    score(value) {
      if (value === shownScore) return;
      shownScore = value;
      scoreEl.textContent = value;
    },

    best(value) {
      if (value === shownBest) return;
      shownBest = value;
      bestEl.textContent = value;
    },

    level(value) {
      if (value === shownLevel) return;
      shownLevel = value;
      levelEl.textContent = value;
    },

    lives(value) {
      if (value === shownLives) return;
      shownLives = value;
      livesEl.textContent = '●'.repeat(value);
    },

    // Seconds left on the timed power-ups (0 when off).
    powers(wide, slow) {
      if (wide === shownWide && slow === shownSlow) return;
      shownWide = wide;
      shownSlow = slow;
      powersEl.innerHTML =
        (wide > 0 ? `<div class="power wide">WIDE ${wide}</div>` : '') +
        (slow > 0 ? `<div class="power slow">SLOW ${slow}</div>` : '');
    },

    showStats(visible) {
      for (let i = 0; i < sides.length; i++) sides[i].hidden = !visible;
    },

    // A big animated banner ("CLEAR!"); a new element restarts the animation.
    banner(title, sub) {
      bannerEl.innerHTML = title ? `<div class="pop"><div class="big">${title}</div><div class="sub">${sub}</div></div>` : '';
    },

    // The card between levels: the number, the map's name, a tip the first
    // time a new kind of brick turns up, and a pip per level of the set
    // (done, this one, still to come).
    levelCard(number, name, tip, index, total, loop) {
      let pips = '';
      for (let i = 0; i < total; i++) pips += `<i class="${i < index ? 'done' : i === index ? 'now' : ''}"></i>`;
      bannerEl.innerHTML =
        `<div class="pop card"><div class="kicker">LEVEL</div><div class="big">${number}</div>` +
        `<div class="sub">${name}${loop > 0 ? ` <span class="loop">LOOP ${loop + 1} · FASTER</span>` : ''}</div>` +
        `<div class="pips">${pips}</div>` +
        (tip ? `<div class="tip">${tip}</div>` : '') +
        `</div>`;
    },

    // A short callout for power-ups, in the power-up's color.
    callout(text, color) {
      calloutEl.innerHTML = text ? `<div class="pop" style="color:${color}">${text}</div>` : '';
    },

    hint(text) {
      if (text === shownHint) return;
      shownHint = text;
      hintEl.textContent = text;
    },

    // Red flash around the screen when a ball is lost.
    hurt() {
      flashEl.innerHTML = '<div class="hurt"></div>';
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
