// The player: a small round robot that rolls along the maze grid. Turns are
// buffered (main.js keeps the wanted direction) and taken at the next junction
// that allows them; near a junction the turn cuts the corner, so steering
// feels smooth rather than snapping cell by cell. A D-pad held on a diagonal
// gives a second direction, taken where the robot would otherwise stop at a
// wall, so a held direction is never ignored when it is the only way on.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { START_X, START_Y, W } from './mazes.js';
import {
  DX,
  DY,
  LEFT,
  NONE,
  ball,
  box,
  glowDisc,
  glowMaterial,
  opposite,
  paint,
  worldX,
  worldZ,
  wrapAngle,
  wrapX,
} from './shared.js';

const CORNER = 0.45; // a turn is accepted this close to a junction (cells)
const SIZE = 1.3; // as wide as a corridor allows, so the robot reads on a 3.4" screen
const BODY = 0xf3f6ff;
const VISOR = 0x161d38;
const EYE = 0x56f2ff;
const FIN = 0x3fc9ff;

// Faces +z at yaw 0. The camera looks down steeply, so the parts that tell
// which way it faces (visor, eyes, the fin on top) sit high on the body.
function botGeometry() {
  const ear = new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10);
  ear.rotateZ(Math.PI / 2);
  const earL = paint(ear.clone().translate(-0.36, 0.42, -0.02), FIN);
  const earR = paint(ear.translate(0.36, 0.42, -0.02), FIN);
  const stalk = new THREE.CylinderGeometry(0.018, 0.026, 0.22, 5);
  stalk.translate(0, 0.86, -0.12);
  return mergeGeometries([
    ball(0.37, 1, 0.95, 1, 0, 0.4, 0, BODY, 11), // body
    ball(0.3, 1.04, 0.56, 0.62, 0, 0.5, 0.17, VISOR, 10), // visor wrapping the upper front
    ball(0.075, 1, 1.25, 0.7, -0.115, 0.55, 0.33, EYE, 6), // eyes
    ball(0.075, 1, 1.25, 0.7, 0.115, 0.55, 0.33, EYE, 6),
    box(0.07, 0.07, 0.42, 0, 0.76, -0.06, FIN), // fin along the top
    earL,
    earR,
    paint(stalk, 0xa4b0cc), // antenna
    ball(0.07, 1, 1, 1, 0, 0.99, -0.12, 0xff7a5c, 6),
    box(0.14, 0.08, 0.18, -0.15, 0.04, 0.05, VISOR), // feet
    box(0.14, 0.08, 0.18, 0.15, 0.04, 0.05, VISOR),
  ]).scale(SIZE, SIZE, SIZE);
}

function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}

