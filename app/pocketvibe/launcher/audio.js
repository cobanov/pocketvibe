// Menu music and button sounds, synthesized with Web Audio: no audio files,
// nothing to license. The music is a calm eight-bar loop in A minor: a soft
// pad, a bass line, an arpeggio, a short melody and light percussion.
//
// Everything is rendered once, ahead of time, with an OfflineAudioContext.
// Playing is then only looping one buffer and starting short ones, which
// costs almost nothing: live synthesis was too heavy for the handheld and
// made the music drop out and the button sounds lag.

const BPM = 84;
const STEPS_PER_BEAT = 2; // eighth notes
const STEP = 60 / BPM / STEPS_PER_BEAT;
const BARS = 8;
const STEPS = BARS * 4 * STEPS_PER_BEAT;
const LOOP_SECONDS = STEPS * STEP;
const TAIL_SECONDS = 2; // notes ringing past the loop's end are folded back to its start
const RATE = 44100; // button sounds
// The music is low-passed at 2.4 kHz, so 22 kHz loses nothing and halves the
// work. The rendered loop is cached by pocketvibed under this name; change
// the name whenever the music changes.
const MUSIC_RATE = 22050;
const MUSIC_CACHE = '/api/cache/menu-music-v1.wav';

// Chords as MIDI notes, one per two bars: Am, F, C, G.
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
];
// Melody, one entry per eighth note (null is a rest), A minor pentatonic.
const MELODY = [
  76, null, null, 81, 79, null, 76, null, 74, null, 76, null, null, null, null, null,
  72, null, null, 77, 76, null, 72, null, 69, null, null, null, 72, null, null, null,
  76, null, 79, null, 76, 74, 72, null, 74, null, null, null, null, null, 76, null,
  74, null, null, 79, null, 74, 71, null, 69, null, null, null, null, null, null, null,
];
// Button sounds as (frequency, start, length) notes.
const SOUNDS = {
  move: [[880, 0, 0.04]],
  tab: [[740, 0, 0.05]],
  select: [[660, 0, 0.06], [990, 0.06, 0.06]],
  back: [[660, 0, 0.06], [440, 0.06, 0.06]],
};

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);

