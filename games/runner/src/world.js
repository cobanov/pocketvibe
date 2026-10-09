// Scenery: the scrolling road, the grass, the trees on both sides and the
// banner across the road at the best distance.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESPAWN_Z, LANE_W, SPAWN_Z, TRACK_LEN, box, paint } from './shared.js';

const TILE = 4; // world units per texture repeat along the road
const TREES_PER_SIDE = 16;
const TREE_COUNT = TREES_PER_SIDE * 2;

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function roadTexture() {
  return canvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#4b4b55';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#e9e2cf';
    ctx.fillRect(0, 0, 3, s);
    ctx.fillRect(s - 3, 0, 3, s);
    // Dashed lane dividers.
    ctx.fillRect(Math.round(s / 3) - 1, 0, 2, s / 2);
    ctx.fillRect(Math.round((2 * s) / 3) - 1, 0, 2, s / 2);
  });
}

function grassTexture() {
  return canvasTexture(2, (ctx) => {
    ctx.fillStyle = '#62a64c';
    ctx.fillRect(0, 0, 2, 1);
    ctx.fillStyle = '#589945';
    ctx.fillRect(0, 1, 2, 1);
  });
}

// The banner's cloth: BEST between two checkered ends, drawn once.
function bannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffd23f';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#1a2340';
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      if ((i + j) % 2) continue;
      ctx.fillRect(i * 8, j * 8, 8, 8);
      ctx.fillRect(208 + i * 8, j * 8, 8, 8);
    }
  }
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BEST', 128, 17);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.15, 0.2, 1, 5);
  trunk.translate(0, 0.5, 0);
  const leaves = new THREE.ConeGeometry(0.9, 2.2, 6);
  leaves.translate(0, 2.0, 0);
  return mergeGeometries([paint(trunk, 0x7a5232), paint(leaves, 0x2f7d3a)]);
}

export function createWorld(scene, material) {
  const roadWidth = LANE_W * 3 + 0.4;

  const roadMap = roadTexture();
  roadMap.repeat.set(1, TRACK_LEN / TILE);
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, TRACK_LEN),
    new THREE.MeshLambertMaterial({ map: roadMap }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, DESPAWN_Z - TRACK_LEN / 2);
  scene.add(road);

  const grassMap = grassTexture();
  grassMap.repeat.set(1, TRACK_LEN / TILE);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(100, TRACK_LEN),
    new THREE.MeshLambertMaterial({ map: grassMap }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.02, DESPAWN_Z - TRACK_LEN / 2);
  scene.add(grass);

  // All trees are one InstancedMesh; trunk and leaves are merged with vertex colors.
  const trees = new THREE.InstancedMesh(treeGeometry(), material, TREE_COUNT);
  trees.frustumCulled = false; // instances move, so the cached bounds would be wrong
  scene.add(trees);

  const treeX = new Float32Array(TREE_COUNT);
  const treeZ = new Float32Array(TREE_COUNT);
  const treeScale = new Float32Array(TREE_COUNT);
  const spacing = TRACK_LEN / TREES_PER_SIDE;

  function placeTree(i) {
    const side = i % 2 === 0 ? -1 : 1;
    treeX[i] = side * (LANE_W * 1.5 + 1.8 + Math.random() * 6);
    treeScale[i] = 0.8 + Math.random() * 0.6;
  }

  for (let i = 0; i < TREE_COUNT; i++) {
    placeTree(i);
    treeZ[i] = DESPAWN_Z - (i >> 1) * spacing - Math.random() * spacing;
  }

  // The best distance: a banner on two posts and a line across the road.
  const banner = new THREE.Group();
  const postX = roadWidth / 2 + 0.25;
  banner.add(
    new THREE.Mesh(
      mergeGeometries([
        box(0.2, 5.1, 0.2, -postX, 2.55, 0, 0xf4f4f4),
        box(0.2, 5.1, 0.2, postX, 2.55, 0, 0xf4f4f4),
        box(roadWidth, 0.04, 0.4, 0, 0.02, 0, 0xffd23f),
      ]),
      material,
    ),
  );
  const bannerMap = bannerTexture();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(postX * 2, postX * 0.25), new THREE.MeshBasicMaterial({ map: bannerMap }));
  cloth.position.y = 4.7;
  banner.add(cloth);
  banner.visible = false;
  scene.add(banner);

  const dummy = new THREE.Object3D();
  let scrolled = 0;

  return {
    textures: [roadMap, grassMap, bannerMap],

    // Puts the best-distance banner at z (null: no banner).
    setBest(z) {
      banner.visible = z !== null && z > SPAWN_Z && z < DESPAWN_Z;
      if (banner.visible) banner.position.z = z;
    },

    // Moves the scenery towards the camera by `move` world units.
    update(move) {
      scrolled = (scrolled + move / TILE) % 1;
      roadMap.offset.y = scrolled;
      grassMap.offset.y = scrolled;

      for (let i = 0; i < TREE_COUNT; i++) {
        treeZ[i] += move;
        if (treeZ[i] > DESPAWN_Z) {
          treeZ[i] -= TRACK_LEN;
          placeTree(i);
        }
        dummy.position.set(treeX[i], 0, treeZ[i]);
        dummy.rotation.y = i;
        dummy.scale.setScalar(treeScale[i]);
        dummy.updateMatrix();
        trees.setMatrixAt(i, dummy.matrix);
      }
      trees.instanceMatrix.needsUpdate = true;
    },
  };
}
