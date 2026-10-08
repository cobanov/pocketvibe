// Scenery: the sky gradient that turns from pastel day to dusk to a starry
// night as the climber gets higher, the sun and moon, the meadow and hills at
// the start, and parallax layers of big clouds, hot-air balloons and birds.
// Far layers sit deeper behind the column, so the perspective camera moves
// them slower. Each layer is one InstancedMesh whose pieces are moved back
// up above the view once they drop out of it.

import * as THREE from 'three';
import { CAM_Z, HALF_W, box, lowPoly, merge, paint, part, puff, rand, smoothstep, viewDrop, viewHalf } from './shared.js';
import { balloonGeometry, birdGeometry, discGeometry, skyCloudGeometry } from './models.js';

const FRAME_Z = 0.7; // just in front of the clouds
const SKY_Z = -80;
const STAR_Z = -76;
const DISC_Z = -70;
const STARS = 110;
const CLOUDS = 7;

// Sky colors (top, middle, bottom of the screen) for day, dusk and night.
const DAY = [0x86cdf6, 0xbfe6fb, 0xffe1ee];
const DUSK = [0x6a5cb5, 0xf09ab8, 0xffbf7a];
const NIGHT = [0x0a1034, 0x1a2760, 0x3a3e86];

// Light colors and strengths: hemisphere sky, hemisphere ground, sun.
const LIGHT_DAY = [0xffffff, 0xb6a8d0, 0xffffff, 1.35, 1.5];
const LIGHT_DUSK = [0xffd6c8, 0x8a5a86, 0xffa968, 1.2, 1.35];
const LIGHT_NIGHT = [0xb0bcff, 0x3a4078, 0xc4d0ff, 1.1, 0.85];

const BALLOON_COLORS = [0xff6b6b, 0xffb347, 0x5cc2ff, 0xb28dff, 0x5fd39a, 0xff8fc8];

function colors(list) {
  return list.map((hex) => new THREE.Color(hex));
}

