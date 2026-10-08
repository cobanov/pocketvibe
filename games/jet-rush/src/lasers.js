// Lasers: for every lane a laser run uses, a pair of emitters slides in at
// both edges of the screen, shows a thin blinking aim line, then fires a beam
// across the whole corridor for a second. They hang on the screen while the
// corridor scrolls on, so a laser is a height to keep away from rather than
// something to fly past. Waves follow one another; level.js plans them and
// lays coins in the gaps. Fixed pools, one InstancedMesh per part.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAM_X, VIEW_HALF_W, box, canvasTexture, cyl } from './shared.js';

// Beam heights from the floor up. A beam in the floor or ceiling lane leaves
// no room under or over it.
export const LANES = [0.75, 2.1, 3.6, 5.1, 6.45];
export const BEAM_R = 0.2; // hit radius of a firing beam
const LANE_COUNT = LANES.length;
const MAX_WAVES = 3;

// Timing of a run, in seconds from its start: the first wave aims for
// WARN_FIRST, every wave fires for FIRE, and the next one fires REST after
// that, showing its aim lines WARN before it does.
const WARN_FIRST = 1.3;
const WARN = 1.1;
const FIRE = 1.0;
const REST = 0.85;
const SLIDE = 0.22; // emitters slide in and out this fast

export function fireStart(wave) {
  return WARN_FIRST + wave * (FIRE + REST);
}

export function fireEnd(wave) {
  return fireStart(wave) + FIRE;
}

function aimStart(wave) {
  return fireStart(wave) - (wave === 0 ? WARN_FIRST : WARN);
}

function emitterGeometry() {
  // Points right (+x), into the corridor; the right-hand one is turned round.
  return mergeGeometries([
    box(0.7, 0.56, 0.5, -0.12, 0, 0, 0x3a4256), // housing
    box(0.72, 0.1, 0.52, -0.12, 0.2, 0, 0xf2c230), // hazard stripes
    box(0.72, 0.1, 0.52, -0.12, -0.2, 0, 0xf2c230),
    cyl(0.16, 0.2, 8, 'x', 0.32, 0, 0, 0x2d3340), // barrel
    cyl(0.11, 0.06, 8, 'x', 0.44, 0, 0, 0xff4a3a), // lens
  ]);
}

// Soft red glow with a white core, across the beam. Drawn additively, so
// black is see-through.
function beamTexture() {
  return canvasTexture(8, 64, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.3, '#5a0804');
    g.addColorStop(0.43, '#ff3d24');
    g.addColorStop(0.5, '#ffffff');
    g.addColorStop(0.57, '#ff3d24');
    g.addColorStop(0.7, '#5a0804');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 64);
  });
}

