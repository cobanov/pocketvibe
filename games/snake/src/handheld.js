// Device layer for handheld games.
//
// Owns the screen (a fixed 720x480 canvas), input (gamepad + keyboard), the
// game loop, saving and a performance overlay. Games use this module instead
// of touching the window, the renderer size or input events directly, so the
// same code behaves the same in a desktop browser and on the handheld.

import * as THREE from 'three';

export const SCREEN = { width: 720, height: 480 };

// Per-frame performance budget. Provisional numbers: they will be replaced
// with values measured on the Anbernic RG SP.
export const BUDGET = { drawCalls: 100, triangles: 60000 };

export const BUTTONS = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y', 'L', 'R', 'START', 'SELECT'];

// Keyboard layout in the desktop browser. On the device, buttons arrive
// through the Gamepad API or as these same key presses.
const KEYMAP = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  KeyX: 'A',
  KeyZ: 'B',
  KeyS: 'X',
  KeyA: 'Y',
  KeyQ: 'L',
  KeyW: 'R',
  Enter: 'START',
  ShiftLeft: 'SELECT',
  ShiftRight: 'SELECT',
};

// Gamepad API "standard" mapping as the handheld reports it (measured on the
// RG SP under ROCKNIX): A and B come by position (A right, B bottom), X and Y
// by label.
const PADMAP = {
  0: 'B',
  1: 'A',
  2: 'X',
  3: 'Y',
  4: 'L',
  5: 'R',
  8: 'SELECT',
  9: 'START',
  12: 'UP',
  13: 'DOWN',
  14: 'LEFT',
  15: 'RIGHT',
};

const onDevice = new URLSearchParams(location.search).has('handheld');

function createInput() {
  const keys = new Set(); // buttons held on the keyboard
  let held = new Set(); // buttons held this frame, from all sources
  let prev = new Set(); // buttons held last frame
  const dpad = { x: 0, y: 0 };

  addEventListener('keydown', (e) => {
    const button = KEYMAP[e.code];
    if (button) {
      keys.add(button);
      e.preventDefault();
    }
  });
  addEventListener('keyup', (e) => {
    const button = KEYMAP[e.code];
    if (button) {
      keys.delete(button);
      e.preventDefault();
    }
  });
  addEventListener('blur', () => keys.clear());

  return {
    // Called by the loop once per frame, before the game's update.
    poll() {
      const swap = prev;
      prev = held;
      held = swap;
      held.clear();
      for (const button of keys) held.add(button);

      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad) continue;
        pad.buttons.forEach((b, i) => {
          if (b.pressed && PADMAP[i]) held.add(PADMAP[i]);
        });
        // Some devices report the d-pad as the first two axes.
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        if (ax < -0.5) held.add('LEFT');
        if (ax > 0.5) held.add('RIGHT');
        if (ay < -0.5) held.add('UP');
        if (ay > 0.5) held.add('DOWN');
      }

      dpad.x = held.has('RIGHT') - held.has('LEFT');
      dpad.y = held.has('DOWN') - held.has('UP');
    },
    // True while the button is held.
    down: (button) => held.has(button),
    // True only on the frame the button was pressed.
    pressed: (button) => held.has(button) && !prev.has(button),
    // True only on the frame the button was released.
    released: (button) => !held.has(button) && prev.has(button),
    // D-pad direction: x and y are -1, 0 or 1 (y is -1 for UP).
    dpad,
  };
}

function createPerfOverlay(parent, renderer) {
  const el = document.createElement('div');
  el.id = 'perf';
  el.hidden = onDevice && !new URLSearchParams(location.search).has('perf');
  parent.appendChild(el);
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') el.hidden = !el.hidden;
  });

  let frames = 0;
  let windowStart = performance.now();
  return {
    // Called once per frame after the game rendered.
    frame(now) {
      frames++;
      if (now - windowStart < 500 || el.hidden) return;
      const fps = (frames * 1000) / (now - windowStart);
      const { calls, triangles } = renderer.info.render;
      el.textContent =
        `${fps.toFixed(0)} fps  ${(1000 / fps).toFixed(1)} ms\n` +
        `${calls} draws  ${(triangles / 1000).toFixed(1)}k tris`;
      el.classList.toggle('over', calls > BUDGET.drawCalls || triangles > BUDGET.triangles);
      frames = 0;
      windowStart = now;
    },
  };
}

// Fit the 720x480 screen into the browser window. On the device the window
// is exactly 720x480, so nothing is scaled there.
function fitScreen(frame, screen) {
  const fit = () => {
    const scale = onDevice
      ? 1
      : Math.min((innerWidth - 48) / SCREEN.width, (innerHeight - 96) / SCREEN.height, 2);
    frame.style.width = `${SCREEN.width * scale}px`;
    frame.style.height = `${SCREEN.height * scale}px`;
    screen.style.transform = `scale(${scale})`;
  };
  addEventListener('resize', fit);
  fit();
}

export function createHandheld({ clearColor = 0x000000 } = {}) {
  document.body.classList.toggle('handheld', onDevice);
  const frame = document.getElementById('frame');
  const screen = document.getElementById('screen');
  const hud = document.getElementById('hud');

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  // false: keep the CSS size from style.css instead of setting it here.
  renderer.setSize(SCREEN.width, SCREEN.height, false);
  renderer.setClearColor(clearColor);
  // Count draw calls over the whole frame, even if the game renders twice.
  renderer.info.autoReset = false;
  screen.insertBefore(renderer.domElement, hud);

  fitScreen(frame, screen);
  const input = createInput();
  const perf = createPerfOverlay(screen, renderer);

  return {
    renderer,
    input,
    hud,
    width: SCREEN.width,
    height: SCREEN.height,
    onDevice,

    // Runs update(dt) once per frame. dt is in seconds and capped, so a long
    // pause (loading, a hitch) does not make objects jump.
    run(update) {
      let last = performance.now();
      renderer.setAnimationLoop((now) => {
        // A frame's timestamp can be slightly older than the last
        // performance.now() call, so never let dt go negative.
        const dt = Math.min(Math.max(now - last, 0) / 1000, 1 / 20);
        last = now;
        input.poll();
        renderer.info.reset();
        update(dt);
        perf.frame(now);
      });
    },

    save(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Storage can be full or unavailable; the game keeps running.
      }
    },

    load(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
  };
}
