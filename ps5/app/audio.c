// Web Audio's engine for the scripts: a graph of nodes (gain, buffer source,
// oscillator, biquad filter, stereo panner, compressor, delay) rendered in
// blocks of 128 frames, with AudioParam automation, mixed to the PS5's audio
// output on a thread of its own at 48 kHz. Offline contexts render the same
// graph into a buffer. WAV and Ogg Vorbis decode here. runtime/audio.js puts
// the Web Audio API on top. Build with -DAUDIO_TEST for a host check.

#include <math.h>
#include <pthread.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define STB_VORBIS_NO_STDIO
#define STB_VORBIS_NO_PUSHDATA_API
#include "stb_vorbis.c"

#define BLOCK 128
#define RATE 48000.0f
#define OUT_FRAMES 256
#define MAX_PARAMS 5

enum { EV_SET, EV_LINEAR, EV_EXP, EV_TARGET };
typedef struct {
  int type;
  double time;
  float value, tau;
} event;

typedef struct {
  float base;
  event *ev;
  int nev, cap;
  int inputs[4];  // nodes modulating this parameter
  int ninputs;
} param;

enum { N_FREE, N_DEST, N_GAIN, N_SOURCE, N_OSC, N_BIQUAD, N_PANNER, N_COMP, N_DELAY };

typedef struct {
  int channels, length, refs;
  float rate;
  float *data;  // planar: channel c at data + c * length
} abuf;

typedef struct {
  int type, ctx, js_alive;
  int *inputs, ninputs, capin;
  param p[MAX_PARAMS];
  float out[2][BLOCK];
  int out_ch;
  long stamp;
  // buffer source
  int buffer, started, ended, ended_reported, loop;
  double pos, start_t, stop_t, loop_start, loop_end;
  // oscillator, biquad
  int kind;
  double phase;
  float bq[2][4];
  // delay
  float *line;
  int line_len, line_pos;
  // compressor
  float env;
} anode;

typedef struct {
  int used, offline, channels, dest;
  float rate;
  long frames, length, stamp;
} actx;

static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static anode *nodes;
static int nnodes;
static abuf *bufs;
static int nbufs;
static actx ctxs[64];
static int ended_queue[256], nended;

// ---- Parameters

static void param_init(param *p, float base) {
  memset(p, 0, sizeof *p);
  p->base = base;
}

// The automation's value at time t (Web Audio's rules, simplified: a ramp
// runs from the event before it).
static float param_at(const param *p, double t) {
  float v = p->base;
  double vt = 0;
  for (int i = 0; i < p->nev; i++) {
    const event *e = &p->ev[i];
    if (e->type == EV_TARGET) {
      if (e->time > t) break;
      double until = i + 1 < p->nev && p->ev[i + 1].time <= t ? p->ev[i + 1].time : t;
      v = e->value + (v - e->value) * (float)exp(-(until - e->time) / (e->tau > 0 ? e->tau : 1e-4));
      vt = until;
      continue;
    }
    if (e->time <= t) {
      v = e->value;
      vt = e->time;
      continue;
    }
    if (e->type == EV_LINEAR) {
      double f = e->time > vt ? (t - vt) / (e->time - vt) : 1;
      return v + (e->value - v) * (float)f;
    }
    if (e->type == EV_EXP && v * e->value > 0) {
      double f = e->time > vt ? (t - vt) / (e->time - vt) : 1;
      return v * (float)pow(e->value / v, f);
    }
    break;
  }
  return v;
}

static void param_event(param *p, int type, float value, double time, float tau) {
  // Events stay in time order; one at the same time as an existing one replaces it.
  if (p->nev == p->cap) {
    p->cap = p->cap ? p->cap * 2 : 8;
    p->ev = realloc(p->ev, sizeof(event) * p->cap);
  }
  int i = p->nev;
  while (i > 0 && p->ev[i - 1].time > time) i--;
  memmove(p->ev + i + 1, p->ev + i, sizeof(event) * (p->nev - i));
  p->ev[i] = (event){type, time, value, tau};
  p->nev++;
}

// Drops events wholly in the past, keeping their value as the base.
static void param_trim(param *p, double now) {
  if (p->nev < 32) return;
  int keep = 0;
  while (keep + 1 < p->nev && p->ev[keep + 1].time <= now && p->ev[keep + 1].type != EV_TARGET && p->ev[keep].type != EV_TARGET) keep++;
  if (keep > 0) {
    p->base = param_at(p, p->ev[keep - 1].time);
    memmove(p->ev, p->ev + keep, sizeof(event) * (p->nev - keep));
    p->nev -= keep;
  }
}

// ---- Nodes and buffers

