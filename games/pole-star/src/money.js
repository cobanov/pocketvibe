// Dollar bills: thrown from your seat in a fluttering arc, they land on the
// stage and stay there, piling up over the show. A bill thrown in a hurry
// can hit the dancer in the face first. During the tornado every bill on the
// stage lifts off and swirls round the pole, then settles back where it was.
// All bills are one InstancedMesh: the first FLY slots are in the air, the
// rest are the pile on the stage.

import * as THREE from 'three';
import { STAGE_Y, canvasTexture, clamp, smooth } from './shared.js';

const FLY = 40;
const PILE = 360;
const FLIGHT = 0.62; // seconds from your hand to the stage
const BONK_FLIGHT = 0.42;
const DROP = 0.5; // falling off his face to the stage
const W = 0.36;
const H = 0.17;

// A one-dollar bill, drawn once: green paper, a dark border and, in the
// middle, a portrait with a moustache.
function billTexture() {
  return canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#a6d9a0';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2f6b33';
    g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.lineWidth = 2;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#d8f0d0';
    g.beginPath();
    g.ellipse(w / 2, h / 2, 17, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2f6b33';
    g.beginPath();
    g.arc(w / 2, h / 2 - 3, 8, 0, Math.PI * 2);
    g.fill();
    g.fillRect(w / 2 - 11, h / 2 + 7, 22, 8);
    g.fillStyle = '#1b3d1d';
    g.fillRect(w / 2 - 7, h / 2, 14, 3);
    g.font = 'bold 22px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#1f5323';
    g.fillText('1', 24, h / 2 + 1);
    g.fillText('1', w - 24, h / 2 + 1);
  });
}

