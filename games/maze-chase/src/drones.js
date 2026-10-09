// The four drones: their AI, their movement on the grid and their look.
//
// Each drone picks its way at every cell centre: never straight back, and of
// the remaining open ways the one whose next cell is closest to its target.
// The target depends on the drone and on the phase: in scatter each heads for
// its own corner, in chase
//   0 Rook (red) aims at the player,
//   1 Vex (violet) aims four cells ahead of the player,
//   2 Glint (green) aims at the point mirroring Rook through the cell two
//     ahead of the player, so it flanks when Rook is close behind,
//   3 Moth (amber) aims at the player but turns shy and heads for its corner
//     when it gets within eight cells.
// Frightened drones pick at random; eaten drones fly back to the base as a
// wisp along a precomputed shortest path, revive inside and come out again.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BASE_X, EXIT_Y, H, HOME_Y, W } from './mazes.js';
import {
  DOWN,
  DX,
  DY,
  LEFT,
  NONE,
  RIGHT,
  UP,
  ball,
  box,
  glowDisc,
  glowMaterial,
  opposite,
  paint,
  worldX,
  worldZ,
  wrapDX,
  wrapX,
} from './shared.js';

export const COUNT = 4;
export const COLORS = [0xff3d5e, 0xb46cff, 0x7cf046, 0xffa834];
const FRIGHT = new THREE.Color(0x2233d0);
const FRIGHT_FLASH = new THREE.Color(0xf4f6ff);
const FRIGHT_HALO = new THREE.Color(0xc8d4ff); // a pale halo makes the dark body pop on any maze
const PUPIL = new THREE.Color(0x10142a);
const PUPIL_SCARED = new THREE.Color(0xffb3cf);

// Drone 0 starts above the door, the others inside the base.
const HOME_X = [BASE_X, BASE_X, BASE_X - 2, BASE_X + 2];
const RELEASE = [0, 1.5, 5, 9]; // seconds before each leaves the base (level 1)
const SCATTER_X = [W - 3, 2, W - 1, 0];
const SCATTER_Y = [-4, -4, H + 3, H + 3];
const ORDER = [UP, LEFT, DOWN, RIGHT]; // tie-break order when two ways are equally good
const SHY_DIST = 8;

// Modes.
export const IN_BASE = 0;
export const LEAVING = 1;
export const ROAMING = 2;
export const WISP = 3;
export const ENTERING = 4;

const BODY_Y = 0.12; // hover height
const SIZE = 1.3; // as wide as a corridor allows, so drones read on a 3.4" screen
const EYE_X = 0.12 * SIZE;
const EYE_Y = 0.6 * SIZE;
const EYE_Z = 0.2 * SIZE;
const EYE_R = 0.112 * SIZE;
const PUPIL_R = 0.061 * SIZE;
// The camera looks down at 65 degrees: pupils sit on the side of the eye
// facing it, and "up the screen" is this direction in the world.
const VIEW_Y = Math.sin((65 * Math.PI) / 180);
const VIEW_Z = Math.cos((65 * Math.PI) / 180);

// A small quadcopter: white parts take the instance color. Seen only from
// above, so it has no underside and its rotors are flat discs.
function droneGeometry() {
  const arm = new THREE.BoxGeometry(0.98, 0.05, 0.07);
  const arms = [arm.clone().rotateY(Math.PI / 4), arm.rotateY(-Math.PI / 4)];
  for (const g of arms) {
    g.translate(0, 0.47, 0);
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3).fill(0.22);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const band = new THREE.CylinderGeometry(0.3, 0.22, 0.1, 10, 1, true);
  band.translate(0, 0.35, 0);
  const parts = [
    ball(0.3, 1, 0.74, 1, 0, 0.46, 0, 0xffffff, 10), // body
    paint(band, 0x5a5f70), // dark belly band
    ball(0.13, 1, 0.7, 1, 0, 0.66, 0, 0xffffff, 6), // top cap
    ...arms,
  ];
  for (let i = 0; i < 4; i++) {
    const x = (i & 1 ? 1 : -1) * 0.34;
    const z = (i & 2 ? 1 : -1) * 0.34;
    const rotor = new THREE.CircleGeometry(0.15, 10);
    rotor.rotateX(-Math.PI / 2);
    rotor.translate(x, 0.51, z);
    parts.push(paint(rotor, 0xdde3ee)); // rotor disc
    parts.push(box(0.05, 0.06, 0.05, x, 0.47, z, 0x2a2f3c)); // hub
  }
  return mergeGeometries(parts).scale(SIZE, SIZE, SIZE);
}

