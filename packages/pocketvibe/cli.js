#!/usr/bin/env node
// The PocketVibe command line tool.
//
//   pocketvibe serve [dir] [--port N]   play the game in dir on your own handheld
//   pocketvibe publish [dir]            send the game in dir to the store: a pull request
//                                       to github.com/cobanov/pocketvibe-store
//   pocketvibe status                   your games and your pull requests
//   pocketvibe review <number>          play a store pull request's games on a handheld
//
// The store is a GitHub repository, like F-Droid: each game is a file there
// that points at the game's own public repository and a commit. Publishing
// opens a pull request; the store builds the game from source, and merging
// publishes it. It all goes through the GitHub CLI (`gh`), signed in once
// with `gh auth login`.
//
// serve and review run a small store on this computer: added in the
// handheld's PocketVibe (Settings > Stores), it lists the games, which then
// install like any other.
//
// Older commands for the store's direct uploads, for its admin: pending,
// review <id> <version>, approve and reject <id> <version> [reason].

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { hostname, networkInterfaces, tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { unzipSync, zipSync } from 'fflate';

const STORE = (process.env.POCKETVIBE_STORE ?? 'https://pocketvibe-store.mertcobanov.workers.dev').replace(/\/$/, '');
const SERVE_PORT = 8740;
const STORE_REPO = 'cobanov/pocketvibe-store';
const MAINTAINERS = ['cobanov'];

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

// The GitHub CLI, for the store's repository.
function gh(args, { input } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', input, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    if (e.code === 'ENOENT') fail('This needs the GitHub CLI: install it from https://cli.github.com and run `gh auth login`.');
    const message = String(e.stderr || e.message).trim().split('\n')[0];
    throw new Failure(`GitHub: ${message}`);
  }
}

