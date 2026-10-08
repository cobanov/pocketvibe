// Plays a game in headless Chrome on every handheld screen shape and saves
// screenshots: one PNG per shape and step, plus a sheet with all four shapes
// side by side.
//
// Usage: node tools/game-shots.mjs <game folder or URL> <outDir> <step>...
//   step = "key:KeyX" (press and release) | "hold:KeyX:800" (hold for ms)
//        | "down:ArrowLeft" | "up:ArrowLeft" | "wait:1500" | "shot:title"
//   ASPECTS=3:2,1:1 limits the shapes. PERF=1 shows the performance overlay.
// A game folder is served with its own Vite dev server, so edits show without
// a build. Keys are the desktop keyboard's: X is A, Z is B, Enter is START.
// The game runs as on the handheld (?handheld&screen=WxH), so the screenshot
// is exactly the game's screen.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// ds is a 4:3 screen with a second one below it, as the RG DS gives games
// that use two screens ("screens": 2).
const SHAPES = { '3:2': [720, 480], '4:3': [720, 540], '16:9': [854, 480], '1:1': [720, 720], ds: [720, 1080] };
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const [target, outArg, ...steps] = process.argv.slice(2);
if (!target || !outArg) {
  console.error('Usage: node tools/game-shots.mjs <game folder or URL> <outDir> <step>...');
  process.exit(1);
}
const outDir = resolve(outArg);
mkdirSync(outDir, { recursive: true });
const shapes = (process.env.ASPECTS ?? Object.keys(SHAPES).join(',')).split(',').filter((s) => SHAPES[s]);

const freePort = () =>
  new Promise((r) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => r(port));
    });
  });

const children = [];
const cleanup = () => children.forEach((c) => c.kill('SIGKILL'));
process.on('exit', cleanup);

// Serve a game folder with Vite.
let base = target;
if (existsSync(join(target, 'package.json'))) {
  const port = await freePort();
  const vite = spawn(join(resolve(target), 'node_modules/.bin/vite'), ['--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: target,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(vite);
  base = await new Promise((r, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite did not start')), 20000);
    vite.stdout.on('data', (d) => {
      if (String(d).includes('Local')) {
        clearTimeout(timer);
        r(`http://127.0.0.1:${port}/`);
      }
    });
  });
}

// One headless Chrome; a free debugging port, so several runs can go at once.
const profile = mkdtempSync(join(tmpdir(), 'game-shots-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
children.push(chrome);
let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(100);
  try {
    const [port] = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    wsUrl = pages.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch {
    // Not up yet.
  }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await send('Runtime.enable');
await send('Page.enable');

const key = (type, code) => send('Input.dispatchKeyEvent', { type, code, key: code, windowsVirtualKeyCode: 0 });
const shots = {}; // name -> { shape: base64 png }

for (const shape of shapes) {
  const [width, height] = SHAPES[shape];
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const url = new URL(base);
  url.searchParams.set('handheld', '');
  url.searchParams.set('screen', shape === 'ds' ? '720x540' : `${width}x${height}`);
  if (shape === 'ds') url.searchParams.set('second', '720x540');
  if (process.env.PERF) url.searchParams.set('perf', ''); // the overlay: draw calls and triangles
  await send('Page.navigate', { url: url.href });
  await sleep(2500);
  for (const step of steps) {
    const [kind, arg, ms] = step.split(':');
    if (kind === 'wait') await sleep(Number(arg));
    if (kind === 'down') await key('keyDown', arg);
    if (kind === 'up') await key('keyUp', arg);
    if (kind === 'key' || kind === 'hold') {
      await key('keyDown', arg);
      await sleep(kind === 'hold' ? Number(ms) : 120);
      await key('keyUp', arg);
      await sleep(kind === 'hold' ? 100 : 400);
    }
    if (kind === 'shot') {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(outDir, `${arg}-${shape.replace(':', 'x')}.png`), Buffer.from(data, 'base64'));
      (shots[arg] ??= {})[shape] = data;
    }
  }
}

// A sheet per step: the shapes side by side at half size, labelled.
await send('Emulation.setDeviceMetricsOverride', { width: 3120, height: 800, deviceScaleFactor: 1, mobile: false });
for (const [name, byShape] of Object.entries(shots)) {
  const cells = Object.entries(byShape)
    .map(([shape, data]) => `<figure><img src="data:image/png;base64,${data}"><figcaption>${shape}</figcaption></figure>`)
    .join('');
  const html = `<body style="margin:0;background:#333;display:flex;gap:16px;padding:16px;font:bold 22px sans-serif;color:#ddd;align-items:flex-start">${cells}<style>figure{margin:0}img{display:block;outline:2px solid #888}figcaption{padding:4px 0}</style></body>`;
  const { frameTree } = await send('Page.getFrameTree');
  await send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
  await sleep(300);
  const { data } = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 3120, height: 800, scale: 0.5 } });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`saved ${join(outDir, `${name}.png`)}`);
}

for (const e of [...new Set(errors)]) console.log('ERROR', e);
ws.close();
cleanup();
rmSync(profile, { recursive: true, force: true });
process.exit(0);
