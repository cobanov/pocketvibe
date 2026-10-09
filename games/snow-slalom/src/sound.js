// Sound effects and music for a PocketVibe game, with Web Audio.
//
// The effects are short WAV files in public/sfx/ (the handheld's WebKit
// decodes a WAV in about 60 ms, the same sound as OGG in about 1.5 s); the
// music is one looping OGG in public/music/, decoded in the background after
// the effects. Everything loads while the title screen shows, and a sound
// that is not ready yet simply does not play.
//
//   import { createSound } from './sound.js';
//   const sound = createSound(hh, { sfx: ['jump', 'coin'], music: 'theme' });
//   sound.play('coin', { volume: 0.8, rate: 1.1 });
//   const engine = sound.loop('engine'); engine.set(0.5, 1.4); engine.stop();
//   sound.startMusic(); sound.duck(true); // quieter under the pause menu
//
// The browser only starts audio after a key press, and the handheld's
// gamepad buttons do not count. Inside PocketVibe the game asks the app for
// one (POST /__pocketvibe__/unlock-audio taps a virtual key, which arrives
// here as a real key press); in a desktop browser the first key does it.
//
// The player's choices (sound effects and music on or off) are saved with
// hh.save, so a game's options menu only has to call setSfx / setMusic.

const UNLOCK_URL = '/__pocketvibe__/unlock-audio';
const MAX_VOICES = 24; // effects playing at once; more are dropped
const MIN_GAP = 0.03; // s: the same effect does not start twice within this
const MUSIC_FADE = 1.2; // s

