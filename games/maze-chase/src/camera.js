// The camera: a tilted overhead view at one fixed angle. The full view
// frames the whole maze (title screen, the start of a level, a cleared
// maze); the close view comes nearer and follows the robot, so the robot,
// the drones and the dots read on a 3.4" screen. It slides along the maze
// without showing much beyond its edges, and the two blend smoothly.

import * as THREE from 'three';
import { H, W } from './mazes.js';

const CAM_Y = 40.3; // full view, from the point it looks at
const CAM_Z = 18.8;
const LOOK_Z = -0.7; // the full view's look point
const NEAR = 0.8; // the close view is this much of the full view's distance
const FOLLOW = 6; // 1/s: how quickly the close view catches up with the robot
const LEAD = 1.2; // cells: the close view looks a little ahead of the robot
const ZOOM_TIME = 0.9; // s between the two views
const HUD_ROW = 44; // px of the screen's top covered by the score row
// The maze and its platform, in world units from its centre, plus a little
// floor beyond the edges.
const HALF_X = (W - 1) / 2 + 1.1;
const TOP_Z = -((H - 1) / 2) - 1.2;
const BOTTOM_Z = (H - 1) / 2 + 1.6; // also the platform's front face

const ray = new THREE.Vector3();
const point = new THREE.Vector3();

// Where the screen point (ndc x, y) meets the floor, for a camera looking at
// the origin.
function onFloor(camera, x, y) {
  ray.set(x, y, 0.5).unproject(camera).sub(camera.position);
  const t = -camera.position.y / ray.y;
  return { x: camera.position.x + ray.x * t, z: camera.position.z + ray.z * t };
}

// The screen y (ndc) of the floor point (0, z) when the close camera looks
// at (0, 0, look).
function screenY(camera, look, z) {
  camera.position.set(0, CAM_Y * NEAR, look + CAM_Z * NEAR);
  camera.lookAt(0, 0, look);
  camera.updateMatrixWorld();
  return point.set(0, 0, z).project(camera).y;
}

function smooth(x) {
  return x * x * (3 - 2 * x);
}

export function createCamera(hh) {
  const camera = new THREE.PerspectiveCamera(30, hh.aspect, 10, 75);
  hh.fitCamera(camera);

  // How far the close view's look point may move: cast the screen's edges
  // onto the floor with the close camera looking at the origin. The bottom
  // edge is the narrowest part of the view, so the sides use it.
  camera.position.set(0, CAM_Y * NEAR, CAM_Z * NEAR);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const hudY = 1 - (2 * HUD_ROW) / hh.height;
  const top = onFloor(camera, 0, hudY).z;
  const bottom = onFloor(camera, 0, -1).z;
  const side = onFloor(camera, 1, -1).x;
  const maxX = Math.max(0, HALF_X - side);
  let minZ = TOP_Z - top;
  let maxZ = BOTTOM_Z - bottom;
  if (minZ > maxZ) {
    // The whole depth fits: centre it on screen between the score row and
    // the bottom edge (perspective makes that a search, not a midpoint).
    let lo = maxZ;
    let hi = minZ;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const gapTop = hudY - screenY(camera, mid, TOP_Z);
      const gapBottom = screenY(camera, mid, BOTTOM_Z) + 1;
      if (gapTop > gapBottom) lo = mid;
      else hi = mid;
    }
    minZ = maxZ = (lo + hi) / 2;
  }

  let zoom = 0; // 0 full view .. 1 close view
  let lookX = 0;
  let lookZ = LOOK_Z;
  let leadX = 0;
  let leadZ = 0;

  return {
    camera,

    get zoom() {
      return zoom;
    },

    // Jumps straight to a view (a new level starts from the full view).
    snap(z, x, y) {
      zoom = z;
      lookX = Math.max(-maxX, Math.min(maxX, x));
      lookZ = Math.max(minZ, Math.min(maxZ, y));
      leadX = 0;
      leadZ = 0;
    },

    // target: 0 full view, 1 close view. (x, z, dx, dz): the robot's world
    // position and heading. back > 1 pulls the camera back (the drop-in when
    // a maze comes up), shake jitters it, sway moves it sideways.
    update(dt, target, x, z, dx, dz, back, shake, sway) {
      const step = dt / ZOOM_TIME;
      zoom = target > zoom ? Math.min(target, zoom + step) : Math.max(target, zoom - step);
      const k = 1 - Math.exp(-FOLLOW * dt);
      leadX += (dx * LEAD - leadX) * k;
      leadZ += (dz * LEAD - leadZ) * k;
      const tx = Math.max(-maxX, Math.min(maxX, x + leadX));
      const tz = Math.max(minZ, Math.min(maxZ, z + leadZ));
      lookX += (tx - lookX) * k;
      lookZ += (tz - lookZ) * k;

      const e = smooth(zoom);
      const dist = (1 + (NEAR - 1) * e) * back;
      const ax = lookX * e + sway;
      const az = LOOK_Z + (lookZ - LOOK_Z) * e;
      camera.position.set(
        ax + (Math.random() - 0.5) * shake,
        CAM_Y * dist + (Math.random() - 0.5) * shake,
        az + CAM_Z * dist + (Math.random() - 0.5) * shake,
      );
      camera.lookAt(ax, 0, az);
      camera.updateMatrixWorld();
    },
  };
}