// The meadow the climb starts from, with hills, trees, a cottage and far
// mountains behind it. Static, so it is one merged mesh.
function meadowGeometry() {
  const parts = [];
  // Striped grass on top (y = 0 is where the climber stands) and soil below.
  for (let i = 0; i < 24; i++) {
    parts.push(box(2, 0.4, 6, -24 + i * 2 + 1, -0.2, -0.5, i % 2 ? 0x8fdc6a : 0x9fe678));
  }
  parts.push(box(48, 0.3, 0.3, 0, -0.25, 2.55, 0x6cc24f)); // lip
  parts.push(box(48, 10, 6, 0, -5.4, -0.6, 0xd9a86c));
  parts.push(box(48, 0.2, 0.1, 0, -0.9, 2.42, 0xc08a4e));

  // Flowers and tufts along the front.
  const petals = [0xffffff, 0xff7aa8, 0xffe04a, 0xb48cff];
  for (let i = 0; i < 26; i++) {
    const x = -22 + i * 1.75 + rand(-0.4, 0.4);
    const z = rand(-1.5, 2);
    if (i % 3 === 0) {
      for (let k = 0; k < 3; k++) {
        const blade = new THREE.ConeGeometry(0.08, 0.36 - k * 0.06, 4);
        blade.rotateZ((k - 1) * 0.4);
        parts.push(part(blade, x + (k - 1) * 0.12, 0.15, z, 0x58b83f));
      }
    } else {
      parts.push(box(0.04, 0.26, 0.04, x, 0.13, z, 0x3f9a34));
      parts.push(puff(0.1, 1, 1, 1, x, 0.3, z, petals[i % 4], 0));
    }
  }

  // A cottage on the left, a fence on the right.
  parts.push(box(2.2, 1.5, 1.6, -9.5, 0.75, -1.8, 0xfff4e0));
  const roof = new THREE.ConeGeometry(1.75, 1.1, 4);
  roof.rotateY(Math.PI / 4);
  roof.scale(1.05, 1, 0.78);
  parts.push(part(roof, -9.5, 2.05, -1.8, 0xe8584a));
  parts.push(box(0.5, 0.85, 0.05, -9.2, 0.43, -0.98, 0x9a5b33));
  parts.push(box(0.42, 0.42, 0.05, -10.1, 0.95, -0.98, 0x8fd0ff));
  parts.push(box(0.3, 0.7, 0.3, -8.9, 2.4, -2.1, 0xb05a44)); // chimney
  for (let i = 0; i < 6; i++) parts.push(box(0.12, 0.7, 0.12, 7.5 + i * 0.8, 0.35, -1.2, 0xffffff));
  parts.push(box(4.4, 0.1, 0.08, 9.5, 0.5, -1.2, 0xffffff));
  parts.push(box(4.4, 0.1, 0.08, 9.5, 0.25, -1.2, 0xffffff));

  // Near hills with trees.
  const hillColors = [0x93db72, 0x84cf66, 0x9fe27e];
  for (let i = 0; i < 6; i++) {
    const hill = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    hill.scale(rand(5, 7), rand(2.6, 4), 3);
    parts.push(part(hill, -25 + i * 10 + rand(-2, 2), -0.6, -11, hillColors[i % 3]));
  }
  for (let i = 0; i < 14; i++) {
    const x = -24 + i * 3.6 + rand(-1, 1);
    if (Math.abs(x) < 6) continue;
    const s = rand(0.8, 1.3);
    parts.push(box(0.25 * s, 0.7 * s, 0.25 * s, x, 0.35 * s, -6.5 + rand(-1, 1), 0x7a5232));
    parts.push(part(new THREE.ConeGeometry(0.8 * s, 1.6 * s, 6), x, 1.4 * s, -6.5, 0x46ad57));
  }
  // Far hills and mountains, hazy blue.
  for (let i = 0; i < 6; i++) {
    const hill = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    hill.scale(rand(9, 12), rand(5, 8), 4);
    parts.push(part(hill, -34 + i * 13 + rand(-3, 3), -1.5, -26, i % 2 ? 0xa8dcb4 : 0x9cd2b0));
  }
  for (let i = 0; i < 5; i++) {
    const s = rand(10, 15);
    const x = -40 + i * 20 + rand(-4, 4);
    parts.push(part(new THREE.ConeGeometry(s * 0.8, s * 1.3, 6), x, s * 0.65 - 3, -46, 0xb5c2ec));
    parts.push(part(new THREE.ConeGeometry(s * 0.27, s * 0.44, 6), x, s * 1.08 - 3, -46, 0xf4f6ff));
  }
  return merge(parts);
}

// The margins either side of the column are dimmed a little, with a light
// line along each edge, so the play area reads at a glance. Colors carry
// alpha (r, g, b, a per vertex).
function frameGeometry() {
  const e = (HALF_W * (CAM_Z - FRAME_Z)) / CAM_Z; // lines up with the column edge at z = 0
  const strips = [
    [e - 0.03, e + 0.03, 1, 1, 1, 0.6, 0.6],
    [e + 0.03, e + 3, 0.16, 0.12, 0.33, 0.3, 0.2],
    [e + 3, e + 16, 0.16, 0.12, 0.33, 0.2, 0.2],
  ];
  const pos = [];
  const col = [];
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < strips.length; i++) {
      const [x0, x1, r, g, b, a0, a1] = strips[i];
      const xa = s * x0;
      const xb = s * x1;
      // Two triangles, wound to face the camera on both sides.
      const quad = s > 0 ? [xa, -9, xb, -9, xb, 9, xa, -9, xb, 9, xa, 9] : [xb, -9, xa, -9, xa, 9, xb, -9, xa, 9, xb, 9];
      for (let k = 0; k < 6; k++) {
        const x = quad[k * 2];
        pos.push(x, quad[k * 2 + 1], 0);
        const a = Math.abs(x) === Math.abs(xa) ? a0 : a1;
        col.push(r, g, b, a);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  return geo;
}

// A screen-filling plane with one row of vertices per band of the gradient.
function skyPlane(aspect) {
  const h = viewHalf(SKY_Z) * 2 + 4;
  const g = new THREE.PlaneGeometry(h * aspect + 8, h, 1, 12);
  paint(g, 0xffffff);
  return g;
}

// A layer of pieces at depths z0..z1 that wrap back above the view.
// place(item, halfW) gets the half width of the view at the item's depth.
function createLayer(scene, geometry, material, count, z0, z1, aspect, place) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
  scene.add(mesh);
  const items = [];
  for (let i = 0; i < count; i++) items.push({ x: 0, y: 0, z: 0, s: 1, sy: 1, turn: 0, vx: 0, rise: 0, t: 0 });

  return {
    mesh,
    items,
    // Puts item i somewhere at depth z0..z1, above `above` if given, or
    // anywhere in the view around camY.
    respawn(i, camY, above) {
      const it = items[i];
      it.z = rand(z0, z1);
      const half = viewHalf(it.z);
      const mid = camY - viewDrop(it.z);
      it.y = above ? mid + half + rand(1, half) : mid + rand(-half, half);
      place(it, half * aspect);
    },
    // Moves pieces that fell under the view back up above it.
    recycle(camY, margin) {
      for (let i = 0; i < count; i++) {
        const it = items[i];
        if (it.y < camY - viewDrop(it.z) - viewHalf(it.z) - margin) this.respawn(i, camY, true);
      }
    },
  };
}

