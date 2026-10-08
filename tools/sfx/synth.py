"""Building blocks for the games' sound effects (tools/sfx/games/<id>.py).

Every effect is synthesised here from oscillators, noise and filters: nothing
recorded, nothing to license, and an unchanged recipe writes the same files
byte for byte (the noise is seeded). Effects are written as 48 kHz, 16-bit
mono WAV: the handheld decodes a WAV in about 60 ms, and mono halves the size;
sound.js pans in the game when a sound needs a side.

A recipe module looks like:

    from synth import *
    SOUNDS = {}

    @sound(SOUNDS, peak=-6)
    def jump():
        return glide(220, 660, 0.18, wave='square', duty=0.25) * env(0.18, 0.002, 0.15)

    if __name__ == '__main__':
        write_all(SOUNDS, 'jet-rush')

Run it with:
    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/<id>.py
"""
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
REPO = Path(__file__).resolve().parents[1].parent
_rng = np.random.default_rng(1)


def seed(n: int) -> None:
    """Reset the noise so each effect is the same whatever runs before it."""
    global _rng
    _rng = np.random.default_rng(n)


# ---------------------------------------------------------------- basics

def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(round(dur * SR))) / SR


def note(name: str) -> float:
    """'A4' -> 440.0, 'C#5' -> 554.4"""
    semis = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((semis[pitch] + 12 * (octave + 1) - 69) / 12)


def semis(freq: float, n: float) -> float:
    return freq * 2 ** (n / 12)


def env(dur: float, attack: float = 0.002, decay: float = 0.2, hold: float = 0.0, curve: float = 6.9) -> np.ndarray:
    """Linear attack, optional hold, exponential decay (decay = time to -60 dB)."""
    t = t_axis(dur)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-curve * np.clip(t - attack - hold, 0, None) / max(decay, 1e-4))
    return a * d


def adsr(dur: float, attack: float, decay: float, sustain: float, release: float) -> np.ndarray:
    """Attack, decay to sustain level, release over the last `release` seconds."""
    t = t_axis(dur)
    out = np.where(t < attack, t / max(attack, 1e-4), sustain + (1 - sustain) * np.exp(-5 * (t - attack) / max(decay, 1e-4)))
    rel_start = dur - release
    out = np.where(t > rel_start, out * np.clip((dur - t) / max(release, 1e-4), 0, 1), out)
    return out


def ramp(dur: float, v0: float, v1: float, curve: float = 1.0) -> np.ndarray:
    """A value going from v0 to v1 over dur (curve > 1 starts slow)."""
    x = t_axis(dur) / dur
    return v0 + (v1 - v0) * x ** curve


def expramp(dur: float, v0: float, v1: float, curve: float = 1.0) -> np.ndarray:
    """Exponential glide, for pitch: the same musical speed all the way."""
    x = (t_axis(dur) / dur) ** curve
    return v0 * (v1 / v0) ** x


# ---------------------------------------------------------------- oscillators

