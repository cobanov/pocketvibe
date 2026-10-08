// HUD and menus as HTML on top of the canvas: your tab and the applause at
// the top, the hype meter with the move's name, the beat ring round the A
// button, popups over the dancer, the MC's lines, texts arriving on your
// phone, and the panels. The DOM is touched only when a value changes or an
// event happens, never every frame.

import { TIERS } from './shared.js';

const POPUPS = 6;

export function createHud(root) {
  const ticks = TIERS.slice(1)
    .map((t) => `<i style="left:${t.from}%"></i>`)
    .join('');
  root.innerHTML = `
    <div id="flash"></div>
    <div id="play" hidden>
      <div id="progress"><div></div></div>
      <div class="stat left"><div class="label">YOUR TAB</div><div id="tab" class="value money">$0</div></div>
      <div class="stat right"><div class="label">APPLAUSE</div><div id="applause" class="value">0</div></div>
      <div id="meter">
        <div id="move"></div>
        <div id="bar"><div id="fill"></div>${ticks}</div>
      </div>
      <div id="beat">
        <div id="ring"></div>
        <div id="button">A</div>
        <div id="tip">TIP $1</div>
        <div id="combo"></div>
        <div id="judge"></div>
      </div>
    </div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="callout"></div>
    <div id="phone"></div>
    <div id="message"></div>`;
  const $ = (sel) => root.querySelector(sel);
  const playEl = $('#play');
  const progressEl = $('#progress div');
  const tabEl = $('#tab');
  const applauseEl = $('#applause');
  const moveEl = $('#move');
  const fillEl = $('#fill');
  const ringEl = $('#ring');
  const buttonEl = $('#button');
  const comboEl = $('#combo');
  const judgeEl = $('#judge');
  const flashEl = $('#flash');
  const calloutEl = $('#callout');
  const phoneEl = $('#phone');
  const messageEl = $('#message');
  const popups = root.querySelectorAll('.popup');

  let shown = { tab: -1, applause: -1, fill: -1, move: '', progress: -1, combo: -1, tier: -1 };
  let nextPopup = 0;

  // Restarts a CSS animation class on an element.
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // forces a reflow so the animation starts again
    el.classList.add(cls);
  }

  return {
    showPlay(visible) {
      playEl.hidden = !visible;
      if (visible) shown = { tab: -1, applause: -1, fill: -1, move: '', progress: -1, combo: -1, tier: -1 };
    },

    tab(value) {
      if (value === shown.tab) return;
      const up = value > shown.tab && shown.tab >= 0;
      shown.tab = value;
      tabEl.textContent = `$${value.toLocaleString('en-US')}`;
      if (up) replay(tabEl, 'bump');
    },

    applause(value) {
      if (value === shown.applause) return;
      shown.applause = value;
      applauseEl.textContent = value.toLocaleString('en-US');
    },

    // Hype 0-100 and the tier it is in.
    hype(value, tier) {
      const fill = Math.round(value);
      if (fill !== shown.fill) {
        shown.fill = fill;
        fillEl.style.transform = `scaleX(${fill / 100})`;
      }
      if (tier !== shown.tier) {
        shown.tier = tier;
        fillEl.className = `t${tier}`;
        moveEl.textContent = TIERS[tier].name;
        if (tier > 0) replay(moveEl, 'bump');
      }
    },

    // How far into the show, 0-1.
    progress(k) {
      const v = Math.round(k * 200);
      if (v === shown.progress) return;
      shown.progress = v;
      progressEl.style.transform = `scaleX(${v / 200})`;
    },

    // Once per beat: the ring closes in on the A button by the next beat.
    beat() {
      replay(ringEl, 'go');
    },

    // A press: the button lights up, gold when it was on the beat.
    press(good) {
      buttonEl.classList.toggle('good', good);
      replay(buttonEl, 'hit');
    },

    combo(n) {
      if (n === shown.combo) return;
      shown.combo = n;
      comboEl.textContent = n >= 2 ? `×${n}` : '';
      if (n >= 2) replay(comboEl, 'bump');
    },

    // How a tip landed ("ON BEAT!", "EARLY"...), just above the A button.
    judge(text, cls) {
      judgeEl.textContent = text;
      judgeEl.className = cls;
      replay(judgeEl, 'show');
    },

    // Floating text at screen position (x, y) in px; cls '' / 'gold' / 'bad'.
    popup(text, x, y, cls = '') {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.className = `popup ${cls}`;
      replay(el, 'show');
    },

    // The MC's line: pops in and fades; a new element restarts the animation.
    callout(text, cls = '') {
      calloutEl.innerHTML = text ? `<div class="pop ${cls}">${text}</div>` : '';
    },

    // A text on your phone: slides in from the left and away again; no
    // sender clears it.
    phone(sender, text) {
      if (!sender) {
        phoneEl.innerHTML = '';
        return;
      }
      phoneEl.innerHTML = `<div class="sms"><div class="from">${sender}</div><div>${text}</div></div>`;
    },

    pause(on) {
      root.classList.toggle('paused', on);
    },

    flash() {
      replay(flashEl, 'on');
    },

    // html is a fixed string from main.js; '' hides the message. place is
    // '' (centre) or 'top'.
    message(html, place = '') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
