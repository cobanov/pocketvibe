// Packs a game project into the store: builds it, zips dist/ with its
// pocketvibe.json (and cover), and adds or updates its entry in catalog.json.
//
//   node store/publish.mjs <game-project-dir> [--base <url>]
//
// Output goes to store/public/, which is what the store serves. --base is
// the public address of that folder; download and cover links in the
// catalog are built from it.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const project = resolve(args[0] ?? '');
const baseIndex = args.indexOf('--base');
const base = (baseIndex >= 0 ? args[baseIndex + 1] : 'http://192.168.8.110:8800').replace(/\/$/, '');
const out = resolve(import.meta.dirname, 'public');

// openboy.json is the manifest's name from before the project was renamed.
const manifestPath = ['pocketvibe.json', 'openboy.json'].map((n) => join(project, n)).find(existsSync) ?? join(project, 'pocketvibe.json');
if (!existsSync(manifestPath)) {
  console.error(`No pocketvibe.json in ${project}. It needs at least id, title and version.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
for (const key of ['id', 'title', 'version']) {
  if (!manifest[key]) throw new Error(`pocketvibe.json is missing "${key}"`);
}
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)) {
  throw new Error('id must be lowercase letters, digits and dashes');
}

console.log(`Building ${manifest.title}...`);
execFileSync('npm', ['run', 'build'], { cwd: project, stdio: 'inherit' });

// Stage dist/ plus the manifest and cover, then zip it.
const stage = mkdtempSync(join(tmpdir(), 'pocketvibe-pack-'));
execFileSync('cp', ['-R', join(project, 'dist') + '/.', stage]);
writeFileSync(join(stage, 'pocketvibe.json'), JSON.stringify({ entry: 'index.html', ...manifest }, null, 2));
const cover = ['cover.png', 'cover.jpg'].map((n) => join(project, n)).find(existsSync);
if (cover) copyFileSync(cover, join(stage, cover.endsWith('.png') ? 'cover.png' : 'cover.jpg'));

const gameDir = join(out, 'games', manifest.id);
mkdirSync(gameDir, { recursive: true });
const zipName = `${manifest.version}.zip`;
const zipPath = join(gameDir, zipName);
rmSync(zipPath, { force: true });
execFileSync('zip', ['-qr', zipPath, '.'], { cwd: stage });
rmSync(stage, { recursive: true, force: true });

const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
const size = statSync(zipPath).size;
let coverUrl;
if (cover) {
  const coverName = cover.endsWith('.png') ? 'cover.png' : 'cover.jpg';
  copyFileSync(cover, join(gameDir, coverName));
  coverUrl = `${base}/games/${manifest.id}/${coverName}`;
}

const catalogPath = join(out, 'catalog.json');
const catalog = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, 'utf8')) : { games: [] };
const entry = {
  id: manifest.id,
  title: manifest.title,
  author: manifest.author ?? '',
  version: manifest.version,
  description: manifest.description ?? '',
  entry: manifest.entry ?? 'index.html',
  size,
  sha256,
  download: `${base}/games/${manifest.id}/${zipName}`,
  ...(coverUrl && { cover: coverUrl }),
  updated: new Date().toISOString(),
};
catalog.games = [...catalog.games.filter((g) => g.id !== manifest.id), entry].sort((a, b) =>
  a.title.localeCompare(b.title),
);
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Published ${manifest.id} ${manifest.version} (${(size / 1e6).toFixed(2)} MB) to ${catalogPath}`);
