// Stella, the dancer: a low-poly pole artist in a long-sleeved sequined
// unitard, with a ponytail that swings, built from a dozen boxes on a small
// skeleton. She dances her own routine to the music: every move is a
// function of the beat that fills a pose (where she is around the pole and
// every joint's angle), and switching moves blends from the last pose to the
// new one. Hands that hold the pole are placed on it with two-bone IK, so
// the grip stays put whatever the body does. When a tip comes in she looks
// at you and waves; when it rains money she breaks into her showpiece spin.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BEAT, POLE_R, STAGE_Y, angleDiff, bump, clamp, paint, smooth, taperBox } from './shared.js';

const SUIT = 0x1ec8c8;
const SUIT_DARK = 0x0d7f8f;
const GOLD = 0xffc83d;
const SKIN = 0xe9b08a;
const SKIN_DARK = 0xd09070;
const HAIR = 0x3a2216;
const HAIR_DARK = 0x24140c;
const LIPS = 0xd2557a;
const SCRUNCHIE = 0xff5fa2;

const UPPER = 0.27; // shoulder to elbow
const LOWER = 0.27; // elbow to the middle of the hand
const STAND_H = 0.95; // hip height when standing straight
const LAP = -(Math.PI * 2) / (8 * BEAT); // one walk around the pole every two bars
const TAIL = [0.16, 0.16, 0.15]; // ponytail segments
const GRAVITY = -9.8;

// Pose layout: one Float32Array per pose.
const R = 0; // distance of the hips from the pole
const H = 1; // hip height above the stage
const YAW = 2; // turn on top of facing along the orbit
const PITCH = 3;
const ROLL = 4;
const OMEGA = 5; // how fast she goes round the pole (rad/s)
const CX = 6; // chest x, y, z
const HX = 9; // head x, y, z
const RA = 12; // right upper arm x, y (twist), z; then 15 = elbow bend
const LA = 16; // left upper arm; 19 = elbow
const RT = 20; // right thigh x, y, z; then 23 = knee
const LT = 24; // left thigh; 27 = knee
const GRW = 28; // right hand on the pole: weight, height above the stage
const GRH = 29;
const GLW = 30;
const GLH = 31;
const N = 32;

// Her routine, in bars; it loops. The showpiece cuts in when it rains money.
const ROUTINE = [
  ['walk', 2],
  ['fireman', 2],
  ['pirouette', 1],
  ['walk', 1],
  ['climb', 1],
  ['invert', 2],
  ['spiral', 2],
  ['pose', 1],
  ['chair', 2],
  ['flag', 2],
  ['pirouette', 1],
  ['pose', 1],
];

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

function box(w, h, d, x, y, z, hex, bottomHex) {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex, bottomHex);
}

