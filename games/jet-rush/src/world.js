// Scenery: the lab corridor. Floor, ceiling and back wall are big planes with
// canvas textures whose offsets scroll; the far lab behind the windows sits
// deeper, so perspective scrolls it slower (parallax). Pillars and lab props
// are InstancedMeshes whose slots wrap around.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAM_X, CEIL_Y, box, canvasTexture, cyl } from './shared.js';

const WALL_Z = -3.5;
const FAR_Z = -11;
const FRONT_Z = 4.5; // floor and ceiling run from the wall to here
const SPAN_W = 40; // width of the scrolling planes, centred on the camera

const WALL_TILE = 8; // world units per texture repeat
const FAR_TILE = 16;
const FLOOR_TILE = 4;

const PILLAR_GAP = WALL_TILE; // pillars stand on the wall panel seams
const PILLARS = 4;
const PROP_GAP = 6.5;
const PROPS = 7;
const WRAP_LEFT = CAM_X - 18;

function repeating(texture, repeatX) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, 1);
  return texture;
}

function stripes(ctx, x, y, w, h, a, b) {
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  for (let sx = x - h; sx < x + w; sx += h * 2) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h, y);
    ctx.lineTo(sx + h * 2, y);
    ctx.lineTo(sx + h, y + h);
    ctx.fill();
  }
}

// Back wall: blue panels, pipes, a hazard stripe and a window (transparent).
function wallTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#86a3cc';
    ctx.fillRect(0, 0, 256, 256);
    // Panel seams.
    ctx.fillStyle = '#5f7aa3';
    ctx.fillRect(0, 0, 4, 256);
    ctx.fillRect(126, 0, 4, 256);
    ctx.fillStyle = '#a7bede';
    ctx.fillRect(4, 0, 2, 256);
    ctx.fillRect(130, 0, 2, 256);
    // Pipes under the ceiling.
    ctx.fillStyle = '#d9e1ec';
    ctx.fillRect(0, 8, 256, 14);
    ctx.fillStyle = '#9fb0c6';
    ctx.fillRect(0, 18, 256, 4);
    ctx.fillStyle = '#e25b4b';
    ctx.fillRect(0, 28, 256, 7);
    ctx.fillStyle = '#5f6f88';
    for (let x = 20; x < 256; x += 64) ctx.fillRect(x, 6, 6, 32);
    // Window frame, then the hole.
    ctx.fillStyle = '#33456b';
    ctx.fillRect(28, 56, 200, 104);
    ctx.fillStyle = '#4c6391';
    ctx.fillRect(34, 62, 188, 92);
    ctx.clearRect(40, 68, 84, 80);
    ctx.clearRect(132, 68, 84, 80);
    // Hazard stripe and the darker lower panels.
    stripes(ctx, 0, 182, 256, 12, '#f2c230', '#2a2d38');
    ctx.fillStyle = '#58739f';
    ctx.fillRect(0, 194, 256, 62);
    ctx.fillStyle = '#41587f';
    for (let x = 18; x < 256; x += 128) {
      for (let k = 0; k < 4; k++) ctx.fillRect(x, 208 + k * 10, 46, 5); // vents
    }
    ctx.fillStyle = '#6fffa8';
    ctx.fillRect(84, 210, 8, 8);
    ctx.fillStyle = '#ff6464';
    ctx.fillRect(98, 210, 8, 8);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(212, 210, 8, 8);
  });
}

// The far lab seen through the windows: tanks of green goo and catwalks.
function farTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#1d2a4c';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#26365e';
    ctx.fillRect(0, 150, 256, 106);
    for (let i = 0; i < 2; i++) {
      const x = 18 + i * 128;
      ctx.fillStyle = '#3a5890';
      ctx.fillRect(x - 4, 40, 64, 170);
      ctx.fillStyle = '#2a4372';
      ctx.fillRect(x, 48, 56, 154);
      ctx.fillStyle = '#35d49b';
      ctx.fillRect(x, 110, 56, 92);
      ctx.fillStyle = '#7bf2c6';
      ctx.fillRect(x + 10, 130, 6, 6);
      ctx.fillRect(x + 30, 160, 8, 8);
      ctx.fillRect(x + 20, 95, 5, 5);
    }
    // A machine with screens between the tanks.
    ctx.fillStyle = '#2f4675';
    ctx.fillRect(92, 90, 44, 120);
    ctx.fillStyle = '#62e6ff';
    ctx.fillRect(98, 100, 32, 18);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(100, 130, 8, 8);
    ctx.fillRect(116, 130, 8, 8);
    // Catwalk.
    ctx.fillStyle = '#4a64a0';
    ctx.fillRect(0, 140, 256, 8);
    for (let x = 0; x < 256; x += 16) ctx.fillRect(x, 118, 3, 22);
    ctx.fillRect(0, 118, 256, 3);
  });
}

