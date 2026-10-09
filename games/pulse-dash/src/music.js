// Music and sounds, synthesized with Web Audio: no audio files.
//
// A level's track is built from one-bar layers: drums, bass, arpeggio, pad,
// a lead melody, a riser before each drop and a crash on it. Every distinct
// layer bar is rendered once with its own small OfflineAudioContext, a few
// at a time, and the bars are then summed into one AudioBuffer for the
// whole level. A bar that repeats costs nothing more, which keeps loading
// short on the handheld, where live synthesis would be far too heavy (see
// the launcher's audio.js). Finished tracks stay cached for the session.
//
// While a level plays, the game reads its position from the audio clock,
// so obstacles stay on the beat even when frames drop. Without sound (audio
// not unlocked yet, or no Web Audio) the same clock runs on the wall clock,
// and the music joins in on the beat if audio comes up later.

const RATE = 22050; // half the usual rate: half the work, and the mix is simple
const TAIL = 0.7; // seconds a layer bar may ring on into the next bar
const LEAD_IN = 0.06; // the song starts this long after play(), so nothing is cut
const PARALLEL = 4; // layer bars rendered at the same time
const SONG_PEAK = 0.9; // a finished track is scaled to this peak
const MUSIC_VOLUME = 0.6; // the music bus, so effects sit on top of it
const SFX_VOLUME = 1; // effects are rendered at their own peaks (see SOUNDS)
const UNLOCK_URL = '/__pocketvibe__/unlock-audio';
const REF_KEY = 57; // the effects are written in A minor / C major (MIDI A3)

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

// A dotted-eighth echo, which makes a line shimmer for almost no cost.
// Returns the input to play into.
function echoBus(ctx, out, step) {
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
  return dry;
}

// The lead: a square and a slightly detuned saw through a soft filter,
// with a little vibrato once a long note has settled.
function leadNote(ctx, out, t, freq, len, level) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2600;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.012);
  env.gain.setTargetAtTime(level * 0.7, t + 0.02, 0.08);
  env.gain.setValueAtTime(level * 0.7, t + Math.max(0.03, len - 0.04));
  env.gain.linearRampToValueAtTime(0, t + len);
  filter.connect(env).connect(out);
  const vibrato = ctx.createOscillator();
  const depth = ctx.createGain();
  vibrato.frequency.value = 5.5;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(len > 0.3 ? freq * 0.008 : 0, t + Math.min(len, 0.35));
  vibrato.connect(depth);
  for (const [type, detune, gain] of [['square', 0, 0.6], ['sawtooth', 8, 0.5]]) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    depth.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.value = gain;
    osc.connect(g).connect(filter);
    osc.start(t);
    osc.stop(t + len + 0.01);
  }
  vibrato.start(t);
  vibrato.stop(t + len + 0.01);
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
    const t = i * step;
    // off: offbeat eighths. roll: every sixteenth but the kick's, an octave
    // jump on the offbeat, for the drops. pulse: every eighth, the octave
    // on the offbeats. gallop: two sixteenths after each offbeat.
    if (style === 'off' && i % 4 === 2) bassNote(ctx, out, t, root, step * 1.8, 0.26);
    if (style === 'roll' && i % 4 !== 0) bassNote(ctx, out, t, i % 4 === 2 ? root * 2 : root, step * 0.85, 0.22);
    if (style === 'pulse' && i % 2 === 0) bassNote(ctx, out, t, i % 4 === 2 ? root * 2 : root, step * 1.6, 0.22);
    if (style === 'gallop' && i % 4 >= 2) bassNote(ctx, out, t, i % 4 === 3 ? root * 2 : root, step * 0.9, 0.24);
  }
}

function arpBar(ctx, out, music, chord, step) {
  const dry = echoBus(ctx, out, step);
  for (let i = 0; i < 16; i++) {
    const k = music.arp[i];
    if (k < 0) continue;
    const note = chord[k % 3] + 12 * Math.floor(k / 3) + 12;
    tone(ctx, dry, i * step, midiToHz(note), step * 1.5, music.wave || 'square', music.arpLevel, 0.004);
  }
}

