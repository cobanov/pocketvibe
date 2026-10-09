// The snake: grid logic (body cells, the board's blocks, turn queue,
// collisions) and its look. main.js calls step() on a fixed tick; draw(t)
// places every segment between its previous and its current cell, so the
// motion looks smooth.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELLS, COLS, DIR_X, DIR_Z, RIGHT, ROWS, ball, box, cellX, cellZ, shadowDisc } from './shared.js';

const START_LEN = 4;
const START_X = 6; // the head's first cell, on row START_ROW, heading right
const START_ROW = 8;
const QUEUE = 2; // turns that can wait for the next ticks
const BEAD = 0.88; // body thickness in world units
const BEAD_TOP = 0.78; // bead height, times its thickness
const BULGES = 4; // swallowed apples travelling down the body at once
const BULGE_SPEED = 22; // segments per second
const FLASH_TIME = 1.1;

const HEAD_HEX = 0x5fe06a;
const HEAD_COLOR = new THREE.Color(HEAD_HEX);
const TAIL_COLOR = new THREE.Color(0x13a08e);
const FLASH_WHITE = new THREE.Color(0xffffff);
const FLASH_RED = new THREE.Color(0xff3b3b);
const DEAD_TINT = new THREE.Color(0x6f7d78);

function headGeometry() {
  return mergeGeometries([
    ball(0.5, 0.96, 0.72, 1.12, 0, 0.36, 0.02, HEAD_HEX, 10), // skull, nose towards +z
    ball(0.17, 1, 1, 1, -0.24, 0.62, 0.14, 0xffffff), // eyes
    ball(0.17, 1, 1, 1, 0.24, 0.62, 0.14, 0xffffff),
    ball(0.09, 1, 1, 1, -0.26, 0.73, 0.23, 0x16202a, 6), // pupils, on top so they show from any side
    ball(0.09, 1, 1, 1, 0.26, 0.73, 0.23, 0x16202a, 6),
    ball(0.1, 0.5, 0.8, 1, -0.44, 0.34, 0.22, 0xff9eb0, 6), // cheeks
    ball(0.1, 0.5, 0.8, 1, 0.44, 0.34, 0.22, 0xff9eb0, 6),
    box(0.06, 0.04, 0.05, -0.1, 0.44, 0.56, 0x1d6b3a), // nostrils
    box(0.06, 0.04, 0.05, 0.1, 0.44, 0.56, 0x1d6b3a),
  ]);
}

function tongueGeometry() {
  // Starts at the pivot and points along +z, so scale.z sticks it out.
  return mergeGeometries([
    box(0.07, 0.025, 0.3, 0, 0, 0.15, 0xe8334a),
    box(0.05, 0.025, 0.12, -0.035, 0, 0.34, 0xe8334a),
    box(0.05, 0.025, 0.12, 0.035, 0, 0.34, 0xe8334a),
  ]);
}

