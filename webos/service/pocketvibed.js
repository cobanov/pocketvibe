'use strict';
// PocketVibe daemon for LG webOS: a Node port of pocketvibed.py.
// No dependencies, no modern syntax (no ?. / ?? / fs.rmSync), so it runs on the older Node builds shipped on TVs.
var http = require('http'), https = require('https'), fs = require('fs'), path = require('path');
var os = require('os'), zlib = require('zlib'), crypto = require('crypto'), urlmod = require('url'), cp = require('child_process');

var APP = __dirname;
var CONFIG = JSON.parse(fs.readFileSync(path.join(APP, 'config.json'), 'utf8'));
var VERSION = CONFIG.version || '0.1.0';
var PORT = parseInt(process.env.POCKETVIBE_PORT || '8730', 10);
var GAME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
var SHELL_PATH = '/__pocketvibe__/';
var SHELL_FILES = ['play.html', 'play.css', 'play.js', 'i18n.js', 'screens.js', 'webos-shim.js'];

function mkdirp(p) {
  if (fs.existsSync(p)) return;
  mkdirp(path.dirname(p));
  try { fs.mkdirSync(p); } catch (e) { if (e.code !== 'EEXIST') throw e; }
}
function rmrf(p) {
  var st;
  try { st = fs.lstatSync(p); } catch (e) { return; }
  if (st.isDirectory()) {
    fs.readdirSync(p).forEach(function (f) { rmrf(path.join(p, f)); });
    fs.rmdirSync(p);
  } else fs.unlinkSync(p);
}
function pickHome() {
  if (process.env.POCKETVIBE_HOME) return process.env.POCKETVIBE_HOME;
  var tries = ['/media/developer/pocketvibe', '/home/root/pocketvibe', path.join(os.tmpdir(), 'pocketvibe')];
  for (var i = 0; i < tries.length; i++) {
    try { mkdirp(tries[i]); fs.accessSync(tries[i], fs.constants.W_OK); return tries[i]; } catch (e) { /* next */ }
  }
  return tries[tries.length - 1];
}
var HOME = pickHome();
var GAMES = path.join(HOME, 'games'), CACHE = path.join(HOME, 'cache');
var SETTINGS_FILE = path.join(HOME, 'settings.json'), PLAYS_FILE = path.join(HOME, 'plays.json'), PORTS_FILE = path.join(HOME, 'ports.json');
var BUNDLED = path.join(APP, 'bundled'), BUNDLED_DONE = path.join(HOME, '.bundled');

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } }
function writeJson(p, data) {
  mkdirp(path.dirname(p));
  var tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, p);
}
var LOG_FILE = path.join(HOME, 'log.txt');
function log(msg) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 262144) fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + msg + '\n');
  } catch (e) { /* logging must never break anything */ }
}
function validId(g) { return typeof g === 'string' && GAME_ID.test(g); }
function assign() { return Object.assign.apply(Object, [{}].concat([].slice.call(arguments))); }

// ---------- settings ----------
var DEFAULT_SETTINGS = { language: 'en', music: false, musicVolume: 0.8, uiSounds: true, sfxVolume: 0.8, showFps: false, stores: [CONFIG.store_url] };
function loadSettings() {
  var saved = readJson(SETTINGS_FILE, {});
  if (!saved || typeof saved !== 'object') saved = {};
  var out = assign(DEFAULT_SETTINGS);
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { if (k in saved) out[k] = saved[k]; });
  return out;
}
function saveSettings(changes) {
  var s = loadSettings();
  if (!changes || typeof changes !== 'object') changes = {};
  Object.keys(changes).forEach(function (k) {
    var d = DEFAULT_SETTINGS[k], v = changes[k];
    if (d === undefined) return;
    if (typeof d === 'boolean' && typeof v === 'boolean') s[k] = v;
    else if (typeof d === 'number' && typeof v === 'number') s[k] = Math.min(Math.max(v, 0), 1);
    else if (typeof d === 'string' && typeof v === 'string') s[k] = v;
    else if (k === 'stores' && Array.isArray(v)) {
      var urls = [];
      v.forEach(function (u) { if (typeof u === 'string' && /^https?:\/\/\S+$/.test(u.trim()) && urls.indexOf(u.trim()) < 0) urls.push(u.trim()); });
      s[k] = urls.slice(0, 10);
    }
  });
  writeJson(SETTINGS_FILE, s);
  return s;
}


