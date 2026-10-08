// Every circuit is built while the game loads: its track data, its static
// scenery cut into cells, its boost pads and cones. Only the chosen one is
// shown; the ground, sky and arch sign are shared and recolored for it.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CIRCUITS } from './circuits.js';
import { buildCircuit, padGeometry, roadInto } from './track.js';
import { createSoup } from './bake.js';
import {
  archInto,
  boardsInto,
  coneGeometry,
  createCones,
  grandstandInto,
  groundTexture,
  signTexture,
  skyGeometry,
  treesInto,
} from './scenery.js';
import { KMH, seededRandom } from './shared.js';

const CELL = 48; // size of a static scenery cell, in world units
const GROUND = 900; // the grass reaches far beyond the camera

export function createWorlds(scene, { hemi, sun, camera, renderer }) {
  const staticMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const padMaterial = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  const coneMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const cone = coneGeometry();

  // Drawn after everything else, so the depth test hides most of their pixels.
  const groundMap = groundTexture();
  groundMap.repeat.set(GROUND / 16, 1);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), new THREE.MeshLambertMaterial({ map: groundMap }));
  ground.rotation.x = -Math.PI / 2;
  ground.renderOrder = 1;
  scene.add(ground);

  const sky = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  sky.frustumCulled = false;
  sky.renderOrder = 2;
  scene.add(sky);

  // The sign on top of the arch, readable from both sides.
  const front = new THREE.PlaneGeometry(9, 2.25);
  front.rotateY(Math.PI);
  const back = new THREE.PlaneGeometry(9, 2.25);
  const sign = new THREE.Mesh(mergeGeometries([front, back]), new THREE.MeshBasicMaterial());
  scene.add(sign);

  const list = CIRCUITS.map((def, index) => {
    const track = buildCircuit(def);
    const rand = seededRandom(def.seed);
    const soup = createSoup();
    roadInto(soup, track, def.colors);
    archInto(soup, track);
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < track.n; i++) {
      cx += track.px[i] / track.n;
      cz += track.pz[i] / track.n;
    }
    // The grandstand goes on the outside of the main straight.
    const outside = Math.sign(-track.tz[0] * (track.px[0] - cx) + track.tx[0] * (track.pz[0] - cz)) || 1;
    grandstandInto(soup, track, outside, rand);
    boardsInto(soup, track, def.colors.boards);
    treesInto(soup, track, def, rand);

    const group = new THREE.Group();
    for (const g of soup.bake(CELL)) group.add(new THREE.Mesh(g, staticMaterial));
    group.add(new THREE.Mesh(padGeometry(track), padMaterial));
    const cones = createCones(track, cone, coneMaterial);
    cones.reset();
    group.add(cones.mesh);
    group.visible = false;
    scene.add(group);

    const [near, far] = def.fog;
    return {
      index,
      def,
      track,
      group,
      cones,
      km: (track.length * KMH) / 3600,
      // Past the fog's end everything is the haze color: the camera stops
      // just beyond it, and the sky dome sits just inside that.
      far: far + 6,
      skyGeometry: skyGeometry(def, far + 3),
      signMap: signTexture(def.name),
      fog: [near, far],
      center: [(track.minX + track.maxX) / 2, (track.minZ + track.maxZ) / 2],
    };
  });

  let current = null;

  const worlds = {
    list,
    get current() {
      return current;
    },

    select(world) {
      if (current) current.group.visible = false;
      current = world;
      world.group.visible = true;
      const { colors } = world.def;
      ground.material.color.setHex(colors.ground);
      ground.position.set(world.center[0], 0, world.center[1]);
      sky.geometry = world.skyGeometry;
      if (!sign.material.map) sign.material.needsUpdate = true;
      sign.material.map = world.signMap;
      const t = world.track;
      sign.position.set(t.px[0], 9.7, t.pz[0]);
      sign.rotation.y = t.heading[0];
      scene.fog.color.setHex(colors.sky);
      scene.fog.near = world.fog[0];
      scene.fog.far = world.fog[1];
      renderer.setClearColor(colors.sky);
      hemi.groundColor.setHex(colors.light);
      sun.color.setHex(colors.sun ?? 0xffffff);
      camera.far = world.far;
      camera.updateProjectionMatrix();
    },

    // Boost pads glow by pulsing their unlit color.
    update(time) {
      const t = 0.5 + 0.5 * Math.sin(time * 9);
      padMaterial.color.setRGB(1, 0.55 + t * 0.4, 0.1 + t * 0.35);
    },

    // Keeps the sky centred on the camera so it is never reached.
    follow(cam) {
      sky.position.set(cam.position.x, 0, cam.position.z);
    },

    // Draws every circuit once with nothing culled, so all geometry and
    // textures are on the GPU before the first race.
    warm(draw) {
      const before = current;
      for (const world of list) {
        renderer.initTexture(world.signMap);
        this.select(world);
        world.group.traverse((o) => (o.frustumCulled = false));
        draw();
        world.group.traverse((o) => (o.frustumCulled = !o.isInstancedMesh));
      }
      renderer.initTexture(groundMap);
      this.select(before ?? list[0]);
    },
  };
  return worlds;
}
