// Testing only (loaded in development, never in the built game): plays the
// game by trying moves on copies of the runner against where the obstacles
// will be, a little over a second ahead. If it can get through every
// pattern at every stage, a player can too. It only sees what is nearer
// than `vision`, about where the fog is thick, and it keeps `slack`
// seconds of room before and after each obstacle, as a player would.

import { copyRunner, newRunner, stepRunner } from './player.js';

const DECIDE = 6; // frames between decisions
const DEPTH = 13; // decisions looked ahead
const NODES = 40000; // search budget per decision

const NONE = 0;
const JUMP = 1;
const SLIDE = 2;
const LEFT = 3;
const RIGHT = 4;
const ORDER = [NONE, JUMP, SLIDE, LEFT, RIGHT];
const ACTS = [
  { left: false, right: false, jump: false, slide: false },
  { left: false, right: false, jump: true, slide: false },
  { left: false, right: false, jump: false, slide: true },
  { left: true, right: false, jump: false, slide: false },
  { left: false, right: true, jump: false, slide: false },
];

export function createAutopilot(track, { vision = 48, slack = 0.08 } = {}) {
  const states = Array.from({ length: DEPTH + 2 }, newRunner);
  const failed = new Set();
  let nodes = 0;
  let frame = 0;
  let next = NONE;
  let deepest = 0;
  let deepestFirst = NONE;
  let speed = 0;
  let pad = 0; // units added before and after each obstacle in this search
  let DT = 1 / 60; // the average frame time, as the game runs now

  const pressed = { LEFT: false, RIGHT: false, A: false, UP: false, DOWN: false };
  const fake = { pressed: (button) => pressed[button] === true };

  const key = (s, depth) =>
    `${depth}|${s.lane}|${Math.round(s.x * 10)}|${Math.round(s.y * 10)}|${Math.round(s.vy)}|${Math.round(s.slide * 20)}|${s.jumpBuffer > 0 ? 1 : 0}|${s.slideOnLanding ? 1 : 0}`;

  // True if some way of playing from state s survives to the horizon.
  function search(depth, s, ahead, first) {
    if (depth > deepest) {
      deepest = depth;
      deepestFirst = first;
    }
    if (depth === DEPTH) return true;
    if (++nodes > NODES) return false;
    const k = key(s, depth);
    if (failed.has(k)) return false;
    for (const a of ORDER) {
      if (a === LEFT && s.lane === 0) continue;
      if (a === RIGHT && s.lane === 2) continue;
      const n = copyRunner(states[depth + 1], s);
      let ok = true;
      let ah = ahead;
      for (let f = 0; f < DECIDE; f++) {
        stepRunner(n, DT, ACTS[f === 0 ? a : NONE]);
        ah += speed * DT;
        if (track.touching(n, ah, speed * DT, vision, pad)) {
          ok = false;
          break;
        }
      }
      if (ok && search(depth + 1, n, ah, depth === 0 ? a : first)) {
        if (depth === 0) next = a;
        return true;
      }
    }
    failed.add(k);
    return false;
  }

  return {
    // The buttons to press this frame, as an object like the handheld's input.
    think(runner, runSpeed, dt = 1 / 60) {
      speed = runSpeed;
      DT += (Math.min(1 / 20, Math.max(1 / 120, dt)) - DT) * 0.05;
      pressed.LEFT = pressed.RIGHT = pressed.A = pressed.UP = pressed.DOWN = false;
      if (frame++ % DECIDE !== 0) return fake;
      // With room to spare if it can, else with none, else what survives longest.
      let found = false;
      for (const room of [slack * speed, 0]) {
        failed.clear();
        nodes = 0;
        deepest = 0;
        deepestFirst = NONE;
        next = NONE;
        pad = room;
        if (search(0, copyRunner(states[0], runner), 0, NONE)) {
          found = true;
          if (room === 0) this.tight++;
          break;
        }
      }
      if (!found) {
        next = deepestFirst;
        this.stuck++;
      }
      if (next === JUMP) pressed.A = true;
      else if (next === SLIDE) pressed.DOWN = true;
      else if (next === LEFT) pressed.LEFT = true;
      else if (next === RIGHT) pressed.RIGHT = true;
      return fake;
    },

    stuck: 0, // decisions where no way through was found
    tight: 0, // decisions where only a way without room to spare was found

    get lastNodes() {
      return nodes;
    },
  };
}