// Schedules notes into any audio context (here always an offline one).
class Synth {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  tone(freq, time, length, type, level, attack) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + attack);
    env.gain.setTargetAtTime(0, time + Math.max(length - 0.05, attack), 0.08);
    osc.connect(env).connect(this.out);
    osc.start(time);
    osc.stop(time + length + 0.5);
  }

  kick(time) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(110, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
    env.gain.setValueAtTime(0.12, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(env).connect(this.out);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  hat(time) {
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    src.buffer = this.noise;
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    env.gain.setValueAtTime(0.025, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(filter).connect(env).connect(this.out);
    src.start(time);
    src.stop(time + 0.06);
  }

  step(step, time) {
    const stepsPerBar = 4 * STEPS_PER_BEAT;
    const bar = Math.floor(step / stepsPerBar);
    const inBar = step % stepsPerBar;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    if (step % (2 * stepsPerBar) === 0) {
      for (const note of chord) this.tone(midiToHz(note), time, STEP * 16, 'triangle', 0.05, 1.2);
    }
    if (inBar % 4 === 0) this.tone(midiToHz(chord[0] - 12), time, STEP * 3, 'triangle', 0.16, 0.02);
    const arp = chord[[0, 1, 2, 1][inBar % 4]] + 12;
    this.tone(midiToHz(arp), time, STEP * 0.9, 'square', 0.018, 0.01);
    const melody = MELODY[step % MELODY.length];
    if (melody) this.tone(midiToHz(melody), time, STEP * 1.8, 'triangle', 0.07, 0.02);
    if (inBar % 4 === 0) this.kick(time);
    if (inBar % 2 === 1) this.hat(time);
  }
}

async function renderMusic() {
  const RATE = MUSIC_RATE;
  const offline = new OfflineAudioContext(1, Math.ceil((LOOP_SECONDS + TAIL_SECONDS) * RATE), RATE);
  const filter = offline.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  filter.connect(offline.destination);
  const synth = new Synth(offline, filter);
  for (let step = 0; step < STEPS; step++) synth.step(step, step * STEP);
  const rendered = await offline.startRendering();

  // Fold the tail onto the start so the loop has no seam.
  const loopLength = Math.round(LOOP_SECONDS * RATE);
  const loop = new AudioBuffer({ length: loopLength, numberOfChannels: 1, sampleRate: RATE });
  const source = rendered.getChannelData(0);
  const target = loop.getChannelData(0);
  target.set(source.subarray(0, loopLength));
  for (let i = loopLength; i < source.length; i++) target[i - loopLength] += source[i];
  return loop;
}

// 16-bit mono WAV, to store the rendered loop.
function toWav(buffer) {
  const samples = buffer.getChannelData(0);
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (offset, s) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return view.buffer;
}

// The cached loop if there is one, else render it and cache it.
async function loadMusic() {
  try {
    const res = await fetch(MUSIC_CACHE);
    if (res.ok) return await new OfflineAudioContext(1, 1, MUSIC_RATE).decodeAudioData(await res.arrayBuffer());
  } catch {
    // Render it below.
  }
  const music = await renderMusic();
  fetch(MUSIC_CACHE, { method: 'PUT', body: toWav(music) }).catch(() => {});
  return music;
}

async function renderSound(notes) {
  const length = Math.max(...notes.map(([, at, len]) => at + len)) + 0.02;
  const offline = new OfflineAudioContext(1, Math.ceil(length * RATE), RATE);
  for (const [freq, at, len] of notes) {
    const osc = offline.createOscillator();
    const env = offline.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.5, at + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, at + len);
    osc.connect(env).connect(offline.destination);
    osc.start(at);
    osc.stop(at + len + 0.01);
  }
  return offline.startRendering();
}

export class LauncherAudio {
  constructor() {
    this.ctx = null;
    this.musicOn = false;
    this.volume = 0.5;
    this.soundsOn = true;
    this.music = null; // the rendered loop
    this.musicSource = null;
    this.sounds = {}; // kind -> rendered buffer
    this.soundSource = null;
    this.ready = this.prepare();
  }

  // Render the music and the button sounds. No audio context is needed for
  // this, so it starts right away, before audio is allowed to play.
  async prepare() {
    try {
      const started = performance.now();
      const entries = await Promise.all(Object.entries(SOUNDS).map(async ([kind, notes]) => [kind, await renderSound(notes)]));
      this.sounds = Object.fromEntries(entries);
      this.music = await loadMusic();
      console.log(`PocketVibe audio ready in ${Math.round(performance.now() - started)} ms`);
      if (this.musicOn) this.playMusic();
    } catch (e) {
      console.log(`PocketVibe audio could not be rendered: ${e.message}`);
    }
  }

  // The context is created lazily and resumed on demand, because the browser
  // only allows audio after a key press (see unlockAudio in launcher.js).
  ensure() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      this.ctx = new Context();
      // Music and button sounds meet in a compressor, so together they never
      // clip into a sudden loud burst.
      this.output = this.ctx.createDynamicsCompressor();
      this.output.threshold.value = -18;
      this.output.ratio.value = 6;
      this.output.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.output);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.3;
      this.sfxGain.connect(this.output);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  configure({ music, musicVolume, uiSounds }) {
    this.soundsOn = uiSounds;
    this.volume = musicVolume;
    if (music && !this.musicOn) this.startMusic();
    else if (!music && this.musicOn) this.stopMusic();
    if (this.ctx && this.musicOn) this.musicGain.gain.setTargetAtTime(this.volume * 0.35, this.ctx.currentTime, 0.2);
  }

  startMusic() {
    this.musicOn = true;
    if (this.ensure()) this.playMusic();
  }

  playMusic() {
    if (!this.music || !this.ctx || this.musicSource) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.music;
    source.loop = true;
    source.connect(this.musicGain);
    source.start();
    this.musicSource = source;
    this.musicGain.gain.setTargetAtTime(this.volume * 0.35, this.ctx.currentTime, 0.8);
  }

  stopMusic() {
    this.musicOn = false;
    if (!this.ctx || !this.musicSource) return;
    const source = this.musicSource;
    this.musicSource = null;
    this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    source.stop(this.ctx.currentTime + 1);
  }

  // Short button sounds: 'move', 'select', 'back', 'tab'. Only one plays at a
  // time: a new one cuts the previous, so fast presses do not stack up.
  sound(kind) {
    const buffer = this.sounds[kind];
    if (!this.soundsOn || !buffer || !this.ensure() || this.ctx.state !== 'running') return;
    try {
      this.soundSource?.stop();
    } catch {
      // Already finished.
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain);
    source.start();
    this.soundSource = source;
  }
}
