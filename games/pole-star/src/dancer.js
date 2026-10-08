// Sergio, the dancer: a low-poly figure in a sequined unitard, with a
// sweatband and a magnificent moustache, built from a dozen boxes on a small
// skeleton. Every move is a function of the music's beat that fills a pose
// (where he is around the pole and every joint's angle); switching moves
// blends from the last pose to the new one. Hands that hold the pole are
// placed on it with two-bone IK, so the grip stays put whatever the body does.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BEAT, POLE_R, STAGE_Y, angleDiff, bump, clamp, paint, pulse, smooth, taperBox } from './shared.js';

const SUIT = 0x9b3cf0;
const SUIT_DARK = 0x6a1fb8;
const GOLD = 0xffc83d;
const SKIN = 0xe0a477;
const SKIN_DARK = 0xc98a5e;
const HAIR = 0x2a1a12;
const STACHE = 0x1b110b;
const BAND = 0xffffff;
const BAND_STRIPE = 0xe23b4e;

const UPPER = 0.3; // shoulder to elbow
const LOWER = 0.3; // elbow to the middle of the hand
const STAND_H = 0.975; // hip height when standing straight
const BLEND = 0.6; // seconds to blend into a new move
const HOME = Math.PI / 2 - 0.2; // orbit angle where he faces the crowd, right of the pole
const LAP = -(Math.PI * 2) / (8 * BEAT); // one walk around the pole every two bars

// Pose layout: one Float32Array per pose.
const R = 0; // distance of the hips from the pole
const H = 1; // hip height above the stage
const YAW = 2; // turn on top of facing along the orbit
const PITCH = 3;
const ROLL = 4;
const OMEGA = 5; // how fast he goes round the pole (rad/s)
const CX = 6; // chest
const HX = 9; // head
const RA = 12; // right upper arm x, y (twist), z; then 15 = elbow bend
const LA = 16; // left upper arm; 19 = elbow
const RT = 20; // right thigh x, y, z; then 23 = knee
const LT = 24; // left thigh; 27 = knee
const GRW = 28; // right hand on the pole: weight, height above the stage
const GRH = 29;
const GLW = 30;
const GLH = 31;
const N = 32;

export const MOVE_BOW = 6;

// Parts of one segment become one geometry: non-indexed, without uvs (the
// material shades flat from the faces).
function merge(parts) {
  return mergeGeometries(
    parts.map((g) => {
      const flat = g.index ? g.toNonIndexed() : g;
      flat.deleteAttribute('uv');
      return flat;
    }),
  );
}

function at(geometry, x, y, z) {
  return geometry.translate(x, y, z);
}

function buildHead() {
  const skull = paint(new THREE.IcosahedronGeometry(0.13, 1), SKIN);
  skull.scale(1, 1.12, 1.05);
  skull.translate(0, 0.17, 0);
  const neck = paint(at(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 6), 0, 0.04, 0), SKIN_DARK);
  const hair = paint(at(new THREE.BoxGeometry(0.25, 0.09, 0.24), 0, 0.29, -0.02), HAIR);
  const quiff = paint(at(new THREE.BoxGeometry(0.21, 0.08, 0.12), 0, 0.31, 0.08), HAIR);
  quiff.rotateX(-0.15);
  const band = paint(at(new THREE.CylinderGeometry(0.142, 0.142, 0.05, 10, 1, true), 0, 0.235, 0), BAND);
  const stripe = paint(at(new THREE.CylinderGeometry(0.144, 0.144, 0.016, 10, 1, true), 0, 0.235, 0), BAND_STRIPE);
  const nose = paint(at(new THREE.BoxGeometry(0.04, 0.06, 0.05), 0, 0.17, 0.135), SKIN_DARK);
  // The moustache: a broad bar with tips that curl up.
  const stache = paint(at(new THREE.BoxGeometry(0.17, 0.04, 0.045), 0, 0.125, 0.13), STACHE);
  const tipL = paint(new THREE.BoxGeometry(0.06, 0.03, 0.035), STACHE);
  tipL.rotateZ(0.7);
  tipL.translate(0.1, 0.145, 0.12);
  const tipR = paint(new THREE.BoxGeometry(0.06, 0.03, 0.035), STACHE);
  tipR.rotateZ(-0.7);
  tipR.translate(-0.1, 0.145, 0.12);
  const eyeL = paint(at(new THREE.BoxGeometry(0.03, 0.035, 0.01), 0.048, 0.195, 0.132), 0x111111);
  const eyeR = paint(at(new THREE.BoxGeometry(0.03, 0.035, 0.01), -0.048, 0.195, 0.132), 0x111111);
  const browL = paint(at(new THREE.BoxGeometry(0.065, 0.02, 0.02), 0.05, 0.218, 0.13), HAIR);
  const browR = paint(at(new THREE.BoxGeometry(0.065, 0.02, 0.02), -0.05, 0.218, 0.13), HAIR);
  const burnL = paint(at(new THREE.BoxGeometry(0.02, 0.09, 0.06), 0.128, 0.19, 0.02), HAIR);
  const burnR = paint(at(new THREE.BoxGeometry(0.02, 0.09, 0.06), -0.128, 0.19, 0.02), HAIR);
  return merge([skull, neck, hair, quiff, band, stripe, nose, stache, tipL, tipR, eyeL, eyeR, browL, browR, burnL, burnR]);
}

