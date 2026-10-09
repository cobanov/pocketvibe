// Music and sounds, synthesized with Web Audio: no audio files.
//
// The music is a four-bar disco loop in three layers (groove, string stabs,
// lead), each rendered once at load with an OfflineAudioContext and then
// looped. All three play from the same moment, so they stay locked
// together, and the lead joins when the club gets lively. The game reads
// the beat from the audio clock, so the dancer moves to what you hear.
// Until sound may play (or if it never may) the beat runs on the wall
// clock, and the music then comes in on the next bar line, at the place in
// the loop where the dance is: she never jumps.
//
// The browser only starts audio after a key press, and the handheld's
// gamepad buttons do not count. Inside PocketVibe the game asks the app for
// one (POST /__pocketvibe__/unlock-audio taps a virtual key, which arrives
// here as a real key press); in a desktop browser the first key does it.
// The same as tools/sfx/sound.js, which the other games use.
//
// The player's choices (sound effects and music on or off) are saved with
// hh.save, under the same keys as in the other games.

import { BPM } from './shared.js';

const RATE = 22050; // half the usual rate: half the work, and the mix is simple
const BEAT_SEC = 60 / BPM;
const BAR_SEC = BEAT_SEC * 4;
const LOOP_BARS = 4;
const LOOP_SEC = BAR_SEC * LOOP_BARS;
const TAIL = 0.8; // what rings past the loop's end is folded back onto its start
const LEAD_IN = 0.08; // the music starts at least this long after it is asked to
const MUSIC_VOLUME = 0.7;
const DUCKED = 0.35; // of the music's volume, under the pause menu
const SFX_VOLUME = 0.85;
const MIN_GAP = 0.03; // s: the same sound does not start twice within this
const MAX_STEP = 0.25; // s: the wall clock never jumps further than this
const UNLOCK_URL = '/__pocketvibe__/unlock-audio';

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);

// Am7, D7, Fmaj7, E7: close voicings that barely move from chord to chord.
const CHORDS = [
  [57, 60, 64, 67],
  [57, 60, 62, 66],
  [57, 60, 64, 65],
  [56, 59, 62, 64],
];
// A2, D3, F3, E3: an octave above a club bass, where a small speaker can
// still play it.
const ROOTS = [45, 50, 53, 52];
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

// A kick with a click on top: the click is what a small speaker plays.
function kick(ctx, out, noise, t, level) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.setValueAtTime(190, t);
  osc.frequency.exponentialRampToValueAtTime(62, t + 0.06);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.22);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.003);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.24);
  noiseHit(ctx, out, noise, t, 'bandpass', 2400, 1.2, level * 0.5, 0.014);
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
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(320, t + len);
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
      if (i % 4 === 0) kick(ctx, out, noise, t, 0.62);
      if (i === 4 || i === 12) clap(ctx, out, noise, t, 0.55);
      // Open hat on every offbeat, quiet closed ones between.
      if (i % 4 === 2) noiseHit(ctx, out, noise, t, 'bandpass', 7000, 0.9, 0.17, 0.14);
      else noiseHit(ctx, out, noise, t, 'bandpass', 7500, 0.9, 0.06, 0.03);
      // Disco octave bass: root, octave, root, octave on the eighths.
      if (i % 2 === 0) bassNote(ctx, out, t, i % 4 === 0 ? root : root * 2, step * 1.7, 0.2);
    }
  }
}

function stabs(ctx, out, step) {
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const chord = CHORDS[bar];
    for (const [i, len, level] of [[3, 0.18, 0.09], [6, 0.32, 0.13], [11, 0.18, 0.09], [14, 0.32, 0.13]]) {
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
      tone(ctx, dry, t, midiToHz(note), step * 1.8, 'square', 0.12);
      tone(ctx, dry, t, midiToHz(note + 12), step * 1.2, 'triangle', 0.08);
    });
  }
}

