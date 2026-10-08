// The moment a download finishes: the game's cover in the middle of the
// screen with a soft glow, and a few small fireworks behind it. Kept light:
// three bursts of sparks on a 2D canvas, then the canvas stops drawing.

const COLORS = ['#ffc83d', '#ffe08a', '#fff6d8', '#ffffff', '#8fe3ff'];
const GRAVITY = 90; // px/s²
// Rockets as (launch delay s, burst x, burst y), on a 720×480 screen; other
// screens move them to the same places.
const ROCKETS = [
  [0.1, 170, 130],
  [0.45, 560, 110],
  [0.85, 360, 70],
];

export class Celebration {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.card = root.querySelector('.celebrate-card');
    this.frame = 0;
    this.current = null;
  }

  get active() {
    return this.current !== null;
  }

  // html is the card's content; data is handed back by hide().
  show(html, data) {
    this.current = data;
    this.card.innerHTML = html;
    this.root.hidden = false;
    // Restart the CSS entrance animations.
    this.root.classList.remove('play');
    void this.root.offsetWidth;
    this.root.classList.add('play');
    this.start();
  }

  hide() {
    const data = this.current;
    this.current = null;
    this.root.hidden = true;
    cancelAnimationFrame(this.frame);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    return data;
  }

  start() {
    cancelAnimationFrame(this.frame);
    // The canvas takes the screen's size, and the rockets their places on it.
    const width = this.root.clientWidth || 720;
    const height = this.root.clientHeight || 480;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const rockets = ROCKETS.map(([delay, x, y]) => {
      [x, y] = [(x * width) / 720, (y * height) / 480];
      return { delay, x, y, fromX: x + (Math.random() - 0.5) * 80, done: false };
    });
    const sparks = [];
    const begin = performance.now();
    let last = begin;

    const step = (now) => {
      const time = (now - begin) / 1000;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = 'lighter';

      for (const r of rockets) {
        if (r.done || time < r.delay) continue;
        // A rocket climbs for 0.4 s, then bursts.
        const k = Math.min((time - r.delay) / 0.4, 1);
        const ease = 1 - (1 - k) ** 2;
        const x = r.fromX + (r.x - r.fromX) * ease;
        const y = height + (r.y - height) * ease;
        ctx.strokeStyle = 'rgba(255, 230, 170, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - (r.x - r.fromX) * 0.04, y + 22);
        ctx.stroke();
        if (k === 1) {
          r.done = true;
          burst(sparks, r.x, r.y);
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life -= dt;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        const px = s.x;
        const py = s.y;
        s.vx *= 0.985;
        s.vy = s.vy * 0.985 + GRAVITY * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const alpha = Math.min(s.life / s.span, 1);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.size;
        ctx.beginPath();
        ctx.moveTo(px - s.vx * 0.03, py - s.vy * 0.03);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (sparks.length || rockets.some((r) => !r.done)) this.frame = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    };
    this.frame = requestAnimationFrame(step);
  }
}

function burst(sparks, x, y) {
  const count = 34;
  const tint = COLORS[Math.floor(Math.random() * 2)];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const speed = 70 + Math.random() * 90;
    const span = 0.9 + Math.random() * 0.6;
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: span,
      span,
      size: Math.random() < 0.3 ? 2.5 : 1.6,
      color: Math.random() < 0.6 ? tint : COLORS[2 + Math.floor(Math.random() * 3)],
    });
  }
}