static int new_node(int ctx, int type) {
  int id = -1;
  for (int i = 0; i < nnodes; i++)
    if (nodes[i].type == N_FREE) { id = i; break; }
  if (id < 0) {
    nodes = realloc(nodes, sizeof(anode) * (nnodes + 64));
    memset(nodes + nnodes, 0, sizeof(anode) * 64);
    id = nnodes;
    nnodes += 64;
  }
  anode *n = &nodes[id];
  memset(n, 0, sizeof *n);
  n->type = type;
  n->ctx = ctx;
  n->js_alive = 1;
  n->buffer = -1;
  n->stamp = -1;
  n->out_ch = 1;
  float defaults[][MAX_PARAMS] = {
      [N_GAIN] = {1}, [N_SOURCE] = {1, 0}, [N_OSC] = {440, 0}, [N_BIQUAD] = {350, 1, 0, 0},
      [N_PANNER] = {0}, [N_COMP] = {-24, 30, 12, 0.003f, 0.25f}, [N_DELAY] = {0},
  };
  for (int i = 0; i < MAX_PARAMS; i++) param_init(&n->p[i], type < (int)(sizeof defaults / sizeof defaults[0]) ? defaults[type][i] : 0);
  return id;
}

static int new_buffer(int channels, int length, float rate) {
  int id = -1;
  for (int i = 0; i < nbufs; i++)
    if (!bufs[i].data) { id = i; break; }
  if (id < 0) {
    bufs = realloc(bufs, sizeof(abuf) * (nbufs + 32));
    memset(bufs + nbufs, 0, sizeof(abuf) * 32);
    id = nbufs;
    nbufs += 32;
  }
  bufs[id] = (abuf){channels, length, 1, rate, calloc((size_t)channels * (length ? length : 1), sizeof(float))};
  return id;
}

static void unref_buffer(int id) {
  if (id >= 0 && id < nbufs && bufs[id].data && --bufs[id].refs <= 0) {
    free(bufs[id].data);
    bufs[id].data = NULL;
  }
}

static void remove_input(anode *n, int id) {
  for (int i = 0; i < n->ninputs; i++)
    if (n->inputs[i] == id) n->inputs[i--] = n->inputs[--n->ninputs];
  for (int k = 0; k < MAX_PARAMS; k++)
    for (int i = 0; i < n->p[k].ninputs; i++)
      if (n->p[k].inputs[i] == id) n->p[k].inputs[i--] = n->p[k].inputs[--n->p[k].ninputs];
}

static void free_node(int id) {
  anode *n = &nodes[id];
  for (int i = 0; i < nnodes; i++)
    if (nodes[i].type != N_FREE) remove_input(&nodes[i], id);
  if (n->buffer >= 0) unref_buffer(n->buffer);
  for (int k = 0; k < MAX_PARAMS; k++) free(n->p[k].ev);
  free(n->inputs);
  free(n->line);
  n->type = N_FREE;
}

// Frees nodes the scripts dropped that nothing still plays through: no
// inputs, and for a source, finished or never started.
static void collect(void) {
  for (int changed = 1; changed;) {
    changed = 0;
    for (int i = 0; i < nnodes; i++) {
      anode *n = &nodes[i];
      if (n->type == N_FREE || n->type == N_DEST || n->js_alive || n->ninputs) continue;
      if ((n->type == N_SOURCE || n->type == N_OSC) && n->started && !n->ended) continue;
      int feeds = 0;  // still referenced as an input of a live node is fine to cut
      (void)feeds;
      free_node(i);
      changed = 1;
    }
  }
}

// ---- Rendering

static void render(actx *c, int id);

// A parameter's values over this block: the automation (linear across the
// block) plus whatever is connected to it.
static void param_block(actx *c, anode *n, int k, float *out) {
  double t0 = c->frames / (double)c->rate;
  float a = param_at(&n->p[k], t0), b = param_at(&n->p[k], t0 + BLOCK / (double)c->rate);
  for (int i = 0; i < BLOCK; i++) out[i] = a + (b - a) * i / BLOCK;
  for (int j = 0; j < n->p[k].ninputs; j++) {
    int src = n->p[k].inputs[j];
    render(c, src);
    for (int i = 0; i < BLOCK; i++) out[i] += nodes[src].out[0][i];
  }
}