// Renders a layer and folds its tail back onto the start, for a seamless
// loop. A high-pass takes out the rumble a handheld's speaker cannot play
// anyway, which would only push the rest down in the compressor.
async function renderLayer(build) {
  const ctx = new OfflineAudioContext(1, Math.ceil((LOOP_SEC + TAIL) * RATE), RATE);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 90;
  highpass.Q.value = 0.7;
  highpass.connect(ctx.destination);
  build(ctx, highpass, BAR_SEC / 16);
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
// be hundreds of nodes. Claps are noise between about 600 Hz and 4 kHz, the
// roar of voices between 300 Hz and 2 kHz: nothing a small speaker loses.
function crowdSound(seconds, claps, roar, peakLevel) {
  const n = Math.ceil(seconds * RATE);
  const data = new Float32Array(n);
  for (let k = 0; k < claps; k++) {
    // Claps thin out towards the end.
    const at = Math.floor(Math.pow(Math.random(), 1.6) * (n - 400));
    const level = 0.15 + Math.random() * 0.25;
    let hi = 0;
    let hi2 = 0;
    let lo = 0;
    for (let j = 0; j < 300; j++) {
      const white = Math.random() * 2 - 1;
      hi += (white - hi) * 0.68;
      hi2 += (hi - hi2) * 0.68;
      lo += (white - lo) * 0.16;
      data[at + j] += (hi2 - lo) * level * Math.exp(-j / 45);
    }
  }
  let hi = 0;
  let lo = 0;
  for (let j = 0; j < n; j++) {
    const white = Math.random() * 2 - 1;
    hi += (white - hi) * 0.43;
    lo += (white - lo) * 0.082;
    const env = Math.min(1, j / (0.15 * RATE)) * Math.exp((-j / n) * 2.2);
    data[j] += (hi - lo) * roar * env;
  }
  // A short fade at the end, so it never stops with a click.
  const fade = Math.floor(0.05 * RATE);
  for (let j = 0; j < fade; j++) data[n - 1 - j] *= j / fade;
  let peak = 0;
  for (let j = 0; j < n; j++) peak = Math.max(peak, Math.abs(data[j]));
  const gain = peak > 0 ? peakLevel / peak : 1;
  for (let j = 0; j < n; j++) data[j] *= gain;
  const buffer = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: RATE });
  buffer.copyToChannel(data, 0);
  return Promise.resolve(buffer);
}

// A menu blip: one or two soft notes in A minor, like the music.
function blip(notes, level) {
  return renderSound(0.05 + notes.length * 0.07, (ctx, out) => {
    notes.forEach((note, i) => {
      tone(ctx, out, i * 0.06, midiToHz(note), 0.11, 'triangle', level, 0.003);
      tone(ctx, out, i * 0.06, midiToHz(note + 12), 0.05, 'sine', level * 0.3, 0.002);
    });
  });
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
  // A tip: ka-ching, a C major bell over the A minor loop (C and E are in
  // both).
  ching: () =>
    renderSound(0.5, (ctx, out) => {
      noiseHit(ctx, out, noiseBuffer(ctx), 0, 'bandpass', 4500, 0.9, 0.3, 0.025);
      tone(ctx, out, 0.04, 2093, 0.42, 'sine', 0.3, 0.002);
      tone(ctx, out, 0.04, 2637, 0.36, 'sine', 0.24, 0.002);
      tone(ctx, out, 0.04, 1046.5, 0.3, 'triangle', 0.12, 0.002);
    }),
  cheer: () => crowdSound(1.4, 110, 0.5, 0.8),
  applause: () => crowdSound(3.2, 480, 0.6, 0.8),
  move: () => blip([88], 0.22),
  select: () => blip([81, 88], 0.3),
  back: () => blip([88, 81], 0.26),
  pause: () => blip([84, 76], 0.3),
};

// ---------------------------------------------------------------- player