// ---------- gamepad settings (shared by the launcher and every game through the injected shim) ----------
var PAD_FILE = path.join(HOME, 'padmap.json'), PAD_NAMES = ['UP', 'DOWN', 'LEFT', 'RIGHT', 'A', 'B', 'X', 'Y', 'L', 'R', 'START', 'SELECT'];
function loadPad() {
  var d = readJson(PAD_FILE, {});
  if (!d || typeof d !== 'object') d = {};
  if (['auto', 'native', 'xbox'].indexOf(d.layout) < 0) d.layout = 'auto';
  if (!d.maps || typeof d.maps !== 'object') d.maps = {};
  return d;
}
function savePad(body) {
  var d = loadPad();
  if (!body || typeof body !== 'object') return d;
  if (['auto', 'native', 'xbox'].indexOf(body.layout) >= 0) d.layout = body.layout;
  if (typeof body.id === 'string' && body.id.length > 0 && body.id.length < 300) {
    if (body.map === null) delete d.maps[body.id];
    else if (body.map && typeof body.map === 'object') {
      var clean = {};
      PAD_NAMES.forEach(function (n) {
        var m = body.map[n];
        if (!m || (m.t !== 'b' && m.t !== 'a') || typeof m.i !== 'number' || m.i < 0 || m.i > 63) return;
        clean[n] = m.t === 'b' ? { t: 'b', i: Math.floor(m.i) } : { t: 'a', i: Math.floor(m.i), v: typeof m.v === 'number' ? m.v : 1 };
      });
      if (Object.keys(clean).length) d.maps[body.id] = { map: clean };
    }
  }
  writeJson(PAD_FILE, d);
  return d;
}

// ---------- library ----------
function readManifest(dir) {
  var meta = {};
  ['pocketvibe.json', 'openboy.json'].forEach(function (n) {
    if (Object.keys(meta).length) return;
    var m = readJson(path.join(dir, n), null);
    if (m && typeof m === 'object') meta = m;
  });
  var name = path.basename(dir);
  if (meta.id === undefined) meta.id = name;
  if (meta.title === undefined) meta.title = name.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  if (meta.entry === undefined) meta.entry = 'index.html';
  return meta;
}
function loadPlays() { var p = readJson(PLAYS_FILE, {}); return p && typeof p === 'object' ? p : {}; }
function recordPlay(gid) {
  try {
    var plays = loadPlays(), e = plays[gid] || { count: 0 };
    plays[gid] = { count: (e.count || 0) + 1, last: Date.now() / 1000 };
    writeJson(PLAYS_FILE, plays);
  } catch (e) { /* best effort */ }
}
function library() {
  if (!fs.existsSync(GAMES)) return [];
  var plays = loadPlays(), games = [];
  fs.readdirSync(GAMES).sort().forEach(function (n) {
    var d = path.join(GAMES, n);
    if (n[0] === '.' || !fs.statSync(d).isDirectory()) return;
    var meta = readManifest(d);
    ['id', 'title', 'entry'].forEach(function (k) { meta[k] = String(meta[k]); });
    var played = plays[meta.id] && typeof plays[meta.id] === 'object' ? plays[meta.id] : {};
    meta.lastPlayed = played.last || 0;
    meta.plays = played.count || 0;
    games.push(meta);
  });
  return games.sort(function (a, b) { return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1; });
}

// ---------- http client ----------
// Node 8 (webOS 5) only knows get(options, cb): no get(url, options, cb), and no system CA guarantees.
var CA_PEM = null;
function loadCa() {
  if (CA_PEM === null) { try { CA_PEM = fs.readFileSync(path.join(APP, 'ca.pem')); } catch (e) { CA_PEM = false; } }
  return CA_PEM;
}
function open(u, timeout, redirects, useCa) {
  redirects = redirects === undefined ? 6 : redirects;
  return new Promise(function (resolve, reject) {
    var isHttps = u.indexOf('https:') === 0, lib = isHttps ? https : http;
    var opts = urlmod.parse(u);
    opts.headers = { 'User-Agent': 'PocketVibe-webOS/' + VERSION };
    if (isHttps && useCa && loadCa()) opts.ca = loadCa();
    var req = lib.get(opts, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('too many redirects'));
        return resolve(open(urlmod.resolve(u, res.headers.location), timeout, redirects - 1, useCa));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      resolve(res);
    });
    req.setTimeout((timeout || 10) * 1000, function () { req.abort(); reject(new Error('timeout')); });
    req.on('error', reject);
  }).catch(function (e) {
    var certProblem = /CERT|certificate|UNABLE_TO|SELF_SIGNED|DEPTH_ZERO/i.test(String(e.code || '') + ' ' + e.message);
    if (!useCa && u.indexOf('https:') === 0 && certProblem && loadCa()) {
      log('tls: retrying ' + u + ' with the bundled CA list (' + e.message + ')');
      return open(u, timeout, redirects, true);
    }
    throw e;
  });
}
function readAll(res, max) {
  return new Promise(function (resolve, reject) {
    var chunks = [], n = 0;
    res.on('data', function (c) { n += c.length; if (max && n > max) { res.destroy(); return reject(new Error('too large')); } chunks.push(c); });
    res.on('end', function () { resolve(Buffer.concat(chunks)); });
    res.on('error', reject);
  });
}

