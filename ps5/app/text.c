// Text from the console's own fonts (SST and friends, in the title's
// /preinst/common/font) with stb_truetype: lines rasterized for the 2D canvas,
// and single signed-distance glyphs, advances and metrics for the HUD.
// Characters a face lacks (arrows, stars) come from fallback fonts.
// Build with -DTEXT_TEST for a host program that renders a line to a PGM file.

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define STB_TRUETYPE_IMPLEMENTATION
#include "stb_truetype.h"

#ifndef FONT_DIR
#define FONT_DIR "/preinst/common/font/"
#endif

#define SDF_BASE 48.0f  // glyph size in the atlas, pixels per em
#define SDF_PAD 6       // distance range on each side of the outline, pixels

typedef struct {
  char name[48];
  int state;  // 1 loaded, -1 missing
  stbtt_fontinfo info;
} face;

static face faces[24];
static const char *fallbacks[] = {"SSTJpPro-Bold.otf", "SSTJpPro-Regular.otf", "DFHEI5-SONY.ttf"};

static face *get_face(const char *name) {
  int free_slot = -1;
  for (int i = 0; i < (int)(sizeof faces / sizeof faces[0]); i++) {
    if (faces[i].state && !strcmp(faces[i].name, name)) return faces[i].state == 1 ? &faces[i] : NULL;
    if (!faces[i].state && free_slot < 0) free_slot = i;
  }
  if (free_slot < 0) return NULL;
  face *f = &faces[free_slot];
  snprintf(f->name, sizeof f->name, "%s", name);
  f->state = -1;
  char path[256];
  snprintf(path, sizeof path, FONT_DIR "%s", name);
  FILE *file = fopen(path, "rb");
  if (file) {
    fseek(file, 0, SEEK_END);
    long n = ftell(file);
    fseek(file, 0, SEEK_SET);
    unsigned char *data = malloc(n);  // kept for the process's life, as stb needs
    if (data && fread(data, 1, n, file) == (size_t)n &&
        stbtt_InitFont(&f->info, data, stbtt_GetFontOffsetForIndex(data, 0)))
      f->state = 1;
    fclose(file);
  }
  return f->state == 1 ? f : NULL;
}

// The face that has codepoint c: the requested one, else a fallback.
static face *face_for(const char *name, int c) {
  face *f = get_face(name);
  if (f && (c < 0x80 || stbtt_FindGlyphIndex(&f->info, c))) return f;
  for (size_t i = 0; i < sizeof fallbacks / sizeof fallbacks[0]; i++) {
    face *fb = get_face(fallbacks[i]);
    if (fb && stbtt_FindGlyphIndex(&fb->info, c)) return fb;
  }
  return f;
}

