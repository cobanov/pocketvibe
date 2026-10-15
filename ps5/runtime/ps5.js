// The DualSense as a Gamepad API "standard" pad, read once per frame from the
// native host. Optional settings come from config.js (see app/main.c):
//   PV_SEARCH   the game's URL query, e.g. '?handheld&screen=854x480'
//   PV_AUTOPLAY presses A every 25 frames, for unattended measurements
//   PV_SECONDS  closes the app after this many seconds

(() => {
  const g = globalThis;
  // scePad button bits in the order of the Gamepad API's standard mapping,
  // as PocketVibe reads it (0 B, 1 A, 2 X, 3 Y): on a PlayStation, Cross
  // confirms (A) and Circle goes back (B); Square is X and Triangle Y. Then
  // L1, R1, L2, R2, touch pad (Select), Options (Start), L3, R3, the D-pad.
  const BITS = [0x2000, 0x4000, 0x8000, 0x1000, 0x400, 0x800, 0x100, 0x200, 0x100000, 0x8, 0x2, 0x4, 0x10, 0x40, 0x80, 0x20];
  const pad = {
    id: 'DualSense', index: 0, connected: false, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: BITS.map(() => ({ pressed: false, touched: false, value: 0 })),
  };
  const axis = (v) => {
    const a = (v - 127.5) / 127.5;
    return Math.abs(a) < 0.15 ? 0 : a;
  };

  // fetch reads the page's own files: a game's sounds and music, relative to
  // its folder. pocketvibed's unlock-audio call answers fine.
  g.__baseDir = g.__gameDir ?? (g.__storageName && g.__storageName !== 'launcher' ? `/app0/assets/js/games/${g.__storageName}/` : '/app0/assets/js/launcher/');
  const fileResponse = (path) => {
    let bytes;
    const body = () => (bytes ??= __ps5.readBinary(path));
    const ok = body() !== null;
    return {
      ok, status: ok ? 200 : 404, statusText: ok ? 'OK' : 'Not Found', url: path,
      headers: { get: () => null },
      arrayBuffer: async () => body(),
      text: async () => __ps5.readText(path) ?? '',
      json: async () => JSON.parse(__ps5.readText(path) ?? 'null'),
      blob: async () => ({ arrayBuffer: async () => body() }),
    };
  };
  g.fetch = async (input) => {
    const url = String(input?.url ?? input);
    if (url.includes('/__pocketvibe__/')) return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
    const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/^\.\//, '').replace(/^\/+/, '');
    if (path.includes('..')) return fileResponse('');
    return fileResponse(`${g.__baseDir}${path.split('?')[0]}`);
  };

  let frame = 0;
  const start = __now();
  g.__pads = () => [pad];
  const tick = g.__frame;
  g.__frame = (now) => {
    const [buttons, lx, ly, rx, ry, l2, r2, connected] = __padState();
    pad.connected = !!connected;
    pad.timestamp = now;
    BITS.forEach((bit, i) => {
      const b = pad.buttons[i];
      b.pressed = b.touched = (buttons & bit) !== 0;
      b.value = i === 6 ? l2 / 255 : i === 7 ? r2 / 255 : +b.pressed;
    });
    pad.axes[0] = axis(lx);
    pad.axes[1] = axis(ly);
    pad.axes[2] = axis(rx);
    pad.axes[3] = axis(ry);
    if (g.PV_AUTOPLAY && frame % 25 === 0) pad.buttons[1].pressed = true;
    frame++;
    if (g.PV_SECONDS && now - start > g.PV_SECONDS * 1000) __ps5.exit();
    tick(now);
  };
})();