// ---------- store ----------
var TEXT_FIELDS = ['title', 'author', 'version', 'description', 'genre', 'entry', 'download', 'cover', 'sha256', 'updated'];
function catalogEntries(data) {
  if (!data || !Array.isArray(data.games)) return [];
  var out = [];
  data.games.forEach(function (g) {
    if (!g || typeof g.id !== 'string' || !validId(g.id) || typeof g.title !== 'string' || typeof g.download !== 'string') return;
    var e = {};
    Object.keys(g).forEach(function (k) { if (TEXT_FIELDS.indexOf(k) < 0 || typeof g[k] === 'string') e[k] = g[k]; });
    if (e.controls !== undefined && (typeof e.controls !== 'object' || Array.isArray(e.controls) || !e.controls)) delete e.controls;
    ['size', 'downloads'].forEach(function (k) { if (e[k] !== undefined && typeof e[k] !== 'number') delete e[k]; });
    out.push(e);
  });
  return out;
}
function fetchCatalog(u) {
  var cached = path.join(CACHE, 'catalog-' + crypto.createHash('sha1').update(u).digest('hex').slice(0, 12) + '.json');
  return open(u, 10).then(function (res) { return readAll(res, 4 << 20); }).then(function (body) {
    var data = JSON.parse(body.toString('utf8'));
    if (!data || typeof data !== 'object') throw new Error('not a catalog');
    writeJson(cached, data);
    return { data: data, online: true };
  }).catch(function (e) {
    log('catalog ' + u + ' failed: ' + (e && e.message));
    var d = readJson(cached, { games: [] });
    return { data: d && typeof d === 'object' ? d : { games: [] }, online: false };
  });
}
var catalogCache = { when: 0, games: [], stores: [] };
function mergedCatalog(maxAge) {
  if (maxAge && Date.now() - catalogCache.when < maxAge * 1000) return Promise.resolve(catalogCache);
  var urls = loadSettings().stores;
  return Promise.all(urls.map(fetchCatalog)).then(function (results) {
    var seen = {}, games = [], stores = [];
    results.forEach(function (r, i) {
      var name = typeof r.data.name === 'string' && r.data.name ? r.data.name : (urlmod.parse(urls[i]).hostname || urls[i]);
      var entries = catalogEntries(r.data);
      stores.push({ url: urls[i], name: name, online: r.online, count: entries.length });
      entries.forEach(function (e) { if (!seen[e.id]) { seen[e.id] = 1; games.push(assign(e, { store: name })); } });
    });
    catalogCache = { when: Date.now(), games: games, stores: stores };
    return catalogCache;
  });
}
function store() {
  return mergedCatalog(0).then(function (c) {
    var installed = {};
    library().forEach(function (g) { installed[g.id] = g; });
    return {
      online: c.stores.some(function (s) { return s.online; }),
      stores: c.stores,
      games: c.games.map(function (e) {
        var local = installed[e.id];
        return assign(e, { installed: !!local, update: !!local && local.version !== e.version });
      })
    };
  });
}
function findEntry(gid) {
  return mergedCatalog(60).then(function (c) { return c.games.filter(function (g) { return g.id === gid; })[0] || null; });
}