export function createMoney(scene, camera) {
  const texture = billTexture();
  const geometry = new THREE.PlaneGeometry(W, H);
  const material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, FLY + PILE);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const white = new THREE.Color(1, 1, 1);
  const gold = new THREE.Color(1.35, 1.15, 0.55);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < FLY + PILE; i++) {
    mesh.setMatrixAt(i, hidden);
    mesh.setColorAt(i, white);
  }

  // Bills in the air.
  const live = new Uint8Array(FLY);
  const phase = new Uint8Array(FLY); // 0 to the stage, 1 to his face, 2 falling off it
  const age = new Float32Array(FLY);
  const dur = new Float32Array(FLY);
  const from = new Float32Array(FLY * 3);
  const to = new Float32Array(FLY * 3);
  const arc = new Float32Array(FLY);
  const axis = new Float32Array(FLY * 3);
  const spinRate = new Float32Array(FLY);
  const yawEnd = new Float32Array(FLY);
  const shiny = new Uint8Array(FLY);
  let nextFly = 0;

  // Bills on the stage.
  const restX = new Float32Array(PILE);
  const restY = new Float32Array(PILE);
  const restZ = new Float32Array(PILE);
  const restYaw = new Float32Array(PILE);
  let piled = 0; // how many pile slots are in use
  let nextPile = 0;
  let swirl = 0; // 0 resting, 1 fully airborne
  let time = 0;
  let pileDirty = false;
  let onBonk = null;

  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  const q = new THREE.Quaternion();
  const qFlat = new THREE.Quaternion();
  const qSpin = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const ax = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const lay = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  // A random spot on the stage, more often at the front where you see it.
  function stageSpot(i3, arr) {
    let a = 0;
    let r = 0;
    for (let k = 0; k < 2; k++) {
      a = Math.random() * Math.PI * 2;
      r = 0.4 + Math.sqrt(Math.random()) * 1.55;
      if (Math.cos(a) * r > -0.6) break;
    }
    arr[i3] = Math.sin(a) * r;
    arr[i3 + 1] = STAGE_Y + 0.012;
    arr[i3 + 2] = Math.cos(a) * r;
  }

  function flatQuat(yaw, out) {
    qYaw.setFromAxisAngle(up, yaw);
    return out.copy(qYaw).multiply(lay);
  }

  function land(i) {
    const p = nextPile;
    nextPile = (nextPile + 1) % PILE;
    piled = Math.min(PILE, piled + 1);
    restX[p] = to[i * 3];
    // Each bill a hair above the last few, so overlapping bills do not flicker.
    restY[p] = STAGE_Y + 0.008 + (p % 48) * 0.0011;
    restZ[p] = to[i * 3 + 2];
    restYaw[p] = yawEnd[i];
    placePile(p, 0);
    pileDirty = true;
    mesh.setMatrixAt(i, hidden);
  }

  function placePile(p, w) {
    if (w <= 0) {
      pos.set(restX[p], restY[p], restZ[p]);
      flatQuat(restYaw[p], q);
    } else {
      // Up in the swirl: round the pole, rising and wrapping round.
      const k = smooth(clamp(w * 1.7 - (p % 9) * 0.08, 0, 1));
      const a0 = Math.atan2(restX[p], restZ[p]);
      const ang = a0 + time * (2.6 + (p % 7) * 0.35);
      const rad = 0.55 + ((p * 0.618) % 1) * 1.5;
      const hgt = STAGE_Y + 0.3 + ((p * 0.37 + time * (0.35 + (p % 5) * 0.05)) % 1) * 4.6;
      pos.set(
        restX[p] + (Math.sin(ang) * rad - restX[p]) * k,
        restY[p] + (hgt - restY[p]) * k,
        restZ[p] + (Math.cos(ang) * rad - restZ[p]) * k,
      );
      flatQuat(restYaw[p], qFlat);
      ax.set(Math.sin(p), 1, Math.cos(p * 1.3)).normalize();
      qSpin.setFromAxisAngle(ax, time * (5 + (p % 4)));
      q.copy(qFlat).slerp(qSpin, k);
    }
    mat.compose(pos, q, scl);
    mesh.setMatrixAt(FLY + p, mat);
  }

  function launch(target, isBonk, glow) {
    const i = nextFly;
    nextFly = (nextFly + 1) % FLY;
    if (live[i] && phase[i] === 0) land(i); // the oldest bill lands early
    live[i] = 1;
    age[i] = 0;
    shiny[i] = glow ? 1 : 0;
    // From your hand: below the bottom of the screen, a little off centre.
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    fwd.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    pos.copy(camera.position).addScaledVector(fwd, 2.2).addScaledVector(camUp, -0.85).addScaledVector(right, (Math.random() - 0.5) * 0.8);
    from[i * 3] = pos.x;
    from[i * 3 + 1] = pos.y;
    from[i * 3 + 2] = pos.z;
    if (isBonk) {
      to[i * 3] = target.x;
      to[i * 3 + 1] = target.y;
      to[i * 3 + 2] = target.z;
      phase[i] = 1;
      dur[i] = BONK_FLIGHT;
      arc[i] = 0.35;
    } else {
      stageSpot(i * 3, to);
      phase[i] = 0;
      dur[i] = FLIGHT * (0.9 + Math.random() * 0.2);
      arc[i] = 1.1 + Math.random() * 0.5;
    }
    ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    axis[i * 3] = ax.x;
    axis[i * 3 + 1] = ax.y;
    axis[i * 3 + 2] = ax.z;
    spinRate[i] = 9 + Math.random() * 8;
    yawEnd[i] = Math.random() * Math.PI * 2;
    mesh.setColorAt(i, glow ? gold : white);
    mesh.instanceColor.needsUpdate = true;
  }

  return {
    texture,

    get count() {
      return piled;
    },

    // A bill to the stage; glow for one thrown on the beat.
    toss(glow) {
      launch(null, false, glow);
    },

    // A bill at his face (world position); bonk() is called when it hits.
    tossAt(face, bonk) {
      onBonk = bonk;
      launch(face, true, false);
    },

    clear() {
      for (let i = 0; i < FLY; i++) {
        live[i] = 0;
        mesh.setMatrixAt(i, hidden);
      }
      for (let p = 0; p < PILE; p++) mesh.setMatrixAt(FLY + p, hidden);
      piled = 0;
      nextPile = 0;
      swirl = 0;
      mesh.instanceMatrix.needsUpdate = true;
    },

    update(dt, tornado) {
      time += dt;
      let dirty = pileDirty;
      pileDirty = false;
      for (let i = 0; i < FLY; i++) {
        if (!live[i]) continue;
        dirty = true;
        age[i] += dt;
        const t = Math.min(1, age[i] / dur[i]);
        if (t >= 1) {
          if (phase[i] === 1) {
            // Hit his face: drop from there onto the stage.
            if (onBonk) onBonk();
            from[i * 3] = to[i * 3];
            from[i * 3 + 1] = to[i * 3 + 1];
            from[i * 3 + 2] = to[i * 3 + 2];
            stageSpot(i * 3, to);
            to[i * 3] = from[i * 3] * 0.4 + to[i * 3] * 0.6;
            to[i * 3 + 2] = from[i * 3 + 2] * 0.4 + to[i * 3 + 2] * 0.6;
            phase[i] = 2;
            age[i] = 0;
            dur[i] = DROP;
            arc[i] = 0.25;
            continue;
          }
          live[i] = 0;
          if (shiny[i]) {
            mesh.setColorAt(i, white);
            mesh.instanceColor.needsUpdate = true;
          }
          land(i);
          continue;
        }
        const i3 = i * 3;
        const lift = arc[i] * 4 * t * (1 - t);
        pos.set(
          from[i3] + (to[i3] - from[i3]) * t,
          from[i3 + 1] + (to[i3 + 1] - from[i3 + 1]) * t + lift,
          from[i3 + 2] + (to[i3 + 2] - from[i3 + 2]) * t,
        );
        ax.set(axis[i3], axis[i3 + 1], axis[i3 + 2]);
        qSpin.setFromAxisAngle(ax, age[i] * spinRate[i]);
        // Flutter down flat for the landing.
        const settle = phase[i] === 1 ? 0 : smooth((t - 0.7) / 0.3);
        if (settle > 0) {
          flatQuat(yawEnd[i], qFlat);
          q.copy(qSpin).slerp(qFlat, settle);
        } else q.copy(qSpin);
        mat.compose(pos, q, scl);
        mesh.setMatrixAt(i, mat);
      }

      // The tornado lifts the pile; it settles back once the spin ends.
      const goal = tornado ? 1 : 0;
      const before = swirl;
      swirl += (goal - swirl) * Math.min(1, dt * (tornado ? 1.6 : 1.1));
      if (swirl < 0.002) swirl = 0;
      if (swirl > 0 || before > 0) {
        for (let p = 0; p < piled; p++) placePile(p, swirl);
        dirty = true;
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    },

    // For warming up shaders while loading: one bill in front of the camera.
    showSample(at) {
      mat.compose(at, flatQuat(0, q), scl);
      mesh.setMatrixAt(0, mat);
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