def _band_limited(phase: np.ndarray, freq: np.ndarray, kind: str, duty: float) -> np.ndarray:
    """Additive saw / square / pulse / triangle with only the harmonics under
    Nyquist, so high notes and fast sweeps do not alias into hiss."""
    out = np.zeros_like(phase)
    top = SR / 2.2
    fmin = max(float(np.min(freq)), 20.0)
    n_max = int(top // fmin)
    for k in range(1, min(n_max, 120) + 1):
        mask = (freq * k) < top
        if not mask.any():
            break
        if kind == "saw":
            amp = (-1) ** (k + 1) / k
            out += mask * amp * np.sin(k * phase)
        elif kind == "square":
            if k % 2:
                out += mask * np.sin(k * phase) / k
        elif kind == "triangle":
            if k % 2:
                out += mask * ((-1) ** ((k - 1) // 2)) * np.sin(k * phase) / (k * k)
        elif kind == "pulse":
            out += mask * (np.sin(np.pi * k * duty) / k) * np.cos(k * phase)
    scale = {"saw": 2 / np.pi, "square": 4 / np.pi, "triangle": 8 / np.pi ** 2, "pulse": 2 / np.pi}[kind]
    return out * scale


def osc(freq, dur: float, wave: str = "sine", duty: float = 0.5, phase0: float = 0.0) -> np.ndarray:
    """freq is a number or an array (a pitch curve) of the same length.
    wave: sine, square, saw, triangle, pulse (duty 0..1), noise."""
    n = int(round(dur * SR))
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, dtype=float)[:n]
    if len(f) < n:
        f = np.concatenate([f, np.full(n - len(f), f[-1])])
    phase = 2 * np.pi * np.cumsum(f) / SR + phase0
    if wave == "sine":
        return np.sin(phase)
    if wave == "noise":
        return noise(dur)
    return _band_limited(phase, f, wave, duty)


def glide(f0: float, f1: float, dur: float, wave: str = "sine", duty: float = 0.5, curve: float = 1.0) -> np.ndarray:
    return osc(expramp(dur, f0, f1, curve), dur, wave, duty)


def vibrato(base, dur: float, rate: float, depth_semis: float) -> np.ndarray:
    """A pitch curve wobbling around base (a number or a curve)."""
    t = t_axis(dur)
    b = np.full(len(t), float(base)) if np.isscalar(base) else np.asarray(base)[: len(t)]
    return b * 2 ** (depth_semis * np.sin(2 * np.pi * rate * t) / 12)


def fm(carrier: float, ratio: float, index, dur: float) -> np.ndarray:
    """Two-operator FM: bells, metal, zaps. index may be a curve."""
    t = t_axis(dur)
    idx = np.full(len(t), float(index)) if np.isscalar(index) else np.asarray(index)[: len(t)]
    return np.sin(2 * np.pi * carrier * t + idx * np.sin(2 * np.pi * carrier * ratio * t))


def noise(dur: float, color: str = "white") -> np.ndarray:
    x = _rng.standard_normal(int(round(dur * SR)))
    if color == "pink":
        b, a = [0.049922035, -0.095993537, 0.050612699, -0.004408786], [1, -2.494956002, 2.017265875, -0.522189400]
        x = signal.lfilter(b, a, x) * 3.5
    elif color == "brown":
        x = np.cumsum(x)
        x = signal.sosfilt(signal.butter(1, 20, "high", fs=SR, output="sos"), x)
        x /= np.max(np.abs(x)) + 1e-9
    return x


def crackle(dur: float, density: float, decay: float = 0.004) -> np.ndarray:
    """Sparse random clicks (fire, gravel, debris). density = clicks per second."""
    n = int(round(dur * SR))
    out = np.zeros(n)
    count = int(density * dur)
    for i in _rng.integers(0, n, count):
        length = int(decay * SR * 4)
        seg = _rng.standard_normal(length) * np.exp(-np.arange(length) / (decay * SR))
        end = min(n, i + length)
        out[i:end] += seg[: end - i] * _rng.uniform(0.3, 1.0)
    return out


# ---------------------------------------------------------------- filters

def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, min(cutoff, SR / 2.1), "low", fs=SR, output="sos"), x)


def highpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, cutoff, "high", fs=SR, output="sos"), x)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, [lo, min(hi, SR / 2.1)], "band", fs=SR, output="sos"), x)


