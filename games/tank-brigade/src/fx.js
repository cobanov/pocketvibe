// Pooled effects: fireballs and smoke puffs (one InstancedMesh), debris and
// sparks (another), flat shock rings and scorch marks left on the floor.
// Every pool is a ring of slots; a new particle takes the oldest slot. Only
// live particles are drawn: each frame they are packed to the front of their
// mesh and its count set to them, so idle pools cost no triangles.

import * as THREE from 'three';

const FIRE_MAX = 72;
const DEBRIS_MAX = 180;
const RING_MAX = 6;
const SCORCH_MAX = 24;
const GRAVITY = 22;
const RING_TIME = 0.4;

// A fireball's colour over its life: white hot, yellow, orange, red, smoke.
const RAMP_HEX = [0xffffff, 0xfff1a0, 0xffcf40, 0xff9a2a, 0xf0601e, 0xb8401c, 0x5a4a44, 0x3c3836];
const SMOKE_HEX = [0x9a948c, 0x7c7670, 0x5e5a56, 0x47444a];

export function createFx(scene) {
  const ramp = RAMP_HEX.map((h) => new THREE.Color(h));
  const smokeRamp = SMOKE_HEX.map((h) => new THREE.Color(h));
  const white = new THREE.Color(0xffffff);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  function pool(geometry, material, max) {
    const mesh = new THREE.InstancedMesh(geometry, material, max);
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    for (let i = 0; i < max; i++) mesh.setColorAt(i, white);
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  }

  // Fireballs and smoke.
  const fire = pool(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), FIRE_MAX);
  const fx = new Float32Array(FIRE_MAX);
  const fy = new Float32Array(FIRE_MAX);
  const fz = new Float32Array(FIRE_MAX);
  const fvx = new Float32Array(FIRE_MAX);
  const fvy = new Float32Array(FIRE_MAX);
  const fvz = new Float32Array(FIRE_MAX);
  const fsize = new Float32Array(FIRE_MAX);
  const flife = new Float32Array(FIRE_MAX);
  const fmax = new Float32Array(FIRE_MAX);
  const fsmoke = new Uint8Array(FIRE_MAX);
  let fireNext = 0;
  let fireLive = 0;

  // Debris and sparks: little tumbling shards.
  const debris = pool(
    new THREE.TetrahedronGeometry(0.8, 0),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x262626 }),
    DEBRIS_MAX,
  );
  const dx = new Float32Array(DEBRIS_MAX);
  const dy = new Float32Array(DEBRIS_MAX);
  const dz = new Float32Array(DEBRIS_MAX);
  const dvx = new Float32Array(DEBRIS_MAX);
  const dvy = new Float32Array(DEBRIS_MAX);
  const dvz = new Float32Array(DEBRIS_MAX);
  const drot = new Float32Array(DEBRIS_MAX);
  const dspin = new Float32Array(DEBRIS_MAX);
  const dsize = new Float32Array(DEBRIS_MAX);
  const dlife = new Float32Array(DEBRIS_MAX);
  const dmax = new Float32Array(DEBRIS_MAX);
  const dhex = new Uint32Array(DEBRIS_MAX);
  let debrisNext = 0;
  let debrisLive = 0;

  // Shock rings: additive, so fading the colour to black fades them out.
  const ringGeometry = new THREE.RingGeometry(0.82, 1, 20);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings = pool(
    ringGeometry,
    new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    RING_MAX,
  );
  const rx = new Float32Array(RING_MAX);
  const rz = new Float32Array(RING_MAX);
  const rsize = new Float32Array(RING_MAX);
  const rage = new Float32Array(RING_MAX).fill(RING_TIME);
  const rhex = new Uint32Array(RING_MAX);
  let ringNext = 0;

  // Scorch marks stay on the floor until the next stage.
  const scorchGeometry = new THREE.CircleGeometry(0.5, 10);
  scorchGeometry.rotateX(-Math.PI / 2);
  const scorch = new THREE.InstancedMesh(
    scorchGeometry,
    new THREE.MeshBasicMaterial({ color: 0x0c0d0c, transparent: true, opacity: 0.42, depthWrite: false }),
    SCORCH_MAX,
  );
  scorch.frustumCulled = false;
  scorch.count = 0;
  scene.add(scorch);
  let scorchNext = 0;

  function spawnFire(x, y, z, vx, vy, vz, size, life, smoke) {
    const i = fireNext;
    fireNext = (fireNext + 1) % FIRE_MAX;
    fx[i] = x;
    fy[i] = y;
    fz[i] = z;
    fvx[i] = vx;
    fvy[i] = vy;
    fvz[i] = vz;
    fsize[i] = size;
    flife[i] = life;
    fmax[i] = life;
    fsmoke[i] = smoke;
    fireLive++;
  }

  function spawnDebris(x, y, z, vx, vy, vz, size, life, hex) {
    const i = debrisNext;
    debrisNext = (debrisNext + 1) % DEBRIS_MAX;
    dx[i] = x;
    dy[i] = y;
    dz[i] = z;
    dvx[i] = vx;
    dvy[i] = vy;
    dvz[i] = vz;
    drot[i] = Math.random() * 6;
    dspin[i] = (Math.random() - 0.5) * 18;
    dsize[i] = size;
    dlife[i] = life;
    dmax[i] = life;
    dhex[i] = hex;
    debrisLive++;
  }

  return {
    // A tank (or the core) blowing up. big: 1 for a tank, about 2 for the core.
    explode(x, z, big, hex) {
      const n = Math.round(7 * big);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.35 * big;
        spawnFire(
          x + Math.cos(a) * r,
          0.35 + Math.random() * 0.3,
          z + Math.sin(a) * r,
          Math.cos(a) * (0.8 + Math.random()) * big,
          1.2 + Math.random() * 1.6,
          Math.sin(a) * (0.8 + Math.random()) * big,
          (0.55 + Math.random() * 0.45) * Math.sqrt(big),
          0.45 + Math.random() * 0.35,
          0,
        );
      }
      for (let k = 0; k < 3 * big; k++) {
        spawnFire(x, 0.5, z, (Math.random() - 0.5) * 1.2, 1.6 + Math.random(), (Math.random() - 0.5) * 1.2, 0.5, 1.1, 1);
      }
      this.debris(x, 0.4, z, Math.round(9 * big), hex, 5 * Math.sqrt(big), 0.15);
      this.debris(x, 0.4, z, Math.round(5 * big), 0x2a2b2e, 4.5 * Math.sqrt(big), 0.12);
      this.ring(x, z, 0xff9a40, 1.6 * big);
      this.scorch(x, z, 0.9 + 0.3 * big);
    },

    // A small burst where a bullet stopped.
    pop(x, y, z) {
      spawnFire(x, y, z, 0, 0.6, 0, 0.32, 0.2, 0);
    },

    muzzle(x, y, z) {
      spawnFire(x, y, z, 0, 0, 0, 0.26, 0.09, 0);
    },

    puff(x, y, z, size) {
      spawnFire(x, y, z, (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, size, 0.5, 1);
    },

    // n cubes flying out of (x, y, z).
    debris(x, y, z, n, hex, speed, size) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.35 + Math.random() * 0.65);
        spawnDebris(
          x,
          y,
          z,
          Math.cos(a) * s,
          2 + Math.random() * speed,
          Math.sin(a) * s,
          size * (0.6 + Math.random() * 0.8),
          0.5 + Math.random() * 0.4,
          hex,
        );
      }
    },

    sparks(x, y, z, n, hex) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const s = 2.5 + Math.random() * 3;
        spawnDebris(x, y, z, Math.cos(a) * s, 1.5 + Math.random() * 3, Math.sin(a) * s, 0.06, 0.22, hex);
      }
    },

    ring(x, z, hex, size) {
      const i = ringNext;
      ringNext = (ringNext + 1) % RING_MAX;
      rx[i] = x;
      rz[i] = z;
      rsize[i] = size;
      rage[i] = 0;
      rhex[i] = hex;
    },

    scorch(x, z, size) {
      const i = scorchNext;
      scorchNext = (scorchNext + 1) % SCORCH_MAX;
      dummy.position.set(x, 0.006 + i * 0.0004, z);
      dummy.rotation.set(0, Math.random() * 3, 0);
      dummy.scale.set(size, 1, size * (0.8 + Math.random() * 0.3));
      dummy.updateMatrix();
      scorch.setMatrixAt(i, dummy.matrix);
      scorch.count = Math.max(scorch.count, i + 1);
      scorch.instanceMatrix.needsUpdate = true;
    },

    clear() {
      flife.fill(0);
      dlife.fill(0);
      rage.fill(RING_TIME);
      fire.count = 0;
      debris.count = 0;
      rings.count = 0;
      fireLive = 0;
      debrisLive = 0;
      scorch.count = 0;
      scorchNext = 0;
    },

    update(dt) {
      if (fireLive > 0) {
        fireLive = 0;
        for (let i = 0; i < FIRE_MAX; i++) {
          if (flife[i] <= 0) continue;
          flife[i] -= dt;
          if (flife[i] <= 0) continue;
          const n = fireLive++;
          const k = 1 - flife[i] / fmax[i];
          fx[i] += fvx[i] * dt;
          fy[i] += fvy[i] * dt;
          fz[i] += fvz[i] * dt;
          const drag = 1 - Math.min(1, dt * 3);
          fvx[i] *= drag;
          fvz[i] *= drag;
          let s;
          if (fsmoke[i]) {
            s = fsize[i] * (0.4 + k * 0.8) * (1 - k * k);
            const f = k * (smokeRamp.length - 1);
            const j = Math.min(smokeRamp.length - 2, Math.floor(f));
            color.copy(smokeRamp[j]).lerp(smokeRamp[j + 1], f - j);
          } else {
            s = fsize[i] * (0.35 + 0.65 * Math.min(1, k * 7)) * (1 - k * k * k);
            const f = k * (ramp.length - 1);
            const j = Math.min(ramp.length - 2, Math.floor(f));
            color.copy(ramp[j]).lerp(ramp[j + 1], f - j);
          }
          fire.setColorAt(n, color);
          dummy.position.set(fx[i], fy[i], fz[i]);
          dummy.rotation.set(k * 3 + i, k * 2, 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          fire.setMatrixAt(n, dummy.matrix);
        }
        fire.count = fireLive;
        fire.instanceMatrix.needsUpdate = true;
        fire.instanceColor.needsUpdate = true;
      }

      if (debrisLive > 0) {
        debrisLive = 0;
        for (let i = 0; i < DEBRIS_MAX; i++) {
          if (dlife[i] <= 0) continue;
          dlife[i] -= dt;
          if (dlife[i] <= 0) continue;
          const n = debrisLive++;
          dvy[i] -= GRAVITY * dt;
          dx[i] += dvx[i] * dt;
          dy[i] += dvy[i] * dt;
          dz[i] += dvz[i] * dt;
          const half = dsize[i] * 0.5;
          if (dy[i] < half && dvy[i] < 0) {
            // Bounce on the floor and lose speed.
            dy[i] = half;
            dvy[i] = -dvy[i] * 0.35;
            dvx[i] *= 0.6;
            dvz[i] *= 0.6;
          }
          drot[i] += dspin[i] * dt;
          const s = dsize[i] * Math.min(1, (dlife[i] / dmax[i]) * 2.5);
          dummy.position.set(dx[i], dy[i], dz[i]);
          dummy.rotation.set(drot[i], drot[i] * 0.7, 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          debris.setMatrixAt(n, dummy.matrix);
          debris.setColorAt(n, color.setHex(dhex[i]));
        }
        debris.count = debrisLive;
        debris.instanceMatrix.needsUpdate = true;
        debris.instanceColor.needsUpdate = true;
      }

      let ringsMoved = rings.count > 0;
      let nr = 0;
      for (let i = 0; i < RING_MAX; i++) {
        if (rage[i] >= RING_TIME) continue;
        rage[i] += dt;
        ringsMoved = true;
        if (rage[i] >= RING_TIME) continue;
        const k = rage[i] / RING_TIME;
        const s = rsize[i] * (0.3 + (1 - (1 - k) * (1 - k)) * 0.9);
        dummy.position.set(rx[i], 0.04, rz[i]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(s, 1, s);
        dummy.updateMatrix();
        rings.setMatrixAt(nr, dummy.matrix);
        color.setHex(rhex[i]).multiplyScalar(1 - k);
        rings.setColorAt(nr, color);
        nr++;
      }
      rings.count = nr;
      if (ringsMoved) {
        rings.instanceMatrix.needsUpdate = true;
        rings.instanceColor.needsUpdate = true;
      }
    },
  };
}