// ---------- zip ----------
function unzip(buf, target) {
  var i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error('not a zip file');
  var count = buf.readUInt16LE(i + 10), off = buf.readUInt32LE(i + 16), root = path.resolve(target);
  mkdirp(root);
  for (var n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad zip directory');
    var method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20);
    var nlen = buf.readUInt16LE(off + 28), elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    var name = buf.toString('utf8', off + 46, off + 46 + nlen);
    off += 46 + nlen + elen + clen;
    if (name.indexOf('__MACOSX') === 0) continue;
    var dest = path.resolve(root, name);
    if (dest !== root && dest.indexOf(root + path.sep) !== 0) throw new Error('unsafe path in archive: ' + name);
    if (name.slice(-1) === '/') { mkdirp(dest); continue; }
    var start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    var data = buf.slice(start, start + csize), out;
    if (method === 0) out = data;
    else if (method === 8) out = zlib.inflateRawSync(data);
    else throw new Error('unsupported zip compression ' + method);
    mkdirp(path.dirname(dest));
    fs.writeFileSync(dest, out);
  }
}
function unpack(gid, archivePath, entry) {
  var staging = path.join(GAMES, '.' + gid + '.new');
  try {
    rmrf(staging); mkdirp(staging);
    unzip(fs.readFileSync(archivePath), staging);
    var names = fs.readdirSync(staging).filter(function (n) { return n.indexOf('__MACOSX') !== 0; });
    var root = names.length === 1 && fs.statSync(path.join(staging, names[0])).isDirectory() ? path.join(staging, names[0]) : staging;
    var manifest = readManifest(root);
    if (!fs.existsSync(path.join(root, entry.entry || manifest.entry))) throw new Error('archive has no index.html');
    ['id', 'title', 'author', 'version', 'description', 'entry'].forEach(function (k) { if (entry[k] !== undefined) manifest[k] = entry[k]; });
    manifest.id = gid;
    fs.writeFileSync(path.join(root, 'pocketvibe.json'), JSON.stringify(manifest, null, 2));
    var target = path.join(GAMES, gid), old = path.join(GAMES, '.' + gid + '.old');
    rmrf(old);
    if (fs.existsSync(target)) fs.renameSync(target, old);
    fs.renameSync(root, target);
    rmrf(old);
  } finally { rmrf(staging); }
}