function buildChest() {
  const torso = paint(at(taperBox(0.29, 0.5, 0.2, 1.45, 1.1), 0, 0.25, 0), SUIT, SUIT_DARK);
  // A gold sequin sash across the chest and a gold collar.
  const sash = paint(new THREE.BoxGeometry(0.07, 0.56, 0.23), GOLD);
  sash.rotateZ(0.62);
  sash.translate(0, 0.27, 0.005);
  const collar = paint(at(new THREE.CylinderGeometry(0.08, 0.1, 0.05, 8), 0, 0.5, 0), GOLD);
  const shoulderL = paint(at(new THREE.BoxGeometry(0.13, 0.11, 0.18), 0.21, 0.44, 0), SUIT);
  const shoulderR = paint(at(new THREE.BoxGeometry(0.13, 0.11, 0.18), -0.21, 0.44, 0), SUIT);
  return merge([torso, sash, collar, shoulderL, shoulderR]);
}

function buildPelvis() {
  const hips = paint(at(taperBox(0.3, 0.2, 0.19, 1.0, 1.0), 0, -0.02, 0), SUIT_DARK);
  const belt = paint(at(new THREE.BoxGeometry(0.31, 0.05, 0.2), 0, 0.07, 0), GOLD);
  return merge([hips, belt]);
}

function buildUpperArm() {
  return merge([paint(at(taperBox(0.085, UPPER, 0.09, 1.25), 0, -UPPER / 2, 0), SUIT)]);
}

function buildForearm() {
  const arm = paint(at(taperBox(0.075, 0.24, 0.08, 1.15), 0, -0.12, 0), SUIT);
  const cuff = paint(at(new THREE.BoxGeometry(0.09, 0.035, 0.095), 0, -0.235, 0), GOLD);
  const hand = paint(at(new THREE.BoxGeometry(0.075, 0.1, 0.06), 0, -LOWER + 0.01, 0), SKIN);
  return merge([arm, cuff, hand]);
}

function buildThigh() {
  return merge([paint(at(taperBox(0.13, 0.44, 0.14, 1.15), 0, -0.22, 0), SUIT)]);
}

function buildShin() {
  const shin = paint(at(taperBox(0.1, 0.42, 0.11, 1.2), 0, -0.21, 0), SUIT);
  const shoe = paint(at(new THREE.BoxGeometry(0.1, 0.07, 0.22), 0, -0.45, 0.04), GOLD);
  return merge([shin, shoe]);
}

