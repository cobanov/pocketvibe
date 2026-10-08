// The ball as drawn: white with a red band so its roll shows, a soft shadow,
// a short trail while it is fast, a squash on hard hits, and the putter that
// swings back while A charges and through on the shot.

import * as THREE from 'three';
import { BALL_R } from './physics.js';
import { box, cylinder, merge, paint } from './shared.js';

const TRAIL = 8;
const SHAFT = 1.25; // putter length from the hands to the head
const LEAN = 0.38; // the hands sit this far left of the ball's line
const REST_SWING = -0.08;

function ballGeometry() {
  const g = new THREE.IcosahedronGeometry(BALL_R, 2);
  paint(g, 0xffffff);
  const p = g.attributes.position;
  const c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (Math.abs(y) < BALL_R * 0.28) c.setXYZ(i, 1, 0.3, 0.36);
  }
  return g;
}

// Hands at the origin, the head down and to the right (+z) of them, its
// face towards +x (the aim).
function putterGeometry() {
  const tilt = Math.atan2(LEAN, SHAFT);
  const len = Math.hypot(LEAN, SHAFT);
  const shaft = cylinder(0.022, 0.022, len, 6, 0, 0, 0, 0xd9dde3);
  shaft.rotateX(-tilt);
  shaft.translate(0, -SHAFT / 2, LEAN / 2);
  const grip = cylinder(0.04, 0.035, 0.32, 6, 0, -0.16, 0, 0x2b2b35);
  grip.rotateX(-tilt);
  const head = box(0.12, 0.09, 0.4, 0, -SHAFT - 0.02, LEAN + 0.06, 0x3d4250, 0x8a93a6);
  const face = box(0.02, 0.07, 0.36, 0.065, -SHAFT - 0.02, LEAN + 0.06, 0xffc12e);
  return merge([shaft, grip, head, face]);
}

export function createBallView(scene) {
  const mesh = new THREE.Mesh(ballGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x262626 }));
  scene.add(mesh);

  const shadowGeometry = new THREE.CircleGeometry(BALL_R * 1.15, 12);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x0a2a08, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  scene.add(shadow);

  const trail = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(BALL_R * 0.7, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    TRAIL,
  );
  trail.frustumCulled = false;
  trail.count = 0;
  scene.add(trail);
  const hist = new Float32Array(TRAIL * 3);
  let histCount = 0;
  let histHead = 0;

  const putter = new THREE.Mesh(putterGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }));
  putter.rotation.order = 'YZX'; // yaw to the aim first, then swing
  putter.visible = false;
  scene.add(putter);
  let swing = REST_SWING;
  let swingTarget = REST_SWING;
  let follow = 0; // seconds since the shot, while the putter follows through
  let putterFade = 0; // 1 shown, 0 gone

  const axis = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const dummy = new THREE.Object3D();
  let squash = 0;

  return {
    mesh,

    // Puts the ball at (x, y, z), with its shadow on the green at ground.
    place(x, y, z, ground, shadowOn) {
      mesh.position.set(x, y, z);
      shadow.visible = shadowOn;
      shadow.position.set(x + 0.04, ground + 0.012, z + 0.03);
    },

    // Turns the ball for a roll of (vx, vz) over dt.
    roll(vx, vz, dt) {
      const speed = Math.hypot(vx, vz);
      if (speed < 1e-4) return;
      axis.set(vz / speed, 0, -vx / speed);
      spin.setFromAxisAngle(axis, (speed * dt) / BALL_R);
      mesh.quaternion.premultiply(spin);
    },

    squash(amount) {
      squash = Math.max(squash, amount);
    },

    clearTrail() {
      histCount = 0;
      trail.count = 0;
    },

    // The putter behind the ball at (x, y, z), facing `angle`.
    showPutter(x, y, z, angle) {
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      // Behind the ball along the aim, hands to the left of the line.
      const back = BALL_R + 0.1;
      putter.position.set(x - dx * back + dz * LEAN, y - BALL_R + 0.07 + SHAFT, z - dz * back - dx * LEAN);
      putter.rotation.y = -angle;
      if (follow === 0) putterFade = 1;
    },

    // 0..1 while A is held: the putter draws back.
    charge(power) {
      swingTarget = REST_SWING - power * 0.8;
    },

    strike() {
      follow = 0.0001;
      swingTarget = 0.5;
    },

    resetPutter() {
      follow = 0;
      swing = swingTarget = REST_SWING;
      putterFade = 1;
    },

    hidePutter() {
      putterFade = 0;
      follow = 0;
    },

    update(dt, speed, live) {
      // Squash on hits: flatter and wider, springing back.
      squash = Math.max(0, squash - dt * 3);
      const s = squash * Math.sin(squash * 20) * 0.6 + squash * 0.4;
      mesh.scale.set(1 + s * 0.5, 1 - s * 0.6, 1 + s * 0.5);

      // The trail: the last few positions, newest first, shrinking.
      if (live && speed > 3) {
        hist[histHead * 3] = mesh.position.x;
        hist[histHead * 3 + 1] = mesh.position.y;
        hist[histHead * 3 + 2] = mesh.position.z;
        histHead = (histHead + 1) % TRAIL;
        histCount = Math.min(TRAIL, histCount + 1);
      } else if (histCount > 0) {
        histCount--;
      }
      trail.count = histCount;
      for (let k = 0; k < histCount; k++) {
        const i = (histHead - 1 - k + TRAIL * 2) % TRAIL;
        dummy.position.set(hist[i * 3], hist[i * 3 + 1], hist[i * 3 + 2]);
        dummy.scale.setScalar(1 - (k + 1) / (TRAIL + 1));
        dummy.updateMatrix();
        trail.setMatrixAt(k, dummy.matrix);
      }
      if (histCount > 0) trail.instanceMatrix.needsUpdate = true;

      // The putter eases to its target; after the shot it follows through,
      // then shrinks away.
      if (follow > 0) {
        follow += dt;
        swing += (swingTarget - swing) * Math.min(1, dt * 30);
        if (follow > 0.45) putterFade = Math.max(0, putterFade - dt * 4);
      } else {
        swing += (swingTarget - swing) * Math.min(1, dt * 12);
      }
      putter.rotation.z = swing;
      putter.visible = putterFade > 0.01;
      putter.scale.setScalar(Math.min(1, putterFade * 1.5));
    },
  };
}
