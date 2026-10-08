#!/usr/bin/env node
// The PocketVibe command line tool.
//
//   pocketvibe serve [dir] [--port N]   play the game in dir on your own handheld
//   pocketvibe publish [dir]            build the game in dir and upload it to the store
//   pocketvibe status                   your games and your uploads
//   pocketvibe pending                  (store admin) uploads waiting for review
//   pocketvibe review <id> <version>    (store admin) play an upload on a handheld
//   pocketvibe approve <id> <version>   (store admin) publish an upload
//   pocketvibe reject <id> <version> [reason]
//
// You sign in with GitHub: the token comes from $GITHUB_TOKEN, or from the
// GitHub CLI (`gh auth token`). The store only asks GitHub who you are.
//
// serve and review run a small store on this computer: added in the
// handheld's PocketVibe (Settings > Stores), it lists the one game, which
// then installs like any other.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { hostname, networkInterfaces, tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { zipSync } from 'fflate';

const STORE = (process.env.POCKETVIBE_STORE ?? 'https://pocketvibe-store.mertcobanov.workers.dev').replace(/\/$/, '');
const SERVE_PORT = 8740;

// Thrown for problems the user can fix; printed without a stack trace.
class Failure extends Error {}

function fail(message) {
  throw new Failure(message);
}

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    fail('Sign in with GitHub first: install the GitHub CLI and run `gh auth login`, or set GITHUB_TOKEN.');
  }
}

async function request(path, { method = 'GET', body, type } = {}) {
  // The token is a GitHub sign-in: never send it unencrypted.
  if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(STORE)) fail(`The store address must start with https://, not ${STORE}.`);
  const headers = { Authorization: `Bearer ${githubToken()}` };
  if (type) headers['Content-Type'] = type;
  return fetch(`${STORE}${path}`, { method, headers, body }).catch(() => fail(`Cannot reach the store at ${STORE}.`));
}

async function call(path, options) {
  const res = await request(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`Store: ${data.error ?? res.statusText}`);
  return data;
}

// Every file under dir, as zip entries keyed by their path inside the zip.
function collect(dir, base = dir, entries = {}) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collect(path, base, entries);
    else entries[relative(base, path).split('\\').join('/')] = readFileSync(path);
  }
  return entries;
}

function readManifest(project) {
  const manifestPath = ['pocketvibe.json', 'openboy.json'].map((n) => join(project, n)).find(existsSync);
  if (!manifestPath) fail(`No pocketvibe.json in ${project}.`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    fail('pocketvibe.json is not valid JSON.');
  }
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id ?? '')) fail('pocketvibe.json: id must be lowercase letters, digits and dashes.');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) fail('pocketvibe.json: version must look like 1.0.0.');
  if (!manifest.title) fail('pocketvibe.json: title is missing.');
  return manifest;
}

