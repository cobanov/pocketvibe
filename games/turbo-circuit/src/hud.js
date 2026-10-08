// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes. On a handheld with two screens the race stats, the
// standings and a large map go to the second screen, and the first shows
// only the race.

import { formatTime, ordinal } from './shared.js';

const MAP = 112; // minimap size in px
const BIG_MAP = 416; // the map on the second screen
const PAD = 9;

// "0px" .. "420px", built once so moving the minimap dots allocates nothing.
const PX = [];
for (let i = 0; i <= BIG_MAP + 4; i++) PX.push(`${i}px`);

// The circuit fitted into a size x size square: an SVG path and the
// transform from world (x, z) to its pixels.
function fit(track, size, pad) {
  const { minX, maxX, minZ, maxZ } = track;
  const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = pad + (size - pad * 2 - (maxX - minX) * scale) / 2 - minX * scale;
  const oz = pad + (size - pad * 2 - (maxZ - minZ) * scale) / 2 - minZ * scale;
  let d = '';
  for (let i = 0; i <= track.n; i += 3) {
    const k = i % track.n;
    d += `${i ? 'L' : 'M'}${(track.px[k] * scale + ox).toFixed(1)} ${(track.pz[k] * scale + oz).toFixed(1)}`;
  }
  return { d: `${d}Z`, scale, ox, oz };
}

// The circuit as an SVG drawing: a dark outline, a light road and a white
// square at the start line.
export function trackSvg(track, size, width) {
  const { d, scale, ox, oz } = fit(track, size, Math.max(PAD, width));
  const sx = track.px[0] * scale + ox;
  const sz = track.pz[0] * scale + oz;
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<path d="${d}" fill="none" stroke="rgba(10,20,40,0.75)" stroke-width="${width}" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#f4f1ea" stroke-width="${width * 0.45}" stroke-linejoin="round"/>` +
    `<rect x="${(sx - width * 0.4).toFixed(1)}" y="${(sz - width * 0.4).toFixed(1)}" width="${(width * 0.8).toFixed(1)}" height="${(width * 0.8).toFixed(1)}" fill="#fff" stroke="#10182a" stroke-width="1.5"/>` +
    `</svg>`
  );
}

