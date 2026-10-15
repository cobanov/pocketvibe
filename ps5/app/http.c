// HTTPS for the store, through the console's own sceHttp and certificate
// store, on a thread of its own: scripts start a request, then poll it each
// frame. A request keeps its body in memory or writes it to a file under
// /data/pocketvibe (with its SHA-256, to check downloads). Zip archives
// unpack here too.

#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "quickjs.h"

#ifndef SAFE_ROOT
#define SAFE_ROOT "/data/pocketvibe/"  // the only place scripts may write
#endif
#define SAFE_LEN (sizeof SAFE_ROOT - 1)

int sceNetPoolCreate(const char *name, int size, int flags);
int sceSslInit(size_t pool);
int sceHttpInit(int net, int ssl, size_t pool);
int sceHttpCreateTemplate(int http, const char *agent, int version, int proxy);
int sceHttpSetAutoRedirect(int id, int on);
int sceHttpSetResolveTimeOut(int id, uint32_t us);
int sceHttpSetConnectTimeOut(int id, uint32_t us);
int sceHttpSetSendTimeOut(int id, uint32_t us);
int sceHttpSetRecvTimeOut(int id, uint32_t us);
int sceHttpsEnableOption(int id, uint32_t flags);
int sceHttpCreateConnectionWithURL(int tmpl, const char *url, int keep_alive);
int sceHttpDeleteConnection(int id);
int sceHttpCreateRequestWithURL(int conn, int method, const char *url, uint64_t length);
int sceHttpDeleteRequest(int id);
int sceHttpAddRequestHeader(int id, const char *name, const char *value, uint32_t mode);
int sceHttpSendRequest(int id, const void *data, size_t size);
int sceHttpGetStatusCode(int id, int *status);
int sceHttpGetResponseContentLength(int id, int *result, uint64_t *length);
int sceHttpReadData(int id, void *buf, size_t size);
int sceKernelUsleep(unsigned us);
int sceKernelRename(const char *from, const char *to);
int sceKernelMkdir(const char *path, int mode);

// ---- SHA-256 (FIPS 180-4)

typedef struct {
  uint32_t h[8];
  uint64_t len;
  uint8_t buf[64];
  int n;
} sha256;

static const uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be,
    0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa,
    0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85,
    0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};
#define ROR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))