// Builds the game with the project's own Vite into a temporary folder (the
// project's dist/ is left alone) and packs it the way the store wants it:
// the build, pocketvibe.json and the cover, in one zip.
function build(project, { quiet = false } = {}) {
  const manifest = readManifest(project);
  const out = mkdtempSync(join(tmpdir(), 'pocketvibe-'));
  try {
    // The project's own Vite, run by this Node: the same on every system.
    const vite = join(project, 'node_modules', 'vite', 'bin', 'vite.js');
    if (!existsSync(vite)) fail(`Vite is not installed in ${project}. Run npm install there first.`);
    try {
      execFileSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir', '--logLevel', quiet ? 'error' : 'warn'], { cwd: project, stdio: 'inherit' });
    } catch {
      fail('The build failed; see the messages above.');
    }
    writeFileSync(join(out, 'pocketvibe.json'), JSON.stringify({ entry: 'index.html', ...manifest }, null, 2));
    let cover = null;
    for (const name of ['cover.png', 'cover.jpg']) {
      if (existsSync(join(project, name))) {
        cover = readFileSync(join(project, name));
        writeFileSync(join(out, name), cover);
        break;
      }
    }
    return { manifest, zip: zipSync(collect(out), { level: 9 }), cover };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

async function publish(dir = '.') {
  const project = resolve(dir);
  console.log(`Building ${readManifest(project).title}...`);
  const { manifest, zip } = build(project);
  console.log(`Uploading ${(zip.length / 1e6).toFixed(2)} MB to ${STORE}...`);
  const result = await call('/api/publish', { method: 'POST', body: zip, type: 'application/zip' });
  console.log(`${manifest.title} ${result.version}: ${result.message}`);
  if (result.status !== 'published') console.log('`npx pocketvibe status` shows where it is.');
}

async function status() {
  const { login, games, releases } = await call('/api/me');
  console.log(`Signed in as ${login}.\n`);
  console.log(games.length ? 'Your games:' : 'No published games yet.');
  for (const g of games) console.log(`  ${g.title} (${g.id}) v${g.version}, ${g.downloads} downloads`);
  if (releases.length) console.log('\nYour uploads:');
  for (const r of releases) console.log(`  ${r.game_id} ${r.version}: ${r.status}${r.note ? ` (${r.note})` : ''}`);
}

async function pending() {
  const { pending: list } = await call('/api/admin/pending');
  if (!list.length) return console.log('Nothing waiting for review.');
  for (const r of list) console.log(`${r.game_id} ${r.version} by ${r.uploader}: ${r.manifest.title}, ${(r.size / 1e6).toFixed(2)} MB`);
  console.log('\n`pocketvibe review <id> <version>` puts one on your handheld to try.');
}

async function decide(action, id, version, note) {
  if (!id || !version) fail(`Usage: pocketvibe ${action} <id> <version>${action === 'reject' ? ' [reason]' : ''}`);
  const result = await call('/api/admin/review', {
    method: 'POST',
    type: 'application/json',
    body: JSON.stringify({ id, version, action, note }),
  });
  console.log(`${id} ${version}: ${result.status}`);
}

// ---------- A store on this computer ----------

// This computer's addresses on the local network (and Tailscale's), the
// ones a handheld can reach.
function addresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

// Serves a catalog with one game, its zip and its cover. game() gives the
// current { entry, zip, cover }; entry is the game's catalog listing without
// its addresses, which follow the address the handheld used.
function serveStore(name, port, game) {
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    const current = game();
    const send = (status, type, body) => {
      res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', Buffer.from('not allowed'));
    if (path === '/' || path === '/catalog.json') {
      const base = `http://${req.headers.host}`;
      const games = current
        ? [{
            ...current.entry,
            download: `${base}/game.zip?v=${encodeURIComponent(current.entry.version)}`,
            ...(current.cover && { cover: `${base}/cover?v=${encodeURIComponent(current.entry.version)}` }),
          }]
        : [];
      console.log(`${new Date().toLocaleTimeString()} ${req.socket.remoteAddress?.replace('::ffff:', '')} looked at the store`);
      return send(200, 'application/json', Buffer.from(JSON.stringify({ name, games })));
    }
    if (path === '/game.zip' && current) {
      console.log(`${new Date().toLocaleTimeString()} ${req.socket.remoteAddress?.replace('::ffff:', '')} downloads ${current.entry.title} ${current.entry.version}`);
      return send(200, 'application/zip', Buffer.from(current.zip));
    }
    if (path === '/cover' && current?.cover) {
      const png = current.cover[0] === 0x89 && current.cover[1] === 0x50;
      return send(200, png ? 'image/png' : 'image/jpeg', Buffer.from(current.cover));
    }
    return send(404, 'text/plain', Buffer.from('not found'));
  });
  return new Promise((done, reject) => {
    server.on('error', (e) => reject(e.code === 'EADDRINUSE' ? new Failure(`Port ${port} is taken; choose another with --port.`) : e));
    server.listen(port, '0.0.0.0', () => done(server));
  });
}

function printAddresses(port) {
  const list = addresses();
  if (!list.length) fail('This computer is not on a network the handheld could reach.');
  console.log('\nOn the handheld, open PocketVibe, then Settings > Stores > Add a store, and type:\n');
  for (const address of list) console.log(`    http://${address}${port === 80 ? '' : `:${port}`}`);
  console.log(
    `\n${list.length > 1 ? 'Use the address on the same network as the handheld. ' : ''}` +
      'The game is then in the Store tab: A downloads it. Keep this running while you play.\n',
  );
}

// The game as a catalog entry, under its own id and name (my-game-dev, "My
// Game (dev)"): it installs beside the store's copy, if there is one, with
// its own saves, and the handheld cannot mistake one for the other.
function catalogEntry(manifest, zip, version, kind) {
  const { id, title, author, description, genre, controls, entry } = manifest;
  return {
    id: `${id.slice(0, 63 - kind.length)}-${kind}`,
    title: `${title} (${kind})`,
    ...(author && { author }),
    version,
    ...(description && { description }),
    ...(genre && { genre }),
    ...(controls && { controls }),
    entry: entry ?? 'index.html',
    size: zip.length,
    sha256: createHash('sha256').update(zip).digest('hex'),
    updated: new Date().toISOString(),
  };
}

function portOption(args) {
  const i = args.indexOf('--port');
  if (i < 0) return { port: SERVE_PORT, rest: args };
  const port = Number(args[i + 1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('--port needs a number, like --port 8741.');
  return { port, rest: args.filter((_, j) => j !== i && j !== i + 1) };
}

// Builds the game, serves it to the handheld and builds it again whenever a
// file changes. Each build gets its own version (1.0.0-dev.<time>), so the
// handheld's Store offers it as an update.
async function serve(args) {
  const { port, rest } = portOption(args);
  const project = resolve(rest[0] ?? '.');
  let current = null;
  let building = false;
  let again = false;

  const rebuild = () => {
    if (building) {
      again = true;
      return;
    }
    building = true;
    try {
      const { manifest, zip, cover } = build(project, { quiet: true });
      const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      current = { entry: catalogEntry(manifest, zip, `${manifest.version}-dev.${stamp}`, 'dev'), zip, cover };
      console.log(`${new Date().toLocaleTimeString()} built ${manifest.title} ${current.entry.version} (${(zip.length / 1e6).toFixed(2)} MB)`);
    } catch (e) {
      if (!(e instanceof Failure)) throw e;
      console.error(`${new Date().toLocaleTimeString()} ${e.message} The handheld keeps the last build.`);
    } finally {
      building = false;
    }
    if (again) {
      again = false;
      rebuild();
    }
  };

  console.log(`Building ${readManifest(project).title}...`);
  rebuild();
  if (!current) process.exit(1);
  await serveStore(`${readManifest(project).title} on ${hostname().replace(/\.local$/, '')}`, port, () => current);
  printAddresses(port);
  console.log('Change the game and it is built again; the Store then offers the new build as an update.\n');

  // Build again a moment after the last change (an editor or an AI tool may
  // write several files).
  const ignored = ['node_modules', 'dist', '.git'];
  let timer = null;
  watch(project, { recursive: true }, (_, file) => {
    if (!file || ignored.includes(String(file).split(sep)[0]) || String(file).split(sep).some((p) => p.startsWith('.'))) return;
    clearTimeout(timer);
    timer = setTimeout(rebuild, 400);
  });
}

// The store admin plays an upload before approving it: the upload's own zip,
// served to the handheld like `serve` does.
async function review(args) {
  const { port, rest } = portOption(args);
  const [id, version] = rest;
  if (!id || !version) fail('Usage: pocketvibe review <id> <version> [--port N]');
  const { pending: list } = await call('/api/admin/pending');
  const upload = list.find((r) => r.game_id === id && r.version === version);
  if (!upload) fail(`No upload of ${id} ${version} is waiting for review. \`pocketvibe pending\` lists them.`);
  const fetchFile = async (key) => {
    const res = await request(`/api/admin/files/${key}`);
    if (!res.ok) fail(`Store: could not get ${key} (${res.status}).`);
    return new Uint8Array(await res.arrayBuffer());
  };
  console.log(`Downloading ${upload.manifest.title} ${version} by ${upload.uploader}...`);
  const zip = await fetchFile(upload.zip_key);
  const cover = upload.cover_key ? await fetchFile(upload.cover_key) : null;
  const entry = catalogEntry(upload.manifest, zip, version, 'review');
  await serveStore(`Review: ${upload.manifest.title}`, port, () => ({ entry, zip, cover }));
  printAddresses(port);
  console.log(`When you have played it: pocketvibe approve ${id} ${version}, or pocketvibe reject ${id} ${version} "why".\n`);
}

const [command, ...args] = process.argv.slice(2);
const commands = {
  serve: () => serve(args),
  publish: () => publish(args[0]),
  status,
  pending,
  review: () => review(args),
  approve: () => decide('approve', ...args),
  reject: () => decide('reject', args[0], args[1], args.slice(2).join(' ')),
};
if (!commands[command]) {
  console.log(`PocketVibe: three.js games on handhelds with ROCKNIX or Android.

  npm create pocketvibe@latest my-game   start a new game
  pocketvibe serve [dir]                 play your game on your own handheld
  pocketvibe publish [dir]               send your game to the store
  pocketvibe status                      your games and uploads

Store: ${STORE}`);
  process.exit(command ? 1 : 0);
}
try {
  await commands[command]();
} catch (e) {
  if (!(e instanceof Failure)) throw e;
  console.error(e.message);
  process.exitCode = 1;
}
