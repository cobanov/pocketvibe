// The moving slab and the drop: the overhang is sliced off and falls, a
// perfect drop snaps into place, and a run of perfect drops grows the slab
// back towards its starting size. Shared by the game and the title demo.

import * as THREE from 'three';
import { AX_X, AX_Z, LH, SIZE } from './shared.js';

export const PERFECT = 0;
export const CUT = 1;
export const MISS = 2;

const RANGE = 3.7; // the slab slides this far either side of the tower's top
const PERFECT_TOL = 0.13; // a drop this close snaps exactly into place
const MIN_OVERLAP = 0.03; // anything thinner counts as a miss
const GROW_FROM = 3; // from this many perfect drops in a row the slab grows
const GROW = 0.18; // per perfect drop, up to the starting size
const ENTER_TIME = 0.18; // the slab drops in from a little above

export function createStack(scene, geometry, tower, debris) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
  const slab = new THREE.Mesh(geometry, material);
  slab.visible = false;
  scene.add(slab);
  const color = new THREE.Color();

  let axis = AX_X;
  let offset = 0; // position along the axis, relative to the top's centre
  let dir = 1;
  let speed = 3;
  let w = SIZE;
  let d = SIZE;
  let age = 0;
  let active = false;
  let combo = 0;

  // Result of the last drop, read by the game for effects.
  const last = { kind: CUT, x: 0, y: 0, z: 0, w: 0, d: 0, grew: false, cut: 0, cutX: 0, cutZ: 0 };

  function place() {
    const k = Math.min(1, age / ENTER_TIME);
    const x = tower.topX + (axis === AX_X ? offset : 0);
    const z = tower.topZ + (axis === AX_X ? 0 : offset);
    slab.position.set(x, tower.height + LH / 2 + (1 - k) * (1 - k) * 0.7, z);
    slab.scale.set(w, LH, d);
  }

  return {
    last,
    get combo() {
      return combo;
    },
    get offset() {
      return offset;
    },
    get age() {
      return age;
    },
    // Size of the slab along the axis it slides on.
    get size() {
      return axis === AX_X ? w : d;
    },

    reset() {
      combo = 0;
      active = false;
      slab.visible = false;
    },

    // A new slab above the top layer with the top's footprint. It slides on
    // the other axis than the last one; farSide starts it from the front.
    spawn(slideSpeed, farSide) {
      axis = tower.n % 2 === 0 ? AX_X : AX_Z;
      w = tower.topW;
      d = tower.topD;
      dir = farSide ? -1 : 1;
      offset = -RANGE * dir;
      speed = slideSpeed;
      age = 0;
      active = true;
      slab.visible = true;
      material.color.copy(tower.colorOf(tower.n + 1, color));
      place();
    },

    update(dt) {
      if (!active) return;
      age += dt;
      offset += dir * speed * dt;
      // Bounce off both ends of the range.
      if (offset > RANGE) {
        offset = 2 * RANGE - offset;
        dir = -1;
      } else if (offset < -RANGE) {
        offset = -2 * RANGE - offset;
        dir = 1;
      }
      place();
    },

    // Drops the slab where it is now and returns PERFECT, CUT or MISS.
    drop() {
      active = false;
      slab.visible = false;
      const size = axis === AX_X ? w : d;
      const cx = tower.topX;
      const cz = tower.topZ;
      const y = tower.height + LH / 2;
      const ox = axis === AX_X ? offset : 0;
      const oz = axis === AX_X ? 0 : offset;
      const abs = Math.abs(offset);
      const sign = offset < 0 ? -1 : 1;
      tower.colorOf(tower.n + 1, color);
      last.y = y;
      last.grew = false;
      last.cut = 0;

      if (abs <= PERFECT_TOL) {
        combo++;
        const gw = w;
        const gd = d;
        // From the third perfect drop in a row the slab grows back, first
        // along the axis it slides on, then along the other one.
        if (combo >= GROW_FROM) {
          if (axis === AX_X ? w < SIZE : d < SIZE) {
            if (axis === AX_X) w = Math.min(SIZE, w + GROW);
            else d = Math.min(SIZE, d + GROW);
          } else if (axis === AX_X ? d < SIZE : w < SIZE) {
            if (axis === AX_X) d = Math.min(SIZE, d + GROW);
            else w = Math.min(SIZE, w + GROW);
          }
          last.grew = w !== gw || d !== gd;
        }
        tower.add(cx, cz, w, d, true, gw, gd);
        last.kind = PERFECT;
      } else if (size - abs < MIN_OVERLAP) {
        // Missed the tower: the whole slab falls.
        combo = 0;
        debris.spawn(cx + ox, y, cz + oz, w, d, axis, sign, dir * speed, color, true);
        last.kind = MISS;
      } else {
        // The part over the top stays, the overhang falls off.
        combo = 0;
        const keep = size - abs;
        const pieceCentre = sign * (size / 2) + offset / 2;
        if (axis === AX_X) {
          debris.spawn(cx + pieceCentre, y, cz, abs, d, axis, sign, dir * speed, color, false);
          w = keep;
          tower.add(cx + offset / 2, cz, w, d, false, w, d);
        } else {
          debris.spawn(cx, y, cz + pieceCentre, w, abs, axis, sign, dir * speed, color, false);
          d = keep;
          tower.add(cx, cz + offset / 2, w, d, false, w, d);
        }
        last.kind = CUT;
        last.cut = abs;
      }

      // The new top, and the edge of the cut for the dust puff.
      last.x = tower.topX;
      last.z = tower.topZ;
      last.w = tower.topW;
      last.d = tower.topD;
      last.cutX = axis === AX_X ? cx + sign * (size / 2) : cx;
      last.cutZ = axis === AX_X ? cz : cz + sign * (size / 2);
      return last.kind;
    },
  };
}