static void sha_block(sha256 *s, const uint8_t *p) {
  uint32_t w[64], a[8];
  for (int i = 0; i < 16; i++) w[i] = (uint32_t)p[4 * i] << 24 | p[4 * i + 1] << 16 | p[4 * i + 2] << 8 | p[4 * i + 3];
  for (int i = 16; i < 64; i++) {
    uint32_t s0 = ROR(w[i - 15], 7) ^ ROR(w[i - 15], 18) ^ (w[i - 15] >> 3);
    uint32_t s1 = ROR(w[i - 2], 17) ^ ROR(w[i - 2], 19) ^ (w[i - 2] >> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  memcpy(a, s->h, sizeof a);
  for (int i = 0; i < 64; i++) {
    uint32_t t1 = a[7] + (ROR(a[4], 6) ^ ROR(a[4], 11) ^ ROR(a[4], 25)) + ((a[4] & a[5]) ^ (~a[4] & a[6])) + K[i] + w[i];
    uint32_t t2 = (ROR(a[0], 2) ^ ROR(a[0], 13) ^ ROR(a[0], 22)) + ((a[0] & a[1]) ^ (a[0] & a[2]) ^ (a[1] & a[2]));
    memmove(a + 1, a, sizeof(uint32_t) * 7);
    a[4] += t1;
    a[0] = t1 + t2;
  }
  for (int i = 0; i < 8; i++) s->h[i] += a[i];
}
static void sha_init(sha256 *s) {
  static const uint32_t h0[8] = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};
  memcpy(s->h, h0, sizeof h0);
  s->len = 0;
  s->n = 0;
}
static void sha_update(sha256 *s, const uint8_t *p, size_t n) {
  s->len += n;
  while (n--) {
    s->buf[s->n++] = *p++;
    if (s->n == 64) { sha_block(s, s->buf); s->n = 0; }
  }
}
static void sha_hex(sha256 *s, char out[65]) {
  uint64_t bits = s->len * 8;
  uint8_t pad = 0x80;
  sha_update(s, &pad, 1);
  pad = 0;
  while (s->n != 56) sha_update(s, &pad, 1);
  for (int i = 7; i >= 0; i--) { uint8_t b = (uint8_t)(bits >> (i * 8)); sha_update(s, &b, 1); }
  for (int i = 0; i < 8; i++) sprintf(out + i * 8, "%08x", s->h[i]);
}

// ---- Requests

typedef struct {
  int id, state;  // 0 queued, 1 running, 2 done, 3 failed
  char url[1024], path[256], error[160], sha[65];
  int status;
  uint64_t got, total;
  uint8_t *body;
  size_t size, cap;
} request;

static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static request *reqs[64];
static int next_id = 1, http_tmpl = -1, worker_started;

static int http_setup(void) {
  if (http_tmpl >= 0) return 0;
  int pool = sceNetPoolCreate("PocketVibe", 1 << 20, 0);
  int ssl = sceSslInit(2 << 20);
  int http = pool >= 0 && ssl >= 0 ? sceHttpInit(pool, ssl, 4 << 20) : -1;
  int t = http >= 0 ? sceHttpCreateTemplate(http, "PocketVibe-PS5/0.1", 2, 0) : -1;
  printf("http setup pool %d ssl %d http %d template %d\n", pool, ssl, http, t);
  fflush(stdout);
  if (t < 0) return -1;
  sceHttpSetAutoRedirect(t, 1);
  sceHttpSetResolveTimeOut(t, 10000000);
  sceHttpSetConnectTimeOut(t, 10000000);
  sceHttpSetSendTimeOut(t, 10000000);
  sceHttpSetRecvTimeOut(t, 30000000);
  sceHttpsEnableOption(t, 0x01 | 0x04 | 0x08 | 0x10 | 0x20 | 0x80);
  http_tmpl = t;
  return 0;
}

static void fail(request *r, const char *what, int code);
#define FAIL(what, code) do { fail(r, what, code); return; } while (0)
static void fail(request *r, const char *what, int code) {
  pthread_mutex_lock(&mu);
  snprintf(r->error, sizeof r->error, "%s (0x%08x)", what, (unsigned)code);
  r->state = 3;
  pthread_mutex_unlock(&mu);
}

static void run(request *r) {
  if (http_setup() < 0) FAIL("network unavailable", 0);
  int conn = sceHttpCreateConnectionWithURL(http_tmpl, r->url, 1);
  if (conn < 0) FAIL("connection", conn);
  int req = sceHttpCreateRequestWithURL(conn, 0, r->url, 0);
  if (req < 0) { sceHttpDeleteConnection(conn); FAIL("request", req); }
  sceHttpAddRequestHeader(req, "Accept-Encoding", "identity", 0);
  int rc = sceHttpSendRequest(req, NULL, 0);
  int status = 0;
  if (rc >= 0) rc = sceHttpGetStatusCode(req, &status);
  if (rc < 0 || status < 200 || status >= 300) {
    sceHttpDeleteRequest(req);
    sceHttpDeleteConnection(conn);
    FAIL(rc < 0 ? "send" : "HTTP status", rc < 0 ? rc : status);
  }
  int has_len = 0;
  uint64_t total = 0;
  if (sceHttpGetResponseContentLength(req, &has_len, &total) < 0 || has_len != 0) total = 0;
  pthread_mutex_lock(&mu);
  r->status = status;
  r->total = total;
  pthread_mutex_unlock(&mu);

  char part[272];
  FILE *f = NULL;
  if (r->path[0]) {
    snprintf(part, sizeof part, "%s.part", r->path);
    f = fopen(part, "wb");
    if (!f) { sceHttpDeleteRequest(req); sceHttpDeleteConnection(conn); FAIL("cannot write", 0); }
  }
  sha256 sh;
  sha_init(&sh);
  uint8_t buf[64 << 10];
  for (;;) {
    int n = sceHttpReadData(req, buf, sizeof buf);
    if (n < 0) { rc = n; break; }
    if (n == 0) { rc = 0; break; }
    sha_update(&sh, buf, n);
    if (f) {
      if (fwrite(buf, 1, n, f) != (size_t)n) { rc = -1; break; }
    } else {
      if (r->size + n > r->cap) {
        r->cap = (r->size + n) * 2;
        r->body = realloc(r->body, r->cap);
      }
      memcpy(r->body + r->size, buf, n);
      r->size += n;
    }
    pthread_mutex_lock(&mu);
    r->got += n;
    pthread_mutex_unlock(&mu);
  }
  sceHttpDeleteRequest(req);
  sceHttpDeleteConnection(conn);
  if (f) fclose(f);
  if (rc < 0) FAIL("read", rc);
  if (f && sceKernelRename(part, r->path) != 0) FAIL("cannot save", 0);
  pthread_mutex_lock(&mu);
  sha_hex(&sh, r->sha);
  r->state = 2;
  pthread_mutex_unlock(&mu);
}

static void *worker(void *arg) {
  (void)arg;
  for (;;) {
    request *next = NULL;
    pthread_mutex_lock(&mu);
    for (int i = 0; i < 64 && !next; i++)
      if (reqs[i] && reqs[i]->state == 0) { next = reqs[i]; next->state = 1; }
    pthread_mutex_unlock(&mu);
    if (next) run(next);
    else sceKernelUsleep(10000);
  }
  return NULL;
}

static request *find(int id) {
  for (int i = 0; i < 64; i++)
    if (reqs[i] && reqs[i]->id == id) return reqs[i];
  return NULL;
}

// Only https URLs, and files only under /data/pocketvibe.
static int safe_target(const char *path) {
  return !path[0] || (!strncmp(path, SAFE_ROOT, SAFE_LEN) && !strstr(path, ".."));
}

// __ps5.httpStart(url, savePath?) -> request id, or -1 when refused or busy.
JSValue js_http_start(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  const char *url = JS_ToCString(ctx, argv[0]);
  const char *path = argc > 1 && JS_IsString(argv[1]) ? JS_ToCString(ctx, argv[1]) : NULL;
  int id = -1;
  if (url && !strncmp(url, "https://", 8) && strlen(url) < 1024 && safe_target(path ? path : "") && (!path || strlen(path) < 256)) {
    pthread_mutex_lock(&mu);
    for (int i = 0; i < 64; i++) {
      if (reqs[i]) continue;
      request *r = calloc(1, sizeof *r);
      r->id = id = next_id++;
      snprintf(r->url, sizeof r->url, "%s", url);
      snprintf(r->path, sizeof r->path, "%s", path ? path : "");
      reqs[i] = r;
      break;
    }
    if (!worker_started && id > 0) {
      pthread_t th;
      pthread_attr_t attr;
      pthread_attr_init(&attr);
      pthread_attr_setstacksize(&attr, 512 << 10);
      pthread_create(&th, &attr, worker, NULL);
      worker_started = 1;
    }
    pthread_mutex_unlock(&mu);
  }
  JS_FreeCString(ctx, url);
  JS_FreeCString(ctx, path);
  return JS_NewInt32(ctx, id);
}

// __ps5.httpPoll(id) -> {state, got, total, status, error, sha256} ; state
// 'queued' | 'running' | 'done' | 'failed'.
JSValue js_http_poll(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int id = 0;
  JS_ToInt32(ctx, &id, argv[0]);
  pthread_mutex_lock(&mu);
  request *r = find(id);
  JSValue o = JS_NULL;
  if (r) {
    static const char *states[] = {"queued", "running", "done", "failed"};
    o = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, o, "state", JS_NewString(ctx, states[r->state]));
    JS_SetPropertyStr(ctx, o, "got", JS_NewFloat64(ctx, (double)r->got));
    JS_SetPropertyStr(ctx, o, "total", JS_NewFloat64(ctx, (double)r->total));
    JS_SetPropertyStr(ctx, o, "status", JS_NewInt32(ctx, r->status));
    JS_SetPropertyStr(ctx, o, "error", JS_NewString(ctx, r->error));
    JS_SetPropertyStr(ctx, o, "sha256", JS_NewString(ctx, r->sha));
  }
  pthread_mutex_unlock(&mu);
  return o;
}

