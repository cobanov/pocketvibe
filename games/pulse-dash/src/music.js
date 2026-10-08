// Music and sounds, synthesized with Web Audio: no audio files.
//
// A level's track is built from one-bar layers: drums, bass, arpeggio, pad,
// a riser before each drop and a crash on it. Every distinct layer bar is
// rendered once with its own small OfflineAudioContext, a few at a time,
// and the bars are then summed into one AudioBuffer for the whole level.
// A bar that repeats costs nothing more, which keeps loading short on the
// handheld, where live synthesis would be far too heavy (see the
// launcher's audio.js). Finished tracks stay cached for the session.
//
// While a level plays, the game reads its position from the audio clock,
// so obstacles stay on the beat even when frames drop.

const RATE = 22050; // half the usual rate: half the work, and the mix is simple
const TAIL = 0.7; // seconds a layer bar may ring on into the next bar
const LEAD_IN = 0.06; // the song starts this long after play(), so nothing is cut
const PARALLEL = 4; // layer bars rendered at the same time

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);

// Summing a track takes a while on the handheld; it is done in slices with
// a pause between them, so frames (and the buttons they poll) keep coming.
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  osc.frequency.setValueAtTime(170, t);
  osc.frequency.exponentialRampToValueAtTime(50, t + 0.08);
  osc.frequency.exponentialRampToValueAtTime(38, t + 0.3);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.32);
}

function noiseHit(ctx, out, noise, t, type, freq, q, level, decay) {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  src.buffer = noise;
  src.loop = true; // long hits outlast the one-second buffer
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  env.gain.setValueAtTime(level, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + decay);
  src.connect(filter).connect(env).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + decay + 0.02);
}

function hat(ctx, out, noise, t, level, decay) {
  noiseHit(ctx, out, noise, t, 'highpass', 7200, 0.7, level, decay);
}

// A clap is a few quick noise bursts, the last one ringing out.
function clap(ctx, out, noise, t, level) {
  noiseHit(ctx, out, noise, t, 'bandpass', 1500, 0.8, level, 0.025);
  noiseHit(ctx, out, noise, t + 0.011, 'bandpass', 1500, 0.8, level, 0.025);
  noiseHit(ctx, out, noise, t + 0.022, 'bandpass', 1400, 0.8, level, 0.2);
}

function snare(ctx, out, noise, t, level) {
  noiseHit(ctx, out, noise, t, 'bandpass', 2200, 0.6, level, 0.12);
  tone(ctx, out, t, 190, 0.08, 'triangle', level * 0.8, 0.002);
}

function tone(ctx, out, t, freq, len, type, level, attack) {
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
}

// A plucky saw bass: the filter closes over each note.
function bassNote(ctx, out, t, freq, len, level) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  filter.type = 'lowpass';
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(1500, t);
  filter.frequency.exponentialRampToValueAtTime(240, t + len);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.005);
  env.gain.setValueAtTime(level, t + len * 0.7);
  env.gain.linearRampToValueAtTime(0, t + len);
  osc.connect(filter).connect(env).connect(out);
  osc.start(t);
  osc.stop(t + len + 0.01);
}

// The bass plays the chord's root between A1 and G#2 whatever the chord.
function bassRoot(chord) {
  let n = chord[0] - 24;
  while (n < 33) n += 12;
  while (n > 44) n -= 12;
  return n;
}

// ---------------------------------------------------------------- layer bars

function drumBar(ctx, out, variant, step) {
  const noise = noiseBuffer(ctx);
  for (let i = 0; i < 16; i++) {
    const t = i * step;
    if (i % 4 === 0) kick(ctx, out, t, 0.8);
    if (variant === 'kick') continue;
    if (variant === 'beat') {
      if (i % 4 === 2) hat(ctx, out, noise, t, 0.22, 0.07);
      continue;
    }
    // full and fill: sixteenth hats with an open one on each offbeat, claps on 2 and 4.
    if (i % 4 === 2) hat(ctx, out, noise, t, 0.24, 0.14);
    else hat(ctx, out, noise, t, 0.12, 0.035);
    if (variant === 'fill' && i >= 8) {
      if (i >= 12 || i % 2 === 0) snare(ctx, out, noise, t, 0.3 + (i - 8) * 0.05);
    } else if (i === 4 || i === 12) {
      clap(ctx, out, noise, t, 0.75);
    }
  }
}

