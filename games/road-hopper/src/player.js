// The chicken: one hop per D-pad press with squash and stretch, riding logs,
// and the ways a run can end (flattened, sunk or carried off by the hawk).

import * as THREE from 'three';
import { HALF, RIVER, WATER_Y, clamp } from './shared.js';
import { chickenGeometry } from './models.js';

const HOP_TIME = 0.13; // seconds in the air per hop
const HOP_HEIGHT = 0.42;
const REPEAT = 0.16; // a held direction hops again after this long
const TURN_SPEED = 24;

// Directions, in this order: UP, DOWN, LEFT, RIGHT.
const DX = [0, 0, -1, 1];
const DR = [1, -1, 0, 0];
const FACE = [0, Math.PI, Math.PI / 2, -Math.PI / 2];
const BUTTON = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

export function createPlayer(scene, world, shadowMaterial) {
  const mesh = new THREE.Mesh(chickenGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(mesh);

  // Fake shadow: a dark transparent disc on whatever the chicken stands on.
  const shadowGeometry = new THREE.CircleGeometry(0.36, 12);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  scene.add(shadow);

  const player = {
    row: 0, // the row the chicken stands on (or is hopping from)
    rowPos: 0, // continuous row position; z = -rowPos
    cellRow: 0, // the row used for collisions: switches halfway through a hop
    x: 0,
    y: 0,
    baseY: 0, // height of the surface below, without the hop arc
    hopping: false,
    t: 0,
    fromX: 0,
    toX: 0,
    fromRow: 0,
    toRow: 0,
    fromY: 0,
    toY: 0,
    face: 0,
    faceTarget: 0,
    squash: 0, // landing squash, 1 right after landing
    bump: 0, // a little shake when hopping into a tree
    snapOff: 0, // drawn offset that eases out after settling on a log cell
    queued: -1, // a direction pressed mid-hop, used on landing
    sinceHop: 1,
    idle: 0, // seconds since the last hop
    maxRow: 0,
    landed: false, // true on the frame the chicken lands
    hopped: false, // true on the frame a hop starts
    bumped: false, // true on the frame a hop is blocked
    dead: false,
    death: '',
    deathT: 0,
    clock: 0,

    reset() {
      this.row = 0;
      this.rowPos = 0;
      this.cellRow = 0;
      this.x = 0;
      this.y = 0;
      this.baseY = 0;
      this.hopping = false;
      this.face = 0;
      this.faceTarget = 0;
      this.squash = 0;
      this.bump = 0;
      this.snapOff = 0;
      this.queued = -1;
      this.sinceHop = 1;
      this.idle = 0;
      this.maxRow = 0;
      this.landed = false;
      this.hopped = false;
      this.bumped = false;
      this.dead = false;
      this.death = '';
      mesh.visible = true;
      shadow.visible = true;
      this.draw();
    },

    // Turns towards a direction (0 UP, 1 DOWN, 2 LEFT, 3 RIGHT) without hopping.
    turn(dir) {
      this.faceTarget = FACE[dir];
      this.bump = 0.6;
    },

    // Starts a hop. Returns false (with a little bump) when the way is blocked.
    hop(dir) {
      this.faceTarget = FACE[dir];
      this.sinceHop = 0;
      const toRow = this.row + DR[dir];
      // On the river the chicken keeps its offset; on land it snaps to the grid.
      const river = world.rowType(toRow) === RIVER;
      const toX = river ? this.x + DX[dir] : clamp(Math.round(this.x), -HALF, HALF) + DX[dir];
      // A log may carry the chicken a little past the edge columns; from
      // there it can still hop on to the next river row.
      const wide = river && toRow !== this.row && world.rowType(this.row) === RIVER;
      if (world.blocked(toRow, toX, wide)) {
        this.bump = 1;
        this.bumped = true;
        return false;
      }
      this.hopped = true;
      this.hopping = true;
      this.t = 0;
      this.fromX = this.x;
      this.toX = toX;
      this.fromRow = this.row;
      this.toRow = toRow;
      this.fromY = this.baseY;
      this.toY = world.surfaceY(toRow);
      this.idle = 0;
      return true;
    },

    // Moves the chicken onto x (the middle of a log cell or lily pad) and
    // lets the model slide there instead of jumping.
    settle(x) {
      this.snapOff += this.x - x;
      this.x = x;
    },

    // input is null when the game is not taking controls (title screen).
    update(dt, input) {
      this.landed = false;
      this.hopped = false;
      this.bumped = false;
      this.clock += dt;
      this.sinceHop += dt;
      this.idle += dt;
      this.squash = Math.max(0, this.squash - dt * 7);
      this.bump = Math.max(0, this.bump - dt * 6);
      this.snapOff *= Math.max(0, 1 - dt * 18);

      if (this.dead) {
        this.deathT += dt;
        if (this.death === 'water') {
          this.y = this.baseY - Math.min(1.2, this.deathT * 2.2);
          if (this.y < WATER_Y - 0.9) mesh.visible = false;
        }
        this.draw(dt);
        return;
      }

      if (input) {
        for (let d = 0; d < 4; d++) if (input.pressed(BUTTON[d])) this.queued = d;
      }

      if (this.hopping) {
        this.t += dt / HOP_TIME;
        if (this.toRow === this.fromRow) {
          // A sideways hop along a log moves with the log.
          const drift = world.drift(this.row) * dt;
          this.fromX += drift;
          this.toX += drift;
        }
        const k = this.t < 1 ? this.t : 1;
        this.x = this.fromX + (this.toX - this.fromX) * k;
        this.rowPos = this.fromRow + (this.toRow - this.fromRow) * k;
        this.baseY = this.fromY + (this.toY - this.fromY) * k;
        this.y = this.baseY + HOP_HEIGHT * Math.sin(Math.PI * k);
        this.cellRow = k < 0.5 ? this.fromRow : this.toRow;
        if (this.t >= 1) {
          this.hopping = false;
          this.row = this.toRow;
          this.rowPos = this.row;
          this.x = this.toX;
          this.squash = 1;
          this.landed = true;
          if (this.row > this.maxRow) this.maxRow = this.row;
        }
      } else {
        // Ride along with a log (drift is 0 on land and on lily pads).
        this.x += world.drift(this.row) * dt;
        this.baseY = world.surfaceY(this.row);
        this.y = this.baseY;
      }

      // Not on the landing frame: the game first settles the landing (onto a
      // log cell, say), and a buffered hop starts from there on the next.
      if (!this.hopping && !this.landed && input) {
        let dir = this.queued;
        if (dir < 0 && this.sinceHop >= REPEAT) {
          const dp = input.dpad;
          dir = dp.y < 0 ? 0 : dp.y > 0 ? 1 : dp.x < 0 ? 2 : dp.x > 0 ? 3 : -1;
        }
        if (dir >= 0) {
          this.queued = -1;
          this.hop(dir);
        }
      }

      this.draw(dt);
    },

    // kind: 'car', 'train', 'water' or 'hawk'.
    die(kind) {
      this.dead = true;
      this.death = kind;
      this.deathT = 0;
      this.hopping = false;
      if (kind === 'water') shadow.visible = false;
      if (kind === 'car' || kind === 'train') {
        this.y = this.baseY;
        this.rowPos = this.cellRow;
      }
    },

    // The hawk carries the chicken: its position is set from outside.
    carry(x, y, z) {
      this.x = x;
      this.y = y;
      this.rowPos = -z;
      shadow.visible = false;
    },

    draw(dt = 0) {
      // Turn the shortest way round.
      let diff = this.faceTarget - this.face;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.face += diff * Math.min(1, dt * TURN_SPEED);

      let sy = 1;
      let sx = 1;
      let sz = 1;
      if (this.dead && (this.death === 'car' || this.death === 'train')) {
        // Flattened like a pancake, spread along the road.
        sy = Math.max(0.12, 1 - this.deathT * 14);
        sx = 1 + (1 - sy) * 0.75;
        sz = 1 + (1 - sy) * 0.4;
      } else if (this.hopping) {
        const s = Math.sin(Math.PI * Math.min(this.t, 1));
        sy = 1 + 0.24 * s;
        sx = sz = 1 - 0.12 * s;
      } else {
        const breathe = this.dead ? 0 : Math.sin(this.clock * 5) * 0.025;
        sy = 1 - 0.32 * this.squash + breathe - 0.1 * this.bump;
        sx = sz = 1 + 0.2 * this.squash + 0.06 * this.bump;
      }
      mesh.scale.set(sx, sy, sz);
      const x = this.x + this.snapOff;
      mesh.position.set(x, this.y, -this.rowPos);
      mesh.rotation.set(0, this.face + Math.sin(this.bump * 12) * 0.25 * this.bump, 0);

      const lift = this.y - this.baseY;
      shadow.position.set(x, this.baseY + 0.014, -this.rowPos);
      shadow.scale.setScalar(Math.max(0.5, 1 - lift * 0.8));
    },
  };

  player.reset();
  return player;
}
