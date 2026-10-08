// Hazards: electric zappers (two emitter nodes and a crackling beam, some of
// them rotating) and missiles that announce themselves with a blinking icon
// at the right edge before they fly in. Fixed pools, one InstancedMesh per part.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAM_X, CAM_Z, DESPAWN_X, RIGHT_EDGE, VIEW_HALF_W, box, canvasTexture, cyl, paint } from './shared.js';

// ---------------------------------------------------------------- zappers

const MAX_ZAPPERS = 14;
const BEAM_R = 0.17; // hit radius of a beam (nodes are treated the same)

function nodeGeometry() {
  return mergeGeometries([
    cyl(0.36, 0.34, 10, 'z', 0, 0, 0, 0x343a48),
    cyl(0.27, 0.4, 10, 'z', 0, 0, 0, 0xffc93a),
    cyl(0.13, 0.46, 8, 'z', 0, 0, 0, 0xe9fdff),
    box(0.5, 0.18, 0.3, -0.28, 0, 0, 0x5b6274), // bracket pointing away from the beam
  ]);
}

// Jagged lightning on a transparent canvas, stretched along each beam.
function lightningTexture() {
  const texture = canvasTexture(128, 32, (ctx) => {
    const bolt = (width, color, jag) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 16);
      for (let x = 8; x <= 128; x += 8) ctx.lineTo(x, 16 + (x === 128 ? 0 : (Math.random() - 0.5) * jag));
      ctx.stroke();
    };
    bolt(7, 'rgba(70, 200, 255, 0.55)', 22);
    bolt(4, '#7ff0ff', 24);
    bolt(2, '#ffffff', 18);
    bolt(2, '#bff8ff', 26);
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export function createZappers(scene, particles) {
  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x111111 });
  const nodes = new THREE.InstancedMesh(nodeGeometry(), lambert, MAX_ZAPPERS * 2);
  const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const cores = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.09, 0.09), coreMaterial, MAX_ZAPPERS);
  const glowMap = lightningTexture();
  const glowMaterial = new THREE.MeshBasicMaterial({
    map: glowMap,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.85), glowMaterial, MAX_ZAPPERS);
  for (const mesh of [nodes, cores, glows]) {
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    mesh.count = 0;
    scene.add(mesh);
  }

  const zappers = Array.from({ length: MAX_ZAPPERS }, () => ({
    active: false,
    x: 0, // centre
    y: 0,
    len: 0, // node to node
    angle: 0,
    spin: 0, // radians per second, 0 for a fixed zapper
    ax: 0,
    ay: 0,
    bx: 0,
    by: 0,
  }));

  const dummy = new THREE.Object3D();
  let flicker = 0;

  function ends(z) {
    const hx = Math.cos(z.angle) * z.len * 0.5;
    const hy = Math.sin(z.angle) * z.len * 0.5;
    z.ax = z.x - hx;
    z.ay = z.y - hy;
    z.bx = z.x + hx;
    z.by = z.y + hy;
  }

  function draw() {
    let n = 0;
    for (let i = 0; i < MAX_ZAPPERS; i++) {
      const z = zappers[i];
      if (!z.active) continue;
      // Nodes: the bracket of each one points away from the beam.
      dummy.scale.set(1, 1, 1);
      dummy.position.set(z.ax, z.ay, 0);
      dummy.rotation.set(0, 0, z.angle);
      dummy.updateMatrix();
      nodes.setMatrixAt(n * 2, dummy.matrix);
      dummy.position.set(z.bx, z.by, 0);
      dummy.rotation.set(0, 0, z.angle + Math.PI);
      dummy.updateMatrix();
      nodes.setMatrixAt(n * 2 + 1, dummy.matrix);
      // Beam: a thin core and a wider crackling glow.
      dummy.position.set(z.x, z.y, 0);
      dummy.rotation.set(0, 0, z.angle);
      dummy.scale.set(z.len, 1, 1);
      dummy.updateMatrix();
      cores.setMatrixAt(n, dummy.matrix);
      dummy.position.z = 0.05;
      dummy.scale.set(z.len, 0.8 + Math.random() * 0.45, 1);
      dummy.updateMatrix();
      glows.setMatrixAt(n, dummy.matrix);
      n++;
    }
    nodes.count = n * 2;
    cores.count = n;
    glows.count = n;
    nodes.instanceMatrix.needsUpdate = true;
    cores.instanceMatrix.needsUpdate = true;
    glows.instanceMatrix.needsUpdate = true;
  }

  return {
    list: zappers,

    // A zapper centred at (x, y), len between the nodes, angle in radians.
    add(x, y, len, angle, spin) {
      for (let i = 0; i < MAX_ZAPPERS; i++) {
        const z = zappers[i];
        if (z.active) continue;
        z.active = true;
        z.x = x;
        z.y = y;
        z.len = len;
        z.angle = angle;
        z.spin = spin;
        ends(z);
        return;
      }
    },

    // True if a coin at (x, y) would touch a zapper (also its whole swing).
    blocks(x, y, margin) {
      for (let i = 0; i < MAX_ZAPPERS; i++) {
        const z = zappers[i];
        if (!z.active) continue;
        if (z.spin !== 0) {
          const dx = x - z.x;
          const dy = y - z.y;
          const r = z.len * 0.5 + margin;
          if (dx * dx + dy * dy < r * r) return true;
        } else {
          const dx = z.bx - z.ax;
          const dy = z.by - z.ay;
          const len2 = dx * dx + dy * dy;
          let t = ((x - z.ax) * dx + (y - z.ay) * dy) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = z.ax + dx * t - x;
          const ey = z.ay + dy * t - y;
          if (ex * ex + ey * ey < margin * margin) return true;
        }
      }
      return false;
    },

    clear() {
      for (let i = 0; i < MAX_ZAPPERS; i++) zappers[i].active = false;
      draw();
    },

    update(dt, move) {
      for (let i = 0; i < MAX_ZAPPERS; i++) {
        const z = zappers[i];
        if (!z.active) continue;
        z.x -= move;
        z.angle += z.spin * dt;
        ends(z);
        if (z.x < DESPAWN_X) z.active = false;
        else if (Math.random() < dt * 3) {
          // A stray spark now and then.
          const t = Math.random();
          particles.emit(z.ax + (z.bx - z.ax) * t, z.ay + (z.by - z.ay) * t, 0.3, (Math.random() - 0.5) * 5, Math.random() * 4, 0.25, 0.14, 0xffffff, 0x3fd8ff, 10);
        }
      }
      // Crackle: jump the lightning texture around and pulse the core.
      flicker += dt;
      if (flicker > 0.05) {
        flicker = 0;
        glowMap.offset.x = Math.random();
        glowMap.repeat.x = Math.random() < 0.5 ? 1 : -1;
        coreMaterial.color.setHex(Math.random() < 0.5 ? 0xffffff : 0x9ff4ff);
      }
      draw();
    },

    // The zapper touching the hero, or null.
    hit(hero) {
      for (let i = 0; i < MAX_ZAPPERS; i++) {
        const z = zappers[i];
        if (!z.active || Math.abs(z.x) > z.len * 0.5 + 1.5) continue;
        if (hero.hitBy(z.ax, z.ay, z.bx, z.by, BEAM_R)) return z;
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------- missiles

const MAX_MISSILES = 4;
const TRACK_TIME = 0.75; // the warning follows the hero's height
const LOCK_TIME = 0.4; // then it stops and blinks fast before launch
const FLY_SPEED = 15; // on top of the scroll speed
const MISSILE_R = 0.2;
const OFF = 0;
const TRACK = 1;
const LOCK = 2;
const FLY = 3;

// The warning icon floats a little in front of everything, just inside the
// right edge of the screen at that depth.
const ICON_Z = 0.6;

function missileGeometry() {
  // Points left (-x), the way it flies.
  const nose = new THREE.ConeGeometry(0.19, 0.4, 8);
  nose.rotateZ(Math.PI / 2);
  nose.translate(-0.62, 0, 0);
  return mergeGeometries([
    cyl(0.19, 0.85, 8, 'x', 0, 0, 0, 0xf4f4f6),
    cyl(0.2, 0.14, 8, 'x', -0.22, 0, 0, 0xe8453c),
    cyl(0.2, 0.08, 8, 'x', 0.2, 0, 0, 0xe8453c),
    cyl(0.14, 0.14, 8, 'x', 0.49, 0, 0, 0x2d3340),
    box(0.3, 0.7, 0.05, 0.32, 0, 0, 0x3a3f4a), // fins
    box(0.3, 0.05, 0.7, 0.32, 0, 0, 0x3a3f4a),
    paint(nose, 0xe8453c),
  ]);
}

// White disc with a dark "!" and outline; instance colors tint it.
function warningTexture() {
  return canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#1d2030';
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(32, 32, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d2030';
    ctx.fillRect(28, 13, 8, 25);
    ctx.fillRect(28, 43, 8, 8);
  });
}

// sideRoom: how much further than on the 3:2 screen the view reaches to the
// right. Icons sit at the real edge and missiles start that much further
// out, leaving that much earlier, so they arrive when they would on 3:2.
export function createMissiles(scene, particles, sideRoom = 0) {
  const iconX = CAM_X + ((VIEW_HALF_W + sideRoom) * (CAM_Z - ICON_Z)) / CAM_Z - 0.75;
  const startX = RIGHT_EDGE + 1.2 + sideRoom;
  const bodies = new THREE.InstancedMesh(
    missileGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    MAX_MISSILES,
  );
  const icons = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({ map: warningTexture(), alphaTest: 0.5, fog: false }),
    MAX_MISSILES,
  );
  icons.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_MISSILES * 3), 3);
  for (const mesh of [bodies, icons]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }

  const missiles = Array.from({ length: MAX_MISSILES }, () => ({ state: OFF, x: 0, y: 0, t: 0 }));
  const dummy = new THREE.Object3D();
  const yellow = new THREE.Color(0xffd23f);
  const red = new THREE.Color(0xff3b3b);
  let trail = 0;

  function draw() {
    let nb = 0;
    let ni = 0;
    for (let i = 0; i < MAX_MISSILES; i++) {
      const m = missiles[i];
      if (m.state === FLY) {
        dummy.position.set(m.x, m.y, 0);
        dummy.rotation.set(m.x * 3, 0, 0); // a slow barrel roll
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        bodies.setMatrixAt(nb++, dummy.matrix);
      } else if (m.state === TRACK || m.state === LOCK) {
        const rate = m.state === TRACK ? 7 : 16;
        if ((m.t * rate) % 1 > 0.55) continue; // blink
        const pop = m.state === LOCK ? 1.25 : 1 + Math.min(1, m.t * 6) * 0.1;
        dummy.position.set(iconX, m.y, ICON_Z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(pop);
        dummy.updateMatrix();
        icons.setMatrixAt(ni, dummy.matrix);
        icons.setColorAt(ni, m.state === TRACK ? yellow : red);
        ni++;
      }
    }
    bodies.count = nb;
    icons.count = ni;
    bodies.instanceMatrix.needsUpdate = true;
    icons.instanceMatrix.needsUpdate = true;
    icons.instanceColor.needsUpdate = true;
  }

  return {
    // Starts a warning that becomes a missile at the hero's height.
    launch(heroY) {
      for (let i = 0; i < MAX_MISSILES; i++) {
        const m = missiles[i];
        if (m.state !== OFF) continue;
        m.state = TRACK;
        m.t = 0;
        m.y = heroY;
        return;
      }
    },

    // Warnings vanish (the run is over); missiles in flight keep going.
    cancelWarnings() {
      for (let i = 0; i < MAX_MISSILES; i++) {
        if (missiles[i].state === TRACK || missiles[i].state === LOCK) missiles[i].state = OFF;
      }
    },

    clear() {
      for (let i = 0; i < MAX_MISSILES; i++) missiles[i].state = OFF;
      draw();
    },

    // True while a warning is on screen or a missile is flying.
    busy() {
      for (let i = 0; i < MAX_MISSILES; i++) if (missiles[i].state !== OFF) return true;
      return false;
    },

    update(dt, move, heroY) {
      trail -= dt;
      const puff = trail <= 0;
      if (puff) trail = 1 / 45;
      for (let i = 0; i < MAX_MISSILES; i++) {
        const m = missiles[i];
        if (m.state === OFF) continue;
        m.t += dt;
        if (m.state === TRACK) {
          m.y += (heroY - m.y) * Math.min(1, dt * 9);
          if (m.t > TRACK_TIME) {
            m.state = LOCK;
            m.t = 0;
          }
        } else if (m.state === LOCK) {
          const lead = sideRoom / (FLY_SPEED + move / Math.max(dt, 0.001));
          if (m.t > LOCK_TIME - lead) {
            m.state = FLY;
            m.t = 0;
            m.x = startX;
          }
        } else {
          m.x -= FLY_SPEED * dt + move;
          if (puff) {
            particles.emit(m.x + 0.6, m.y + (Math.random() - 0.5) * 0.1, -0.1, 4, (Math.random() - 0.5), 0.22, 0.32, 0xfff07a, 0xff4a1f, 0);
            particles.emit(m.x + 0.8, m.y, -0.2, 2, (Math.random() - 0.5) * 1.5, 0.55, 0.36, 0xc9d0dc, 0x4c5368, -2);
          }
          if (m.x < DESPAWN_X) m.state = OFF;
        }
      }
      draw();
    },

    // The missile touching the hero (it is used up), or null.
    hit(hero) {
      for (let i = 0; i < MAX_MISSILES; i++) {
        const m = missiles[i];
        if (m.state !== FLY || Math.abs(m.x) > 2) continue;
        if (hero.hitBy(m.x - 0.75, m.y, m.x + 0.5, m.y, MISSILE_R)) {
          m.state = OFF;
          return m;
        }
      }
      return null;
    },
  };
}
