// PocketVibe on the PS5: a native title that runs one PocketVibe game.
//
// A fullscreen OpenGL 4.6 context (ps5-opengl's EGL), QuickJS, and a generic
// bridge that lets JavaScript call GL entry points by name (webgl.js builds
// WebGL 2 on top of it). The game draws into an offscreen framebuffer of the
// size it asks for; each frame is scaled into the 1080p screen. Every two
// seconds a PERF line goes to the log with frame, JavaScript, swap and GPU
// times and memory use.
//
// Scripts load from /data/pocketvibe-dev/ when present there (fast iteration
// without reinstalling), otherwise from /app0/assets/js/. The game is
// games/<name>.js, the one games.txt lists at the index saved in
// DEV_DIR/game-index.txt; L1+R1+Right/Left switch games by restarting the
// app, L1+R1+Options quits.

#include <EGL/egl.h>
#include <GL/glcorearb.h>
#include <ps5_opengl_display_modes.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "quickjs.h"

int sceUserServiceInitialize(void *);
int sceUserServiceGetInitialUser(int32_t *);
int scePadInit(void);
int scePadOpen(int32_t user, int32_t type, int32_t index, void *param);
int scePadReadState(int32_t handle, void *data);
int sceSystemServiceLoadExec(const char *path, char *const argv[]);
int sceKernelUsleep(uint32_t);
size_t ps5_opengl_heap_live_bytes(void);
// text.c
JSValue js_text(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
JSValue js_glyph(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
JSValue js_advance(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
JSValue js_font_metrics(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
// files.c
void files_init(void);
JSValue js_write_text(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
JSValue js_image(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv);
JSModuleDef *module_loader(JSContext *ctx, const char *name, void *opaque);
int sceSystemServiceParamGetInt(int id, int *value);

// Replaces app_heap.c's weak 128 MiB default; it tries smaller sizes if this
// cannot be mapped.
const size_t ps5_opengl_heap_size = 1024u << 20;

#define DEV_DIR "/data/pocketvibe-dev/"
#define APP_DIR "/app0/assets/js/"
#define BTN_L1 0x400u
#define BTN_R1 0x800u
#define BTN_OPTIONS 0x8u
#define BTN_RIGHT 0x20u
#define BTN_TOUCHPAD 0x100000u
#define BTN_LEFT 0x80u
#define INDEX_FILE DEV_DIR "game-index.txt"

static int tz_minutes, enter_button;

// The native title's libc has no localtime_r, which QuickJS's Date needs:
// UTC moved by the console's time zone.
struct tm *localtime_r(const time_t *t, struct tm *out) {
  int64_t s = *t + (int64_t)tz_minutes * 60, days = s / 86400, rem = s % 86400;
  if (rem < 0) rem += 86400, days--;
  memset(out, 0, sizeof *out);
  out->tm_hour = rem / 3600;
  out->tm_min = rem % 3600 / 60;
  out->tm_sec = rem % 60;
  out->tm_wday = (int)((days % 7 + 11) % 7);  // 1970-01-01 was a Thursday
  // Civil date from days since the epoch (Howard Hinnant's algorithm).
  int64_t z = days + 719468, era = (z >= 0 ? z : z - 146096) / 146097;
  int64_t doe = z - era * 146097, yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  int64_t doy = doe - (365 * yoe + yoe / 4 - yoe / 100), mp = (5 * doy + 2) / 153;
  int64_t d = doy - (153 * mp + 2) / 5 + 1, m = mp < 10 ? mp + 3 : mp - 9, y = yoe + era * 400 + (m <= 2);
  out->tm_year = (int)(y - 1900);
  out->tm_mon = (int)(m - 1);
  out->tm_mday = (int)d;
  int leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
  static const int before[] = {0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334};
  out->tm_yday = before[m - 1] + (int)d - 1 + (leap && m > 2);
  return out;
}

static double now_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return ts.tv_sec * 1e3 + ts.tv_nsec / 1e6;
}

static char *read_file(const char *path, size_t *size) {
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *buf = malloc(n + 1);
  if (buf && fread(buf, 1, n, f) == (size_t)n) {
    buf[n] = 0;
    *size = n;
  } else {
    free(buf);
    buf = NULL;
  }
  fclose(f);
  return buf;
}

// ---- GL bridge: JavaScript binds an entry point with a signature string
// "r:args" (r and each arg: v void, i int32, u uint32, b bool, l int64,
// f float, d double, p pointer from a typed array, ArrayBuffer, offset number
// or null, s string, S pointer to one string, x pointer as number). The call
// goes through one function type: on x86-64 System V, integer and float
// arguments travel in separate registers, so any entry point with up to 12
// integer and 8 float (or 4 double) arguments can be called this way.

typedef long (*call_f)(long, long, long, long, long, long, long, long, long, long, long, long,
                       float, float, float, float, float, float, float, float);
typedef long (*call_d)(long, long, long, long, long, long, long, long, long, long, long, long,
                       double, double, double, double);

typedef struct {
  void *fn;
  char ret;
  char args[16];
} gl_entry;

static gl_entry entries[600];
static int entry_count;
static JSAtom atom_id;  // WebGL handles are objects; their GL name is `id`

static void *js_pointer(JSContext *ctx, JSValueConst v) {
  if (JS_IsNull(v) || JS_IsUndefined(v)) return NULL;
  if (JS_IsNumber(v)) {
    int64_t x = 0;
    JS_ToInt64(ctx, &x, v);
    return (void *)(intptr_t)x;
  }
  size_t size;
  if (JS_IsArrayBuffer(v)) return JS_GetArrayBuffer(ctx, &size, v);
  if (JS_GetTypedArrayType(v) >= 0) {
    size_t offset, length, bpe;
    JSValue ab = JS_GetTypedArrayBuffer(ctx, v, &offset, &length, &bpe);
    uint8_t *p = JS_GetArrayBuffer(ctx, &size, ab);
    JS_FreeValue(ctx, ab);
    return p ? p + offset : NULL;
  }
  return NULL;
}

static JSValue js_gl_call(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv,
                          int magic) {
  const gl_entry *e = &entries[magic];
  long I[12] = {0};
  float F[8] = {0};
  double D[4] = {0};
  const char *strings[4];
  const char *one_string[1];
  int ni = 0, nf = 0, nd = 0, ns = 0;
  for (int a = 0; e->args[a]; a++) {
    JSValueConst v = a < argc ? argv[a] : JS_UNDEFINED;
    switch (e->args[a]) {
      case 'i':
      case 'u':
      case 'b': {
        int32_t x = 0;
        if (JS_IsObject(v)) {
          JSValue id = JS_GetProperty(ctx, v, atom_id);
          JS_ToInt32(ctx, &x, id);
          JS_FreeValue(ctx, id);
        } else {
          JS_ToInt32(ctx, &x, v);
        }
        I[ni++] = (uint32_t)x;
        break;
      }
      case 'l':
      case 'x': {
        int64_t x = 0;
        JS_ToInt64(ctx, &x, v);
        I[ni++] = x;
        break;
      }
      case 'f':
      case 'd': {
        double x = 0;
        JS_ToFloat64(ctx, &x, v);
        if (e->args[a] == 'f') F[nf++] = (float)x;
        else D[nd++] = x;
        break;
      }
      case 'p':
        I[ni++] = (long)js_pointer(ctx, v);
        break;
      case 's':
      case 'S': {
        const char *s = JS_ToCString(ctx, v);
        strings[ns++] = s;
        if (e->args[a] == 's') {
          I[ni++] = (long)s;
        } else {
          one_string[0] = s;
          I[ni++] = (long)one_string;
        }
        break;
      }
    }
  }
  long r = nd ? ((call_d)e->fn)(I[0], I[1], I[2], I[3], I[4], I[5], I[6], I[7], I[8], I[9],
                                I[10], I[11], D[0], D[1], D[2], D[3])
              : ((call_f)e->fn)(I[0], I[1], I[2], I[3], I[4], I[5], I[6], I[7], I[8], I[9],
                                I[10], I[11], F[0], F[1], F[2], F[3], F[4], F[5], F[6], F[7]);
  for (int s = 0; s < ns; s++) JS_FreeCString(ctx, strings[s]);
  switch (e->ret) {
    case 'i': return JS_NewInt32(ctx, (int32_t)r);
    case 'u': return JS_NewUint32(ctx, (uint32_t)r);
    case 'b': return JS_NewBool(ctx, (r & 0xff) != 0);
    case 'x': return JS_NewFloat64(ctx, (double)(uintptr_t)r);
    case 's': return r ? JS_NewString(ctx, (const char *)r) : JS_NULL;
    default: return JS_UNDEFINED;
  }
}

// __glBind(name, "r:args") -> function, or null if the entry point is missing.
static JSValue js_gl_bind(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *name = JS_ToCString(ctx, argv[0]);
  const char *sig = JS_ToCString(ctx, argv[1]);
  JSValue result = JS_NULL;
  void *fn = name ? (void *)eglGetProcAddress(name) : NULL;
  if (fn && sig && sig[0] && sig[1] == ':' && strlen(sig + 2) < sizeof entries[0].args &&
      entry_count < (int)(sizeof entries / sizeof entries[0])) {
    gl_entry *e = &entries[entry_count];
    e->fn = fn;
    e->ret = sig[0];
    strcpy(e->args, sig + 2);
    result = JS_NewCFunctionMagic(ctx, js_gl_call, name, (int)strlen(e->args),
                                  JS_CFUNC_generic_magic, entry_count++);
  } else if (!fn) {
    printf("GL entry point missing: %s\n", name ? name : "?");
  }
  JS_FreeCString(ctx, name);
  JS_FreeCString(ctx, sig);
  return result;
}

// ---- The game's canvas: an offscreen framebuffer drawn scaled into the
// screen as a textured quad (ps5-opengl does scaled blits on the CPU).

static GLuint canvas_fbo, canvas_tex, canvas_depth, present_program, present_vao;
static GLint present_rect;
static int canvas_w, canvas_h, screen_w = 1920, screen_h = 1080;

static GLuint compile(GLenum type, const char *src) {
  GLuint s = glCreateShader(type);
  glShaderSource(s, 1, &src, NULL);
  glCompileShader(s);
  GLint ok = 0;
  glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
  if (!ok) {
    char log[512];
    glGetShaderInfoLog(s, sizeof log, NULL, log);
    printf("present shader: %s\n", log);
  }
  return s;
}

static void present_init(void) {
  GLuint vs = compile(GL_VERTEX_SHADER,
                      "#version 410 core\n"
                      "uniform vec4 rect;\n"
                      "out vec2 uv;\n"
                      "void main() {\n"
                      "  uv = vec2(gl_VertexID & 1, gl_VertexID >> 1);\n"
                      "  gl_Position = vec4(mix(rect.xy, rect.zw, uv), 0.0, 1.0);\n"
                      "}\n");
  GLuint fs = compile(GL_FRAGMENT_SHADER,
                      "#version 410 core\n"
                      "uniform sampler2D canvas;\n"
                      "in vec2 uv;\n"
                      "out vec4 color;\n"
                      "void main() { color = vec4(texture(canvas, uv).rgb, 1.0); }\n");
  present_program = glCreateProgram();
  glAttachShader(present_program, vs);
  glAttachShader(present_program, fs);
  glLinkProgram(present_program);
  glDeleteShader(vs);
  glDeleteShader(fs);
  present_rect = glGetUniformLocation(present_program, "rect");
  glGenVertexArrays(1, &present_vao);
}

// __ps5.resize(w, h) -> the framebuffer that stands for the canvas. Leaves
// the texture and framebuffer bindings the game's renderer tracks as they were.
static JSValue js_resize(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int w = 0, h = 0;
  JS_ToInt32(ctx, &w, argv[0]);
  JS_ToInt32(ctx, &h, argv[1]);
  if (w < 1 || h < 1 || w > 3840 || h > 2160) return JS_ThrowRangeError(ctx, "canvas size");
  GLint texture, draw_fb, read_fb;
  glGetIntegerv(GL_TEXTURE_BINDING_2D, &texture);
  glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &draw_fb);
  glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &read_fb);
  int fresh = !canvas_fbo;
  if (fresh) {
    glGenFramebuffers(1, &canvas_fbo);
    glGenTextures(1, &canvas_tex);
    glGenRenderbuffers(1, &canvas_depth);
  }
  canvas_w = w;
  canvas_h = h;
  glBindTexture(GL_TEXTURE_2D, canvas_tex);
  glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
  glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
  glBindTexture(GL_TEXTURE_2D, texture);
  glBindRenderbuffer(GL_RENDERBUFFER, canvas_depth);
  glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, w, h);
  glBindRenderbuffer(GL_RENDERBUFFER, 0);
  glBindFramebuffer(GL_FRAMEBUFFER, canvas_fbo);
  glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, canvas_tex, 0);
  glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER,
                            canvas_depth);
  printf("canvas %dx%d fbo %u status 0x%x\n", w, h, canvas_fbo,
         glCheckFramebufferStatus(GL_FRAMEBUFFER));
  // A new canvas is what "no framebuffer" means from now on, so it stays bound.
  if (!fresh) {
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, draw_fb);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, read_fb);
  }
  return JS_NewUint32(ctx, canvas_fbo);
}

