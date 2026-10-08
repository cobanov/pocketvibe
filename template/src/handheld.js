// Device layer for handheld games.
//
// Owns the screen (a canvas sized for the handheld's screen), input (gamepad +
// keyboard), the game loop, saving and a performance overlay. Games use this
// module instead of touching the window, the renderer size or input events
// directly, so the same code behaves the same in a desktop browser and on the
// handheld.

import * as THREE from 'three';

// The screen games are designed for (the RG34XX SP's, 3:2). Every screen
// shows at least this much: a wider one adds space at the sides, a taller one
// above and below (see screenSize).
export const SCREEN = { width: 720, height: 480 };

// The shapes of handheld screens (width / height), for trying them in the
// desktop browser: the 3:2 RG34XX SP, the 4:3 RG DS, 16:9 Android handhelds
// and the square RG Rotate.
export const ASPECTS = { '3:2': 3 / 2, '4:3': 4 / 3, '16:9': 16 / 9, '1:1': 1 };

// The game's screen for a display of this shape: 720x480 grown to the shape,
// so 4:3 is 720x540, 16:9 854x480 and 1:1 720x720. Shapes past 1:1 and 2:1
// get those sizes and black bars.
export function screenSize(aspect) {
  const a = Math.min(Math.max(aspect || SCREEN.width / SCREEN.height, 1), 2);
  const even = (n) => Math.round(n / 2) * 2;
  return a >= SCREEN.width / SCREEN.height
    ? { width: even(SCREEN.height * a), height: SCREEN.height }
    : { width: SCREEN.width, height: even(SCREEN.width / a) };
}

// Per-frame performance budget, measured on the RG34XX SP (bench/results/
// 2026-10-08-limits.md). The overlay counts every triangle drawn, also those
// outside the view, which cost almost nothing: if it is red for triangles
// while the frame rate holds, they are off screen.
export const BUDGET = { drawCalls: 100, triangles: 10000, fps: 55 };

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

const params = new URLSearchParams(location.search);
const onDevice = params.has('handheld');

// ?screen=720x540 comes from the PocketVibe game shell, which gives the game
// a frame of that size; ?aspect=4:3 tries a shape in the desktop browser.
// Without either the screen is 720x480, as on the RG34XX SP.
function chooseScreen() {
  const size = /^(\d+)x(\d+)$/.exec(params.get('screen') ?? '');
  if (size) {
    const width = Number(size[1]);
    const height = Number(size[2]);
    if (width >= SCREEN.width && height >= SCREEN.height && width <= 1440 && height <= 1440) return { width, height };
  }
  const aspect = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(params.get('aspect') ?? '');
  if (aspect) return screenSize(Number(aspect[1]) / Number(aspect[2]));
  return { ...SCREEN };
}

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
  el.hidden = onDevice && !params.has('perf');
  parent.appendChild(el);
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyP') el.hidden = !el.hidden;
  });

  // ?perflog writes a PERF line to the console every two seconds, so the
  // frame rate can be read from the handheld's log without looking at it.
  const log = params.has('perflog');
  let frames = 0;
  let windowStart = performance.now();
  let logFrames = 0;
  let logStart = windowStart;
  let last = windowStart;
  let worst = 0;
  return {
    // Called once per frame after the game rendered.
    frame(now) {
      const { calls, triangles } = renderer.info.render;
      if (log) {
        logFrames++;
        worst = Math.max(worst, now - last);
        if (now - logStart >= 2000) {
          const fps = (logFrames * 1000) / (now - logStart);
          console.log(`PERF ${JSON.stringify({ fps: +fps.toFixed(1), worstMs: Math.round(worst), calls, triangles })}`);
          logFrames = 0;
          logStart = now;
          worst = 0;
        }
      }
      last = now;
      frames++;
      if (now - windowStart < 500) return;
      const fps = (frames * 1000) / (now - windowStart);
      frames = 0;
      windowStart = now;
      if (el.hidden) return;
      el.textContent =
        `${fps.toFixed(0)} fps  ${(1000 / fps).toFixed(1)} ms\n` +
        `${calls} draws  ${(triangles / 1000).toFixed(1)}k tris`;
      el.classList.toggle('over', calls > BUDGET.drawCalls || triangles > BUDGET.triangles || fps < BUDGET.fps);
    },
  };
}

