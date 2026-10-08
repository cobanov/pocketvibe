// Building blocks shared by the limits tests.
//
// typical() is a small, well-behaved game scene (the AGENTS.md rules): sky,
// fog, a ground plane, 80 low-poly rocks in one InstancedMesh (6.4k
// triangles), a hemisphere light and a sun. Tests that measure an addition
// (lights, shadows, particles, HUD, JavaScript time...) put it on top of this
// scene, so their numbers answer "how much of X can a normal game afford".

import * as THREE from 'three';

export const W = 720;
export const H = 480;

export function rng(seed = 1) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function material(type, params = {}) {
  switch (type) {
    case 'basic':
      return new THREE.MeshBasicMaterial(params);
    case 'lambert':
      return new THREE.MeshLambertMaterial(params);
    case 'toon':
      return new THREE.MeshToonMaterial(params);
    case 'phong':
      return new THREE.MeshPhongMaterial({ shininess: 40, ...params });
    case 'standard':
      return new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.1, ...params });
    case 'physical':
      return new THREE.MeshPhysicalMaterial({ roughness: 0.6, metalness: 0.1, clearcoat: 0.5, ...params });
  }
  throw new Error(`unknown material ${type}`);
}

// Sky, fog and lights.
export function stage(ctx, { lights = true } = {}) {
  const { scene } = ctx;
  scene.background = new THREE.Color(0x8fbce6);
  scene.fog = new THREE.Fog(0x8fbce6, 35, 110);
  if (lights) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(20, 40, 15);
    scene.add(sun, sun.target);
    ctx.sun = sun;
  }
}

export function ground(ctx, type = 'lambert', params = {}) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), material(type, { color: 0x6aa84f, ...params }));
  ctx.scene.add(mesh);
  return mesh;
}

// Points on the visible part of the ground, in rows, filling the view.
export function spread(count, { x = 15, near = 6, far = -40 } = {}) {
  const cols = Math.max(1, Math.round(Math.sqrt(count * ((2 * x) / (near - far)))));
  const rows = Math.ceil(count / cols);
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push([-x + ((c + 0.5) * 2 * x) / cols, near + ((r + 0.5) * (far - near)) / rows]);
  }
  return out;
}

const PALETTE = [0xe74c3c, 0xf1c40f, 0x3498db, 0x9b59b6, 0xe67e22, 0x1abc9c];

// The typical game scene: 80 low-poly rocks (80 triangles each, 6.4k in
// all) in one InstancedMesh on a ground plane. Returns its parts so tests can
// change them.
export function typical(ctx, { type = 'lambert', count = 80, params = {} } = {}) {
  stage(ctx, { lights: type !== 'basic' });
  const floor = ground(ctx, type, params);
  const geometry = new THREE.IcosahedronGeometry(0.9, 1);
  const mesh = new THREE.InstancedMesh(geometry, material(type, { color: 0xffffff, ...params }), count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  spread(count).forEach(([x, z], i) => {
    dummy.position.set(x, 0.9, z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setHex(PALETTE[i % PALETTE.length]));
  });
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  return { floor, mesh };
}

// Instanced spheres with about `total` triangles in all, every one of them on
// screen unless `away` puts them past the camera's far plane.
export function sphereField(ctx, total, { count = 300, radius = 0.7, type = 'lambert', away = false } = {}) {
  // SphereGeometry(r, 2h, h) has 4h(h - 1) triangles.
  const h = Math.max(2, Math.round((1 + Math.sqrt(1 + total / count)) / 2));
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 2 * h, h), material(type, { color: 0x3498db }), count);
  const dummy = new THREE.Object3D();
  spread(count).forEach(([x, z], i) => {
    dummy.position.set(x, radius, away ? z - 300 : z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
  return mesh;
}

// A slow camera sway, so every frame is drawn from a new angle as in a game.
export function sway(ctx, t) {
  ctx.camera.position.set(Math.sin(t * 0.4) * 3, 9, 18);
  ctx.camera.lookAt(0, 0, -6);
}

// A canvas with a pattern, for textures.
export function patternCanvas(size, seed = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const r = rng(seed);
  const cell = size / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = `hsl(${Math.floor(r() * 360)},55%,${45 + ((x + y) % 2) * 15}%)`;
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  for (let i = 0; i < size; i++) {
    g.fillStyle = `rgba(255,255,255,${r() * 0.2})`;
    g.fillRect(r() * size, r() * size, 1 + r() * (size / 64), 1 + r() * (size / 64));
  }
  return canvas;
}

// A soft round dot, for particles and sprites.
export function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,220,150,0.8)');
  grad.addColorStop(1, 'rgba(255,150,50,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Makes a material's shaders unique, so neither three.js nor the driver can
// reuse a compiled copy: the compile test then measures a real first use.
export function uncached(mat) {
  const tag = `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = `#define PV_FRESH_${tag}\n${shader.vertexShader}`;
    shader.fragmentShader = `#define PV_FRESH_${tag}\n${shader.fragmentShader}`;
  };
  mat.customProgramCacheKey = () => tag;
  return mat;
}