// A signed-distance glyph: 128 on the outline, 128 / SDF_PAD per pixel,
// higher inside. stb_truetype's own SDF skips cubic curves, which the SST
// (CFF) fonts are made of, so the outline is flattened into segments here.
// Returns malloc'd w*h distances, or NULL for an empty glyph.
static unsigned char *glyph_sdf(const stbtt_fontinfo *info, int c, float scale, int *w, int *h,
                                int *xoff, int *yoff) {
  int x0, y0, x1, y1;
  stbtt_GetCodepointBitmapBox(info, c, scale, scale, &x0, &y0, &x1, &y1);
  stbtt_vertex *v;
  int n = stbtt_GetCodepointShape(info, c, &v);
  if (n <= 0 || x1 <= x0 || y1 <= y0) {
    if (n > 0) stbtt_FreeShape(info, v);
    return NULL;
  }
  // Segments in pixels (y down), curves split in 8.
  int cap = n * 8 + 8, count = 0;
  float *seg = malloc(sizeof(float) * 4 * cap);
  float px = 0, py = 0;
  for (int i = 0; i < n; i++) {
    float x = v[i].x * scale, y = -v[i].y * scale;
    if (v[i].type == STBTT_vline || v[i].type == STBTT_vcurve || v[i].type == STBTT_vcubic) {
      int steps = v[i].type == STBTT_vline ? 1 : 8;
      float cx = v[i].cx * scale, cy = -v[i].cy * scale, cx1 = v[i].cx1 * scale, cy1 = -v[i].cy1 * scale;
      float lx = px, ly = py;
      for (int k = 1; k <= steps && count < cap; k++) {
        float t = (float)k / steps, u = 1 - t, nx, ny;
        if (v[i].type == STBTT_vline) { nx = x; ny = y; }
        else if (v[i].type == STBTT_vcurve) { nx = u * u * px + 2 * u * t * cx + t * t * x; ny = u * u * py + 2 * u * t * cy + t * t * y; }
        else { nx = u * u * u * px + 3 * u * u * t * cx + 3 * u * t * t * cx1 + t * t * t * x; ny = u * u * u * py + 3 * u * u * t * cy + 3 * u * t * t * cy1 + t * t * t * y; }
        float *s = seg + 4 * count++;
        s[0] = lx; s[1] = ly; s[2] = nx; s[3] = ny;
        lx = nx; ly = ny;
      }
    }
    px = x;
    py = y;
  }
  stbtt_FreeShape(info, v);
  *xoff = x0 - SDF_PAD;
  *yoff = y0 - SDF_PAD;
  *w = x1 - x0 + 2 * SDF_PAD;
  *h = y1 - y0 + 2 * SDF_PAD;
  unsigned char *out = malloc((size_t)*w * *h);
  for (int j = 0; j < *h; j++) {
    float qy = *yoff + j + 0.5f;
    for (int i = 0; i < *w; i++) {
      float qx = *xoff + i + 0.5f, best = 1e30f;
      int winding = 0;
      for (int k = 0; k < count; k++) {
        const float *s = seg + 4 * k;
        float dx = s[2] - s[0], dy = s[3] - s[1], len = dx * dx + dy * dy;
        float t = len > 0 ? ((qx - s[0]) * dx + (qy - s[1]) * dy) / len : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        float ex = s[0] + t * dx - qx, ey = s[1] + t * dy - qy, d = ex * ex + ey * ey;
        if (d < best) best = d;
        // Nonzero winding along a ray to the right.
        if ((s[1] <= qy) != (s[3] <= qy)) {
          float cross = s[0] + (qy - s[1]) * dx / dy;
          if (cross > qx) winding += s[3] > s[1] ? 1 : -1;
        }
      }
      float dist = sqrtf(best) * (winding ? 1.0f : -1.0f);
      float value = 128.0f + dist * (128.0f / SDF_PAD);
      out[j * *w + i] = (unsigned char)(value < 0 ? 0 : value > 255 ? 255 : value);
    }
  }
  free(seg);
  return out;
}

// The 2D canvas's styles: bit 1 bold, bit 2 italic.
static const char *style_faces[4] = {"SST-Roman.otf", "SST-Bold.otf", "SST-Italic.otf", "SST-BoldItalic.otf"};

static int next_codepoint(const unsigned char **s) {
  const unsigned char *p = *s;
  int c = *p++, extra = c >= 0xf0 ? 3 : c >= 0xe0 ? 2 : c >= 0xc0 ? 1 : 0;
  if (extra) c &= 0x3f >> extra;
  while (extra-- && (*p & 0xc0) == 0x80) c = (c << 6) | (*p++ & 0x3f);
  *s = p;
  return c;
}

typedef struct {
  float advance, ascent, descent;  // pixels; descent is positive
  int left, top, w, h;             // mask position from the pen start and baseline
  unsigned char *mask;             // w*h coverage, NULL when only measuring
} text_run;

