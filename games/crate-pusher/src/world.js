// The warehouse: the level's board (a plinth with floor tiles and wall
// blocks) and the props around it, merged into one mesh that is rebuilt
// whenever a level loads; the concrete floor of the hall; and the spots,
// one InstancedMesh that pulses while a spot is still empty.

import * as THREE from 'three';
import { PLINTH_H, WALL_H, box, paint, rand, reseed } from './shared.js';
import { barrelGeometry, coneGeometry, merge, palletGeometry, rackGeometry, spotGeometry } from './models.js';

const MAX_SPOTS = 8;
const TILE_A = 0xf6e7c8;
const TILE_B = 0xecd7b0;
const TILE_SIDE = 0xc9b28a;
const GROUT = 0x9a876c;
const PLINTH = 0x3b4775;
const PLINTH_BAND = 0x2c365c;
const WALL = 0x2f9f97;
const WALL_ALT = 0x2a9189;
const WALL_RIM = 0x4bbcb0;
const WALL_TOP = 0x7fe3d4;
const GROUND = 0x404b70;
const SEAM = 0x37415f;
const LINE = 0xf2c230;

const BARRELS = [
  [0x3f7fd9, 0x6a9be6],
  [0xe5534b, 0xef7b72],
  [0xf5c242, 0xf9d878],
];

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3(1, 1, 1);
const yAxis = new THREE.Vector3(0, 1, 0);

function place(geometry, x, y, z, rotY) {
  tmpQuat.setFromAxisAngle(yAxis, rotY);
  tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale);
  geometry.applyMatrix4(tmpMatrix);
  return geometry;
}

// The hall floor: one big plane with slab seams, built once.
function groundGeometry() {
  const parts = [];
  const plane = new THREE.PlaneGeometry(90, 90);
  plane.rotateX(-Math.PI / 2);
  parts.push(paint(plane, GROUND));
  for (let i = -15; i <= 15; i++) {
    parts.push(box(90, 0.01, 0.06, 0, 0.005, i * 3 + 0.5, SEAM));
    parts.push(box(0.06, 0.01, 90, i * 3 + 0.5, 0.005, 0, SEAM));
  }
  return merge(parts);
}