function bassBar(ctx, out, style, chord, step) {
  const root = midiToHz(bassRoot(chord));
  for (let i = 0; i < 16; i++) {
    // off: offbeat eighths. roll: every sixteenth but the kick's, an octave
    // jump on the offbeat, for the drops.
    if (style === 'off' && i % 4 === 2) bassNote(ctx, out, i * step, root, step * 1.8, 0.26);
    if (style === 'roll' && i % 4 !== 0) bassNote(ctx, out, i * step, i % 4 === 2 ? root * 2 : root, step * 0.85, 0.22);
  }
}

function arpBar(ctx, out, pattern, chord, step, level) {
  // A dotted-eighth echo makes the arpeggio shimmer for almost no cost.
  const echo = ctx.createDelay(1);
  const feedback = ctx.createGain();
  const wet = ctx.createGain();
  echo.delayTime.value = step * 3;
  feedback.gain.value = 0.32;
  wet.gain.value = 0.45;
  echo.connect(feedback).connect(echo);
  echo.connect(wet).connect(out);
  const dry = ctx.createGain();
  dry.connect(out);
  dry.connect(echo);
  for (let i = 0; i < 16; i++) {
    const k = pattern[i];
    if (k < 0) continue;
    const note = chord[k % 3] + 12 * Math.floor(k / 3) + 12;
    tone(ctx, dry, i * step, midiToHz(note), step * 1.5, 'square', level, 0.004);
  }
}

function padBar(ctx, out, chord, barSec) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1500;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, 0);
  env.gain.linearRampToValueAtTime(1, 0.25);
  env.gain.setValueAtTime(1, barSec - 0.05);
  env.gain.linearRampToValueAtTime(0, barSec + TAIL - 0.1);
  filter.connect(env).connect(out);
  for (const note of chord) {
    for (const detune of [-9, 9]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiToHz(note);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.03;
      osc.connect(g).connect(filter);
      osc.start(0);
      osc.stop(barSec + TAIL);
    }
  }
}

// Noise sweeping up over two bars before a drop.
function riser(ctx, out, seconds) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 2.5;
  filter.frequency.setValueAtTime(300, 0);
  filter.frequency.exponentialRampToValueAtTime(6000, seconds);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.001, 0);
  env.gain.exponentialRampToValueAtTime(0.32, seconds - 0.02);
  env.gain.linearRampToValueAtTime(0, seconds);
  src.connect(filter).connect(env).connect(out);
  src.start(0);
  src.stop(seconds);
}

function crash(ctx, out) {
  noiseHit(ctx, out, noiseBuffer(ctx), 0, 'highpass', 3800, 0.5, 0.26, 1.5);
}

// Renders one layer bar; resolves to its samples.
function renderLayer(key, music, barSec) {
  const [kind, a, b] = key.split(':');
  const seconds = (kind === 'r' ? barSec * 2 : barSec) + TAIL;
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  const out = ctx.destination;
  const step = barSec / 16;
  if (kind === 'd') drumBar(ctx, out, a, step);
  else if (kind === 'b') bassBar(ctx, out, a, music.chords[Number(b)], step);
  else if (kind === 'a') arpBar(ctx, out, music.arp, music.chords[Number(a)], step, music.lead);
  else if (kind === 'p') padBar(ctx, out, music.chords[Number(a)], barSec);
  else if (kind === 'r') riser(ctx, out, barSec * 2);
  else if (kind === 'c') crash(ctx, out);
  return ctx.startRendering().then((buffer) => buffer.getChannelData(0));
}

// The layer bars that play in bar `index` of a level.
function layersOf(L, index) {
  const info = L.barInfo[index];
  const chord = index % 4;
  const keys = [];
  if (info.drums !== 'none') keys.push(`d:${info.fill ? 'fill' : info.drums}`);
  if (info.bass) keys.push(`b:${info.bass}:${chord}`);
  if (info.arp) keys.push(`a:${chord}`);
  if (info.pad) keys.push(`p:${chord}`);
  if (info.riser) keys.push('r');
  if (info.crash) keys.push('c');
  return keys;
}

