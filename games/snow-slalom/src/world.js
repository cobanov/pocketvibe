// The mountain: snow chunks recycled as the skier goes down, the forested
// banks on both sides of the piste, piste markers and the far mountains.
// Chunks rewrite their own vertices when they move to the front, so the
// terrain never repeats and nothing is allocated while playing.

import * as THREE from 'three';
import { PISTE, SLOPE, canvasTexture, rand, slopeY, smoothstep } from './shared.js';
import { backdropGeometry, markerGeometry, pineGeometry } from './models.js';

export const CHUNK = 30; // length of a terrain chunk
const CHUNKS = 5;
const BEHIND = 18; // a chunk moves to the front once it is this far behind the skier
const ROWS = 10; // vertex rows per chunk
const TREE_ROWS = 12; // rows of forest per chunk and side
const TREES_PER_CHUNK = TREE_ROWS * 2 * 3;
const MARKERS_PER_CHUNK = 4;
const BACKDROP_DIST = 170;

// Vertex columns: fine on the piste (for the groomed stripes), coarse on the hills.
const XS = [];
for (let x = -76; x < -24; x += 4) XS.push(x);
for (let x = -24; x < -16; x += 2) XS.push(x);
for (let x = -16; x < 16; x += 1) XS.push(x);
for (let x = 16; x < 24; x += 2) XS.push(x);
for (let x = 24; x <= 76; x += 4) XS.push(x);
const COLS = XS.length;

// Height of the snow above the slope plane: flat on the piste, banks rising
// on both sides and rolling hills further out.
export function bankHeight(x, z) {
  const ax = Math.abs(x);
  if (ax < PISTE + 0.5) return 0;
  const n = Math.sin(x * 0.21 + z * 0.13) * 0.5 + Math.sin(x * 0.09 - z * 0.27 + 1.7) * 0.5;
  return smoothstep(PISTE + 0.5, PISTE + 7, ax) * (1.5 + 0.6 * n) + smoothstep(PISTE + 5, 70, ax) * (10 + 4 * n);
}

// Fine snow grain and faint wind ripples across the fall line: they are what
// makes speed readable on a white slope.
function snowTexture() {
  return canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    let seed = 3;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    ctx.strokeStyle = 'rgba(150, 178, 214, 0.1)';
    ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const y0 = 10 + k * 32 + rnd() * 8;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 4) {
        const y = y0 + Math.sin((x / size) * Math.PI * 2 * (k % 2 ? 2 : 1) + k) * 3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 420; i++) {
      const v = rnd();
      ctx.fillStyle = v < 0.7 ? 'rgba(140, 170, 210, 0.16)' : 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), 1 + Math.floor(rnd() * 2), 1);
    }
  });
}

const PISTE_A = new THREE.Color(0xf2f6fb);
const PISTE_B = new THREE.Color(0xe2ebf6);
const BANK_LOW = new THREE.Color(0xe4edf7);
const BANK_HIGH = new THREE.Color(0xfbfdff);

