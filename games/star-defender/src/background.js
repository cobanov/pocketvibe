// Scenery: a drifting starfield deep below the playfield, a gas giant, the
// faint grid of the playfield and the neon rails that frame it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FIELD_HALF, GROUND_Z, SPACE, box, rand } from './shared.js';

const STAR_COUNT = 260;
const STAR_NEAR_Z = 18; // stars past this line wrap back to the far end
const STAR_SPAN = 84;
const DRIFT = 1.6; // star speed in units per second when not warping
const STAR_COLORS = [0xffffff, 0xffffff, 0xcfe3ff, 0xfff1c4, 0xffc4ef, 0xa8f0ff];

const GRID_FAR_Z = -24;
const GRID_NEAR_Z = GROUND_Z + 0.6;
const RAIL_X = FIELD_HALF + 1.0;
const CAMERA_Y = 23.5; // where main.js puts the camera, for the grid's line widths
const CAMERA_Z = 13.5;

// The playfield grid: purple lines every 1.6 units that fade out towards the
// far end. It used to be a transparent textured plane over most of the
// screen; drawn as opaque lines it looks the same and paints only the lines.
// Each line takes the color the old half-transparent line made over the
// background, fainter where it was thinner than a pixel.
function gridGeometry() {
  const line = new THREE.Color(0x9678ff).convertLinearToSRGB();
  const space = new THREE.Color(SPACE).convertLinearToSRGB();
  const c = new THREE.Color();
  const depth = GRID_NEAR_Z - GRID_FAR_Z;
  const positions = [];
  const colors = [];
  function vertex(x, z) {
    const fade = Math.min(1, ((z - GRID_FAR_Z) / depth) * 1.8);
    // The old lines were 0.05 wide, about 30 / d pixels at distance d, and
    // the texture's filtering blurred them more where the floor is seen at
    // a flat angle.
    const d = Math.hypot(x, CAMERA_Y, CAMERA_Z - z);
    const width = (30 / d) * (CAMERA_Y / d);
    const a = 0.5 * fade * Math.min(1, width);
    c.setRGB(space.r + (line.r - space.r) * a, space.g + (line.g - space.g) * a, space.b + (line.b - space.b) * a).convertSRGBToLinear();
    positions.push(x, 0, z);
    colors.push(c.r, c.g, c.b);
  }
  // Lengthwise lines, in pieces so the fade follows the distance.
  for (let x = -RAIL_X + 0.025; x < RAIL_X; x += 1.6) {
    for (let k = 0; k < 6; k++) {
      vertex(x, GRID_FAR_Z + (depth * k) / 6);
      vertex(x, GRID_FAR_Z + (depth * (k + 1)) / 6);
    }
  }
  // Crosswise lines.
  for (let z = GRID_NEAR_Z - 1.6 + 0.025; z > GRID_FAR_Z; z -= 1.6) {
    vertex(-RAIL_X, z);
    vertex(RAIL_X, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

// A low-poly gas giant with stripes: one flat color per triangle, picked by
// latitude, so the bands follow the facets.
function planetGeometry() {
  const bands = [0x5b3cc4, 0x8a56e0, 0xe0709a, 0xf4a46a, 0xffd08a, 0xe0709a, 0x7a4fd6];
  const g = new THREE.SphereGeometry(9, 20, bands.length * 2).toNonIndexed();
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    c.setHex(bands[Math.min(bands.length - 1, Math.floor(((9 - y) / 18) * bands.length))]);
    for (let k = 0; k < 3; k++) {
      colors[(i + k) * 3] = c.r;
      colors[(i + k) * 3 + 1] = c.g;
      colors[(i + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export function createBackground(scene) {
  // Stars: small quads turned towards the camera, all in one InstancedMesh.
  const starGeometry = new THREE.PlaneGeometry(1, 1);
  starGeometry.rotateX(-1.05);
  const stars = new THREE.InstancedMesh(starGeometry, new THREE.MeshBasicMaterial(), STAR_COUNT);
  stars.frustumCulled = false; // instances move, so the cached bounds would be wrong
  scene.add(stars);

  const sx = new Float32Array(STAR_COUNT);
  const sy = new Float32Array(STAR_COUNT);
  const sz = new Float32Array(STAR_COUNT);
  const size = new Float32Array(STAR_COUNT);
  const color = new THREE.Color();
  for (let i = 0; i < STAR_COUNT; i++) {
    sy[i] = rand(-38, -5);
    // Deeper stars spread wider, so the field fills the view at every depth.
    const spread = 18 - sy[i] * 0.75;
    sx[i] = rand(-spread, spread);
    sz[i] = STAR_NEAR_Z - Math.random() * STAR_SPAN;
    size[i] = rand(0.1, 0.22) * (1 - sy[i] * 0.035);
    stars.setColorAt(i, color.setHex(STAR_COLORS[i % STAR_COLORS.length]));
  }
  stars.instanceColor.needsUpdate = true;

  const planet = new THREE.Mesh(
    planetGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false }),
  );
  planet.position.set(-47, -44, -12);
  planet.rotation.x = -1.04; // the poles line up with the screen's up, so the bands run across
  planet.scale.setScalar(1.6);
  scene.add(planet);

  const grid = new THREE.LineSegments(gridGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  grid.position.y = -0.02;
  scene.add(grid);

  // Neon rails on both sides and the line the ship defends, merged into one
  // mesh. Their brightness pulses with every step of the formation.
  const railLen = GRID_NEAR_Z - GRID_FAR_Z;
  const railZ = (GRID_NEAR_Z + GRID_FAR_Z) / 2;
  const railMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  const rails = new THREE.Mesh(
    mergeGeometries([
      box(0.14, 0.1, railLen, -RAIL_X, 0, railZ, 0x39d5ff),
      box(0.14, 0.1, railLen, RAIL_X, 0, railZ, 0x39d5ff),
      box(RAIL_X * 2 + 0.14, 0.08, 0.12, 0, 0, GROUND_Z + 0.3, 0xff4fd8),
      box(0.4, 0.3, 0.4, -RAIL_X, 0.1, GROUND_Z + 0.3, 0xffffff),
      box(0.4, 0.3, 0.4, RAIL_X, 0.1, GROUND_Z + 0.3, 0xffffff),
    ]),
    railMaterial,
  );
  scene.add(rails);

  // Stars never rotate, so their matrices are written straight into the
  // instance buffer: scale on the diagonal, position in the last column.
  const m = stars.instanceMatrix.array;
  for (let i = 0; i < STAR_COUNT; i++) {
    m.fill(0, i * 16, i * 16 + 16);
    m[i * 16 + 15] = 1;
  }
  let pulse = 0;
  let spin = 0;

  return {
    // Brightens the rails for a moment (called on every formation step).
    pulse(amount) {
      pulse = Math.max(pulse, amount);
    },

    // warp is 0 normally and goes to 1 while the ship jumps to the next wave.
    update(dt, warp) {
      const speed = DRIFT + warp * 46;
      const stretch = 1 + warp * 9;
      for (let i = 0; i < STAR_COUNT; i++) {
        sz[i] += speed * dt;
        if (sz[i] > STAR_NEAR_Z) sz[i] -= STAR_SPAN;
        const o = i * 16;
        m[o] = size[i];
        m[o + 5] = size[i];
        m[o + 10] = size[i] * stretch;
        m[o + 12] = sx[i];
        m[o + 13] = sy[i];
        m[o + 14] = sz[i];
      }
      stars.instanceMatrix.needsUpdate = true;

      spin += dt * 0.05;
      planet.rotation.y = spin;

      pulse = Math.max(0, pulse - dt * 3);
      railMaterial.color.setScalar(0.55 + pulse * 0.6);
    },
  };
}
