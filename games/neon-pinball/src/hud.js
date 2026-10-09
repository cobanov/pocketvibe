// HUD and menus as HTML on top of the canvas: score on the left of the
// table, best score and event callouts on the right, the end-of-ball bonus
// over the middle. The DOM is touched only when a value changes.

export function createHud(root) {
  root.innerHTML = `
    <div class="side left">
      <div class="label">SCORE</div>
      <div id="score" class="value"></div>
      <div class="label">BALL</div>
      <div id="balls" class="balls"></div>
      <div id="mult" class="mult"></div>
      <div id="mball" class="mball"></div>
    </div>
    <div class="side right">
      <div class="label">BEST</div>
      <div id="best" class="value best"></div>
      <div id="event"></div>
      <div id="hint"></div>
    </div>
    <div id="bonus"></div>
    <div id="message"></div>`;
  const sides = root.querySelectorAll('.side');
  const scoreEl = root.querySelector('#score');
  const ballsEl = root.querySelector('#balls');
  const multEl = root.querySelector('#mult');
  const mballEl = root.querySelector('#mball');
  const bestEl = root.querySelector('#best');
  const eventEl = root.querySelector('#event');
  const hintEl = root.querySelector('#hint');
  const bonusEl = root.querySelector('#bonus');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  let shownBall = -1;
  let shownMult = -1;
  let shownMball = null;
  let shownBest = -1;
  let shownHint = null;
  let shownBonus = null;

  return {
    score(value) {
      if (value === shownScore) return;
      shownScore = value;
      scoreEl.textContent = value.toLocaleString('en-US');
    },

    // ball: the ball in play (1-based), total: balls per game.
    balls(ball, total) {
      if (ball === shownBall) return;
      shownBall = ball;
      let html = '';
      for (let i = 1; i <= total; i++) html += `<span class="${i < ball ? 'used' : i === ball ? 'now' : ''}">●</span>`;
      ballsEl.innerHTML = html;
    },

    mult(value) {
      if (value === shownMult) return;
      shownMult = value;
      multEl.textContent = value > 1 ? `${value}X SCORING` : '';
    },

    // Shown while multiball runs.
    multiball(on) {
      if (on === shownMball) return;
      shownMball = on;
      mballEl.textContent = on ? 'MULTIBALL 2X' : '';
    },

    best(value) {
      if (value === shownBest) return;
      shownBest = value;
      bestEl.textContent = value.toLocaleString('en-US');
    },

    // A short callout that pops in and fades out by itself (CSS animation).
    event(text, tone) {
      eventEl.className = '';
      eventEl.textContent = text;
      void eventEl.offsetWidth; // restart the animation
      eventEl.className = `pop ${tone}`;
    },

    clearEvent() {
      eventEl.className = '';
      eventEl.textContent = '';
    },

    hint(html) {
      if (html === shownHint) return;
      shownHint = html;
      hintEl.innerHTML = html;
    },

    // The end-of-ball bonus count; '' hides it.
    bonus(html) {
      if (html === shownBonus) return;
      shownBonus = html;
      bonusEl.innerHTML = html ? `<div class="bonus-panel">${html}</div>` : '';
    },

    showStats(visible) {
      for (let i = 0; i < sides.length; i++) sides[i].hidden = !visible;
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html, extra = '') {
      messageEl.innerHTML = html ? `<div class="panel ${extra}">${html}</div>` : '';
    },
  };
}
