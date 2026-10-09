// HUD and menus as HTML on top of the canvas: score and the enemies still to
// come on the left, stage, lives, gun level and timers on the right, banners
// and panels in the middle. The DOM is touched only when a value changes or
// something happens; the animations themselves run in CSS.

const POPS = 5;
const ENEMIES = 20;
const KIND_NAMES = ['', 'BASIC', 'FAST', 'POWER', 'ARMOUR'];

// Restarts a CSS animation by taking its class off and putting it back.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // forces a style flush so the animation starts over
  el.classList.add(cls);
}

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div class="side left">
      <div class="label">SCORE</div><div class="value" id="score"></div>
      <div class="label">HI</div><div class="value dim" id="hi"></div>
      <div class="label">ENEMY</div><div id="enemies">${'<i></i>'.repeat(ENEMIES)}</div>
    </div>
    <div class="side right">
      <div class="label">STAGE</div><div class="value"><span class="flag"></span><span id="stage"></span></div>
      <div class="label">LIVES</div><div class="value"><span class="tank-icon"></span><span id="lives"></span></div>
      <div class="label">GUN</div><div class="value stars" id="gun"></div>
      <div id="timers"></div>
    </div>
    <div id="pops">${'<div class="pop"></div>'.repeat(POPS)}</div>
    <div id="banner"></div>
    <div id="callout"></div>
    <div id="message"></div>`;
  const sides = root.querySelectorAll('.side');
  const scoreEl = root.querySelector('#score');
  const hiEl = root.querySelector('#hi');
  const enemyIcons = root.querySelectorAll('#enemies i');
  const stageEl = root.querySelector('#stage');
  const livesEl = root.querySelector('#lives');
  const gunEl = root.querySelector('#gun');
  const timersEl = root.querySelector('#timers');
  const flashEl = root.querySelector('#flash');
  const bannerEl = root.querySelector('#banner');
  const calloutEl = root.querySelector('#callout');
  const messageEl = root.querySelector('#message');
  const pops = root.querySelectorAll('.pop');

  let shownScore = -1;
  let shownHi = -1;
  let shownEnemies = -1;
  let shownStage = -1;
  let shownLives = -1;
  let shownGun = -1;
  let shownShield = -1;
  let shownFreeze = -1;
  let shownWall = -1;
  let nextPop = 0;
  let tallyCounts = null;
  let tallyPoints = null;
  let tallyTotal = null;
  let tallyBonus = null;
  let tallyNext = null;

  return {
    score(value) {
      if (value === shownScore) return;
      const up = value > shownScore && shownScore >= 0;
      shownScore = value;
      scoreEl.textContent = value;
      if (up) replay(scoreEl, 'bump');
    },

    hi(value) {
      if (value === shownHi) return;
      shownHi = value;
      hiEl.textContent = value;
    },

    // Enemy tanks still to come in this stage, one icon each.
    enemies(value) {
      if (value === shownEnemies) return;
      shownEnemies = value;
      for (let i = 0; i < ENEMIES; i++) enemyIcons[i].classList.toggle('gone', i >= value);
    },

    stage(value) {
      if (value === shownStage) return;
      shownStage = value;
      stageEl.textContent = value;
    },

    lives(value) {
      if (value === shownLives) return;
      const down = value < shownLives;
      shownLives = value;
      livesEl.textContent = value;
      if (down) replay(livesEl, 'bump');
    },

    gun(level) {
      if (level === shownGun) return;
      shownGun = level;
      gunEl.textContent = '★'.repeat(level) + '☆'.repeat(3 - level);
    },

    // Seconds left on the timed power-ups (0 when off).
    timers(shield, freeze, wall) {
      if (shield === shownShield && freeze === shownFreeze && wall === shownWall) return;
      shownShield = shield;
      shownFreeze = freeze;
      shownWall = wall;
      timersEl.innerHTML =
        (shield > 0 ? `<div class="timer shield">SHIELD ${shield}</div>` : '') +
        (freeze > 0 ? `<div class="timer freeze">FREEZE ${freeze}</div>` : '') +
        (wall > 0 ? `<div class="timer wall">STEEL ${wall}</div>` : '');
    },

    showStats(visible) {
      for (let i = 0; i < sides.length; i++) sides[i].hidden = !visible;
    },

    // Freezes the banner, pop and flash animations while the game is paused.
    paused(value) {
      root.classList.toggle('paused', value);
    },

    // A big banner ("STAGE 2"); a new element restarts the animation.
    banner(title, sub, cls) {
      bannerEl.innerHTML = title
        ? `<div class="pop-in ${cls || ''}"><div class="big">${title}</div><div class="sub">${sub}</div></div>`
        : '';
    },

    // A short callout for power-ups, in the power-up's color.
    callout(text, color) {
      calloutEl.innerHTML = text ? `<div class="pop-in" style="color:${color}">${text}</div>` : '';
    },

    // A score that floats up from screen position (x, y) and fades.
    pop(text, x, y, gold) {
      const el = pops[nextPop];
      nextPop = (nextPop + 1) % POPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.classList.toggle('gold', gold);
      replay(el, 'show');
    },

    // A red flash around the screen when the player is hit.
    hurt() {
      replay(flashEl, 'show');
    },

    // html is a fixed string from main.js; '' hides the message. cls is an
    // extra class for the panel.
    message(html, cls) {
      tallyCounts = null;
      messageEl.innerHTML = html ? `<div class="panel ${cls || ''}">${html}</div>` : '';
    },

    // The tally after a stage: a row per enemy kind that counts up.
    tally(stage, points) {
      let rows = '';
      for (let k = 1; k < KIND_NAMES.length; k++) {
        rows +=
          `<div class="row"><span class="kind k${k}"></span><span class="name">${KIND_NAMES[k]}</span>` +
          `<span class="n">0</span><span class="x">× ${points[k]}</span><span class="pts">0</span></div>`;
      }
      messageEl.innerHTML =
        `<div class="panel tally"><div class="title">STAGE ${stage} CLEAR</div>${rows}` +
        `<div class="row total"><span class="name">TOTAL</span><span class="n" id="t-total"></span></div>` +
        `<div class="bonus" id="t-bonus"></div><div class="small" id="t-next"></div></div>`;
      tallyCounts = messageEl.querySelectorAll('.row .n');
      tallyPoints = messageEl.querySelectorAll('.row .pts');
      tallyTotal = messageEl.querySelector('#t-total');
      tallyBonus = messageEl.querySelector('#t-bonus');
      tallyNext = messageEl.querySelector('#t-next');
    },

    tallyRow(row, count, points) {
      if (!tallyCounts) return;
      tallyCounts[row].textContent = count;
      tallyPoints[row].textContent = points;
    },

    // next: the hint under the tally, a fixed string from main.js.
    tallyEnd(total, bonus, next) {
      if (!tallyCounts) return;
      tallyTotal.textContent = total;
      tallyBonus.textContent = bonus > 0 ? `NO HITS TAKEN +${bonus}` : '';
      tallyNext.innerHTML = next;
    },
  };
}
