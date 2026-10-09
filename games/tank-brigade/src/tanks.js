// The tanks: the player and up to four enemies, each a record in a fixed
// pool. Movement on the cell grid with collisions against the field and each
// other, the enemy AI (also used for the player in the title demo), and the
// drawing: one InstancedMesh per kind of tank, plus track cleats, fake
// shadows, spawn twinkles and the shield bubble.

import * as THREE from 'three';
import {
  BRICK,
  CELL,
  DIR_X,
  DIR_Z,
  DOWN,
  HALF,
  LEFT,
  RIGHT,
  TANK_R,
  UP,
  snap,
  toCell,
  yawOf,
} from './shared.js';
import { TREADS, cleatGeometry, sparkleGeometry, tankGeometry } from './models.js';

export const PLAYER = 0;
export const BASIC = 1;
export const FAST = 2;
export const POWER = 3;
export const ARMOUR = 4;

// Per kind: speed (units per second), shell speed, hits to destroy, points
// and paint.
export const KINDS = [
  { speed: 3.1, shell: 8, hp: 1, points: 0, color: 0xf2c53d },
  { speed: 1.9, shell: 6.5, hp: 1, points: 100, color: 0xc9d1d9 },
  { speed: 3.6, shell: 7.5, hp: 1, points: 200, color: 0x86d4ee },
  { speed: 2.3, shell: 12, hp: 1, points: 300, color: 0xd6a4ea },
  { speed: 1.9, shell: 8, hp: 4, points: 400, color: 0x5fc066 },
];
// Armoured paint by hits left: bare steel, orange, yellow, green.
export const ARMOUR_HEX = [0, 0xdedede, 0xf0963e, 0xe9d14a, 0x5fc066];