// __ps5.httpTake(id) -> the body as a string (memory requests), and forgets the request.
JSValue js_http_take(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int id = 0;
  JS_ToInt32(ctx, &id, argv[0]);
  pthread_mutex_lock(&mu);
  JSValue out = JS_NULL;
  for (int i = 0; i < 64; i++) {
    request *r = reqs[i];
    if (!r || r->id != id || r->state < 2) continue;
    if (r->state == 2 && !r->path[0]) out = JS_NewStringLen(ctx, (const char *)r->body, r->size);
    free(r->body);
    free(r);
    reqs[i] = NULL;
  }
  pthread_mutex_unlock(&mu);
  return out;
}

// ---- Zip archives (stored or deflated), with stb_image's inflater.

char *stbi_zlib_decode_noheader_malloc(const char *buffer, int len, int *outlen);

static unsigned u16(const uint8_t *p) { return p[0] | p[1] << 8; }
static unsigned u32(const uint8_t *p) { return p[0] | p[1] << 8 | p[2] << 16 | (unsigned)p[3] << 24; }

static void mkdirs(const char *path) {
  char tmp[512];
  snprintf(tmp, sizeof tmp, "%s", path);
  for (char *p = tmp + 1; *p; p++)
    if (*p == '/') { *p = 0; sceKernelMkdir(tmp, 0777); *p = '/'; }
  sceKernelMkdir(tmp, 0777);
}