def sweep_filter(x: np.ndarray, f0: float, f1: float, kind: str = "low", q: float = 1.4, block: int = 128) -> np.ndarray:
    """A filter whose cutoff (or band centre) glides f0 -> f1 across x."""
    out = np.zeros_like(x)
    centres = np.geomspace(f0, f1, int(np.ceil(len(x) / block)))
    zi = None
    for i, c in enumerate(centres):
        if kind == "band":
            sos = signal.butter(2, [c / q, min(c * q, SR / 2.1)], "band", fs=SR, output="sos")
        else:
            sos = signal.butter(2, min(c, SR / 2.1), kind, fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        seg = slice(i * block, (i + 1) * block)
        out[seg], zi = signal.sosfilt(sos, x[seg], zi=zi)
    return out


def drive(x: np.ndarray, amount: float = 2.0) -> np.ndarray:
    """Soft saturation: warmth at 1-2, grit at 4+."""
    return np.tanh(x * amount) / np.tanh(amount)


def crush(x: np.ndarray, bits: int = 6, rate: int = 11025) -> np.ndarray:
    """Bit and sample-rate reduction, for a retro edge."""
    step = max(1, int(SR / rate))
    held = np.repeat(x[::step], step)[: len(x)]
    levels = 2 ** (bits - 1)
    return np.round(held * levels) / levels


def echo(x: np.ndarray, delay: float, feedback: float = 0.35, repeats: int = 4) -> np.ndarray:
    d = int(delay * SR)
    out = np.concatenate([x, np.zeros(d * repeats)])
    for r in range(1, repeats + 1):
        out[d * r: d * r + len(x)] += x * feedback ** r
    return out


def _reverb_ir(seconds: float, damping: float, rng_seed: int) -> np.ndarray:
    rng = np.random.default_rng(rng_seed)
    t = t_axis(seconds)
    ir = rng.standard_normal(len(t)) * np.exp(-6.9 * t / seconds)
    ir = signal.sosfilt(signal.butter(1, damping, "low", fs=SR, output="sos"), ir)
    ir[: int(0.006 * SR)] = 0
    return ir / np.sqrt(np.sum(ir ** 2))


IR_SMALL = _reverb_ir(0.35, 6000, 11)
IR_ROOM = _reverb_ir(0.8, 5000, 12)
IR_HALL = _reverb_ir(1.8, 4000, 13)


def reverb(x: np.ndarray, wet: float = 0.2, ir: np.ndarray = IR_ROOM) -> np.ndarray:
    padded = np.concatenate([x, np.zeros(len(ir))])
    rev = signal.fftconvolve(padded, ir)[: len(padded)]
    rev *= np.max(np.abs(x)) / (np.max(np.abs(rev)) + 1e-9)
    return padded + wet * rev


# ---------------------------------------------------------------- arranging

def place(*parts) -> np.ndarray:
    """Mix (start_seconds, samples) parts into one."""
    length = max(int(round(start * SR)) + len(p) for start, p in parts)
    out = np.zeros(length)
    for start, p in parts:
        i = int(round(start * SR))
        out[i: i + len(p)] += p
    return out


def seq(notes, step: float, voice) -> np.ndarray:
    """An arpeggio or jingle: voice(freq, index) -> samples, one every `step` s."""
    return place(*[(i * step, voice(f, i)) for i, f in enumerate(notes)])


def pad(x: np.ndarray, dur: float) -> np.ndarray:
    n = int(round(dur * SR))
    return x[:n] if len(x) >= n else np.concatenate([x, np.zeros(n - len(x))])


def loopable(x: np.ndarray, fade: float = 0.05) -> np.ndarray:
    """Make x loop without a click: its last `fade` seconds are crossfaded
    into its start, and the result is that much shorter."""
    f = int(fade * SR)
    body = x[: len(x) - f].copy()
    w = np.sin(np.linspace(0, np.pi / 2, f)) ** 2
    body[:f] = x[:f] * w + x[len(x) - f:] * (1 - w)
    return body


# ---------------------------------------------------------------- writing

def sound(registry: dict, peak: float = -6.0, loop: bool = False, seed_n: int | None = None):
    """Registers a recipe. peak in dBFS: frequent sounds quieter (-14..-10),
    big one-shots louder (-4..-2). loop=True keeps the ends untouched."""
    def wrap(fn):
        registry[fn.__name__] = (fn, peak, loop, seed_n if seed_n is not None else len(registry) + 1)
        return fn
    return wrap


def _finish(x: np.ndarray, peak_db: float, loop: bool) -> np.ndarray:
    x = np.asarray(x, dtype=float)
    x = x - np.mean(x) if loop else highpass(x, 35)
    if not loop:
        # Trim the silent tail, then fade so nothing clicks.
        level = np.abs(x)
        above = np.nonzero(level > np.max(level) * 10 ** (-66 / 20))[0]
        if len(above):
            x = x[: above[-1] + 1]
        f = min(len(x) // 4, int(0.006 * SR))
        if f:
            x[-f:] *= np.linspace(1, 0, f)
        a = min(len(x) // 8, int(0.0008 * SR))
        if a:
            x[:a] *= np.linspace(0, 1, a)
    return x * (10 ** (peak_db / 20) / (np.max(np.abs(x)) + 1e-12))


def write_all(registry: dict, game_id: str, only: list[str] | None = None) -> None:
    out = REPO / "games" / game_id / "public" / "sfx"
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, (fn, peak, loop, n) in registry.items():
        if only and name not in only:
            continue
        seed(n)
        data = _finish(fn(), peak, loop)
        path = out / f"{name}.wav"
        sf.write(path, data.astype(np.float32), SR, subtype="PCM_16")
        total += path.stat().st_size
        print(f"{name:20s} {len(data) / SR:5.2f} s  {path.stat().st_size // 1024:4d} KB")
    print(f"{len(registry)} sounds, {total // 1024} KB -> {out.relative_to(REPO)}")