export function createPlayer(scene, maze) {
  const mesh = new THREE.Mesh(botGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.rotation.order = 'YXZ';
  scene.add(mesh);
  const glow = new THREE.Mesh(glowDisc(1), glowMaterial(0x3fd8ff, 0.6));
  glow.position.y = 0.02;
  scene.add(glow);

  let yaw = 0;
  let walk = 0; // distance rolled, drives the bob
  let munch = 0;
  let lean = 0;
  let deadTime = 0;

  const player = {
    x: START_X,
    y: START_Y,
    dir: LEFT,
    moving: true,
    alive: true,
    hidden: false,

    // The cell the player is in (columns wrapped).
    get cx() {
      return wrapX(Math.round(this.x));
    },
    get cy() {
      return Math.round(this.y);
    },

    reset() {
      this.x = START_X;
      this.y = START_Y;
      this.dir = LEFT;
      this.moving = true;
      this.alive = true;
      this.hidden = false;
      yaw = -Math.PI / 2;
      munch = 0;
      lean = 0;
      deadTime = 0;
    },

    // Moves along the grid at `speed` cells per second, turning towards
    // `want` (a direction or NONE) as soon as the maze allows it. `alt` (the
    // other half of a diagonal) is taken only instead of stopping at a wall.
    update(dt, want, speed, alt = NONE) {
      if (!this.alive) return;
      if (!this.turn(want, true) && !this.moving) this.turn(alt, false);
      if (!this.moving) {
        if (!maze.open(Math.round(this.x) + DX[this.dir], Math.round(this.y) + DY[this.dir])) return;
        this.moving = true;
      }

      let dist = speed * dt;
      walk += dist;
      // What is left of a cut corner melts away while moving on.
      if ((this.dir & 1) === 0) this.y = approach(this.y, Math.round(this.y), dist);
      else this.x = approach(this.x, Math.round(this.x), dist);

      for (let guard = 0; dist > 1e-6 && guard < 8; guard++) {
        const horizontal = (this.dir & 1) === 0;
        const s = horizontal ? DX[this.dir] : DY[this.dir];
        const m = horizontal ? this.x : this.y;
        const c = Math.round(m);
        let next;
        if (Math.abs(m - c) < 1e-6) {
          // At a cell centre: a buffered turn is taken here, a wall stops us.
          const cx = Math.round(this.x);
          const cy = Math.round(this.y);
          if (want !== NONE && want !== this.dir && maze.open(cx + DX[want], cy + DY[want])) {
            this.dir = want;
            continue;
          }
          if (!maze.open(cx + DX[this.dir], cy + DY[this.dir])) {
            if (alt !== NONE && (alt & 1) !== (this.dir & 1) && maze.open(cx + DX[alt], cy + DY[alt])) {
              this.dir = alt;
              continue;
            }
            this.moving = false;
            break;
          }
          next = c + s;
        } else {
          next = s > 0 ? Math.ceil(m) : Math.floor(m);
        }
        const step = Math.abs(next - m);
        const move = step <= dist ? next : m + s * dist;
        dist -= Math.min(step, dist);
        if (horizontal) {
          this.x = move;
          if (this.x < -0.5) this.x += W;
          else if (this.x >= W - 0.5) this.x -= W;
        } else {
          this.y = move;
        }
      }
    },

    // Turns towards d now if it may: a reversal at once (when allowed), any
    // other turn within CORNER of a junction that opens that way.
    turn(d, reverse) {
      if (d === NONE || d === this.dir) return false;
      if (this.moving && d === opposite(this.dir)) {
        if (reverse) this.dir = d;
        return reverse;
      }
      const cx = Math.round(this.x);
      const cy = Math.round(this.y);
      const off = Math.abs(this.x - cx) + Math.abs(this.y - cy);
      if (off > CORNER || !maze.open(cx + DX[d], cy + DY[d])) return false;
      this.dir = d;
      this.moving = true;
      return true;
    },

    // A quick squash when something is eaten.
    munch(amount) {
      munch = Math.max(munch, amount);
    },

    die() {
      this.alive = false;
      deadTime = 0;
    },

    draw(dt) {
      mesh.visible = !this.hidden;
      glow.visible = !this.hidden;
      if (this.hidden) return;

      // Shrinks into the tunnel mouths at the left and right edges.
      const edge = Math.max(0, Math.min(1, (this.x + 0.5) * 2.4, (W - 0.5 - this.x) * 2.4));
      const x = worldX(this.x);
      const z = worldZ(this.y);

      if (!this.alive) {
        // Spin up, rise a little and shrink away; main.js bursts it at the end.
        deadTime += dt;
        yaw += dt * (6 + deadTime * 26);
        const s = Math.max(0.01, 1 - Math.max(0, deadTime - 0.5) * 1.6);
        mesh.position.set(x, Math.min(0.5, deadTime * 0.6), z);
        mesh.rotation.set(0, yaw, 0);
        mesh.scale.set(s * (1 + deadTime * 0.3), s, s * (1 + deadTime * 0.3));
        glow.position.x = x;
        glow.position.z = z;
        glow.scale.setScalar(s);
        return;
      }

      const target = Math.atan2(DX[this.dir], DY[this.dir]);
      yaw += wrapAngle(target - yaw) * Math.min(1, dt * 18);
      lean += ((this.moving ? 0.16 : 0) - lean) * Math.min(1, dt * 10);
      munch = Math.max(0, munch - dt * 6);
      const bob = this.moving ? Math.abs(Math.sin(walk * Math.PI)) * 0.06 : 0;
      const sq = Math.sin(munch * Math.PI) * 0.18;
      mesh.position.set(x, bob, z);
      mesh.rotation.set(lean, yaw, 0);
      mesh.scale.set(edge * (1 + sq), edge * (1 - sq), edge * (1 + sq));
      glow.position.x = x;
      glow.position.z = z;
      glow.scale.setScalar(edge);
    },
  };

  player.reset();
  return player;
}
