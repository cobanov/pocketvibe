// Files for the scripts: saving under /data/pocketvibe (atomically: a power
// cut leaves the old file or the new one, never half of one), decoding PNG and
// JPEG pictures with stb_image, and loading ES modules from the app folder.

#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#include "stb_image.h"
#include "quickjs.h"

#define DATA_DIR "/data/pocketvibe/"

int sceKernelMkdir(const char *path, int mode);
int sceKernelRename(const char *from, const char *to);
int sceKernelFsync(int fd);

static char *slurp(const char *path, size_t *size) {
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

// Only plain names under DATA_DIR: scripts cannot write elsewhere.
static int safe_data_path(const char *path) {
  size_t n = strlen(DATA_DIR);
  if (strncmp(path, DATA_DIR, n) != 0 || strstr(path, "..")) return 0;
  for (const char *p = path + n; *p; p++)
    if (!(*p == '/' || *p == '-' || *p == '_' || *p == '.' || (*p >= 'a' && *p <= 'z') ||
          (*p >= 'A' && *p <= 'Z') || (*p >= '0' && *p <= '9')))
      return 0;
  return 1;
}

void files_init(void) {
  sceKernelMkdir("/data/pocketvibe", 0777);
  for (const char *const *d = (const char *const[]){"storage", "games", "downloads", "covers", NULL}; *d; d++) {
    char path[128];
    snprintf(path, sizeof path, DATA_DIR "%s", *d);
    sceKernelMkdir(path, 0777);
  }
}

// __ps5.writeText(path, text) -> true when saved.
JSValue js_write_text(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *path = JS_ToCString(ctx, argv[0]);
  size_t len;
  const char *text = JS_ToCStringLen(ctx, &len, argv[1]);
  int ok = 0;
  if (path && text && safe_data_path(path) && strlen(path) < 240) {
    char tmp[256];
    snprintf(tmp, sizeof tmp, "%s.part", path);
    FILE *f = fopen(tmp, "wb");
    if (f) {
      ok = fwrite(text, 1, len, f) == len;
      fflush(f);
      sceKernelFsync(fileno(f));
      fclose(f);
      ok = ok && sceKernelRename(tmp, path) == 0;
    }
  }
  JS_FreeCString(ctx, path);
  JS_FreeCString(ctx, text);
  return JS_NewBool(ctx, ok);
}

// __ps5.image(path) -> {w, h, data: Uint8Array RGBA} or null.
JSValue js_image(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *path = JS_ToCString(ctx, argv[0]);
  size_t n = 0;
  char *bytes = path ? slurp(path, &n) : NULL;
  JS_FreeCString(ctx, path);
  if (!bytes) return JS_NULL;
  int w, h, comp;
  unsigned char *px = stbi_load_from_memory((unsigned char *)bytes, (int)n, &w, &h, &comp, 4);
  free(bytes);
  if (!px) return JS_NULL;
  JSValue o = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, o, "w", JS_NewInt32(ctx, w));
  JS_SetPropertyStr(ctx, o, "h", JS_NewInt32(ctx, h));
  JS_SetPropertyStr(ctx, o, "data", JS_NewUint8ArrayCopy(ctx, px, (size_t)w * h * 4));
  stbi_image_free(px);
  return o;
}

// __ps5.readBinary(path) -> ArrayBuffer or null (game sounds and the like).
JSValue js_read_binary(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *path = JS_ToCString(ctx, argv[0]);
  size_t n = 0;
  char *bytes = path ? slurp(path, &n) : NULL;
  JS_FreeCString(ctx, path);
  if (!bytes) return JS_NULL;
  JSValue ab = JS_NewArrayBufferCopy(ctx, (uint8_t *)bytes, n);
  free(bytes);
  return ab;
}

// ES modules by path: imports resolve against the importing file (QuickJS's
// default normalizer), so a module tree under /app0/assets loads as is.
JSModuleDef *module_loader(JSContext *ctx, const char *name, void *opaque) {
  size_t n;
  char *src = slurp(name, &n);
  if (!src) {
    JS_ThrowReferenceError(ctx, "cannot load module %s", name);
    return NULL;
  }
  JSValue fn = JS_Eval(ctx, src, n, name, JS_EVAL_TYPE_MODULE | JS_EVAL_FLAG_COMPILE_ONLY);
  free(src);
  if (JS_IsException(fn)) return NULL;
  JSModuleDef *m = JS_VALUE_GET_PTR(fn);
  JS_FreeValue(ctx, fn);
  return m;
}