// Draws the canvas into the screen, letterboxed, then the HUD over it
// (__hudDraw in JavaScript), and puts back every piece of GL state they
// touched: the game's renderer caches its state and never asks.
static JSContext *hud_ctx;
static JSValue hud_draw = JS_UNDEFINED;

static void present_canvas(double now) {
  if (!canvas_fbo) return;
  static const GLenum caps[] = {GL_BLEND, GL_DEPTH_TEST, GL_CULL_FACE, GL_SCISSOR_TEST,
                                GL_STENCIL_TEST, GL_POLYGON_OFFSET_FILL,
                                GL_SAMPLE_ALPHA_TO_COVERAGE, GL_RASTERIZER_DISCARD};
  GLboolean enabled[sizeof caps / sizeof caps[0]], mask[4];
  GLint draw_fb, program, vao, unit, textures[2], samplers[2], viewport[4], array_buffer,
      unpack_buffer, unpack_alignment, blend[6];
  GLfloat clear[4];
  for (size_t i = 0; i < sizeof caps / sizeof caps[0]; i++) {
    enabled[i] = glIsEnabled(caps[i]);
    if (enabled[i]) glDisable(caps[i]);
  }
  glGetBooleanv(GL_COLOR_WRITEMASK, mask);
  glGetFloatv(GL_COLOR_CLEAR_VALUE, clear);
  glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &draw_fb);
  glGetIntegerv(GL_CURRENT_PROGRAM, &program);
  glGetIntegerv(GL_VERTEX_ARRAY_BINDING, &vao);
  glGetIntegerv(GL_VIEWPORT, viewport);
  glGetIntegerv(GL_ARRAY_BUFFER_BINDING, &array_buffer);
  glGetIntegerv(GL_PIXEL_UNPACK_BUFFER_BINDING, &unpack_buffer);
  glGetIntegerv(GL_UNPACK_ALIGNMENT, &unpack_alignment);
  glGetIntegerv(GL_BLEND_SRC_RGB, &blend[0]);
  glGetIntegerv(GL_BLEND_DST_RGB, &blend[1]);
  glGetIntegerv(GL_BLEND_SRC_ALPHA, &blend[2]);
  glGetIntegerv(GL_BLEND_DST_ALPHA, &blend[3]);
  glGetIntegerv(GL_BLEND_EQUATION_RGB, &blend[4]);
  glGetIntegerv(GL_BLEND_EQUATION_ALPHA, &blend[5]);
  glGetIntegerv(GL_ACTIVE_TEXTURE, &unit);
  for (int i = 0; i < 2; i++) {
    glActiveTexture(GL_TEXTURE0 + i);
    glGetIntegerv(GL_TEXTURE_BINDING_2D, &textures[i]);
    glGetIntegerv(GL_SAMPLER_BINDING, &samplers[i]);
    glBindSampler(i, 0);
  }
  glActiveTexture(GL_TEXTURE0);
  if (unpack_buffer) glBindBuffer(GL_PIXEL_UNPACK_BUFFER, 0);

  double scale = (double)screen_w / canvas_w;
  if (canvas_h * scale > screen_h) scale = (double)screen_h / canvas_h;
  double w = canvas_w * scale / screen_w, h = canvas_h * scale / screen_h;  // of the screen
  glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
  glViewport(0, 0, screen_w, screen_h);
  glColorMask(GL_TRUE, GL_TRUE, GL_TRUE, GL_TRUE);
  glClearColor(0, 0, 0, 1);
  glClear(GL_COLOR_BUFFER_BIT);
  glUseProgram(present_program);
  glUniform4f(present_rect, (float)-w, (float)-h, (float)w, (float)h);
  glBindVertexArray(present_vao);
  glBindTexture(GL_TEXTURE_2D, canvas_tex);
  glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);

  if (JS_IsFunction(hud_ctx, hud_draw)) {
    double rw = canvas_w * scale, rh = canvas_h * scale;
    JSValue args[5] = {JS_NewFloat64(hud_ctx, now), JS_NewFloat64(hud_ctx, (screen_w - rw) / 2),
                       JS_NewFloat64(hud_ctx, (screen_h - rh) / 2), JS_NewFloat64(hud_ctx, rw),
                       JS_NewFloat64(hud_ctx, rh)};
    JSValue r = JS_Call(hud_ctx, hud_draw, JS_UNDEFINED, 5, args);
    if (JS_IsException(r)) {
      JSValue e = JS_GetException(hud_ctx);
      const char *msg = JS_ToCString(hud_ctx, e);
      JSValue stack = JS_GetPropertyStr(hud_ctx, e, "stack");
      const char *st = JS_ToCString(hud_ctx, stack);
      printf("HUD failed, drawing stops: %s\n%s\n", msg ? msg : "?", st ? st : "");
      JS_FreeCString(hud_ctx, msg);
      JS_FreeCString(hud_ctx, st);
      JS_FreeValue(hud_ctx, stack);
      JS_FreeValue(hud_ctx, e);
      JS_FreeValue(hud_ctx, hud_draw);
      hud_draw = JS_UNDEFINED;
    }
    JS_FreeValue(hud_ctx, r);
  }

  for (int i = 1; i >= 0; i--) {
    glActiveTexture(GL_TEXTURE0 + i);
    glBindTexture(GL_TEXTURE_2D, textures[i]);
    glBindSampler(i, samplers[i]);
  }
  glActiveTexture(unit);
  glBindVertexArray(vao);
  glUseProgram(program);
  glBindBuffer(GL_ARRAY_BUFFER, array_buffer);
  if (unpack_buffer) glBindBuffer(GL_PIXEL_UNPACK_BUFFER, unpack_buffer);
  glPixelStorei(GL_UNPACK_ALIGNMENT, unpack_alignment);
  glBlendFuncSeparate(blend[0], blend[1], blend[2], blend[3]);
  glBlendEquationSeparate(blend[4], blend[5]);
  glViewport(viewport[0], viewport[1], viewport[2], viewport[3]);
  glClearColor(clear[0], clear[1], clear[2], clear[3]);
  glColorMask(mask[0], mask[1], mask[2], mask[3]);
  glBindFramebuffer(GL_DRAW_FRAMEBUFFER, draw_fb);
  for (size_t i = 0; i < sizeof caps / sizeof caps[0]; i++) {
    if (enabled[i]) glEnable(caps[i]);
    else glDisable(caps[i]);
  }
}