// One bar of the melody: a MIDI note starts a note, 0 holds the one before,
// -1 is a rest.
function leadBar(ctx, out, notes, level, step) {
  const dry = echoBus(ctx, out, step);
  for (let i = 0; i < 16; i++) {
    if (notes[i] <= 0) continue;
    let len = 1;
    while (i + len < 16 && notes[i + len] === 0) len++;
    leadNote(ctx, dry, i * step, midiToHz(notes[i]), len * step * 0.92, level);
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
  else if (kind === 'a') arpBar(ctx, out, music, music.chords[Number(a)], step);
  else if (kind === 'm') leadBar(ctx, out, music.melody[Number(a)], music.leadLevel, step);
  else if (kind === 'p') padBar(ctx, out, music.chords[Number(a)], barSec);
  else if (kind === 'r') riser(ctx, out, barSec * 2);
  else if (kind === 'c') crash(ctx, out);
  return ctx.startRendering().then((buffer) => buffer.getChannelData(0));
}

// The layer bars that play in bar `index` of a level.
function layersOf(L, index) {
  const info = L.barInfo[index];
  const music = L.def.music;
  const chord = index % music.chords.length;
  const keys = [];
  if (info.drums !== 'none') keys.push(`d:${info.fill ? 'fill' : info.drums}`);
  if (info.bass) keys.push(`b:${info.bass}:${chord}`);
  if (info.arp) keys.push(`a:${chord}`);
  if (info.lead && music.melody) keys.push(`m:${index % music.melody.length}`);
  if (info.pad) keys.push(`p:${chord}`);
  if (info.riser) keys.push('r');
  if (info.crash) keys.push('c');
  return keys;
}

export async function renderSong(L) {
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
  const gain = peak > 0 ? Math.min(2, SONG_PEAK / peak) : 1;
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

// Renders an effect and scales it to the given peak: frequent sounds sit
// quietly under the music, rare big moments louder.
function renderSound(seconds, peak, build) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * RATE), RATE);
  build(ctx, ctx.destination);
  return ctx.startRendering().then((buffer) => {
    const data = buffer.getChannelData(0);
    let max = 0;
    for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
    if (max > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / max;
    return buffer;
  });
}

// A pitch sweep with an envelope, for blips and zips.
function sweep(ctx, out, t, type, from, to, len, level) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(to, t + len * 0.8);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.001, t + len);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + len + 0.01);
}

// A soft bell: a sine and two quieter partials.
function bell(ctx, out, t, freq, len, level) {
  tone(ctx, out, t, freq, len, 'sine', level, 0.003);
  tone(ctx, out, t, freq * 2, len * 0.6, 'sine', level * 0.35, 0.003);
  tone(ctx, out, t, freq * 3, len * 0.35, 'sine', level * 0.15, 0.002);
}

// Written in A minor / C major; played transposed to the level's key.
// Peaks: about -16 to -11 dBFS for the frequent ones, -7 to -5 for the rare.
const SOUNDS = {
  // The crash when the cube dies: a thud, a falling zap and a burst of noise.
  crash: () =>
    renderSound(0.7, 0.5, (ctx, out) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.frequency.setValueAtTime(140, 0);
      osc.frequency.exponentialRampToValueAtTime(32, 0.3);
      env.gain.setValueAtTime(0.9, 0);
      env.gain.exponentialRampToValueAtTime(0.001, 0.35);
      osc.connect(env).connect(out);
      osc.start(0);
      osc.stop(0.36);
      sweep(ctx, out, 0, 'square', 700, 60, 0.3, 0.16);
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
  // Level complete: a rising C major arpeggio (the relative major).
  complete: () =>
    renderSound(1.4, 0.5, (ctx, out) => {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(ctx, out, i * 0.08, f, i === 4 ? 0.9 : 0.25, 'triangle', 0.4, 0.004));
      [1047, 1319, 1568].forEach((f) => bell(ctx, out, 0.32, f, 1, 0.12));
    }),
  // A new best on the crash panel: a bright run up to a ringing chord.
  record: () =>
    renderSound(1, 0.45, (ctx, out) => {
      [659, 784, 1047].forEach((f, i) => tone(ctx, out, i * 0.06, f, 0.2, 'square', 0.12, 0.003));
      [1047, 1319, 1568, 2093].forEach((f) => bell(ctx, out, 0.18, f, 0.75, 0.14));
    }),
  // Passing the best run's mark mid-level: a quick sparkle.
  best: () =>
    renderSound(0.45, 0.24, (ctx, out) => {
      [1047, 1319, 1568].forEach((f, i) => bell(ctx, out, i * 0.045, f, 0.3, 0.3));
    }),
  // A jump ring: a short bright ping (played up the scale along a chain).
  ring: () =>
    renderSound(0.3, 0.2, (ctx, out) => {
      bell(ctx, out, 0, 1760, 0.24, 0.5);
      sweep(ctx, out, 0, 'triangle', 1320, 2640, 0.06, 0.25);
    }),
  // A jump pad: a springy upward boing.
  pad: () =>
    renderSound(0.28, 0.22, (ctx, out) => {
      sweep(ctx, out, 0, 'triangle', 196, 784, 0.26, 0.6);
      sweep(ctx, out, 0, 'square', 392, 1568, 0.12, 0.12);
    }),
  // Practice mode: a checkpoint is set, and the cube comes back to one.
  checkpoint: () =>
    renderSound(0.4, 0.17, (ctx, out) => {
      bell(ctx, out, 0, 1319, 0.35, 0.4);
      bell(ctx, out, 0.07, 1976, 0.3, 0.3);
    }),
  respawn: () => renderSound(0.2, 0.17, (ctx, out) => sweep(ctx, out, 0, 'triangle', 440, 1760, 0.18, 0.5)),
  // Menus: move, confirm, back, pause.
  tick: () => renderSound(0.07, 0.16, (ctx, out) => tone(ctx, out, 0, 880, 0.05, 'square', 0.3, 0.002)),
  select: () =>
    renderSound(0.16, 0.2, (ctx, out) => {
      tone(ctx, out, 0, 880, 0.06, 'square', 0.3, 0.002);
      tone(ctx, out, 0.05, 1319, 0.1, 'square', 0.3, 0.002);
    }),
  back: () =>
    renderSound(0.16, 0.18, (ctx, out) => {
      tone(ctx, out, 0, 1319, 0.06, 'square', 0.3, 0.002);
      tone(ctx, out, 0.05, 880, 0.1, 'square', 0.3, 0.002);
    }),
  pause: () =>
    renderSound(0.22, 0.2, (ctx, out) => {
      tone(ctx, out, 0, 659, 0.08, 'triangle', 0.5, 0.003);
      tone(ctx, out, 0.07, 440, 0.14, 'triangle', 0.5, 0.003);
    }),
};

