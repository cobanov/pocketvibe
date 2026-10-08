// The playfield artwork, painted once into a 512x512 canvas texture: a dark
// floor, soft neon glow under every wall, arrows and labels. Painting the
// glow here costs nothing per frame.

import * as THREE from 'three';
import { BOUNDS, LAMP_MULT, bumpers, lamps, lanes, segments } from './table.js';
import { BUMPER_COLORS, CYAN, MAGENTA, RED, STYLE, VIOLET, YELLOW } from './shared.js';

const SIZE = 512;

function css(hex, alpha) {
  return `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;
}

export function createFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const sx = SIZE / (BOUNDS.x1 - BOUNDS.x0);
  const sy = SIZE / (BOUNDS.y1 - BOUNDS.y0);
  // Draw in table units: x right, y up the table.
  const table = () => ctx.setTransform(sx, 0, 0, -sy, -BOUNDS.x0 * sx, BOUNDS.y1 * sy);

  // Dark floor, a touch lighter in the middle of the playfield.
  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, '#0d0a33');
  bg.addColorStop(0.55, '#140b3d');
  bg.addColorStop(1, '#0a0624');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  table();

  // Faint grid.
  ctx.strokeStyle = css(VIOLET, 0.13);
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  for (let x = -5; x <= 7; x++) {
    ctx.moveTo(x, BOUNDS.y0);
    ctx.lineTo(x, BOUNDS.y1);
  }
  for (let y = -1; y <= 20; y++) {
    ctx.moveTo(BOUNDS.x0, y);
    ctx.lineTo(BOUNDS.x1, y);
  }
  ctx.stroke();

  // A soft glow from the drain.
  const drain = ctx.createRadialGradient(0, -1.2, 0, 0, -1.2, 4);
  drain.addColorStop(0, css(RED, 0.35));
  drain.addColorStop(1, css(RED, 0));
  ctx.fillStyle = drain;
  ctx.fillRect(-5, -1.4, 10, 5.5);

  // Neon glow under the walls: wide faint strokes under narrow bright ones.
  ctx.lineCap = 'round';
  const passes = [
    [1.1, 0.06],
    [0.7, 0.1],
    [0.42, 0.16],
  ];
  for (let p = 0; p < passes.length; p++) {
    ctx.lineWidth = passes[p][0];
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      ctx.strokeStyle = css(STYLE[s.style], passes[p][1]);
      ctx.beginPath();
      ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.bx, s.by);
      ctx.stroke();
    }
  }

  // Rings around the pop bumpers.
  for (let i = 0; i < bumpers.length; i++) {
    const b = bumpers[i];
    for (let p = 0; p < 3; p++) {
      ctx.strokeStyle = css(BUMPER_COLORS[i], 0.12 + p * 0.1);
      ctx.lineWidth = 0.5 - p * 0.15;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Outlines of the rollover lanes.
  ctx.strokeStyle = css(CYAN, 0.35);
  ctx.lineWidth = 0.06;
  for (let i = 0; i < lanes.length; i++) {
    const l = lanes[i];
    ctx.strokeRect(l.x0 + 0.1, l.y0, l.x1 - l.x0 - 0.2, l.y1 - l.y0);
  }

  // Rings around every lamp socket.
  ctx.lineWidth = 0.06;
  for (let i = 0; i < lamps.length; i++) {
    const l = lamps[i];
    ctx.strokeStyle = css(l.color, 0.45);
    ctx.beginPath();
    ctx.arc(l.x, l.y, l.r + 0.1, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Chevrons pointing up the middle and up the plunger lane.
  function chevron(x, y, w, hex, alpha, dir = 1) {
    ctx.strokeStyle = css(hex, alpha);
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.moveTo(x - w, y - 0.35 * w * dir);
    ctx.lineTo(x, y + 0.25 * w * dir);
    ctx.lineTo(x + w, y - 0.35 * w * dir);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) chevron(0, 3.4 + i * 0.75, 0.55, YELLOW, 0.3 + i * 0.2);
  for (let i = 0; i < 5; i++) chevron(5.6, 4.6 + i * 1.4, 0.32, CYAN, 0.25 + i * 0.1);
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 2; i++) chevron(s * 3.45, 5.6 - i * 0.6, 0.25, MAGENTA, 0.5, -1);
  }

  // Text helper: undoes the table's non-uniform scale so glyphs keep their
  // shape. size is the letter height in table units.
  function text(str, x, y, size, hex, alpha, glow) {
    ctx.save();
    const cx = (x - BOUNDS.x0) * sx;
    const cy = (BOUNDS.y1 - y) * sy;
    ctx.setTransform(sx / sy, 0, 0, 1, cx, cy);
    ctx.font = `bold ${Math.round(size * sy)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (glow) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = css(hex, alpha * 0.25);
      ctx.lineWidth = 6;
      ctx.strokeText(str, 0, 0);
      ctx.strokeStyle = css(hex, alpha * 0.5);
      ctx.lineWidth = 2.5;
      ctx.strokeText(str, 0, 0);
    }
    ctx.fillStyle = css(hex, alpha);
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  text('NEON', 0, 8.9, 1.5, MAGENTA, 0.55, true);
  for (let i = 0; i < 4; i++) {
    const l = lamps[LAMP_MULT + i];
    text(`${i + 2}X`, l.x, l.y - 0.62, 0.42, YELLOW, 0.75, false);
  }
  text('SHOOT AGAIN', 0, 0.42, 0.34, RED, 0.85, false);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}