export function createWorld(scene) {
  const texture = snowTexture();
  const snow = new THREE.MeshLambertMaterial({ vertexColors: true, map: texture });

  // Ground chunks: one geometry each, rewritten when the chunk is recycled.
  const verts = COLS * (ROWS + 1);
  const index = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS - 1; c++) {
      const a = r * COLS + c;
      const b = a + COLS;
      index.push(a, a + 1, b, b, a + 1, b + 1); // counter-clockwise seen from above
    }
  }
  const chunks = [];
  for (let i = 0; i < CHUNKS; i++) {
    const g = new THREE.BufferGeometry();
    g.setIndex(index);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(verts * 2), 2));
    const mesh = new THREE.Mesh(g, snow);
    scene.add(mesh);
    chunks.push({ n: -1, mesh });
  }

  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  const pineGeo = pineGeometry();
  const forest = new THREE.InstancedMesh(pineGeo, lambert, CHUNKS * TREES_PER_CHUNK);
  forest.frustumCulled = false; // instances move with the chunks
  scene.add(forest);
  const markers = new THREE.InstancedMesh(markerGeometry(), lambert, CHUNKS * MARKERS_PER_CHUNK);
  markers.frustumCulled = false;
  scene.add(markers);

  const backdrop = new THREE.Mesh(
    backdropGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false }),
  );
  backdrop.renderOrder = -1; // drawn first, everything else covers it
  backdrop.frustumCulled = false;
  scene.add(backdrop);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const trees = new Float32Array(CHUNKS * TREES_PER_CHUNK * 6); // x, y, z, sx, sy, sz
  const treeCount = new Int32Array(CHUNKS);
  let forestDirty = false;

  function writeForest() {
    let n = 0;
    for (let slot = 0; slot < CHUNKS; slot++) {
      for (let t = 0; t < treeCount[slot]; t++) {
        const i = (slot * TREES_PER_CHUNK + t) * 6;
        dummy.position.set(trees[i], trees[i + 1], trees[i + 2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(trees[i + 3], trees[i + 4], trees[i + 5]);
        dummy.updateMatrix();
        forest.setMatrixAt(n++, dummy.matrix);
      }
    }
    forest.count = n;
    forest.instanceMatrix.needsUpdate = true;
    forestDirty = false;
  }

  // Chunk n covers z from -n * CHUNK down to -(n + 1) * CHUNK.
  function build(slot, n) {
    const chunk = chunks[slot];
    chunk.n = n;
    const g = chunk.mesh.geometry;
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    const col = g.attributes.color.array;
    const uv = g.attributes.uv.array;
    const z0 = -n * CHUNK;
    const e = 0.5;
    for (let r = 0; r <= ROWS; r++) {
      const z = z0 - (r * CHUNK) / ROWS;
      for (let c = 0; c < COLS; c++) {
        const x = XS[c];
        const i = r * COLS + c;
        const h = bankHeight(x, z);
        pos[i * 3] = x;
        pos[i * 3 + 1] = slopeY(z) + h;
        pos[i * 3 + 2] = z;
        // Normal from the height gradient (the slope itself adds to d/dz).
        const hx = (bankHeight(x + e, z) - bankHeight(x - e, z)) / (2 * e);
        const hz = SLOPE + (bankHeight(x, z + e) - bankHeight(x, z - e)) / (2 * e);
        const len = Math.sqrt(hx * hx + 1 + hz * hz);
        nor[i * 3] = -hx / len;
        nor[i * 3 + 1] = 1 / len;
        nor[i * 3 + 2] = -hz / len;
        if (Math.abs(x) < PISTE + 0.5) color.copy(c & 1 ? PISTE_A : PISTE_B);
        else color.lerpColors(BANK_LOW, BANK_HIGH, Math.min(1, h / 3));
        col[i * 3] = color.r;
        col[i * 3 + 1] = color.g;
        col[i * 3 + 2] = color.b;
        uv[i * 2] = x / 4;
        uv[i * 2 + 1] = (r * CHUNK) / ROWS / 5;
      }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
    g.computeBoundingSphere();

    // Forest on the banks: dense near the piste, thinning out up the hills.
    // Each chunk keeps its own list; writeForest packs them all together.
    const base = slot * TREES_PER_CHUNK;
    let t = 0;
    for (let row = 0; row < TREE_ROWS; row++) {
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < 3; k++) {
          const chance = k === 0 ? 0.9 : k === 1 ? 0.65 : 0.4;
          if (Math.random() > chance) continue;
          const ax = k === 0 ? rand(1.6, 3.6) : k === 1 ? rand(4, 9) : rand(9, 24);
          const x = side * (PISTE + ax);
          const z = z0 - (row + rand(0.1, 0.9)) * (CHUNK / TREE_ROWS);
          const s = rand(0.85, 1.5);
          const i = (base + t) * 6;
          trees[i] = x;
          trees[i + 1] = slopeY(z) + bankHeight(x, z) - 0.05;
          trees[i + 2] = z;
          trees[i + 3] = s * rand(0.9, 1.1);
          trees[i + 4] = s * rand(0.9, 1.25);
          trees[i + 5] = s * rand(0.9, 1.1);
          t++;
        }
      }
    }
    treeCount[slot] = t;
    forestDirty = true;

    let m = slot * MARKERS_PER_CHUNK;
    for (let k = 0; k < 2; k++) {
      for (let side = -1; side <= 1; side += 2) {
        const z = z0 - CHUNK * (0.25 + k * 0.5);
        dummy.position.set(side * (PISTE + 0.9), slopeY(z), z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        markers.setMatrixAt(m++, dummy.matrix);
      }
    }
    markers.instanceMatrix.needsUpdate = true;
  }

  return {
    // Lays out fresh chunks around z (where the skier starts).
    reset(z) {
      const first = Math.floor((-z - BEHIND) / CHUNK);
      for (let k = 0; k < CHUNKS; k++) {
        const n = first + k;
        build(((n % CHUNKS) + CHUNKS) % CHUNKS, n);
      }
      writeForest();
    },

    // Moves chunks that fell behind the skier to the front.
    update(z) {
      const first = Math.floor((-z - BEHIND) / CHUNK);
      for (let k = 0; k < CHUNKS; k++) {
        const n = first + k;
        const slot = ((n % CHUNKS) + CHUNKS) % CHUNKS;
        if (chunks[slot].n !== n) build(slot, n);
      }
      if (forestDirty) writeForest();
    },

    // The backdrop travels with the camera, a little below its eye line.
    placeBackdrop(camera) {
      backdrop.position.set(camera.position.x * 0.9, camera.position.y - 30, camera.position.z - BACKDROP_DIST);
    },
  };
}
