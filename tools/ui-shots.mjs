// Drives the launcher in headless Chrome with key presses and saves screenshots.
// Usage: node ui-shots.mjs <url> <outDir> <step>...   step = "key:KeyW" | "shot:name" | "wait:ms"
// FONTS=<dir> loads DejaVuSans.ttf and DejaVuSans-Bold.ttf from that folder (copy
// them from the handheld's runtime, usr/share/fonts/truetype/dejavu) so text
// takes the same space as on the handheld.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, outDir, ...steps] = process.argv.slice(2);
const port = 9334;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--window-size=720,480', `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'ui-'))}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page;
for (let i = 0; i < 50 && !page; i++) {
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch {}
  await sleep(200);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
  if (msg.method === 'Runtime.exceptionThrown') console.log('EXCEPTION', msg.params.exceptionDetails.exception?.description);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 480, deviceScaleFactor: 1, mobile: false });
if (process.env.FONTS) {
  const face = (file, weight) =>
    `@font-face { font-family: 'DejaVu Sans'; font-weight: ${weight}; src: url(data:font/ttf;base64,${readFileSync(join(process.env.FONTS, file)).toString('base64')}); }`;
  const css = face('DejaVuSans.ttf', '100 599') + face('DejaVuSans-Bold.ttf', '600 900');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.append(s); });`,
  });
}
await send('Page.navigate', { url });
await sleep(2500);
for (const step of steps) {
  const [kind, arg] = step.split(':');
  if (kind === 'wait') await sleep(Number(arg));
  if (kind === 'key') {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: arg, key: arg });
    await sleep(120);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: arg, key: arg });
    await sleep(400);
  }
  if (kind === 'shot') {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${arg}.png`), Buffer.from(data, 'base64'));
    console.log('saved', arg);
  }
}
ws.close();
chrome.kill();
process.exit(0);