// Lays out (and with render, rasterizes) one line of UTF-8 at px pixels per em.
static int text_layout(const char *utf8, float px, int style, int render, text_run *out) {
  const char *name = style_faces[style & 3];
  face *main_face = get_face(name);
  memset(out, 0, sizeof *out);
  if (!main_face || px <= 0) return -1;
  int asc, desc, gap;
  stbtt_GetFontVMetrics(&main_face->info, &asc, &desc, &gap);
  float main_scale = stbtt_ScaleForMappingEmToPixels(&main_face->info, px);
  out->ascent = asc * main_scale;
  out->descent = -desc * main_scale;

  // First pass: pen positions and the union of the glyph boxes.
  float pen = 0;
  int minx = 1 << 30, miny = 1 << 30, maxx = -(1 << 30), maxy = -(1 << 30), prev = 0;
  face *prev_face = NULL;
  for (const unsigned char *s = (const unsigned char *)utf8; *s;) {
    int c = next_codepoint(&s), adv, lsb, x0, y0, x1, y1;
    face *f = face_for(name, c);
    float scale = stbtt_ScaleForMappingEmToPixels(&f->info, px);
    if (prev && f == prev_face) pen += stbtt_GetCodepointKernAdvance(&f->info, prev, c) * scale;
    stbtt_GetCodepointHMetrics(&f->info, c, &adv, &lsb);
    stbtt_GetCodepointBitmapBoxSubpixel(&f->info, c, scale, scale, pen - (int)pen, 0, &x0, &y0, &x1, &y1);
    if (x1 > x0 && y1 > y0) {
      if ((int)pen + x0 < minx) minx = (int)pen + x0;
      if ((int)pen + x1 > maxx) maxx = (int)pen + x1;
      if (y0 < miny) miny = y0;
      if (y1 > maxy) maxy = y1;
    }
    pen += adv * scale;
    prev = c;
    prev_face = f;
  }
  out->advance = pen;
  if (maxx <= minx || !render) return 0;
  out->left = minx;
  out->top = miny;
  out->w = maxx - minx;
  out->h = maxy - miny;
  out->mask = calloc((size_t)out->w * out->h, 1);
  unsigned char *glyph = malloc((size_t)out->w * out->h);
  if (!out->mask || !glyph) {
    free(glyph);
    return -1;
  }

  // Second pass: each glyph into the mask, keeping the larger coverage where
  // neighbours overlap.
  pen = 0;
  prev = 0;
  prev_face = NULL;
  for (const unsigned char *s = (const unsigned char *)utf8; *s;) {
    int c = next_codepoint(&s), adv, lsb, x0, y0, x1, y1;
    face *f = face_for(name, c);
    float scale = stbtt_ScaleForMappingEmToPixels(&f->info, px);
    if (prev && f == prev_face) pen += stbtt_GetCodepointKernAdvance(&f->info, prev, c) * scale;
    float shift = pen - (int)pen;
    stbtt_GetCodepointBitmapBoxSubpixel(&f->info, c, scale, scale, shift, 0, &x0, &y0, &x1, &y1);
    int gw = x1 - x0, gh = y1 - y0;
    if (gw > 0 && gh > 0) {
      stbtt_MakeCodepointBitmapSubpixel(&f->info, glyph, gw, gh, gw, scale, scale, shift, 0, c);
      int ox = (int)pen + x0 - minx, oy = y0 - miny;
      for (int y = 0; y < gh; y++) {
        unsigned char *row = out->mask + (size_t)(oy + y) * out->w + ox;
        for (int x = 0; x < gw; x++)
          if (glyph[y * gw + x] > row[x]) row[x] = glyph[y * gw + x];
      }
    }
    stbtt_GetCodepointHMetrics(&f->info, c, &adv, &lsb);
    pen += adv * scale;
    prev = c;
    prev_face = f;
  }
  free(glyph);
  return 0;
}

#ifdef TEXT_TEST
int main(int argc, char **argv) {
  text_run run;
  if (argc < 3 || text_layout(argv[1], (float)atof(argv[2]), argc > 3 ? atoi(argv[3]) : 1, 1, &run)) {
    fprintf(stderr, "usage: text-test <text> <px> [style]  (or the font is missing)\n");
    return 1;
  }
  printf("advance %.1f ascent %.1f descent %.1f mask %dx%d at (%d,%d)\n", run.advance, run.ascent,
         run.descent, run.w, run.h, run.left, run.top);
  FILE *f = fopen("text-test.pgm", "wb");
  fprintf(f, "P5 %d %d 255\n", run.w, run.h);
  fwrite(run.mask, 1, (size_t)run.w * run.h, f);
  fclose(f);
  // The SDF of "S" magnified 4x and thresholded, to check curves survive.
  int w, h, xoff, yoff;
  face *sf = face_for("SST-Bold.otf", 'S');
  unsigned char *sdf = glyph_sdf(&sf->info, 'S', stbtt_ScaleForMappingEmToPixels(&sf->info, SDF_BASE), &w, &h, &xoff, &yoff);
  printf("sdf of S: %dx%d at (%d,%d)\n", w, h, xoff, yoff);
  FILE *g = fopen("sdf-test.pgm", "wb");
  fprintf(g, "P5 %d %d 255\n", w * 4, h * 4);
  for (int y = 0; y < h * 4; y++)
    for (int x = 0; x < w * 4; x++) {
      float fx = x / 4.0f, fy = y / 4.0f;
      int ix = (int)fx, iy = (int)fy;
      int ix1 = ix + 1 < w ? ix + 1 : ix, iy1 = iy + 1 < h ? iy + 1 : iy;
      float ax = fx - ix, ay = fy - iy;
      float d = (sdf[iy * w + ix] * (1 - ax) + sdf[iy * w + ix1] * ax) * (1 - ay) + (sdf[iy1 * w + ix] * (1 - ax) + sdf[iy1 * w + ix1] * ax) * ay;
      fputc(d > 128 ? 255 : d > 120 ? (int)((d - 120) * 32) : 0, g);
    }
  fclose(g);
  free(sdf);
  return 0;
}
#else
#include "quickjs.h"

