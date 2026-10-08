// PocketVibe store: the catalog handhelds read, the game files they
// download, and the upload and review API that `pocketvibe publish` uses.
//
//   GET  /catalog.json              published games, for the handheld app
//   GET  /files/games/<id>/<file>   a published game zip or cover (zips are counted)
//   POST /api/publish               upload a game zip (GitHub token)
//   GET  /api/me                    your games and uploads (GitHub token)
//   GET  /api/admin/pending         uploads waiting for review (admin)
//   POST /api/admin/review          approve or reject an upload (admin)
//
// Developers sign in with a GitHub token; the store asks GitHub who it
// belongs to and keeps nothing else. A game id belongs to whoever uploaded it
// first. Uploads by ADMIN_LOGIN are published at once, others wait for review.

import { unzipSync } from 'fflate';

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ADMIN_LOGIN: string;
  STORE_NAME: string;
}

interface Manifest {
  id: string;
  title: string;
  author?: string;
  version: string;
  description?: string;
  genre?: string;
  controls?: Record<string, string>;
  entry?: string;
}

interface GameRow {
  id: string;
  owner: string;
  title: string;
  author: string;
  description: string;
  genre: string;
  controls: string;
  entry: string;
  version: string;
  size: number;
  sha256: string;
  zip_key: string;
  cover_key: string | null;
  downloads: number;
  created_at: string;
  updated_at: string;
}

const GAME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const MAX_ZIP = 50 * 1024 * 1024;
const MAX_COVER = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers },
  });
}

function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

async function sha256(data: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// The GitHub login behind the request's bearer token.
async function githubLogin(request: Request): Promise<string> {
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/)?.[1];
  if (!token) throw new HttpError(401, 'sign in: send a GitHub token as "Authorization: Bearer <token>"');
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'pocketvibe-store' },
  });
  if (!res.ok) throw new HttpError(401, 'GitHub did not accept the token');
  const user = (await res.json()) as { login?: string };
  if (!user.login) throw new HttpError(401, 'GitHub did not say who the token belongs to');
  return user.login;
}

async function requireAdmin(request: Request, env: Env) {
  const login = await githubLogin(request);
  if (login !== env.ADMIN_LOGIN) throw new HttpError(403, 'only the store admin can do this');
  return login;
}

function catalogEntry(game: GameRow, origin: string) {
  return {
    id: game.id,
    title: game.title,
    author: game.author,
    version: game.version,
    description: game.description,
    genre: game.genre,
    controls: JSON.parse(game.controls || '{}'),
    entry: game.entry,
    size: game.size,
    sha256: game.sha256,
    download: `${origin}/files/${game.zip_key}`,
    ...(game.cover_key && { cover: `${origin}/files/${game.cover_key}` }),
    downloads: game.downloads,
    updated: game.updated_at,
  };
}

async function catalog(env: Env, origin: string) {
  const { results } = await env.DB.prepare('SELECT * FROM games ORDER BY updated_at DESC').all<GameRow>();
  return json({ name: env.STORE_NAME, games: results.map((g) => catalogEntry(g, origin)) }, 200, {
    'Cache-Control': 'public, max-age=60',
  });
}

