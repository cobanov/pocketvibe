// HUD and menus as HTML on top of the canvas: hole and par top left,
// strokes and total top right, the power meter and its range on the left, a
// hint line at the bottom, banners, popups and the scorecard. The DOM is
// touched only when a value changes.

const POPUPS = 4;

// "E" for even, "+2", "-1".
export function relative(n) {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`;
}

// The name of a hole's result.
export function resultName(strokes, par, pickedUp) {
  if (pickedUp) return 'PICKED UP';
  if (strokes === 1) return 'HOLE IN ONE!';
  const d = strokes - par;
  if (d <= -3) return 'ALBATROSS!';
  if (d === -2) return 'EAGLE!';
  if (d === -1) return 'BIRDIE!';
  if (d === 0) return 'PAR';
  if (d === 1) return 'BOGEY';
  if (d === 2) return 'DOUBLE BOGEY';
  return `${relative(d)} OVER`;
}

// width and height are the screen's size in px, for keeping popups on it.
export function createHud(root, width, height) {
  root.innerHTML = `
    <div id="flash"></div>
    <div class="hud-top">
      <div class="side"><div class="big">HOLE <b id="hole"></b><small id="of"></small></div><div class="sub">PAR <b id="par"></b></div></div>
      <div class="side right"><div class="big">STROKE <b id="stroke"></b></div><div class="sub">TOTAL <b id="total"></b></div></div>
    </div>
    <div id="power"><div class="bar"><div class="fill"></div><div class="last"></div></div><div class="label">FULL</div></div>
    <div id="banner"></div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="hint"></div>
    <div id="message"></div>`;
  const top = root.querySelector('.hud-top');
  const holeEl = root.querySelector('#hole');
  const ofEl = root.querySelector('#of');
  const parEl = root.querySelector('#par');
  const strokeEl = root.querySelector('#stroke');
  const totalEl = root.querySelector('#total');
  const powerEl = root.querySelector('#power');
  const fillEl = root.querySelector('#power .fill');
  const lastEl = root.querySelector('#power .last');
  const labelEl = root.querySelector('#power .label');
  const bannerEl = root.querySelector('#banner');
  const popups = root.querySelectorAll('.popup');
  const hintEl = root.querySelector('#hint');
  const flashEl = root.querySelector('#flash');
  const messageEl = root.querySelector('#message');

  let shownHole = '';
  let shownPar = -1;
  let shownStroke = -1;
  let shownTotal = '';
  let shownPower = -1;
  let shownLast = -2;
  let shownHint = null;
  let meterMode = -1;
  let shownPutt = false;
  let nextPopup = 0;

  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // forces a reflow so the animation starts again
    el.classList.add(cls);
  }

  return {
    showStats(visible) {
      top.hidden = !visible;
    },

    hole(n, count, par) {
      const key = `${n}/${count}`;
      if (key !== shownHole) {
        shownHole = key;
        holeEl.textContent = n;
        ofEl.textContent = `/${count}`;
      }
      if (par !== shownPar) {
        shownPar = par;
        parEl.textContent = par;
      }
    },

    stroke(value) {
      if (value === shownStroke) return;
      const up = value > shownStroke && shownStroke >= 0;
      shownStroke = value;
      strokeEl.textContent = value;
      if (up) replay(strokeEl, 'bump');
    },

    total(text) {
      if (text === shownTotal) return;
      shownTotal = text;
      totalEl.textContent = text;
    },

    // The power meter: mode 0 hides it, 1 shows it empty while aiming, 2
    // while A charges, filled to `value` (0..1). `last` marks the previous
    // putt on this hole (-1 for none); `putt` is the short range.
    meter(mode, value = 0, last = -1, putt = false) {
      if (mode !== meterMode) {
        meterMode = mode;
        powerEl.classList.toggle('on', mode === 2);
        powerEl.classList.toggle('idle', mode === 1);
      }
      if (putt !== shownPutt) {
        shownPutt = putt;
        powerEl.classList.toggle('putt', putt);
        labelEl.textContent = putt ? 'PUTT' : 'FULL';
      }
      if (mode === 0) return;
      const pct = Math.round(value * 100);
      if (pct !== shownPower) {
        shownPower = pct;
        fillEl.style.clipPath = `inset(${100 - pct}% 0 0 0)`;
      }
      const lastPct = last < 0 || last > 1 ? -1 : Math.round(last * 100);
      if (lastPct !== shownLast) {
        shownLast = lastPct;
        lastEl.hidden = lastPct < 0;
        lastEl.style.bottom = `${lastPct}%`;
      }
    },

    hint(text) {
      if (text === shownHint) return;
      shownHint = text;
      hintEl.textContent = text;
    },

    // A big animated banner; '' clears it. A new element restarts the
    // animation.
    banner(title, sub = '', cls = '') {
      bannerEl.innerHTML = title
        ? `<div class="pop ${cls}"><div class="big">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`
        : '';
    },

    // Floating text at screen position (x, y) in px.
    popup(text, x, y, cls = '') {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(Math.min(width - 80, Math.max(80, x)))}px`;
      el.style.top = `${Math.round(Math.min(height - 60, Math.max(90, y)))}px`;
      el.className = `popup ${cls}`;
      replay(el, 'show');
    },

    // kind: 'water', 'gold' or 'cut'; '' clears.
    flash(kind) {
      flashEl.className = '';
      if (kind) replay(flashEl, kind);
    },

    // Holds every running banner and popup animation while paused.
    freeze(on) {
      root.classList.toggle('frozen', on);
    },

    // html is a fixed string from main.js; '' hides the message. 'high'
    // places the panel near the top so the course stays in view; 'dim'
    // darkens the game behind it.
    message(html, place = '') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}

// The scorecard table: par and strokes for each hole, totals at the end.
// `scores` holds strokes for the holes played so far.
export function scorecard(holes, scores, current) {
  let head = '<th>HOLE</th>';
  let pars = '<th>PAR</th>';
  let mine = '<th>YOU</th>';
  let parSum = 0;
  let sum = 0;
  let parPlayed = 0;
  for (let i = 0; i < holes.length; i++) {
    const par = holes[i].par;
    parSum += par;
    const s = scores[i];
    const cls = i === current ? ' class="now"' : '';
    head += `<td${cls}>${i + 1}</td>`;
    pars += `<td${cls}>${par}</td>`;
    if (s === undefined) {
      mine += `<td${cls}></td>`;
    } else {
      sum += s;
      parPlayed += par;
      const kind = s === 1 ? 'ace' : s < par ? 'under' : s > par ? 'over' : 'even';
      mine += `<td${cls}><span class="${kind}">${s}</span></td>`;
    }
  }
  head += '<th>TOT</th>';
  pars += `<th>${parSum}</th>`;
  mine += `<th>${sum}</th>`;
  return {
    html: `<table class="card"><tr>${head}</tr><tr class="pars">${pars}</tr><tr class="mine">${mine}</tr></table>`,
    total: sum,
    toPar: sum - parPlayed,
  };
}
