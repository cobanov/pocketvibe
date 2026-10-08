// Scenery: the scrolling road, the grass and the trees on both sides.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESPAWN_Z, LANE_W, TRACK_LEN, paint } from './shared.js';

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

function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.15, 0.2, 1, 5);
  trunk.translate(0, 0.5, 0);
  const leaves = new THREE.ConeGeometry(0.9, 2.2, 6);
  leaves.translate(0, 2.0, 0);
  return mergeGeometries([paint(trunk, 0x7a5232), paint(leaves, 0x2f7d3a)]);
}

export function createWorld(scene) {
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
  const trees = new THREE.InstancedMesh(
    treeGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true }),
    TREE_COUNT,
  );
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

  const dummy = new THREE.Object3D();
  let scrolled = 0;

  return {
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
