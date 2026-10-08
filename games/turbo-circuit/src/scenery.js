// Scenery around the circuit: grass, trees, the start/finish arch, the
// grandstand, trackside boards and the traffic cones cars can knock flying.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, paint, seededRandom } from './shared.js';
import { EDGE, LIMIT } from './track.js';
import { CONE } from './fx.js';

const BOARD_COLORS = [0xffffff, 0xe8433a, 0x2f6fdf, 0xffd23f];
const CROWD_COLORS = [0xe8433a, 0xffd23f, 0x2f6fdf, 0xffffff, 0x8a4fff, 0xff8a2a, 0x2ec27e];

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Mowed grass: two greens in wide stripes.
function grassTexture() {
  const t = canvasTexture(2, 2, (ctx) => {
    ctx.fillStyle = '#62b04a';
    ctx.fillRect(0, 0, 1, 2);
    ctx.fillStyle = '#58a443';
    ctx.fillRect(1, 0, 1, 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function signTexture() {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#e8433a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#1d2233';
    ctx.font = 'italic bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('TURBO CIRCUIT', w / 2, h / 2 + 2, w - 20);
  });
}

function pineGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.3, 1.2, 5, 1, true);
  trunk.translate(0, 0.6, 0);
  const low = new THREE.ConeGeometry(1.6, 2.6, 7);
  low.translate(0, 2.3, 0);
  const top = new THREE.ConeGeometry(1.1, 2.0, 7);
  top.translate(0, 3.6, 0);
  return mergeGeometries([paint(trunk, 0x7a5232), paint(low, 0x2f8a46), paint(top, 0x3c9e52)]);
}

function roundTreeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.3, 1.5, 5, 1, true).toNonIndexed();
  trunk.translate(0, 0.75, 0);
  const crown = new THREE.IcosahedronGeometry(1.6, 0);
  crown.translate(0, 2.7, 0);
  return mergeGeometries([paint(trunk, 0x7a5232), paint(crown, 0x5cb84c)]);
}

function coneGeometry() {
  const body = new THREE.CylinderGeometry(0.07, 0.32, 0.8, 8);
  body.translate(0, 0.48, 0);
  const band = new THREE.CylinderGeometry(0.2, 0.245, 0.18, 8, 1, true);
  band.translate(0, 0.45, 0);
  return mergeGeometries([paint(body, CONE), paint(band, 0xffffff), box(0.72, 0.08, 0.72, 0, 0.04, 0, CONE)]);
}

// Builds geometry in a local frame (x = left of the driving direction,
// z = along it) and moves it to sample i of the track.
function atSample(track, i, geometries) {
  const g = mergeGeometries(geometries);
  const m = new THREE.Matrix4().makeRotationY(track.heading[i]);
  m.setPosition(track.px[i], 0, track.pz[i]);
  g.applyMatrix4(m);
  return g;
}

