// The Pole Star Lounge: a round stage with a chrome pole, velvet curtains, a
// neon sign, a disco ball throwing spots over the walls, light beams from the
// truss, bulbs round the stage that chase on the beat and a front row of
// silhouettes who bob along and cheer. Static parts are merged into one mesh
// with vertex colours; everything that moves is one mesh or InstancedMesh per
// kind.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { POLE_R, POLE_TOP, STAGE_R, STAGE_Y, canvasTexture, clamp, paint, pulse, taperBox } from './shared.js';

const WALL_Z = -3.6;
const ROOM_W = 15; // half width of the room, far past what 16:9 shows
const BULBS = 30;
const SPOTS = 90;
const BALL = new THREE.Vector3(-2.35, 4.75, 0.4);
const BEAM_COLORS = [0xff4fd8, 0x4fd8ff, 0xffc83d, 0x9b6bff, 0x5dff9e];
const CROWD_X = [-3.3, -2.45, -1.6, -0.75, 0.75, 1.6, 2.45, 3.3]; // a gap in the middle: your seat
const CROWD_Z = 4.3;

function flat(g) {
  const geometry = g.index ? g.toNonIndexed() : g;
  geometry.deleteAttribute('uv');
  return geometry;
}

// Curtains hang in folds: a wavy strip from x0 to x1.
function curtain(x0, x1, y0, y1, z, hex, bottomHex) {
  const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), y1 - y0, Math.round(Math.abs(x1 - x0) * 4), 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.16 * Math.sin(pos.getX(i) * 7));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
  return paint(g, hex, bottomHex);
}

function staticRoom() {
  const parts = [];
  // Floor and back wall, dark: the light belongs to the stage.
  const floor = new THREE.PlaneGeometry(ROOM_W * 2, 14).rotateX(-Math.PI / 2).translate(0, 0, 2.5);
  parts.push(paint(floor, 0x1a0f26));
  parts.push(paint(new THREE.PlaneGeometry(ROOM_W * 2, 9).translate(0, 4.5, WALL_Z), 0x150a26, 0x2a1240));
  // Wall panels with thin gold trims between them.
  for (let x = -12; x <= 12; x += 2.4) {
    parts.push(paint(new THREE.BoxGeometry(0.06, 6.4, 0.06).translate(x, 3.2, WALL_Z + 0.05), 0x7a5a1c, 0x3a2a0c));
  }
  // Velvet curtains each side of the stage and a pelmet across the top.
  parts.push(curtain(-ROOM_W, -3.7, 0, 7.2, WALL_Z + 0.4, 0xa0123a, 0x40061a));
  parts.push(curtain(3.7, ROOM_W, 0, 7.2, WALL_Z + 0.4, 0xa0123a, 0x40061a));
  parts.push(curtain(-ROOM_W, ROOM_W, 6.5, 8.5, WALL_Z + 0.6, 0xb0163f, 0x700a26));
  parts.push(paint(new THREE.BoxGeometry(ROOM_W * 2, 0.12, 0.1).translate(0, 6.5, WALL_Z + 0.78), 0xffc83d));
  // The stage: a dark drum with a gold lip and a lighter top.
  parts.push(paint(new THREE.CylinderGeometry(STAGE_R, STAGE_R + 0.12, STAGE_Y, 32).translate(0, STAGE_Y / 2, 0), 0x2b1640, 0x120818));
  parts.push(paint(new THREE.CylinderGeometry(STAGE_R - 0.08, STAGE_R - 0.08, 0.02, 32).translate(0, STAGE_Y + 0.005, 0), 0x3b2156));
  parts.push(paint(new THREE.TorusGeometry(STAGE_R + 0.01, 0.045, 4, 40).rotateX(Math.PI / 2).translate(0, STAGE_Y, 0), 0xffc83d));
  // The truss the lights hang from, and the cable down to the disco ball.
  parts.push(paint(new THREE.BoxGeometry(9, 0.22, 0.22).translate(0, 6.4, -0.6), 0x2a2a34));
  parts.push(paint(new THREE.BoxGeometry(0.02, 3, 0.02).translate(BALL.x, BALL.y + 1.9, BALL.z), 0x555566));
  for (const x of [-2.6, 0, 2.6]) {
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.22, 0.34, 8).translate(x, 6.2, -0.6), 0x33333f, 0x15151c));
  }
  // Speakers each side of the stage (the cones move, see below).
  for (const x of [-3.15, 3.15]) {
    parts.push(paint(new THREE.BoxGeometry(0.9, 1.7, 0.7).translate(x, 0.85, -0.8), 0x1c1c24, 0x0c0c10));
  }
  // Mounts at both ends of the pole.
  parts.push(paint(new THREE.CylinderGeometry(0.13, 0.16, 0.06, 12).translate(0, STAGE_Y + 0.03, 0), 0xcfd3dc));
  parts.push(paint(new THREE.CylinderGeometry(0.16, 0.13, 0.08, 12).translate(0, POLE_TOP, 0), 0xcfd3dc));
  return mergeGeometries(parts.map(flat)).toNonIndexed();
}