// aspect: the screen's width / height. The view keeps its height on every
// screen (see main.js), so wider screens show more margin at the sides.
export function createSky(scene, renderer, aspect) {
  // Where the margins begin, as a share of the half width of the view: the
  // sun, the moon and the big clouds stay out past it, or near the edges on
  // screens with narrow margins.
  const margin = (HALF_W + 0.5) / (viewHalf(0) * aspect);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xb6a8d0, 1.35);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-4, 10, 8);
  scene.add(hemi, sun);

  const sky = new THREE.Mesh(skyPlane(aspect), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  scene.add(sky);
  const skyColors = sky.geometry.attributes.color;
  const skyPos = sky.geometry.attributes.position;
  const skyHalf = viewHalf(SKY_Z) + 2;

  const day = colors(DAY);
  const dusk = colors(DUSK);
  const night = colors(NIGHT);
  const lightDay = colors(LIGHT_DAY.slice(0, 3));
  const lightDusk = colors(LIGHT_DUSK.slice(0, 3));
  const lightNight = colors(LIGHT_NIGHT.slice(0, 3));
  const now = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const tmp = new THREE.Color();

  // Stars: tiny diamonds, infinitely far, so they stay put on the screen.
  const starGeo = new THREE.PlaneGeometry(1, 1);
  starGeo.rotateZ(Math.PI / 4);
  const starMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.InstancedMesh(starGeo, starMaterial, STARS);
  const starHalf = viewHalf(STAR_Z);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < STARS; i++) {
    dummy.position.set(rand(-starHalf * aspect, starHalf * aspect), rand(-starHalf * 0.6, starHalf), 0);
    dummy.scale.setScalar(Math.random() < 0.12 ? rand(0.6, 0.85) : rand(0.25, 0.45));
    dummy.updateMatrix();
    stars.setMatrixAt(i, dummy.matrix);
  }
  stars.visible = false;
  scene.add(stars);

  // Sun in the right margin, moon in the left; each a disc and a soft halo.
  const sunDisc = new THREE.Mesh(discGeometry(4.2, 0xffffff, []), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  const sunHalo = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.35, fog: false, depthWrite: false }),
  );
  const moonDisc = new THREE.Mesh(
    discGeometry(3.4, 0xf6f3ff, [[-0.35, 0.2, 0.22], [0.3, -0.3, 0.16], [0.2, 0.42, 0.1]]),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
  );
  const moonHalo = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x9fb2ff, transparent: true, opacity: 0.22, fog: false, depthWrite: false }),
  );
  scene.add(sunHalo, sunDisc, moonHalo, moonDisc);
  const discHalf = viewHalf(DISC_Z);

  const meadow = new THREE.Mesh(meadowGeometry(), lowPoly());
  scene.add(meadow);

  const frame = new THREE.Mesh(
    frameGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false }),
  );
  frame.frustumCulled = false;
  scene.add(frame);

  // Big soft clouds drifting far behind the column.
  const cloudFrom = Math.max(0.68, margin);
  const clouds = createLayer(scene, skyCloudGeometry(), lowPoly(0x56627c), CLOUDS, -52, -30, aspect, (it, halfW) => {
    // Out in the margins, so they never pass for clouds to climb.
    it.x = (Math.random() < 0.5 ? -1 : 1) * rand(halfW * cloudFrom, halfW * (cloudFrom + 0.37));
    it.s = rand(2.4, 4);
    it.sy = it.s * rand(0.6, 0.8);
    it.turn = rand(-0.4, 0.4);
    it.vx = rand(-0.25, 0.25);
  });

  // Hot-air balloons, mostly out in the margins.
  const balloons = createLayer(scene, balloonGeometry(), lowPoly(0x262626), 5, -30, -12, aspect, (it, halfW) => {
    const side = Math.random() < 0.5 ? -1 : 1;
    it.x = Math.random() < 0.7 ? side * rand(halfW * 0.6, halfW * 0.92) : rand(-halfW * 0.5, halfW * 0.5);
    it.s = rand(0.9, 1.3);
    it.sy = it.s;
    it.turn = rand(0, Math.PI);
    it.rise = rand(0.15, 0.4);
    it.t = rand(0, 6);
  });
  for (let i = 0; i < 5; i++) balloons.mesh.setColorAt(i, tmp.setHex(BALLOON_COLORS[i % BALLOON_COLORS.length]));

  // Birds fly across in little flocks; their wings flap by flipping the V.
  const birds = createLayer(
    scene,
    birdGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    6,
    -16,
    -8,
    aspect,
    (it, halfW) => {
      it.vx = (Math.random() < 0.5 ? -1 : 1) * rand(1.6, 2.6);
      it.x = -Math.sign(it.vx) * halfW * rand(0.9, 1.4);
      it.s = rand(0.9, 1.3);
      it.t = rand(0, 6);
    },
  );

  // Materials that glow brighter at night, so clouds and pests stay readable.
  const glows = [];

  let shownDusk = -1;
  let shownNight = -1;
  let duskAmt = 0;
  let nightAmt = 0;

  function mix(out, a, b, c) {
    return out.lerpColors(a, b, duskAmt).lerp(c, nightAmt);
  }

  // Recolors the sky, the fog and the lights for the current dusk and night.
  function recolor() {
    for (let k = 0; k < 3; k++) mix(now[k], day[k], dusk[k], night[k]);
    for (let i = 0; i < skyPos.count; i++) {
      const v = (skyPos.getY(i) + skyHalf) / (skyHalf * 2); // 0 at the bottom, 1 at the top
      if (v < 0.5) tmp.lerpColors(now[2], now[1], v * 2);
      else tmp.lerpColors(now[1], now[0], (v - 0.5) * 2);
      skyColors.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    skyColors.needsUpdate = true;
    scene.fog.color.lerpColors(now[2], now[1], 0.45);
    renderer.setClearColor(now[1]);
    mix(hemi.color, lightDay[0], lightDusk[0], lightNight[0]);
    mix(hemi.groundColor, lightDay[1], lightDusk[1], lightNight[1]);
    mix(sun.color, lightDay[2], lightDusk[2], lightNight[2]);
    hemi.intensity = LIGHT_DAY[3] + (LIGHT_DUSK[3] - LIGHT_DAY[3]) * duskAmt + (LIGHT_NIGHT[3] - LIGHT_DUSK[3]) * nightAmt;
    sun.intensity = LIGHT_DAY[4] + (LIGHT_DUSK[4] - LIGHT_DAY[4]) * duskAmt + (LIGHT_NIGHT[4] - LIGHT_DUSK[4]) * nightAmt;
    sunDisc.material.color.setHex(0xfff2a6).lerp(tmp.setHex(0xff9a52), duskAmt);
    sunHalo.material.color.copy(sunDisc.material.color);
    starMaterial.opacity = nightAmt;
    stars.visible = nightAmt > 0.01;
    for (let i = 0; i < glows.length; i++) {
      const g = glows[i];
      g.material.emissive.lerpColors(g.day, g.night, nightAmt);
    }
  }

  function writeLayer(layer, dt, flap) {
    const items = layer.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      it.t += dt;
      dummy.position.set(it.x, it.y, it.z);
      if (flap) {
        dummy.rotation.set(0, it.vx > 0 ? 0 : Math.PI, Math.sin(it.t * 3) * 0.1);
        dummy.scale.set(it.s, it.s * Math.sin(it.t * 11), it.s);
      } else {
        dummy.rotation.set(0, it.turn, 0);
        dummy.scale.set(it.s, it.sy, it.s);
      }
      dummy.updateMatrix();
      layer.mesh.setMatrixAt(i, dummy.matrix);
    }
    layer.mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    // Lets a material's emissive color rise to nightHex as night falls.
    glow(material, nightHex) {
      glows.push({ material, day: material.emissive.clone(), night: new THREE.Color(nightHex) });
    },

    // Scatters the layers around a camera at camY (a new run or the title).
    reset(camY) {
      for (let i = 0; i < CLOUDS; i++) clouds.respawn(i, camY, false);
      for (let i = 0; i < 5; i++) balloons.respawn(i, camY, false);
      for (let i = 0; i < 6; i++) birds.respawn(i, camY, false);
      // Nothing hides under the meadow at the start.
      for (let i = 0; i < CLOUDS; i++) clouds.items[i].y = Math.max(clouds.items[i].y, rand(4, 14));
      for (let i = 0; i < 5; i++) balloons.items[i].y = Math.max(balloons.items[i].y, rand(4, 12));
      for (let i = 0; i < 6; i++) birds.items[i].y = Math.max(birds.items[i].y, rand(3, 9));
      shownDusk = -1;
    },

    // height drives the time of day; camY is where the camera looks.
    update(dt, camY, height) {
      duskAmt = smoothstep(120, 380, height);
      nightAmt = smoothstep(430, 720, height);
      if (Math.abs(duskAmt - shownDusk) > 0.002 || Math.abs(nightAmt - shownNight) > 0.002) {
        shownDusk = duskAmt;
        shownNight = nightAmt;
        recolor();
      }

      sky.position.set(0, camY - viewDrop(SKY_Z), SKY_Z);
      frame.position.set(0, camY, FRAME_Z);
      const starMid = camY - viewDrop(STAR_Z);
      stars.position.set(0, starMid, STAR_Z);
      const discMid = camY - viewDrop(DISC_Z);
      // The sun sinks through dusk; the moon rises with the night.
      const sunY = discMid + discHalf * (0.55 - duskAmt * 1.05 - nightAmt * 0.8);
      const discX = discHalf * aspect * Math.max(0.72, margin);
      sunDisc.position.set(discX, sunY, DISC_Z);
      sunHalo.position.set(sunDisc.position.x, sunY, DISC_Z - 0.5);
      sunDisc.visible = sunHalo.visible = nightAmt < 0.99;
      const moonY = discMid + discHalf * (-1.3 + nightAmt * 1.85);
      moonDisc.position.set(-discX, moonY, DISC_Z);
      moonHalo.position.set(moonDisc.position.x, moonY, DISC_Z - 0.5);
      moonDisc.visible = moonHalo.visible = nightAmt > 0.01;

      for (let i = 0; i < CLOUDS; i++) clouds.items[i].x += clouds.items[i].vx * dt;
      for (let i = 0; i < 5; i++) {
        const b = balloons.items[i];
        b.y += b.rise * dt;
        b.turn += dt * 0.1;
      }
      for (let i = 0; i < 6; i++) {
        const b = birds.items[i];
        b.x += b.vx * dt;
        b.y += Math.sin(b.t * 1.3) * 0.2 * dt;
        if (Math.abs(b.x) > viewHalf(b.z) * aspect * 1.5) birds.respawn(i, camY, false);
      }
      clouds.recycle(camY, 4);
      balloons.recycle(camY, 3);
      birds.recycle(camY, 1);
      writeLayer(clouds, dt, false);
      writeLayer(balloons, dt, false);
      // Birds go to roost as night falls.
      birds.mesh.count = Math.round(6 * (1 - nightAmt));
      if (birds.mesh.count > 0) writeLayer(birds, dt, true);
    },
  };
}
