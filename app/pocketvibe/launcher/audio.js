// The launcher's sounds: 16 UI sound effects and the menu music, played with
// Web Audio through one AudioContext:
//
//   effect -> sfxGain ----------\
//                                masterGain -> speakers
//   music -> fade -> musicGain --/
//
// The effects are WAV files made by tools/sfx/make_sfx.py, all decoded into
// memory as the launcher starts. They are WAV because the handheld's WebKit
// decodes through GStreamer: a WAV takes about 60 ms there, an OGG about 1.5 s.
// The music is one OGG (2.1 MB; about 5 s to decode on the handheld and 38 MB
// once decoded), loaded in the background after the boot sound (back from a
// game, right after the effects). Its intro plays once, then the rest loops
// without a gap.
//
// Nothing here may break the launcher: without Web Audio, or when a file does
// not load or decode, it simply stays silent.

// boot comes first: the handheld decodes one file at a time, and boot plays first.
const SOUNDS = [
  'boot', 'nav_move', 'nav_scroll', 'nav_edge', 'confirm', 'back', 'error', 'tab_switch', 'menu_open',
  'menu_close', 'toggle_on', 'toggle_off', 'key_type', 'notification', 'save_done', 'launch_game',
];
// Moving the focus: a new one of these stops the one before, so fast or held
// presses never pile up.
const NAV = new Set(['nav_move', 'nav_scroll', 'nav_edge']);
const SAME_SOUND_GAP = 0.035; // s: the same sound never starts twice closer than this
const MUSIC = {
  url: 'music/menu_theme_full.ogg',
  // The 30.33 s intro plays once, then loopStart to loopEnd (the file's end)
  // loops. From the track's music.json, in samples at 48 kHz.
  loopStart: 1455840 / 48000,
  loopEnd: 4708204 / 48000,
};
const BOOT_WINDOW = 6000; // ms after the page loads that the boot sound may still play
const BOOT_TO_MUSIC = 2.3; // s from the boot sound to the music
const FADE_IN_OPEN = 1.5; // s, as the app opens or the music is switched on
const FADE_IN_RETURN = 1.2; // s, back from a game
const FADE_OUT = 0.8; // s, as a game starts or the music is switched off
const LAUNCH_DELAY = 0.14; // s from the confirm sound to launch_game

function createContext() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  try {
    return new Context({ latencyHint: 'interactive' });
  } catch {
    try {
      return new Context(); // an engine without the options
    } catch {
      return null;
    }
  }
}