function buildHead() {
  const skull = paint(new THREE.IcosahedronGeometry(0.115, 1), SKIN);
  skull.scale(1, 1.13, 1.05);
  skull.translate(0, 0.165, 0);
  const neck = paint(new THREE.CylinderGeometry(0.045, 0.052, 0.1, 6).translate(0, 0.04, 0), SKIN_DARK);
  // Hair: a cap over the top and back, locks at the sides, a side-swept
  // fringe and a scrunchie where the ponytail starts.
  const top = box(0.245, 0.075, 0.25, 0, 0.27, -0.012, HAIR);
  const back = box(0.24, 0.21, 0.085, 0, 0.175, -0.085, HAIR, HAIR_DARK);
  const lockL = box(0.032, 0.22, 0.12, 0.117, 0.15, -0.02, HAIR, HAIR_DARK);
  const lockR = box(0.032, 0.22, 0.12, -0.117, 0.15, -0.02, HAIR, HAIR_DARK);
  const fringe = paint(new THREE.BoxGeometry(0.2, 0.05, 0.05).rotateZ(0.18).translate(0.02, 0.252, 0.1), HAIR);
  const scrunchie = paint(new THREE.CylinderGeometry(0.042, 0.042, 0.045, 8).rotateX(Math.PI / 2).translate(0, 0.245, -0.13), SCRUNCHIE);
  const eyeL = box(0.03, 0.034, 0.01, 0.042, 0.176, 0.118, 0x1a1010);
  const eyeR = box(0.03, 0.034, 0.01, -0.042, 0.176, 0.118, 0x1a1010);
  const cheekL = box(0.03, 0.016, 0.008, 0.06, 0.14, 0.113, 0xf08a9a);
  const cheekR = box(0.03, 0.016, 0.008, -0.06, 0.14, 0.113, 0xf08a9a);
  const lashL = paint(new THREE.BoxGeometry(0.036, 0.008, 0.012).rotateZ(0.2).translate(0.046, 0.194, 0.119), 0x1a1010);
  const lashR = paint(new THREE.BoxGeometry(0.036, 0.008, 0.012).rotateZ(-0.2).translate(-0.046, 0.194, 0.119), 0x1a1010);
  const browL = paint(new THREE.BoxGeometry(0.044, 0.007, 0.01).rotateZ(0.12).translate(0.045, 0.214, 0.117), HAIR);
  const browR = paint(new THREE.BoxGeometry(0.044, 0.007, 0.01).rotateZ(-0.12).translate(-0.045, 0.214, 0.117), HAIR);
  const nose = box(0.018, 0.03, 0.022, 0, 0.148, 0.12, SKIN_DARK);
  const lips = box(0.05, 0.018, 0.02, 0, 0.112, 0.114, LIPS);
  const earL = box(0.018, 0.03, 0.018, 0.12, 0.13, 0, GOLD);
  const earR = box(0.018, 0.03, 0.018, -0.12, 0.13, 0, GOLD);
  return merge([skull, neck, top, back, lockL, lockR, fringe, scrunchie, eyeL, eyeR, cheekL, cheekR, lashL, lashR, browL, browR, nose, lips, earL, earR]);
}

function buildChest() {
  const torso = paint(taperBox(0.22, 0.46, 0.17, 1.45, 1.1).translate(0, 0.23, 0), SUIT, SUIT_DARK);
  // A band of gold sequins across the body and a gold collar.
  const sash = paint(new THREE.BoxGeometry(0.05, 0.5, 0.19).rotateZ(-0.6).translate(0, 0.25, 0.004), GOLD);
  const collar = paint(new THREE.CylinderGeometry(0.065, 0.08, 0.04, 8).translate(0, 0.46, 0), GOLD);
  const shoulderL = box(0.1, 0.09, 0.15, 0.17, 0.41, 0, SUIT);
  const shoulderR = box(0.1, 0.09, 0.15, -0.17, 0.41, 0, SUIT);
  return merge([torso, sash, collar, shoulderL, shoulderR]);
}

function buildPelvis() {
  const hips = paint(taperBox(0.29, 0.18, 0.18, 0.8, 0.95).translate(0, -0.03, 0), SUIT_DARK, SUIT);
  const belt = box(0.24, 0.035, 0.175, 0, 0.065, 0, GOLD);
  return merge([hips, belt]);
}

function buildUpperArm() {
  return merge([paint(taperBox(0.07, UPPER, 0.075, 1.2).translate(0, -UPPER / 2, 0), SUIT)]);
}

function buildForearm() {
  const arm = paint(taperBox(0.06, 0.21, 0.065, 1.15).translate(0, -0.105, 0), SUIT);
  const cuff = box(0.07, 0.025, 0.075, 0, -0.205, 0, GOLD);
  const hand = box(0.058, 0.09, 0.045, 0, -LOWER + 0.005, 0, SKIN);
  return merge([arm, cuff, hand]);
}

function buildThigh() {
  return merge([paint(taperBox(0.1, 0.43, 0.11, 1.3).translate(0, -0.215, 0), SUIT)]);
}

function buildShin() {
  const shin = paint(taperBox(0.075, 0.41, 0.085, 1.3).translate(0, -0.205, 0), SUIT);
  const foot = box(0.062, 0.05, 0.17, 0, -0.43, 0.04, SKIN, SKIN_DARK);
  return merge([shin, foot]);
}

