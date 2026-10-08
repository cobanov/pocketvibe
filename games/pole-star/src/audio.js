// Music and sounds, synthesized with Web Audio: no audio files.
//
// The music is a four-bar disco loop in three layers (groove, string stabs,
// lead), each rendered once at load with an OfflineAudioContext and then
// looped. All three play from the same moment, so they stay locked
// together, and the lead joins when the club gets lively. The game reads
// the beat from the audio clock, so the dancer moves to what you hear.

import { BPM } from './shared.js';

const RATE = 22050; // half the usual rate: half the work, and the mix is simple
const BEAT_SEC = 60 / BPM;
const BAR_SEC = BEAT_SEC * 4;
const LOOP_BARS = 4;
const LOOP_SEC = BAR_SEC * LOOP_BARS;
const TAIL = 0.8; // what rings past the loop's end is folded back onto its start
const LEAD_IN = 0.08; // the music starts this long after play(), so nothing is cut

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);

// Am7, D7, Fmaj7, E7: close voicings that barely move from chord to chord.
const CHORDS = [
  [57, 60, 64, 67],
  [57, 60, 62, 66],
  [57, 60, 64, 65],
  [56, 59, 62, 64],
];
const ROOTS = [33, 38, 41, 40]; // A1, D2, F2, E2
const LEAD = [
  [76, -1, -1, 74, 76, -1, 79, -1, 76, -1, 74, -1, 72, -1, 69, -1],
  [74, -1, -1, 72, 74, -1, 78, -1, 81, -1, 78, -1, 74, -1, -1, -1],
  [72, -1, 76, -1, 77, -1, 76, -1, 72, -1, 69, -1, 72, -1, -1, -1],
  [76, -1, -1, 80, 83, -1, 80, -1, 76, -1, 74, -1, 71, -1, 68, -1],
];

// One second of white noise, shared by every render.
let noiseData = null;
function noiseBuffer(ctx) {
  if (!noiseData) {
    noiseData = new Float32Array(RATE);
    for (let i = 0; i < RATE; i++) noiseData[i] = Math.random() * 2 - 1;
  }
  const buffer = ctx.createBuffer(1, RATE, RATE);
  buffer.copyToChannel(noiseData, 0);
  return buffer;
}

// ---------------------------------------------------------------- voices

function kick(ctx, out, t, level) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.setValueAtTime(160, t);
  osc.frequency.exponentialRampToValueAtTime(52, t + 0.07);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.28);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.3);
}

function noiseHit(ctx, out, noise, t, type, freq, q, level, decay) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  src.buffer = noise;
  src.loop = true;
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  env.gain.setValueAtTime(level, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(filter).connect(env).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.02);
}

function clap(ctx, out, noise, t, level) {
  noiseHit(ctx, out, noise, t, 'bandpass', 1300, 0.9, level, 0.02);
  noiseHit(ctx, out, noise, t + 0.01, 'bandpass', 1300, 0.9, level, 0.02);
  noiseHit(ctx, out, noise, t + 0.021, 'bandpass', 1200, 0.9, level, 0.17);
}

function tone(ctx, out, t, freq, len, type, level, attack = 0.004) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + attack);
  env.gain.exponentialRampToValueAtTime(0.001, t + len);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + len + 0.01);
  return osc;
}

// A plucky bass note: a saw whose filter closes over the note.
function bassNote(ctx, out, t, freq, len, level) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(1300, t);
  filter.frequency.exponentialRampToValueAtTime(220, t + len);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.004);
  env.gain.setValueAtTime(level, t + len * 0.6);
  env.gain.linearRampToValueAtTime(0, t + len);
  osc.connect(filter).connect(env).connect(out);
  osc.start(t);
  osc.stop(t + len + 0.01);
}

// A string stab: detuned saws through a filter that snaps shut.
function stab(ctx, out, t, chord, len, level) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(3200, t);
  filter.frequency.exponentialRampToValueAtTime(700, t + len);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, t + len);
  filter.connect(env).connect(out);
  for (const note of chord) {
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(note + 12);
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + len + 0.02);
    }
  }
}

// ---------------------------------------------------------------- layers

function groove(ctx, out, step) {
  const noise = noiseBuffer(ctx);
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const root = midiToHz(ROOTS[bar]);
    for (let i = 0; i < 16; i++) {
      const t = (bar * 16 + i) * step;
      if (i % 4 === 0) kick(ctx, out, t, 0.85);
      if (i === 4 || i === 12) clap(ctx, out, noise, t, 0.6);
      // Open hat on every offbeat, quiet closed ones between.
      if (i % 4 === 2) noiseHit(ctx, out, noise, t, 'highpass', 7000, 0.7, 0.2, 0.16);
      else noiseHit(ctx, out, noise, t, 'highpass', 8000, 0.7, 0.07, 0.03);
      // Disco octave bass: root, octave, root, octave on the eighths.
      if (i % 2 === 0) bassNote(ctx, out, t, i % 4 === 0 ? root : root * 2, step * 1.7, 0.3);
    }
  }
}