// ---------- lowering: store games ship modern JS/CSS, the TV's web engine (Chromium 68) cannot parse it ----------
// esbuild (a static ARM binary, bin/esbuild) rewrites every .js/.css of a game for Chromium 68 once, at install time.
var LOWER_MARK = '.pv-lowered-1';
var esbuildPromise = null, lowerChain = Promise.resolve();
function esbuildEnv() { return assign(process.env, { GOGC: '30', GOMAXPROCS: '1' }); }
function findEsbuild() {
  if (esbuildPromise) return esbuildPromise;
  var gz = path.join(APP, 'bin', 'esbuild.gz');
  var candidates = [path.join(HOME, 'bin', 'esbuild'), path.join(os.tmpdir(), 'pv-esbuild')];
  // The binary ships gzipped (4 MB instead of 11 MB in the .ipk); unpack it once, streaming.
  function unpackTo(c) {
    return new Promise(function (resolve, reject) {
      mkdirp(path.dirname(c));
      var tmp = c + '.part', out = fs.createWriteStream(tmp);
      var src = fs.createReadStream(gz), gun = zlib.createGunzip();
      [src, gun, out].forEach(function (st) { st.on('error', reject); });
      out.on('finish', function () { try { fs.chmodSync(tmp, 493); fs.renameSync(tmp, c); resolve(); } catch (e) { reject(e); } });
      src.pipe(gun).pipe(out);
    });
  }
  function next(i) {
    if (i >= candidates.length) { log('esbuild unavailable: games will run un-lowered and may fail'); return Promise.resolve(null); }
    var c = candidates[i];
    return Promise.resolve().then(function () {
      if (!fs.existsSync(c)) return unpackTo(c);
      fs.chmodSync(c, 493);
    }).then(function () {
      return new Promise(function (resolve) {
        cp.execFile(c, ['--version'], { timeout: 20000, env: esbuildEnv() }, function (err, out) {
          if (err) { log('esbuild ' + c + ' failed: ' + err.message); resolve(null); }
          else { log('esbuild ' + String(out).trim() + ' at ' + c); resolve(c); }
        });
      });
    }).catch(function (e) { log('esbuild prepare ' + c + ': ' + e.message); return null; })
      .then(function (ok) { return ok || next(i + 1); });
  }
  esbuildPromise = next(0);
  return esbuildPromise;
}
function lowerFile(bin, file) {
  return new Promise(function (resolve) {
    var isCss = /\.css$/i.test(file), tmp = file + '.pvtmp', errText = '', done = 0, code = null, failed = false;
    var args = ['--target=chrome68', '--minify-whitespace', '--legal-comments=none'].concat(isCss ? ['--loader=css'] : ['--format=esm']);
    var child = cp.spawn(bin, args, { env: esbuildEnv() });
    var out = fs.createWriteStream(tmp);
    function finish() {
      if (done < 2) return;
      if (code === 0 && !failed) { try { fs.renameSync(tmp, file); return resolve(true); } catch (e) { errText += e.message; } }
      try { fs.unlinkSync(tmp); } catch (e) { /* none */ }
      log('lower failed ' + file + ': ' + (errText.trim().slice(0, 300) || 'exit ' + code));
      resolve(false);
    }
    child.stderr.on('data', function (d) { if (errText.length < 2000) errText += d; });
    child.stdout.pipe(out);
    out.on('finish', function () { done++; finish(); });
    out.on('error', function (e) { failed = true; errText += e.message; });
    child.on('error', function (e) { failed = true; errText += e.message; done = 1; out.end(); });
    child.on('close', function (c) { code = c; done++; finish(); });
    var input = fs.createReadStream(file);
    input.on('error', function (e) { failed = true; errText += e.message; child.stdin.end(); });
    child.stdin.on('error', function () { /* esbuild exited early */ });
    input.pipe(child.stdin);
  });
}
function listCode(dir, acc) {
  acc = acc || [];
  fs.readdirSync(dir).forEach(function (n) {
    var f = path.join(dir, n), st = fs.lstatSync(f);
    if (st.isDirectory()) listCode(f, acc);
    else if (/\.(m?js|css)$/i.test(n) && st.size > 0 && st.size < 12 * 1048576) acc.push(f);
  });
  return acc;
}
function lowerGame(gid) {
  var dir = path.join(GAMES, gid), mark = path.join(dir, LOWER_MARK);
  if (!fs.existsSync(dir) || fs.existsSync(mark)) return Promise.resolve(true);
  var task = function () {
    if (fs.existsSync(mark)) return true;
    return findEsbuild().then(function (bin) {
      if (!bin) return false;
      var files = listCode(dir), t0 = Date.now(), bad = 0;
      return files.reduce(function (p, f) { return p.then(function () { return lowerFile(bin, f).then(function (ok) { if (!ok) bad++; }); }); }, Promise.resolve())
        .then(function () {
          log('lowered ' + gid + ': ' + files.length + ' files, ' + bad + ' failed, ' + (Date.now() - t0) + ' ms');
          if (!bad) fs.writeFileSync(mark, '');
          return !bad;
        });
    }).catch(function (e) { log('lowerGame ' + gid + ': ' + e.message); return false; });
  };
  lowerChain = lowerChain.then(task, task); // one at a time: the TV has little RAM
  return lowerChain;
}
function lowerAllInstalled() {
  library().forEach(function (g) { lowerGame(g.id); });
}

// ---------- jobs: install / remove ----------
var jobs = {};
function setJob(gid, f) { jobs[gid] = assign(jobs[gid] || { state: 'queued', progress: 0, error: null }, f); }
function install(entry) {
  var gid = entry.id, file = path.join(GAMES, '.' + gid + '.zip');
  mkdirp(GAMES);
  setJob(gid, { state: 'downloading', progress: 0, error: null });
  return open(entry.download, 30).then(function (res) {
    return new Promise(function (resolve, reject) {
      var hash = crypto.createHash('sha256'), out = fs.createWriteStream(file), done = 0;
      var total = parseInt(res.headers['content-length'] || entry.size || 0, 10);
      res.on('data', function (c) { hash.update(c); done += c.length; if (total) setJob(gid, { progress: Math.min(done / total, 1) }); });
      res.pipe(out);
      out.on('finish', function () { resolve(hash.digest('hex')); });
      out.on('error', reject); res.on('error', reject);
    });
  }).then(function (digest) {
    if (entry.sha256 && digest !== entry.sha256) throw new Error('download is corrupted (checksum mismatch)');
    setJob(gid, { state: 'installing', progress: 1 });
    unpack(gid, file, entry);
    return lowerGame(gid).then(function () { setJob(gid, { state: 'done' }); });
  }).catch(function (e) { log('install ' + gid + ' failed: ' + (e && e.message)); setJob(gid, { state: 'error', error: String(e.message || e) }); })
    .then(function () { try { fs.unlinkSync(file); } catch (e) { /* gone */ } });
}
function installBundled() {
  if (fs.existsSync(BUNDLED_DONE) || !fs.existsSync(BUNDLED)) return;
  mkdirp(GAMES);
  fs.readdirSync(BUNDLED).sort().forEach(function (f) {
    if (!/\.zip$/.test(f)) return;
    var gid = f.slice(0, -4);
    if (!validId(gid) || fs.existsSync(path.join(GAMES, gid))) return;
    try { unpack(gid, path.join(BUNDLED, f), {}); fs.writeFileSync(path.join(GAMES, gid, LOWER_MARK), ''); } catch (e) { console.error('bundled game ' + gid + ' not installed: ' + e.message); }
  });
  fs.writeFileSync(BUNDLED_DONE, '');
}
function cleanUp() {
  if (!fs.existsSync(GAMES)) return;
  fs.readdirSync(GAMES).forEach(function (n) {
    if (n[0] !== '.') return;
    var p = path.join(GAMES, n);
    if (/\.old$/.test(n) && fs.statSync(p).isDirectory() && !fs.existsSync(path.join(GAMES, n.slice(1, -4)))) fs.renameSync(p, path.join(GAMES, n.slice(1, -4)));
    else rmrf(p);
  });
}