// ---- Controller

static int32_t pad_handle = -1;
static struct {
  uint32_t buttons;
  uint8_t lx, ly, rx, ry, l2, r2;
} pad;

static void pad_open(void) {
  int32_t user = -1;
  sceUserServiceInitialize(NULL);  // already initialised is fine
  if (sceUserServiceGetInitialUser(&user) != 0) return;
  scePadInit();
  for (int i = 0; i < 20 && pad_handle < 0; i++) {
    pad_handle = scePadOpen(user, 0, 0, NULL);
    if (pad_handle < 0) sceKernelUsleep(50000);
  }
  printf("pad user %d handle %d\n", user, pad_handle);
}

static void pad_read(void) {
  uint8_t data[256] __attribute__((aligned(16))) = {0};
  if (pad_handle < 0 || scePadReadState(pad_handle, data) != 0) return;
  memcpy(&pad.buttons, data, 4);
  pad.lx = data[4];
  pad.ly = data[5];
  pad.rx = data[6];
  pad.ry = data[7];
  pad.l2 = data[8];
  pad.r2 = data[9];
}

// __padState() -> [buttons, lx, ly, rx, ry, l2, r2, connected]
static JSValue js_pad_state(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  JSValue a = JS_NewArray(ctx);
  int32_t v[8] = {(int32_t)pad.buttons, pad.lx, pad.ly, pad.rx, pad.ry, pad.l2, pad.r2,
                  pad_handle >= 0};
  for (int i = 0; i < 8; i++) JS_SetPropertyUint32(ctx, a, i, JS_NewInt32(ctx, v[i]));
  return a;
}