function git(project, args) {
  return execFileSync('git', ['-C', project, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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

// Sends the game to the store: checks that it builds and has a cover, that
// it is committed and pushed to a public GitHub repository, then opens a pull
// request to the store's repository with the game's file pointing at that
// commit. The same command updates a game: it moves the file to the new commit.
async function publish(dir = '.') {
  const project = resolve(dir);
  const manifest = readManifest(project);
  console.log(`Checking that ${manifest.title} ${manifest.version} builds...`);
  const { cover } = build(project, { quiet: true });
  if (!cover) fail('Add a cover.png (480x270) next to pocketvibe.json: the store shows it.');

  // The game's public repository, and the commit to publish.
  let top;
  try {
    top = git(project, ['rev-parse', '--show-toplevel']);
  } catch {
    fail('The game must be in a public GitHub repository. In its folder: git init, commit it, then `gh repo create <name> --public --source . --push`.');
  }
  let remote = '';
  try {
    remote = git(project, ['remote', 'get-url', 'origin']);
  } catch {
    // No remote yet.
  }
  const match = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) fail("The game's repository has no GitHub remote. Create one: `gh repo create <name> --public --source . --push`.");
  const [, repoOwner, repoName] = match;
  if (git(project, ['status', '--porcelain', '--', '.'])) fail('Commit your changes first: the store builds the game from a commit.');
  // The last commit that changed the game's folder: in a repository with more
  // than one game, commits to the others do not count as changes to this one.
  const commit = git(project, ['log', '-1', '--format=%H', '--', '.']);
  try {
    git(project, ['fetch', '-q', 'origin']);
  } catch {
    // Offline; the check below says what is missing.
  }
  if (!git(project, ['branch', '-r', '--contains', commit])) fail('Push your commits first (git push): the store builds the game from GitHub.');
  if (gh(['repo', 'view', `${repoOwner}/${repoName}`, '--json', 'visibility', '--jq', '.visibility']) !== 'PUBLIC') {
    fail(`github.com/${repoOwner}/${repoName} is private. Store games are open source: make it public (gh repo edit --visibility public --accept-visibility-change-consequences).`);
  }

  const me = gh(['api', 'user', '--jq', '.login']);
  const path = relative(top, project).split(sep).join('/') || '.';
  const file = `games/${manifest.id}.json`;
  let existing = null;
  try {
    existing = JSON.parse(Buffer.from(gh(['api', `repos/${STORE_REPO}/contents/${file}`, '--jq', '.content']), 'base64').toString());
  } catch {
    // A new game.
  }
  if (existing && existing.owner !== me && !MAINTAINERS.includes(me)) fail(`${manifest.id} belongs to ${existing.owner} in the store; choose another id in pocketvibe.json.`);
  if (existing?.source?.commit === commit && existing.source.repo === `https://github.com/${repoOwner}/${repoName}`) {
    fail(`${manifest.title} is already in the store at this commit. Change the game, raise "version" in pocketvibe.json, commit and push, then publish again.`);
  }
  const entry = { id: manifest.id, owner: existing?.owner ?? me, source: { repo: `https://github.com/${repoOwner}/${repoName}`, commit, path } };

  // A branch with the file: in the store's repository for its maintainers,
  // in a fork of it for everyone else.
  const own = MAINTAINERS.includes(me);
  const target = own ? STORE_REPO : `${me}/pocketvibe-store`;
  if (!own) {
    gh(['repo', 'fork', STORE_REPO, '--clone=false']);
    for (let i = 0; ; i++) {
      try {
        gh(['api', '-X', 'POST', `repos/${target}/merge-upstream`, '-f', 'branch=main']);
        break;
      } catch (e) {
        if (i >= 10) throw e;
        await new Promise((r) => setTimeout(r, 2000)); // a new fork takes a moment
      }
    }
  }
  const branch = `${manifest.id}-${manifest.version}`;
  const base = gh(['api', `repos/${target}/git/ref/heads/main`, '--jq', '.object.sha']);
  try {
    gh(['api', `repos/${target}/git/refs`, '-f', `ref=refs/heads/${branch}`, '-f', `sha=${base}`]);
  } catch {
    gh(['api', '-X', 'PATCH', `repos/${target}/git/refs/heads/${branch}`, '-f', `sha=${base}`, '-F', 'force=true']);
  }
  const content = Buffer.from(JSON.stringify(entry, null, 2) + '\n').toString('base64');
  let fileSha = null;
  try {
    fileSha = gh(['api', `repos/${target}/contents/${file}?ref=${branch}`, '--jq', '.sha']);
  } catch {
    // Not on the branch yet.
  }
  const title = `${manifest.title} ${manifest.version}`;
  gh(['api', '-X', 'PUT', `repos/${target}/contents/${file}`, '-f', `message=${title}`, '-f', `content=${content}`, '-f', `branch=${branch}`, ...(fileSha ? ['-f', `sha=${fileSha}`] : [])]);

  const head = own ? branch : `${me}:${branch}`;
  const body = `${existing ? 'Updates' : 'Adds'} **${manifest.title}** ${manifest.version}${manifest.description ? `: ${manifest.description}` : ''}\n\n` +
    `Source: ${entry.source.repo}/tree/${commit}${path === '.' ? '' : `/${path}`}\n\nOpened with \`npx pocketvibe publish\`.`;
  let url;
  try {
    url = gh(['pr', 'create', '--repo', STORE_REPO, '--head', head, '--base', 'main', '--title', title, '--body', body]);
  } catch {
    // The pull request for this version is already open: the branch update above updated it.
    url = gh(['pr', 'view', head, '--repo', STORE_REPO, '--json', 'url', '--jq', '.url']);
  }
  console.log(`\nPull request: ${url}`);
  console.log('The store builds and checks your game there. Once it is reviewed and merged, it is in the store on every handheld.');
}

async function status() {
  const { login, games, releases } = await call('/api/me');
  console.log(`Signed in as ${login}.\n`);
  console.log(games.length ? 'Your games in the store:' : 'No games in the store yet.');
  for (const g of games) console.log(`  ${g.title} (${g.id}) v${g.version}, ${g.downloads} downloads`);
  const prs = JSON.parse(gh(['pr', 'list', '--repo', STORE_REPO, '--author', '@me', '--state', 'all', '--limit', '20', '--json', 'number,title,state,url']));
  if (prs.length) console.log('\nYour pull requests to the store:');
  for (const pr of prs) console.log(`  #${pr.number} ${pr.title}: ${pr.state.toLowerCase()} ${pr.url}`);
  if (releases.length) console.log('\nYour direct uploads:');
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

// Serves a catalog of games with their zips and covers. games() gives the
// current [{ entry, zip, cover }]; an entry is a game's catalog listing
// without its addresses, which follow the address the handheld used.
function serveStore(name, port, games) {
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0];
    const current = games();
    const send = (status, type, body) => {
      res.writeHead(status, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const who = req.socket.remoteAddress?.replace('::ffff:', '');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', Buffer.from('not allowed'));
    if (path === '/' || path === '/catalog.json') {
      const base = `http://${req.headers.host}`;
      const list = current.map(({ entry, cover }) => ({
        ...entry,
        download: `${base}/game/${entry.id}.zip?v=${encodeURIComponent(entry.version)}`,
        ...(cover && { cover: `${base}/cover/${entry.id}?v=${encodeURIComponent(entry.version)}` }),
      }));
      console.log(`${new Date().toLocaleTimeString()} ${who} looked at the store`);
      return send(200, 'application/json', Buffer.from(JSON.stringify({ name, games: list })));
    }
    const zip = path.match(/^\/game\/([a-z0-9-]+)\.zip$/);
    const coverPath = path.match(/^\/cover\/([a-z0-9-]+)$/);
    const game = current.find((g) => g.entry.id === (zip?.[1] ?? coverPath?.[1]));
    if (zip && game) {
      console.log(`${new Date().toLocaleTimeString()} ${who} downloads ${game.entry.title} ${game.entry.version}`);
      return send(200, 'application/zip', Buffer.from(game.zip));
    }
    if (coverPath && game?.cover) {
      const png = game.cover[0] === 0x89 && game.cover[1] === 0x50;
      return send(200, png ? 'image/png' : 'image/jpeg', Buffer.from(game.cover));
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
  await serveStore(`${readManifest(project).title} on ${hostname().replace(/\.local$/, '')}`, port, () => (current ? [current] : []));
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
  if (rest.length === 1 && /^\d+$/.test(rest[0])) return reviewPullRequest(Number(rest[0]), port);
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
  await serveStore(`Review: ${upload.manifest.title}`, port, () => [{ entry, zip, cover }]);
  printAddresses(port);
  console.log(`When you have played it: pocketvibe approve ${id} ${version}, or pocketvibe reject ${id} ${version} "why".\n`);
}

// Anyone can play a store pull request's games before it is merged: the zips
// its check built from source, served to the handheld like `serve` does.
async function reviewPullRequest(number, port) {
  const pr = JSON.parse(gh(['pr', 'view', String(number), '--repo', STORE_REPO, '--json', 'title,author,headRefOid,url']));
  const runs = JSON.parse(gh(['api', `repos/${STORE_REPO}/actions/runs?head_sha=${pr.headRefOid}&event=pull_request`, '--jq', '[.workflow_runs[] | {id, status, conclusion, name}]']));
  const run = runs.find((r) => r.name === 'Check' && r.status === 'completed');
  if (!run) fail(`The check of #${number} has not finished yet: ${pr.url}/checks`);
  const dir = mkdtempSync(join(tmpdir(), 'pocketvibe-review-'));
  try {
    gh(['run', 'download', String(run.id), '--repo', STORE_REPO, '--name', 'games', '--dir', dir]);
  } catch {
    fail(`#${number}'s check built no game (${run.conclusion}). See ${pr.url}/checks`);
  }
  const games = readdirSync(dir).filter((n) => n.endsWith('.zip')).map((name) => {
    const zip = new Uint8Array(readFileSync(join(dir, name)));
    const files = unzipSync(zip, { filter: (f) => ['pocketvibe.json', 'cover.png', 'cover.jpg'].includes(f.name) });
    const manifest = JSON.parse(new TextDecoder().decode(files['pocketvibe.json']));
    return { entry: catalogEntry(manifest, zip, `${manifest.version}-pr${number}`, 'review'), zip, cover: files['cover.png'] ?? files['cover.jpg'] ?? null };
  });
  rmSync(dir, { recursive: true, force: true });
  if (!games.length) fail(`#${number} built no game.`);
  const note = run.conclusion === 'success' ? '' : ` (its check: ${run.conclusion})`;
  console.log(`#${number} ${pr.title} by ${pr.author.login}: ${games.map((g) => g.entry.title).join(', ')}${note}`);
  await serveStore(`Review: #${number} ${pr.title}`, port, () => games);
  printAddresses(port);
  console.log(`When you have played it, review it on ${pr.url}\n`);
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
  pocketvibe publish [dir]               send your game to the store (a pull request)
  pocketvibe status                      your games and pull requests
  pocketvibe review <number>             play a store pull request on your handheld

Store: https://github.com/${STORE_REPO}`);
  process.exit(command ? 1 : 0);
}
try {
  await commands[command]();
} catch (e) {
  if (!(e instanceof Failure)) throw e;
  console.error(e.message);
  process.exitCode = 1;
}