// ---------- device ----------
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function deviceStatus() {
  var d = new Date();
  return { time: pad2(d.getHours()) + ':' + pad2(d.getMinutes()), battery: null, charging: false, wifi: true };
}
function networkAddress() {
  var ifs = os.networkInterfaces(), ip = null;
  Object.keys(ifs).forEach(function (k) { ifs[k].forEach(function (a) { if (!ip && a.family === 'IPv4' && !a.internal) ip = a.address; }); });
  return ip;
}
function dirSize(p) {
  var total = 0;
  try {
    fs.readdirSync(p).forEach(function (n) {
      var f = path.join(p, n), st = fs.lstatSync(f);
      total += st.isDirectory() ? dirSize(f) : st.size;
    });
  } catch (e) { /* missing */ }
  return total;
}
function deviceInfo() {
  var free = 0, total = 0;
  try {
    var line = cp.execSync('df -Pk "' + HOME + '"', { timeout: 3000 }).toString().trim().split('\n').pop().split(/\s+/);
    total = parseInt(line[1], 10) * 1024; free = parseInt(line[3], 10) * 1024;
  } catch (e) { /* no df */ }
  return { version: VERSION, platform: 'webos', free: free, total: total, games: dirSize(GAMES), ip: networkAddress(), gpu: null };
}