// ---- Script host

static int quit_requested;

static JSValue js_now(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  return JS_NewFloat64(ctx, now_ms());
}

static JSValue js_print(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  for (int i = 0; i < argc; i++) {
    const char *s = JS_ToCString(ctx, argv[i]);
    if (s) fputs(s, stdout);
    JS_FreeCString(ctx, s);
    fputc(i + 1 < argc ? ' ' : '\n', stdout);
  }
  fflush(stdout);
  return JS_UNDEFINED;
}

static JSValue js_exit(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  quit_requested = 1;
  return JS_UNDEFINED;
}

// __ps5.readText(path) -> string or null
static JSValue js_read_text(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *path = JS_ToCString(ctx, argv[0]);
  size_t n;
  char *text = path ? read_file(path, &n) : NULL;
  JS_FreeCString(ctx, path);
  if (!text) return JS_NULL;
  JSValue s = JS_NewStringLen(ctx, text, n);
  free(text);
  return s;
}

static void print_exception(JSContext *ctx) {
  JSValue e = JS_GetException(ctx);
  JSValue stack = JS_GetPropertyStr(ctx, e, "stack");
  JSValue both[2] = {e, stack};
  js_print(ctx, JS_UNDEFINED, JS_IsUndefined(stack) ? 1 : 2, both);
  JS_FreeValue(ctx, stack);
  JS_FreeValue(ctx, e);
}