export function createAudio(hh) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const canRender = typeof OfflineAudioContext !== 'undefined';
  const settings = { sfx: hh.load('sound.sfx', true), music: hh.load('sound.music', true) };
  const sounds = {};
  const lastStart = {};
  let ctx = null;
  let musicGain = null;
  let sfxGain = null;
  let layerGains = [];
  let sources = [];
  let layers = null; // [groove, stabs, lead] once rendered; [] if that failed
  let leadOn = false;
  let ducked = false;
  let hidden = false;
  // The song's clock, in seconds since beat 0.
  let songTime = 0;
  let audioClock = false; // the music is playing and keeps the time
  let startAt = 0; // context time at which song time 0 is rendered
  let latency = 0;
  let lastRaw = 0; // the audio clock moves in steps; when it last moved
  let lastRawWall = 0;
  let wallAt = -1; // the wall clock's last reading, while there is no music

  if (canRender) {
    for (const name of Object.keys(SOUNDS)) {
      SOUNDS[name]()
        .then((buffer) => (sounds[name] = buffer))
        .catch(() => {});
    }
    Promise.all([renderLayer(groove), renderLayer(stabs), renderLayer(lead)])
      .then((buffers) => (layers = buffers))
      .catch(() => (layers = []));
  } else {
    layers = [];
  }

  if (Context) {
    try {
      ctx = new Context({ latencyHint: 'interactive' });
    } catch {
      ctx = null;
    }
  }
  if (ctx) {
    // Music and sounds meet in a compressor, so together they never clip.
    const output = ctx.createDynamicsCompressor();
    output.threshold.value = -10;
    output.knee.value = 8;
    output.ratio.value = 4;
    output.attack.value = 0.003;
    output.release.value = 0.2;
    output.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(output);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = settings.sfx ? SFX_VOLUME : 0;
    sfxGain.connect(output);
    layerGains = [1, 1, 0].map((v) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(musicGain);
      return g;
    });
    listenForUnlock();
  }

  function resume() {
    if (!ctx || hidden || ctx.state !== 'suspended') return;
    ctx.resume().catch(() => {});
  }

  function listenForUnlock() {
    // Any real key press or touch lets the page start audio. The handler
    // must call resume() while the browser is handling the press.
    const onPress = (e) => {
      if (e.isTrusted) resume();
    };
    addEventListener('keydown', onPress, true);
    addEventListener('pointerdown', onPress, true);
    document.addEventListener('visibilitychange', () => {
      hidden = document.hidden;
      if (hidden && ctx.state === 'running') ctx.suspend().catch(() => {});
      else if (!hidden) resume();
    });
    resume();
    // Inside PocketVibe: ask for the key press. A few tries, as the app's
    // virtual keyboard can take a moment to appear.
    if (!new URLSearchParams(location.search).has('handheld')) return;
    (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 300 : 1500));
        if (ctx.state !== 'suspended') return;
        try {
          const res = await fetch(UNLOCK_URL, { method: 'POST' });
          if (!res.ok) return; // an app without it (Android plays without a key press)
        } catch {
          return;
        }
      }
    })();
  }

  function musicLevel() {
    return settings.music ? MUSIC_VOLUME * (ducked ? DUCKED : 1) : 0;
  }

  // Glides the music to its level: from `from` at context time `at` if given.
  function fadeMusic(seconds, at = ctx.currentTime, from = null) {
    const g = musicGain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (from !== null) g.linearRampToValueAtTime(from, at);
    g.linearRampToValueAtTime(musicLevel(), at + seconds);
  }

  // Starts the layers at context time t0, each at the place in the loop the
  // song has reached by then.
  function startLoop(t0) {
    const offset = (((t0 - startAt) % LOOP_SEC) + LOOP_SEC) % LOOP_SEC;
    sources = layers.map((buffer, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(layerGains[i]);
      src.start(t0, offset);
      return src;
    });
  }

  function stopSources(list, at) {
    for (const src of list) {
      try {
        src.stop(at);
      } catch {
        // Already stopped.
      }
    }
  }

  function stopLoop(at) {
    stopSources(sources, at);
    sources = [];
    audioClock = false;
    wallAt = -1;
  }

  // From here on the audio clock keeps the time, carrying on from songTime.
  function takeClock() {
    latency = Math.min(0.3, Math.max(0, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)));
    startAt = ctx.currentTime - songTime - latency;
    lastRaw = songTime;
    lastRawWall = performance.now();
    audioClock = true;
  }

  return {
    // True once the music is rendered (or failed: then the beat runs on the
    // wall clock, silently) and sound may play: start() can go.
    get canStart() {
      return !audioClock && !!layers && layers.length === 3 && !!ctx && ctx.state === 'running';
    },

    // The music is playing and keeps the time.
    get playing() {
      return audioClock;
    },

    get sfxOn() {
      return settings.sfx;
    },
    get musicOn() {
      return settings.music;
    },

    // Starts the music where the song is: the layers come in on the next
    // bar line, at their place in the loop, and the clock does not jump.
    start() {
      if (!this.canStart) return;
      takeClock();
      const now = ctx.currentTime;
      const bar = Math.ceil((now + LEAD_IN - startAt) / BAR_SEC) * BAR_SEC;
      const t0 = startAt + bar;
      startLoop(t0);
      fadeMusic(0.02, t0, 0);
    },

    // How lively the club is, 0 to 1: the lead plays from 0.6 on, and stops
    // again below 0.5.
    intensity(k) {
      const lead = leadOn ? k >= 0.5 : k >= 0.6;
      if (!ctx || lead === leadOn) return;
      leadOn = lead;
      layerGains[2].gain.setTargetAtTime(lead ? 1.2 : 0, ctx.currentTime, 0.4);
    },

    // Under the pause menu the music plays on, quieter; the song's clock
    // stands still with the dance.
    pause() {
      ducked = true;
      if (ctx) fadeMusic(0.25);
    },

    // Back from the pause: the music picks up where the dance stopped, with
    // a quick fade over the jump.
    resume() {
      ducked = false;
      wallAt = -1;
      if (!ctx) return;
      if (!audioClock || ctx.state !== 'running') {
        if (audioClock) stopLoop(0);
        fadeMusic(0.25);
        return;
      }
      const t0 = ctx.currentTime + LEAD_IN;
      fadeMusic(0.3, t0, 0);
      stopSources(sources, t0);
      takeClock();
      startLoop(t0);
    },

    // Seconds since beat 0. From the audio clock while the music plays (it
    // moves in steps, so it is extrapolated between them and never runs
    // backwards); from the wall clock when there is no sound.
    time() {
      const now = performance.now();
      // The audio stopped under us (the system took it): carry on by the
      // wall clock, and start() brings the music back on a bar line.
      if (audioClock && ctx.state !== 'running') stopLoop(0);
      if (!audioClock) {
        if (wallAt >= 0) songTime += Math.min(MAX_STEP, Math.max(0, now - wallAt) / 1000);
        wallAt = now;
        return songTime;
      }
      const raw = ctx.currentTime - startAt - latency;
      if (raw !== lastRaw) {
        lastRaw = raw;
        lastRawWall = now;
      }
      const t = lastRaw + Math.min(MAX_STEP, (now - lastRawWall) / 1000);
      if (t > songTime) songTime = t;
      return songTime;
    },

    // Plays a sound: level 0 to 1, rate 1 as rendered.
    sound(name, level = 1, rate = 1) {
      const buffer = sounds[name];
      if (!settings.sfx || !buffer || !ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (now - (lastStart[name] ?? -1) < MIN_GAP) return;
      lastStart[name] = now;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      if (level === 1) src.connect(sfxGain);
      else {
        const g = ctx.createGain();
        g.gain.value = level;
        src.connect(g).connect(sfxGain);
      }
      src.start();
    },

    setSfx(on) {
      settings.sfx = Boolean(on);
      hh.save('sound.sfx', settings.sfx);
      if (ctx) sfxGain.gain.setTargetAtTime(settings.sfx ? SFX_VOLUME : 0, ctx.currentTime, 0.02);
    },

    // The layers play on silently with the music off, so the dance keeps
    // the audio clock.
    setMusic(on) {
      settings.music = Boolean(on);
      hh.save('sound.music', settings.music);
      if (ctx) fadeMusic(0.4);
    },
  };
}