// Floor seen from above: metal tiles, a dark skirting at the wall and a
// yellow guide line in front of the hero. Canvas top is the wall side.
function floorTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#bcc7d6';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#98a6bb';
    for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 0, 2, 128);
    for (let y = 12; y < 128; y += 22) ctx.fillRect(0, y, 128, 2);
    ctx.fillStyle = '#dbe2eb';
    for (let x = 2; x < 128; x += 32) ctx.fillRect(x, 0, 1, 128);
    ctx.fillStyle = '#5d6a84';
    ctx.fillRect(0, 0, 128, 10);
    ctx.fillStyle = '#f2c230';
    ctx.fillRect(0, 84, 128, 5);
  });
}

// Ceiling seen from below: dark panels with glowing light strips.
function ceilingTexture() {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#4f5d82';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#414d6e';
    for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 0, 2, 128);
    ctx.fillStyle = '#c9c49e';
    ctx.fillRect(44, 20, 40, 92);
    ctx.fillStyle = '#fff6d2';
    ctx.fillRect(48, 24, 32, 84);
    ctx.fillStyle = '#323c58';
    ctx.fillRect(0, 118, 128, 10);
  });
}

// "BEST" sign with a dashed line down to the floor, shown at the best distance.
function bestTexture() {
  return canvasTexture(64, 256, (ctx) => {
    ctx.fillStyle = '#ffd23f';
    for (let y = 40; y < 256; y += 16) ctx.fillRect(29, y, 6, 9);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(2, 4, 60, 30);
    ctx.fillStyle = '#2a2d38';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BEST', 32, 20);
  });
}

function pillarGeometry() {
  return mergeGeometries([
    box(0.7, CEIL_Y, 0.5, 0, CEIL_Y / 2, 0, 0x5b6f95),
    box(0.46, CEIL_Y - 1.2, 0.06, 0, CEIL_Y / 2, 0.27, 0x7189b4),
    box(0.84, 0.5, 0.62, 0, 0.25, 0, 0xf2c230),
    box(0.86, 0.12, 0.64, 0, 0.36, 0, 0x2a2d38),
    box(0.9, 0.4, 0.62, 0, CEIL_Y - 0.2, 0, 0x45557a),
    box(0.22, 0.22, 0.08, 0, 4.3, 0.31, 0x9dfcff),
  ]);
}

const CONSOLE = 0;
const TANK = 1;
const CRATES = 2;

function propGeometry(kind) {
  if (kind === CONSOLE) {
    return mergeGeometries([
      box(1.5, 0.85, 0.8, 0, 0.425, 0, 0x8796b8),
      box(1.56, 0.08, 0.86, 0, 0.88, 0, 0x5a6890),
      box(1.1, 0.7, 0.12, 0, 1.3, -0.2, 0x2c3a5e),
      box(0.92, 0.52, 0.04, 0, 1.3, -0.13, 0x5fe3ff),
      box(0.16, 0.1, 0.05, -0.45, 0.62, 0.41, 0xff5f5f),
      box(0.16, 0.1, 0.05, -0.2, 0.62, 0.41, 0x6fffa8),
      box(0.4, 0.1, 0.05, 0.3, 0.62, 0.41, 0xffd23f),
    ]);
  }
  if (kind === TANK) {
    return mergeGeometries([
      cyl(0.62, 0.3, 10, 'y', 0, 0.15, 0, 0x45557a),
      cyl(0.52, 1.25, 10, 'y', 0, 0.92, 0, 0x3fe0a2),
      cyl(0.52, 0.55, 10, 'y', 0, 1.82, 0, 0xbff0ff),
      cyl(0.6, 0.22, 10, 'y', 0, 2.2, 0, 0x45557a),
      box(0.1, 0.9, 0.1, 0, 2.75, 0, 0x6c7a99),
    ]);
  }
  return mergeGeometries([
    box(0.9, 0.9, 0.9, -0.5, 0.45, 0, 0xe09a3a),
    box(0.92, 0.14, 0.92, -0.5, 0.45, 0, 0xb5732a),
    box(0.75, 0.75, 0.75, 0.42, 0.375, 0.05, 0xf0b04a),
    box(0.7, 0.7, 0.7, -0.35, 1.25, 0, 0xe8a640),
    box(0.72, 0.12, 0.72, -0.35, 1.25, 0, 0xb5732a),
  ]);
}