static void run_jobs(JSRuntime *rt) {
  JSContext *job_ctx;
  while (JS_ExecutePendingJob(rt, &job_ctx) > 0) {}
}

// Runs <name> from DEV_DIR if it is there, else from APP_DIR. Missing optional
// scripts are skipped.
static int run_script(JSContext *ctx, const char *name, int module, int optional) {
  char path[256];
  size_t n;
  snprintf(path, sizeof path, DEV_DIR "%s", name);
  char *src = read_file(path, &n);
  if (!src) {
    snprintf(path, sizeof path, APP_DIR "%s", name);
    src = read_file(path, &n);
  }
  if (!src) {
    if (!optional) printf("missing script %s\n", name);
    return optional ? 0 : -1;
  }
  double t = now_ms();
  JSValue r = JS_Eval(ctx, src, n, path, module ? JS_EVAL_TYPE_MODULE : JS_EVAL_TYPE_GLOBAL);
  free(src);
  int failed = JS_IsException(r);
  if (failed) print_exception(ctx);
  JS_FreeValue(ctx, r);
  run_jobs(JS_GetRuntime(ctx));
  printf("script %s %s in %.0f ms\n", path, failed ? "FAILED" : "ran", now_ms() - t);
  return failed ? -1 : 0;
}

// What runs: "launcher" or a game's name, saved in INDEX_FILE across the
// restarts that switch between them (a number there is a games.txt index).
// Without the file the launcher starts.
static void selection(char *name, size_t size) {
  size_t n;
  char *text = read_file(INDEX_FILE, &n);
  snprintf(name, size, "%s", text ? text : "launcher");
  free(text);
  name[strcspn(name, " \r\n")] = 0;
  if (!name[0]) snprintf(name, size, "launcher");
}

// The game `step` places from `name` in games.txt (wrapping), or `name` itself.
static void neighbour(const char *name, int step, char *out, size_t size) {
  size_t n;
  char *list = read_file(APP_DIR "games.txt", &n);
  char *names[256];
  int count = 0, at = -1;
  for (char *line = list ? strtok(list, "\n") : NULL; line && count < 256; line = strtok(NULL, "\n")) {
    if (!strcmp(line, name) || (name[0] >= '0' && name[0] <= '9' && atoi(name) == count)) at = count;
    names[count++] = line;
  }
  snprintf(out, size, "%s", count ? names[(((at < 0 ? 0 : at) + step) % count + count) % count] : name);
  free(list);
}

static JSContext *app_ctx;  // for saving the page's storage before a restart

static void flush_storage(void) {
  if (!app_ctx) return;
  JSValue global = JS_GetGlobalObject(app_ctx);
  JSValue fn = JS_GetPropertyStr(app_ctx, global, "__flushStorage");
  if (JS_IsFunction(app_ctx, fn)) JS_FreeValue(app_ctx, JS_Call(app_ctx, fn, global, 0, NULL));
  JS_FreeValue(app_ctx, fn);
  JS_FreeValue(app_ctx, global);
}

static void switch_to(const char *name) {
  flush_storage();
  FILE *f = fopen(INDEX_FILE, "w");
  if (f) {
    fprintf(f, "%s\n", name);
    fclose(f);
  }
  printf("switching to %s\n", name);
  fflush(stdout);
  sceSystemServiceLoadExec("/app0/eboot.bin", NULL);
}

