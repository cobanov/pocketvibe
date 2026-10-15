// Payload for the ELF loader: runs a JavaScript file as a module with
// QuickJS and writes what it logs to SCRIPT.txt. Measures the console's
// JavaScript speed without any graphics. Usage: upload the script to
// /data/pocketvibe-dev/, send this ELF to port 9021, read SCRIPT.txt by FTP.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "quickjs.h"

#ifndef SCRIPT
#define SCRIPT "/data/pocketvibe-dev/bench.js"
#endif

static JSValue js_now(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return JS_NewFloat64(ctx, ts.tv_sec * 1e3 + ts.tv_nsec / 1e6);
}

static JSValue js_print(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  for (int i = 0; i < argc; i++) {
    const char *s = JS_ToCString(ctx, argv[i]);
    if (s) {
      fputs(s, stdout);
      fputc(i + 1 < argc ? ' ' : '\n', stdout);
      JS_FreeCString(ctx, s);
    }
  }
  fflush(stdout);
  return JS_UNDEFINED;
}

static void print_exception(JSContext *ctx) {
  JSValue e = JS_GetException(ctx);
  js_print(ctx, JS_UNDEFINED, 1, &e);
  JSValue stack = JS_GetPropertyStr(ctx, e, "stack");
  if (!JS_IsUndefined(stack)) js_print(ctx, JS_UNDEFINED, 1, &stack);
  JS_FreeValue(ctx, stack);
  JS_FreeValue(ctx, e);
}

int main(void) {
  freopen(SCRIPT ".txt", "w", stdout);
  printf("started\n");
  fflush(stdout);
  FILE *f = fopen(SCRIPT, "rb");
  if (!f) {
    printf("cannot open %s\n", SCRIPT);
    return 1;
  }
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *src = malloc(n + 1);
  fread(src, 1, n, f);
  src[n] = 0;
  fclose(f);

  JSRuntime *rt = JS_NewRuntime();
  JSContext *ctx = JS_NewContext(rt);
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue console = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, console, "log", JS_NewCFunction(ctx, js_print, "log", 1));
  JS_SetPropertyStr(ctx, console, "warn", JS_NewCFunction(ctx, js_print, "warn", 1));
  JS_SetPropertyStr(ctx, console, "error", JS_NewCFunction(ctx, js_print, "error", 1));
  JS_SetPropertyStr(ctx, global, "console", console);
  JS_SetPropertyStr(ctx, global, "__now", JS_NewCFunction(ctx, js_now, "__now", 0));
  JS_FreeValue(ctx, global);

  double start = JS_VALUE_GET_FLOAT64(js_now(ctx, JS_UNDEFINED, 0, NULL));
  JSValue r = JS_Eval(ctx, src, n, SCRIPT, JS_EVAL_TYPE_MODULE);
  if (JS_IsException(r)) print_exception(ctx);
  else {
    // Settle the module's promise (top-level code ran synchronously).
    JSContext *pending;
    while (JS_ExecutePendingJob(rt, &pending) > 0) {}
  }
  JS_FreeValue(ctx, r);
  double end = JS_VALUE_GET_FLOAT64(js_now(ctx, JS_UNDEFINED, 0, NULL));
  printf("TOTAL %.0f ms\n", end - start);
  fflush(stdout);
  JS_FreeContext(ctx);
  JS_FreeRuntime(rt);
  return 0;
}
