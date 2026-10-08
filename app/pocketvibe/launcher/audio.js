// Menu music and button sounds, synthesized with Web Audio: no audio files,
// nothing to license. The music is a calm eight-bar loop in A minor: a soft
// pad, a bass line, an arpeggio, a short melody and light percussion.

const BPM = 84;
const STEPS_PER_BEAT = 2; // eighth notes
const STEP = 60 / BPM / STEPS_PER_BEAT;
const BARS = 8;
const STEPS = BARS * 4 * STEPS_PER_BEAT;

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

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);

export class LauncherAudio {
  constructor() {
    this.ctx = null;
    this.musicOn = false;
    this.volume = 0.5;
    this.soundsOn = true;
    this.step = 0;
    this.nextTime = 0;
    this.timer = 0;
  }

  // The context is created lazily and resumed on demand, because browsers
  // may only allow audio after the first button press.
  ensure() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      this.ctx = new Context();
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 2400;
      this.musicGain.connect(this.filter).connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.25;
      this.sfxGain.connect(this.ctx.destination);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  configure({ music, musicVolume, uiSounds }) {
    this.soundsOn = uiSounds;
    this.volume = musicVolume;
    if (music && !this.musicOn) this.startMusic();
    else if (!music && this.musicOn) this.stopMusic();
    if (this.ctx) this.musicGain.gain.setTargetAtTime(this.musicOn ? this.volume * 0.35 : 0, this.ctx.currentTime, 0.3);
  }

  startMusic() {
    if (!this.ensure()) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
    this.musicGain.gain.setTargetAtTime(this.volume * 0.35, this.ctx.currentTime, 0.8);
  }

  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
    if (this.ctx) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }

  // Look-ahead scheduler: queue every note that starts in the next 150 ms.
  schedule() {
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % STEPS;
      this.nextTime += STEP;
    }
  }

  playStep(step, time) {
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

  tone(freq, time, length, type, level, attack, out = this.musicGain) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + attack);
    env.gain.setTargetAtTime(0, time + Math.max(length - 0.05, attack), 0.08);
    osc.connect(env).connect(out);
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
    osc.connect(env).connect(this.musicGain);
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
    src.connect(filter).connect(env).connect(this.musicGain);
    src.start(time);
    src.stop(time + 0.06);
  }

  makeNoise() {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.1, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // Short button sounds: 'move', 'select', 'back', 'tab'.
  sound(kind) {
    if (!this.soundsOn || !this.ensure()) return;
    const now = this.ctx.currentTime;
    const blip = (freq, at, length = 0.05) => this.tone(freq, now + at, length, 'square', 0.12, 0.004, this.sfxGain);
    if (kind === 'move') blip(880, 0, 0.03);
    else if (kind === 'tab') blip(740, 0, 0.04);
    else if (kind === 'select') {
      blip(660, 0);
      blip(990, 0.06);
    } else if (kind === 'back') {
      blip(660, 0);
      blip(440, 0.06);
    }
  }
}