// "POLE STAR / LOUNGE" in neon, drawn once.
function signTexture() {
  return canvasTexture(512, 256, (g, w) => {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const glow = (text, size, y, color) => {
      g.font = `bold ${size}px sans-serif`;
      g.shadowColor = color;
      for (const blur of [26, 14, 6]) {
        g.shadowBlur = blur;
        g.fillStyle = color;
        g.fillText(text, w / 2, y);
      }
      g.shadowBlur = 0;
      g.fillStyle = '#fff';
      g.globalAlpha = 0.85;
      g.fillText(text, w / 2, y);
      g.globalAlpha = 1;
    };
    glow('POLE STAR', 92, 98, '#ff4fd8');
    glow('· LOUNGE ·', 44, 186, '#4fd8ff');
    // A five-pointed star over the title.
    g.save();
    g.translate(w / 2, 26);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 20 : 8;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.shadowColor = '#ffc83d';
    g.shadowBlur = 16;
    g.fillStyle = '#ffe9a8';
    g.fill();
    g.restore();
  });
}

// A soft round dot for the disco spots.
function dotTexture() {
  return canvasTexture(32, 32, (g) => {
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
  });
}

export function createClub(scene) {
  const textures = [];

  const roomMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  scene.add(new THREE.Mesh(staticRoom(), roomMat));

  // The pole: chrome, so mostly a bright flat colour with a light stripe.
  const poleGeo = new THREE.CylinderGeometry(POLE_R, POLE_R, POLE_TOP - STAGE_Y, 10, 1, true);
  const poleCol = new Float32Array(poleGeo.attributes.position.count * 3);
  for (let i = 0; i < poleGeo.attributes.position.count; i++) {
    const x = poleGeo.attributes.position.getX(i);
    const z = poleGeo.attributes.position.getZ(i);
    const k = 0.55 + 0.45 * Math.max(0, (x * 0.5 + z) / POLE_R);
    poleCol.set([k, k, k * 1.05], i * 3);
  }
  poleGeo.setAttribute('color', new THREE.BufferAttribute(poleCol, 3));
  const pole = new THREE.Mesh(poleGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  pole.position.y = (POLE_TOP + STAGE_Y) / 2;
  scene.add(pole);

  // Neon sign over the stage.
  const signTex = signTexture();
  textures.push(signTex);
  const signMat = new THREE.MeshBasicMaterial({
    map: signTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  // Off to the side of the stage, clear of the HUD across the top.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.5), signMat);
  sign.position.set(2.55, 3.7, WALL_Z + 0.8);
  scene.add(sign);

  // Disco ball: a faceted ball whose facets catch the light as it turns.
  const ballGeo = new THREE.IcosahedronGeometry(0.42, 1);
  const ballCol = new Float32Array(ballGeo.attributes.position.count * 3);
  for (let f = 0; f < ballGeo.attributes.position.count; f += 3) {
    const k = 0.45 + Math.random() * 0.55;
    for (let v = 0; v < 3; v++) ballCol.set([k, k, k * 1.08], (f + v) * 3);
  }
  ballGeo.setAttribute('color', new THREE.BufferAttribute(ballCol, 3));
  const ball = new THREE.Mesh(ballGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x303040 }));
  ball.position.copy(BALL);
  scene.add(ball);

  // The spots the ball throws: rays from the ball, ending on the back wall,
  // the floor or the side walls, turning with the ball.
  const dotTex = dotTexture();
  textures.push(dotTex);
  const spotDirs = new Float32Array(SPOTS * 3);
  const spotPos = new Float32Array(SPOTS * 3);
  const spotCol = new Float32Array(SPOTS * 3);
  const palette = [0xffffff, 0xff8de6, 0x8de6ff, 0xffe08d].map((h) => new THREE.Color(h));
  for (let i = 0; i < SPOTS; i++) {
    // Mostly sideways and down, where the walls and floor are.
    const y = -Math.random() * 0.9 + 0.15;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    spotDirs.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    const c = palette[i % palette.length];
    spotCol.set([c.r, c.g, c.b], i * 3);
  }
  const spotGeo = new THREE.BufferGeometry();
  spotGeo.setAttribute('position', new THREE.BufferAttribute(spotPos, 3));
  spotGeo.setAttribute('color', new THREE.BufferAttribute(spotCol, 3));
  const spotMat = new THREE.PointsMaterial({
    size: 0.32,
    map: dotTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  const spots = new THREE.Points(spotGeo, spotMat);
  spots.frustumCulled = false;
  scene.add(spots);

  // Light beams from the truss: cones fading from the lamp down.
  const beamGeo = new THREE.ConeGeometry(0.85, 6.2, 14, 1, true);
  beamGeo.translate(0, -3.1, 0);
  const beamCol = new Float32Array(beamGeo.attributes.position.count * 3);
  for (let i = 0; i < beamGeo.attributes.position.count; i++) {
    const k = beamGeo.attributes.position.getY(i) > -0.1 ? 1 : 0;
    beamCol.set([k, k, k], i * 3);
  }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(beamCol, 3));
  const beams = [-2.6, 0, 2.6].map((x, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: BEAM_COLORS[i],
      vertexColors: true,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.position.set(x, 6.05, -0.6);
    beam.rotation.order = 'YXZ';
    scene.add(beam);
    return beam;
  });

  // Bulbs round the edge of the stage.
  const bulbs = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ fog: false }), BULBS);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < BULBS; i++) {
    const a = (i / BULBS) * Math.PI * 2;
    dummy.position.set(Math.sin(a) * (STAGE_R + 0.13), STAGE_Y * 0.55, Math.cos(a) * (STAGE_R + 0.13));
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
    bulbs.setColorAt(i, new THREE.Color(0xffc83d));
  }
  scene.add(bulbs);

  // Speaker cones: two per speaker, thumping with the kick.
  const woofers = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.26, 0.3, 0.06, 12).rotateX(Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3a3a48 }),
    4,
  );
  const wooferAt = [];
  for (const x of [-3.15, 3.15]) {
    for (const y of [0.5, 1.25]) wooferAt.push(new THREE.Vector3(x, y, -0.43));
  }
  scene.add(woofers);

  // The front row: heads and shoulders against the light, arms for cheering.
  const crowdMat = new THREE.MeshLambertMaterial({ color: 0x2a1838 });
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 1), crowdMat, CROWD_X.length);
  const bodies = new THREE.InstancedMesh(taperBox(0.62, 0.7, 0.36, 0.75).translate(0, -0.35, 0), crowdMat, CROWD_X.length);
  const armGeo = new THREE.BoxGeometry(0.1, 0.55, 0.1).translate(0, 0.27, 0);
  const arms = new THREE.InstancedMesh(armGeo, crowdMat, CROWD_X.length * 2);
  for (const m of [heads, bodies, arms]) {
    m.frustumCulled = false;
    scene.add(m);
  }
  const crowdH = CROWD_X.map((_, i) => 1.12 + ((i * 37) % 7) * 0.035);
  const crowdPhase = CROWD_X.map((_, i) => ((i * 53) % 10) / 10);

  const tmpColor = new THREE.Color();
  const dir = new THREE.Vector3();
  let time = 0;
  let spin = 0;
  let lastHalf = -1;
  let lastBar = -1;
  let cheer = 0; // seconds of everybody cheering left
  let flicker = 0;

  function placeCrowd(beats, hype) {
    const bob = 0.02 + hype * 0.0006;
    const raiseBase = clamp((hype - 50) / 40, 0, 1);
    for (let i = 0; i < CROWD_X.length; i++) {
      const x = CROWD_X[i];
      const h = crowdH[i];
      const nod = pulse(beats + crowdPhase[i] * 0.25, 7) * bob * (i % 2 ? 1 : 0.7);
      const sway = Math.sin(beats * Math.PI * 0.5 + i) * 0.03 * (hype / 100);
      dummy.rotation.set(0, 0, sway);
      dummy.scale.setScalar(1);
      dummy.position.set(x, h + nod, CROWD_Z + (i % 2) * 0.25);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, h - 0.16 + nod * 0.5, CROWD_Z + (i % 2) * 0.25);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      // Arms up for big moves and cheers, waving to the beat.
      const raise = Math.max(raiseBase * (i % 3 === 0 ? 0.6 : 1), cheer > 0 ? Math.min(1, cheer * 2) : 0);
      for (let s = 0; s < 2; s++) {
        const side = s === 0 ? -1 : 1;
        const wave = Math.sin(beats * Math.PI + i + s) * 0.25;
        dummy.position.set(x + side * 0.24, h - 0.3 + nod * 0.5, CROWD_Z + (i % 2) * 0.25);
        dummy.rotation.set(0, 0, side * (Math.PI - (Math.PI - 0.35 - wave) * raise));
        dummy.scale.setScalar(raise > 0.02 ? 1 : 0);
        dummy.updateMatrix();
        arms.setMatrixAt(i * 2 + s, dummy.matrix);
      }
    }
    heads.instanceMatrix.needsUpdate = true;
    bodies.instanceMatrix.needsUpdate = true;
    arms.instanceMatrix.needsUpdate = true;
  }

  function placeSpots() {
    for (let i = 0; i < SPOTS; i++) {
      // Turn the ray with the ball, then find the first surface it meets.
      const x0 = spotDirs[i * 3];
      const z0 = spotDirs[i * 3 + 2];
      const c = Math.cos(spin);
      const s = Math.sin(spin);
      dir.set(x0 * c - z0 * s, spotDirs[i * 3 + 1], x0 * s + z0 * c);
      let t = Infinity;
      if (dir.z < -0.01) t = Math.min(t, (WALL_Z + 0.2 - BALL.z) / dir.z);
      if (dir.y < -0.01) t = Math.min(t, (0.02 - BALL.y) / dir.y);
      if (dir.x < -0.01) t = Math.min(t, (-6 - BALL.x) / dir.x);
      if (dir.x > 0.01) t = Math.min(t, (6 - BALL.x) / dir.x);
      if (dir.z > 0.01) t = Math.min(t, (4.2 - BALL.z) / dir.z);
      if (!Number.isFinite(t)) t = 4;
      spotPos[i * 3] = BALL.x + dir.x * t;
      spotPos[i * 3 + 1] = BALL.y + dir.y * t;
      spotPos[i * 3 + 2] = BALL.z + dir.z * t;
    }
    spotGeo.attributes.position.needsUpdate = true;
  }

  return {
    textures,

    // beats: the music's position; hype 0-100; tier 0-5.
    update(dt, beats, hype, tier) {
      time += dt;
      cheer = Math.max(0, cheer - dt);
      const energy = hype / 100;

      spin += dt * (0.25 + energy * 0.9);
      ball.rotation.y = spin;
      placeSpots();
      spotMat.opacity = 0.18 + energy * 0.5;

      // Beams sweep over the stage, wider and faster with the hype, and
      // change colour every bar.
      const bar = Math.floor(beats / 4);
      for (let i = 0; i < beams.length; i++) {
        const beam = beams[i];
        const speed = 0.5 + energy * 1.6;
        beam.rotation.z = Math.sin(time * speed + i * 2.1) * (0.18 + energy * 0.3) + (i - 1) * -0.28;
        beam.rotation.x = 0.3 + Math.sin(time * speed * 0.7 + i) * 0.15;
        beam.material.opacity = (0.07 + energy * 0.13) * (1 + 0.5 * pulse(beats, 5) * energy);
        if (bar !== lastBar) beam.material.color.setHex(BEAM_COLORS[(bar + i * 2) % BEAM_COLORS.length]);
      }
      lastBar = bar;

      // Bulbs chase round the stage on every half beat once he is going.
      const half = Math.floor(beats * 2);
      if (half !== lastHalf) {
        lastHalf = half;
        for (let i = 0; i < BULBS; i++) {
          const lit = tier === 0 ? (i + Math.floor(half / 4)) % 2 === 0 : (i + half) % 3 === 0;
          tmpColor.setHex(lit ? 0xfff0b0 : 0x6b4a1a);
          bulbs.setColorAt(i, tmpColor);
        }
        bulbs.instanceColor.needsUpdate = true;
      }

      // Speaker cones thump on the kick.
      const thump = 1 + 0.16 * pulse(beats, 9);
      for (let i = 0; i < 4; i++) {
        dummy.position.copy(wooferAt[i]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(thump, thump, 1);
        dummy.updateMatrix();
        woofers.setMatrixAt(i, dummy.matrix);
      }
      woofers.instanceMatrix.needsUpdate = true;

      // The sign hums and, when nobody is tipping, flickers.
      flicker = Math.max(0, flicker - dt);
      if (tier === 0 && flicker <= 0 && Math.random() < dt * 0.5) flicker = 0.25;
      const buzz = flicker > 0 && Math.sin(flicker * 90) > 0 ? 0.35 : 1;
      signMat.color.setScalar(buzz * (0.85 + 0.15 * pulse(beats, 4)));

      placeCrowd(beats, hype);
    },

    cheer(seconds) {
      cheer = Math.max(cheer, seconds);
    },
  };
}