const MAX = 5; // the player and four enemies
const SPAWN_TIME = 1.0; // the twinkle before a tank appears
const POP_TIME = 0.28;
const SLIDE_TIME = 0.34; // how long a tank keeps sliding on ice
const CLEATS = 5; // per track
const EPS = 1e-4;
const MUZZLE = 0.45; // where shells leave the barrel, from the tank's centre
const AIM_DELAY = 0.25; // how quickly a sharpshooter fires once you line up
const AIM_REACH = 7;
const CARRIER_HEX = 0xff3d2e;
const FROZEN_HEX = 0xa8e6ff;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function easeOutBack(t) {
  const c = 2.2;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

export function createTanks(scene, field, bullets, fx) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const white = new THREE.Color(0xffffff);
  const frozenTint = new THREE.Color(FROZEN_HEX);

  function instanced(geometry, mat, count) {
    const mesh = new THREE.InstancedMesh(geometry, mat, count);
    mesh.frustumCulled = false; // instances move, so the cached bounds would be wrong
    mesh.count = 0;
    mesh.setColorAt(0, white); // creates instanceColor once, up front
    scene.add(mesh);
    return mesh;
  }

  const shadowGeometry = new THREE.PlaneGeometry(0.98, 0.98);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shadows = instanced(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    MAX,
  );
  const bodies = [];
  for (let k = 0; k < KINDS.length; k++) bodies.push(instanced(tankGeometry(k), material, k === PLAYER ? 1 : 4));
  const cleats = instanced(cleatGeometry(), material, MAX * 2 * CLEATS);
  const sparkles = instanced(sparkleGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);

  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: 0x7fe8ff,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    wireframe: true,
  });
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(0.74, 1), shieldMaterial);
  shield.visible = false;
  scene.add(shield);

  const list = [];
  for (let i = 0; i < MAX; i++) {
    list.push({
      index: i,
      kind: i === 0 ? PLAYER : BASIC,
      enemy: i !== 0,
      active: false, // in use: twinkling or on the field
      live: false, // on the field: solid, can shoot and be shot
      spawnT: 0,
      x: 0,
      z: 0,
      dir: UP,
      yaw: 0,
      ox: 0, // drawn offset left by a snap to the grid, eased away
      oz: 0,
      hp: 1,
      carrier: false, // flashes and drops a power-up when hit
      shield: 0,
      slide: 0,
      tread: 0, // distance the tracks have rolled
      moving: false,
      recoil: 0,
      flash: 0,
      pop: 0,
      dust: 0,
      fireT: 0,
      aiT: 0,
      stuck: 0,
      patience: 0.2,
      calm: 0,
    });
  }
  const player = list[0];

  const dummy = new THREE.Object3D();
  const body = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const world = new THREE.Matrix4();
  const color = new THREE.Color();
  const counts = new Int32Array(KINDS.length);
  let blockedBy = 0; // what stopped the last move: a cell kind, or -1 for a tank
  let clock = 0;

  // True if a tank cannot enter column cx between rows r0 and r1 (or row
  // cz between columns, the arguments are the same either way round).
  function lineBlocked(horizontal, c, a0, a1) {
    for (let a = a0; a <= a1; a++) {
      const blocked = horizontal ? field.blocks(c, a) : field.blocks(a, c);
      if (blocked) {
        blockedBy = horizontal ? field.kind(c, a) : field.kind(a, c);
        return true;
      }
    }
    return false;
  }

  // Moves t along its direction by up to dist. Returns 0 when free, 1 when
  // the field stopped it and 2 when another tank did. Only cells the front
  // edge newly enters are checked, so a tank that ends up inside a wall (the
  // shovel builds around whatever stands there) can still drive out.
  function move(t, dist) {
    const horizontal = DIR_X[t.dir] !== 0;
    const s = horizontal ? DIR_X[t.dir] : DIR_Z[t.dir];
    const along = horizontal ? t.x : t.z;
    const across = horizontal ? t.z : t.x;
    const a0 = toCell(across - TANK_R + EPS);
    const a1 = toCell(across + TANK_R - EPS);
    const edge = along + s * TANK_R;
    let target = edge + s * dist;
    let result = 0;
    if (s > 0) {
      const c1 = toCell(target - EPS);
      for (let c = toCell(edge - EPS) + 1; c <= c1; c++) {
        if (lineBlocked(horizontal, c, a0, a1)) {
          target = -HALF + c * CELL;
          result = 1;
          break;
        }
      }
    } else {
      const c1 = toCell(target + EPS);
      for (let c = toCell(edge + EPS) - 1; c >= c1; c--) {
        if (lineBlocked(horizontal, c, a0, a1)) {
          target = -HALF + (c + 1) * CELL;
          result = 1;
          break;
        }
      }
    }
    let next = target - s * TANK_R;

    for (let i = 0; i < MAX; i++) {
      const o = list[i];
      if (o === t || !o.active) continue;
      const oAlong = horizontal ? o.x : o.z;
      const oAcross = horizontal ? o.z : o.x;
      if (Math.abs(oAcross - across) >= 2 * TANK_R - EPS) continue;
      if (Math.abs(oAlong - along) < 2 * TANK_R - EPS) continue; // already overlapping: let them part
      if (s > 0 && oAlong > along && next > oAlong - 2 * TANK_R) {
        next = oAlong - 2 * TANK_R;
        result = 2;
        blockedBy = -1;
      } else if (s < 0 && oAlong < along && next < oAlong + 2 * TANK_R) {
        next = oAlong + 2 * TANK_R;
        result = 2;
        blockedBy = -1;
      }
    }
    if ((next - along) * s < 0) next = along;
    if (horizontal) t.x = next;
    else t.z = next;
    return result;
  }

  function overlapsTank(t, x, z) {
    for (let i = 0; i < MAX; i++) {
      const o = list[i];
      if (o === t || !o.active) continue;
      if (Math.abs(o.x - x) < 2 * TANK_R - EPS && Math.abs(o.z - z) < 2 * TANK_R - EPS) {
        // Ignore a tank that already overlapped before the snap.
        if (Math.abs(o.x - t.x) < 2 * TANK_R - EPS && Math.abs(o.z - t.z) < 2 * TANK_R - EPS) continue;
        return true;
      }
    }
    return false;
  }

  // The grid line to line up on along one axis: the nearest one, else the one
  // on the other side, else none (v itself) when another tank stands on both.
  // Either line keeps the tank on cells it already covers, so never in a wall.
  function lineUp(t, v, horizontal) {
    const near = snap(v);
    const far = near + (near > v ? -CELL : CELL);
    if (!(horizontal ? overlapsTank(t, near, t.z) : overlapsTank(t, t.x, near))) return near;
    if (!(horizontal ? overlapsTank(t, far, t.z) : overlapsTank(t, t.x, far))) return far;
    return v;
  }

  // Faces a new direction. A quarter turn first lines the tank up with the
  // cell grid, which is what lets it slip into a one-tile corridor.
  function turn(t, dir) {
    if (dir === t.dir) return;
    if ((dir & 1) !== (t.dir & 1)) {
      if (DIR_X[t.dir] !== 0) {
        const nx = lineUp(t, t.x, true);
        t.ox += t.x - nx;
        t.x = nx;
      } else {
        const nz = lineUp(t, t.z, false);
        t.oz += t.z - nz;
        t.z = nz;
      }
    }
    t.dir = dir;
  }

  // The player's tank up against the corner of a wall, with the way open half
  // a tile to one side, slides across into the gap instead of stopping dead.
  function slideAround(t, dist) {
    const horizontal = DIR_X[t.dir] !== 0;
    const s = horizontal ? DIR_X[t.dir] : DIR_Z[t.dir];
    const along = horizontal ? t.x : t.z;
    const across = horizontal ? t.z : t.x;
    const edge = along + s * TANK_R;
    const ahead = s > 0 ? toCell(edge + EPS) : toCell(edge - EPS);
    const near = snap(across);
    const lined = Math.abs(near - across) < EPS;
    const lo = lined ? across - CELL : near > across ? near - CELL : near;
    const hi = lined ? across + CELL : lo + CELL;
    // The grid line to slide to: the way ahead of it must be open.
    let goal = NaN;
    for (let k = 0; k < 2 && Number.isNaN(goal); k++) {
      const g = (k === 0) === (hi - across < across - lo) ? hi : lo;
      let open = true;
      for (let a = toCell(g - TANK_R + EPS); a <= toCell(g + TANK_R - EPS) && open; a++) {
        if (horizontal ? field.blocks(ahead, a) : field.blocks(a, ahead)) open = false;
      }
      if (open) goal = g;
    }
    if (Number.isNaN(goal)) return;
    const dir = t.dir;
    t.dir = horizontal ? (goal > across ? DOWN : UP) : goal > across ? RIGHT : LEFT;
    move(t, Math.min(dist, Math.abs(goal - across)));
    t.dir = dir;
  }

  // The direction that brings t closer to (x, z), usually along the longer
  // way, sometimes the shorter.
  function toward(t, x, z) {
    const dx = x - t.x;
    const dz = z - t.z;
    let horizontal = Math.abs(dx) > Math.abs(dz);
    if (Math.random() < 0.3) horizontal = !horizontal;
    if (horizontal && Math.abs(dx) < 0.3) horizontal = false;
    if (!horizontal && Math.abs(dz) < 0.3) horizontal = true;
    if (horizontal) return dx > 0 ? RIGHT : LEFT;
    return dz > 0 ? DOWN : UP;
  }

  function nearestEnemy(t) {
    let best = null;
    let bestD = 1e9;
    for (let i = 1; i < MAX; i++) {
      const o = list[i];
      if (!o.live) continue;
      const d = Math.abs(o.x - t.x) + Math.abs(o.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  // Picks a new heading. Enemies lean towards the core and the player; the
  // demo player hunts the nearest enemy.
  function rethink(t, blocked, o) {
    let d;
    const r = Math.random();
    if (!t.enemy) {
      const prey = nearestEnemy(t);
      d = prey && r < 0.7 ? toward(t, prey.x, prey.z) : Math.floor(Math.random() * 4);
    } else if (r < o.coreBias) {
      d = toward(t, field.coreX, field.coreZ);
    } else if (r < o.coreBias + o.hunt && player.live) {
      d = toward(t, player.x, player.z);
    } else {
      d = Math.floor(Math.random() * 4);
    }
    if (blocked && d === t.dir) d = (d + (Math.random() < 0.5 ? 1 : 3)) % 4;
    turn(t, d);
  }

  // True if the player's tank is lined up in front of t, within reach.
  function playerAhead(t, reach) {
    if (!player.live) return false;
    const dx = player.x - t.x;
    const dz = player.z - t.z;
    if (DIR_X[t.dir] !== 0) return Math.abs(dz) < 0.45 && dx * DIR_X[t.dir] > 0 && Math.abs(dx) < reach;
    return Math.abs(dx) < 0.45 && dz * DIR_Z[t.dir] > 0 && Math.abs(dz) < reach;
  }

  // An enemy lined up with t, within reach and in front of it, or null.
  function preyAhead(t) {
    for (let i = 1; i < MAX; i++) {
      const o = list[i];
      if (!o.live) continue;
      const dx = o.x - t.x;
      const dz = o.z - t.z;
      if (DIR_X[t.dir] !== 0 ? Math.abs(dz) < 0.45 && dx * DIR_X[t.dir] > 0 : Math.abs(dx) < 0.45 && dz * DIR_Z[t.dir] > 0) {
        return o;
      }
    }
    return null;
  }

  function think(t, dt, o) {
    const speed = KINDS[t.kind].speed * (t.enemy ? o.speedMul : 1);
    const result = move(t, speed * dt);
    t.moving = true;
    t.tread += speed * dt;
    if (result) {
      t.stuck += dt;
      // Up against bricks: blast through them now and then.
      if (blockedBy === BRICK && t.fireT > 0.3 && Math.random() < dt * o.blast) t.fireT = 0.05;
      if (t.stuck > t.patience) {
        t.stuck = 0;
        t.patience = 0.12 + Math.random() * 0.5;
        t.calm = 1.2;
        rethink(t, true, o);
      }
    } else {
      t.stuck = 0;
    }
    t.aiT -= dt;
    if (t.aiT <= 0) {
      t.aiT = 0.8 + Math.random() * 2.2;
      if (Math.random() < 0.55) rethink(t, false, o);
    }

    if (!t.enemy) {
      // The demo player turns to face an enemy that lines up beside it,
      // unless it just gave up on a way that was blocked.
      t.calm -= dt;
      const prey = t.calm > 0 ? null : nearestEnemy(t);
      if (prey) {
        const dx = prey.x - t.x;
        const dz = prey.z - t.z;
        if (Math.abs(dx) < 0.4 && Math.abs(dz) < 6) turn(t, dz < 0 ? UP : DOWN);
        else if (Math.abs(dz) < 0.4 && Math.abs(dx) < 6) turn(t, dx < 0 ? LEFT : RIGHT);
      }
      if (preyAhead(t)) t.fireT = Math.min(t.fireT, 0);
    }

    // Sharpshooters fire as soon as the player lines up in front of them.
    if (t.enemy && o.aim && t.fireT > AIM_DELAY && playerAhead(t, AIM_REACH)) t.fireT = AIM_DELAY;

    t.fireT -= dt;
    if (t.fireT <= 0) {
      t.fireT = o.fireMin + Math.random() * o.fireRange;
      if (t.enemy) tanks.fire(t, KINDS[t.kind].shell * o.shellMul, false, 1);
      else tanks.fire(t, 10, false, 1);
    }
  }

  const tanks = {
    list,
    player,
    onFire: null, // called with the tank whenever one fires

    reset() {
      for (let i = 0; i < MAX; i++) {
        list[i].active = false;
        list[i].live = false;
      }
      shield.visible = false;
    },

    // Starts the twinkle for tank slot i; the tank appears when it ends.
    spawn(i, kind, x, z, dir, carrier) {
      const t = list[i];
      t.kind = kind;
      t.active = true;
      t.live = false;
      t.spawnT = SPAWN_TIME;
      t.x = x;
      t.z = z;
      t.dir = dir;
      t.yaw = yawOf(dir);
      t.ox = 0;
      t.oz = 0;
      t.hp = KINDS[kind].hp;
      t.carrier = carrier;
      t.shield = 0;
      t.slide = 0;
      t.moving = false;
      t.recoil = 0;
      t.flash = 0;
      t.pop = 0;
      t.fireT = 1.2 + Math.random() * 1.2;
      t.aiT = 0.5 + Math.random();
      t.stuck = 0;
      return t;
    },

    // A free enemy slot, or -1.
    freeSlot() {
      for (let i = 1; i < MAX; i++) if (!list[i].active) return i;
      return -1;
    },

    // Enemies twinkling in or on the field.
    enemies() {
      let n = 0;
      for (let i = 1; i < MAX; i++) if (list[i].active) n++;
      return n;
    },

    // True if no tank stands on the tile-sized spot at (x, z).
    spotFree(x, z) {
      for (let i = 0; i < MAX; i++) {
        const o = list[i];
        if (o.active && Math.abs(o.x - x) < 2 * TANK_R && Math.abs(o.z - z) < 2 * TANK_R) return false;
      }
      return true;
    },

    kill(t) {
      t.active = false;
      t.live = false;
      if (t === player) shield.visible = false;
    },

    // Player driving: dir is the D-pad direction or -1.
    drive(t, dir, dt) {
      const speed = KINDS[t.kind].speed;
      if (dir >= 0) {
        turn(t, dir);
        if (move(t, speed * dt) === 1) slideAround(t, speed * dt);
        t.moving = true;
        t.tread += speed * dt;
        t.slide = field.isIce(t.x, t.z) ? SLIDE_TIME : 0;
      } else if (t.slide > 0) {
        // Sliding on ice with the tracks stopped.
        t.slide = Math.max(0, t.slide - dt);
        move(t, speed * dt * (0.4 + (0.6 * t.slide) / SLIDE_TIME));
        t.moving = false;
      } else {
        t.moving = false;
      }
    },

    // Fires a shell if fewer than max of t's shells are in flight.
    fire(t, speed, power, max) {
      if (!t.live || bullets.countFor(t.index) >= max) return false;
      const x = t.x + DIR_X[t.dir] * MUZZLE;
      const z = t.z + DIR_Z[t.dir] * MUZZLE;
      if (!bullets.fire(t.index, t.enemy, x, z, t.dir, speed, power)) return false;
      t.recoil = 1;
      fx.muzzle(t.x + DIR_X[t.dir] * 0.66, 0.37, t.z + DIR_Z[t.dir] * 0.66);
      if (tanks.onFire) tanks.onFire(t);
      return true;
    },

    // o: { frozen, demo, speedMul, shellMul, fireMin, fireRange, coreBias, hunt, aim, blast }.
    update(dt, o) {
      clock += dt;
      for (let i = 0; i < MAX; i++) {
        const t = list[i];
        if (!t.active) continue;
        if (t.spawnT > 0) {
          t.spawnT -= dt;
          if (t.spawnT <= 0) {
            t.live = true;
            t.pop = 0;
          }
          continue;
        }
        t.pop += dt;
        t.shield = Math.max(0, t.shield - dt);
        if (t.enemy ? !o.frozen : o.demo) think(t, dt, o);
        else if (t.enemy) t.moving = false;

        // Dust kicked up by moving tracks.
        t.dust -= dt;
        if (t.moving && t.dust <= 0) {
          t.dust = 0.12 + Math.random() * 0.12;
          const side = Math.random() < 0.5 ? -0.33 : 0.33;
          const bx = t.x - DIR_X[t.dir] * 0.5 + DIR_Z[t.dir] * side;
          const bz = t.z - DIR_Z[t.dir] * 0.5 + DIR_X[t.dir] * side;
          fx.puff(bx, 0.08, bz, 0.2);
        }
      }
    },

    draw(dt, frozen) {
      counts.fill(0);
      let ns = 0;
      let nc = 0;
      let nw = 0;
      shield.visible = false;
      const decay = Math.exp(-dt * 18);
      for (let i = 0; i < MAX; i++) {
        const t = list[i];
        if (!t.active) continue;

        if (t.spawnT > 0) {
          // The twinkle: a spinning star that pulses, then shrinks away.
          const k = 1 - t.spawnT / SPAWN_TIME;
          const s = (0.55 + 0.45 * Math.abs(Math.sin(k * Math.PI * 4))) * (k > 0.85 ? (1 - k) / 0.15 : 1) * 1.3;
          dummy.position.set(t.x, 0.45, t.z);
          dummy.rotation.set(0, clock * 7, 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          sparkles.setMatrixAt(nw, dummy.matrix);
          color.setHex(t.enemy ? 0xfff3b0 : 0xb0f4ff);
          sparkles.setColorAt(nw, color);
          nw++;
          continue;
        }

        t.recoil = Math.max(0, t.recoil - dt * 6);
        t.flash = Math.max(0, t.flash - dt);
        t.ox *= decay;
        t.oz *= decay;
        t.yaw += wrapAngle(yawOf(t.dir) - t.yaw) * Math.min(1, dt * 24);

        const pop = t.pop < POP_TIME ? easeOutBack(t.pop / POP_TIME) : 1;
        const kick = t.recoil * t.recoil;
        const bob = t.moving ? Math.sin(t.tread * 34) * 0.012 : 0;
        dummy.position.set(
          t.x + t.ox - DIR_X[t.dir] * kick * 0.07,
          bob,
          t.z + t.oz - DIR_Z[t.dir] * kick * 0.07,
        );
        dummy.rotation.set(0, t.yaw, 0);
        dummy.scale.set(pop * (1 + kick * 0.06), pop * (1 - kick * 0.05), pop * (1 - kick * 0.1));
        dummy.updateMatrix();
        body.copy(dummy.matrix);
        bodies[t.kind].setMatrixAt(counts[t.kind], body);

        if (t.kind === ARMOUR) color.setHex(ARMOUR_HEX[Math.max(1, Math.min(4, t.hp))]);
        else color.setHex(KINDS[t.kind].color);
        if (t.carrier && Math.floor(clock * 7) % 2 === 0) color.setHex(CARRIER_HEX);
        if (t.enemy && frozen) color.lerp(white, 0.2).multiply(frozenTint);
        if (t.flash > 0) color.lerp(white, Math.min(1, t.flash * 8));
        bodies[t.kind].setColorAt(counts[t.kind], color);
        counts[t.kind]++;

        // Track cleats roll along the tops of the treads.
        const tr = TREADS[t.kind];
        const spacing = tr.len / CLEATS;
        const roll = t.tread / spacing;
        for (let side = -1; side <= 1; side += 2) {
          for (let c = 0; c < CLEATS; c++) {
            const u = (((c + roll) % CLEATS) + CLEATS) % CLEATS;
            local.makeScale(tr.w + 0.02, 1, 1);
            local.setPosition(side * tr.x, tr.h + 0.012, tr.len / 2 - (u + 0.5) * spacing);
            world.multiplyMatrices(body, local);
            cleats.setMatrixAt(nc++, world);
          }
        }

        dummy.position.set(t.x + t.ox + 0.07, 0.008, t.z + t.oz + 0.1);
        dummy.scale.set(pop, 1, pop);
        dummy.updateMatrix();
        shadows.setMatrixAt(ns++, dummy.matrix);

        if (t === player && t.shield > 0) {
          shield.visible = true;
          shield.position.set(t.x + t.ox, 0.3, t.z + t.oz);
          shield.rotation.set(clock * 0.7, clock * 1.9, 0);
          const blink = t.shield < 1.2 && Math.floor(clock * 10) % 2 === 0;
          shieldMaterial.opacity = blink ? 0.15 : 0.45 + Math.sin(clock * 20) * 0.12;
        }
      }

      for (let k = 0; k < bodies.length; k++) {
        bodies[k].count = counts[k];
        bodies[k].instanceMatrix.needsUpdate = true;
        bodies[k].instanceColor.needsUpdate = true;
      }
      cleats.count = nc;
      cleats.instanceMatrix.needsUpdate = true;
      shadows.count = ns;
      shadows.instanceMatrix.needsUpdate = true;
      sparkles.count = nw;
      sparkles.instanceMatrix.needsUpdate = true;
      sparkles.instanceColor.needsUpdate = true;
    },
  };

  return tanks;
}