async function renderSong(L) {
  const barSec = 240 / L.bpm;
  const bars = [];
  const needed = new Set();
  for (let i = 0; i < L.bars; i++) {
    const keys = layersOf(L, i);
    bars.push(keys);
    for (const k of keys) needed.add(k);
  }

  const queue = [...needed];
  const rendered = new Map();
  const worker = async () => {
    while (queue.length > 0) {
      const key = queue.pop();
      rendered.set(key, await renderLayer(key, L.def.music, barSec));
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  // Drums go straight into the mix; the rest goes through a bus that ducks
  // under every kick, the pumping sound of this kind of music.
  const length = Math.ceil((L.bars * barSec + TAIL + 0.5) * RATE);
  const mix = new Float32Array(length);
  const bus = new Float32Array(length);
  for (let i = 0; i < L.bars; i++) {
    const start = Math.round(i * barSec * RATE);
    for (const key of bars[i]) {
      const data = rendered.get(key);
      const target = key[0] === 'd' || key[0] === 'c' ? mix : bus;
      const n = Math.min(data.length, length - start);
      for (let j = 0; j < n; j++) target[start + j] += data[j];
    }
    if (i % 2 === 1) await breathe();
  }
  const beatSamples = (barSec / 4) * RATE;
  const duck = new Float32Array(Math.ceil(beatSamples) + 1);
  for (let j = 0; j < duck.length; j++) duck[j] = 1 - 0.55 * Math.exp((-j / beatSamples) * 7);
  let peak = 0;
  for (let beat = 0; ; beat++) {
    const from = Math.round(beat * beatSamples);
    if (from >= length) break;
    const to = Math.min(length, Math.round((beat + 1) * beatSamples));
    const bar = beat >> 2;
    const ducked = bar < L.bars && L.kick[bar] === 1;
    for (let j = from; j < to; j++) {
      const v = mix[j] + (ducked ? bus[j] * duck[j - from] : bus[j]);
      mix[j] = v;
      if (v > peak) peak = v;
      else if (-v > peak) peak = -v;
    }
    if (beat % 16 === 15) await breathe();
  }
  const gain = peak > 0 ? Math.min(2, 0.9 / peak) : 1;
  const slice = Math.ceil(length / 8);
  for (let from = 0; from < length; from += slice) {
    const to = Math.min(length, from + slice);
    for (let j = from; j < to; j++) mix[j] *= gain;
    await breathe();
  }

  const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: RATE });
  buffer.copyToChannel(mix, 0);
  return buffer;
}

// ---------------------------------------------------------------- sounds

function renderSound(seconds, build) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  build(ctx, ctx.destination);
  return ctx.startRendering();
}

const SOUNDS = {
  // The crash when the cube dies: a thud, a falling zap and a burst of noise.
  crash: () =>
    renderSound(0.7, (ctx, out) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.setValueAtTime(140, 0);
      osc.frequency.exponentialRampToValueAtTime(32, 0.3);
      env.gain.setValueAtTime(0.9, 0);
      env.gain.exponentialRampToValueAtTime(0.001, 0.35);
      osc.connect(env).connect(out);
      osc.start(0);
      osc.stop(0.36);
      const zap = ctx.createOscillator();
      const zenv = ctx.createGain();
      zap.type = 'square';
      zap.frequency.setValueAtTime(700, 0);
      zap.frequency.exponentialRampToValueAtTime(60, 0.28);
      zenv.gain.setValueAtTime(0.16, 0);
      zenv.gain.exponentialRampToValueAtTime(0.001, 0.3);
      zap.connect(zenv).connect(out);
      zap.start(0);
      zap.stop(0.31);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(6000, 0);
      filter.frequency.exponentialRampToValueAtTime(200, 0.6);
      const nenv = ctx.createGain();
      nenv.gain.setValueAtTime(0.7, 0);
      nenv.gain.exponentialRampToValueAtTime(0.001, 0.65);
      src.connect(filter).connect(nenv).connect(out);
      src.start(0);
      src.stop(0.66);
    }),
  // Level complete: a rising major arpeggio.
  complete: () =>
    renderSound(1.4, (ctx, out) => {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ctx, out, i * 0.08, f, i === 4 ? 0.9 : 0.25, 'triangle', 0.4, 0.004));
    }),
  // Moving between levels on the title screen.
  tick: () => renderSound(0.08, (ctx, out) => tone(ctx, out, 0, 880, 0.06, 'square', 0.12, 0.002)),
};