// Serve a published zip or cover; count zip downloads.
async function file(env: Env, key: string, ctx: ExecutionContext) {
  const match = key.match(/^games\/([a-z0-9-]+)\/(\d+\.\d+\.\d+)\.(zip|png|jpg)$/);
  if (!match) throw new HttpError(404, 'not found');
  const [, id, version, kind] = match;
  const release = await env.DB.prepare('SELECT status FROM releases WHERE game_id = ? AND version = ?')
    .bind(id, version)
    .first<{ status: string }>();
  if (release?.status !== 'published') throw new HttpError(404, 'not found');
  const object = await env.FILES.get(key);
  if (!object) throw new HttpError(404, 'not found');
  if (kind === 'zip') {
    ctx.waitUntil(env.DB.prepare('UPDATE games SET downloads = downloads + 1 WHERE id = ?').bind(id).run());
  }
  const type = kind === 'zip' ? 'application/zip' : kind === 'png' ? 'image/png' : 'image/jpeg';
  return new Response(object.body, {
    headers: { 'Content-Type': type, 'Content-Length': String(object.size), 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}

function validateManifest(manifest: Manifest, names: string[]) {
  if (!GAME_ID.test(manifest.id ?? '')) throw new HttpError(400, 'pocketvibe.json: id must be lowercase letters, digits and dashes');
  if (!manifest.title?.trim()) throw new HttpError(400, 'pocketvibe.json: title is missing');
  if (!VERSION.test(manifest.version ?? '')) throw new HttpError(400, 'pocketvibe.json: version must look like 1.2.3');
  const entry = manifest.entry || 'index.html';
  if (!names.includes(entry)) throw new HttpError(400, `the zip has no ${entry}`);
  if (manifest.controls && typeof manifest.controls !== 'object') throw new HttpError(400, 'pocketvibe.json: controls must be an object');
}

async function upsertGame(env: Env, owner: string, manifest: Manifest, release: { size: number; sha256: string; zip_key: string; cover_key: string | null }) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO games (id, owner, title, author, description, genre, controls, entry, version, size, sha256, zip_key, cover_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
     ON CONFLICT (id) DO UPDATE SET title = ?3, author = ?4, description = ?5, genre = ?6, controls = ?7, entry = ?8,
       version = ?9, size = ?10, sha256 = ?11, zip_key = ?12, cover_key = ?13, updated_at = ?14`,
  )
    .bind(
      manifest.id,
      owner,
      manifest.title.trim(),
      manifest.author ?? owner,
      manifest.description ?? '',
      manifest.genre ?? '',
      JSON.stringify(manifest.controls ?? {}),
      manifest.entry || 'index.html',
      manifest.version,
      release.size,
      release.sha256,
      release.zip_key,
      release.cover_key,
      now,
    )
    .run();
}

async function publish(request: Request, env: Env) {
  const login = await githubLogin(request);
  const data = new Uint8Array(await request.arrayBuffer());
  if (data.length === 0) throw new HttpError(400, 'send the game zip as the request body');
  if (data.length > MAX_ZIP) throw new HttpError(413, 'the zip is larger than 50 MB');

  // Read the file list, and only the manifest and cover out of the zip.
  const names: string[] = [];
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, {
      filter: (f) => {
        names.push(f.name);
        return ['pocketvibe.json', 'cover.png', 'cover.jpg'].includes(f.name);
      },
    });
  } catch {
    throw new HttpError(400, 'that is not a valid zip');
  }
  if (names.some((n) => n.startsWith('/') || n.split('/').includes('..'))) throw new HttpError(400, 'the zip contains unsafe paths');
  if (!files['pocketvibe.json']) throw new HttpError(400, 'the zip has no pocketvibe.json at its top level');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(files['pocketvibe.json']));
  } catch {
    throw new HttpError(400, 'pocketvibe.json is not valid JSON');
  }
  validateManifest(manifest, names);

  const existing = await env.DB.prepare('SELECT owner, version FROM games WHERE id = ?').bind(manifest.id).first<{ owner: string; version: string }>();
  const firstUpload = await env.DB.prepare('SELECT uploader FROM releases WHERE game_id = ? ORDER BY created_at LIMIT 1')
    .bind(manifest.id)
    .first<{ uploader: string }>();
  const owner = existing?.owner ?? firstUpload?.uploader ?? login;
  if (owner !== login && login !== env.ADMIN_LOGIN) throw new HttpError(403, `the id "${manifest.id}" belongs to another developer`);
  if (existing && compareVersions(manifest.version, existing.version) <= 0) {
    throw new HttpError(409, `version must be higher than ${existing.version}; bump it in pocketvibe.json`);
  }
  const taken = await env.DB.prepare('SELECT status FROM releases WHERE game_id = ? AND version = ?').bind(manifest.id, manifest.version).first();
  if (taken) throw new HttpError(409, `version ${manifest.version} was already uploaded; bump it in pocketvibe.json`);

  const zipKey = `games/${manifest.id}/${manifest.version}.zip`;
  let coverKey: string | null = null;
  await env.FILES.put(zipKey, data, { httpMetadata: { contentType: 'application/zip' } });
  const cover = files['cover.png'] ?? files['cover.jpg'];
  if (cover && cover.length <= MAX_COVER) {
    const png = cover[0] === 0x89 && cover[1] === 0x50;
    coverKey = `games/${manifest.id}/${manifest.version}.${png ? 'png' : 'jpg'}`;
    await env.FILES.put(coverKey, cover, { httpMetadata: { contentType: png ? 'image/png' : 'image/jpeg' } });
  }

  const release = { size: data.length, sha256: await sha256(data), zip_key: zipKey, cover_key: coverKey };
  const status = login === env.ADMIN_LOGIN ? 'published' : 'pending';
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO releases (game_id, version, uploader, status, manifest, size, sha256, zip_key, cover_key, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(manifest.id, manifest.version, login, status, JSON.stringify(manifest), release.size, release.sha256, zipKey, coverKey, now, status === 'published' ? now : null)
    .run();
  if (status === 'published') await upsertGame(env, owner, manifest, release);

  return json({
    status,
    id: manifest.id,
    version: manifest.version,
    message: status === 'published' ? 'Published.' : 'Uploaded. It goes live after a review.',
  });
}

async function me(request: Request, env: Env) {
  const login = await githubLogin(request);
  const games = await env.DB.prepare('SELECT id, title, version, downloads FROM games WHERE owner = ? ORDER BY title').bind(login).all();
  const releases = await env.DB.prepare(
    'SELECT game_id, version, status, note, created_at FROM releases WHERE uploader = ? ORDER BY created_at DESC LIMIT 50',
  )
    .bind(login)
    .all();
  return json({ login, games: games.results, releases: releases.results });
}

async function pending(request: Request, env: Env) {
  await requireAdmin(request, env);
  const { results } = await env.DB.prepare(
    "SELECT game_id, version, uploader, manifest, size, created_at FROM releases WHERE status = 'pending' ORDER BY created_at",
  ).all();
  return json({ pending: results.map((r) => ({ ...r, manifest: JSON.parse(r.manifest as string) })) });
}

async function review(request: Request, env: Env) {
  await requireAdmin(request, env);
  const { id, version, action, note } = (await request.json()) as { id: string; version: string; action: string; note?: string };
  const release = await env.DB.prepare("SELECT * FROM releases WHERE game_id = ? AND version = ? AND status = 'pending'")
    .bind(id, version)
    .first<{ uploader: string; manifest: string; size: number; sha256: string; zip_key: string; cover_key: string | null }>();
  if (!release) throw new HttpError(404, 'no such pending upload');
  const now = new Date().toISOString();
  if (action === 'approve') {
    const owner = (await env.DB.prepare('SELECT owner FROM games WHERE id = ?').bind(id).first<{ owner: string }>())?.owner ?? release.uploader;
    await upsertGame(env, owner, JSON.parse(release.manifest), release);
    await env.DB.prepare("UPDATE releases SET status = 'published', reviewed_at = ? WHERE game_id = ? AND version = ?").bind(now, id, version).run();
    return json({ status: 'published', id, version });
  }
  if (action === 'reject') {
    await env.DB.prepare("UPDATE releases SET status = 'rejected', note = ?, reviewed_at = ? WHERE game_id = ? AND version = ?")
      .bind(note ?? '', now, id, version)
      .run();
    await env.FILES.delete([release.zip_key, ...(release.cover_key ? [release.cover_key] : [])]);
    return json({ status: 'rejected', id, version });
  }
  throw new HttpError(400, 'action must be approve or reject');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

// A small public page listing the games.
async function home(env: Env, origin: string) {
  const { results } = await env.DB.prepare('SELECT * FROM games ORDER BY updated_at DESC').all<GameRow>();
  const cards = results
    .map((g) => {
      const cover = g.cover_key ? `<img src="${origin}/files/${g.cover_key}" alt="">` : '<div class="ph"></div>';
      return `<li>${cover}<h3>${escapeHtml(g.title)}</h3><p>${escapeHtml(g.description)}</p><small>${escapeHtml(g.author)} · v${g.version}</small></li>`;
    })
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(env.STORE_NAME)}</title><style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#0f1016;color:#f2f2f5}
header{padding:32px 24px 8px;max-width:1040px;margin:auto}h1{margin:0;color:#ffc83d}
header p{color:#9a9db0;margin:6px 0 0}a{color:#ffc83d}
ul{list-style:none;padding:16px 24px 48px;margin:auto;max-width:1040px;display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}
li{background:#1a1c26;border-radius:12px;overflow:hidden}img,.ph{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:#232634}
h3{margin:10px 12px 0;font-size:17px}li p{margin:4px 12px;color:#c8cad6;font-size:14px}small{display:block;margin:0 12px 12px;color:#9a9db0}
</style></head><body><header><h1>${escapeHtml(env.STORE_NAME)}</h1>
<p>Games for handhelds running ROCKNIX. Get PocketVibe at <a href="https://github.com/cobanov/pocketvibe">github.com/cobanov/pocketvibe</a>.</p></header>
<ul>${cards}</ul></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' },
        });
      }
      if (request.method === 'GET' && pathname === '/') return await home(env, url.origin);
      if (request.method === 'GET' && pathname === '/catalog.json') return await catalog(env, url.origin);
      if (request.method === 'GET' && pathname.startsWith('/files/')) return await file(env, pathname.slice(7), ctx);
      if (request.method === 'POST' && pathname === '/api/publish') return await publish(request, env);
      if (request.method === 'GET' && pathname === '/api/me') return await me(request, env);
      if (request.method === 'GET' && pathname === '/api/admin/pending') return await pending(request, env);
      if (request.method === 'POST' && pathname === '/api/admin/review') return await review(request, env);
      throw new HttpError(404, 'not found');
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'something went wrong on the store' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