function archGeometry(track) {
  const half = EDGE + 1.1;
  const parts = [];
  for (let s = -1; s <= 1; s += 2) {
    parts.push(box(1.3, 0.6, 1.3, s * half, 0.3, 0, 0x3a3f4f));
    parts.push(box(0.9, 7.2, 0.9, s * half, 3.6, 0, 0xf4f1ea));
    for (let k = 0; k < 3; k++) parts.push(box(0.94, 0.5, 0.94, s * half, 1.4 + k * 2, 0, 0xe8433a));
  }
  parts.push(box(half * 2 + 1, 1.7, 0.7, 0, 7.6, 0, 0x262a38));
  // Checkered bands on both faces of the beam.
  const cells = 20;
  const cw = (half * 2) / cells;
  for (let face = -1; face <= 1; face += 2) {
    for (let row = 0; row < 2; row++) {
      for (let k = 0; k < cells; k++) {
        if ((k + row) % 2) continue;
        const q = new THREE.PlaneGeometry(cw, 0.6);
        if (face < 0) q.rotateY(Math.PI);
        q.translate(-half + (k + 0.5) * cw, 7.3 + row * 0.6, face * 0.36);
        parts.push(paint(q, 0xffffff));
      }
    }
  }
  return atSample(track, 0, parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

// A grandstand full of colorful spectators on the outside of the main
// straight, facing the track.
function grandstandGeometry(track, side, rand) {
  const i = track.ahead(0, 4);
  const parts = [];
  const len = 46;
  const base = -side * (LIMIT + 5); // local x is to the left, offsets are to the right
  const dir = -side;
  for (let k = 0; k < 4; k++) {
    const x = base + dir * (1.1 + k * 2.2);
    const h = 0.9 * (k + 1);
    parts.push(box(2.2, h, len, x, h / 2, 0, k % 2 ? 0xb9bfcc : 0xa7aebd));
    for (let p = -len / 2 + 0.6; p < len / 2 - 0.4; p += 0.85) {
      if (rand() < 0.18) continue;
      const color = CROWD_COLORS[Math.floor(rand() * CROWD_COLORS.length)];
      parts.push(box(0.55, 0.7, 0.5, x + (rand() - 0.5) * 0.5, h + 0.35, p, color));
    }
  }
  const back = base + dir * 9.4;
  for (let p = -1; p <= 1; p++) parts.push(box(0.4, 7.6, 0.4, back, 3.8, p * (len / 2 - 1), 0xf4f1ea));
  parts.push(box(10.5, 0.35, len + 2, base + dir * 4.8, 7.7, 0, 0xe8433a));
  parts.push(box(10.5, 0.3, len + 2, base + dir * 4.8, 7.4, 0, 0xf4f1ea));
  parts.push(box(0.3, 1.2, len, base - dir * 0.2, 0.6, 0, 0x2f6fdf)); // front wall
  return atSample(track, i, parts.map((g) => g.toNonIndexed()));
}

// Advertising boards just beyond the barrier: on both sides of straights and
// on the outside of bends, so the edge of the drivable area is visible.
function boardGeometry(track) {
  const parts = [];
  const { n, px, pz, heading, curv } = track;
  let color = 0;
  for (let i = 0; i < n; i += 2) {
    for (let side = -1; side <= 1; side += 2) {
      const straight = Math.abs(curv[i]) < 0.008;
      if (!straight && side !== Math.sign(curv[i])) continue;
      const off = side * (LIMIT + 1.4);
      const b = new THREE.BoxGeometry(0.25, 1.0, track.step * 2 + 0.05);
      b.rotateY(heading[i]);
      b.translate(px[i] - track.tz[i] * off, 0.5, pz[i] + track.tx[i] * off);
      parts.push(paint(b, BOARD_COLORS[(color++ >> 1) % BOARD_COLORS.length]));
    }
  }
  return mergeGeometries(parts);
}

// Sky dome with a gradient and two rings of distant hills, one mesh that
// follows the camera. Unlit and unfogged; its colors already fade into the
// horizon haze.
function skyGeometry(horizon, rand) {
  const dome = new THREE.SphereGeometry(146, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const pos = dome.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const top = new THREE.Color(0x3f8fe0);
  const low = new THREE.Color(horizon);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 90));
    c.copy(low).lerp(top, Math.sqrt(t));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const parts = [dome.toNonIndexed()];
  parts[0].deleteAttribute('uv');
  parts[0].deleteAttribute('normal');

  // A ring of peaks: a strip of triangles whose top edge is jagged.
  const ring = (radius, minH, maxH, hex, segments) => {
    const p = [];
    const col = [];
    const peak = new THREE.Color(hex);
    const heights = [];
    for (let i = 0; i < segments; i++) heights.push(minH + (maxH - minH) * Math.pow(rand(), 1.5));
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const h0 = heights[i];
      const h1 = heights[(i + 1) % segments];
      const x0 = Math.cos(a0) * radius;
      const z0 = Math.sin(a0) * radius;
      const x1 = Math.cos(a1) * radius;
      const z1 = Math.sin(a1) * radius;
      p.push(x0, -4, z0, x1, -4, z1, x1, h1, z1, x0, -4, z0, x1, h1, z1, x0, h0, z0);
      for (const y of [-4, -4, h1, -4, h1, h0]) {
        c.copy(low).lerp(peak, Math.min(1, Math.max(0, y / maxH) * 1.6));
        col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  parts.push(ring(140, 8, 30, 0x8fb6d8, 40));
  parts.push(ring(128, 3, 13, 0x86c2a4, 56));
  return mergeGeometries(parts);
}

export function createSky(scene, horizon) {
  const sky = new THREE.Mesh(
    skyGeometry(horizon, seededRandom(3)),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }),
  );
  sky.frustumCulled = false;
  scene.add(sky);
  return {
    // Keeps the sky centred on the camera so it is never reached.
    update(camera) {
      sky.position.set(camera.position.x, 0, camera.position.z);
    },
  };
}

export function createScenery(scene, track) {
  const rand = seededRandom(7);
  const { n, px, pz } = track;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, px[i]);
    maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]);
    maxZ = Math.max(maxZ, pz[i]);
    cx += px[i] / n;
    cz += pz[i] / n;
  }

  // Grass far beyond the camera's reach, so its edge is never seen.
  const size = 900;
  const grassMap = grassTexture();
  grassMap.repeat.set(size / 16, 1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: grassMap }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  scene.add(ground);

  // Static props, merged into one mesh.
  const outside = Math.sign(-track.tz[0] * (px[0] - cx) + track.tx[0] * (pz[0] - cz)) || 1;
  const props = new THREE.Mesh(
    mergeGeometries([archGeometry(track), grandstandGeometry(track, outside, rand), boardGeometry(track).toNonIndexed()]),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  scene.add(props);

  // The sign on top of the arch, readable from both sides.
  const front = new THREE.PlaneGeometry(9, 2.25);
  front.rotateY(Math.PI);
  const back = new THREE.PlaneGeometry(9, 2.25);
  const sign = new THREE.Mesh(mergeGeometries([front, back]), new THREE.MeshBasicMaterial({ map: signTexture() }));
  sign.position.set(px[0], 9.7, pz[0]);
  sign.rotation.y = track.heading[0];
  scene.add(sign);

  // Trees on a jittered grid, away from the track and thinning out with distance.
  const treeMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const kinds = [pineGeometry(), roundTreeGeometry()];
  const spots = [[], []];
  for (let x = minX - 70; x <= maxX + 70; x += 8.5) {
    for (let z = minZ - 70; z <= maxZ + 70; z += 8.5) {
      const tx = x + (rand() - 0.5) * 6;
      const tz = z + (rand() - 0.5) * 6;
      const d = track.nearestDistance(tx, tz);
      if (d < LIMIT + 3.5 || rand() > 1.05 - d / 58) continue;
      spots[rand() < 0.55 ? 0 : 1].push([tx, tz, 0.8 + rand() * 0.55, rand() * 6.3, 0.82 + rand() * 0.18]);
    }
  }
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  console.info(`trees ${spots[0].length + spots[1].length}`);
  for (let k = 0; k < 2; k++) {
    const list = spots[k];
    const trees = new THREE.InstancedMesh(kinds[k], treeMaterial, list.length);
    for (let i = 0; i < list.length; i++) {
      const [x, z, s, r, shade] = list[i];
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, r, 0);
      dummy.scale.set(s, s * (0.9 + (shade - 0.82) * 2), s);
      dummy.updateMatrix();
      trees.setMatrixAt(i, dummy.matrix);
      trees.setColorAt(i, color.setRGB(shade, shade * 1.02, shade));
    }
    trees.computeBoundingSphere();
    scene.add(trees);
  }

  // Cones in groups of three on the inside of the sharpest corners.
  const homes = [];
  let last = -100;
  for (let i = 0; i < n; i++) {
    const c = Math.abs(track.curv[i]);
    if (c < 0.03 || i - last < 25) continue;
    let peak = true;
    for (let k = -8; k <= 8; k++) if (Math.abs(track.curv[(i + k + n) % n]) > c) peak = false;
    if (!peak) continue;
    last = i;
    const off = -Math.sign(track.curv[i]) * (EDGE + 1.1);
    for (let k = -1; k <= 1; k++) {
      const j = (i + k * 4 + n) % n;
      homes.push(px[j] - track.tz[j] * off, pz[j] + track.tx[j] * off);
    }
  }
  const coneCount = homes.length / 2;
  const cones = new THREE.InstancedMesh(coneGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), coneCount);
  cones.frustumCulled = false;
  scene.add(cones);

  const cxs = new Float32Array(coneCount);
  const cys = new Float32Array(coneCount);
  const czs = new Float32Array(coneCount);
  const cvx = new Float32Array(coneCount);
  const cvy = new Float32Array(coneCount);
  const cvz = new Float32Array(coneCount);
  const tumble = new Float32Array(coneCount);
  const tumbleV = new Float32Array(coneCount);
  const yaw = new Float32Array(coneCount);
  const state = new Uint8Array(coneCount); // 0 standing, 1 flying, 2 knocked over
  let dirty = true;

  function drawCones() {
    for (let i = 0; i < coneCount; i++) {
      dummy.position.set(cxs[i], cys[i], czs[i]);
      dummy.rotation.set(tumble[i], yaw[i], 0, 'YXZ');
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      cones.setMatrixAt(i, dummy.matrix);
    }
    cones.instanceMatrix.needsUpdate = true;
  }

  return {
    resetCones() {
      for (let i = 0; i < coneCount; i++) {
        cxs[i] = homes[i * 2];
        czs[i] = homes[i * 2 + 1];
        cys[i] = 0;
        tumble[i] = 0;
        yaw[i] = i;
        state[i] = 0;
      }
      dirty = true;
    },

    // Knocks cones that cars touch into the air. Returns how many the
    // player hit this frame.
    updateCones(dt, cars, fx) {
      let playerHits = 0;
      for (let i = 0; i < coneCount; i++) {
        if (state[i] === 0) {
          for (let c = 0; c < cars.length; c++) {
            const car = cars[c];
            const dx = cxs[i] - car.x;
            const dz = czs[i] - car.z;
            if (dx * dx + dz * dz > 1.4) continue;
            const speed = Math.hypot(car.vx, car.vz);
            if (speed < 2) continue;
            state[i] = 1;
            cvx[i] = car.vx * 0.8 + dx * 3;
            cvz[i] = car.vz * 0.8 + dz * 3;
            cvy[i] = 5 + speed * 0.18;
            tumbleV[i] = 8 + Math.random() * 6;
            yaw[i] = Math.atan2(cvx[i], cvz[i]);
            car.vx *= 0.96;
            car.vz *= 0.96;
            fx.burst(4, cxs[i], 0.5, czs[i], 4, 4, 0.22, 0.5, CONE, 14);
            if (car.isPlayer) playerHits++;
            break;
          }
        } else if (state[i] === 1) {
          dirty = true;
          cvy[i] -= 26 * dt;
          cxs[i] += cvx[i] * dt;
          cys[i] += cvy[i] * dt;
          czs[i] += cvz[i] * dt;
          tumble[i] += tumbleV[i] * dt;
          if (cys[i] <= 0 && cvy[i] < 0) {
            cys[i] = 0;
            cvx[i] *= 0.5;
            cvz[i] *= 0.5;
            cvy[i] *= -0.35;
            if (cvy[i] < 1.5) {
              // Settle lying on its side.
              state[i] = 2;
              tumble[i] = Math.PI / 2;
              cys[i] = 0.3;
            }
          }
        }
      }
      if (dirty) {
        drawCones();
        dirty = false;
      }
      return playerHits;
    },
  };
}