// ---------------------------------------------------------------- player

// hh: the handheld (saves the on / off choices). onHide: called when the
// page is hidden, so the game can pause first.
export function createAudio(hh, { onHide } = {}) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const canRender = typeof OfflineAudioContext !== 'undefined';
  const settings = { sfx: hh.load('sound.sfx', true), music: hh.load('sound.music', true) };
  let ctx = null;
  let musicGain = null;
  let sfxGain = null;
  let hidden = false;
  let keyRate = 1; // the effects' pitch for the current level's key

  // The song clock. Song time 0 is the first beat of bar 0.
  let current = -1; // the level whose song the clock follows
  let running = false; // the clock moves (false when stopped or paused)
  let source = null;
  let sourceGain = null; // the playing song's own fader
  let audioClock = false; // timed by the audio clock (else the wall clock)
  let startAt = 0; // context time of song time 0
  let latency = 0;
  let lastRaw = 0; // the audio clock as last read, in song time
  let lastWall = 0; // when it last changed (ms)
  let wallSong = 0; // the wall clock: song time wallSong at wallAt (ms)
  let wallAt = 0;
  let songTime = 0;
  let resumeOnShow = false;
  const songs = []; // per level: { buffer } once rendered (buffer null if it failed)
  const sounds = {};

  if (Context) {
    try {
      ctx = new Context({ latencyHint: 'interactive' });
    } catch {
      ctx = null;
    }
  }
  if (ctx) {
    // Music and effects meet in a gentle compressor, so together they never clip.
    const output = ctx.createDynamicsCompressor();
    output.threshold.value = -10;
    output.knee.value = 8;
    output.ratio.value = 4;
    output.attack.value = 0.003;
    output.release.value = 0.2;
    output.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = settings.music ? MUSIC_VOLUME : 0;
    musicGain.connect(output);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = settings.sfx ? SFX_VOLUME : 0;
    sfxGain.connect(output);
    listenForUnlock();
  }
  if (canRender) {
    for (const name of Object.keys(SOUNDS)) {
      SOUNDS[name]()
        .then((buffer) => (sounds[name] = buffer))
        .catch(() => {});
    }
  }

  function live() {
    return !!ctx && ctx.state === 'running';
  }

  function wake() {
    if (!ctx || hidden || ctx.state !== 'suspended') return;
    ctx.resume().catch(() => {});
  }

  // The browser only starts audio after a key press, and the handheld's
  // gamepad buttons do not count. Inside PocketVibe the game asks the app
  // for one (POST /__pocketvibe__/unlock-audio taps a virtual key, which
  // arrives here as a real key press); in a desktop browser the first key
  // does it. Until then the game runs on the wall clock, without sound.
  function listenForUnlock() {
    // The handler must call resume() while the browser is handling the press.
    const onPress = (e) => {
      if (e.isTrusted) wake();
    };
    addEventListener('keydown', onPress, true);
    addEventListener('pointerdown', onPress, true);
    document.addEventListener('visibilitychange', () => {
      hidden = document.hidden;
      if (hidden) {
        onHide?.();
        // The title's song stops with the page and picks up again after.
        resumeOnShow = running;
        if (running) player.pause();
        if (ctx.state === 'running') ctx.suspend().catch(() => {});
      } else {
        wake();
        if (resumeOnShow) player.resume(LEAD_IN);
        resumeOnShow = false;
      }
    });
    wake();
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

  function stopSource(fade) {
    if (!source) return;
    if (!live()) fade = 0;
    const now = ctx.currentTime;
    sourceGain.gain.setValueAtTime(1, now);
    sourceGain.gain.linearRampToValueAtTime(0, now + fade + 0.01);
    try {
      source.stop(now + fade + 0.02);
    } catch {
      // Already stopped.
    }
    source = null;
    sourceGain = null;
  }

  // Plays the current song so that song time `from` sounds at context time
  // `at` (now or later), and moves the clock over to the audio.
  function startSource(buffer, from, at) {
    source = ctx.createBufferSource();
    source.buffer = buffer;
    sourceGain = ctx.createGain();
    source.connect(sourceGain).connect(musicGain);
    if (from >= 0) source.start(at, from);
    else source.start(at - from);
    startAt = at - from;
    // What the speaker plays lags the context clock; the picture follows the sound.
    latency = Math.min(0.3, Math.max(0, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)));
    audioClock = true;
    lastRaw = songTime;
    lastWall = performance.now();
  }

  // Starts the song where the clock is (just ahead, so nothing is cut). On
  // the wall clock, this is also how the music joins in if the audio comes
  // up (or the track finishes rendering) after the song started.
  function join() {
    const buffer = songs[current]?.buffer;
    if (!buffer || !live() || songTime + LEAD_IN > buffer.duration - 1) return;
    startSource(buffer, songTime + LEAD_IN, ctx.currentTime + LEAD_IN);
  }

  const player = {
    // The effects follow the level's key (a MIDI root note).
    setKey(root) {
      let k = (((root - REF_KEY) % 12) + 12) % 12;
      if (k > 6) k -= 12;
      keyRate = 2 ** (k / 12);
    },

    // True once the context is producing sound.
    get live() {
      return live();
    },
    get sfxOn() {
      return settings.sfx;
    },
    get musicOn() {
      return settings.music;
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
    // plays silently on the wall clock).
    ready(index) {
      return !!songs[index] && songs[index].buffer !== undefined;
    },

    // Starts a level's song so that song time `from` comes `hold` seconds
    // from now: the clock reads from - hold, so a game already at `from`
    // waits out the hold while the music leads in to it.
    play(index, from = 0, hold = LEAD_IN) {
      stopSource(0.03);
      current = index;
      running = true;
      audioClock = false;
      songTime = from - hold;
      wallSong = songTime;
      wallAt = performance.now();
      join();
    },

    // Stops the music, fading over `fade` seconds; the clock stops too.
    stop(fade = 0) {
      stopSource(fade);
      running = false;
    },

    // Stops the song where it is; resume() plays on from there.
    pause() {
      if (!running) return;
      this.time();
      stopSource(0.02);
      running = false;
    },

    // Plays on after pause(): the music picks up `hold` seconds before the
    // point it stopped, and the clock gets back there `hold` seconds from now.
    resume(hold = LEAD_IN) {
      if (running || current < 0) return;
      this.play(current, songTime, hold);
    },

    // Song time in seconds. From the audio clock while the music plays (the
    // clock moves in steps, so it is extrapolated between them and never
    // runs backwards); from the wall clock when there is no sound.
    time() {
      if (!running) return songTime;
      const now = performance.now();
      if (!audioClock) {
        songTime = wallSong + (now - wallAt) / 1000;
        join();
        return songTime;
      }
      const raw = ctx.currentTime - startAt - latency;
      if (raw !== lastRaw) {
        lastRaw = raw;
        lastWall = now;
      }
      const t = lastRaw + (now - lastWall) / 1000;
      if (t > songTime) songTime = t;
      return songTime;
    },

    // Plays an effect: volume 0..1, semitones above the level's key.
    sound(name, volume = 1, semitones = 0) {
      const buffer = sounds[name];
      if (!buffer || !settings.sfx || !live()) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = (name === 'crash' ? 1 : keyRate) * 2 ** (semitones / 12);
      let node = src;
      if (volume !== 1) {
        const g = ctx.createGain();
        g.gain.value = volume;
        node = src.connect(g);
      }
      node.connect(sfxGain);
      src.start();
    },

    setSfx(on) {
      settings.sfx = Boolean(on);
      hh.save('sound.sfx', settings.sfx);
      if (ctx) sfxGain.gain.setTargetAtTime(settings.sfx ? SFX_VOLUME : 0, ctx.currentTime, 0.02);
    },

    // Music off only silences it: the song still runs, as the level's clock.
    setMusic(on) {
      settings.music = Boolean(on);
      hh.save('sound.music', settings.music);
      if (ctx) musicGain.gain.setTargetAtTime(settings.music ? MUSIC_VOLUME : 0, ctx.currentTime, 0.05);
    },
  };
  return player;
}