function stabs(ctx, out, step) {
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const chord = CHORDS[bar];
    for (const [i, len, level] of [[3, 0.18, 0.05], [6, 0.32, 0.075], [11, 0.18, 0.05], [14, 0.32, 0.075]]) {
      stab(ctx, out, (bar * 16 + i) * step, chord, len, level);
    }
  }
}

function lead(ctx, out, step) {
  // A dotted-eighth echo makes the lead shimmer for almost no cost.
  const echo = ctx.createDelay(1);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  echo.delayTime.value = step * 3;
  feedback.gain.value = 0.3;
  wet.gain.value = 0.4;
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(out);
  const dry = ctx.createGain();
  dry.connect(out);
  dry.connect(echo);
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    LEAD[bar].forEach((note, i) => {
      if (note < 0) return;
      const t = (bar * 16 + i) * step;
      tone(ctx, dry, t, midiToHz(note), step * 1.8, 'square', 0.07);
      tone(ctx, dry, t, midiToHz(note + 12), step * 1.2, 'triangle', 0.05);
    });
  }
}

// Renders a layer and folds its tail back onto the start, for a seamless loop.
async function renderLayer(build) {
  const ctx = new OfflineAudioContext(1, Math.ceil((LOOP_SEC + TAIL) * RATE), RATE);
  build(ctx, ctx.destination, BAR_SEC / 16);
  const rendered = await ctx.startRendering();
  const data = rendered.getChannelData(0);
  const length = Math.round(LOOP_SEC * RATE);
  const loop = new Float32Array(length);
  loop.set(data.subarray(0, length));
  for (let j = length; j < data.length; j++) loop[j - length] += data[j];
  const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: RATE });
  buffer.copyToChannel(loop, 0);
  return buffer;
}

// ---------------------------------------------------------------- sounds

function renderSound(seconds, build) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  build(ctx, ctx.destination);
  return ctx.startRendering();
}

// Applause and cheering, written sample by sample: hundreds of claps would
// be hundreds of nodes.
function crowdSound(seconds, claps, roar) {
  const n = Math.ceil(seconds * RATE);
  const data = new Float32Array(n);
  for (let k = 0; k < claps; k++) {
    // Claps thin out towards the end.
    const at = Math.floor(Math.pow(Math.random(), 1.6) * (n - 400));
    const level = 0.15 + Math.random() * 0.25;
    let lp = 0;
    for (let j = 0; j < 300; j++) {
      const white = Math.random() * 2 - 1;
      lp += (white - lp) * 0.55; // a little duller than white noise
      data[at + j] += (white - lp) * level * Math.exp(-j / 45);
    }
  }
  let lp = 0;
  for (let j = 0; j < n; j++) {
    lp += (Math.random() * 2 - 1 - lp) * 0.08;
    const env = Math.min(1, j / (0.15 * RATE)) * Math.exp((-j / n) * 2.2);
    data[j] += lp * roar * env;
  }
  let peak = 0;
  for (let j = 0; j < n; j++) peak = Math.max(peak, Math.abs(data[j]));
  const gain = peak > 0 ? 0.8 / peak : 1;
  for (let j = 0; j < n; j++) data[j] *= gain;
  const buffer = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: RATE });
  buffer.copyToChannel(data, 0);
  return Promise.resolve(buffer);
}

const SOUNDS = {
  // The flick of a bill leaving your hand.
  toss: () =>
    renderSound(0.16, (ctx, out) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.5;
      filter.frequency.setValueAtTime(3000, 0);
      filter.frequency.exponentialRampToValueAtTime(900, 0.13);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, 0);
      env.gain.linearRampToValueAtTime(0.45, 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, 0.15);
      src.connect(filter).connect(env).connect(out);
      src.start(0);
      src.stop(0.16);
    }),
  // A tip: ka-ching.
  ching: () =>
    renderSound(0.6, (ctx, out) => {
      noiseHit(ctx, out, noiseBuffer(ctx), 0, 'highpass', 3000, 0.8, 0.35, 0.03);
      tone(ctx, out, 0.05, 2093, 0.5, 'sine', 0.22, 0.002);
      tone(ctx, out, 0.05, 2637, 0.45, 'sine', 0.18, 0.002);
      tone(ctx, out, 0.05, 4186, 0.2, 'sine', 0.06, 0.002);
    }),
  cheer: () => crowdSound(1.4, 110, 0.5),
  applause: () => crowdSound(3.6, 520, 0.7),
};