// Fit the game's screen into the browser window. On the device the window
// is exactly the game's screen, so nothing is scaled there.
function fitScreen(frame, screen, size) {
  const fit = () => {
    const scale = onDevice ? 1 : Math.min((innerWidth - 48) / size.width, (innerHeight - 96) / size.height, 2);
    frame.style.width = `${size.width * scale}px`;
    frame.style.height = `${size.height * scale}px`;
    screen.style.transform = `scale(${scale})`;
  };
  addEventListener('resize', fit);
  fit();
}

// In the desktop browser, links under the screen switch between the shapes
// of handheld screens.
function addShapeLinks(size) {
  const legend = document.getElementById('legend');
  if (!legend || onDevice) return;
  legend.append(' · Screen');
  for (const [name, aspect] of Object.entries(ASPECTS)) {
    const { width, height } = screenSize(aspect);
    const link = document.createElement('a');
    const url = new URL(location.href);
    url.searchParams.set('aspect', name);
    link.href = url.href;
    link.textContent = name;
    link.style.marginLeft = '6px';
    link.style.color = width === size.width && height === size.height ? '#fff' : '#888';
    link.style.fontWeight = width === size.width && height === size.height ? '700' : '400';
    legend.append(link);
  }
}

// resolution: 0.5 draws the 3D scene at half the screen's size and stretches
// it to the screen. It cuts the cost of drawing by half or more; use it when
// a scene cannot be made cheap enough. The HUD stays sharp.
export function createHandheld({ clearColor = 0x000000, resolution = 1 } = {}) {
  document.body.classList.toggle('handheld', onDevice);
  const frame = document.getElementById('frame');
  const screen = document.getElementById('screen');
  const hud = document.getElementById('hud');
  const size = chooseScreen();
  const { width, height } = size;
  const aspect = width / height;
  screen.style.width = `${width}px`;
  screen.style.height = `${height}px`;
  screen.style.setProperty('--screen-width', `${width}px`);
  screen.style.setProperty('--screen-height', `${height}px`);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  // false: the canvas keeps the screen's CSS size, set below.
  renderer.setSize(Math.round(width * resolution), Math.round(height * resolution), false);
  renderer.domElement.style.width = `${width}px`;
  renderer.domElement.style.height = `${height}px`;
  renderer.setClearColor(clearColor);
  // Count draw calls over the whole frame, even if the game renders twice.
  renderer.info.autoReset = false;
  screen.insertBefore(renderer.domElement, hud);

  fitScreen(frame, screen, size);
  addShapeLinks(size);
  const input = createInput();
  const perf = createPerfOverlay(screen, renderer);

  // How much taller than designed the view must be here, so that a part of
  // it `minAspect` wide (width / height) stays in view: 1 on screens at least
  // that wide, more on narrower ones.
  const viewScale = (minAspect = SCREEN.width / SCREEN.height) => Math.max(1, minAspect / aspect);

  return {
    renderer,
    input,
    hud,
    // The game's screen: 720x480 on the RG34XX SP, larger on other shapes
    // (see screenSize). The HUD's coordinate space is this size too.
    width,
    height,
    aspect,
    onDevice,
    viewScale,

    // Sets a camera for this screen. Give the view as designed for the
    // 720x480 screen: a perspective camera's vertical `fov` in degrees, an
    // orthographic camera's `height` in world units (centered on `center`).
    // Left out, they are taken from the camera the first time. The whole
    // designed view stays visible; wider screens show more at the sides,
    // taller ones more above and below. `minAspect` narrows the part that
    // must stay visible (e.g. 1.1 for a board), so that taller screens zoom
    // in on it instead. Call it again whenever the designed view changes.
    fitCamera(camera, { fov, height: viewHeight, center, minAspect } = {}) {
      const design = (camera.userData.design ??= camera.isOrthographicCamera
        ? { height: camera.top - camera.bottom, center: (camera.top + camera.bottom) / 2, middle: (camera.left + camera.right) / 2 }
        : { fov: camera.fov });
      const scale = viewScale(minAspect);
      if (camera.isOrthographicCamera) {
        const half = ((viewHeight ?? design.height) * scale) / 2;
        const y = center ?? design.center;
        camera.top = y + half;
        camera.bottom = y - half;
        camera.left = design.middle - half * aspect;
        camera.right = design.middle + half * aspect;
      } else {
        const tan = Math.tan(THREE.MathUtils.degToRad(fov ?? design.fov) / 2) * scale;
        camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tan));
        camera.aspect = aspect;
      }
      camera.updateProjectionMatrix();
    },

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