static void render(actx *c, int id) {
  anode *n = &nodes[id];
  if (n->stamp == c->stamp) return;  // done this block (or inside a feedback loop)
  n->stamp = c->stamp;
  float in[2][BLOCK], out[2][BLOCK], pv[BLOCK];
  memset(in, 0, sizeof in);
  memset(out, 0, sizeof out);
  int in_ch = 1;
  for (int j = 0; j < n->ninputs; j++) {
    anode *src = &nodes[n->inputs[j]];
    render(c, n->inputs[j]);
    if (src->out_ch == 2) in_ch = 2;
    for (int i = 0; i < BLOCK; i++) {
      in[0][i] += src->out[0][i];
      in[1][i] += src->out[src->out_ch == 2 ? 1 : 0][i];
    }
  }
  double t0 = c->frames / (double)c->rate;
  int out_ch = in_ch;
  switch (n->type) {
    case N_DEST:
    case N_GAIN:
      if (n->type == N_GAIN) param_block(c, n, 0, pv);
      for (int ch = 0; ch < 2; ch++)
        for (int i = 0; i < BLOCK; i++) out[ch][i] = in[ch][i] * (n->type == N_GAIN ? pv[i] : 1);
      if (n->type == N_DEST) out_ch = 2;
      break;
    case N_SOURCE: {
      out_ch = 1;
      if (!n->started || n->ended || n->buffer < 0 || !bufs[n->buffer].data) break;
      abuf *b = &bufs[n->buffer];
      out_ch = b->channels > 1 ? 2 : 1;
      float rate = param_at(&n->p[0], t0) * powf(2, param_at(&n->p[1], t0) / 1200) * b->rate / c->rate;
      double ls = n->loop_start * b->rate, le = n->loop_end > n->loop_start ? n->loop_end * b->rate : b->length;
      for (int i = 0; i < BLOCK; i++) {
        double t = t0 + i / (double)c->rate;
        if (t < n->start_t) continue;
        if (n->stop_t >= 0 && t >= n->stop_t) { n->ended = 1; break; }
        if (n->loop) {
          if (n->pos >= le) n->pos = ls + fmod(n->pos - ls, le - ls > 1 ? le - ls : 1);
        } else if (n->pos >= b->length - 1) {
          n->ended = 1;
          break;
        }
        int p0 = (int)n->pos;
        float f = (float)(n->pos - p0);
        int p1 = p0 + 1 < b->length ? p0 + 1 : (n->loop ? (int)ls : p0);
        for (int ch = 0; ch < out_ch; ch++) {
          const float *d = b->data + (size_t)ch * b->length;
          out[ch][i] = d[p0] + (d[p1] - d[p0]) * f;
        }
        n->pos += rate;
      }
      break;
    }
    case N_OSC: {
      out_ch = 1;
      if (!n->started || n->ended) break;
      param_block(c, n, 0, pv);
      float detune = powf(2, param_at(&n->p[1], t0) / 1200);
      for (int i = 0; i < BLOCK; i++) {
        double t = t0 + i / (double)c->rate;
        if (t < n->start_t) continue;
        if (n->stop_t >= 0 && t >= n->stop_t) { n->ended = 1; break; }
        double ph = n->phase - floor(n->phase);
        float v = n->kind == 1 ? (ph < 0.5 ? 1.f : -1.f)
                  : n->kind == 2 ? (float)(2 * ph - 1)
                  : n->kind == 3 ? (float)(ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph)
                                 : sinf((float)(ph * 2 * M_PI));
        out[0][i] = v;
        n->phase += pv[i] * detune / c->rate;
      }
      break;
    }
    case N_BIQUAD: {
      // Robert Bristow-Johnson's cookbook, coefficients once per block.
      float f0 = param_at(&n->p[0], t0) * powf(2, param_at(&n->p[3], t0) / 1200);
      float q = param_at(&n->p[1], t0), gain = param_at(&n->p[2], t0);
      float w = 2 * (float)M_PI * fminf(f0, c->rate * 0.49f) / c->rate, cw = cosf(w), sw = sinf(w);
      float A = powf(10, gain / 40), b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
      int k = n->kind;
      float qlin = (k == 0 || k == 1) ? powf(10, q / 20) : fmaxf(q, 1e-4f);  // lowpass/highpass Q is in dB
      float alpha = sw / (2 * qlin);
      if (k == 0) { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
      else if (k == 1) { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
      else if (k == 2) { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
      else if (k == 6) { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
      else if (k == 7) { b0 = 1 - alpha; b1 = -2 * cw; b2 = 1 + alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; }
      else if (k == 5) { b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; }
      else {  // shelves, slope 1
        float s = 2 * sqrtf(A) * sw / 2 * sqrtf(2);
        if (k == 3) { b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s); a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; }
        else { b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s); a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; }
      }
      b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
      for (int ch = 0; ch < in_ch; ch++) {
        float *z = n->bq[ch];  // x1 x2 y1 y2
        for (int i = 0; i < BLOCK; i++) {
          float x = in[ch][i], y = b0 * x + b1 * z[0] + b2 * z[1] - a1 * z[2] - a2 * z[3];
          z[1] = z[0]; z[0] = x; z[3] = z[2]; z[2] = y;
          out[ch][i] = y;
        }
      }
      break;
    }
    case N_PANNER: {
      out_ch = 2;
      float pan = fmaxf(-1, fminf(1, param_at(&n->p[0], t0)));
      float x = in_ch == 1 ? (pan + 1) / 2 : (pan <= 0 ? pan + 1 : pan);
      float gl = cosf(x * (float)M_PI / 2), gr = sinf(x * (float)M_PI / 2);
      for (int i = 0; i < BLOCK; i++) {
        if (in_ch == 1) { out[0][i] = in[0][i] * gl; out[1][i] = in[0][i] * gr; }
        else if (pan <= 0) { out[0][i] = in[0][i] + in[1][i] * gl; out[1][i] = in[1][i] * gr; }
        else { out[0][i] = in[0][i] * gl; out[1][i] = in[1][i] + in[0][i] * gr; }
      }
      break;
    }
    case N_COMP: {
      float th = param_at(&n->p[0], t0), ratio = fmaxf(1, param_at(&n->p[2], t0));
      float att = 1 - expf(-1 / (fmaxf(param_at(&n->p[3], t0), 1e-4f) * c->rate));
      float rel = 1 - expf(-1 / (fmaxf(param_at(&n->p[4], t0), 1e-4f) * c->rate));
      // Web Audio raises the output back by the curve's loss at full scale, to the power 0.6.
      float makeup = th < 0 ? powf(10, (-th * (1 - 1 / ratio)) / 20 * 0.6f) : 1;
      for (int i = 0; i < BLOCK; i++) {
        float level = fmaxf(fabsf(in[0][i]), fabsf(in[1][i]));
        n->env += (level - n->env) * (level > n->env ? att : rel);
        float db = 20 * log10f(fmaxf(n->env, 1e-6f)), over = db - th;
        float g = (over > 0 ? powf(10, -over * (1 - 1 / ratio) / 20) : 1) * makeup;
        out[0][i] = in[0][i] * g;
        out[1][i] = in[1][i] * g;
      }
      break;
    }
    case N_DELAY: {
      float delay = fmaxf(0, param_at(&n->p[0], t0)) * c->rate;
      if (delay > n->line_len / 2 - BLOCK) delay = n->line_len / 2 - BLOCK;
      for (int i = 0; i < BLOCK; i++) {
        for (int ch = 0; ch < 2; ch++) {
          float *line = n->line + (size_t)ch * (n->line_len / 2);
          int len = n->line_len / 2;
          line[n->line_pos] = in[ch][i];
          double r = n->line_pos - delay;
          while (r < 0) r += len;
          int r0 = (int)r;
          float f = (float)(r - r0);
          out[ch][i] = line[r0] + (line[(r0 + 1) % len] - line[r0]) * f;
        }
        n->line_pos = (n->line_pos + 1) % (n->line_len / 2);
      }
      out_ch = in_ch;
      break;
    }
  }
  memcpy(n->out, out, sizeof out);
  n->out_ch = out_ch;
  if ((n->type == N_SOURCE || n->type == N_OSC) && n->ended && !n->ended_reported && !c->offline) {
    n->ended_reported = 1;
    if (nended < 256) ended_queue[nended++] = id;
  }
}

// Renders one block of a context into out (interleaved channels).
static void render_block(int ci, float *out) {
  actx *c = &ctxs[ci];
  c->stamp++;
  render(c, c->dest);
  anode *d = &nodes[c->dest];
  for (int i = 0; i < BLOCK; i++)
    for (int ch = 0; ch < c->channels; ch++) out[i * c->channels + ch] = d->out[ch < 2 ? ch : 1][i];
  c->frames += BLOCK;
  for (int k = 0; k < nnodes; k++)
    if (nodes[k].type != N_FREE && nodes[k].ctx == ci)
      for (int p = 0; p < MAX_PARAMS; p++) param_trim(&nodes[k].p[p], c->frames / (double)c->rate);
}

// ---- Output thread

#ifdef AUDIO_TEST  // no audio device on the host
static int sceKernelUsleep(unsigned us) { (void)us; return 0; }
static int sceAudioOutInit(void) { return 0; }
static int sceAudioOutOpen(int user, int type, int index, unsigned len, unsigned freq, unsigned param) { return -1; }
static int sceAudioOutOutput(int handle, const void *ptr) { return 0; }
#else
int sceKernelUsleep(unsigned);
int sceAudioOutInit(void);
int sceAudioOutOpen(int user, int type, int index, unsigned len, unsigned freq, unsigned param);
int sceAudioOutOutput(int handle, const void *ptr);
#endif

static void *output_thread(void *arg) {
  (void)arg;
  sceAudioOutInit();
  int h = sceAudioOutOpen(0xff, 0, 0, OUT_FRAMES, 48000, 1);  // main port, S16 stereo
  printf("audio out handle %d\n", h);
  fflush(stdout);
  // Without an output the clock still runs, so scheduled sounds and ramps go on.
  static int16_t silent[OUT_FRAMES * 2];
  (void)silent;
  static int16_t pcm[OUT_FRAMES * 2];
  float block[BLOCK * 2];
  for (;;) {
    for (int b = 0; b < OUT_FRAMES / BLOCK; b++) {
      pthread_mutex_lock(&lock);
      render_block(0, block);
      pthread_mutex_unlock(&lock);
      for (int i = 0; i < BLOCK * 2; i++) {
        float v = block[i];
        v = v > 1 ? 1 : v < -1 ? -1 : v;
        pcm[b * BLOCK * 2 + i] = (int16_t)(v * 32767);
      }
    }
    if (h >= 0) sceAudioOutOutput(h, pcm);
    else sceKernelUsleep(OUT_FRAMES * 1000000 / 48000);
  }
  return NULL;
}

// ---- Decoding

static int decode_wav(const uint8_t *d, size_t n) {
  if (n < 44 || memcmp(d, "RIFF", 4) || memcmp(d + 8, "WAVE", 4)) return -1;
  int fmt = 0, channels = 0, bits = 0;
  unsigned rate = 0;
  for (size_t p = 12; p + 8 <= n;) {
    uint32_t size = d[p + 4] | d[p + 5] << 8 | d[p + 6] << 16 | (uint32_t)d[p + 7] << 24;
    const uint8_t *body = d + p + 8;
    if (!memcmp(d + p, "fmt ", 4) && size >= 16) {
      fmt = body[0] | body[1] << 8;
      channels = body[2] | body[3] << 8;
      rate = body[4] | body[5] << 8 | body[6] << 16 | (uint32_t)body[7] << 24;
      bits = body[14] | body[15] << 8;
      if (fmt == 0xFFFE && size >= 26) fmt = body[24] | body[25] << 8;  // extensible
    } else if (!memcmp(d + p, "data", 4) && channels) {
      if (size > n - p - 8) size = (uint32_t)(n - p - 8);
      int bytes = bits / 8, frames = bytes && channels ? size / (bytes * channels) : 0;
      if (!frames || (fmt != 1 && fmt != 3)) return -1;
      int id = new_buffer(channels > 2 ? 2 : channels, frames, (float)rate);
      abuf *b = &bufs[id];
      for (int f = 0; f < frames; f++)
        for (int ch = 0; ch < b->channels; ch++) {
          const uint8_t *s = body + ((size_t)f * channels + ch) * bytes;
          float v;
          if (fmt == 3 && bits == 32) memcpy(&v, s, 4);
          else if (bits == 8) v = (s[0] - 128) / 128.f;
          else if (bits == 16) v = (int16_t)(s[0] | s[1] << 8) / 32768.f;
          else if (bits == 24) v = ((int32_t)((uint32_t)s[0] << 8 | (uint32_t)s[1] << 16 | (uint32_t)s[2] << 24) >> 8) / 8388608.f;
          else v = (int32_t)(s[0] | s[1] << 8 | s[2] << 16 | (uint32_t)s[3] << 24) / 2147483648.f;
          b->data[(size_t)ch * frames + f] = v;
        }
      return id;
    }
    p += 8 + size + (size & 1);
  }
  return -1;
}

static int decode_ogg(const uint8_t *d, size_t n) {
  int channels = 0, rate = 0;
  short *pcm = NULL;
  int frames = stb_vorbis_decode_memory(d, (int)n, &channels, &rate, &pcm);
  if (frames <= 0 || !pcm) return -1;
  int out_ch = channels > 2 ? 2 : channels;
  int id = new_buffer(out_ch, frames, (float)rate);
  for (int f = 0; f < frames; f++)
    for (int ch = 0; ch < out_ch; ch++) bufs[id].data[(size_t)ch * frames + f] = pcm[(size_t)f * channels + ch] / 32768.f;
  free(pcm);
  return id;
}

// ---- The API the scripts call (under the lock)

int audio_context(int offline, int channels, int length, float rate) {
  pthread_mutex_lock(&lock);
  int ci = -1;
  if (!offline && ctxs[0].used) ci = 0;
  for (int i = offline ? 1 : 0; ci < 0 && i < 64; i++)
    if (!ctxs[i].used) ci = i;
  if (ci >= 0 && !ctxs[ci].used) {
    ctxs[ci] = (actx){1, offline, offline ? (channels < 1 ? 1 : channels > 2 ? 2 : channels) : 2, -1, offline ? rate : RATE, 0, length, 0};
    ctxs[ci].dest = new_node(ci, N_DEST);
    if (!offline) {
      pthread_t t;
      pthread_attr_t attr;
      pthread_attr_init(&attr);
      pthread_attr_setstacksize(&attr, 256 << 10);
      pthread_create(&t, &attr, output_thread, NULL);
    }
  }
  pthread_mutex_unlock(&lock);
  return ci;
}

int audio_dest(int ci) { return ci >= 0 && ci < 64 ? ctxs[ci].dest : -1; }
double audio_time(int ci) { return ci >= 0 && ci < 64 && ctxs[ci].used ? ctxs[ci].frames / (double)ctxs[ci].rate : 0; }
float audio_rate(int ci) { return ci >= 0 && ci < 64 && ctxs[ci].used ? ctxs[ci].rate : RATE; }

int audio_node(int ci, int type, float extra) {
  pthread_mutex_lock(&lock);
  int id = new_node(ci, type);
  if (type == N_DELAY) {
    nodes[id].line_len = 2 * ((int)((extra > 0 ? extra : 1) * ctxs[ci].rate) + 2 * BLOCK);
    nodes[id].line = calloc(nodes[id].line_len, sizeof(float));
  }
  pthread_mutex_unlock(&lock);
  return id;
}

static int valid(int id) { return id >= 0 && id < nnodes && nodes[id].type != N_FREE; }

void audio_connect(int src, int dst, int param_index) {
  pthread_mutex_lock(&lock);
  if (valid(src) && valid(dst)) {
    anode *d = &nodes[dst];
    if (param_index >= 0 && param_index < MAX_PARAMS) {
      param *p = &d->p[param_index];
      if (p->ninputs < 4) p->inputs[p->ninputs++] = src;
    } else {
      int dup = 0;
      for (int i = 0; i < d->ninputs; i++) dup |= d->inputs[i] == src;
      if (!dup) {
        if (d->ninputs == d->capin) {
          d->capin = d->capin ? d->capin * 2 : 4;
          d->inputs = realloc(d->inputs, sizeof(int) * d->capin);
        }
        d->inputs[d->ninputs++] = src;
      }
    }
  }
  pthread_mutex_unlock(&lock);
}

void audio_disconnect(int src, int dst) {
  pthread_mutex_lock(&lock);
  for (int i = 0; i < nnodes; i++)
    if (nodes[i].type != N_FREE && (dst < 0 || i == dst)) remove_input(&nodes[i], src);
  pthread_mutex_unlock(&lock);
}

void audio_param(int id, int k, int type, float value, double time, float tau) {
  pthread_mutex_lock(&lock);
  if (valid(id) && k >= 0 && k < MAX_PARAMS) {
    param *p = &nodes[id].p[k];
    if (type == 4) {  // cancelScheduledValues(time)
      while (p->nev && p->ev[p->nev - 1].time >= time) p->nev--;
    } else if (type == 5) {  // value = x: from now on
      double now = audio_time(nodes[id].ctx);
      while (p->nev && p->ev[p->nev - 1].time >= now) p->nev--;
      if (p->nev) param_event(p, EV_SET, value, now, 0);
      else p->base = value;
    } else {
      param_event(p, type, value, time, tau);
    }
  }
  pthread_mutex_unlock(&lock);
}

float audio_param_value(int id, int k) {
  pthread_mutex_lock(&lock);
  float v = valid(id) && k >= 0 && k < MAX_PARAMS ? param_at(&nodes[id].p[k], audio_time(nodes[id].ctx)) : 0;
  pthread_mutex_unlock(&lock);
  return v;
}

void audio_set(int id, int what, double a, double b, double c2) {
  pthread_mutex_lock(&lock);
  if (valid(id)) {
    anode *n = &nodes[id];
    double now = audio_time(n->ctx);
    switch (what) {
      case 0:  // buffer
        if (n->buffer >= 0) unref_buffer(n->buffer);
        n->buffer = (int)a;
        if (n->buffer >= 0 && n->buffer < nbufs && bufs[n->buffer].data) bufs[n->buffer].refs++;
        else n->buffer = -1;
        break;
      case 1:  // start(when, offset, duration)
        if (!n->started) {
          n->started = 1;
          n->start_t = a > now ? a : now;
          n->stop_t = c2 > 0 ? n->start_t + c2 : -1;
          n->pos = n->buffer >= 0 ? b * bufs[n->buffer].rate : 0;
        }
        break;
      case 2:  // stop(when)
        if (n->started) n->stop_t = a > now ? a : now;
        break;
      case 3:  // loop, loopStart, loopEnd
        n->loop = a != 0;
        n->loop_start = b;
        n->loop_end = c2;
        break;
      case 4:  // oscillator or filter kind
        n->kind = (int)a;
        break;
      case 5:  // the script dropped its object
        n->js_alive = 0;
        collect();
        break;
    }
  }
  pthread_mutex_unlock(&lock);
}

int audio_decode(const uint8_t *data, size_t n) {
  pthread_mutex_lock(&lock);
  int id = decode_wav(data, n);
  if (id < 0) id = decode_ogg(data, n);
  pthread_mutex_unlock(&lock);
  return id;
}

int audio_buffer(int channels, int length, float rate, const float *const *data) {
  pthread_mutex_lock(&lock);
  int id = new_buffer(channels, length, rate);
  for (int ch = 0; ch < channels; ch++) memcpy(bufs[id].data + (size_t)ch * length, data[ch], sizeof(float) * length);
  pthread_mutex_unlock(&lock);
  return id;
}

// Channel count, length, rate, and channel data (not to keep) of a buffer.
const float *audio_buffer_info(int id, int ch, int *channels, int *length, float *rate) {
  if (id < 0 || id >= nbufs || !bufs[id].data) return NULL;
  *channels = bufs[id].channels;
  *length = bufs[id].length;
  *rate = bufs[id].rate;
  return bufs[id].data + (size_t)(ch < bufs[id].channels ? ch : 0) * bufs[id].length;
}

void audio_release_buffer(int id) {
  pthread_mutex_lock(&lock);
  unref_buffer(id);
  pthread_mutex_unlock(&lock);
}

// Renders an offline context to its end; returns the buffer.
int audio_render(int ci) {
  pthread_mutex_lock(&lock);
  actx *c = &ctxs[ci];
  int id = new_buffer(c->channels, (int)c->length, c->rate);
  pthread_mutex_unlock(&lock);
  float block[BLOCK * 2];
  for (long f = 0; f < c->length; f += BLOCK) {
    pthread_mutex_lock(&lock);
    render_block(ci, block);
    abuf *b = &bufs[id];
    for (int i = 0; i < BLOCK && f + i < c->length; i++)
      for (int ch = 0; ch < c->channels; ch++) b->data[(size_t)ch * b->length + f + i] = block[i * c->channels + ch];
    pthread_mutex_unlock(&lock);
  }
  // Its nodes go when the script drops them, like any other.
  pthread_mutex_lock(&lock);
  c->used = 0;
  pthread_mutex_unlock(&lock);
  return id;
}

// Sources that finished since the last call.
int audio_ended(int *out, int max) {
  pthread_mutex_lock(&lock);
  int n = nended < max ? nended : max;
  memcpy(out, ended_queue, sizeof(int) * n);
  memmove(ended_queue, ended_queue + n, sizeof(int) * (nended - n));
  nended -= n;
  collect();
  pthread_mutex_unlock(&lock);
  return n;
}

#ifdef AUDIO_TEST
// Host check: a 440 Hz oscillator through a gain ramp, rendered offline.
int main(void) {
  int c = audio_context(1, 1, 4800, 48000);
  int osc = audio_node(c, N_OSC, 0), gain = audio_node(c, N_GAIN, 0);
  audio_connect(osc, gain, -1);
  audio_connect(gain, audio_dest(c), -1);
  audio_param(gain, 0, EV_SET, 0, 0, 0);
  audio_param(gain, 0, EV_LINEAR, 1, 0.1, 0);
  audio_set(osc, 1, 0, 0, 0);
  int b = audio_render(c);
  int ch, len;
  float rate;
  const float *d = audio_buffer_info(b, 0, &ch, &len, &rate);
  float peak_early = 0, peak_late = 0;
  for (int i = 0; i < 480; i++) peak_early = fmaxf(peak_early, fabsf(d[i]));
  for (int i = 4320; i < 4800; i++) peak_late = fmaxf(peak_late, fabsf(d[i]));
  printf("frames %d, peak in the first 10 ms %.2f, in the last 10 ms %.2f\n", len, peak_early, peak_late);
  return !(peak_early < 0.15f && peak_late > 0.85f);
}
#endif

#ifndef AUDIO_TEST
// ---- __audio for runtime/audio.js
#include "quickjs.h"

static double num(JSContext *ctx, JSValueConst v) {
  double d = 0;
  JS_ToFloat64(ctx, &d, v);
  return d;
}
#define ARG(i) (i < argc ? num(ctx, argv[i]) : 0)

static JSValue a_context(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  return JS_NewInt32(ctx, audio_context((int)ARG(0), (int)ARG(1), (int)ARG(2), (float)ARG(3)));
}
static JSValue a_dest(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) { return JS_NewInt32(ctx, audio_dest((int)ARG(0))); }
static JSValue a_time(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) { return JS_NewFloat64(ctx, audio_time((int)ARG(0))); }
static JSValue a_rate(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) { return JS_NewFloat64(ctx, audio_rate((int)ARG(0))); }
static JSValue a_node(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  return JS_NewInt32(ctx, audio_node((int)ARG(0), (int)ARG(1), (float)ARG(2)));
}
static JSValue a_connect(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  audio_connect((int)ARG(0), (int)ARG(1), argc > 2 ? (int)ARG(2) : -1);
  return JS_UNDEFINED;
}
static JSValue a_disconnect(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  audio_disconnect((int)ARG(0), argc > 1 ? (int)ARG(1) : -1);
  return JS_UNDEFINED;
}
static JSValue a_param(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  audio_param((int)ARG(0), (int)ARG(1), (int)ARG(2), (float)ARG(3), ARG(4), (float)ARG(5));
  return JS_UNDEFINED;
}
static JSValue a_param_value(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  return JS_NewFloat64(ctx, audio_param_value((int)ARG(0), (int)ARG(1)));
}
static JSValue a_set(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  audio_set((int)ARG(0), (int)ARG(1), ARG(2), ARG(3), ARG(4));
  return JS_UNDEFINED;
}
// decode(ArrayBuffer | typed array) -> buffer id, -1 when not WAV or Ogg Vorbis
static JSValue a_decode(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  size_t n = 0;
  uint8_t *p = JS_GetArrayBuffer(ctx, &n, argv[0]);
  if (!p) {
    JS_FreeValue(ctx, JS_GetException(ctx));
    size_t off, len, bpe;
    JSValue ab = JS_GetTypedArrayBuffer(ctx, argv[0], &off, &len, &bpe);
    if (JS_IsException(ab)) return JS_NewInt32(ctx, -1);
    p = JS_GetArrayBuffer(ctx, &n, ab);
    JS_FreeValue(ctx, ab);
    if (!p) return JS_NewInt32(ctx, -1);
    p += off;
    n = len;
  }
  return JS_NewInt32(ctx, audio_decode(p, n));
}
// buffer(rate, channel0, channel1...) from Float32Arrays -> buffer id
static JSValue a_buffer(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  const float *chans[2] = {0};
  int channels = argc - 1 > 2 ? 2 : argc - 1, length = 0;
  for (int c = 0; c < channels; c++) {
    size_t off, len, bpe, n;
    JSValue ab = JS_GetTypedArrayBuffer(ctx, argv[1 + c], &off, &len, &bpe);
    if (JS_IsException(ab)) return JS_NewInt32(ctx, -1);
    uint8_t *p = JS_GetArrayBuffer(ctx, &n, ab);
    JS_FreeValue(ctx, ab);
    chans[c] = (const float *)(p + off);
    length = (int)(len / 4);
  }
  return channels ? JS_NewInt32(ctx, audio_buffer(channels, length, (float)ARG(0), chans)) : JS_NewInt32(ctx, -1);
}
static JSValue a_buffer_info(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int ch, len;
  float rate;
  if (!audio_buffer_info((int)ARG(0), 0, &ch, &len, &rate)) return JS_NULL;
  JSValue a = JS_NewArray(ctx);
  JS_SetPropertyUint32(ctx, a, 0, JS_NewInt32(ctx, ch));
  JS_SetPropertyUint32(ctx, a, 1, JS_NewInt32(ctx, len));
  JS_SetPropertyUint32(ctx, a, 2, JS_NewFloat64(ctx, rate));
  return a;
}
// bufferChannel(id, channel) -> a Float32Array copy
static JSValue a_buffer_channel(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int ch, len;
  float rate;
  const float *d = audio_buffer_info((int)ARG(0), (int)ARG(1), &ch, &len, &rate);
  if (!d) return JS_NULL;
  JSValue ab = JS_NewArrayBufferCopy(ctx, (const uint8_t *)d, (size_t)len * 4);
  JSValue args[1] = {ab};
  JSValue global = JS_GetGlobalObject(ctx);
  JSValue ctor = JS_GetPropertyStr(ctx, global, "Float32Array");
  JSValue arr = JS_CallConstructor(ctx, ctor, 1, args);
  JS_FreeValue(ctx, ctor);
  JS_FreeValue(ctx, global);
  JS_FreeValue(ctx, ab);
  return arr;
}
static JSValue a_release_buffer(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  audio_release_buffer((int)ARG(0));
  return JS_UNDEFINED;
}
static JSValue a_render(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) { return JS_NewInt32(ctx, audio_render((int)ARG(0))); }
static JSValue a_ended(JSContext *ctx, JSValueConst t, int argc, JSValueConst *argv) {
  int ids[256];
  int n = audio_ended(ids, 256);
  JSValue a = JS_NewArray(ctx);
  for (int i = 0; i < n; i++) JS_SetPropertyUint32(ctx, a, i, JS_NewInt32(ctx, ids[i]));
  return a;
}

void audio_register(JSContext *ctx, JSValue global) {
  JSValue o = JS_NewObject(ctx);
  const struct { const char *name; JSCFunction *fn; int n; } fns[] = {
      {"context", a_context, 4}, {"dest", a_dest, 1}, {"time", a_time, 1}, {"rate", a_rate, 1},
      {"node", a_node, 3}, {"connect", a_connect, 3}, {"disconnect", a_disconnect, 2},
      {"param", a_param, 6}, {"paramValue", a_param_value, 2}, {"set", a_set, 5},
      {"decode", a_decode, 1}, {"buffer", a_buffer, 3}, {"bufferInfo", a_buffer_info, 1},
      {"bufferChannel", a_buffer_channel, 2}, {"releaseBuffer", a_release_buffer, 1},
      {"render", a_render, 1}, {"ended", a_ended, 0},
  };
  for (size_t i = 0; i < sizeof fns / sizeof fns[0]; i++)
    JS_SetPropertyStr(ctx, o, fns[i].name, JS_NewCFunction(ctx, fns[i].fn, fns[i].name, fns[i].n));
  JS_SetPropertyStr(ctx, global, "__audio", o);
}
#endif
