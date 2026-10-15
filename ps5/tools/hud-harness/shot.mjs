// Screenshots a game's screen in headless Chrome twice per state (title, play,
// pause): Chrome's own HUD, then the PS5 runtime's HUD (hudview.js), for a
// side-by-side check. Usage: node shot.mjs <game> <out-dir> [port]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const [game, out, port = '8766'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--mute-audio', '--no-first-run', '--remote-debugging-port=9333',
  `--user-data-dir=${out}/profile`, '--window-size=1400,900', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let targets;
  for (let i = 0; i < 40 && !targets; i++) {
    await sleep(250);
    targets = await fetch('http://127.0.0.1:9333/json/list').then((r) => r.json()).catch(() => null);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

  await send('Page.navigate', { url: `http://127.0.0.1:${port}/${game}/index.html?handheld&screen=1280x720&hudview` });
  for (let i = 0; i < 40 && !(await evaluate('!!window.__shotReady')); i++) await sleep(250);
  await sleep(1500);
  const rect = await evaluate('(() => { const r = document.getElementById("screen").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()');
  for (const state of ['title', 'play', 'pause']) {
    for (const mode of ['chrome', 'ours']) {
      await evaluate(`__mode('${mode}')`);
      await sleep(150);
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
      writeFileSync(`${out}/${game}-${state}-${mode}.png`, Buffer.from(shot.result.data, 'base64'));
    }
    const err = await evaluate('window.__hudError || ""');
    if (err) console.log(`${state}: ${err}`);
    await evaluate("__press('Enter')");
    await sleep(state === 'title' ? 1200 : 800);
  }
  console.log(`saved ${out}/${game}-*.png`);
  ws.close();
} finally {
  chrome.kill();
}