// Glides an AudioParam from where it is now to `value`. The start is set
// explicitly: a ramp otherwise starts at the param's last scheduled event,
// which may be long past, and the level would jump.
function ramp(ctx, param, value, seconds) {
  const now = ctx.currentTime;
  const current = param.value;
  param.cancelScheduledValues(now);
  param.setValueAtTime(current, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

// A file beside this module. A request the busy local service drops is tried
// once more.
async function fetchFile(path) {
  const url = new URL(path, import.meta.url);
  const res = await fetch(url).catch(() => fetch(url));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.arrayBuffer();
}

// The audio calls that return promises can reject (the browser not allowing
// audio yet, say); none of that matters to the launcher.
function quietly(call) {
  try {
    call()?.catch?.(() => {});
  } catch {
    // Same.
  }
}

export class LauncherAudio {
  constructor() {
    this.soundsOn = true;
    this.sfxVolume = 0.8;
    this.musicOn = false;
    this.musicVolume = 0.8;
    this.sounds = {}; // name -> decoded effect
    this.started = {}; // name -> context time it last started
    this.navVoice = null;
    this.confirmedAt = -1;
    this.music = null; // the decoded track
    this.musicLoading = false;
    this.musicFailed = false;
    this.voice = null; // the music playing: { source, fade, timer }, never more than one
    this.musicAt = 0; // context time the music may start at
    this.fadeIn = FADE_IN_OPEN;
    this.introDone = false;
    this.paused = false; // suspended while the app is in the background
    this.ctx = createContext();
    if (!this.ctx) {
      this.loaded = Promise.resolve();
      return;
    }
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.masterGain);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.masterGain);
    this.loaded = this.loadSounds();
    document.addEventListener('visibilitychange', () => this.pause(document.hidden));
  }

  get running() {
    return this.ctx?.state === 'running';
  }

  // Every effect, decoded once. One file at a time: the handheld decodes one
  // at a time anyway, and the launcher's other requests are not crowded out.
  async loadSounds() {
    const begin = performance.now();
    for (const name of SOUNDS) {
      try {
        this.sounds[name] = await this.ctx.decodeAudioData(await fetchFile(`sounds/${name}.wav`));
      } catch {
        // This one stays silent.
      }
    }
    console.log(`PocketVibe sounds: ${Object.keys(this.sounds).length} ready in ${Math.round(performance.now() - begin)} ms`);
  }

  // Called on every key or button press. The browser starts audio only after
  // a press: a trusted key press or touch, or one it already saw.
  unlock(trusted = false) {
    if (!this.ctx || this.ctx.state !== 'suspended' || this.paused) return;
    // Nothing pressed yet: asking would only log a warning.
    if (!trusted && navigator.userActivation?.hasBeenActive === false) return;
    quietly(() => this.ctx.resume());
  }

  // The app went to the background, or came back: the audio clock stops
  // there and runs again on return.
  pause(hidden) {
    if (!this.ctx) return;
    if (hidden && this.ctx.state === 'running') {
      this.paused = true;
      quietly(() => this.ctx.suspend());
    } else if (!hidden && this.paused) {
      this.paused = false;
      quietly(() => this.ctx.resume());
    }
  }

  configure({ music, musicVolume = 0.8, uiSounds, sfxVolume = 0.8 }) {
    this.soundsOn = Boolean(uiSounds);
    this.sfxVolume = sfxVolume;
    this.musicVolume = musicVolume;
    if (!this.ctx) return;
    this.setLevel(this.sfxGain.gain, sfxVolume);
    this.setLevel(this.musicGain.gain, musicVolume);
    if (music && !this.musicOn) {
      this.musicOn = true;
      // Switched on in Settings. At startup, start() brings the music in.
      this.musicAt = 0;
      this.fadeIn = FADE_IN_OPEN;
      this.startMusic();
    } else if (!music && this.musicOn) {
      this.musicOn = false;
      this.fadeOutMusic(FADE_OUT);
    }
  }

  // A level change glides while audio plays, so it does not click.
  setLevel(param, value) {
    if (this.running) param.setTargetAtTime(value, this.ctx.currentTime, 0.02);
    else param.value = value;
  }

  // Plays an effect now, or at a later context time. Effects asked for while
  // audio cannot play are dropped, not saved up. Returns whether it played.
  play(name, when = 0) {
    const buffer = this.sounds[name];
    if (!buffer || !this.soundsOn || this.sfxVolume <= 0 || !this.running) return false;
    const at = Math.max(when, this.ctx.currentTime);
    if (Math.abs(at - (this.started[name] ?? -1)) < SAME_SOUND_GAP) return false;
    this.started[name] = at;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.sfxGain);
    if (NAV.has(name)) {
      quietly(() => this.navVoice?.stop(at));
      this.navVoice = source;
    }
    source.start(at);
    if (name === 'confirm') this.confirmedAt = at;
    return true;
  }

  // The launcher has drawn. Opened anew: the boot sound, then the music
  // 2.3 s later. Back from a game: no boot sound, and the music from its
  // start. Both wait until audio may play (the first key press).
  async start(returning) {
    if (!this.ctx) return;
    await this.loaded;
    if (returning && this.musicOn) this.loadMusic(); // nothing to wait for
    await new Promise((resolve) => {
      const check = () => {
        if (this.ctx.state !== 'running') return;
        this.ctx.removeEventListener('statechange', check);
        resolve();
      };
      this.ctx.addEventListener('statechange', check);
      check();
    });
    // Audio that only starts at a later press (on the website) skips the boot sound.
    const boot = !returning && performance.now() < BOOT_WINDOW && this.play('boot');
    this.musicAt = this.ctx.currentTime + (boot ? BOOT_TO_MUSIC : 0);
    this.fadeIn = returning ? FADE_IN_RETURN : FADE_IN_OPEN;
    this.introDone = true;
    this.startMusic();
  }

  // Decodes the music once, in the background, then starts it if it is still
  // wanted. If it cannot be decoded the menu stays quiet.
  loadMusic() {
    if (this.music || this.musicLoading || this.musicFailed) return;
    this.musicLoading = true;
    const begin = performance.now();
    fetchFile(MUSIC.url)
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        console.log(`PocketVibe music ready in ${Math.round(performance.now() - begin)} ms`);
        this.musicLoading = false;
        if (!this.musicOn) return; // switched off meanwhile
        this.music = buffer;
        this.startMusic();
      })
      .catch((e) => {
        console.log(`PocketVibe music could not be loaded: ${e?.message ?? e}`);
        this.musicLoading = false;
        this.musicFailed = true;
      });
  }

  // Fades the music in from its start, loading it first if need be. Switched
  // back on while it fades out, the same voice comes back instead.
  startMusic() {
    if (!this.musicOn || !this.introDone) return;
    if (!this.music) {
      this.loadMusic(); // which comes back here
      return;
    }
    if (this.voice) {
      if (!this.voice.timer) return; // playing already
      clearTimeout(this.voice.timer);
      this.voice.timer = 0;
      ramp(this.ctx, this.voice.fade.gain, 1, this.fadeIn);
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.music;
    source.loop = true;
    source.loopStart = MUSIC.loopStart;
    source.loopEnd = MUSIC.loopEnd;
    const fade = this.ctx.createGain();
    const at = Math.max(this.musicAt, this.ctx.currentTime);
    fade.gain.value = 0;
    fade.gain.setValueAtTime(0, at);
    fade.gain.linearRampToValueAtTime(1, at + this.fadeIn);
    source.connect(fade).connect(this.musicGain);
    source.start(at);
    this.voice = { source, fade, timer: 0 };
  }

  // Fades the music out, then stops it.
  fadeOutMusic(seconds) {
    const voice = this.voice;
    if (!voice || voice.timer) return;
    ramp(this.ctx, voice.fade.gain, 0, seconds);
    voice.timer = setTimeout(() => {
      quietly(() => voice.source.stop());
      voice.source.disconnect();
      if (this.voice === voice) this.voice = null;
      if (!this.musicOn) this.music = null; // off for good: let the 38 MB go
    }, seconds * 1000 + 50);
  }

  // A game starts: launch_game 140 ms after the confirm sound, the music
  // fading out from then. Resolves when the page can go to the game.
  launch() {
    if (!this.running) return Promise.resolve();
    const now = this.ctx.currentTime;
    const at = Math.max(now, this.confirmedAt + LAUNCH_DELAY);
    const sound = this.play('launch_game', at);
    if (!sound && !this.voice) return Promise.resolve();
    const wait = (at - now) * 1000;
    return new Promise((resolve) => {
      setTimeout(() => this.fadeOutMusic(FADE_OUT), wait);
      // The page goes in the middle of launch_game: take everything out over
      // the last 50 ms rather than with a click.
      setTimeout(() => ramp(this.ctx, this.masterGain.gain, 0, 0.05), wait + (FADE_OUT - 0.05) * 1000);
      setTimeout(resolve, wait + FADE_OUT * 1000);
    });
  }
}