export function createWorld(scene) {
  const plain = (map) => new THREE.MeshBasicMaterial({ map });

  const wallMap = repeating(wallTexture(), SPAN_W / WALL_TILE);
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(SPAN_W, CEIL_Y),
    new THREE.MeshBasicMaterial({ map: wallMap, alphaTest: 0.5 }),
  );
  wall.position.set(CAM_X, CEIL_Y / 2, WALL_Z);
  scene.add(wall);

  const farMap = repeating(farTexture(), SPAN_W / FAR_TILE);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(SPAN_W, 16), plain(farMap));
  far.position.set(CAM_X, 5, FAR_Z);
  scene.add(far);

  const depth = FRONT_Z - WALL_Z;
  const floorMap = repeating(floorTexture(), SPAN_W / FLOOR_TILE);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SPAN_W, depth), plain(floorMap));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CAM_X, 0, (WALL_Z + FRONT_Z) / 2);
  scene.add(floor);

  const ceilingMap = repeating(ceilingTexture(), SPAN_W / FLOOR_TILE);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(SPAN_W, depth), plain(ceilingMap));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(CAM_X, CEIL_Y, (WALL_Z + FRONT_Z) / 2);
  scene.add(ceiling);

  const best = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, CEIL_Y),
    new THREE.MeshBasicMaterial({ map: bestTexture(), alphaTest: 0.5 }),
  );
  best.position.set(0, CEIL_Y / 2, WALL_Z + 0.4);
  best.visible = false;
  scene.add(best);

  const lambert = new THREE.MeshLambertMaterial({ vertexColors: true });

  // Pillars: the wall texture's seams sit at WRAP_LEFT + k * WALL_TILE.
  const pillars = new THREE.InstancedMesh(pillarGeometry(), lambert, PILLARS);
  pillars.frustumCulled = false;
  scene.add(pillars);
  const pillarX = new Float32Array(PILLARS);

  const propMeshes = [CONSOLE, TANK, CRATES].map((kind) => {
    const mesh = new THREE.InstancedMesh(propGeometry(kind), lambert, PROPS);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  const propX = new Float32Array(PROPS); // slot position
  const propJitter = new Float32Array(PROPS);
  const propKind = new Int8Array(PROPS);
  const propCounts = new Int32Array(3);

  const dummy = new THREE.Object3D();
  let wallOffset = 0;

  function rollProp(i) {
    propKind[i] = Math.floor(Math.random() * 3);
    propJitter[i] = (Math.random() - 0.5) * 2;
  }

  function reset() {
    // The wall plane's left edge is at CAM_X - SPAN_W / 2; seams repeat from there.
    const seam0 = CAM_X - SPAN_W / 2;
    for (let i = 0; i < PILLARS; i++) {
      pillarX[i] = seam0 + Math.ceil((WRAP_LEFT - seam0) / PILLAR_GAP) * PILLAR_GAP + i * PILLAR_GAP;
    }
    for (let i = 0; i < PROPS; i++) {
      propX[i] = WRAP_LEFT + i * PROP_GAP;
      rollProp(i);
    }
    wallOffset = 0;
  }

  reset();

  return {
    // Moves the scenery left by `move` world units.
    update(move) {
      wallOffset += move;
      wallMap.offset.x = (wallOffset / WALL_TILE) % 1;
      farMap.offset.x = (wallOffset / FAR_TILE) % 1;
      floorMap.offset.x = (wallOffset / FLOOR_TILE) % 1;
      ceilingMap.offset.x = floorMap.offset.x;

      for (let i = 0; i < PILLARS; i++) {
        pillarX[i] -= move;
        if (pillarX[i] < WRAP_LEFT) pillarX[i] += PILLARS * PILLAR_GAP;
        dummy.position.set(pillarX[i], 0, WALL_Z + 0.3);
        dummy.updateMatrix();
        pillars.setMatrixAt(i, dummy.matrix);
      }
      pillars.instanceMatrix.needsUpdate = true;

      propCounts.fill(0);
      for (let i = 0; i < PROPS; i++) {
        propX[i] -= move;
        if (propX[i] < WRAP_LEFT) {
          propX[i] += PROPS * PROP_GAP;
          rollProp(i);
        }
        const kind = propKind[i];
        dummy.position.set(propX[i] + propJitter[i], 0, WALL_Z + 1.0);
        dummy.updateMatrix();
        propMeshes[kind].setMatrixAt(propCounts[kind]++, dummy.matrix);
      }
      for (let k = 0; k < 3; k++) {
        propMeshes[k].count = propCounts[k];
        propMeshes[k].instanceMatrix.needsUpdate = true;
      }
    },

    // x of the best-distance sign on screen, or null to hide it.
    setBest(x) {
      best.visible = x !== null && x > CAM_X - 16 && x < CAM_X + 16;
      if (best.visible) best.position.x = x;
    },
  };
}