// sideRoom: how much further than on the 3:2 screen the view reaches to each
// side. The emitters sit at the real edges, so the beams always cross the
// whole screen; what matters for the hero is only their height.
export function createLasers(scene, particles, sound, sideRoom = 0) {
  const halfW = VIEW_HALF_W + sideRoom;
  const leftX = CAM_X - halfW + 0.42;
  const rightX = CAM_X + halfW - 0.42;
  const lensL = leftX + 0.44;
  const lensR = rightX - 0.44;

  const emitters = new THREE.InstancedMesh(
    emitterGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a0805 }),
    LANE_COUNT * 2,
  );
  const beams = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: beamTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
    LANE_COUNT,
  );
  beams.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LANE_COUNT * 3), 3);
  for (const mesh of [emitters, beams]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }

  const masks = new Uint8Array(MAX_WAVES);
  const presence = new Float32Array(LANE_COUNT); // 0 out of sight .. 1 in place
  const aiming = new Uint8Array(LANE_COUNT);
  const firing = new Uint8Array(LANE_COUNT);
  const dummy = new THREE.Object3D();
  const dim = new THREE.Color(0.75, 0.75, 0.75);
  const bright = new THREE.Color(1, 1, 1);
  let waves = 0; // waves in the current run, 0 when there is none
  let t = 0;
  let fired = -1; // the last wave that opened fire
  let flicker = 0;
  let charge = -1; // how far the next wave's aim has come, 0..1
  let blink = 0; // the aim lines blink faster as the shot nears

  function draw() {
    let ne = 0;
    let nb = 0;
    for (let k = 0; k < LANE_COUNT; k++) {
      const p = presence[k];
      if (p <= 0) continue;
      const slide = (1 - p * p * (3 - 2 * p)) * 1.6;
      const y = LANES[k];
      dummy.scale.set(1, 1, 1);
      dummy.position.set(leftX - slide, y, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      emitters.setMatrixAt(ne++, dummy.matrix);
      dummy.position.set(rightX + slide, y, 0);
      dummy.rotation.set(0, Math.PI, 0);
      dummy.updateMatrix();
      emitters.setMatrixAt(ne++, dummy.matrix);

      let thick = 0;
      if (firing[k]) {
        const since = t - fireStart(fired);
        thick = since < 0.08 ? 1.3 : 0.62 + flicker * 0.18;
      } else if (aiming[k] && p > 0.95 && blink % 1 < 0.6) {
        thick = 0.15;
      }
      if (thick > 0) {
        dummy.position.set((lensL + lensR) / 2, y, 0.06);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(lensR - lensL, thick, 1);
        dummy.updateMatrix();
        beams.setMatrixAt(nb, dummy.matrix);
        beams.setColorAt(nb, firing[k] ? bright : dim);
        nb++;
      }
    }
    emitters.count = ne;
    beams.count = nb;
    emitters.instanceMatrix.needsUpdate = true;
    beams.instanceMatrix.needsUpdate = true;
    beams.instanceColor.needsUpdate = true;
  }

  const lasers = {
    // The hum the game plays for the lasers: low and rising while they aim,
    // full while they fire.
    humVolume: 0,
    humRate: 1,

    // Starts a run of `n` waves; plan[i] is a lane bit mask (bit 0 = floor).
    start(plan, n) {
      waves = Math.min(n, MAX_WAVES);
      for (let i = 0; i < waves; i++) masks[i] = plan[i];
      t = 0;
      fired = -1;
    },

    // The run is over (the hero is down): a wave already firing finishes,
    // nothing new aims or fires.
    cancel() {
      waves = fired >= 0 && t < fireEnd(fired) ? fired + 1 : 0;
    },

    clear() {
      waves = 0;
      presence.fill(0);
      aiming.fill(0);
      firing.fill(0);
      lasers.humVolume = 0;
      draw();
    },

    update(dt) {
      if (waves === 0 && lasers.humVolume === 0) {
        let any = false;
        for (let k = 0; k < LANE_COUNT; k++) if (presence[k] > 0) any = true;
        if (!any) return;
      }
      t += dt;
      flicker = Math.random();
      blink += dt * (5 + 11 * Math.max(0, charge));
      charge = -1;
      let hot = false;
      for (let i = 0; i < waves; i++) {
        if (t >= fireStart(i) && i > fired) {
          fired = i;
          sound.play('laser_fire', { volume: 0.8, rate: 0.97 + Math.random() * 0.06 });
          for (let k = 0; k < LANE_COUNT; k++) {
            if (!(masks[i] & (1 << k))) continue;
            particles.burst(lensL, LANES[k], 4, 3, 0.3, 0.16, 0xffffff, 0xff3d24, 0);
            particles.burst(lensR, LANES[k], 4, 3, 0.3, 0.16, 0xffffff, 0xff3d24, 0);
          }
        }
        if (t >= fireStart(i) && t < fireEnd(i)) hot = true;
        else if (t >= aimStart(i) && t < fireStart(i)) {
          charge = Math.max(charge, (t - aimStart(i)) / (fireStart(i) - aimStart(i)));
        }
      }
      for (let k = 0; k < LANE_COUNT; k++) {
        const bit = 1 << k;
        let want = false;
        aiming[k] = 0;
        firing[k] = 0;
        for (let i = 0; i < waves; i++) {
          if (!(masks[i] & bit)) continue;
          if (t >= aimStart(i) - SLIDE && t < fireEnd(i) + 0.05) want = true;
          if (t >= fireStart(i) && t < fireEnd(i)) firing[k] = 1;
          else if (t >= aimStart(i) && t < fireStart(i)) aiming[k] = 1;
        }
        const step = dt / SLIDE;
        presence[k] = want ? Math.min(1, presence[k] + step) : Math.max(0, presence[k] - step);
        // A spark spits from the lenses now and then while firing.
        if (firing[k] && Math.random() < dt * 10) {
          const left = Math.random() < 0.5;
          particles.emit(left ? lensL : lensR, LANES[k], 0.3, (left ? 1 : -1) * (1 + Math.random() * 3), (Math.random() - 0.5) * 4, 0.2, 0.12, 0xffffff, 0xff5a3a, 6);
        }
      }
      if (waves > 0 && t > fireEnd(waves - 1)) waves = 0;
      lasers.humVolume = hot ? 0.55 : charge >= 0 ? 0.1 + 0.25 * charge : 0;
      lasers.humRate = hot ? 1 : charge >= 0 ? 0.5 + 0.45 * charge : 1;
      draw();
    },

    // True if a firing beam touches the hero.
    hit(hero) {
      for (let k = 0; k < LANE_COUNT; k++) {
        if (firing[k] && hero.hitBy(lensL, LANES[k], lensR, LANES[k], BEAM_R)) return true;
      }
      return false;
    },
  };
  return lasers;
}
