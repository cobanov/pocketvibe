// Example game: collect as many coins as you can in 60 seconds.
// Replace this file with your own game; keep using handheld.js.

import * as THREE from 'three';
import { createHandheld } from './handheld.js';

const SKY = 0x87b5e0;
const ARENA = 24; // half size of the playing field
const SPEED = 9;
const ROUND_TIME = 60;
const COIN_COUNT = 30;

const hh = createHandheld({ clearColor: SKY });
const { renderer, input, hud } = hh;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 25, 60);

const camera = new THREE.PerspectiveCamera(60, hh.width / hh.height, 0.1, 70);
hh.fitCamera(camera); // the 60° view stays whole on every screen shape

// One hemisphere light and one directional light, no shadows.
scene.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(5, 10, 3);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(ARENA * 2 + 10, ARENA * 2 + 10),
  new THREE.MeshLambertMaterial({ color: 0x5c9e4a }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0xe8553e }),
);
scene.add(player);

// All coins are one InstancedMesh: one draw call however many coins there are.
const coinGeometry = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 12);
coinGeometry.rotateX(Math.PI / 2); // stand the coin up
const coins = new THREE.InstancedMesh(
  coinGeometry,
  new THREE.MeshLambertMaterial({ color: 0xffd23f }),
  COIN_COUNT,
);
scene.add(coins);

const coinPositions = Array.from({ length: COIN_COUNT }, () => new THREE.Vector3());
const dummy = new THREE.Object3D(); // reused to build instance matrices

function placeCoin(i) {
  coinPositions[i].set((Math.random() * 2 - 1) * ARENA, 0.8, (Math.random() * 2 - 1) * ARENA);
}

hud.innerHTML = `
  <div class="hud-row"><span id="score"></span><span id="time"></span></div>
  <div id="message"></div>`;
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const messageEl = document.getElementById('message');

let score = 0;
let timeLeft = 0;
let over = false;
let spin = 0;
let best = hh.load('best', 0);
let shownScore = -1;
let shownTime = -1;

function restart() {
  score = 0;
  timeLeft = ROUND_TIME;
  over = false;
  player.position.set(0, 0.5, 0);
  for (let i = 0; i < COIN_COUNT; i++) placeCoin(i);
  messageEl.textContent = '';
}

function finish() {
  over = true;
  if (score > best) {
    best = score;
    hh.save('best', best);
  }
  messageEl.innerHTML = `Time!<br>Score ${score} · Best ${best}<br>Press A to play again`;
}

restart();

hh.run((dt) => {
  if (over) {
    if (input.pressed('A') || input.pressed('START')) restart();
  } else {
    player.position.x = THREE.MathUtils.clamp(player.position.x + input.dpad.x * SPEED * dt, -ARENA, ARENA);
    player.position.z = THREE.MathUtils.clamp(player.position.z + input.dpad.y * SPEED * dt, -ARENA, ARENA);
    timeLeft -= dt;
    if (timeLeft <= 0) {
      timeLeft = 0;
      finish();
    }
  }

  spin += dt * 3;
  for (let i = 0; i < COIN_COUNT; i++) {
    if (!over && player.position.distanceToSquared(coinPositions[i]) < 1.2) {
      score++;
      placeCoin(i);
    }
    dummy.position.copy(coinPositions[i]);
    dummy.rotation.y = spin + i;
    dummy.updateMatrix();
    coins.setMatrixAt(i, dummy.matrix);
  }
  coins.instanceMatrix.needsUpdate = true;

  camera.position.set(player.position.x, 12, player.position.z + 10);
  camera.lookAt(player.position);

  // Touch the DOM only when a value changes, not every frame.
  if (score !== shownScore) {
    shownScore = score;
    scoreEl.textContent = `Score ${score}`;
  }
  const seconds = Math.ceil(timeLeft);
  if (seconds !== shownTime) {
    shownTime = seconds;
    timeEl.textContent = `${seconds}s`;
  }

  renderer.render(scene, camera);
});