export function createSound(hh, { sfx = [], music = null, musicVolume = 0.55, sfxVolume = 0.9 } = {}) {
  const Context = window.AudioContext || window.webkitAudioContext;
  const settings = { sfx: hh.load('sound.sfx', true), music: hh.load('sound.music', true) };
  const buffers = {};
  const lastStart = {};
  let ctx = null;
  let master, sfxBus, musicBus;
  let voices = 0;
  let musicBuffer = null;
  let musicSource = null;
  let musicWanted = false;
  let ducked = false;
  let hidden = false;

  if (Context) {
    try {
      ctx = new Context({ latencyHint: 'interactive' });
    } catch {
      ctx = null;
    }
  }
  if (ctx) {
    // Effects and music meet in a gentle compressor, so a pile of effects
    // over the music does not clip.
    master = ctx.createDynamicsCompressor();
    master.threshold.value = -10;
    master.knee.value = 8;
    master.ratio.value = 4;
    master.attack.value = 0.003;
    master.release.value = 0.2;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = settings.sfx ? sfxVolume : 0;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0;
    musicBus.connect(master);
    load();
    listenForUnlock();
  }

  async function fetchBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    const data = await res.arrayBuffer();
    // The callback form also works on older WebKit; newer browsers also
    // return a promise, which would report the same failure a second time.
    return new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)?.catch?.(() => {}));
  }

  // One file at a time: the handheld decodes one at a time anyway, and the
  // game's own loading is not crowded out.
  async function load() {
    for (const name of sfx) {
      try {
        buffers[name] = await fetchBuffer(`./sfx/${name}.wav`);
      } catch {
        // This one stays silent.
      }
    }
    if (music) {
      try {
        musicBuffer = await fetchBuffer(`./music/${music}.ogg`);
        if (musicWanted) startMusicNow();
      } catch {
        // No music.
      }
    }
  }

  function running() {
    return ctx && ctx.state === 'running';
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

  function startMusicNow() {
    if (!musicBuffer || musicSource || !settings.music) return;
    musicSource = ctx.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.loop = true;
    musicSource.connect(musicBus);
    musicSource.start();
    fadeMusic();
  }

  function fadeMusic(seconds = MUSIC_FADE) {
    if (!ctx) return;
    const target = musicWanted && settings.music ? (ducked ? musicVolume * 0.35 : musicVolume) : 0;
    const g = musicBus.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(target, now + seconds);
  }

  return {
    get ready() {
      return running();
    },
    get sfxOn() {
      return settings.sfx;
    },
    get musicOn() {
      return settings.music;
    },

    // Plays an effect once. volume 0..1, rate 1 = as recorded (2 = an octave
    // up and twice as fast), pan -1 (left) .. 1 (right), delay in seconds.
    play(name, { volume = 1, rate = 1, pan = 0, delay = 0 } = {}) {
      if (!settings.sfx || !running()) return;
      const buffer = buffers[name];
      if (!buffer || voices >= MAX_VOICES) return;
      const at = ctx.currentTime + delay;
      if (at - (lastStart[name] ?? -1) < MIN_GAP) return;
      lastStart[name] = at;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      let node = source;
      if (volume !== 1) {
        const gain = ctx.createGain();
        gain.gain.value = volume;
        node = node.connect(gain);
      }
      if (pan && ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        node = node.connect(panner);
      }
      node.connect(sfxBus);
      voices++;
      source.onended = () => voices--;
      source.start(at);
    },

    // A looping effect (an engine, wind). set(volume, rate) glides to the new
    // values; stop() fades it out. It starts silent once the sound is ready.
    loop(name, { volume = 1, rate = 1 } = {}) {
      let source = null;
      let gain = null;
      let want = { volume, rate };
      let sent = { volume: -1, rate: -1, at: 0 };
      const begin = () => {
        if (source || !ctx || !buffers[name] || !running()) return;
        source = ctx.createBufferSource();
        source.buffer = buffers[name];
        source.loop = true;
        source.playbackRate.value = want.rate;
        gain = ctx.createGain();
        gain.gain.value = 0;
        source.connect(gain).connect(sfxBus);
        source.start();
      };
      return {
        // Fine to call every frame: the audio thread only hears about a change
        // that is big enough, or a few times a second.
        set(v = want.volume, r = want.rate) {
          want.volume = v;
          want.rate = r;
          begin();
          if (!source) return;
          const now = ctx.currentTime;
          const dv = Math.abs(v - sent.volume);
          const dr = Math.abs(r - sent.rate) / Math.max(r, 0.01);
          if (dv < 0.005 && dr < 0.002) return;
          if (now - sent.at < 0.05 && dv < 0.1 && dr < 0.05) return;
          sent = { volume: v, rate: r, at: now };
          gain.gain.setTargetAtTime(v, now, 0.04);
          source.playbackRate.setTargetAtTime(r, now, 0.05);
        },
        stop(fade = 0.15) {
          if (!source) return;
          const s = source;
          const now = ctx.currentTime;
          gain.gain.cancelScheduledValues(now);
          gain.gain.setValueAtTime(gain.gain.value, now);
          gain.gain.linearRampToValueAtTime(0, now + fade);
          s.stop(now + fade + 0.02);
          source = null;
          gain = null;
          sent = { volume: -1, rate: -1, at: 0 };
        },
      };
    },

    // The game's music: on from here until stopMusic(). Fades in once it has
    // loaded and audio may play.
    startMusic() {
      if (!ctx) return;
      musicWanted = true;
      if (musicSource) fadeMusic();
      else startMusicNow();
    },
    stopMusic(fade = MUSIC_FADE) {
      if (!ctx) return;
      musicWanted = false;
      fadeMusic(fade);
    },
    // Quieter under a pause menu or a results screen.
    duck(on) {
      ducked = Boolean(on);
      fadeMusic(0.25);
    },

    setSfx(on) {
      settings.sfx = Boolean(on);
      hh.save('sound.sfx', settings.sfx);
      if (ctx) sfxBus.gain.setTargetAtTime(settings.sfx ? sfxVolume : 0, ctx.currentTime, 0.02);
    },
    setMusic(on) {
      settings.music = Boolean(on);
      hh.save('sound.music', settings.music);
      if (!ctx) return;
      if (settings.music && musicWanted) startMusicNow();
      fadeMusic(0.4);
    },
  };
}
