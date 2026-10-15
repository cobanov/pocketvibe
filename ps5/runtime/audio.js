// Web Audio for the games and the launcher, on the native engine (__audio,
// app/audio.c): AudioContext and OfflineAudioContext, the nodes they use
// (gain, buffer source, oscillator, biquad filter, stereo panner, dynamics
// compressor, delay), AudioParam automation and AudioBuffer. Nodes the page
// drops are freed natively once nothing plays through them.

(() => {
  const g = globalThis;
  const A = g.__audio;
  if (!A) return;

  const dropped = new FinalizationRegistry((id) => A.set(id, 5, 0, 0, 0));
  const droppedBuffers = new FinalizationRegistry((id) => A.releaseBuffer(id));
  const playing = new Map(); // node id -> started source, kept alive until it ends

  class Events {
    addEventListener(type, fn) { ((this.listeners ??= {})[type] ??= []).push(fn); }
    removeEventListener(type, fn) { const l = this.listeners?.[type]; if (l) l.splice(l.indexOf(fn) >>> 0, 1); }
    dispatchEvent(e) {
      for (const fn of this.listeners?.[e.type] ?? []) fn.call(this, e);
      this[`on${e.type}`]?.call(this, e);
      return true;
    }
  }

  const SET = 0, LINEAR = 1, EXP = 2, TARGET = 3, CANCEL = 4, VALUE = 5;
  class AudioParam {
    constructor(node, index, value, min = -3.4028235e38, max = 3.4028235e38) {
      this.node = node;
      this.index = index;
      this.defaultValue = value;
      this.minValue = min;
      this.maxValue = max;
      this.automationRate = 'a-rate';
    }
    get value() { return A.paramValue(this.node.id, this.index); }
    set value(v) { A.param(this.node.id, this.index, VALUE, +v, 0, 0); }
    event(type, v, t, tau = 0) { A.param(this.node.id, this.index, type, +v, Math.max(0, +t || 0), +tau); return this; }
    setValueAtTime(v, t) { return this.event(SET, v, t); }
    linearRampToValueAtTime(v, t) { return this.event(LINEAR, v, t); }
    exponentialRampToValueAtTime(v, t) { return this.event(EXP, v, t); }
    setTargetAtTime(v, t, tau) { return this.event(TARGET, v, t, tau); }
    cancelScheduledValues(t) { return this.event(CANCEL, 0, t); }
    cancelAndHoldAtTime(t) { const v = this.value; this.cancelScheduledValues(t); return this.setValueAtTime(v, t); }
    setValueCurveAtTime(values, t, duration) {
      const n = values.length;
      this.setValueAtTime(values[0], t);
      for (let i = 1; i < n; i++) this.linearRampToValueAtTime(values[i], t + (duration * i) / (n - 1));
      return this;
    }
  }

  class AudioNode extends Events {
    constructor(context, type, extra = 0) {
      super();
      this.context = context;
      this.id = A.node(context.ctxId, type, extra);
      this.channelCount = 2;
      this.channelCountMode = 'max';
      this.channelInterpretation = 'speakers';
      this.numberOfInputs = 1;
      this.numberOfOutputs = 1;
      dropped.register(this, this.id);
    }
    connect(dest) {
      if (dest instanceof AudioParam) A.connect(this.id, dest.node.id, dest.index);
      else A.connect(this.id, dest.id, -1);
      return dest;
    }
    disconnect(dest) {
      if (dest === undefined || typeof dest === 'number') A.disconnect(this.id, -1);
      else A.disconnect(this.id, dest instanceof AudioParam ? dest.node.id : dest.id);
    }
  }

  class AudioDestinationNode extends Events {
    constructor(context) {
      super();
      this.context = context;
      this.id = A.dest(context.ctxId);
      this.maxChannelCount = 2;
      this.channelCount = 2;
    }
  }

  class GainNode extends AudioNode {
    constructor(context, options = {}) {
      super(context, 2);
      this.gain = new AudioParam(this, 0, 1);
      if (options.gain !== undefined) this.gain.value = options.gain;
    }
  }

  // Sources stay referenced while they play, so onended can still fire.
  class Scheduled extends AudioNode {
    start(when = 0, offset = 0, duration = 0) {
      playing.set(this.id, this);
      A.set(this.id, 1, +when || 0, +offset || 0, +duration || 0);
    }
    stop(when = 0) { A.set(this.id, 2, +when || 0, 0, 0); }
  }

  class AudioBufferSourceNode extends Scheduled {
    constructor(context, options = {}) {
      super(context, 3);
      this.playbackRate = new AudioParam(this, 0, 1);
      this.detune = new AudioParam(this, 1, 0);
      this.loopState = [false, 0, 0];
      this.bufferValue = null;
      if (options.buffer) this.buffer = options.buffer;
      if (options.loop) this.loop = true;
      if (options.playbackRate !== undefined) this.playbackRate.value = options.playbackRate;
    }
    get buffer() { return this.bufferValue; }
    set buffer(b) {
      this.bufferValue = b;
      A.set(this.id, 0, b ? b.native() : -1, 0, 0);
    }
    loopUpdate() { A.set(this.id, 3, this.loopState[0] ? 1 : 0, this.loopState[1], this.loopState[2]); }
    get loop() { return this.loopState[0]; }
    set loop(v) { this.loopState[0] = !!v; this.loopUpdate(); }
    get loopStart() { return this.loopState[1]; }
    set loopStart(v) { this.loopState[1] = +v; this.loopUpdate(); }
    get loopEnd() { return this.loopState[2]; }
    set loopEnd(v) { this.loopState[2] = +v; this.loopUpdate(); }
  }

  const WAVES = { sine: 0, square: 1, sawtooth: 2, triangle: 3, custom: 0 };
  class OscillatorNode extends Scheduled {
    constructor(context, options = {}) {
      super(context, 4);
      this.frequency = new AudioParam(this, 0, 440);
      this.detune = new AudioParam(this, 1, 0);
      this.typeValue = 'sine';
      if (options.type) this.type = options.type;
      if (options.frequency !== undefined) this.frequency.value = options.frequency;
    }
    get type() { return this.typeValue; }
    set type(t) { if (t in WAVES) { this.typeValue = t; A.set(this.id, 4, WAVES[t], 0, 0); } }
    setPeriodicWave() {}
  }

  const FILTERS = { lowpass: 0, highpass: 1, bandpass: 2, lowshelf: 3, highshelf: 4, peaking: 5, notch: 6, allpass: 7 };
  class BiquadFilterNode extends AudioNode {
    constructor(context, options = {}) {
      super(context, 5);
      this.frequency = new AudioParam(this, 0, 350);
      this.Q = new AudioParam(this, 1, 1);
      this.gain = new AudioParam(this, 2, 0);
      this.detune = new AudioParam(this, 3, 0);
      this.typeValue = 'lowpass';
      if (options.type) this.type = options.type;
      if (options.frequency !== undefined) this.frequency.value = options.frequency;
      if (options.Q !== undefined) this.Q.value = options.Q;
    }
    get type() { return this.typeValue; }
    set type(t) { if (t in FILTERS) { this.typeValue = t; A.set(this.id, 4, FILTERS[t], 0, 0); } }
  }

  class StereoPannerNode extends AudioNode {
    constructor(context, options = {}) {
      super(context, 6);
      this.pan = new AudioParam(this, 0, 0, -1, 1);
      if (options.pan !== undefined) this.pan.value = options.pan;
    }
  }

  class DynamicsCompressorNode extends AudioNode {
    constructor(context) {
      super(context, 7);
      this.threshold = new AudioParam(this, 0, -24, -100, 0);
      this.knee = new AudioParam(this, 1, 30, 0, 40);
      this.ratio = new AudioParam(this, 2, 12, 1, 20);
      this.attack = new AudioParam(this, 3, 0.003, 0, 1);
      this.release = new AudioParam(this, 4, 0.25, 0, 1);
      this.reduction = 0;
    }
  }

  class DelayNode extends AudioNode {
    constructor(context, options = {}) {
      super(context, 8, options.maxDelayTime ?? 1);
      this.delayTime = new AudioParam(this, 0, 0, 0, options.maxDelayTime ?? 1);
      if (options.delayTime !== undefined) this.delayTime.value = options.delayTime;
    }
  }

  // Sample data lives in the engine for decoded and rendered buffers (read
  // back when a script asks) and in the script for created ones (copied to the
  // engine when first played).
  class AudioBuffer {
    constructor(options = {}) {
      this.numberOfChannels = options.numberOfChannels ?? 1;
      this.length = options.length ?? 0;
      this.sampleRate = options.sampleRate ?? 48000;
      this.channels = options.nativeId === undefined ? Array.from({ length: this.numberOfChannels }, () => new Float32Array(this.length)) : [];
      this.nativeId = options.nativeId;
      if (this.nativeId !== undefined) droppedBuffers.register(this, this.nativeId);
    }
    static fromNative(id) {
      const [channels, length, rate] = A.bufferInfo(id);
      return new AudioBuffer({ numberOfChannels: channels, length, sampleRate: rate, nativeId: id });
    }
    get duration() { return this.length / this.sampleRate; }
    getChannelData(c) {
      if (!this.channels[c]) this.channels[c] = A.bufferChannel(this.nativeId, c);
      return this.channels[c];
    }
    copyFromChannel(dest, c, start = 0) { dest.set(this.getChannelData(c).subarray(start, start + dest.length)); }
    copyToChannel(src, c, start = 0) { this.getChannelData(c).set(src, start); this.uploaded = false; }
    // The engine's buffer for this one, uploading script-made samples once.
    native() {
      if (this.nativeId !== undefined && (this.uploaded !== false || !this.channels.length)) return this.nativeId;
      const id = A.buffer(this.sampleRate, ...Array.from({ length: Math.min(2, this.numberOfChannels) }, (_, c) => this.getChannelData(c)));
      if (this.nativeId !== undefined) A.releaseBuffer(this.nativeId);
      else droppedBuffers.register(this, id);
      this.nativeId = id;
      this.uploaded = true;
      return id;
    }
  }

  class BaseAudioContext extends Events {
    constructor(ctxId) {
      super();
      this.ctxId = ctxId;
      this.sampleRate = A.rate(ctxId);
      this.destination = new AudioDestinationNode(this);
      this.listener = {};
    }
    get currentTime() { return A.time(this.ctxId); }
    createGain() { return new GainNode(this); }
    createBufferSource() { return new AudioBufferSourceNode(this); }
    createOscillator() { return new OscillatorNode(this); }
    createBiquadFilter() { return new BiquadFilterNode(this); }
    createStereoPanner() { return new StereoPannerNode(this); }
    createDynamicsCompressor() { return new DynamicsCompressorNode(this); }
    createDelay(max = 1) { return new DelayNode(this, { maxDelayTime: max }); }
    createBuffer(channels, length, rate) { return new AudioBuffer({ numberOfChannels: channels, length, sampleRate: rate }); }
    createPeriodicWave() { return {}; }
    decodeAudioData(data, ok, fail) {
      return new Promise((resolve, reject) => {
        const id = A.decode(data);
        if (id < 0) {
          const e = new Error('Unable to decode audio data');
          fail?.(e);
          reject(e);
          return;
        }
        const buffer = AudioBuffer.fromNative(id);
        ok?.(buffer);
        resolve(buffer);
      });
    }
  }

  // One output on the console: every AudioContext plays through it.
  class AudioContext extends BaseAudioContext {
    constructor() {
      super(A.context(0, 2, 0, 48000));
      this.state = 'running';
      this.baseLatency = 0.005;
      this.outputLatency = 0.016;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }

  class OfflineAudioContext extends BaseAudioContext {
    constructor(channels, length, rate) {
      const o = typeof channels === 'object' ? channels : { numberOfChannels: channels, length, sampleRate: rate };
      super(A.context(1, o.numberOfChannels ?? 1, o.length, o.sampleRate ?? 44100));
      this.length = o.length;
      this.state = 'suspended';
    }
    startRendering() {
      return Promise.resolve().then(() => {
        const buffer = AudioBuffer.fromNative(A.render(this.ctxId));
        this.state = 'closed';
        this.dispatchEvent({ type: 'complete', renderedBuffer: buffer });
        return buffer;
      });
    }
  }

  // Ended sources tell their pages once per frame.
  const tick = g.__frame;
  g.__frame = (now) => {
    for (const id of A.ended()) {
      const node = playing.get(id);
      if (!node) continue;
      playing.delete(id);
      node.dispatchEvent({ type: 'ended', target: node });
    }
    tick(now);
  };

  Object.assign(g, {
    AudioContext, webkitAudioContext: AudioContext, OfflineAudioContext, AudioBuffer, AudioParam, AudioNode,
    GainNode, AudioBufferSourceNode, OscillatorNode, BiquadFilterNode, StereoPannerNode, DynamicsCompressorNode, DelayNode,
  });
})();
