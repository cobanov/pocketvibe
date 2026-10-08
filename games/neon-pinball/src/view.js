// The table in three.js. Table units are world units: x across, y up the
// table, z up off the playfield. Static parts are merged into one mesh;
// everything that moves or lights up is instanced, and all soft glows share
// one additive InstancedMesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ARC,
  BALL_R,
  BOUNDS,
  DRAIN_Y,
  FLIPPER,
  LAMP_COUNT,
  LANE_X,
  TARGET,
  bumpers,
  lamps,
  posts,
  segments,
  slings,
  targets,
  wedges,
} from './table.js';
import { BG, BUMPER_COLORS, CYAN, LIME, MAGENTA, STYLE, VIOLET, YELLOW, bar, post, shaded, slab } from './shared.js';
import { createFloorTexture } from './floor.js';

const WALL_H = 0.42;
const TRAIL = 6;
const SPARKS = 48;

// Index ranges in the glow InstancedMesh.
const G_BALL = 0;
const G_TRAIL = 1;
const G_BUMPER = G_TRAIL + TRAIL;
const G_SLING = G_BUMPER + 3;
const G_LAMP = G_SLING + 2;
const G_SPARK = G_LAMP + LAMP_COUNT;
const GLOWS = G_SPARK + SPARKS;

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Tapered capsule outline of a flipper, pointing along +x from the pivot.
function flipperGeometry() {
  const { len, rb, rt } = FLIPPER;
  const a = Math.asin((rb - rt) / len);
  const s = Math.sin(a);
  const c = Math.cos(a);
  const shape = new THREE.Shape();
  shape.moveTo(rb * s, rb * c);
  shape.lineTo(len + rt * s, rt * c);
  shape.absarc(len, 0, rt, Math.PI / 2 - a, -(Math.PI / 2 - a), true);
  shape.lineTo(rb * s, -rb * c);
  shape.absarc(0, 0, rb, -(Math.PI / 2 - a), -(Math.PI * 1.5 + a), true);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.34, bevelEnabled: false, curveSegments: 5 });
  g.deleteAttribute('uv');
  return shaded(g, 0xff7ae6, 0.5, 0.5);
}

function staticGeometry() {
  const parts = [];

  // Walls as neon bars, colored by style. Drop targets are drawn separately.
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.kind === TARGET) continue;
    const h = s.style === 'gate' ? 0.22 : WALL_H;
    parts.push(bar(s.ax, s.ay, s.bx, s.by, s.r * 2, h, 0, STYLE[s.style], 0.45, 0.35));
  }
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    parts.push(post(p.x, p.y, p.r, WALL_H + 0.06, 0, MAGENTA, 0.5, 0.4, 10));
  }

  // Pop bumper bodies; the caps that flash are instanced.
  for (let i = 0; i < bumpers.length; i++) {
    const b = bumpers[i];
    parts.push(post(b.x, b.y, b.r + 0.14, 0.1, 0, 0x2a1450, 0.6, 0.1, 16));
    parts.push(post(b.x, b.y, b.r, 0.36, 0, BUMPER_COLORS[i], 0.45, 0, 16));
  }

  // Filled tops of the slingshots and the drop target wedges.
  for (let i = 0; i < wedges.length; i++) parts.push(slab(wedges[i].points, WALL_H - 0.03, wedges[i].color));

  // Apron over the drain, with a neon edge. The ball disappears under it.
  parts.push(bar(-4.45, -0.85, 4.45, -0.85, 1.1, 0.55, 0, 0x150a38, 0.7, 0));
  parts.push(bar(-4.92, -0.3, 4.92, -0.3, 0.08, 0.03, 0.55, MAGENTA, 1, 0.3));
  parts.push(bar(-4.92, -1.36, 4.92, -1.36, 0.08, 0.03, 0.55, CYAN, 1, 0.2));
  for (let i = 0; i < 7; i++) {
    const x = -3.6 + i * 1.2;
    parts.push(bar(x - 0.3, -0.83, x + 0.3, -0.83, 0.1, 0.02, 0.55, i % 2 ? CYAN : MAGENTA, 1, 0.1));
  }

  // Cabinet side walls.
  parts.push(bar(-5.3, BOUNDS.y0, -5.3, ARC.y, 0.2, 0.75, 0, VIOLET, 0.35, 0));
  parts.push(bar(6.95, BOUNDS.y0, 6.95, ARC.y, 0.2, 0.75, 0, VIOLET, 0.35, 0));

  const merged = mergeGeometries(parts);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  return merged;
}