// __ps5.launch(name): restarts the app into that game, or "launcher".
static JSValue js_launch(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *name = JS_ToCString(ctx, argv[0]);
  if (name && strlen(name) < 64 && strspn(name, "abcdefghijklmnopqrstuvwxyz0123456789-") == strlen(name))
    switch_to(name);
  JS_FreeCString(ctx, name);
  return JS_UNDEFINED;
}

// Screenshots on request, for checking the screen from the Mac: writing a new
// number into DEV_DIR/shot-request saves the next frame as DEV_DIR/shot.rgba
// (screen_w x screen_h RGBA, bottom row first).
static int shot_last;  // the request number already handled (or there at start)

static int shot_request(void) {
  size_t n;
  char *req = read_file(DEV_DIR "shot-request", &n);
  int want = req ? atoi(req) : 0;
  free(req);
  return want;
}

static void screenshot_if_asked(void) {
  int want = shot_request();
  if (want == shot_last) return;
  shot_last = want;
  unsigned char *pixels = malloc((size_t)screen_w * screen_h * 4);
  if (!pixels) return;
  GLint read_fb, pack;
  glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &read_fb);
  glGetIntegerv(GL_PACK_ALIGNMENT, &pack);
  glBindFramebuffer(GL_READ_FRAMEBUFFER, 0);
  glPixelStorei(GL_PACK_ALIGNMENT, 1);
  glReadPixels(0, 0, screen_w, screen_h, GL_RGBA, GL_UNSIGNED_BYTE, pixels);
  glPixelStorei(GL_PACK_ALIGNMENT, pack);
  glBindFramebuffer(GL_READ_FRAMEBUFFER, read_fb);
  FILE *f = fopen(DEV_DIR "shot.rgba", "wb");
  if (f) {
    fwrite(pixels, 1, (size_t)screen_w * screen_h * 4, f);
    fclose(f);
  }
  free(pixels);
  printf("screenshot %d saved (%dx%d)\n", want, screen_w, screen_h);
}

static void set_function(JSContext *ctx, JSValue obj, const char *name, JSCFunction *fn, int n) {
  JS_SetPropertyStr(ctx, obj, name, JS_NewCFunction(ctx, fn, name, n));
}

// ---- Frame statistics, logged every two seconds

typedef struct {
  int frames;
  double start, frame_sum, frame_worst, js_sum, js_worst, hud_sum, hud_worst, swap_sum, gpu_sum, gpu_worst;
  int gpu_count;
} stats;

static void stats_log(stats *s, double now, JSRuntime *rt) {
  JSMemoryUsage mem;
  JS_ComputeMemoryUsage(rt, &mem);
  double secs = (now - s->start) / 1000;
  printf("PERF {\"fps\":%.1f,\"frameMs\":%.2f,\"worstFrameMs\":%.1f,\"jsMs\":%.2f,"
         "\"worstJsMs\":%.1f,\"hudMs\":%.2f,\"worstHudMs\":%.1f,\"swapMs\":%.2f,\"gpuMs\":%.2f,\"worstGpuMs\":%.2f,"
         "\"jsHeapMB\":%.1f,\"heapMB\":%.1f,\"canvas\":\"%dx%d\"}\n",
         s->frames / secs, s->frame_sum / s->frames, s->frame_worst, s->js_sum / s->frames,
         s->js_worst, s->hud_sum / s->frames, s->hud_worst, s->swap_sum / s->frames, s->gpu_count ? s->gpu_sum / s->gpu_count : -1.0,
         s->gpu_worst, mem.malloc_size / 1048576.0, ps5_opengl_heap_live_bytes() / 1048576.0,
         canvas_w, canvas_h);
  fflush(stdout);
  memset(s, 0, sizeof *s);
  s->start = now;
}

