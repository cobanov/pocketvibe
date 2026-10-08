// Gets the launcher demo ready before a build:
//   public/demo/   the handheld app's launcher, copied from app/pocketvibe/launcher
//   public/play/   every game in the store, unpacked so the demo can play it
//   public/_redirects   /download/android to the newest Android release's APK
// The demo's /api answers come from public/sw.js.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SITE, '..', 'app', 'pocketvibe');
const STORE = 'https://pocketvibe-store.mertcobanov.workers.dev/catalog.json';
const MAX_FILE = 25 * 1024 * 1024; // the largest file Cloudflare serves as a static asset
// Tells the store these are not downloads by players.
const MIRROR = { headers: { 'X-PocketVibe-Mirror': '1' } };

async function get(url) {
  const res = await fetch(url, MIRROR);
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  return res;
}

// The launcher, with the handheld's fonts, which visitors may not have.
const demo = join(SITE, 'public', 'demo');
rmSync(demo, { recursive: true, force: true });
cpSync(join(APP, 'launcher'), demo, { recursive: true });
const page = join(demo, 'index.html');
writeFileSync(page, readFileSync(page, 'utf8').replace('</head>', '    <link rel="stylesheet" href="/fonts/fonts.css" />\n  </head>'));
const { version } = JSON.parse(readFileSync(join(APP, 'config.json'), 'utf8'));
writeFileSync(join(demo, 'app.json'), JSON.stringify({ version }));

// The store's games, unpacked as the handheld would. Everything is fetched
// before the old copy is replaced, so a store that is down breaks nothing.
const { games } = await (await get(STORE)).json();
const zips = [];
for (const game of games) zips.push([game, new Uint8Array(await (await get(game.download)).arrayBuffer())]);
const play = join(SITE, 'public', 'play');
rmSync(play, { recursive: true, force: true });
mkdirSync(play, { recursive: true });
const playable = [];
for (const [game, zip] of zips) {
  const files = unzipSync(zip);
  if (Object.values(files).some((data) => data.length > MAX_FILE)) {
    console.log(`play/${game.id}: skipped, a file is over 25 MB`);
    continue;
  }
  // Zips may wrap the game in one top-level folder.
  const names = Object.keys(files).filter((n) => !n.startsWith('__MACOSX') && !n.endsWith('/'));
  const top = names[0]?.split('/')[0];
  const wrapped = names.every((n) => n.startsWith(`${top}/`)) && !names.includes(game.entry ?? 'index.html');
  for (const name of names) {
    const path = normalize(wrapped ? name.slice(top.length + 1) : name);
    if (path.startsWith('..') || path.startsWith('/')) continue;
    const target = join(play, game.id, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, files[name]);
  }
  if (existsSync(join(play, game.id, game.entry ?? 'index.html'))) playable.push(game.id);
  console.log(`play/${game.id} ${game.version}`);
}
writeFileSync(join(play, 'games.json'), JSON.stringify(playable));
// What the page's game shelf and controls help show, for the playable games.
const shelf = games
  .filter((g) => playable.includes(g.id))
  .map(({ id, title, genre, description, entry, controls }) => ({ id, title, genre, description, entry, controls }));
writeFileSync(join(play, 'catalog.json'), JSON.stringify(shelf));
console.log(`demo ${version}, ${playable.length} playable games`);

// Download addresses on the site's own domain, so that where the files are
// hosted can change without a new app or new links:
//   /download/rocknix     the handheld app to install (GitHub's latest release)
//   /download/runtime-1   the app's game engine, which it downloads on its first start
//   /download/android     the newest Android release's APK
// The Android app's releases are tagged android-v<version>, and GitHub's
// "latest" release is the ROCKNIX app, so the APK's address comes from the
// list of releases. If GitHub cannot be reached, the last APK address stays.
const REPO = 'https://github.com/cobanov/pocketvibe/releases';
const redirects = join(SITE, 'public', '_redirects');
const lines = [
  `/download/rocknix ${REPO}/latest/download/PocketVibe.zip 302`,
  `/download/runtime-1 ${REPO}/download/runtime-v1/pocketvibe-runtime-1.tar.xz 302`,
];
try {
  const res = await fetch('https://api.github.com/repos/cobanov/pocketvibe/releases?per_page=30', {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub: ${res.status}`);
  const apk = (await res.json())
    .filter((r) => r.tag_name.startsWith('android-v') && !r.draft && !r.prerelease)
    .flatMap((r) => r.assets.filter((a) => a.name.endsWith('.apk')))[0];
  if (!apk) throw new Error('no Android release with an APK');
  lines.push(`/download/android ${apk.browser_download_url} 302`);
  console.log(`android ${apk.name}`);
} catch (e) {
  const old = existsSync(redirects) ? readFileSync(redirects, 'utf8').split('\n').find((l) => l.startsWith('/download/android ')) : null;
  if (old) lines.push(old);
  console.log(`android download not updated (${e.message})${old ? '' : ', and there is none yet'}`);
}
writeFileSync(redirects, lines.join('\n') + '\n');