export function createDancer(scene) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  scene.add(root);
  const mesh = (geometry, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geometry, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  mesh(buildPelvis(), root);
  const chest = mesh(buildChest(), root, 0, 0.08, 0);
  const head = mesh(buildHead(), chest, 0, 0.5, 0);
  const upperArm = buildUpperArm();
  const forearm = buildForearm();
  const upperR = mesh(upperArm, chest, -0.24, 0.44, 0);
  const foreR = mesh(forearm, upperR, 0, -UPPER, 0);
  const upperL = mesh(upperArm, chest, 0.24, 0.44, 0);
  const foreL = mesh(forearm, upperL, 0, -UPPER, 0);
  // Upper arms twist about their own length first, then swing forward and
  // out: a bent elbow can then point anywhere.
  upperR.rotation.order = 'ZXY';
  upperL.rotation.order = 'ZXY';
  const thigh = buildThigh();
  const shin = buildShin();
  const thighR = mesh(thigh, root, -0.1, -0.06, 0);
  const shinR = mesh(shin, thighR, 0, -0.44, 0);
  const thighL = mesh(thigh, root, 0.1, -0.06, 0);
  const shinL = mesh(shin, thighL, 0, -0.44, 0);

  // A soft dark disc on the stage under him: the only shadow in the club.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.position.y = STAGE_Y + 0.006;
  scene.add(shadow);

  const pose = new Float32Array(N);
  const from = new Float32Array(N); // the pose when the last move change began
  const next = new Float32Array(N);
  let move = 0;
  let blend = 1;
  let orbit = HOME;
  let bowT = 0;
  let bonkT = 10;
  let time = 0;

  // ---------------------------------------------------------------- moves

  function stand(P) {
    P.fill(0);
    P[R] = 0.5;
    P[H] = STAND_H;
    P[RA + 2] = -0.12;
    P[LA + 2] = 0.12;
    P[RA + 3] = 0.15;
    P[LA + 3] = 0.15;
  }

  // Ease back to the spot facing the crowd.
  function goHome(P, target = HOME) {
    P[OMEGA] = clamp(angleDiff(target, orbit) * 2.5, -3, 3);
  }

  // Bored: leans on the pole, taps a foot, and every few bars checks his
  // watch, yawns or twirls his moustache.
  function idle(P, b) {
    stand(P);
    goHome(P);
    P[R] = 0.44;
    P[ROLL] = 0.1;
    P[GRW] = 1;
    P[GRH] = 1.78;
    // Left hand on the hip.
    P[LA] = 0.25;
    P[LA + 1] = -Math.PI / 2;
    P[LA + 2] = 0.75;
    P[LA + 3] = 1.7;
    const tap = pulse(b, 8);
    P[LT] = -0.12 * tap;
    P[LT + 2] = -0.12;
    P[LT + 3] = 0.25 * tap;
    P[RT + 2] = 0.04;
    P[HX] = 0.05 * pulse(b, 5);
    P[HX + 1] = 0.25;

    const local = b % 16;
    const gag = Math.floor(b / 16) % 3;
    const w = smooth((local - 6) / 1.5) * (1 - smooth((local - 13.5) / 1.5));
    if (w <= 0) return;
    const mix = (i, v) => (P[i] += (v - P[i]) * w);
    if (gag === 0) {
      // Checks his watch: forearm across the chest, head down.
      mix(LA, -0.55);
      mix(LA + 1, -1.2);
      mix(LA + 2, 0.15);
      mix(LA + 3, 1.75);
      mix(HX, 0.5);
      mix(HX + 1, 0.35);
    } else if (gag === 1) {
      // A huge yawn: head back, hand to the mouth.
      mix(LA, -0.55);
      mix(LA + 1, -0.5);
      mix(LA + 2, 0.2);
      mix(LA + 3, 2.45);
      mix(HX, -0.42);
      mix(CX, -0.12);
    } else {
      // Twirls his moustache.
      mix(LA, -0.5);
      mix(LA + 1, -0.6);
      mix(LA + 2, 0.25);
      mix(LA + 3, 2.35 + 0.12 * Math.sin(time * 14));
      mix(HX + 1, 0.4);
      mix(HX + 2, 0.12);
    }
  }

  // Walks round the pole holding it, with a Rockette kick every bar.
  function stroll(P, b) {
    stand(P);
    const phi = b * Math.PI;
    P[R] = 0.62;
    P[H] = STAND_H - 0.03 + 0.03 * Math.abs(Math.sin(phi));
    P[OMEGA] = LAP;
    P[ROLL] = -0.1;
    P[GRW] = 1;
    P[GRH] = 1.55;
    P[RT] = -0.45 * Math.sin(phi);
    P[LT] = 0.45 * Math.sin(phi);
    P[RT + 3] = 0.15 + 0.55 * Math.max(0, Math.sin(phi - 0.6));
    P[LT + 3] = 0.15 + 0.55 * Math.max(0, -Math.sin(phi - 0.6));
    const kick = bump((b % 4) - 3);
    P[LT] += (-1.55 - P[LT]) * kick;
    P[LT + 3] *= 1 - kick;
    P[OMEGA] *= 1 - 0.6 * kick;
    // The free arm waves to the crowd.
    P[LA] = -0.35;
    P[LA + 2] = 1.15 + 0.5 * Math.sin(phi);
    P[LA + 3] = 0.35;
    P[CX + 1] = 0.15 * Math.sin(phi);
    P[HX] = 0.06 * pulse(b, 5);
    P[HX + 1] = 0.45;
  }

  // A jump onto the pole every bar, spinning down it with the knees tucked.
  function fireman(P, b) {
    stand(P);
    const p = (b % 4) / 4;
    let h;
    if (p < 0.1) h = STAND_H - 0.14 * bump(p / 0.1);
    else if (p < 0.25) h = STAND_H + (1.62 - STAND_H) * smooth((p - 0.1) / 0.15);
    else if (p < 0.88) h = 1.62 + (1.1 - 1.62) * smooth((p - 0.25) / 0.63);
    else h = 1.1 + (STAND_H - 1.1) * smooth((p - 0.88) / 0.12) - 0.1 * bump((p - 0.88) / 0.12);
    const air = smooth((p - 0.08) / 0.1) * (1 - smooth((p - 0.84) / 0.1));
    P[H] = h;
    P[R] = 0.55 - 0.13 * air;
    P[OMEGA] = -0.8 + (-5.2 + 0.8) * air;
    P[ROLL] = -0.45 * air;
    P[RT] = -1.35 * air;
    P[LT] = -1.25 * air;
    P[RT + 2] = 0.12 * air;
    P[LT + 2] = -0.12 * air;
    P[RT + 3] = 1.75 * air + 0.25 * (1 - air) * pulse(p * 4, 4);
    P[LT + 3] = 1.85 * air;
    P[GRW] = 1;
    P[GRH] = h + 0.85;
    P[GLW] = air;
    P[GLH] = h + 0.5;
    // Off the pole, the free arm flourishes: "ta-da".
    P[LA] = -0.2;
    P[LA + 2] = 2.5;
    P[LA + 3] = 0.25;
    P[HX] = -0.25 * air;
    P[HX + 1] = 0.35 * (1 - air);
  }

  // The human flag: straight out from the pole, going round, legs scissoring.
  function flag(P, b) {
    stand(P);
    const phi = b * Math.PI;
    P[R] = 1.0;
    P[H] = 1.8 + 0.06 * Math.sin(phi);
    P[OMEGA] = LAP;
    P[ROLL] = Math.PI / 2;
    P[PITCH] = 0.08 * Math.sin(phi / 2);
    P[RA + 2] = -2.9;
    P[LA + 2] = 2.9;
    P[GRW] = 1;
    P[GRH] = P[H] - 0.26;
    P[GLW] = 1;
    P[GLH] = P[H] + 0.3;
    P[RT] = 0.3 * Math.sin(phi);
    P[LT] = -0.3 * Math.sin(phi);
    const star = bump((b % 4) - 3);
    P[RT + 2] = -0.65 * star;
    P[LT + 2] = 0.65 * star;
    P[HX] = -0.15;
    P[HX + 1] = 0.5;
  }

  // Upside down at the top of the pole, legs split like rotor blades.
  function helicopter(P, b) {
    stand(P);
    P[R] = 0.34;
    P[H] = 3.1 + 0.06 * Math.sin(b * Math.PI * 0.5);
    P[OMEGA] = -Math.PI * 1.6;
    P[PITCH] = Math.PI;
    P[RT + 2] = -1.35 + 0.08 * Math.sin(b * Math.PI * 2);
    P[LT + 2] = 1.35 - 0.08 * Math.sin(b * Math.PI * 2);
    P[RT + 3] = 0.05;
    P[LT + 3] = 0.05;
    P[GRW] = 1;
    P[GRH] = P[H] - 0.8;
    P[GLW] = 1;
    P[GLH] = P[H] - 0.42;
    P[HX] = 0.35;
  }

  // The finale spin: a flag going round so fast the money takes off.
  function tornado(P, b) {
    flag(P, b);
    P[R] = 0.98;
    P[H] = 2.2 + 0.25 * Math.sin((b * Math.PI) / 2);
    P[OMEGA] = -Math.PI * 4;
    P[PITCH] = 0.2 * Math.sin(b * Math.PI);
    P[RT] = 0.05;
    P[LT] = -0.05;
    P[RT + 2] = 0;
    P[LT + 2] = 0;
    P[GRH] = P[H] - 0.26;
    P[GLH] = P[H] + 0.3;
    P[HX] = -0.35;
  }

  // The show is over: off the pole, a deep bow, then a wave.
  function bow(P) {
    stand(P);
    goHome(P, HOME + 0.15);
    P[R] = 0.7;
    const k = smooth(bowT / 0.5) * (1 - smooth((bowT - 1.7) / 0.5));
    P[CX] = 0.95 * k;
    P[HX] = 0.35 * k;
    P[H] = STAND_H - 0.03 * k;
    P[RT] = 0.3 * k;
    P[RT + 3] = 0.15 * k;
    // Right hand to the chest, left arm out wide; then waving.
    P[RA] = -0.6 * k;
    P[RA + 1] = Math.PI / 2;
    P[RA + 2] = -0.35;
    P[RA + 3] = 1.9 * k;
    const wave = smooth((bowT - 1.9) / 0.4);
    P[LA] = 0.4 * k;
    P[LA + 2] = 1.1 + (1.5 + 0.25 * Math.sin(time * 9) - 1.1) * wave;
    P[LA + 3] = 0.3 + 0.4 * wave;
    P[HX + 1] = 0.3 * wave;
  }

  const MOVES = [idle, stroll, fireman, flag, helicopter, tornado, bow];

  // ---------------------------------------------------------------- applying a pose

  const qFk = new THREE.Quaternion();
  const qIk = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  const target = new THREE.Vector3();
  const d = new THREE.Vector3();
  const hint = new THREE.Vector3();
  const u = new THREE.Vector3();
  const w = new THREE.Vector3();
  const ax = new THREE.Vector3();
  const ay = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  // Puts a hand on the pole at height y with two-bone IK, blended over the
  // arm's own pose by weight. side is 1 for the left arm, -1 for the right.
  function grip(upper, fore, y, weight, side) {
    if (weight <= 0.001) return;
    upper.getWorldPosition(tmp);
    // Hold the pole on the side facing the shoulder.
    const len = Math.hypot(tmp.x, tmp.z) || 1;
    target.set((tmp.x / len) * (POLE_R + 0.035), STAGE_Y + y, (tmp.z / len) * (POLE_R + 0.035));
    chest.worldToLocal(target);
    d.copy(target).sub(upper.position);
    const dist = clamp(d.length(), 0.08, UPPER + LOWER - 0.002);
    d.normalize();
    const shoulder = Math.acos(clamp((UPPER * UPPER + dist * dist - LOWER * LOWER) / (2 * UPPER * dist), -1, 1));
    const bend = Math.PI - Math.acos(clamp((UPPER * UPPER + LOWER * LOWER - dist * dist) / (2 * UPPER * LOWER), -1, 1));
    // Elbows point out to the side and a little down and back.
    hint.set(side, -0.6, -0.6);
    hint.addScaledVector(d, -hint.dot(d)).normalize();
    u.copy(d).multiplyScalar(Math.cos(shoulder)).addScaledVector(hint, Math.sin(shoulder));
    w.copy(d).addScaledVector(u, -d.dot(u));
    if (w.lengthSq() < 1e-6) w.copy(hint).negate();
    w.normalize();
    ay.copy(u).negate();
    ax.crossVectors(ay, w);
    basis.makeBasis(ax, ay, w);
    qIk.setFromRotationMatrix(basis);
    qFk.copy(upper.quaternion);
    upper.quaternion.copy(qFk).slerp(qIk, weight);
    fore.rotation.x += (-bend - fore.rotation.x) * weight;
  }

  function apply(P) {
    const s = Math.sin(orbit);
    const c = Math.cos(orbit);
    root.position.set(s * P[R], STAGE_Y + P[H], c * P[R]);
    root.rotation.set(P[PITCH], orbit - Math.PI / 2 + P[YAW], P[ROLL]);
    chest.rotation.set(P[CX], P[CX + 1], P[CX + 2]);
    // A bill to the face knocks his head back and makes it wobble.
    const knock = Math.exp(-bonkT * 5);
    head.rotation.set(P[HX] - 0.7 * knock, P[HX + 1], P[HX + 2] + 0.35 * Math.sin(bonkT * 26) * knock);
    upperR.rotation.set(P[RA], P[RA + 1], P[RA + 2]);
    foreR.rotation.set(-P[RA + 3], 0, 0);
    upperL.rotation.set(P[LA], P[LA + 1], P[LA + 2]);
    foreL.rotation.set(-P[LA + 3], 0, 0);
    thighR.rotation.set(P[RT], P[RT + 1], P[RT + 2]);
    shinR.rotation.set(P[RT + 3], 0, 0);
    thighL.rotation.set(P[LT], P[LT + 1], P[LT + 2]);
    shinL.rotation.set(P[LT + 3], 0, 0);
    root.updateMatrixWorld(true);
    grip(upperR, foreR, P[GRH], P[GRW], -1);
    grip(upperL, foreL, P[GLH], P[GLW], 1);

    shadow.position.x = root.position.x;
    shadow.position.z = root.position.z;
    const lift = clamp((root.position.y - STAGE_Y - STAND_H) / 3, 0, 1);
    shadow.scale.setScalar(1 - 0.55 * lift);
  }

  return {
    get move() {
      return move;
    },

    // beats: the music's position in beats; m: the move (a hype tier, or
    // MOVE_BOW).
    update(dt, beats, m) {
      time += dt;
      bonkT += dt;
      if (m === MOVE_BOW) bowT += dt;
      else bowT = 0;
      if (m !== move) {
        from.set(pose);
        move = m;
        blend = 0;
      }
      blend = Math.min(1, blend + dt / BLEND);
      MOVES[move](next, beats);
      const k = smooth(blend);
      if (k >= 1) pose.set(next);
      else for (let i = 0; i < N; i++) pose[i] = from[i] + (next[i] - from[i]) * k;
      orbit += pose[OMEGA] * dt;
      apply(pose);
    },

    // Puts him at home in a move at once, without blending (title, restart).
    reset(m, beats = 0) {
      move = m;
      blend = 1;
      orbit = HOME;
      bowT = 0;
      bonkT = 10;
      MOVES[move](pose, beats);
      apply(pose);
    },

    bonk() {
      bonkT = 0;
    },

    // World position of his face, for aiming and popups.
    face(out) {
      head.updateWorldMatrix(true, false);
      return out.set(0, 0.17, 0.12).applyMatrix4(head.matrixWorld);
    },

    hipsY() {
      return root.position.y;
    },
  };
}