static void set_num(JSContext *ctx, JSValue o, const char *k, double v) { JS_SetPropertyStr(ctx, o, k, JS_NewFloat64(ctx, v)); }

// __ps5.text(string, px, style, render) -> {advance, ascent, descent, left, top,
// w, h, mask: Uint8Array|null}: a whole line for the 2D canvas.
JSValue js_text(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *s = JS_ToCString(ctx, argv[0]);
  double px = 0;
  int style = 0, render = 0;
  JS_ToFloat64(ctx, &px, argv[1]);
  JS_ToInt32(ctx, &style, argv[2]);
  render = JS_ToBool(ctx, argv[3]);
  text_run run;
  int failed = !s || text_layout(s, (float)px, style, render, &run);
  JS_FreeCString(ctx, s);
  if (failed) return JS_NULL;
  JSValue o = JS_NewObject(ctx);
  set_num(ctx, o, "advance", run.advance);
  set_num(ctx, o, "ascent", run.ascent);
  set_num(ctx, o, "descent", run.descent);
  set_num(ctx, o, "left", run.left);
  set_num(ctx, o, "top", run.top);
  set_num(ctx, o, "w", run.w);
  set_num(ctx, o, "h", run.h);
  JS_SetPropertyStr(ctx, o, "mask",
                    run.mask ? JS_NewUint8ArrayCopy(ctx, run.mask, (size_t)run.w * run.h) : JS_NULL);
  free(run.mask);
  return o;
}

// __ps5.glyph(codepoint, faceFile) -> {advance (em), w, h, xoff, yoff, base,
// pad, data: Uint8Array signed distances (128 on the outline)}.
JSValue js_glyph(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int c = 0;
  JS_ToInt32(ctx, &c, argv[0]);
  const char *name = JS_ToCString(ctx, argv[1]);
  face *f = name ? face_for(name, c) : NULL;
  JS_FreeCString(ctx, name);
  if (!f) return JS_NULL;
  float scale = stbtt_ScaleForMappingEmToPixels(&f->info, SDF_BASE);
  int adv, lsb, w = 0, h = 0, xoff = 0, yoff = 0;
  stbtt_GetCodepointHMetrics(&f->info, c, &adv, &lsb);
  unsigned char *sdf = glyph_sdf(&f->info, c, scale, &w, &h, &xoff, &yoff);
  JSValue o = JS_NewObject(ctx);
  set_num(ctx, o, "advance", adv * scale / SDF_BASE);
  set_num(ctx, o, "w", sdf ? w : 0);
  set_num(ctx, o, "h", sdf ? h : 0);
  set_num(ctx, o, "xoff", xoff);
  set_num(ctx, o, "yoff", yoff);
  set_num(ctx, o, "base", SDF_BASE);
  set_num(ctx, o, "pad", SDF_PAD);
  JS_SetPropertyStr(ctx, o, "data", sdf ? JS_NewUint8ArrayCopy(ctx, sdf, (size_t)w * h) : JS_NULL);
  free(sdf);
  return o;
}

// __ps5.advance(codepoint, faceFile) -> advance in em.
JSValue js_advance(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  int c = 0;
  JS_ToInt32(ctx, &c, argv[0]);
  const char *name = JS_ToCString(ctx, argv[1]);
  face *f = name ? face_for(name, c) : NULL;
  JS_FreeCString(ctx, name);
  if (!f) return JS_NewFloat64(ctx, 0.5);
  int adv, lsb;
  stbtt_GetCodepointHMetrics(&f->info, c, &adv, &lsb);
  return JS_NewFloat64(ctx, adv * stbtt_ScaleForMappingEmToPixels(&f->info, 1.0f));
}

// __ps5.fontMetrics(faceFile) -> {ascent, descent, lineGap} in em.
JSValue js_font_metrics(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv) {
  const char *name = JS_ToCString(ctx, argv[0]);
  face *f = name ? get_face(name) : NULL;
  JS_FreeCString(ctx, name);
  if (!f) return JS_NULL;
  int asc, desc, gap;
  stbtt_GetFontVMetrics(&f->info, &asc, &desc, &gap);
  float s = stbtt_ScaleForMappingEmToPixels(&f->info, 1.0f);
  JSValue o = JS_NewObject(ctx);
  set_num(ctx, o, "ascent", asc * s);
  set_num(ctx, o, "descent", -desc * s);
  set_num(ctx, o, "lineGap", gap * s);
  return o;
}
#endif
