// Constants and small helpers shared by the game modules.

import * as THREE from 'three';

export const SKY = 0xd3e6f4; // haze at the horizon: clear color and fog

// The hill runs down towards -z and drops SLOPE units per unit downhill.
// Game logic works in slope coordinates (x across, z down the fall line,
// height above the snow); slopeY turns them into world heights.
export const SLOPE = 0.2;
export const SLOPE_ANGLE = Math.atan(SLOPE);

// The groomed piste runs from -PISTE to PISTE in x; forested banks rise
// beyond it.
export const PISTE = 15;

export function slopeY(z) {
  return z * SLOPE;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

export function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// A small seeded random generator (mulberry32): the same seed gives the
// same numbers every time, so a fixed course comes out the same every run.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

const tmpColor = new THREE.Color();
const tmpColor2 = new THREE.Color();

// Gives a geometry one flat vertex color, so differently colored parts can be
// merged into a single mesh that uses one material and one draw call.
export function paint(geometry, hex) {
  tmpColor.setHex(hex);
  const n = geometry.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Like paint, but faces pointing up get `topHex`: snow on rocks and boxes.
export function paintTop(geometry, topHex, sideHex, threshold = 0.5) {
  paint(geometry, sideHex);
  tmpColor.setHex(topHex);
  const normals = geometry.attributes.normal;
  const colors = geometry.attributes.color;
  for (let i = 0; i < normals.count; i++) {
    if (normals.getY(i) > threshold) colors.setXYZ(i, tmpColor.r, tmpColor.g, tmpColor.b);
  }
  return geometry;
}

// A vertical color gradient from y0 (lowHex) to y1 (highHex).
export function paintGradient(geometry, lowHex, highHex, y0, y1) {
  paint(geometry, lowHex);
  tmpColor.setHex(lowHex);
  tmpColor2.setHex(highHex);
  const pos = geometry.attributes.position;
  const colors = geometry.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    colors.setXYZ(
      i,
      tmpColor.r + (tmpColor2.r - tmpColor.r) * t,
      tmpColor.g + (tmpColor2.g - tmpColor.g) * t,
      tmpColor.b + (tmpColor2.b - tmpColor.b) * t,
    );
  }
  return geometry;
}

export function box(w, h, d, x, y, z, hex, topHex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return topHex === undefined ? paint(g, hex) : paintTop(g, topHex, hex);
}

// What the camera can see this frame: in its view and closer than `far`,
// where the fog has hidden everything. Instanced objects use it to draw
// only the instances that can be seen.
export function createView() {
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const view = {
    x: 0,
    z: 0,
    far: 100,

    update(camera, far) {
      camera.updateMatrixWorld();
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(matrix);
      view.x = camera.position.x;
      view.z = camera.position.z;
      view.far = far;
    },

    // True when a sphere of radius r around (x, y, z) can be seen.
    sees(x, y, z, r) {
      const dx = x - view.x;
      const dz = z - view.z;
      if (dx * dx + dz * dz > (view.far + r) * (view.far + r)) return false;
      sphere.center.set(x, y, z);
      sphere.radius = r;
      return frustum.intersectsSphere(sphere);
    },
  };
  return view;
}

const UP = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const quat = new THREE.Quaternion();

// A box of cross-section w x d stretched from point a to point b: limbs,
// ski poles, anything that is a stick at an angle.
export function limb(ax, ay, az, bx, by, bz, w, d, hex) {
  dir.set(bx - ax, by - ay, bz - az);
  const len = dir.length();
  const g = new THREE.BoxGeometry(w, len, d);
  quat.setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(quat);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return paint(g, hex);
}

// A flat disc lying on the ground, e.g. a soft shadow baked into a model.
export function disc(radius, y, hex, segments = 10) {
  const g = new THREE.CircleGeometry(radius, segments);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return paint(g, hex);
}

export function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