function plungerGeometry() {
  const head = new THREE.BoxGeometry(0.78, 0.3, 0.3);
  head.translate(0, -0.05, 0.2);
  const rod = new THREE.BoxGeometry(0.18, 2.4, 0.16);
  rod.translate(0, -1.3, 0.12);
  head.deleteAttribute('uv');
  rod.deleteAttribute('uv');
  return mergeGeometries([shaded(head, 0xff8a2b, 0.55, 0.3), shaded(rod, 0x8a8aa8, 0.6, 0)]);
}

// hh is the device layer: the camera is fitted to its screen shape. Taller
// screens than 3:2 show more above and below the table, so the score columns
// beside it keep their room; wider ones show more at the sides.
export function createView(scene, hh) {
  scene.fog = new THREE.Fog(BG, 36, 70);

  const camera = new THREE.PerspectiveCamera(30, hh.aspect, 1, 70);
  hh.fitCamera(camera);
  camera.up.set(0, 0, 1);
  const camBase = new THREE.Vector3(0.8, -12.0, 31.0);
  const camLook = new THREE.Vector3(0.8, 8.1, 0);

  // The ball is the only lit object: a hemisphere light plus one directional.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a2470, 1.5);
  hemi.position.set(0, 0, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3, -6, 10);
  scene.add(sun);

  // Floor with the painted artwork.
  const floorMat = new THREE.MeshBasicMaterial({ map: createFloorTexture() });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(BOUNDS.x1 - BOUNDS.x0, BOUNDS.y1 - BOUNDS.y0),
    floorMat,
  );
  floor.position.set((BOUNDS.x0 + BOUNDS.x1) / 2, (BOUNDS.y0 + BOUNDS.y1) / 2, 0);
  scene.add(floor);

  const vertexMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(staticGeometry(), vertexMat));

  // Flippers share one geometry; the right one is turned around.
  const flipGeo = flipperGeometry();
  const flipMeshes = [new THREE.Mesh(flipGeo, vertexMat), new THREE.Mesh(flipGeo, vertexMat)];
  for (let i = 0; i < 2; i++) {
    flipMeshes[i].position.set(i === 0 ? -FLIPPER.x : FLIPPER.x, FLIPPER.y, 0.02);
    scene.add(flipMeshes[i]);
  }

  const plunger = new THREE.Mesh(plungerGeometry(), vertexMat);
  plunger.position.x = LANE_X;
  scene.add(plunger);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xe9eeff, emissive: 0x2a3050 }),
  );
  scene.add(ball);

  // Bumper caps flash white when hit.
  const capGeo = post(0, 0, 0.6, 0.12, 0, 0xffffff, 0.55, 0, 16);
  const caps = new THREE.InstancedMesh(capGeo, vertexMat, bumpers.length);
  caps.frustumCulled = false; // instances pop and move, so cached bounds would be wrong
  scene.add(caps);

  // Slingshot rubbers.
  const rubberGeo = new THREE.BoxGeometry(1, 0.12, 0.3);
  rubberGeo.deleteAttribute('uv');
  shaded(rubberGeo, 0xffffff, 0.6, 0);
  const rubbers = new THREE.InstancedMesh(rubberGeo, vertexMat, 2);
  rubbers.frustumCulled = false;
  scene.add(rubbers);

  // Drop targets sink into the floor when hit.
  const targetGeo = new THREE.BoxGeometry(0.62, 0.16, 0.5);
  targetGeo.deleteAttribute('uv');
  shaded(targetGeo, 0xffffff, 0.55, 0);
  targetGeo.translate(0, 0, 0.25);
  const targetMesh = new THREE.InstancedMesh(targetGeo, vertexMat, targets.length);
  targetMesh.frustumCulled = false;
  scene.add(targetMesh);

  // Floor lamps.
  const lampMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), new THREE.MeshBasicMaterial(), LAMP_COUNT);
  lampMesh.frustumCulled = false;
  scene.add(lampMesh);

  // Soft glows: ball, trail, bumpers, slings, lamps and sparks in one draw.
  const glow = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    GLOWS,
  );
  glow.frustumCulled = false;
  scene.add(glow);

  // --- state for animations ---------------------------------------------
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const white = new THREE.Color(0xffffff);
  const flashColor = new THREE.Color();
  const bumperFlash = new Float32Array(bumpers.length);
  const slingFlash = new Float32Array(2);
  const targetZ = new Float32Array(targets.length);
  const targetFlash = new Float32Array(targets.length);
  const lampShown = new Float32Array(LAMP_COUNT);
  const lampPop = new Float32Array(LAMP_COUNT);
  const trailX = new Float32Array(TRAIL);
  const trailY = new Float32Array(TRAIL);
  let trailHead = 0;

  const spX = new Float32Array(SPARKS);
  const spY = new Float32Array(SPARKS);
  const spZ = new Float32Array(SPARKS);
  const spVX = new Float32Array(SPARKS);
  const spVY = new Float32Array(SPARKS);
  const spVZ = new Float32Array(SPARKS);
  const spLife = new Float32Array(SPARKS);
  const spMax = new Float32Array(SPARKS);
  const spColor = new Uint32Array(SPARKS);
  let nextSpark = 0;

  let shake = 0;
  let floorFlash = 0;

  function setGlow(i, x, y, z, sx, sy, angle, hex, k) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, angle);
    dummy.scale.set(sx, sy, 1);
    dummy.updateMatrix();
    glow.setMatrixAt(i, dummy.matrix);
    color.setHex(hex).multiplyScalar(k);
    glow.setColorAt(i, color);
  }

  function hideGlow(i) {
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    glow.setMatrixAt(i, dummy.matrix);
  }

  // Create the per-instance colors up front, so the shaders compile with them.
  for (let i = 0; i < targets.length; i++) targetMesh.setColorAt(i, color.setHex(LIME));
  for (let i = 0; i < bumpers.length; i++) caps.setColorAt(i, color.setHex(BUMPER_COLORS[i]));
  for (let i = 0; i < 2; i++) rubbers.setColorAt(i, color.setHex(YELLOW));
  for (let i = 0; i < LAMP_COUNT; i++) lampMesh.setColorAt(i, color.setHex(lamps[i].color));
  for (let i = 0; i < GLOWS; i++) {
    glow.setColorAt(i, color.setHex(0));
    hideGlow(i);
  }

  for (let i = 0; i < LAMP_COUNT; i++) lampShown[i] = -1;

  return {
    camera,

    bumperHit(i) {
      bumperFlash[i] = 1;
    },

    slingHit(i) {
      slingFlash[i] = 1;
    },

    targetHit(i) {
      targetFlash[i] = 1;
    },

    // A burst of sparks at (x, y) on the table.
    burst(x, y, hex, count, speed) {
      for (let n = 0; n < count; n++) {
        const i = nextSpark;
        nextSpark = (nextSpark + 1) % SPARKS;
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        spX[i] = x;
        spY[i] = y;
        spZ[i] = 0.3;
        spVX[i] = Math.cos(a) * v;
        spVY[i] = Math.sin(a) * v;
        spVZ[i] = 2 + Math.random() * 3;
        spMax[i] = 0.3 + Math.random() * 0.3;
        spLife[i] = spMax[i];
        spColor[i] = hex;
      }
    },

    shake(amount) {
      shake = Math.max(shake, amount);
    },

    flash(hex, amount) {
      flashColor.setHex(hex);
      floorFlash = Math.max(floorFlash, amount);
    },

    // levels: brightness 0..1 of every lamp. ballVisible hides a drained ball.
    update(dt, physics, levels, ballVisible) {
      const b = physics.ball;

      // Ball and its glow and trail.
      ball.visible = ballVisible && b.y > DRAIN_Y - 0.2;
      ball.position.set(b.x, b.y, BALL_R);
      trailHead = (trailHead + 1) % TRAIL;
      trailX[trailHead] = b.x;
      trailY[trailHead] = b.y;
      const speed = Math.hypot(b.vx, b.vy);
      if (ball.visible) {
        setGlow(G_BALL, b.x, b.y, 0.03, 1.7, 1.7, 0, CYAN, 0.55);
        const k = Math.min(1, Math.max(0, (speed - 8) / 20));
        for (let i = 1; i <= TRAIL; i++) {
          const j = (trailHead - i + TRAIL) % TRAIL;
          const f = 1 - i / (TRAIL + 1);
          if (k > 0 && i < TRAIL) setGlow(G_TRAIL + i - 1, trailX[j], trailY[j], 0.25, 0.9 * f, 0.9 * f, 0, CYAN, k * f * 0.8);
          else hideGlow(G_TRAIL + i - 1);
        }
      } else {
        for (let i = 0; i <= TRAIL; i++) hideGlow(G_BALL + i);
      }

      // Flippers and plunger.
      const fl = physics.flippers;
      flipMeshes[0].rotation.z = fl[0].angle;
      flipMeshes[1].rotation.z = Math.PI - fl[1].angle;
      plunger.position.y = physics.plunger.y + 0.1;

      // Bumper caps pop and flash.
      for (let i = 0; i < bumpers.length; i++) {
        const bp = bumpers[i];
        const f = bumperFlash[i];
        dummy.position.set(bp.x, bp.y, 0.36);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1 + f * 0.22, 1 + f * 0.22, 1 + f * 0.8);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
        color.setHex(BUMPER_COLORS[i]).lerp(white, f);
        caps.setColorAt(i, color);
        setGlow(G_BUMPER + i, bp.x, bp.y, 0.04, 2.6 + f * 1.4, 2.6 + f * 1.4, 0, BUMPER_COLORS[i], 0.3 + f * 0.9);
        bumperFlash[i] = Math.max(0, f - dt * 5);
      }
      caps.instanceMatrix.needsUpdate = true;
      caps.instanceColor.needsUpdate = true;

      // Slingshot rubbers bulge out when they fire.
      for (let i = 0; i < 2; i++) {
        const s = slings[i];
        const f = slingFlash[i];
        const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
        const angle = Math.atan2(s.by - s.ay, s.bx - s.ax);
        const out = 0.1 + f * 0.14;
        const mx = (s.ax + s.bx) / 2 + s.nx * out;
        const my = (s.ay + s.by) / 2 + s.ny * out;
        dummy.position.set(mx, my, 0.06);
        dummy.rotation.set(0, 0, angle);
        dummy.scale.set(len * 0.82, 1, 1);
        dummy.updateMatrix();
        rubbers.setMatrixAt(i, dummy.matrix);
        color.setHex(YELLOW).lerp(white, f);
        rubbers.setColorAt(i, color);
        setGlow(G_SLING + i, mx, my, 0.05, len + 1, 1.3 + f, angle, YELLOW, 0.18 + f * 0.8);
        slingFlash[i] = Math.max(0, f - dt * 6);
      }
      rubbers.instanceMatrix.needsUpdate = true;
      rubbers.instanceColor.needsUpdate = true;

      // Drop targets slide down into the floor or pop back up.
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const goal = physics.targetUp[i] ? 0 : -0.62;
        const step = dt * 5;
        targetZ[i] += Math.max(-step, Math.min(step, goal - targetZ[i]));
        dummy.position.set(t.x, t.y, targetZ[i]);
        dummy.rotation.set(0, 0, t.angle);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        targetMesh.setMatrixAt(i, dummy.matrix);
        color.setHex(LIME).lerp(white, targetFlash[i]);
        targetMesh.setColorAt(i, color);
        targetFlash[i] = Math.max(0, targetFlash[i] - dt * 4);
      }
      targetMesh.instanceMatrix.needsUpdate = true;
      targetMesh.instanceColor.needsUpdate = true;

      // Lamps: dim when off, bright with a glow when lit, a pop when they
      // switch on.
      for (let i = 0; i < LAMP_COUNT; i++) {
        const l = lamps[i];
        const v = levels[i];
        if (v > 0.5 && lampShown[i] >= 0 && lampShown[i] <= 0.5) lampPop[i] = 1;
        lampShown[i] = v;
        const s = l.r * (1 + lampPop[i] * 0.45);
        lampPop[i] = Math.max(0, lampPop[i] - dt * 4);
        dummy.position.set(l.x, l.y, 0.012);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(s, s, 1);
        dummy.updateMatrix();
        lampMesh.setMatrixAt(i, dummy.matrix);
        color.setHex(l.color).multiplyScalar(0.16 + 0.84 * v).lerp(white, v * 0.25);
        lampMesh.setColorAt(i, color);
        if (v > 0.05) setGlow(G_LAMP + i, l.x, l.y, 0.02, s * 5, s * 5, 0, l.color, v * 0.6);
        else hideGlow(G_LAMP + i);
      }
      lampMesh.instanceMatrix.needsUpdate = true;
      lampMesh.instanceColor.needsUpdate = true;

      // Sparks fly up, fall and fade.
      for (let i = 0; i < SPARKS; i++) {
        if (spLife[i] <= 0) {
          hideGlow(G_SPARK + i);
          continue;
        }
        spLife[i] -= dt;
        spVZ[i] -= 14 * dt;
        spX[i] += spVX[i] * dt;
        spY[i] += spVY[i] * dt;
        spZ[i] = Math.max(0.05, spZ[i] + spVZ[i] * dt);
        const f = Math.max(0, spLife[i] / spMax[i]);
        setGlow(G_SPARK + i, spX[i], spY[i], spZ[i], 0.55 * f + 0.1, 0.55 * f + 0.1, 0, spColor[i], f * 1.2);
      }
      glow.instanceMatrix.needsUpdate = true;
      glow.instanceColor.needsUpdate = true;

      // Floor flash and camera shake.
      floorFlash = Math.max(0, floorFlash - dt * 2.5);
      floorMat.color.setRGB(
        1 + floorFlash * flashColor.r,
        1 + floorFlash * flashColor.g,
        1 + floorFlash * flashColor.b,
      );
      shake = Math.max(0, shake - dt * 1.5);
      const j = dt > 0 ? shake * shake * 4 : 0;
      camera.position.set(
        camBase.x + (Math.random() - 0.5) * j,
        camBase.y + (Math.random() - 0.5) * j,
        camBase.z,
      );
      camera.lookAt(camLook);
    },
  };
}