// __ps5.unzip(zipPath, destDir) -> number of files written, or an error string.
// Paths with "..", absolute ones, and a destination outside /data/pocketvibe
// are refused. One folder wrapping everything is dropped, as pocketvibed does.
// The file list is kept in destDir/.files for removing the game later.
JSValue js_unzip(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  const char *zip = JS_ToCString(ctx, argv[0]);
  const char *dest = JS_ToCString(ctx, argv[1]);
  const char *err = NULL;
  int written = 0;
  uint8_t *d = NULL;
  long n = 0;
  FILE *f = zip && dest && !strncmp(dest, SAFE_ROOT, SAFE_LEN) && !strstr(dest, "..") ? fopen(zip, "rb") : NULL;
  if (!f) err = "cannot open archive";
  else {
    fseek(f, 0, SEEK_END);
    n = ftell(f);
    fseek(f, 0, SEEK_SET);
    d = malloc(n);
    if (!d || fread(d, 1, n, f) != (size_t)n) err = "cannot read archive";
    fclose(f);
  }
  // The end of central directory record, then the shared top folder, if any.
  long eocd = -1;
  for (long p = n - 22; !err && p >= 0 && p >= n - 22 - 65535; p--)
    if (u32(d + p) == 0x06054b50) { eocd = p; break; }
  if (!err && eocd < 0) err = "not a zip archive";
  unsigned count = err ? 0 : u16(d + eocd + 10), cd = err ? 0 : u32(d + eocd + 16);
  char prefix[256] = "";
  int shared = 1;
  for (unsigned i = 0, p = cd; !err && i < count; i++) {
    if (p + 46 > (unsigned long)n || u32(d + p) != 0x02014b50) { err = "bad central directory"; break; }
    unsigned nl = u16(d + p + 28);
    char name[256];
    snprintf(name, sizeof name, "%.*s", nl < 255 ? nl : 255, (const char *)d + p + 46);
    char *slash = strchr(name, '/');
    if (!slash || !strncmp(name, "__MACOSX", 8)) shared = !slash ? 0 : shared;
    else if (!prefix[0]) snprintf(prefix, sizeof prefix, "%.*s/", (int)(slash - name), name);
    else if (strncmp(name, prefix, strlen(prefix))) shared = 0;
    p += 46 + nl + u16(d + p + 30) + u16(d + p + 32);
  }
  if (!shared) prefix[0] = 0;
  char list[640];
  snprintf(list, sizeof list, "%s/.files", dest ? dest : "");
  if (!err) mkdirs(dest);
  FILE *files = err ? NULL : fopen(list, "w");
  for (unsigned i = 0, p = cd; !err && i < count; i++) {
    unsigned method = u16(d + p + 10), csize = u32(d + p + 20), usize = u32(d + p + 24);
    unsigned nl = u16(d + p + 28), local = u32(d + p + 42);
    char name[256];
    snprintf(name, sizeof name, "%.*s", nl < 255 ? nl : 255, (const char *)d + p + 46);
    p += 46 + nl + u16(d + p + 30) + u16(d + p + 32);
    const char *rel = name + strlen(prefix);
    if (!strncmp(name, "__MACOSX", 8) || !*rel) continue;
    if (rel[0] == '/' || strstr(rel, "..") || strchr(rel, '\\')) { err = "unsafe path in archive"; break; }
    char out[640];
    snprintf(out, sizeof out, "%s/%s", dest, rel);
    if (rel[strlen(rel) - 1] == '/') { mkdirs(out); continue; }
    char *last = strrchr(out, '/');
    *last = 0;
    mkdirs(out);
    *last = '/';
    if (local + 30 > (unsigned long)n || u32(d + local) != 0x04034b50) { err = "bad local header"; break; }
    const uint8_t *data = d + local + 30 + u16(d + local + 26) + u16(d + local + 28);
    if (data + csize > d + n) { err = "truncated archive"; break; }
    char *plain = NULL;
    int plain_len = 0;
    if (method == 0) plain = (char *)data, plain_len = csize;
    else if (method == 8) plain = stbi_zlib_decode_noheader_malloc((const char *)data, csize, &plain_len);
    if (!plain || (unsigned)plain_len != usize) { err = "cannot decompress"; break; }
    FILE *o = fopen(out, "wb");
    int ok = o && fwrite(plain, 1, plain_len, o) == (size_t)plain_len;
    if (o) fclose(o);
    if (method == 8) free(plain);
    if (!ok) { err = "cannot write"; break; }
    if (files) fprintf(files, "%s\n", rel);
    written++;
  }
  if (files) fclose(files);
  free(d);
  JS_FreeCString(ctx, zip);
  JS_FreeCString(ctx, dest);
  return err ? JS_NewString(ctx, err) : JS_NewInt32(ctx, written);
}