function buildTail(len, w) {
  return merge([paint(taperBox(w, len, w * 1.1, 1.4).translate(0, -len / 2, 0), HAIR, HAIR_DARK)]);
}

export function createDancer(scene, camera) {
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
  const chest = mesh(buildChest(), root, 0, 0.07, 0);
  const head = mesh(buildHead(), chest, 0, 0.47, 0);
  const upperArm = buildUpperArm();
  const forearm = buildForearm();
  const upperR = mesh(upperArm, chest, -0.2, 0.41, 0);
  const foreR = mesh(forearm, upperR, 0, -UPPER, 0);
  const upperL = mesh(upperArm, chest, 0.2, 0.41, 0);
  const foreL = mesh(forearm, upperL, 0, -UPPER, 0);
  // Upper arms twist about their own length first, then swing forward and
  // out: a bent elbow can then point anywhere.
  upperR.rotation.order = 'ZXY';
  upperL.rotation.order = 'ZXY';
  const thigh = buildThigh();
  const shin = buildShin();
  const thighR = mesh(thigh, root, -0.085, -0.07, 0);
  const shinR = mesh(shin, thighR, 0, -0.43, 0);
  const thighL = mesh(thigh, root, 0.085, -0.07, 0);
  const shinL = mesh(shin, thighL, 0, -0.43, 0);

  // The ponytail hangs in world space, two segments simulated as a chain.
  const tails = [buildTail(TAIL[0], 0.062), buildTail(TAIL[1], 0.052), buildTail(TAIL[2], 0.038)].map((g) => mesh(g, scene));
  const anchorLocal = new THREE.Vector3(0, 0.24, -0.15);
  const headCentre = new THREE.Vector3(0, 0.17, 0);
  const tailPos = TAIL.map(() => new THREE.Vector3()).concat(new THREE.Vector3());
  const tailOld = tailPos.map(() => new THREE.Vector3());

  // A soft dark disc on the stage under her: the only shadow in the club.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.position.y = STAGE_Y + 0.006;
  scene.add(shadow);

  const pose = new Float32Array(N);
  const from = new Float32Array(N); // the pose when the last move change began
  const next = new Float32Array(N);
  let move = 'walk';
  let moveStart = 0; // in beats
  let moveEnd = 8;
  let step = -1; // index into ROUTINE
  let blend = 1;
  let blendTime = 0.7;
  let orbit = Math.PI / 2;
  let waveT = 9; // seconds since she started waving thanks
  let showpiece = false; // a showpiece is wanted
  let afterShow = false; // the pose after the showpiece is playing

  // ---------------------------------------------------------------- moves
  // Each fills P for lb, the beats since the move began.

  function stand(P) {
    P.fill(0);
    P[R] = 0.5;
    P[H] = STAND_H;
    P[RA + 2] = -0.15;
    P[LA + 2] = 0.15;
    P[RA + 3] = 0.2;
    P[LA + 3] = 0.2;
  }

  // Walks round the pole holding it, the free arm out, a high kick every bar.
  function walk(P, lb) {
    stand(P);
    const phi = lb * Math.PI;
    P[R] = 0.6;
    P[H] = STAND_H - 0.02 + 0.02 * Math.abs(Math.sin(phi));
    P[OMEGA] = LAP;
    P[ROLL] = -0.12;
    P[GRW] = 1;
    P[GRH] = 1.5;
    P[RT] = -0.4 * Math.sin(phi);
    P[LT] = 0.4 * Math.sin(phi);
    P[RT + 3] = 0.1 + 0.45 * Math.max(0, Math.sin(phi - 0.6));
    P[LT + 3] = 0.1 + 0.45 * Math.max(0, -Math.sin(phi - 0.6));
    const kick = bump((lb % 4) - 3);
    P[LT] += (-1.3 - P[LT]) * kick;
    P[LT + 3] *= 1 - kick;
    P[OMEGA] *= 1 - 0.6 * kick;
    P[LA] = -0.25;
    P[LA + 2] = 1.35 + 0.15 * Math.sin(phi);
    P[LA + 3] = 0.25;
    P[CX + 1] = 0.12 * Math.sin(phi);
    P[HX] = -0.05;
    P[HX + 1] = 0.35;
  }

  // A jump onto the pole every bar, spinning down it with the knees tucked
  // (fireman) or sitting upright (chair).
  function spinDown(P, lb, chair) {
    stand(P);
    const p = (lb % 4) / 4;
    let h;
    if (p < 0.1) h = STAND_H - 0.12 * bump(p / 0.1);
    else if (p < 0.25) h = STAND_H + (1.55 - STAND_H) * smooth((p - 0.1) / 0.15);
    else if (p < 0.88) h = 1.55 + (1.08 - 1.55) * smooth((p - 0.25) / 0.63);
    else h = 1.08 + (STAND_H - 1.08) * smooth((p - 0.88) / 0.12) - 0.08 * bump((p - 0.88) / 0.12);
    const air = smooth((p - 0.08) / 0.1) * (1 - smooth((p - 0.84) / 0.1));
    P[H] = h;
    P[R] = 0.52 - 0.12 * air;
    P[OMEGA] = -0.8 + ((chair ? -4.2 : -5) + 0.8) * air;
    P[GRW] = 1;
    P[GRH] = h + 0.8;
    P[GLW] = air;
    P[GLH] = h + (chair ? 0.3 : 0.45);
    if (chair) {
      P[ROLL] = -0.25 * air;
      P[RT] = -1.45 * air;
      P[LT] = -1.45 * air;
      P[RT + 3] = 1.5 * air;
      P[LT + 3] = 1.5 * air;
      P[HX] = -0.2 * air;
    } else {
      P[ROLL] = -0.42 * air;
      P[RT] = -1.3 * air;
      P[LT] = -1.2 * air;
      P[RT + 2] = 0.1 * air;
      P[LT + 2] = -0.1 * air;
      P[RT + 3] = 1.75 * air;
      P[LT + 3] = 1.85 * air;
      P[HX] = -0.25 * air;
    }
    // Off the pole the free arm opens out.
    P[LA] = -0.15;
    P[LA + 2] = 1.9 + 0.5 * (1 - air);
    P[LA + 3] = 0.3;
    P[HX + 1] = 0.3 * (1 - air);
  }

  // Away from the pole: a plié, two turns on one leg with the arms rounded
  // overhead, and arms up to finish.
  function pirouette(P, lb) {
    stand(P);
    P[R] = 0.95;
    P[OMEGA] = 0;
    const prep = bump(lb / 0.75);
    const turn = smooth((lb - 0.75) / 2.75);
    const up = smooth((lb - 0.5) / 0.4);
    P[YAW] = turn * Math.PI * 4;
    P[H] = STAND_H + 0.03 * up - 0.08 * prep;
    P[RT + 3] = 0.3 * prep;
    P[LT + 3] = 0.3 * prep + 2.0 * up * (1 - smooth((lb - 3.4) / 0.4));
    P[LT] = -0.9 * up * (1 - smooth((lb - 3.4) / 0.4));
    P[LT + 2] = 0.55 * up;
    P[RA + 2] = -1.1 - 1.65 * up;
    P[LA + 2] = 1.1 + 1.65 * up;
    P[RA + 3] = 0.5 * up;
    P[LA + 3] = 0.5 * up;
    P[HX] = -0.1;
  }

  // Climbs the pole hand over hand, knees drawing up on every beat.
  function climb(P, lb) {
    stand(P);
    const k = (Math.floor(lb) + smooth(lb - Math.floor(lb))) / 4;
    const h = STAND_H + (2.35 - STAND_H) * k;
    const odd = Math.floor(lb) % 2;
    const draw = bump(lb - Math.floor(lb));
    P[R] = 0.34;
    P[H] = h;
    P[YAW] = -Math.PI / 2; // facing the pole
    P[GRW] = 1;
    P[GLW] = 1;
    P[GRH] = h + 0.72 + (odd ? 0.12 : 0);
    P[GLH] = h + 0.72 + (odd ? 0 : 0.12);
    P[RT] = -0.6 - 0.5 * draw;
    P[LT] = -0.6 - 0.5 * draw;
    P[RT + 2] = -0.25;
    P[LT + 2] = 0.25;
    P[RT + 3] = 1.0 + 0.6 * draw;
    P[LT + 3] = 1.0 + 0.6 * draw;
    P[HX] = -0.25;
  }

  // Upside down near the top: a straddle, then the splits, slowly turning.
  function invert(P, lb) {
    stand(P);
    P[R] = 0.3;
    P[H] = 2.8 + 0.05 * Math.sin(lb * Math.PI * 0.5);
    P[OMEGA] = -1.4;
    P[PITCH] = Math.PI;
    const split = smooth((lb - 3.6) / 0.8) * (1 - smooth((lb - 7.2) / 0.6));
    const open = 1.1 + 0.12 * Math.sin(lb * Math.PI * 0.5);
    P[RT + 2] = -open * (1 - split);
    P[LT + 2] = open * (1 - split);
    P[RT] = -1.25 * split;
    P[LT] = 1.25 * split;
    P[RT + 3] = 0.03;
    P[LT + 3] = 0.03;
    P[GRW] = 1;
    P[GRH] = P[H] - 0.72;
    P[GLW] = 1;
    P[GLH] = P[H] - 0.38;
    P[HX] = 0.25;
  }

  // Spirals down hooked on by one knee, leaning out, the other leg and arm
  // reaching away.
  function spiral(P, lb) {
    stand(P);
    const h = 2.3 + (1.05 - 2.3) * smooth(lb / 8);
    P[R] = 0.36;
    P[H] = h;
    P[OMEGA] = -2.2;
    P[ROLL] = -0.55;
    P[GRW] = 1;
    P[GRH] = h + 0.72;
    P[RT] = -1.1;
    P[RT + 2] = -0.2;
    P[RT + 3] = 1.7;
    P[LT] = 0.5;
    P[LT + 3] = 0.3;
    P[LA] = 0.5;
    P[LA + 2] = 1.6 + 0.15 * Math.sin(lb * Math.PI * 0.5);
    P[LA + 3] = 0.15;
    P[HX] = -0.3;
  }

  // On the floor by the pole: lean out on one arm, sweep the other up, one
  // foot pointed out to the side.
  function posePole(P, lb) {
    stand(P);
    const sweep = smooth(lb / 3);
    P[R] = 0.65;
    P[OMEGA] = -0.3;
    P[ROLL] = -0.35 * smooth(lb / 1.5);
    P[GRW] = 1;
    P[GRH] = 1.62;
    P[LA] = -0.1;
    P[LA + 2] = 0.4 + 2.2 * sweep;
    P[LA + 3] = 0.3;
    P[LT + 2] = 0.45 * smooth(lb / 1.2);
    P[LT + 3] = 0.05;
    P[HX] = -0.25 * sweep;
    P[HX + 1] = 0.3;
  }

  // The human flag: straight out from the pole, going round, legs scissoring.
  function flag(P, lb) {
    stand(P);
    const phi = lb * Math.PI * 0.5;
    P[R] = 0.95;
    P[H] = 1.75 + 0.05 * Math.sin(phi);
    P[OMEGA] = LAP;
    P[ROLL] = Math.PI / 2;
    P[PITCH] = 0.08 * Math.sin(phi);
    P[RA + 2] = -2.9;
    P[LA + 2] = 2.9;
    P[GRW] = 1;
    P[GRH] = P[H] - 0.24;
    P[GLW] = 1;
    P[GLH] = P[H] + 0.28;
    P[RT] = 0.3 * Math.sin(phi);
    P[LT] = -0.3 * Math.sin(phi);
    P[HX] = -0.15;
    P[HX + 1] = 0.5;
  }

  // The showpiece: a flag spinning so fast the money takes off.
  function tornado(P, lb) {
    flag(P, lb);
    P[H] = 2.1 + 0.2 * Math.sin((lb * Math.PI) / 2);
    P[OMEGA] = -Math.PI * 4;
    P[PITCH] = 0.18 * Math.sin(lb * Math.PI);
    P[RT] = 0.05;
    P[LT] = -0.05;
    P[GRH] = P[H] - 0.24;
    P[GLH] = P[H] + 0.28;
    P[HX] = -0.35;
  }

  const MOVES = {
    walk: { fn: walk, blend: 0.7 },
    fireman: { fn: (P, lb) => spinDown(P, lb, false), blend: 0.6 },
    chair: { fn: (P, lb) => spinDown(P, lb, true), blend: 0.6 },
    pirouette: { fn: pirouette, blend: 0.6 },
    climb: { fn: climb, blend: 0.7 },
    invert: { fn: invert, blend: 1.0 },
    spiral: { fn: spiral, blend: 0.9 },
    pose: { fn: posePole, blend: 0.8 },
    flag: { fn: flag, blend: 0.9 },
    tornado: { fn: tornado, blend: 0.8 },
  };

  function begin(name, start, beats) {
    from.set(pose);
    from[YAW] = angleDiff(from[YAW], 0); // never unwind a pirouette's turns
    move = name;
    moveStart = start;
    moveEnd = start + beats;
    blend = 0;
    blendTime = MOVES[name].blend;
  }

  // The routine moves on at the end of each move; a wanted showpiece starts
  // on the next beat and runs to the end of the following bar.
  function choreograph(beats) {
    const beat = Math.floor(beats);
    if (showpiece && move !== 'tornado' && !afterShow && move !== 'climb' && beat > moveStart) {
      showpiece = false;
      begin('tornado', beat, (Math.floor(beat / 4) + 2) * 4 - beat);
      return;
    }
    if (beats < moveEnd) return;
    if (move === 'tornado') {
      afterShow = true;
      begin('pose', moveEnd, 4);
      return;
    }
    afterShow = false;
    step = (step + 1) % ROUTINE.length;
    const [name, bars] = ROUTINE[step];
    begin(name, moveEnd, bars * 4);
  }

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
  const down = new THREE.Vector3(0, -1, 0);

  // Puts a hand on the pole at height y with two-bone IK, blended over the
  // arm's own pose by weight. side is 1 for the left arm, -1 for the right.
  function grip(upper, fore, y, weight, side) {
    if (weight <= 0.001) return;
    upper.getWorldPosition(tmp);
    // Hold the pole on the side facing the shoulder.
    const len = Math.hypot(tmp.x, tmp.z) || 1;
    target.set((tmp.x / len) * (POLE_R + 0.03), STAGE_Y + y, (tmp.z / len) * (POLE_R + 0.03));
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
    const bodyYaw = orbit - Math.PI / 2 + P[YAW];
    root.rotation.set(P[PITCH], bodyYaw, P[ROLL]);
    chest.rotation.set(P[CX], P[CX + 1], P[CX + 2]);

    // She keeps an eye on the crowd, and looks right at you to say thanks.
    // Only while upright, and as far as a neck turns.
    const upright = Math.max(0, Math.cos(P[PITCH]) * Math.cos(P[ROLL]));
    const thanks = smooth(waveT / 0.25) * (1 - smooth((waveT - 1.1) / 0.35));
    const toCam = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
    const look = clamp(angleDiff(toCam, bodyYaw) - P[CX + 1], -1.1, 1.1);
    const lookW = (0.35 + 0.65 * thanks) * upright;
    head.rotation.set(P[HX] * (1 - thanks * upright), P[HX + 1] + (look - P[HX + 1]) * lookW, P[HX + 2]);

    upperR.rotation.set(P[RA], P[RA + 1], P[RA + 2]);
    foreR.rotation.set(-P[RA + 3], 0, 0);
    // The wave: the free left arm up, the hand swaying.
    const wave = thanks * upright * (1 - P[GLW]);
    upperL.rotation.set(
      P[LA] + (-0.3 - P[LA]) * wave,
      P[LA + 1] * (1 - wave),
      P[LA + 2] + (2.45 + 0.3 * Math.sin(waveT * 15) - P[LA + 2]) * wave,
    );
    foreL.rotation.set(-(P[LA + 3] + (0.55 - P[LA + 3]) * wave), 0, 0);
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

  // ---------------------------------------------------------------- ponytail

  function tailAnchor(out) {
    head.updateWorldMatrix(true, false);
    return out.copy(anchorLocal).applyMatrix4(head.matrixWorld);
  }

  function resetTail() {
    tailAnchor(tailPos[0]);
    for (let i = 1; i < tailPos.length; i++) tailPos[i].copy(tailPos[i - 1]).addScaledVector(down, TAIL[i - 1]);
    for (let i = 0; i < tailPos.length; i++) tailOld[i].copy(tailPos[i]);
  }

  // Verlet steps: the points swing under gravity, stay their length apart
  // and are pushed out of her head.
  function simulateTail(dt) {
    tailAnchor(tailPos[0]);
    head.updateWorldMatrix(true, false);
    const centre = tmp.copy(headCentre).applyMatrix4(head.matrixWorld);
    const steps = Math.min(4, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 1; i < tailPos.length; i++) {
        const p = tailPos[i];
        const o = tailOld[i];
        const vx = (p.x - o.x) * 0.97;
        const vy = (p.y - o.y) * 0.97;
        const vz = (p.z - o.z) * 0.97;
        o.copy(p);
        p.x += vx;
        p.y += vy + GRAVITY * h * h;
        p.z += vz;
      }
      for (let i = 1; i < tailPos.length; i++) {
        const a = tailPos[i - 1];
        const p = tailPos[i];
        d.subVectors(p, a);
        const len = d.length() || 1;
        p.copy(a).addScaledVector(d, TAIL[i - 1] / len);
        d.subVectors(p, centre);
        const r = d.length();
        if (r < 0.16 && r > 1e-4) p.copy(centre).addScaledVector(d, 0.16 / r);
      }
    }
    for (let i = 0; i < tails.length; i++) {
      const t = tails[i];
      t.position.copy(tailPos[i]);
      d.subVectors(tailPos[i + 1], tailPos[i]).normalize();
      t.quaternion.setFromUnitVectors(down, d);
    }
  }

  return {
    get move() {
      return move;
    },

    get spinning() {
      return move === 'tornado';
    },

    // beats: the music's position in beats.
    update(dt, beats) {
      waveT += dt;
      choreograph(beats);
      blend = Math.min(1, blend + dt / blendTime);
      MOVES[move].fn(next, Math.max(0, beats - moveStart));
      const k = smooth(blend);
      if (k >= 1) pose.set(next);
      else for (let i = 0; i < N; i++) pose[i] = from[i] + (next[i] - from[i]) * k;
      orbit += pose[OMEGA] * dt;
      apply(pose);
      simulateTail(dt);
    },

    // Starts the routine from the top at this beat (rounded down to a bar).
    reset(beats) {
      step = 0;
      move = ROUTINE[0][0];
      moveStart = Math.floor(beats / 4) * 4;
      moveEnd = moveStart + ROUTINE[0][1] * 4;
      blend = 1;
      orbit = Math.PI / 2;
      showpiece = false;
      afterShow = false;
      MOVES[move].fn(pose, Math.max(0, beats - moveStart));
      apply(pose);
      resetTail();
    },

    // The music's clock jumped (it started): blend over the jump.
    retime() {
      from.set(pose);
      from[YAW] = angleDiff(from[YAW], 0);
      blend = 0;
      blendTime = 0.5;
    },

    // A tip: she looks at you and waves (unless she is still waving).
    thanks() {
      if (waveT > 1.6) waveT = 0;
    },

    // It is raining money: the showpiece, as soon as the routine allows.
    showpiece() {
      if (move !== 'tornado' && !afterShow) showpiece = true;
    },

    // World position of her face, for popups.
    face(out) {
      head.updateWorldMatrix(true, false);
      return out.set(0, 0.17, 0.11).applyMatrix4(head.matrixWorld);
    },

    hipsY() {
      return root.position.y;
    },
  };
}