export function createHud(root, colors, second = null) {
  const size = second ? BIG_MAP : MAP;
  const width = second ? 14 : 8;
  const dots = colors.map((c, i) => `<i class="dot${i === 0 ? ' me' : ''}" style="background:${c.css}"></i>`).join('');

  const stats = `
    <div id="stats"${second ? ' class="dual"' : ''}>
      <div id="pos"></div>
      <div id="lapbox"><div id="lap"></div><div id="time"></div></div>
      <div id="map"><div id="track"></div>${dots}</div>
      <div id="speed"><b id="kmh">0</b><span>km/h</span></div>
      ${second ? '<div id="best"><span>BEST LAP</span><b id="bestlap">--</b></div><div id="standings"></div>' : ''}
    </div>`;
  root.innerHTML = `
    ${second ? '' : stats}
    <div id="alert"></div>
    <div id="banner"></div>
    <div id="laptime"></div>
    <div id="message"></div>`;
  if (second) {
    second.hud.innerHTML = `<div id="logo">TURBO <span>CIRCUIT</span></div><div id="brand"></div>${stats}<div id="info"></div>`;
  }
  const statsRoot = second ? second.hud : root;
  const statsEl = statsRoot.querySelector('#stats');
  const numbers = statsRoot.querySelectorAll('#pos, #lapbox, #speed, #best, #standings');
  const posEl = statsRoot.querySelector('#pos');
  const lapEl = statsRoot.querySelector('#lap');
  const timeEl = statsRoot.querySelector('#time');
  const kmhEl = statsRoot.querySelector('#kmh');
  const trackEl = statsRoot.querySelector('#track');
  const bestEl = statsRoot.querySelector('#bestlap');
  const standingsEl = statsRoot.querySelector('#standings');
  const logoEl = second?.hud.querySelector('#logo');
  const brandEl = second?.hud.querySelector('#brand');
  const infoEl = second?.hud.querySelector('#info');
  const alertEl = root.querySelector('#alert');
  const bannerEl = root.querySelector('#banner');
  const lapTimeEl = root.querySelector('#laptime');
  const messageEl = root.querySelector('#message');
  const dotEls = statsRoot.querySelectorAll('.dot');

  let scale = 1;
  let ox = 0;
  let oz = 0;
  let laps = 3;
  let shownBest = -1;
  let shownPlace = 0;
  let shownLap = 0;
  let shownTenths = -1;
  let shownKmh = -1;
  let shownBoost = false;
  let shownAlert = '';
  let shownCount = -1;
  let shownStandings = -1;
  let shownMessage = '';
  const dotX = new Int16Array(dotEls.length).fill(-1);
  const dotY = new Int16Array(dotEls.length).fill(-1);
  const order = colors.map((c, i) => i);
  const placeOf = new Int8Array(colors.length);
  const byPlace = (a, b) => placeOf[a] - placeOf[b];

  return {
    // The circuit shown on the map(s), and its name on the second screen.
    setTrack(track, name, lapCount) {
      laps = lapCount;
      const f = fit(track, size, second ? PAD * 2 : PAD);
      scale = f.scale;
      ox = f.ox;
      oz = f.oz;
      trackEl.innerHTML = trackSvg(track, size, width);
      dotX.fill(-1);
      dotY.fill(-1);
      if (brandEl) brandEl.textContent = name.toUpperCase();
    },

    // On two screens the map stays (it shows the title's race too) and only
    // the numbers go; the circuit info and the logo take their place.
    showStats(visible) {
      if (second) {
        for (const el of numbers) el.hidden = !visible;
        infoEl.hidden = visible;
        logoEl.hidden = visible;
      } else {
        statsEl.hidden = !visible;
      }
    },

    // The circuit's details and records on the second screen's title view.
    info(html) {
      if (infoEl) infoEl.innerHTML = html;
    },

    // The player's best lap so far, on the second screen only (0: none yet).
    best(seconds) {
      if (!bestEl || seconds === shownBest) return;
      shownBest = seconds;
      bestEl.textContent = seconds > 0 ? formatTime(seconds) : '--';
    },

    reset() {
      shownPlace = shownLap = 0;
      shownTenths = shownKmh = shownCount = -1;
      shownStandings = -1;
      this.best(0);
      this.alert('');
      this.banner('', '');
      lapTimeEl.innerHTML = '';
    },

    // A new element each time, so the CSS flash animation restarts.
    place(value) {
      if (value === shownPlace) return;
      const cls = shownPlace === 0 ? '' : value < shownPlace ? 'up' : 'down';
      shownPlace = value;
      posEl.innerHTML = `<b class="${cls}">${ordinal(value)}</b><span>/4</span>`;
    },

    lap(value) {
      if (value === shownLap) return;
      shownLap = value;
      lapEl.textContent = `LAP ${value}/${laps}`;
    },

    time(seconds) {
      const tenths = Math.floor(seconds * 10);
      if (tenths === shownTenths) return;
      shownTenths = tenths;
      timeEl.textContent = formatTime(seconds);
    },

    speed(kmh, boosting) {
      if (kmh !== shownKmh) {
        shownKmh = kmh;
        kmhEl.textContent = kmh;
      }
      if (boosting !== shownBoost) {
        shownBoost = boosting;
        kmhEl.classList.toggle('boost', boosting);
      }
    },

    // Moves the minimap dots; only the ones that moved a whole pixel.
    map(cars) {
      for (let i = cars.length - 1; i >= 0; i--) {
        const x = Math.round(cars[i].x * scale + ox);
        const y = Math.round(cars[i].z * scale + oz);
        if (x !== dotX[i]) {
          dotX[i] = x;
          dotEls[i].style.left = PX[Math.max(0, Math.min(PX.length - 1, x))];
        }
        if (y !== dotY[i]) {
          dotY[i] = y;
          dotEls[i].style.top = PX[Math.max(0, Math.min(PX.length - 1, y))];
        }
      }
    },

    // The running order on the second screen: rebuilt only when the order,
    // a lap count or a finish changes. places[i] is car i's place.
    standings(cars, places) {
      if (!standingsEl) return;
      for (let i = 0; i < cars.length; i++) {
        order[i] = i;
        placeOf[i] = places[i];
      }
      order.sort(byPlace);
      let key = 0;
      for (let k = 0; k < order.length; k++) {
        const car = cars[order[k]];
        key = key * 64 + order[k] * 16 + (car.finished ? 15 : Math.max(1, Math.min(laps, car.laps + 1)));
      }
      if (key === shownStandings) return;
      shownStandings = key;
      let html = '';
      for (let k = 0; k < order.length; k++) {
        const car = cars[order[k]];
        const c = colors[order[k]];
        const right = car.finished ? formatTime(car.finishTime) : `LAP ${Math.max(1, Math.min(laps, car.laps + 1))}`;
        html += `<div class="row${car.isPlayer ? ' me' : ''}"><b>${k + 1}</b><i style="background:${c.css}"></i><span>${c.name}</span><em>${right}</em></div>`;
      }
      standingsEl.innerHTML = html;
    },

    // Countdown number: 3, 2, 1, then 0 for GO.
    count(n) {
      if (n === shownCount) return false;
      shownCount = n;
      if (n > 0) this.banner(String(n), 'count');
      else this.banner('GO!', 'go');
      return true;
    },

    // A big centered word that pops in and fades out by itself (CSS).
    banner(text, cls) {
      bannerEl.innerHTML = text ? `<div class="pop ${cls}">${text}</div>` : '';
    },

    // The lap just driven, under the lap banner; cls 'best' or 'record'
    // colors it.
    lapTime(text, cls = '') {
      lapTimeEl.innerHTML = text ? `<div class="pop ${cls}">${text}</div>` : '';
    },

    // Steady warning under the stats (WRONG WAY, FINISH IN 12); '' hides it.
    alert(text) {
      if (text === shownAlert) return;
      shownAlert = text;
      alertEl.textContent = text;
    },

    // html is built by main.js from fixed strings; '' hides the message.
    message(html) {
      if (html === shownMessage) return;
      shownMessage = html;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
