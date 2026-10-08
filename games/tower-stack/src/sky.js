// The backdrop: a three-colour sky gradient, stars, the sun and the moon. It
// all hangs from the camera, so it stays put on screen while the tower rises;
// only the stars drift a little for depth. The colours follow the height of
// the tower: day, afternoon, dusk, night, deep night, dawn, and round again.
// Under a starry sky a shooting star crosses now and then.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smooth } from './shared.js';

export const PHASE_LAYERS = 25; // layers from one sky to the next

// The sky each PHASE_LAYERS reaches, for the milestones: KEYS[1] is golden
// hour, KEYS[2] sunset and so on; after dawn comes a new day.
const PHASE_NAMES = ['A new day', 'Golden hour', 'Sunset', 'Starry night', 'Midnight', 'Dawn'];

// The name of the last sky a tower of this many layers reached ('' below the
// first milestone).
export function phaseName(layers) {
  const k = Math.floor(layers / PHASE_LAYERS);
  return k > 0 ? PHASE_NAMES[k % PHASE_NAMES.length] : '';
}

// Sky top, middle and bottom, cloud tint, star brightness, sun and moon height
// (-1 bottom of the screen, 1 top) and sun colour.
const KEYS = [
  { top: 0x3a8ee2, mid: 0x7fc0f2, bot: 0xd6f0ff, cloud: 0xffffff, stars: 0, sun: 0.5, moon: -1.8, sunHex: 0xfff3c4 },
  { top: 0x3c6fc6, mid: 0x93b4e6, bot: 0xffd6a0, cloud: 0xfff0dc, stars: 0, sun: 0.12, moon: -1.8, sunHex: 0xffd27a },
  { top: 0x33286c, mid: 0xa04d86, bot: 0xff9858, cloud: 0xffbca2, stars: 0.3, sun: -0.62, moon: -1.3, sunHex: 0xff7442 },
  { top: 0x0a1036, mid: 0x1a2766, bot: 0x3b4a8c, cloud: 0x5b6697, stars: 1, sun: -1.8, moon: 0.42, sunHex: 0xff7442 },
  { top: 0x05050f, mid: 0x111038, bot: 0x2e1d5e, cloud: 0x3f416e, stars: 1, sun: -1.8, moon: 0.55, sunHex: 0xff9a7a },
  { top: 0x2a3c84, mid: 0x9278bc, bot: 0xffb49c, cloud: 0xffd8cf, stars: 0.35, sun: -0.5, moon: -0.5, sunHex: 0xffa27a },
];
const STARS_SMALL = 90;
const STARS_BIG = 34;
const STAR_PARALLAX = 0.12;
const METEOR_TIME = 0.7; // a shooting star crosses in this long
const METEOR_SPEED = 0.75; // view widths per second

// Turns KEYS into THREE.Color objects once.
const keyColors = KEYS.map((k) => ({
  top: new THREE.Color(k.top),
  mid: new THREE.Color(k.mid),
  bot: new THREE.Color(k.bot),
  cloud: new THREE.Color(k.cloud),
  sun: new THREE.Color(k.sunHex),
}));

// A disc with a soft halo, as one geometry with per-vertex alpha.
function glowDisc(radius, halo, haloAlpha, spots) {
  const parts = [];
  const core = new THREE.CircleGeometry(radius, 28);
  parts.push(core);
  const ring = new THREE.RingGeometry(radius, radius * halo, 28, 1);
  ring.translate(0, 0, -0.01);
  parts.push(ring);
  for (let i = 0; i < spots.length; i++) {
    const [x, y, r] = spots[i];
    const g = new THREE.CircleGeometry(radius * r, 12);
    g.translate(radius * x, radius * y, 0.01);
    parts.push(g);
  }
  for (let p = 0; p < parts.length; p++) {
    const g = parts[p];
    const pos = g.attributes.position;
    const colors = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      let shade = 1;
      let alpha = 1;
      if (p === 1) {
        // The halo fades out towards its outer edge.
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        alpha = r <= radius * 1.01 ? haloAlpha : 0;
      } else if (p > 1) {
        shade = 0.86; // moon craters
      }
      colors[i * 4] = shade;
      colors[i * 4 + 1] = shade;
      colors[i * 4 + 2] = shade;
      colors[i * 4 + 3] = alpha;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }
  const geometry = mergeGeometries(parts);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  return geometry;
}