int sceKernelUnlink(const char *path);
int sceKernelRmdir(const char *path);

// __ps5.removeGame(dir): deletes what unzip wrote there (its .files list),
// then the emptied folders, deepest first. Only under /data/pocketvibe/games.
JSValue js_remove_game(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  const char *dir = JS_ToCString(ctx, argv[0]);
  int removed = 0;
  if (dir && !strncmp(dir, SAFE_ROOT "games/", SAFE_LEN + 6) && !strstr(dir, "..") && strlen(dir) < 256) {
    char path[640], line[384];
    snprintf(path, sizeof path, "%s/.files", dir);
    FILE *f = fopen(path, "r");
    char *dirs[512];
    int ndirs = 0;
    while (f && fgets(line, sizeof line, f)) {
      line[strcspn(line, "\r\n")] = 0;
      if (!line[0] || strstr(line, "..")) continue;
      snprintf(path, sizeof path, "%s/%s", dir, line);
      removed += sceKernelUnlink(path) == 0;
      for (char *s = strrchr(line, '/'); s; s = strrchr(line, '/')) {
        *s = 0;
        int seen = 0;
        for (int i = 0; i < ndirs; i++) seen |= !strcmp(dirs[i], line);
        if (!seen && ndirs < 512) dirs[ndirs++] = strdup(line);
      }
    }
    if (f) fclose(f);
    // Longest paths first, so children go before their parents.
    for (int i = 0; i < ndirs; i++)
      for (int j = i + 1; j < ndirs; j++)
        if (strlen(dirs[j]) > strlen(dirs[i])) { char *x = dirs[i]; dirs[i] = dirs[j]; dirs[j] = x; }
    for (int i = 0; i < ndirs; i++) {
      snprintf(path, sizeof path, "%s/%s", dir, dirs[i]);
      sceKernelRmdir(path);
      free(dirs[i]);
    }
    snprintf(path, sizeof path, "%s/.files", dir);
    sceKernelUnlink(path);
    snprintf(path, sizeof path, "%s/pocketvibe.json", dir);
    sceKernelUnlink(path);
    snprintf(path, sizeof path, "%s/cover.png", dir);
    sceKernelUnlink(path);
    sceKernelRmdir(dir);
  }
  JS_FreeCString(ctx, dir);
  return JS_NewInt32(ctx, removed);
}

// __ps5.rename(from, to) under /data/pocketvibe -> true when moved.
JSValue js_rename(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  const char *a = JS_ToCString(ctx, argv[0]), *b = JS_ToCString(ctx, argv[1]);
  int ok = a && b && !strncmp(a, SAFE_ROOT, SAFE_LEN) && !strncmp(b, SAFE_ROOT, SAFE_LEN) && !strstr(a, "..") && !strstr(b, "..") && sceKernelRename(a, b) == 0;
  JS_FreeCString(ctx, a);
  JS_FreeCString(ctx, b);
  return JS_NewBool(ctx, ok);
}