static void *run(void *arg) {
  // The log goes where FTP can read it; /download0 if /data is not reachable.
  if (!freopen(DEV_DIR "app.log", "w", stdout)) freopen("/download0/app.log", "w", stdout);
  freopen(DEV_DIR "app.log", "a", stderr);
  setvbuf(stdout, NULL, _IOLBF, 0);
  printf("PocketVibe PS5 starting\n");

  EGLDisplay dpy = eglGetDisplay(EGL_DEFAULT_DISPLAY);
  eglSetDisplayModePS5(dpy, screen_w, screen_h);
  eglSetDisplayRefreshPS5(dpy, 60);
  EGLint major = 0, minor = 0;
  if (!eglInitialize(dpy, &major, &minor) || !eglBindAPI(EGL_OPENGL_API)) {
    printf("EGL init failed 0x%x\n", eglGetError());
    return NULL;
  }
  const EGLint config_attrs[] = {EGL_SURFACE_TYPE, EGL_WINDOW_BIT, EGL_RENDERABLE_TYPE,
                                 EGL_OPENGL_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8,
                                 EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8, EGL_DEPTH_SIZE, 24,
                                 EGL_STENCIL_SIZE, 8, EGL_NONE};
  EGLConfig config;
  EGLint configs = 0;
  eglChooseConfig(dpy, config_attrs, &config, 1, &configs);
  EGLSurface surface = eglCreateWindowSurface(dpy, config, (EGLNativeWindowType)0, NULL);
  const EGLint context_attrs[] = {EGL_CONTEXT_MAJOR_VERSION, 4, EGL_CONTEXT_MINOR_VERSION, 6,
                                  EGL_CONTEXT_OPENGL_PROFILE_MASK,
                                  EGL_CONTEXT_OPENGL_CORE_PROFILE_BIT, EGL_NONE};
  EGLContext context = eglCreateContext(dpy, config, EGL_NO_CONTEXT, context_attrs);
  if (!configs || surface == EGL_NO_SURFACE || context == EGL_NO_CONTEXT ||
      !eglMakeCurrent(dpy, surface, surface, context)) {
    printf("EGL setup failed 0x%x\n", eglGetError());
    return NULL;
  }
  eglQuerySurface(dpy, surface, EGL_WIDTH, &screen_w);
  eglQuerySurface(dpy, surface, EGL_HEIGHT, &screen_h);
  eglSwapInterval(dpy, 1);
  printf("EGL %d.%d, GL %s, %s, screen %dx%d\n", major, minor, glGetString(GL_VERSION),
         glGetString(GL_RENDERER), screen_w, screen_h);

  present_init();
  pad_open();

  files_init();
  // The console's time zone (minutes, plus an hour in summer time) and which
  // button confirms (0 circle, 1 cross).
  int dst = 0;
  sceSystemServiceParamGetInt(4, &tz_minutes);
  sceSystemServiceParamGetInt(5, &dst);
  if (dst) tz_minutes += 60;
  sceSystemServiceParamGetInt(1000, &enter_button);
  printf("time zone %+d min, enter button %d\n", tz_minutes, enter_button);

  JSRuntime *rt = JS_NewRuntime();
  JS_SetMaxStackSize(rt, 6u << 20);
  JS_SetModuleLoaderFunc(rt, NULL, module_loader, NULL);
  JSContext *ctx = JS_NewContext(rt);
  atom_id = JS_NewAtom(ctx, "id");
  app_ctx = ctx;
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue console = JS_NewObject(ctx);
  set_function(ctx, console, "log", js_print, 1);
  set_function(ctx, console, "info", js_print, 1);
  set_function(ctx, console, "warn", js_print, 1);
  set_function(ctx, console, "error", js_print, 1);
  JS_SetPropertyStr(ctx, global, "console", console);
  set_function(ctx, global, "__now", js_now, 0);
  set_function(ctx, global, "__glBind", js_gl_bind, 2);
  set_function(ctx, global, "__padState", js_pad_state, 0);
  JSValue host = JS_NewObject(ctx);
  set_function(ctx, host, "resize", js_resize, 2);
  set_function(ctx, host, "exit", js_exit, 0);
  set_function(ctx, host, "readText", js_read_text, 1);
  set_function(ctx, host, "text", js_text, 4);
  set_function(ctx, host, "glyph", js_glyph, 2);
  set_function(ctx, host, "advance", js_advance, 2);
  set_function(ctx, host, "fontMetrics", js_font_metrics, 1);
  set_function(ctx, host, "writeText", js_write_text, 2);
  set_function(ctx, host, "image", js_image, 1);
  set_function(ctx, host, "launch", js_launch, 1);
  JS_SetPropertyStr(ctx, host, "tzOffset", JS_NewInt32(ctx, tz_minutes));
  JS_SetPropertyStr(ctx, host, "enterButton", JS_NewInt32(ctx, enter_button));
  JS_SetPropertyStr(ctx, host, "screenWidth", JS_NewInt32(ctx, screen_w));
  JS_SetPropertyStr(ctx, host, "screenHeight", JS_NewInt32(ctx, screen_h));
  JS_SetPropertyStr(ctx, global, "__ps5", host);

  char game[128];
  selection(game, sizeof game);
  if (game[0] >= '0' && game[0] <= '9') neighbour(game, 0, game, sizeof game);
  int launcher = !strcmp(game, "launcher");
  char game_script[160] = "game.js";
  printf("running %s\n", game);
  JS_SetPropertyStr(ctx, global, "__storageName", JS_NewString(ctx, game));
  if (!launcher) {
    char dev_game[160];
    size_t n;
    snprintf(dev_game, sizeof dev_game, DEV_DIR "game.js");
    char *dev = read_file(dev_game, &n);  // a dev bundle overrides the list
    if (!dev) snprintf(game_script, sizeof game_script, "games/%s.js", game);
    free(dev);
  }
  // The game's stylesheet, for the HUD.
  char css_path[192];
  size_t css_len = 0;
  snprintf(css_path, sizeof css_path, APP_DIR "games/%s.css", game);
  char *css = launcher ? NULL : read_file(css_path, &css_len);
  JS_SetPropertyStr(ctx, global, "__gameCss", css ? JS_NewStringLen(ctx, css, css_len) : JS_NewString(ctx, ""));
  free(css);
  int failed = run_script(ctx, "config.js", 0, 1) || run_script(ctx, "glconst.js", 0, 0) ||
               run_script(ctx, "webgl.js", 0, 0) || run_script(ctx, "canvas2d.js", 0, 0) ||
               run_script(ctx, "dom.js", 0, 0) || run_script(ctx, "ps5.js", 0, 0);
  // The launcher is a page of its own: its HUD comes first, its module last.
  if (launcher && !failed)
    failed = run_script(ctx, "css.js", 0, 0) || run_script(ctx, "layout.js", 0, 0) ||
             run_script(ctx, "hud.js", 0, 0) || run_script(ctx, "ps5launcher.js", 0, 0) ||
             run_script(ctx, "launcher/launcher.js", 1, 0);
  if (launcher && !failed) {
    hud_ctx = ctx;
    hud_draw = JS_GetPropertyStr(ctx, global, "__hudDraw");
  }
  if (!launcher && !failed) failed = run_script(ctx, game_script, 1, 0);
  // The HUD after the game: a failure there leaves the game running without it.
  if (!launcher && !failed && !(run_script(ctx, "css.js", 0, 0) || run_script(ctx, "layout.js", 0, 0) ||
                   run_script(ctx, "hud.js", 0, 0) || run_script(ctx, "ps5hud.js", 0, 0))) {
    hud_ctx = ctx;
    hud_draw = JS_GetPropertyStr(ctx, global, "__hudDraw");
  }
  JSValue frame = JS_GetPropertyStr(ctx, global, "__frame");
  // PV_VSYNC = false (config.js) presents without waiting for vsync, to
  // measure how fast a game could run.
  JSValue vsync = JS_GetPropertyStr(ctx, global, "PV_VSYNC");
  if (JS_IsBool(vsync) && !JS_ToBool(ctx, vsync)) {
    eglSwapInterval(dpy, 0);
    printf("vsync off\n");
  }
  JS_FreeValue(ctx, vsync);

  shot_last = shot_request();
  GLuint queries[4];
  glGenQueries(4, queries);
  stats s = {0};
  s.start = now_ms();
  for (unsigned n = 0; !quit_requested; n++) {
    double t0 = now_ms();
    uint32_t before = pad.buttons;
    pad_read();
    uint32_t pressed = pad.buttons & ~before;
    if ((pad.buttons & (BTN_L1 | BTN_R1)) == (BTN_L1 | BTN_R1)) {
      if (pad.buttons & BTN_OPTIONS) break;
      if (pressed & (BTN_RIGHT | BTN_LEFT)) {
        char next[128];
        neighbour(launcher ? "" : game, pressed & BTN_RIGHT ? 1 : -1, next, sizeof next);
        switch_to(next);
      }
    }
    // START + SELECT (Options + touch pad) leaves a game for the launcher.
    if (!launcher && (pad.buttons & (BTN_OPTIONS | BTN_TOUCHPAD)) == (BTN_OPTIONS | BTN_TOUCHPAD)) switch_to("launcher");

    glBeginQuery(GL_TIME_ELAPSED, queries[n % 4]);
    if (!failed) {
      JSValue t = JS_NewFloat64(ctx, t0);
      JSValue r = JS_Call(ctx, frame, global, 1, &t);
      if (JS_IsException(r)) {
        print_exception(ctx);
        failed = 1;
      }
      JS_FreeValue(ctx, r);
      run_jobs(rt);
    }
    double t1 = now_ms();
    present_canvas(t0);
    run_jobs(rt);
    double th = now_ms();
    if (n % 30 == 0) screenshot_if_asked();
    glEndQuery(GL_TIME_ELAPSED);
    eglSwapBuffers(dpy, surface);
    double t2 = now_ms();

    if (n >= 3) {  // the query of three frames ago is done by now
      GLuint q = queries[(n - 3) % 4], available = 0;
      glGetQueryObjectuiv(q, GL_QUERY_RESULT_AVAILABLE, &available);
      if (available) {
        GLuint64 ns = 0;
        glGetQueryObjectui64v(q, GL_QUERY_RESULT, &ns);
        double ms = ns / 1e6;
        s.gpu_sum += ms;
        s.gpu_count++;
        if (ms > s.gpu_worst) s.gpu_worst = ms;
      }
    }
    double frame_ms = t2 - t0, js_ms = t1 - t0;
    s.frames++;
    s.frame_sum += frame_ms;
    s.js_sum += js_ms;
    s.hud_sum += th - t1;
    if (th - t1 > s.hud_worst) s.hud_worst = th - t1;
    s.swap_sum += t2 - th;
    if (frame_ms > s.frame_worst) s.frame_worst = frame_ms;
    if (js_ms > s.js_worst) s.js_worst = js_ms;
    if (t2 - s.start >= 2000) stats_log(&s, t2, rt);
  }

  flush_storage();
  printf("exiting\n");
  fflush(stdout);
  JS_FreeValue(ctx, frame);
  JS_FreeValue(ctx, global);
  // A native title must not return from main or call exit(): leave through
  // the system, then wait to be torn down.
  sceSystemServiceLoadExec("exit", NULL);
  for (;;) sceKernelUsleep(1000000);
  return NULL;
}

int main(void) {
  pthread_attr_t attr;
  pthread_t thread;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, 16u << 20);  // QuickJS recursion in three.js
  pthread_create(&thread, &attr, run, NULL);
  for (;;) sceKernelUsleep(1000000);
}