// ---------------------------------------------------------------- player

export function createAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  const canRender = typeof OfflineAudioContext !== 'undefined';
  let ctx = null;
  let musicGain = null;
  let sfxGain = null;
  let source = null;
  let wanted = true; // false while paused: nothing may resume the context then
  let audioClock = false; // the current song is timed by the audio clock
  let startAt = 0; // context time of song time 0
  let latency = 0;
  let lastRaw = 0; // the audio clock as last read, in song time
  let lastWall = 0; // when it last changed (ms)
  let songTime = 0;
  const songs = []; // per level: { buffer } once rendered (buffer null if it failed)
  const sounds = {};

  if (canRender) {
    for (const name of Object.keys(SOUNDS)) {
      SOUNDS[name]()
        .then((buffer) => (sounds[name] = buffer))
        .catch(() => {});
    }
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
      musicGain.gain.value = 0.8;
      musicGain.connect(output);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.7;
      sfxGain.connect(output);
    }
    if (wanted && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }

  // Desktop browsers only start audio once the page has had a key press, so
  // the context is resumed on the A press that starts a level (see unlock()).
  // The handheld app's browser allows audio without one.

  return {
    // Called on the A press that starts a level.
    unlock() {
      wanted = true;
      ensure();
    },

    // True once the context is producing sound.
    get live() {
      return !!ctx && ctx.state === 'running';
    },

    // Starts rendering a level's track if it is not cached yet.
    prepare(index, L) {
      if (songs[index]) return;
      const entry = { buffer: undefined };
      songs[index] = entry;
      if (!canRender) {
        entry.buffer = null;
        return;
      }
      renderSong(L)
        .then((buffer) => (entry.buffer = buffer))
        .catch(() => (entry.buffer = null));
    },

    // True when the level can start: rendered, or rendering failed (then it
    // plays silently on the frame clock).
    ready(index) {
      return !!songs[index] && songs[index].buffer !== undefined;
    },

    // Starts a level's track from the top; song time 0 is LEAD_IN from now.
    play(index) {
      this.stop(0);
      const buffer = songs[index]?.buffer;
      audioClock = !!buffer && this.live;
      songTime = -LEAD_IN;
      lastRaw = songTime;
      lastWall = performance.now();
      if (!audioClock) return;
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(musicGain);
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setValueAtTime(0.8, ctx.currentTime);
      startAt = ctx.currentTime + LEAD_IN;
      source.start(startAt);
      // What the speaker plays lags the context clock; the picture follows the sound.
      latency = Math.min(0.3, Math.max(0, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)));
    },

    // Stops the music, fading over `fade` seconds (at once while paused,
    // so nothing is left to play when the context resumes).
    stop(fade) {
      if (!source) return;
      if (ctx.state !== 'running') fade = 0;
      const now = ctx.currentTime;
      musicGain.gain.cancelScheduledValues(now);
      musicGain.gain.setValueAtTime(musicGain.gain.value, now);
      musicGain.gain.linearRampToValueAtTime(0, now + fade + 0.01);
      try {
        source.stop(now + fade + 0.02);
      } catch {
        // Already stopped.
      }
      source = null;
    },

    pause() {
      wanted = false;
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    },

    // Resumes after a pause, or after quitting to the title from one.
    resume() {
      wanted = true;
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      // Re-anchor the clock, so the pause itself is not counted.
      if (audioClock) lastRaw = ctx.currentTime - startAt - latency;
      lastWall = performance.now();
    },

    // Song time in seconds. From the audio clock while the music plays (the
    // clock moves in steps, so it is extrapolated between them and never
    // runs backwards); from the frame time when there is no sound.
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

    sound(name) {
      const buffer = sounds[name];
      if (!buffer || !ctx || ctx.state !== 'running') return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(sfxGain);
      src.start();
    },
  };
}