// A bead of the body: a ball cut a little below its middle, standing on the
// floor. From the camera's height its lower half hardly shows, and two rings
// of faces read as round at this size: 24 triangles with 8 segments (a full
// ball was 64, and a long snake ran over the triangle budget).
const CUT = THREE.MathUtils.degToRad(100);
const DOME_TOP = 0.5 * (1 - Math.cos(CUT)); // height of the unscaled dome
function beadGeometry(segments) {
  const g = new THREE.SphereGeometry(0.5, segments, 2, 0, Math.PI * 2, 0, CUT);
  g.translate(0, -0.5 * Math.cos(CUT), 0);
  return g;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function createSnake(scene) {
  // Body: a bead per segment plus a smaller one between neighbours (mostly
  // hidden, so it has fewer faces), so the body reads as one continuous tube.
  // 42 triangles per segment: a 150-long snake is about 6,300.
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const beadMesh = new THREE.InstancedMesh(beadGeometry(8), bodyMaterial, CELLS);
  const linkMesh = new THREE.InstancedMesh(beadGeometry(6), bodyMaterial, CELLS);
  for (const mesh of [beadMesh, linkMesh]) {
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    mesh.count = 0;
    mesh.setColorAt(0, HEAD_COLOR); // creates instanceColor once, up front
    scene.add(mesh);
  }

  const headMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const head = new THREE.Group();
  head.add(new THREE.Mesh(headGeometry(), headMaterial));
  const tongue = new THREE.Mesh(tongueGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  tongue.position.set(0, 0.28, 0.55);
  head.add(tongue);
  scene.add(head);

  const headShadow = shadowDisc(0.55, 0.22);
  scene.add(headShadow);

  // Logic state. Cells are integers; index 0 is the head.
  const bx = new Int16Array(CELLS);
  const bz = new Int16Array(CELLS);
  const grid = new Uint8Array(CELLS); // 1 where the body is, 2 for a block
  let blocks = null; // the board's blocks (boards.js), copied into grid on reset
  const queue = new Int8Array(QUEUE);
  let queued = 0;

  // Drawn (interpolated) positions and sizes of the segments.
  const px = new Float32Array(CELLS);
  const pz = new Float32Array(CELLS);
  const ps = new Float32Array(CELLS);
  const bulge = new Float32Array(BULGES);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  let colorsFor = -1; // length and color mode the instance colors were made for
  let flash = 0;
  let gulp = 0;
  let yaw = 0;
  let tongueClock = 0;
  let deadTime = 0;
  let wiggle = 0;

  const snake = {
    len: 0,
    dir: RIGHT,
    grow: 0,
    alive: true,
    turned: false, // the last step changed direction
    // Cell the tail left on the last step (the tail's "from" cell).
    tailX: 0,
    tailZ: 0,

    get headX() {
      return bx[0];
    },
    get headZ() {
      return bz[0];
    },

    // The board the next reset() sets up: a blocks array from boards.js.
    setBlocks(b) {
      blocks = b;
    },

    reset() {
      for (let i = 0; i < CELLS; i++) grid[i] = blocks && blocks[i] ? 2 : 0;
      this.len = START_LEN;
      this.dir = RIGHT;
      this.grow = 0;
      this.alive = true;
      this.turned = false;
      queued = 0;
      for (let i = 0; i < START_LEN; i++) {
        bx[i] = START_X - i;
        bz[i] = START_ROW;
        grid[START_ROW * COLS + bx[i]] = 1;
      }
      this.tailX = START_X - START_LEN;
      this.tailZ = START_ROW;
      bulge.fill(-1);
      flash = 0;
      gulp = 0;
      yaw = Math.PI / 2;
      deadTime = 0;
      colorsFor = -1;
      headMaterial.color.setRGB(1, 1, 1);
      headMaterial.emissive.setRGB(0, 0, 0);
      head.rotation.set(0, yaw, 0);
      tongue.visible = true;
    },

    // True if a cell is on the board and neither body nor block.
    isFree(cx, cz) {
      return cx >= 0 && cx < COLS && cz >= 0 && cz < ROWS && grid[cz * COLS + cx] === 0;
    },

    // True if moving the head into the cell would be safe on the next step
    // (the tail moves away unless the snake is growing).
    canEnter(cx, cz) {
      if (cx < 0 || cx >= COLS || cz < 0 || cz >= ROWS) return false;
      const g = grid[cz * COLS + cx];
      if (g === 0) return true;
      const t = this.len - 1;
      return g === 1 && this.grow === 0 && cx === bx[t] && cz === bz[t];
    },

    // Queues a turn. Turning back into the neck or repeating the same
    // direction is ignored; up to QUEUE turns wait for the next steps, so two
    // quick taps (a U-turn) both count. Returns true if the turn was queued.
    turn(d) {
      if (queued >= QUEUE) return false;
      const ref = queued > 0 ? queue[queued - 1] : this.dir;
      if (d === ref || d === (ref + 2) % 4) return false;
      queue[queued++] = d;
      return true;
    },

    // Moves one cell. Returns false (and does not move) when the head would
    // hit a wall or the body.
    step() {
      this.turned = queued > 0;
      if (queued > 0) {
        this.dir = queue[0];
        queue[0] = queue[1];
        queued--;
      }
      const nx = bx[0] + DIR_X[this.dir];
      const nz = bz[0] + DIR_Z[this.dir];
      if (!this.canEnter(nx, nz)) {
        this.alive = false;
        return false;
      }
      const t = this.len - 1;
      this.tailX = bx[t];
      this.tailZ = bz[t];
      if (this.grow > 0) {
        // The tail stays where it is and the body gets one segment longer.
        this.grow--;
        this.len++;
      } else {
        grid[bz[t] * COLS + bx[t]] = 0;
      }
      for (let i = this.len - 1; i > 0; i--) {
        bx[i] = bx[i - 1];
        bz[i] = bz[i - 1];
      }
      bx[0] = nx;
      bz[0] = nz;
      grid[nz * COLS + nx] = 1;
      return true;
    },

    // Title-screen autopilot: picks the safe direction that gets closest to
    // the target cell. Returns false when every way is blocked.
    think(tx, tz) {
      let best = -1;
      let bestScore = 1e9;
      for (let k = 0; k < 3; k++) {
        const d = (this.dir + (k === 0 ? 0 : k === 1 ? 1 : 3)) % 4;
        const nx = bx[0] + DIR_X[d];
        const nz = bz[0] + DIR_Z[d];
        if (!this.canEnter(nx, nz)) continue;
        let exits = 0;
        for (let e = 0; e < 4; e++) if (this.isFree(nx + DIR_X[e], nz + DIR_Z[e])) exits++;
        const score =
          Math.abs(nx - tx) + Math.abs(nz - tz) + (exits === 0 ? 100 : 0) + (k === 0 ? 0 : 0.4) + Math.random() * 0.5;
        if (score < bestScore) {
          bestScore = score;
          best = d;
        }
      }
      queued = 0;
      if (best < 0) return false;
      if (best !== this.dir) this.turn(best);
      return true;
    },

    // Called when an apple is swallowed: grows the body and sends a bulge
    // from the head to the tail.
    eat(segments) {
      this.grow += segments;
      gulp = 1;
      for (let i = 0; i < BULGES; i++) {
        if (bulge[i] < 0) {
          bulge[i] = 0;
          break;
        }
      }
    },

    die() {
      this.alive = false;
      flash = FLASH_TIME;
      deadTime = 0;
      tongue.visible = false;
    },

    // World position of the drawn head, for effects.
    get x() {
      return px[0];
    },
    get z() {
      return pz[0];
    },

    // t: progress from the previous cells to the current ones (0..1).
    draw(t, dt) {
      const n = this.len;
      wiggle += dt;

      for (let i = 0; i < n; i++) {
        const fx = i < n - 1 ? bx[i + 1] : this.tailX;
        const fz = i < n - 1 ? bz[i + 1] : this.tailZ;
        px[i] = cellX(fx) + (bx[i] - fx) * t;
        pz[i] = cellZ(fz) + (bz[i] - fz) * t;
        // Thinner towards the tail over the last few segments.
        const k = Math.min(1, (n - i) / 5);
        ps[i] = BEAD * (0.55 + 0.45 * k);
      }

      // Swallowed apples travel down the body as bulges.
      for (let b = 0; b < BULGES; b++) {
        if (bulge[b] < 0) continue;
        bulge[b] += dt * BULGE_SPEED;
        if (bulge[b] > n + 2) {
          bulge[b] = -1;
          continue;
        }
        const at = bulge[b];
        const from = Math.max(1, Math.floor(at - 2));
        const to = Math.min(n - 1, Math.ceil(at + 2));
        for (let i = from; i <= to; i++) {
          const d = Math.abs(i - at);
          if (d < 1.6) ps[i] *= 1 + 0.32 * (1 - d / 1.6);
        }
      }

      // Beads for segments 1..n-1 (the head mesh covers segment 0), then one
      // in-between bead for every pair of neighbours. They stand a little
      // into the floor, so the bobbing never lifts one off it.
      const tall = BEAD_TOP / DOME_TOP;
      for (let i = 1; i < n; i++) {
        const s = ps[i];
        const bob = this.alive ? Math.sin(wiggle * 10 - i * 0.9) * 0.025 : 0;
        dummy.position.set(px[i], bob - 0.03, pz[i]);
        dummy.scale.set(s, s * tall, s);
        dummy.updateMatrix();
        beadMesh.setMatrixAt(i - 1, dummy.matrix);
      }
      for (let i = 0; i < n - 1; i++) {
        const s = (ps[i] + ps[i + 1]) * 0.5 * (i === 0 ? 0.95 : 0.9);
        dummy.position.set((px[i] + px[i + 1]) * 0.5, -0.03, (pz[i] + pz[i + 1]) * 0.5);
        dummy.scale.set(s, s * tall * 0.97, s);
        dummy.updateMatrix();
        linkMesh.setMatrixAt(i, dummy.matrix);
      }
      beadMesh.count = n - 1;
      linkMesh.count = n - 1;
      beadMesh.instanceMatrix.needsUpdate = true;
      linkMesh.instanceMatrix.needsUpdate = true;

      this.colorize(dt);
      this.drawHead(t, dt);
    },

    // Instance colors: a gradient from head to tail, redone only when the
    // length changes or while the body is flashing.
    colorize(dt) {
      const n = this.len;
      let mode = 0; // 0 normal, 1 white, 2 red, 3 dead
      if (!this.alive) {
        flash = Math.max(0, flash - dt);
        mode = flash > 0 ? (Math.floor(flash / 0.08) % 2 === 0 ? 1 : 2) : 3;
      }
      const key = n * 4 + mode;
      if (key === colorsFor) return;
      colorsFor = key;

      for (let pass = 0; pass < 2; pass++) {
        const mesh = pass === 0 ? beadMesh : linkMesh;
        const first = pass === 0 ? 1 : 0;
        const last = pass === 0 ? n : n - 1;
        for (let i = first; i < last; i++) {
          const f = (i + pass * 0.5) / Math.max(1, n - 1);
          if (mode === 1) color.copy(FLASH_WHITE);
          else if (mode === 2) color.copy(FLASH_RED);
          else {
            color.copy(HEAD_COLOR).lerp(TAIL_COLOR, f);
            if (pass === 1) color.multiplyScalar(0.9); // in-between beads a touch darker
            if (mode === 3) color.lerp(DEAD_TINT, 0.55);
          }
          mesh.setColorAt(i - first, color);
        }
        mesh.instanceColor.needsUpdate = true;
      }

      if (mode === 1) {
        headMaterial.color.setRGB(1, 1, 1);
        headMaterial.emissive.setRGB(0.7, 0.7, 0.7);
      } else if (mode === 2) {
        headMaterial.color.setRGB(1, 0.35, 0.35);
        headMaterial.emissive.setRGB(0.25, 0, 0);
      } else if (mode === 3) {
        headMaterial.color.setRGB(0.72, 0.78, 0.76);
        headMaterial.emissive.setRGB(0, 0, 0);
      }
    },

    drawHead(t, dt) {
      let hx = px[0];
      let hz = pz[0];
      const fx = this.len > 1 ? bx[1] : this.tailX;
      const fz = this.len > 1 ? bz[1] : this.tailZ;

      // Face the way the head is moving; turn smoothly rather than snapping.
      let dx = bx[0] - fx;
      let dz = bz[0] - fz;
      if (!this.alive || (dx === 0 && dz === 0)) {
        dx = DIR_X[this.dir];
        dz = DIR_Z[this.dir];
      }
      const target = Math.atan2(dx, dz);
      yaw += wrapAngle(target - yaw) * Math.min(1, dt * 22);

      let roll = 0;
      if (!this.alive) {
        // Bump into whatever was hit, then lie a little tilted.
        deadTime += dt;
        const k = Math.min(1, deadTime / 0.22);
        const bump = Math.sin(k * Math.PI) * 0.32;
        hx += DIR_X[this.dir] * bump;
        hz += DIR_Z[this.dir] * bump;
        roll = 0.35 * k;
      }

      gulp = Math.max(0, gulp - dt * 4);
      const s = 1 + Math.sin(gulp * Math.PI) * 0.22;
      head.position.set(hx, 0, hz);
      head.rotation.set(0, yaw, roll);
      head.scale.set(s, s, s);

      // A quick tongue flick every couple of seconds.
      tongueClock += dt;
      if (tongueClock > 1.8) tongueClock = 0;
      const flick = tongueClock < 0.3 ? Math.sin((tongueClock / 0.3) * Math.PI) : 0;
      tongue.scale.set(1, 1, Math.max(0.001, flick));

      headShadow.position.x = hx;
      headShadow.position.z = hz;
    },
  };

  snake.reset();
  return snake;
}