function starField(count, width, height, seed, dim) {
  const positions = new Float32Array(count * 2 * 3);
  const colors = new Float32Array(count * 2 * 3);
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * width;
    const y = (rand() - 0.5) * height;
    const k = dim + rand() * (1 - dim);
    const warm = rand();
    // The same star twice, one field height apart, so the field can wrap.
    for (let c = 0; c < 2; c++) {
      const j = (i * 2 + c) * 3;
      positions[j] = x;
      positions[j + 1] = y + c * height;
      positions[j + 2] = 0;
      colors[j] = k * (warm > 0.7 ? 1 : 0.85);
      colors[j + 1] = k * 0.92;
      colors[j + 2] = k * (warm > 0.7 ? 0.8 : 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function createSky(camera, viewW, viewH, fog) {
  const group = new THREE.Group();
  group.position.z = -(camera.far - 4);
  camera.add(group);

  // The gradient: a plane with three rows of vertices (top, middle, bottom).
  const W = viewW * 1.25;
  const H = viewH * 1.25;
  const plane = new THREE.PlaneGeometry(W, H, 1, 2);
  const pos = plane.attributes.position;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getY(i)) < 0.01) pos.setY(i, -H * 0.08);
  const colors = new Float32Array(pos.count * 3);
  plane.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const gradient = new THREE.Mesh(
    plane,
    new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, fog: false }),
  );
  gradient.renderOrder = -3;
  group.add(gradient);

  const starMaterialS = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const starMaterialB = starMaterialS.clone();
  starMaterialB.size = 3;
  const starsS = new THREE.Points(starField(STARS_SMALL, W, H, 11, 0.45), starMaterialS);
  const starsB = new THREE.Points(starField(STARS_BIG, W, H, 23, 0.75), starMaterialB);
  starsS.position.z = starsB.position.z = 0.5;
  starsS.renderOrder = starsB.renderOrder = -2;
  starsS.frustumCulled = starsB.frustumCulled = false;
  group.add(starsS, starsB);

  const discMaterial = () =>
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const sun = new THREE.Mesh(glowDisc(0.62, 2.3, 0.32, []), discMaterial());
  const moon = new THREE.Mesh(
    glowDisc(0.5, 2.1, 0.22, [
      [-0.3, 0.25, 0.22],
      [0.28, -0.1, 0.16],
      [-0.05, -0.42, 0.12],
    ]),
    discMaterial(),
  );
  moon.material.color.setHex(0xeef1ff);
  sun.position.set(viewW * 0.33, 0, 1);
  moon.position.set(-viewW * 0.31, 0, 1);
  sun.renderOrder = moon.renderOrder = -1;
  group.add(sun, moon);

  // A shooting star: a thin streak whose tail fades out (vertex alpha), the
  // head at its +x end. Same kind of material as the sun and the moon.
  const streak = new THREE.PlaneGeometry(1, 1);
  const streakColors = new Float32Array(4 * 4);
  for (let i = 0; i < 4; i++) {
    const head = streak.attributes.position.getX(i) > 0;
    streakColors.set([1, 0.97, 0.88, head ? 1 : 0], i * 4);
  }
  streak.setAttribute('color', new THREE.BufferAttribute(streakColors, 4));
  const meteor = new THREE.Mesh(streak, discMaterial());
  meteor.scale.set(viewW * 0.16, 0.05, 1);
  meteor.position.z = 0.8;
  meteor.renderOrder = -2;
  meteor.frustumCulled = false;
  group.add(meteor);
  let meteorT = METEOR_TIME; // time since the last one started
  let meteorWait = 2; // until the next one
  let meteorVX = 0;
  let meteorVY = 0;

  const top = new THREE.Color();
  const mid = new THREE.Color();
  const bot = new THREE.Color();
  const cloudTint = new THREE.Color();
  const tmp = new THREE.Color();
  let shownLevel = -1;
  let time = 0;
  let starLevel = 0;

  function paint() {
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const c = y > 0 ? top : y < -H * 0.3 ? bot : mid;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    plane.attributes.color.needsUpdate = true;
    fog.color.copy(mid).lerp(bot, 0.5);
  }

  return {
    // The tint the clouds should take under this sky.
    cloudTint,

    // level: height of the tower in layers (eased), camY: camera height for
    // the star parallax, zoom: the camera's zoom (the backdrop scales with it
    // so it always fills the screen).
    update(dt, level, camY, zoom) {
      time += dt;
      group.scale.setScalar(1 / zoom);

      if (Math.abs(level - shownLevel) > 0.002) {
        shownLevel = level;
        const p = Math.max(0, level) / PHASE_LAYERS;
        const i = Math.floor(p) % KEYS.length;
        const j = (i + 1) % KEYS.length;
        const f = smooth(p - Math.floor(p));
        const a = keyColors[i];
        const b = keyColors[j];
        top.copy(a.top).lerp(b.top, f);
        mid.copy(a.mid).lerp(b.mid, f);
        bot.copy(a.bot).lerp(b.bot, f);
        cloudTint.copy(a.cloud).lerp(b.cloud, f);
        paint();
        starLevel = KEYS[i].stars + (KEYS[j].stars - KEYS[i].stars) * f;
        const sunY = KEYS[i].sun + (KEYS[j].sun - KEYS[i].sun) * f;
        const moonY = KEYS[i].moon + (KEYS[j].moon - KEYS[i].moon) * f;
        sun.position.y = (sunY * viewH) / 2;
        moon.position.y = (moonY * viewH) / 2;
        sun.visible = sunY > -1.5;
        moon.visible = moonY > -1.5;
        sun.material.color.copy(tmp.copy(a.sun).lerp(b.sun, f));
      }

      // Shooting stars only under a properly starry sky.
      if (meteorT < METEOR_TIME) {
        meteorT += dt;
        meteor.position.x += meteorVX * dt;
        meteor.position.y += meteorVY * dt;
        const k = meteorT / METEOR_TIME;
        meteor.material.opacity = starLevel * Math.min(1, k * 6) * (1 - k * k);
        meteor.visible = meteorT < METEOR_TIME;
      } else {
        meteor.visible = false;
        meteorWait -= dt;
        if (meteorWait <= 0 && starLevel > 0.6) {
          // From the upper part of the sky, slanting down to one side.
          const side = Math.random() < 0.5 ? -1 : 1;
          const a = 0.35 + Math.random() * 0.3;
          meteorVX = side * Math.cos(a) * viewW * METEOR_SPEED;
          meteorVY = -Math.sin(a) * viewW * METEOR_SPEED;
          meteor.position.x = -side * viewW * (0.05 + Math.random() * 0.3);
          meteor.position.y = viewH * (0.2 + Math.random() * 0.22);
          meteor.rotation.z = Math.atan2(meteorVY, meteorVX);
          meteorT = 0;
          meteorWait = 3 + Math.random() * 6;
        }
      }

      starsS.visible = starsB.visible = starLevel > 0.01;
      if (starsS.visible) {
        // A slow twinkle, the two fields out of step.
        starMaterialS.opacity = starLevel * (0.75 + 0.25 * Math.sin(time * 1.7));
        starMaterialB.opacity = starLevel * (0.8 + 0.2 * Math.sin(time * 2.3 + 2));
        const wrap = -((((camY * STAR_PARALLAX) % H) + H) % H);
        starsS.position.y = wrap;
        starsB.position.y = wrap;
      }
    },
  };
}