// ---------------------------------------------------------------- player

export function createAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  const canRender = typeof OfflineAudioContext !== 'undefined';
  let ctx = null;
  let musicGain = null;
  let sfxGain = null;
  let layerGains = [];
  let sources = [];
  let wanted = true; // false while paused: nothing may resume the context then
  let audioClock = false; // the music playing now is timed by the audio clock
  let startAt = 0; // context time of beat 0
  let latency = 0;
  let lastRaw = 0;
  let lastWall = 0;
  let songTime = 0;
  let layers = null; // [groove, stabs, lead] once rendered; [] if that failed
  let leadOn = false;
  const sounds = {};

  if (canRender) {
    for (const name of Object.keys(SOUNDS)) {
      SOUNDS[name]()
        .then((buffer) => (sounds[name] = buffer))
        .catch(() => {});
    }
    Promise.all([renderLayer(groove), renderLayer(stabs), renderLayer(lead)])
      .then((buffers) => {
        layers = buffers;
        ensure();
      })
      .catch(() => (layers = []));
  } else {
    layers = [];
  }

  function ensure() {
    if (!Context) return false;
    if (!ctx) {
      ctx = new Context();
      // Music and sounds meet in a compressor, so together they never clip.
      const output = ctx.createDynamicsCompressor();
      output.threshold.value = -14;
      output.ratio.value = 4;
      output.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.75;
      musicGain.connect(output);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.8;
      sfxGain.connect(output);
      layerGains = [1, 0.9, 0].map((v) => {
        const g = ctx.createGain();
        g.gain.value = v;
        g.connect(musicGain);
        return g;
      });
    }
    if (wanted && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }

  // The live context is made once the music is rendered (a running one
  // slowed the rendering down badly in Chrome), or on the first press.
  // Desktop browsers start audio only after a key press, so the context is
  // also resumed on presses (see unlock()); the handheld allows it at once.

  return {
    // Called on button presses: lets desktop browsers start the sound.
    unlock() {
      wanted = true;
      ensure();
    },

    get live() {
      return !!ctx && ctx.state === 'running';
    },

    // True once the music is rendered (or failed: then the beat runs on the
    // frame clock, silently).
    get ready() {
      return layers !== null;
    },

    // Starts the loop from the top; beat 0 is LEAD_IN from now.
    play() {
      this.stop(0);
      songTime = -LEAD_IN;
      lastRaw = songTime;
      lastWall = performance.now();
      audioClock = !!layers && layers.length === 3 && this.live;
      if (!audioClock) return;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setValueAtTime(0.75, ctx.currentTime);
      startAt = ctx.currentTime + LEAD_IN;
      leadOn = false;
      layerGains[2].gain.cancelScheduledValues(ctx.currentTime);
      layerGains[2].gain.setValueAtTime(0, ctx.currentTime);
      sources = layers.map((buffer, i) => {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(layerGains[i]);
        src.start(startAt);
        return src;
      });
      latency = Math.min(0.3, Math.max(0, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)));
    },

    // How lively the club is, 0 to 1: the lead plays from 0.6 on.
    intensity(k) {
      const lead = k >= 0.6;
      if (!ctx || !sources.length || lead === leadOn) return;
      leadOn = lead;
      layerGains[2].gain.setTargetAtTime(lead ? 0.8 : 0, ctx.currentTime, 0.4);
    },

    stop(fade) {
      if (!sources.length) return;
      if (ctx.state !== 'running') fade = 0;
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0, now + fade + 0.01);
      for (const src of sources) {
        try {
          src.stop(now + fade + 0.02);
        } catch {
          // Already stopped.
        }
      }
      sources = [];
      audioClock = false;
    },

    pause() {
      wanted = false;
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },

    resume() {
      wanted = true;
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (audioClock) lastRaw = ctx.currentTime - startAt - latency;
      lastWall = performance.now();
    },

    // Seconds since beat 0. From the audio clock while the music plays (it
    // moves in steps, so it is extrapolated between them and never runs
    // backwards); from the frame time when there is no sound.
    time(dt) {
      if (!audioClock) {
        songTime += dt;
        return songTime;
      }
      const raw = ctx.currentTime - startAt - latency;
      const now = performance.now();
      if (raw !== lastRaw) {
        lastRaw = raw;
        lastWall = now;
      }
      const t = lastRaw + (now - lastWall) / 1000;
      if (t > songTime) songTime = t;
      return songTime;
    },

    sound(name, level = 1) {
      const buffer = sounds[name];
      if (!buffer || !ctx || ctx.state !== 'running') return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      if (level === 1) src.connect(sfxGain);
      else {
        const g = ctx.createGain();
        g.gain.value = level;
        src.connect(g).connect(sfxGain);
      }
      src.start();
    },
  };
}
