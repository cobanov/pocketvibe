// A 3840x2160 PNG -> the BC7 DDS the PS5 shell shows behind a title
// (sce_sys/pic0.dds, pic1.dds). Every block is BC7 mode 6 (one RGBA line,
// 16 steps), plenty for artwork. The header is taken from the boilerplate's
// own pic0.dds, which has this size and format. Prints the PSNR of a decode
// of the result, as a check of the encoder.
// Usage: bc7dds in.png template.dds out.dds

#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#include "stb_image.h"

enum { W = 3840, H = 2160, HEADER = 4 + 124 + 20 };
static const int weights[16] = {0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64};

static void put(uint8_t *b, int *pos, unsigned v, int n) {
  for (int i = 0; i < n; i++, (*pos)++)
    if (v >> i & 1) b[*pos >> 3] |= 1 << (*pos & 7);
}
static unsigned get(const uint8_t *b, int *pos, int n) {
  unsigned v = 0;
  for (int i = 0; i < n; i++, (*pos)++) v |= (unsigned)(b[*pos >> 3] >> (*pos & 7) & 1) << i;
  return v;
}
static int lerp(int a, int b, int i) { return ((64 - weights[i]) * a + weights[i] * b + 32) >> 6; }

// An 8-bit endpoint as 7 bits per channel plus a p-bit shared by its four.
static void quantize(const int want[4], int c7[4], int *p) {
  int best = -1;
  for (int pb = 0; pb < 2; pb++) {
    int err = 0, q[4];
    for (int c = 0; c < 4; c++) {
      q[c] = (want[c] - pb + 1) / 2;
      q[c] = q[c] < 0 ? 0 : q[c] > 127 ? 127 : q[c];
      int d = (q[c] << 1 | pb) - want[c];
      err += d * d;
    }
    if (best < 0 || err < best) best = err, *p = pb, memcpy(c7, q, sizeof q);
  }
}

static void encode(const uint8_t px[16][4], uint8_t out[16]) {
  // The bounding box's diagonal, each channel turned to follow the channel
  // with the widest range.
  int lo[4], hi[4], ref = 0;
  for (int c = 0; c < 4; c++) {
    lo[c] = 255, hi[c] = 0;
    for (int i = 0; i < 16; i++) lo[c] = px[i][c] < lo[c] ? px[i][c] : lo[c], hi[c] = px[i][c] > hi[c] ? px[i][c] : hi[c];
    if (hi[c] - lo[c] > hi[ref] - lo[ref]) ref = c;
  }
  double mean[4] = {0};
  for (int i = 0; i < 16; i++)
    for (int c = 0; c < 4; c++) mean[c] += px[i][c] / 16.0;
  for (int c = 0; c < 4; c++) {
    double cov = 0;
    for (int i = 0; i < 16; i++) cov += (px[i][c] - mean[c]) * (px[i][ref] - mean[ref]);
    if (cov < 0) { int t = lo[c]; lo[c] = hi[c]; hi[c] = t; }
  }
  int e[2][4], p[2];
  quantize(lo, e[0], &p[0]);
  quantize(hi, e[1], &p[1]);
  int idx[16];
  for (int i = 0; i < 16; i++) {
    int best = -1;
    for (int k = 0; k < 16; k++) {
      int err = 0;
      for (int c = 0; c < 4; c++) {
        int d = lerp(e[0][c] << 1 | p[0], e[1][c] << 1 | p[1], k) - px[i][c];
        err += d * d;
      }
      if (best < 0 || err < best) best = err, idx[i] = k;
    }
  }
  // The first index is stored in 3 bits, so its top bit must be clear.
  if (idx[0] & 8) {
    for (int c = 0; c < 4; c++) { int t = e[0][c]; e[0][c] = e[1][c]; e[1][c] = t; }
    int t = p[0]; p[0] = p[1]; p[1] = t;
    for (int i = 0; i < 16; i++) idx[i] = 15 - idx[i];
  }
  memset(out, 0, 16);
  int pos = 0;
  put(out, &pos, 1 << 6, 7);
  for (int c = 0; c < 4; c++) put(out, &pos, e[0][c], 7), put(out, &pos, e[1][c], 7);
  put(out, &pos, p[0], 1);
  put(out, &pos, p[1], 1);
  for (int i = 0; i < 16; i++) put(out, &pos, idx[i], i ? 4 : 3);
}

static void decode(const uint8_t in[16], uint8_t px[16][4]) {
  int pos = 7, e[2][4], p[2];
  for (int c = 0; c < 4; c++) e[0][c] = get(in, &pos, 7), e[1][c] = get(in, &pos, 7);
  p[0] = get(in, &pos, 1);
  p[1] = get(in, &pos, 1);
  for (int i = 0; i < 16; i++) {
    int k = get(in, &pos, i ? 4 : 3);
    for (int c = 0; c < 4; c++) px[i][c] = lerp(e[0][c] << 1 | p[0], e[1][c] << 1 | p[1], k);
  }
}

int main(int argc, char **argv) {
  if (argc != 4) return fprintf(stderr, "usage: bc7dds in.png template.dds out.dds\n"), 2;
  int w, h, n;
  uint8_t *img = stbi_load(argv[1], &w, &h, &n, 4);
  if (!img || w != W || h != H) return fprintf(stderr, "%s: need a %dx%d PNG\n", argv[1], W, H), 1;
  uint8_t header[HEADER];
  FILE *t = fopen(argv[2], "rb");
  if (!t || fread(header, 1, HEADER, t) != HEADER || memcmp(header, "DDS ", 4) || header[128] != 98)
    return fprintf(stderr, "%s: not a BC7 DDS\n", argv[2]), 1;
  fclose(t);
  FILE *o = fopen(argv[3], "wb");
  if (!o) return perror(argv[3]), 1;
  fwrite(header, 1, HEADER, o);
  double se = 0;
  for (int by = 0; by < H; by += 4)
    for (int bx = 0; bx < W; bx += 4) {
      uint8_t px[16][4], back[16][4], block[16];
      for (int i = 0; i < 16; i++) memcpy(px[i], img + ((by + i / 4) * W + bx + i % 4) * 4, 4);
      encode(px, block);
      decode(block, back);
      for (int i = 0; i < 16; i++)
        for (int c = 0; c < 3; c++) se += (double)(back[i][c] - px[i][c]) * (back[i][c] - px[i][c]);
      fwrite(block, 1, 16, o);
    }
  if (fclose(o)) return perror(argv[3]), 1;
  printf("%s: PSNR %.1f dB\n", argv[3], 10 * log10(255.0 * 255 / (se / ((double)W * H * 3))));
  return 0;
}