export function createDrones(scene, maze) {
  const bodyMesh = new THREE.InstancedMesh(
    droneGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x181820 }),
    COUNT,
  );
  const eyeMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(EYE_R, 8, 5),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x808080 }),
    COUNT * 2,
  );
  const pupilMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(PUPIL_R, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    COUNT * 2,
  );
  const wispMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.2, 0),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    COUNT,
  );
  const glowMesh = new THREE.InstancedMesh(glowDisc(1), glowMaterial(0xffffff, 0.6), COUNT);
  const meshes = [glowMesh, bodyMesh, eyeMesh, pupilMesh, wispMesh];
  const white = new THREE.Color(0xffffff);
  for (const m of meshes) {
    m.frustumCulled = false; // instances move, so the cached bounds would be wrong
    for (let i = 0; i < m.count; i++) m.setColorAt(i, white);
    scene.add(m);
  }
  for (let i = 0; i < COUNT * 2; i++) pupilMesh.setColorAt(i, PUPIL);

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const shown = new Int8Array(COUNT).fill(-1); // look last written into the colors
  let time = 0;

  const list = [];
  for (let i = 0; i < COUNT; i++) {
    list.push({
      index: i,
      x: 0,
      y: 0,
      dir: LEFT,
      mode: IN_BASE,
      fright: false,
      release: 0,
      tx: 0, // current target cell
      ty: 0,
      lookX: 0, // smoothed eye direction
      lookY: 0,
      pop: 0, // revive pop
      dist: 0, // distance travelled, for the wobble
    });
  }

  function atCentre(d) {
    return Math.abs(d.x - Math.round(d.x)) < 1e-6 && Math.abs(d.y - Math.round(d.y)) < 1e-6;
  }

  function setTarget(d, ctx) {
    const i = d.index;
    if (!ctx.chase && !(i === 0 && ctx.elroy > 1.1)) {
      d.tx = SCATTER_X[i];
      d.ty = SCATTER_Y[i];
      return;
    }
    const px = ctx.px;
    const py = ctx.py;
    const pd = ctx.pdir;
    if (i === 0) {
      d.tx = px;
      d.ty = py;
    } else if (i === 1) {
      d.tx = px + DX[pd] * 4;
      d.ty = py + DY[pd] * 4;
    } else if (i === 2) {
      const ax = px + DX[pd] * 2;
      const ay = py + DY[pd] * 2;
      d.tx = ax * 2 - list[0].x;
      d.ty = ay * 2 - list[0].y;
    } else {
      const far = Math.hypot(wrapDX(d.x, px), d.y - py) > SHY_DIST;
      d.tx = far ? px : SCATTER_X[i];
      d.ty = far ? py : SCATTER_Y[i];
    }
  }

  // Picks the way out of the cell the drone has just reached.
  function choose(d, ctx) {
    const cx = wrapX(Math.round(d.x));
    const cy = Math.round(d.y);
    const back = opposite(d.dir);
    if (d.mode === ROAMING && !d.fright) setTarget(d, ctx);
    let best = NONE;
    let bestScore = Infinity;
    for (let k = 0; k < 4; k++) {
      const dir = ORDER[k];
      if (dir === back && d.mode !== WISP) continue;
      const nx = cx + DX[dir];
      const ny = cy + DY[dir];
      if (!maze.open(nx, ny)) continue;
      let score;
      if (d.mode === WISP) score = maze.toExit(nx, ny);
      else if (d.fright) score = Math.random();
      else {
        const dx = nx - d.tx;
        const dy = ny - d.ty;
        score = dx * dx + dy * dy;
      }
      if (score < bestScore) {
        bestScore = score;
        best = dir;
      }
    }
    d.dir = best === NONE ? back : best;
  }

  // Moves a drone `dist` cells along the grid, deciding at every centre.
  function advance(d, dist, ctx) {
    for (let guard = 0; dist > 1e-6 && guard < 8; guard++) {
      const horizontal = (d.dir & 1) === 0;
      const s = horizontal ? DX[d.dir] : DY[d.dir];
      const m = horizontal ? d.x : d.y;
      const c = Math.round(m);
      const next = Math.abs(m - c) < 1e-6 ? c + s : s > 0 ? Math.ceil(m) : Math.floor(m);
      const step = Math.abs(next - m);
      // A move ending a hair short of a centre snaps onto it and decides
      // there; left short, the next frame would take it for a centre already
      // decided and carry on straight, even into a wall.
      if (step > dist + 1e-6) {
        if (horizontal) d.x = m + s * dist;
        else d.y = m + s * dist;
        d.dist += dist;
        break;
      }
      dist -= step;
      d.dist += step;
      if (horizontal) {
        d.x = next;
        if (d.x < -0.5) d.x += W;
        else if (d.x >= W - 0.5) d.x -= W;
      } else {
        d.y = next;
      }
      if (d.mode === WISP && wrapX(Math.round(d.x)) === BASE_X && Math.round(d.y) === EXIT_Y) {
        d.x = BASE_X;
        d.mode = ENTERING;
        return;
      }
      choose(d, ctx);
    }
  }

  // Free movement inside the base (no grid): towards (tx, ty) at `speed`.
  function glide(d, tx, ty, speed, dt) {
    let step = speed * dt;
    const dx = tx - d.x;
    if (Math.abs(dx) > 1e-6) {
      const mx = Math.min(Math.abs(dx), step);
      d.x += Math.sign(dx) * mx;
      d.dir = dx > 0 ? RIGHT : LEFT;
      step -= mx;
    }
    const dy = ty - d.y;
    if (step > 0 && Math.abs(dy) > 1e-6) {
      d.y += Math.sign(dy) * Math.min(Math.abs(dy), step);
      d.dir = dy > 0 ? DOWN : UP;
    }
    return Math.abs(tx - d.x) < 1e-6 && Math.abs(ty - d.y) < 1e-6;
  }

  const drones = {
    list,
    hidden: false,
    revived: 0, // counts drones that got home and came back to life

    // Puts every drone back home. releaseScale shortens the waits on later levels.
    reset(releaseScale) {
      for (let i = 0; i < COUNT; i++) {
        const d = list[i];
        d.x = HOME_X[i];
        d.y = i === 0 ? EXIT_Y : HOME_Y;
        d.dir = i === 0 ? RIGHT : i === 2 ? UP : DOWN; // Rook heads off towards its corner
        d.mode = i === 0 ? ROAMING : IN_BASE;
        d.fright = false;
        d.release = RELEASE[i] * releaseScale;
        d.lookX = DX[d.dir];
        d.lookY = DY[d.dir];
        d.pop = 0;
        d.dist = i * 3;
      }
      this.hidden = false;
    },

    // ctx: chase (phase), speed, frightSpeed, tunnelSpeed, wispSpeed, elroy,
    // and the player's cell px, py and direction pdir.
    update(dt, ctx) {
      for (let i = 0; i < COUNT; i++) {
        const d = list[i];
        if (d.mode === IN_BASE) {
          // Bob up and down until it is time to leave.
          d.release -= dt;
          d.y = HOME_Y + Math.sin(time * 6 + i * 2) * 0.28;
          d.dir = Math.cos(time * 6 + i * 2) > 0 ? DOWN : UP;
          if (d.release <= 0) d.mode = LEAVING;
        } else if (d.mode === LEAVING) {
          const speed = ctx.speed * 0.55;
          if (Math.abs(d.x - BASE_X) > 1e-6) glide(d, BASE_X, HOME_Y, speed, dt);
          else if (glide(d, BASE_X, EXIT_Y, speed, dt)) {
            d.mode = ROAMING;
            d.dir = i & 1 ? RIGHT : LEFT;
          }
        } else if (d.mode === ENTERING) {
          if (glide(d, BASE_X, HOME_Y, ctx.wispSpeed * 0.45, dt)) {
            d.mode = LEAVING;
            d.fright = false;
            d.pop = 1;
            this.revived++;
          }
        } else {
          let speed = ctx.wispSpeed;
          if (d.mode === ROAMING) {
            const cx = Math.round(d.x);
            const cy = Math.round(d.y);
            speed = d.fright ? ctx.frightSpeed : ctx.speed * (i === 0 ? ctx.elroy : 1);
            if (maze.isTunnel(cx, cy)) speed = Math.min(speed, ctx.tunnelSpeed);
          }
          advance(d, speed * dt, ctx);
        }
      }
    },

    // Phase change: roaming drones turn straight back, as a tell.
    reverse() {
      for (let i = 0; i < COUNT; i++) {
        const d = list[i];
        if (d.mode !== ROAMING) continue;
        const back = opposite(d.dir);
        // Mid-way between two cells the way back is always open.
        if (!atCentre(d) || maze.open(Math.round(d.x) + DX[back], Math.round(d.y) + DY[back])) d.dir = back;
      }
    },

    frighten() {
      for (let i = 0; i < COUNT; i++) {
        const d = list[i];
        if (d.mode === WISP || d.mode === ENTERING) continue;
        d.fright = true;
      }
      this.reverse();
    },

    calm() {
      for (let i = 0; i < COUNT; i++) list[i].fright = false;
    },

    anyFrightened() {
      for (let i = 0; i < COUNT; i++) if (list[i].fright) return true;
      return false;
    },

    // True while an eaten drone is flying home.
    anyWisp() {
      for (let i = 0; i < COUNT; i++) if (list[i].mode === WISP || list[i].mode === ENTERING) return true;
      return false;
    },

    // Index of a roaming drone touching the cell position (x, y), or -1.
    touching(x, y) {
      for (let i = 0; i < COUNT; i++) {
        const d = list[i];
        if (d.mode !== ROAMING && !(d.mode === LEAVING && d.y < EXIT_Y + 0.6)) continue;
        if (Math.abs(wrapDX(d.x, x)) + Math.abs(d.y - y) < 0.7) return i;
      }
      return -1;
    },

    eat(i) {
      const d = list[i];
      d.mode = WISP;
      d.fright = false;
      // Snap onto the grid line it was moving along, so the path search works.
      if ((d.dir & 1) === 0) d.y = Math.round(d.y);
      else d.x = Math.round(d.x);
    },

    // flashing: the fright is running out, frightened drones blink white.
    draw(dt, flashing) {
      time += dt;
      for (let i = 0; i < COUNT; i++) {
        const d = list[i];
        const x = worldX(d.x);
        const z = worldZ(d.y);
        const hidden = this.hidden;
        const ghost = d.mode === WISP || d.mode === ENTERING;
        const edge = Math.max(0, Math.min(1, (d.x + 0.5) * 2.4, (W - 0.5 - d.x) * 2.4));

        // The eyes turn towards where the drone is heading.
        const k = Math.min(1, dt * 12);
        d.lookX += (DX[d.dir] - d.lookX) * k;
        d.lookY += (DY[d.dir] - d.lookY) * k;
        d.pop = Math.max(0, d.pop - dt * 2.5);

        const bob = Math.sin(time * 5 + i * 1.7) * 0.06;
        const scared = d.fright;
        const wobble = scared ? Math.sin(time * 22 + i) * 0.18 : Math.sin(d.dist * 1.3 + i) * 0.25;
        const s = edge * (1 + Math.sin(d.pop * Math.PI) * 0.35);

        if (hidden || ghost) {
          bodyMesh.setMatrixAt(i, ZERO);
        } else {
          dummy.position.set(x, BODY_Y + bob, z);
          dummy.rotation.set(scared ? Math.sin(time * 17 + i) * 0.12 : 0, wobble, 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          bodyMesh.setMatrixAt(i, dummy.matrix);
        }

        // Colors change only when the look changes.
        const tone = ghost ? 3 : scared ? (flashing ? 2 : 1) : 0;
        if (tone !== shown[i]) {
          shown[i] = tone;
          if (tone === 1) color.copy(FRIGHT);
          else if (tone === 2) color.copy(FRIGHT_FLASH);
          else color.setHex(COLORS[i]);
          bodyMesh.setColorAt(i, color);
          glowMesh.setColorAt(i, tone === 1 ? FRIGHT_HALO : color);
          wispMesh.setColorAt(i, color);
          const pupil = scared ? PUPIL_SCARED : PUPIL;
          pupilMesh.setColorAt(i * 2, pupil);
          pupilMesh.setColorAt(i * 2 + 1, pupil);
          bodyMesh.instanceColor.needsUpdate = true;
          glowMesh.instanceColor.needsUpdate = true;
          wispMesh.instanceColor.needsUpdate = true;
          pupilMesh.instanceColor.needsUpdate = true;
        }

        // Eyes and pupils; a wisp keeps its eyes, a little lower.
        const eyeY = ghost ? 0.46 : BODY_Y + EYE_Y * s + bob;
        const eyeS = hidden ? 0 : (scared ? 0.72 : 1) * (ghost ? edge : s);
        const look = 0.049 * SIZE * eyeS;
        const lx = d.lookX * look;
        const up = -d.lookY * look; // moving up the maze looks up the screen
        for (let e = 0; e < 2; e++) {
          const ex = x + (e === 0 ? -EYE_X : EYE_X) * eyeS;
          const ez = z + EYE_Z * eyeS;
          dummy.rotation.set(0, 0, 0);
          dummy.position.set(ex, eyeY, ez);
          dummy.scale.set(eyeS, eyeS * (scared ? 0.75 : 1.1), eyeS);
          dummy.updateMatrix();
          eyeMesh.setMatrixAt(i * 2 + e, dummy.matrix);
          dummy.position.set(
            ex + lx,
            eyeY + 0.076 * SIZE * eyeS * VIEW_Y + up * VIEW_Z,
            ez + 0.076 * SIZE * eyeS * VIEW_Z - up * VIEW_Y,
          );
          dummy.scale.setScalar(eyeS);
          dummy.updateMatrix();
          pupilMesh.setMatrixAt(i * 2 + e, dummy.matrix);
        }

        // The wisp: a flickering ball of light under the eyes.
        if (ghost && !hidden) {
          const f = 0.8 + Math.sin(time * 40 + i * 3) * 0.2;
          dummy.position.set(x, 0.3, z);
          dummy.scale.setScalar(f * edge);
          dummy.updateMatrix();
          wispMesh.setMatrixAt(i, dummy.matrix);
        } else {
          wispMesh.setMatrixAt(i, ZERO);
        }

        // Glow on the floor.
        if (hidden) glowMesh.setMatrixAt(i, ZERO);
        else {
          dummy.position.set(x, 0.02, z);
          dummy.scale.setScalar((ghost ? 0.5 : 0.98 + bob) * edge);
          dummy.updateMatrix();
          glowMesh.setMatrixAt(i, dummy.matrix);
        }
      }
      for (let m = 0; m < meshes.length; m++) meshes[m].instanceMatrix.needsUpdate = true;
    },
  };

  return drones;
}
