// HUD and menus as HTML on top of the canvas: score and distance top left
// (the clock and the gate count in the time trial), the combo in the
// middle, strikes top right (the best time in the trial), speed bottom
// left, popups and callouts over the slope. The DOM is touched only when a
// value changes or an event happens. CSS animations restart by swapping between two class
// names with the same keyframes, so no reflow is forced.

const POPUPS = 5;

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div class="hud-top">
      <div class="left"><div id="score"></div><div id="dist"></div></div>
      <div id="combo"><b></b><small>COMBO</small></div>
      <div class="right"><div id="strikes">${'<i class="strike"></i>'.repeat(3)}</div><div id="target"></div></div>
    </div>
    <div id="speed"><b></b><small>km/h</small></div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="callout"></div>
    <div id="message"></div>
    <div id="hint"></div>`;
  const top = root.querySelector('.hud-top');
  const scoreEl = root.querySelector('#score');
  const distEl = root.querySelector('#dist');
  const comboEl = root.querySelector('#combo');
  const comboValue = comboEl.querySelector('b');
  const strikesEl = root.querySelector('#strikes');
  const strikeEls = root.querySelectorAll('.strike');
  const targetEl = root.querySelector('#target');
  const hintEl = root.querySelector('#hint');
  const speedEl = root.querySelector('#speed');
  const speedValue = speedEl.querySelector('b');
  const popups = root.querySelectorAll('.popup');
  const calloutEl = root.querySelector('#callout');
  const flashEl = root.querySelector('#flash');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  let shownDist = '';
  let shownMeters = -1;
  let shownCombo = -1;
  let shownStrikes = -1;
  let shownSpeed = -1;
  let nextPopup = 0;
  const popupFlip = new Uint8Array(POPUPS);
  let scoreFlip = false;
  let comboFlip = false;
  let calloutFlip = false;
  let flashFlip = false;
  let hintFlip = false;

  return {
    score(value) {
      if (value === shownScore) return;
      shownScore = value;
      scoreEl.textContent = value;
    },

    // A bigger score jump (a gate, a jump) pops the counter.
    bumpScore() {
      scoreFlip = !scoreFlip;
      scoreEl.className = scoreFlip ? 'pop-a' : 'pop-b';
    },

    // The clock of the time trial, in the score's place.
    time(text) {
      if (text === shownScore) return;
      shownScore = text;
      scoreEl.textContent = text;
    },

    distance(meters) {
      if (meters === shownMeters) return;
      shownMeters = meters;
      this.sub(`${meters} m`);
    },

    // The line under the score: the distance, or the gates in the trial.
    sub(text) {
      if (text === shownDist) return;
      shownDist = text;
      shownMeters = -1;
      distEl.textContent = text;
    },

    // The time trial shows the best time where the strikes are.
    trial(on, target) {
      strikesEl.hidden = on;
      targetEl.hidden = !on || !target;
      targetEl.textContent = target ? `BEST ${target}` : '';
    },

    combo(value) {
      if (value === shownCombo) return;
      const grew = value > shownCombo;
      shownCombo = value;
      comboEl.hidden = value < 2;
      comboValue.textContent = `×${value}`;
      if (grew) {
        comboFlip = !comboFlip;
        comboEl.className = comboFlip ? 'pop-a' : 'pop-b';
      }
    },

    strikes(left) {
      if (left === shownStrikes) return;
      const lost = left < shownStrikes;
      shownStrikes = left;
      for (let i = 0; i < strikeEls.length; i++) {
        // Strikes are lost from the right; the one just lost shakes.
        const gone = i >= left;
        strikeEls[i].className = gone ? (lost && i === left ? 'strike gone hit' : 'strike gone') : 'strike';
      }
    },

    speed(kmh) {
      if (kmh === shownSpeed) return;
      shownSpeed = kmh;
      speedValue.textContent = kmh;
      speedEl.classList.toggle('fast', kmh >= 70);
    },

    showStats(visible) {
      top.hidden = !visible;
      speedEl.hidden = !visible;
    },

    // Floating text at screen position (x, y) in px; kind is '' or 'gold'.
    popup(text, x, y, kind) {
      const i = nextPopup;
      nextPopup = (nextPopup + 1) % POPUPS;
      const el = popups[i];
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      popupFlip[i] ^= 1;
      el.className = `popup ${kind} ${popupFlip[i] ? 'show-a' : 'show-b'}`;
    },

    // A big word in the middle of the screen; kind is '', 'gold', 'good' or 'bad'.
    callout(text, kind) {
      calloutEl.textContent = text;
      calloutFlip = !calloutFlip;
      calloutEl.className = `${kind} ${calloutFlip ? 'show-a' : 'show-b'}`;
    },

    // A flash over the whole screen: 'hit' (red edges) or 'white'.
    flash(kind) {
      flashFlip = !flashFlip;
      flashEl.className = `${kind} ${flashFlip ? 'show-a' : 'show-b'}`;
    },

    clearFx() {
      calloutEl.className = '';
      flashEl.className = '';
      for (let i = 0; i < POPUPS; i++) popups[i].className = 'popup';
    },

    // Freezes the CSS animations while paused.
    freeze(on) {
      root.classList.toggle('frozen', on);
    },

    // html is a fixed string from main.js; '' hides the message. 'high'
    // places the panel near the top so the slope stays in view.
    message(html, place = '') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },

    // A line of button hints along the bottom edge ('' hides it). fade
    // shows it for a few seconds only.
    hint(text, fade = false) {
      hintEl.textContent = text;
      hintFlip = !hintFlip;
      hintEl.className = fade ? (hintFlip ? 'fade-a' : 'fade-b') : '';
    },
  };
}