// ---------- static files ----------
var MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.txt': 'text/plain' };
function sendJson(res, data, status) {
  var body = Buffer.from(JSON.stringify(data));
  res.writeHead(status || 200, { 'Content-Type': 'application/json', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}
// shimSrc: when set, injected into HTML so the remote works inside the launcher, the shell and every game.
function serveFile(res, file, shimSrc) {
  fs.readFile(file, function (err, data) {
    if (err) { log('404 ' + file); res.writeHead(404); return res.end('not found'); }
    var type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    if (path.basename(file) === 'webos-shim.js') data = Buffer.concat([Buffer.from('window.__PV_PAD=' + JSON.stringify(loadPad()) + ';\n'), data]);
    if (shimSrc && type.indexOf('text/html') === 0) {
      var html = data.toString('utf8'), tag = '<script src="' + shimSrc + '"></script>';
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + tag; }) : tag + html;
      data = Buffer.from(html);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
function safeJoin(root, route) {
  var p = path.resolve(root, '.' + path.posix.normalize('/' + route));
  return p === path.resolve(root) || p.indexOf(path.resolve(root) + path.sep) === 0 ? p : null;
}
function staticRoute(res, root, route, shimSrc) {
  if (route === '/' || route === '') route = '/index.html';
  var f = safeJoin(root, route);
  if (!f) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  serveFile(res, f, shimSrc);
}

// ---------- per-game servers (each game keeps its own origin, and so its own saves) ----------
var gameServers = {};
function crc32(str) {
  var c, crc = 0xFFFFFFFF;
  for (var i = 0; i < str.length; i++) {
    c = (crc ^ str.charCodeAt(i)) & 0xFF;
    for (var k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function gamePort(gid) {
  var ports = readJson(PORTS_FILE, {});
  if (!ports || typeof ports !== 'object') ports = {};
  if (!(gid in ports)) {
    var taken = Object.keys(ports).map(function (k) { return ports[k]; });
    var port = 20000 + crc32(gid) % 20000;
    while (taken.indexOf(port) >= 0 || port === PORT) port = 20000 + (port - 20000 + 1) % 20000;
    ports[gid] = port;
    writeJson(PORTS_FILE, ports);
  }
  return ports[gid];
}
function gameUrl(gid) {
  var dir = path.join(GAMES, gid), meta = readManifest(dir), port = gamePort(gid);
  if (!gameServers[gid]) {
    var server = http.createServer(function (req, res) {
      var route = decodeURIComponent(urlmod.parse(req.url).pathname);
      if (req.method === 'POST' && route === SHELL_PATH + 'unlock-audio') { req.resume(); return sendJson(res, { ok: true }); }
      if (route.indexOf(SHELL_PATH) === 0 && SHELL_FILES.indexOf(route.slice(SHELL_PATH.length)) >= 0)
        return serveFile(res, path.join(APP, 'launcher', route.slice(SHELL_PATH.length)), SHELL_PATH + 'webos-shim.js');
      staticRoute(res, dir, route, SHELL_PATH + 'webos-shim.js');
    });
    server.on('error', function (e) { console.error('game server ' + gid + ': ' + e.message); delete gameServers[gid]; });
    server.listen(port, '127.0.0.1');
    gameServers[gid] = { server: server, port: port };
  }
  var s = loadSettings();
  var q = 'entry=' + encodeURIComponent(meta.entry) + '&perf=' + (s.showFps ? 1 : 0) + '&lang=' + encodeURIComponent(s.language);
  return 'http://127.0.0.1:' + gameServers[gid].port + SHELL_PATH + 'play.html?' + q;
}
function removeGame(gid) {
  var g = gameServers[gid];
  if (g) { g.server.close(); delete gameServers[gid]; }
  rmrf(path.join(GAMES, gid));
}

// ---------- launcher server + /api ----------
function coverPath(gid) {
  var names = ['cover.png', 'cover.jpg', 'cover.webp'];
  for (var i = 0; i < names.length; i++) { var p = path.join(GAMES, gid, names[i]); if (fs.existsSync(p)) return Promise.resolve(p); }
  return findEntry(gid).then(function (e) {
    if (!e || !e.cover) return null;
    var cached = path.join(CACHE, 'covers', gid + '-' + crypto.createHash('sha1').update(e.cover).digest('hex').slice(0, 12));
    if (fs.existsSync(cached)) return cached;
    return open(e.cover, 10).then(function (r) { return readAll(r, 2 << 20); }).then(function (data) {
      mkdirp(path.dirname(cached));
      fs.writeFileSync(cached, data);
      return cached;
    });
  }).catch(function (e) { log('cover ' + gid + ' failed: ' + (e && e.message)); return null; });
}
function allowed(req, route) {
  var host = req.headers.host;
  if (host !== '127.0.0.1:' + PORT && host !== 'localhost:' + PORT) return false;
  if (route.indexOf('/api/') !== 0) return true;
  var origin = req.headers.origin;
  if (origin && origin !== 'http://127.0.0.1:' + PORT) return false;
  if (req.method === 'GET' && route.indexOf('/api/cover/') === 0) return true;
  return req.headers['x-pocketvibe'] === '1';
}
function readBody(req) {
  return new Promise(function (resolve) {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { resolve({}); } });
  });
}
function api(req, res, route, query) {
  var gid = route.split('/')[3];
  if (req.method === 'GET') {
    if (route === '/api/library') return sendJson(res, library());
    if (route === '/api/store') return store().then(function (d) { sendJson(res, d); });
    if (route === '/api/status') return sendJson(res, deviceStatus());
    if (route === '/api/settings') return sendJson(res, loadSettings());
    if (route === '/api/info') return sendJson(res, deviceInfo());
    if (route === '/api/screens') return sendJson(res, { screens: null, primary: 0 });
    if (route === '/api/padmap') return sendJson(res, loadPad());
    if (route === '/api/saves') return sendJson(res, []);
    if (route === '/api/update') return sendJson(res, { current: VERSION, available: false });
    if (route === '/api/notice') return sendJson(res, { notice: null });
    if (route === '/api/jobs') return sendJson(res, jobs);
    if (route.indexOf('/api/cover/') === 0) {
      if (!validId(gid)) return sendJson(res, { error: 'no cover' }, 404);
      return coverPath(gid).then(function (p) {
        if (!p) return sendJson(res, { error: 'no cover' }, 404);
        var data = fs.readFileSync(p);
        res.writeHead(200, { 'Content-Type': data.slice(0, 4).toString('hex') === '89504e47' ? 'image/png' : 'image/jpeg', 'Content-Length': data.length });
        res.end(data);
      });
    }
    return sendJson(res, { error: 'unknown route' }, 404);
  }
  if (req.method !== 'POST') return sendJson(res, { error: 'method not allowed' }, 405);
  return readBody(req).then(function (body) {
    if (route === '/api/settings') return sendJson(res, saveSettings(body));
    if (route === '/api/unlock-audio') return sendJson(res, { ok: true });
    if (route === '/api/padmap') return sendJson(res, savePad(body));
    if (route === '/api/update/install') return sendJson(res, { error: 'updates are installed as a new .ipk on webOS' }, 400);
    if (route === '/api/gpu/panfrost') return sendJson(res, { error: 'not applicable' }, 400);
    if (route === '/api/saves/backup' || route.indexOf('/api/saves/restore/') === 0)
      return sendJson(res, { error: 'save backups are not available on webOS (saves live in the TV browser storage)' }, 400);
    var parts = route.replace(/^\/|\/$/g, '').split('/'), action = parts[1];
    if (action === 'quit') return sendJson(res, { ok: true });
    if (!validId(gid)) return sendJson(res, { error: 'bad game id' }, 400);
    if (action === 'launch') {
      if (!fs.existsSync(path.join(GAMES, gid))) return sendJson(res, { error: 'not installed' }, 404);
      return lowerGame(gid).then(function () {
        try { var u = gameUrl(gid); recordPlay(gid); log('launch ' + gid + ' -> ' + u); return sendJson(res, { url: u }); }
        catch (e) { log('launch failed ' + gid + ': ' + e.message); return sendJson(res, { error: String(e.message) }, 500); }
      });
    }
    if (action === 'install') {
      return findEntry(gid).then(function (entry) {
        if (!entry) return sendJson(res, { error: 'not in the store' }, 404);
        var st = jobs[gid] && jobs[gid].state;
        if (['queued', 'downloading', 'installing'].indexOf(st) < 0) { setJob(gid, { state: 'queued', progress: 0, error: null }); install(entry); }
        sendJson(res, { ok: true });
      });
    }
    if (action === 'remove') { removeGame(gid); return sendJson(res, { ok: true }); }
    return sendJson(res, { error: 'unknown action' }, 404);
  });
}
function launcherHandler(req, res) {
  var u = urlmod.parse(req.url), route;
  try { route = decodeURIComponent(u.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (!allowed(req, route)) return sendJson(res, { error: 'not allowed' }, 403);
  if (route === '/__pvlog' && req.method === 'POST') {
    var chunks = [];
    req.on('data', function (c) { if (chunks.length < 20) chunks.push(c); });
    req.on('end', function () { log('client ' + Buffer.concat(chunks).toString('utf8').slice(0, 800)); res.writeHead(204); res.end(); });
    return;
  }
  if (route.indexOf('/api/') === 0) {
    return Promise.resolve(api(req, res, route, u.query)).catch(function (e) {
      if (!res.headersSent) sendJson(res, { error: String(e.message || e) }, 500);
    });
  }
  staticRoute(res, path.join(APP, 'launcher'), route, '/webos-shim.js');
}

// ---------- main ----------
function main() {
  mkdirp(GAMES);
  cleanUp();
  installBundled();
  var server = http.createServer(launcherHandler);
  server.on('error', function (e) {
    if (e.code === 'EADDRINUSE') { console.error('PocketVibe is already running on port ' + PORT); process.exit(0); }
    throw e;
  });
  setTimeout(lowerAllInstalled, 3000);
  server.listen(PORT, '127.0.0.1', function () { log('start ' + VERSION + ' node ' + process.version);
    console.log('PocketVibe ' + VERSION + ' on http://127.0.0.1:' + PORT + '/ (data: ' + HOME + ')'); });

  // On webOS, register on the Luna bus so the app can start us, and keep the service alive.
  try {
    var Service = require('webos-service');
    var svc = new Service('com.pocketvibe.app.service');
    svc.register('start', function (m) { m.respond({ returnValue: true, port: PORT }); });
    var keep;
    svc.activityManager.create('pocketvibe-keepalive', function (a) { keep = a; });
    void keep;
  } catch (e) { /* standalone mode: run with `node pocketvibed.js` */ }
}
main();