export function createWorld(scene) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });

  const ground = new THREE.Mesh(groundGeometry(), material);
  ground.position.y = -PLINTH_H;
  scene.add(ground);

  let board = null;

  const spots = new THREE.InstancedMesh(spotGeometry(), new THREE.MeshBasicMaterial({ color: 0xff5c8a }), MAX_SPOTS);
  spots.frustumCulled = false; // the bounds change with every level
  spots.count = 0;
  scene.add(spots);
  const spotX = new Float32Array(MAX_SPOTS);
  const spotZ = new Float32Array(MAX_SPOTS);
  const spotCell = new Int32Array(MAX_SPOTS);
  const dummy = new THREE.Object3D();

  // Builds the board and the props for a freshly loaded puzzle.
  function build(p) {
    if (board) {
      scene.remove(board);
      board.geometry.dispose();
    }
    const { W, H } = p;
    const size = W * H;
    // Walls are drawn only where they touch the floor (corners included).
    const solid = new Uint8Array(size);
    for (let c = 0; c < size; c++) {
      if (p.floor[c]) {
        solid[c] = 1;
        continue;
      }
      if (!p.wall[c]) continue;
      const x = c % W;
      const y = (c - x) / W;
      for (let dy = -1; dy <= 1 && !solid[c]; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && p.floor[ny * W + nx]) solid[c] = 2;
        }
      }
    }

    const parts = [];
    for (let c = 0; c < size; c++) {
      if (!solid[c]) continue;
      const x = p.x(c);
      const z = p.z(c);
      const gx = c % W;
      const gy = (c - gx) / W;
      // The plinth under the board; its top shows between the tiles as grout.
      parts.push(box(1, PLINTH_H - 0.16, 1, x, -0.02 - (PLINTH_H - 0.16) / 2, z, PLINTH, GROUT));
      parts.push(box(1, 0.14, 1, x, -PLINTH_H + 0.07, z, PLINTH_BAND));
      if (solid[c] === 1) {
        const top = (gx + gy) % 2 ? TILE_A : TILE_B;
        parts.push(box(0.94, 0.05, 0.94, x, -0.025, z, TILE_SIDE, top));
      } else {
        const side = (gx + gy) % 2 ? WALL : WALL_ALT;
        parts.push(box(1, WALL_H, 1, x, WALL_H / 2, z, side, WALL_RIM));
        parts.push(box(0.8, 0.06, 0.8, x, WALL_H + 0.03, z, WALL_RIM, WALL_TOP));
      }
    }

    // Props on the hall floor around the board, the same every time.
    reseed(p.index + 1);
    const gy0 = -PLINTH_H;
    const near = (gx, gy, r) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && solid[ny * W + nx]) return true;
        }
      }
      return false;
    };
    const ox = (W - 1) / 2;
    const oz = (H - 1) / 2;
    for (let gy = -4; gy < H + 4; gy++) {
      for (let gx = -6; gx < W + 6; gx++) {
        if (near(gx, gy, 1)) continue;
        const front = gy >= H; // between the board and the camera: low props only
        if (rand() > (front ? 0.1 : 0.22)) continue;
        const x = gx - ox + (rand() - 0.5) * 0.3;
        const z = gy - oz + (rand() - 0.5) * 0.3;
        const r = rand();
        const rot = (rand() - 0.5) * 0.6;
        if (front || r < 0.25) {
          parts.push(place(coneGeometry(), x, gy0, z, rot));
        } else if (r < 0.55) {
          const [hex, top] = BARRELS[Math.floor(rand() * BARRELS.length)];
          parts.push(place(barrelGeometry(hex, top), x, gy0, z, rot));
          if (rand() < 0.5) parts.push(place(barrelGeometry(hex, top), x + 0.62, gy0, z + 0.1, rot));
        } else {
          parts.push(place(palletGeometry(Math.floor(rand() * 3)), x, gy0, z, rot * 0.3));
        }
      }
    }
    // Racks along the back wall of the hall.
    const backZ = -oz - 3.6;
    for (let x = -ox - 7; x <= ox + 7; x += 2.4) parts.push(place(rackGeometry(rand), x, gy0, backZ, 0));
    // A yellow safety line around the board.
    const lw = W + 1.6;
    const lh = H + 1.6;
    parts.push(box(lw, 0.012, 0.1, 0, gy0 + 0.006, -lh / 2, LINE));
    parts.push(box(lw, 0.012, 0.1, 0, gy0 + 0.006, lh / 2, LINE));
    parts.push(box(0.1, 0.012, lh, -lw / 2, gy0 + 0.006, 0, LINE));
    parts.push(box(0.1, 0.012, lh, lw / 2, gy0 + 0.006, 0, LINE));

    board = new THREE.Mesh(merge(parts), material);
    scene.add(board);

    spots.count = Math.min(MAX_SPOTS, p.goals.length);
    for (let i = 0; i < spots.count; i++) {
      spotCell[i] = p.goals[i];
      spotX[i] = p.x(p.goals[i]);
      spotZ[i] = p.z(p.goals[i]);
    }
  }

  return {
    build,

    // Empty spots breathe; covered ones sit still under their crate.
    update(p, time) {
      for (let i = 0; i < spots.count; i++) {
        const covered = p.crateAt[spotCell[i]] >= 0;
        const s = covered ? 1 : 1 + Math.sin(time * 4 + i) * 0.07;
        dummy.position.set(spotX[i], 0.005, spotZ[i]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(s, 1, s);
        dummy.updateMatrix();
        spots.setMatrixAt(i, dummy.matrix);
      }
      spots.instanceMatrix.needsUpdate = true;
    },
  };
}
