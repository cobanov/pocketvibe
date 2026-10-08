//#region node_modules/fflate/esm/browser.js
var u8 = Uint8Array;
var u16 = Uint16Array;
var i32 = Int32Array;
var fleb = new u8([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	2,
	2,
	2,
	2,
	3,
	3,
	3,
	3,
	4,
	4,
	4,
	4,
	5,
	5,
	5,
	5,
	0,
	0,
	0,
	0
]);
var fdeb = new u8([
	0,
	0,
	0,
	0,
	1,
	1,
	2,
	2,
	3,
	3,
	4,
	4,
	5,
	5,
	6,
	6,
	7,
	7,
	8,
	8,
	9,
	9,
	10,
	10,
	11,
	11,
	12,
	12,
	13,
	13,
	0,
	0
]);
var clim = new u8([
	16,
	17,
	18,
	0,
	8,
	7,
	9,
	6,
	10,
	5,
	11,
	4,
	12,
	3,
	13,
	2,
	14,
	1,
	15
]);
var freb = function(eb, start) {
	var b = new u16(31);
	for (var i = 0; i < 31; ++i) b[i] = start += 1 << eb[i - 1];
	var r = new i32(b[30]);
	for (var i = 1; i < 30; ++i) for (var j = b[i]; j < b[i + 1]; ++j) r[j] = j - b[i] << 5 | i;
	return {
		b,
		r
	};
};
var _a = freb(fleb, 2);
var fl = _a.b;
var revfl = _a.r;
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0);
var fd = _b.b;
_b.r;
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
	var x = (i & 43690) >> 1 | (i & 21845) << 1;
	x = (x & 52428) >> 2 | (x & 13107) << 2;
	x = (x & 61680) >> 4 | (x & 3855) << 4;
	rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
}
var hMap = (function(cd, mb, r) {
	var s = cd.length;
	var i = 0;
	var l = new u16(mb);
	for (; i < s; ++i) if (cd[i]) ++l[cd[i] - 1];
	var le = new u16(mb);
	for (i = 1; i < mb; ++i) le[i] = le[i - 1] + l[i - 1] << 1;
	var co;
	if (r) {
		co = new u16(1 << mb);
		var rvb = 15 - mb;
		for (i = 0; i < s; ++i) if (cd[i]) {
			var sv = i << 4 | cd[i];
			var r_1 = mb - cd[i];
			var v = le[cd[i] - 1]++ << r_1;
			for (var m = v | (1 << r_1) - 1; v <= m; ++v) co[rev[v] >> rvb] = sv;
		}
	} else {
		co = new u16(s);
		for (i = 0; i < s; ++i) if (cd[i]) co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
	}
	return co;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i) flt[i] = 8;
for (var i = 144; i < 256; ++i) flt[i] = 9;
for (var i = 256; i < 280; ++i) flt[i] = 7;
for (var i = 280; i < 288; ++i) flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i) fdt[i] = 5;
var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
var max = function(a) {
	var m = a[0];
	for (var i = 1; i < a.length; ++i) if (a[i] > m) m = a[i];
	return m;
};
var bits = function(d, p, m) {
	var o = p / 8 | 0;
	return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
	var o = p / 8 | 0;
	return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
	return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
	if (s == null || s < 0) s = 0;
	if (e == null || e > v.length) e = v.length;
	return new u8(v.subarray(s, e));
};
var ec = [
	"unexpected EOF",
	"invalid block type",
	"invalid length/literal",
	"invalid distance",
	"stream finished",
	"no stream handler",
	,
	"no callback",
	"invalid UTF-8 data",
	"extra field too long",
	"date not in range 1980-2099",
	"filename too long",
	"stream finishing",
	"invalid zip data"
];
var err = function(ind, msg, nt) {
	var e = new Error(msg || ec[ind]);
	e.code = ind;
	if (Error.captureStackTrace) Error.captureStackTrace(e, err);
	if (!nt) throw e;
	return e;
};
var inflt = function(dat, st, buf, dict) {
	var sl = dat.length, dl = dict ? dict.length : 0;
	if (!sl || st.f && !st.l) return buf || new u8(0);
	var noBuf = !buf;
	var resize = noBuf || st.i != 2;
	var noSt = st.i;
	if (noBuf) buf = new u8(sl * 3);
	var cbuf = function(l) {
		var bl = buf.length;
		if (l > bl) {
			var nbuf = new u8(Math.max(bl * 2, l));
			nbuf.set(buf);
			buf = nbuf;
		}
	};
	var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
	var tbts = sl * 8;
	do {
		if (!lm) {
			final = bits(dat, pos, 1);
			var type = bits(dat, pos + 1, 3);
			pos += 3;
			if (!type) {
				var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
				if (t > sl) {
					if (noSt) err(0);
					break;
				}
				if (resize) cbuf(bt + l);
				buf.set(dat.subarray(s, t), bt);
				st.b = bt += l, st.p = pos = t * 8, st.f = final;
				continue;
			} else if (type == 1) lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
			else if (type == 2) {
				var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
				var tl = hLit + bits(dat, pos + 5, 31) + 1;
				pos += 14;
				var ldt = new u8(tl);
				var clt = new u8(19);
				for (var i = 0; i < hcLen; ++i) clt[clim[i]] = bits(dat, pos + i * 3, 7);
				pos += hcLen * 3;
				var clb = max(clt), clbmsk = (1 << clb) - 1;
				var clm = hMap(clt, clb, 1);
				for (var i = 0; i < tl;) {
					var r = clm[bits(dat, pos, clbmsk)];
					pos += r & 15;
					var s = r >> 4;
					if (s < 16) ldt[i++] = s;
					else {
						var c = 0, n = 0;
						if (s == 16) n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
						else if (s == 17) n = 3 + bits(dat, pos, 7), pos += 3;
						else if (s == 18) n = 11 + bits(dat, pos, 127), pos += 7;
						while (n--) ldt[i++] = c;
					}
				}
				var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
				lbt = max(lt);
				dbt = max(dt);
				lm = hMap(lt, lbt, 1);
				dm = hMap(dt, dbt, 1);
			} else err(1);
			if (pos > tbts) {
				if (noSt) err(0);
				break;
			}
		}
		if (resize) cbuf(bt + 131072);
		var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
		var lpos = pos;
		for (;; lpos = pos) {
			var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
			pos += c & 15;
			if (pos > tbts) {
				if (noSt) err(0);
				break;
			}
			if (!c) err(2);
			if (sym < 256) buf[bt++] = sym;
			else if (sym == 256) {
				lpos = pos, lm = null;
				break;
			} else {
				var add = sym - 254;
				if (sym > 264) {
					var i = sym - 257, b = fleb[i];
					add = bits(dat, pos, (1 << b) - 1) + fl[i];
					pos += b;
				}
				var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
				if (!d) err(3);
				pos += d & 15;
				var dt = fd[dsym];
				if (dsym > 3) {
					var b = fdeb[dsym];
					dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
				}
				if (pos > tbts) {
					if (noSt) err(0);
					break;
				}
				if (resize) cbuf(bt + 131072);
				var end = bt + add;
				if (bt < dt) {
					var shift = dl - dt, dend = Math.min(dt, end);
					if (shift + bt < 0) err(3);
					for (; bt < dend; ++bt) buf[bt] = dict[shift + bt];
				}
				for (; bt < end; ++bt) buf[bt] = buf[bt - dt];
			}
		}
		st.l = lm, st.p = lpos, st.b = bt, st.f = final;
		if (lm) final = 1, st.m = lbt, st.d = dm, st.n = dbt;
	} while (!final);
	return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
var et = /*#__PURE__*/ new u8(0);
var b2 = function(d, b) {
	return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
	return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
	return b4(d, b) + b4(d, b + 4) * 4294967296;
};
function inflateSync(data, opts) {
	return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
var td = typeof TextDecoder != "undefined" && /*#__PURE__*/ new TextDecoder();
try {
	td.decode(et, { stream: true });
} catch (e) {}
var dutf8 = function(d) {
	for (var r = "", i = 0;;) {
		var c = d[i++];
		var eb = (c > 127) + (c > 223) + (c > 239);
		if (i + eb > d.length) return {
			s: r,
			r: slc(d, i - 1)
		};
		if (!eb) r += String.fromCharCode(c);
		else if (eb == 3) c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
		else if (eb & 1) r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
		else r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
	}
};
/**
* Converts a Uint8Array to a string
* @param dat The data to decode to string
* @param latin1 Whether or not to interpret the data as Latin-1. This should
*               not need to be true unless encoding to binary string.
* @returns The original UTF-8/Latin-1 string
*/
function strFromU8(dat, latin1) {
	if (latin1) {
		var r = "";
		for (var i = 0; i < dat.length; i += 16384) r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
		return r;
	} else if (td) return td.decode(dat);
	else {
		var _a = dutf8(dat), s = _a.s, r = _a.r;
		if (r.length) err(8);
		return s;
	}
}
var slzh = function(d, b) {
	return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
	var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
	var _a = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a[0], su = _a[1], off = _a[2];
	return [
		b2(d, b + 10),
		sc,
		su,
		fn,
		es + efl + b2(d, b + 32),
		off
	];
};
var z64hs = function(d, b, l, z, sc, su, off) {
	var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
	var nf = nsc + nsu + noff;
	if (z && nf) {
		for (; b + 4 < e; b += 4 + b2(d, b + 2)) if (b2(d, b) == 1) return [
			nsc ? b8(d, b + 4 + 8 * nsu) : sc,
			nsu ? b8(d, b + 4) : su,
			noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
			1
		];
		if (z < 2) err(13);
	}
	return [
		sc,
		su,
		off,
		0
	];
};
/**
* Synchronously decompresses a ZIP archive. Prefer using `unzip` for better
* performance with more than one file.
* @param data The raw compressed ZIP file
* @param opts The ZIP extraction options
* @returns The decompressed files
*/
function unzipSync(data, opts) {
	var files = {};
	var e = data.length - 22;
	for (; b4(data, e) != 101010256; --e) if (!e || data.length - e > 65558) err(13);
	var c = b2(data, e + 8);
	if (!c) return {};
	var o = b4(data, e + 16);
	var z = b4(data, e - 20) == 117853008;
	if (z) {
		var ze = b4(data, e - 12);
		z = b4(data, ze) == 101075792;
		if (z) {
			c = b4(data, ze + 32);
			o = b4(data, ze + 48);
		}
	}
	var fltr = opts && opts.filter;
	for (var i = 0; i < c; ++i) {
		var _a = zh(data, o, z), c_2 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
		o = no;
		if (!fltr || fltr({
			name: fn,
			size: sc,
			originalSize: su,
			compression: c_2
		})) {
			if (!c_2) files[fn] = slc(data, b, b + sc);
			else if (c_2 == 8) files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
			else err(14, "unknown compression type " + c_2);
		}
	}
	return files;
}
//#endregion
//#region src/index.ts
var GAME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
var VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
var MAX_ZIP = 52428800;
var MAX_COVER = 2097152;
var HttpError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
			...headers
		}
	});
}
function compareVersions(a, b) {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
	return 0;
}
async function sha256(data) {
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function githubLogin(request) {
	const token = request.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/)?.[1];
	if (!token) throw new HttpError(401, "sign in: send a GitHub token as \"Authorization: Bearer <token>\"");
	const res = await fetch("https://api.github.com/user", { headers: {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"User-Agent": "pocketvibe-store"
	} });
	if (!res.ok) throw new HttpError(401, "GitHub did not accept the token");
	const user = await res.json();
	if (!user.login) throw new HttpError(401, "GitHub did not say who the token belongs to");
	return user.login;
}
async function requireAdmin(request, env) {
	const login = await githubLogin(request);
	if (login !== env.ADMIN_LOGIN) throw new HttpError(403, "only the store admin can do this");
	return login;
}
function catalogEntry(game, origin) {
	return {
		id: game.id,
		title: game.title,
		author: game.author,
		version: game.version,
		description: game.description,
		genre: game.genre,
		controls: JSON.parse(game.controls || "{}"),
		entry: game.entry,
		size: game.size,
		sha256: game.sha256,
		download: `${origin}/files/${game.zip_key}`,
		...game.cover_key && { cover: `${origin}/files/${game.cover_key}` },
		downloads: game.downloads,
		updated: game.updated_at
	};
}
async function catalog(env, origin) {
	const { results } = await env.DB.prepare("SELECT * FROM games ORDER BY updated_at DESC").all();
	return json({
		name: env.STORE_NAME,
		games: results.map((g) => catalogEntry(g, origin))
	}, 200, { "Cache-Control": "public, max-age=60" });
}
async function file(env, key, ctx) {
	const match = key.match(/^games\/([a-z0-9-]+)\/(\d+\.\d+\.\d+)\.(zip|png|jpg)$/);
	if (!match) throw new HttpError(404, "not found");
	const [, id, version, kind] = match;
	if ((await env.DB.prepare("SELECT status FROM releases WHERE game_id = ? AND version = ?").bind(id, version).first())?.status !== "published") throw new HttpError(404, "not found");
	const object = await env.FILES.get(key);
	if (!object) throw new HttpError(404, "not found");
	if (kind === "zip") ctx.waitUntil(env.DB.prepare("UPDATE games SET downloads = downloads + 1 WHERE id = ?").bind(id).run());
	const type = kind === "zip" ? "application/zip" : kind === "png" ? "image/png" : "image/jpeg";
	return new Response(object.body, { headers: {
		"Content-Type": type,
		"Content-Length": String(object.size),
		"Cache-Control": "public, max-age=31536000, immutable"
	} });
}
function validateManifest(manifest, names) {
	if (!GAME_ID.test(manifest.id ?? "")) throw new HttpError(400, "pocketvibe.json: id must be lowercase letters, digits and dashes");
	if (!manifest.title?.trim()) throw new HttpError(400, "pocketvibe.json: title is missing");
	if (!VERSION.test(manifest.version ?? "")) throw new HttpError(400, "pocketvibe.json: version must look like 1.2.3");
	const entry = manifest.entry || "index.html";
	if (!names.includes(entry)) throw new HttpError(400, `the zip has no ${entry}`);
	if (manifest.controls && typeof manifest.controls !== "object") throw new HttpError(400, "pocketvibe.json: controls must be an object");
}
async function upsertGame(env, owner, manifest, release) {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	await env.DB.prepare(`INSERT INTO games (id, owner, title, author, description, genre, controls, entry, version, size, sha256, zip_key, cover_key, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14)
     ON CONFLICT (id) DO UPDATE SET title = ?3, author = ?4, description = ?5, genre = ?6, controls = ?7, entry = ?8,
       version = ?9, size = ?10, sha256 = ?11, zip_key = ?12, cover_key = ?13, updated_at = ?14`).bind(manifest.id, owner, manifest.title.trim(), manifest.author ?? owner, manifest.description ?? "", manifest.genre ?? "", JSON.stringify(manifest.controls ?? {}), manifest.entry || "index.html", manifest.version, release.size, release.sha256, release.zip_key, release.cover_key, now).run();
}
async function publish(request, env) {
	const login = await githubLogin(request);
	const data = new Uint8Array(await request.arrayBuffer());
	if (data.length === 0) throw new HttpError(400, "send the game zip as the request body");
	if (data.length > MAX_ZIP) throw new HttpError(413, "the zip is larger than 50 MB");
	const names = [];
	let files;
	try {
		files = unzipSync(data, { filter: (f) => {
			names.push(f.name);
			return [
				"pocketvibe.json",
				"cover.png",
				"cover.jpg"
			].includes(f.name);
		} });
	} catch {
		throw new HttpError(400, "that is not a valid zip");
	}
	if (names.some((n) => n.startsWith("/") || n.split("/").includes(".."))) throw new HttpError(400, "the zip contains unsafe paths");
	if (!files["pocketvibe.json"]) throw new HttpError(400, "the zip has no pocketvibe.json at its top level");
	let manifest;
	try {
		manifest = JSON.parse(new TextDecoder().decode(files["pocketvibe.json"]));
	} catch {
		throw new HttpError(400, "pocketvibe.json is not valid JSON");
	}
	validateManifest(manifest, names);
	const existing = await env.DB.prepare("SELECT owner, version FROM games WHERE id = ?").bind(manifest.id).first();
	const firstUpload = await env.DB.prepare("SELECT uploader FROM releases WHERE game_id = ? ORDER BY created_at LIMIT 1").bind(manifest.id).first();
	const owner = existing?.owner ?? firstUpload?.uploader ?? login;
	if (owner !== login && login !== env.ADMIN_LOGIN) throw new HttpError(403, `the id "${manifest.id}" belongs to another developer`);
	if (existing && compareVersions(manifest.version, existing.version) <= 0) throw new HttpError(409, `version must be higher than ${existing.version}; bump it in pocketvibe.json`);
	if (await env.DB.prepare("SELECT status FROM releases WHERE game_id = ? AND version = ?").bind(manifest.id, manifest.version).first()) throw new HttpError(409, `version ${manifest.version} was already uploaded; bump it in pocketvibe.json`);
	const zipKey = `games/${manifest.id}/${manifest.version}.zip`;
	let coverKey = null;
	await env.FILES.put(zipKey, data, { httpMetadata: { contentType: "application/zip" } });
	const cover = files["cover.png"] ?? files["cover.jpg"];
	if (cover && cover.length <= MAX_COVER) {
		const png = cover[0] === 137 && cover[1] === 80;
		coverKey = `games/${manifest.id}/${manifest.version}.${png ? "png" : "jpg"}`;
		await env.FILES.put(coverKey, cover, { httpMetadata: { contentType: png ? "image/png" : "image/jpeg" } });
	}
	const release = {
		size: data.length,
		sha256: await sha256(data),
		zip_key: zipKey,
		cover_key: coverKey
	};
	const status = login === env.ADMIN_LOGIN ? "published" : "pending";
	const now = (/* @__PURE__ */ new Date()).toISOString();
	await env.DB.prepare(`INSERT INTO releases (game_id, version, uploader, status, manifest, size, sha256, zip_key, cover_key, created_at, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(manifest.id, manifest.version, login, status, JSON.stringify(manifest), release.size, release.sha256, zipKey, coverKey, now, status === "published" ? now : null).run();
	if (status === "published") await upsertGame(env, owner, manifest, release);
	return json({
		status,
		id: manifest.id,
		version: manifest.version,
		message: status === "published" ? "Published." : "Uploaded. It goes live after a review."
	});
}
async function me(request, env) {
	const login = await githubLogin(request);
	const games = await env.DB.prepare("SELECT id, title, version, downloads FROM games WHERE owner = ? ORDER BY title").bind(login).all();
	const releases = await env.DB.prepare("SELECT game_id, version, status, note, created_at FROM releases WHERE uploader = ? ORDER BY created_at DESC LIMIT 50").bind(login).all();
	return json({
		login,
		games: games.results,
		releases: releases.results
	});
}
async function pending(request, env) {
	await requireAdmin(request, env);
	const { results } = await env.DB.prepare("SELECT game_id, version, uploader, manifest, size, created_at FROM releases WHERE status = 'pending' ORDER BY created_at").all();
	return json({ pending: results.map((r) => ({
		...r,
		manifest: JSON.parse(r.manifest)
	})) });
}
async function review(request, env) {
	await requireAdmin(request, env);
	const { id, version, action, note } = await request.json();
	const release = await env.DB.prepare("SELECT * FROM releases WHERE game_id = ? AND version = ? AND status = 'pending'").bind(id, version).first();
	if (!release) throw new HttpError(404, "no such pending upload");
	const now = (/* @__PURE__ */ new Date()).toISOString();
	if (action === "approve") {
		await upsertGame(env, (await env.DB.prepare("SELECT owner FROM games WHERE id = ?").bind(id).first())?.owner ?? release.uploader, JSON.parse(release.manifest), release);
		await env.DB.prepare("UPDATE releases SET status = 'published', reviewed_at = ? WHERE game_id = ? AND version = ?").bind(now, id, version).run();
		return json({
			status: "published",
			id,
			version
		});
	}
	if (action === "reject") {
		await env.DB.prepare("UPDATE releases SET status = 'rejected', note = ?, reviewed_at = ? WHERE game_id = ? AND version = ?").bind(note ?? "", now, id, version).run();
		await env.FILES.delete([release.zip_key, ...release.cover_key ? [release.cover_key] : []]);
		return json({
			status: "rejected",
			id,
			version
		});
	}
	throw new HttpError(400, "action must be approve or reject");
}
function escapeHtml(s) {
	return s.replace(/[&<>"]/g, (c) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;"
	})[c]);
}
async function home(env, origin) {
	const { results } = await env.DB.prepare("SELECT * FROM games ORDER BY updated_at DESC").all();
	const cards = results.map((g) => {
		return `<li>${g.cover_key ? `<img src="${origin}/files/${g.cover_key}" alt="">` : "<div class=\"ph\"></div>"}<h3>${escapeHtml(g.title)}</h3><p>${escapeHtml(g.description)}</p><small>${escapeHtml(g.author)} · v${g.version}</small></li>`;
	}).join("");
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
	return new Response(html, { headers: {
		"Content-Type": "text/html; charset=utf-8",
		"Cache-Control": "public, max-age=60"
	} });
}
//#endregion
//#region \0virtual:cloudflare/worker-entry
var worker_entry_default = { async fetch(request, env, ctx) {
	const url = new URL(request.url);
	const { pathname } = url;
	try {
		if (request.method === "OPTIONS") return new Response(null, { headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "Authorization, Content-Type",
			"Access-Control-Allow-Methods": "GET, POST"
		} });
		if (request.method === "GET" && pathname === "/") return await home(env, url.origin);
		if (request.method === "GET" && pathname === "/catalog.json") return await catalog(env, url.origin);
		if (request.method === "GET" && pathname.startsWith("/files/")) return await file(env, pathname.slice(7), ctx);
		if (request.method === "POST" && pathname === "/api/publish") return await publish(request, env);
		if (request.method === "GET" && pathname === "/api/me") return await me(request, env);
		if (request.method === "GET" && pathname === "/api/admin/pending") return await pending(request, env);
		if (request.method === "POST" && pathname === "/api/admin/review") return await review(request, env);
		throw new HttpError(404, "not found");
	} catch (e) {
		if (e instanceof HttpError) return json({ error: e.message }, e.status);
		console.error(e);
		return json({ error: "something went wrong on the store" }, 500);
	}
} };
//#endregion
export { worker_entry_default as default };
