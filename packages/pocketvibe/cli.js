#!/usr/bin/env node
// The PocketVibe command line tool.
//
//   pocketvibe publish [dir]            build the game in dir and upload it to the store
//   pocketvibe status                   your games and your uploads
//   pocketvibe pending                  (store admin) uploads waiting for review
//   pocketvibe approve <id> <version>   (store admin) publish an upload
//   pocketvibe reject <id> <version> [reason]
//
// You sign in with GitHub: the token comes from $GITHUB_TOKEN, or from the
// GitHub CLI (`gh auth token`). The store only asks GitHub who you are.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { zipSync } from 'fflate';

const STORE = (process.env.POCKETVIBE_STORE ?? 'https://pocketvibe-store.mertcobanov.workers.dev').replace(/\/$/, '');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    fail('Sign in with GitHub first: install the GitHub CLI and run `gh auth login`, or set GITHUB_TOKEN.');
  }
}

async function call(path, { method = 'GET', body, type } = {}) {
  const headers = { Authorization: `Bearer ${githubToken()}` };
  if (type) headers['Content-Type'] = type;
  const res = await fetch(`${STORE}${path}`, { method, headers, body });
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

async function publish(dir = '.') {
  const project = resolve(dir);
  const manifestPath = ['pocketvibe.json', 'openboy.json'].map((n) => join(project, n)).find(existsSync);
  if (!manifestPath) fail(`No pocketvibe.json in ${project}.`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id ?? '')) fail('pocketvibe.json: id must be lowercase letters, digits and dashes.');
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? '')) fail('pocketvibe.json: version must look like 1.0.0.');
  if (!manifest.title) fail('pocketvibe.json: title is missing.');

  // Build into a temporary folder, leaving the project's own dist/ alone.
  const out = mkdtempSync(join(tmpdir(), 'pocketvibe-'));
  try {
    console.log(`Building ${manifest.title} ${manifest.version}...`);
    execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'warn'], { cwd: project, stdio: 'inherit' });
    writeFileSync(join(out, 'pocketvibe.json'), JSON.stringify({ entry: 'index.html', ...manifest }, null, 2));
    for (const cover of ['cover.png', 'cover.jpg']) {
      if (existsSync(join(project, cover))) writeFileSync(join(out, cover), readFileSync(join(project, cover)));
    }
    const zip = zipSync(collect(out), { level: 9 });
    console.log(`Uploading ${(zip.length / 1e6).toFixed(2)} MB to ${STORE}...`);
    const result = await call('/api/publish', { method: 'POST', body: zip, type: 'application/zip' });
    console.log(`${manifest.title} ${result.version}: ${result.message}`);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
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
}

async function review(action, id, version, note) {
  if (!id || !version) fail(`Usage: pocketvibe ${action} <id> <version>${action === 'reject' ? ' [reason]' : ''}`);
  const result = await call('/api/admin/review', {
    method: 'POST',
    type: 'application/json',
    body: JSON.stringify({ id, version, action, note }),
  });
  console.log(`${id} ${version}: ${result.status}`);
}

const [command, ...args] = process.argv.slice(2);
const commands = {
  publish: () => publish(args[0]),
  status,
  pending,
  approve: () => review('approve', ...args),
  reject: () => review('reject', args[0], args[1], args.slice(2).join(' ')),
};
if (!commands[command]) {
  console.log(`PocketVibe: web games on handheld consoles running ROCKNIX.

  npm create pocketvibe@latest my-game   start a new game
  pocketvibe publish [dir]               upload your game to the store
  pocketvibe status                      your games and uploads

Store: ${STORE}`);
  process.exit(command ? 1 : 0);
}
await commands[command]();
