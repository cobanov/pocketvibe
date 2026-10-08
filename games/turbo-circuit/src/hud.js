// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes.

import { LAPS, formatTime, ordinal } from './shared.js';

const MAP = 112; // minimap size in px
const PAD = 9;

// "0px" .. "200px", built once so moving the minimap dots allocates nothing.
const PX = [];
for (let i = 0; i <= 200; i++) PX.push(`${i}px`);

export function createHud(root, track, colors) {
  // Minimap: the circuit as an SVG path, fitted into a square.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.n; i++) {
    minX = Math.min(minX, track.px[i]);
    maxX = Math.max(maxX, track.px[i]);
    minZ = Math.min(minZ, track.pz[i]);
    maxZ = Math.max(maxZ, track.pz[i]);
  }
  const scale = (MAP - PAD * 2) / Math.max(maxX - minX, maxZ - minZ);
  const ox = PAD + ((MAP - PAD * 2) - (maxX - minX) * scale) / 2 - minX * scale;
  const oz = PAD + ((MAP - PAD * 2) - (maxZ - minZ) * scale) / 2 - minZ * scale;
  let path = '';
  for (let i = 0; i <= track.n; i += 3) {
    const k = i % track.n;
    path += `${i ? 'L' : 'M'}${(track.px[k] * scale + ox).toFixed(1)} ${(track.pz[k] * scale + oz).toFixed(1)}`;
  }
  path += 'Z';
  const dots = colors.map((c, i) => `<i class="dot${i === 0 ? ' me' : ''}" style="background:${c.css}"></i>`).join('');

  root.innerHTML = `
    <div id="stats">
      <div id="pos"></div>
      <div id="lapbox"><div id="lap"></div><div id="time"></div></div>
      <div id="map">
        <svg width="${MAP}" height="${MAP}" viewBox="0 0 ${MAP} ${MAP}">
          <path d="${path}" fill="none" stroke="rgba(10,20,40,0.75)" stroke-width="8" stroke-linejoin="round"/>
          <path d="${path}" fill="none" stroke="#f4f1ea" stroke-width="3.5" stroke-linejoin="round"/>
        </svg>${dots}
      </div>
      <div id="speed"><b id="kmh">0</b><span>km/h</span></div>
    </div>
    <div id="alert"></div>
    <div id="banner"></div>
    <div id="message"></div>`;
  const statsEl = root.querySelector('#stats');
  const posEl = root.querySelector('#pos');
  const lapEl = root.querySelector('#lap');
  const timeEl = root.querySelector('#time');
  const kmhEl = root.querySelector('#kmh');
  const alertEl = root.querySelector('#alert');
  const bannerEl = root.querySelector('#banner');
  const messageEl = root.querySelector('#message');
  const dotEls = root.querySelectorAll('.dot');

  let shownPlace = 0;
  let shownLap = 0;
  let shownTenths = -1;
  let shownKmh = -1;
  let shownBoost = false;
  let shownAlert = '';
  let shownCount = -1;
  const dotX = new Int16Array(dotEls.length).fill(-1);
  const dotY = new Int16Array(dotEls.length).fill(-1);

  return {
    showStats(visible) {
      statsEl.hidden = !visible;
    },

    reset() {
      shownPlace = shownLap = 0;
      shownTenths = shownKmh = shownCount = -1;
      this.alert('');
      this.banner('', '');
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
      lapEl.textContent = `LAP ${value}/${LAPS}`;
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
          dotEls[i].style.left = PX[Math.max(0, Math.min(200, x))];
        }
        if (y !== dotY[i]) {
          dotY[i] = y;
          dotEls[i].style.top = PX[Math.max(0, Math.min(200, y))];
        }
      }
    },

    // Countdown number: 3, 2, 1, then 0 for GO.
    count(n) {
      if (n === shownCount) return;
      shownCount = n;
      if (n > 0) this.banner(String(n), 'count');
      else this.banner('GO!', 'go');
    },

    // A big centered word that pops in and fades out by itself (CSS).
    banner(text, cls) {
      bannerEl.innerHTML = text ? `<div class="pop ${cls}">${text}</div>` : '';
    },

    // Steady warning under the stats (WRONG WAY, FINISH IN 12); '' hides it.
    alert(text) {
      if (text === shownAlert) return;
      shownAlert = text;
      alertEl.textContent = text;
    },

    // html is a fixed string from main.js; '' hides the message.
    message(html) {
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },
  };
}
