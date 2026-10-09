// The warehouse: the level's board (a plinth with floor tiles and wall
// blocks) and the props around it, merged into one mesh that is rebuilt
// whenever a level loads; the concrete floor of the hall; and the spots,
// one InstancedMesh that pulses while a spot is still empty. Faces buried
// between blocks, faces turned away from the camera and props outside the
// view are left out, so a big level stays well inside the triangle budget.

import * as THREE from 'three';
import { NX, NZ, PLINTH_H, PX, PY, PZ, SIDES, WALL_H, boxFaces, paint, rand, reseed } from './shared.js';
import { barrelGeometry, coneGeometry, cullHidden, merge, palletGeometry, rackGeometry, spotGeometry } from './models.js';

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
    parts.push(boxFaces(90, 0.01, 0.06, 0, 0.005, i * 3 + 0.5, SEAM, undefined, PY));
    parts.push(boxFaces(0.06, 0.01, 90, i * 3 + 0.5, 0.005, 0, SEAM, undefined, PY));
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

  // Builds the board and the props for a freshly loaded puzzle, for the
  // camera positions and views the view module says it may be seen from.
  function build(p, view) {
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

    // The side faces of a cell whose neighbour is none of the kinds in the
    // mask (bit 1 << kind; kinds are 0 nothing, 1 floor, 2 wall).
    const kindAt = (gx, gy) => (gx >= 0 && gy >= 0 && gx < W && gy < H ? solid[gy * W + gx] : 0);
    const open = (gx, gy, kinds) =>
      (kinds & (1 << kindAt(gx + 1, gy)) ? 0 : PX) |
      (kinds & (1 << kindAt(gx - 1, gy)) ? 0 : NX) |
      (kinds & (1 << kindAt(gx, gy + 1)) ? 0 : PZ) |
      (kinds & (1 << kindAt(gx, gy - 1)) ? 0 : NZ);
    const SOLID = 6; // bits for kinds 1 and 2
    const WALLS = 4; // bit for kind 2

    const parts = [];
    for (let c = 0; c < size; c++) {
      if (!solid[c]) continue;
      const x = p.x(c);
      const z = p.z(c);
      const gx = c % W;
      const gy = (c - gx) / W;
      // The plinth under the board; its top shows between the tiles as grout.
      // Only its outer sides show.
      const outside = open(gx, gy, SOLID);
      const grout = solid[c] === 1 ? PY : 0;
      if (outside | grout) parts.push(boxFaces(1, PLINTH_H - 0.16, 1, x, -0.02 - (PLINTH_H - 0.16) / 2, z, PLINTH, GROUT, outside | grout));
      if (outside) parts.push(boxFaces(1, 0.14, 1, x, -PLINTH_H + 0.07, z, PLINTH_BAND, undefined, outside));
      if (solid[c] === 1) {
        const top = (gx + gy) % 2 ? TILE_A : TILE_B;
        parts.push(boxFaces(0.94, 0.05, 0.94, x, -0.025, z, TILE_SIDE, top, PY | SIDES));
      } else {
        const side = (gx + gy) % 2 ? WALL : WALL_ALT;
        parts.push(boxFaces(1, WALL_H, 1, x, WALL_H / 2, z, side, WALL_RIM, PY | open(gx, gy, WALLS)));
        parts.push(boxFaces(0.8, 0.06, 0.8, x, WALL_H + 0.03, z, WALL_RIM, WALL_TOP, PY | SIDES));
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
        // Every random number is drawn either way, so the scenery stays the
        // same whatever part of it is in view.
        if (front || r < 0.25) {
          if (view.sees(x, gy0 + 0.25, z, 0.9)) parts.push(place(coneGeometry(), x, gy0, z, rot));
        } else if (r < 0.55) {
          const [hex, top] = BARRELS[Math.floor(rand() * BARRELS.length)];
          const pair = rand() < 0.5;
          if (view.sees(x + 0.3, gy0 + 0.4, z, 1.4)) {
            parts.push(place(barrelGeometry(hex, top), x, gy0, z, rot));
            if (pair) parts.push(place(barrelGeometry(hex, top), x + 0.62, gy0, z + 0.1, rot));
          }
        } else {
          const load = Math.floor(rand() * 3);
          if (view.sees(x, gy0 + 0.5, z, 1.3)) parts.push(place(palletGeometry(load), x, gy0, z, rot * 0.3));
        }
      }
    }
    // Racks along the back wall of the hall.
    const backZ = -oz - 3.6;
    for (let x = -ox - 7; x <= ox + 7; x += 2.4) {
      const rack = rackGeometry(rand);
      if (view.sees(x, gy0 + 1.2, backZ, 2)) parts.push(place(rack, x, gy0, backZ, 0));
      else rack.dispose();
    }
    // A yellow safety line around the board.
    const lw = W + 1.6;
    const lh = H + 1.6;
    parts.push(boxFaces(lw, 0.012, 0.1, 0, gy0 + 0.006, -lh / 2, LINE, undefined, PY));
    parts.push(boxFaces(lw, 0.012, 0.1, 0, gy0 + 0.006, lh / 2, LINE, undefined, PY));
    parts.push(boxFaces(0.1, 0.012, lh, -lw / 2, gy0 + 0.006, 0, LINE, undefined, PY));
    parts.push(boxFaces(0.1, 0.012, lh, lw / 2, gy0 + 0.006, 0, LINE, undefined, PY));

    board = new THREE.Mesh(cullHidden(merge(parts), view.eyes), material);
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
