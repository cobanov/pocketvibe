"""Procedural UI sound set for the PocketVibe launcher.

Every tonal sound is drawn from D major so any combination stays consonant.
Run: python3 tools/sfx/make_sfx.py  -> app/pocketvibe/launcher/sounds/*.wav
(manifest.json beside this file is hand-curated and not written by it).
"""
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
OUT = Path(__file__).resolve().parents[2] / "app" / "pocketvibe" / "launcher" / "sounds"
RNG = np.random.default_rng(7)


def note(name: str) -> float:
    semis = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((semis[pitch] + 12 * (octave + 1) - 69) / 12)


def t_axis(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def env(dur: float, attack: float, decay: float) -> np.ndarray:
    """Linear attack, exponential decay (decay = time to -60 dB)."""
    t = t_axis(dur)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-6.9 * np.clip(t - attack, 0, None) / decay)
    return a * d


def glass(freq: float, dur: float, decay: float, bright: float = 1.0) -> np.ndarray:
    """Glassy mallet: fundamental plus inharmonic partials that die faster."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, amp, dk in ((1.0, 1.0, 1.0), (2.76, 0.35 * bright, 0.45), (5.40, 0.18 * bright, 0.25), (8.93, 0.06 * bright, 0.12)):
        if freq * ratio < SR / 2.2:
            out += amp * np.sin(2 * np.pi * freq * ratio * t) * env(dur, 0.0015, decay * dk)
    return out


def fm_bell(freq: float, dur: float, decay: float, index: float = 2.5, ratio: float = 3.5) -> np.ndarray:
    t = t_axis(dur)
    mod_env = env(dur, 0.001, decay * 0.4)
    mod = index * mod_env * np.sin(2 * np.pi * freq * ratio * t)
    return np.sin(2 * np.pi * freq * t + mod) * env(dur, 0.002, decay)


def soft_tone(freq: float, dur: float, attack: float, decay: float, odd: float = 0.0) -> np.ndarray:
    t = t_axis(dur)
    wave = np.sin(2 * np.pi * freq * t) + odd * np.sin(2 * np.pi * 3 * freq * t) / 3 + odd * 0.5 * np.sin(2 * np.pi * 5 * freq * t) / 5
    return wave * env(dur, attack, decay)


def glide(f0: float, f1: float, dur: float, attack: float, decay: float, curve: float = 1.0) -> np.ndarray:
    t = t_axis(dur)
    x = (t / dur) ** curve
    freq = f0 * (f1 / f0) ** x
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(phase) * env(dur, attack, decay)


def noise(dur: float) -> np.ndarray:
    return RNG.standard_normal(int(dur * SR))


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, cutoff, btype="low", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def highpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = signal.butter(order, cutoff, btype="high", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def sweep_noise(dur: float, f0: float, f1: float, attack: float, decay: float) -> np.ndarray:
    """Noise through a band-pass whose centre glides f0 -> f1 (processed in short blocks)."""
    x = noise(dur)
    out = np.zeros_like(x)
    block = 256
    centres = np.geomspace(f0, f1, int(np.ceil(len(x) / block)))
    zi = None
    for i, c in enumerate(centres):
        sos = signal.butter(2, [c / 1.4, min(c * 1.4, SR / 2.1)], btype="band", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        seg = slice(i * block, (i + 1) * block)
        out[seg], zi = signal.sosfilt(sos, x[seg], zi=zi)
    return out * env(dur, attack, decay)


def place(*parts: tuple[float, np.ndarray]) -> np.ndarray:
    """Mix mono parts at given start times (seconds)."""
    length = max(int(start * SR) + len(p) for start, p in parts)
    out = np.zeros(length)
    for start, p in parts:
        i = int(start * SR)
        out[i:i + len(p)] += p
    return out


def _reverb_ir(seconds: float, damping: float) -> np.ndarray:
    t = t_axis(seconds)
    ir = np.stack([RNG.standard_normal(len(t)), RNG.standard_normal(len(t))], axis=1)
    ir *= np.exp(-6.9 * t / seconds)[:, None]
    ir = signal.sosfilt(signal.butter(1, damping, btype="low", fs=SR, output="sos"), ir, axis=0)
    ir[: int(0.008 * SR)] = 0  # short pre-delay keeps the dry transient crisp
    return ir / np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))


IR_ROOM = _reverb_ir(0.45, 6000)
IR_HALL = _reverb_ir(1.6, 5000)


def finish(mono: np.ndarray, peak_db: float, wet: float = 0.0, ir: np.ndarray = IR_ROOM, width: float = 0.0) -> np.ndarray:
    """Stereo, optional reverb, DC/rumble cut, fades, peak-normalise."""
    dry = np.stack([mono, mono], axis=1)
    if width:
        delay = int(0.0004 * SR)
        dry[:, 1] = np.concatenate([np.zeros(delay), mono[:-delay]]) * (1 - width) + mono * width
    if wet:
        tail = len(ir)
        padded = np.concatenate([dry, np.zeros((tail, 2))])
        rev = np.stack([signal.fftconvolve(padded[:, c], ir[:, c])[: len(padded)] for c in range(2)], axis=1)
        out = padded + wet * rev * (np.max(np.abs(dry)) / (np.max(np.abs(rev)) + 1e-9))
    else:
        out = dry
    out = highpass(out.T, 60).T
    # Trim trailing silence below -70 dB, then a short fade so nothing clicks.
    level = np.max(np.abs(out), axis=1)
    above = np.nonzero(level > np.max(level) * 10 ** (-70 / 20))[0]
    out = out[: above[-1] + 1]
    fade_in, fade_out = int(0.0008 * SR), min(int(0.02 * SR), len(out) // 4)
    out[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    out[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    return out / np.max(np.abs(out)) * 10 ** (peak_db / 20)


# --------------------------------------------------------------------------- sounds

def nav_move():
    tick = glass(note("A6"), 0.09, 0.05, bright=0.6)
    click = bandpass(noise(0.012), 3000, 7000) * env(0.012, 0.0005, 0.006) * 0.25
    return finish(place((0, tick), (0, click)), -15, wet=0.10)


def nav_scroll():
    """Lighter tick for auto-repeat / fast scrolling so held d-pad isn't fatiguing."""
    tick = glass(note("D7"), 0.05, 0.03, bright=0.4)
    return finish(tick, -20, wet=0.05)


def nav_edge():
    thud = glide(190, 120, 0.09, 0.002, 0.07)
    knock = lowpass(noise(0.03), 900) * env(0.03, 0.001, 0.02) * 0.4
    return finish(place((0, thud), (0, knock)), -18)


def confirm():
    a = glass(note("A5"), 0.5, 0.30)
    b = glass(note("D6"), 0.6, 0.38)
    return finish(place((0, a * 0.8), (0.055, b)), -6, wet=0.18, width=0.3)


def back():
    a = glass(note("D6"), 0.35, 0.18, bright=0.6)
    b = glass(note("A5"), 0.4, 0.22, bright=0.5)
    return finish(lowpass(place((0, a * 0.8), (0.05, b)), 5000), -9, wet=0.12, width=0.3)


def error():
    def buzz(f):
        return soft_tone(f, 0.12, 0.003, 0.09, odd=0.6) + 0.5 * soft_tone(f * 1.012, 0.12, 0.003, 0.09, odd=0.6)
    x = place((0, buzz(note("D#4"))), (0.11, buzz(note("D4"))))
    return finish(lowpass(x, 3500), -7, wet=0.08)


def tab_switch():
    swish = sweep_noise(0.11, 1200, 6000, 0.03, 0.08) * 0.5
    tick = glass(note("E6"), 0.15, 0.08, bright=0.5)
    return finish(place((0, swish), (0.045, tick)), -9, wet=0.10, width=0.5)


def menu_open():
    sweep = glide(note("D5"), note("D6"), 0.22, 0.06, 0.25, curve=0.6)
    shimmer = glass(note("A6"), 0.4, 0.25, bright=0.4) * 0.35
    air = sweep_noise(0.2, 800, 5000, 0.08, 0.15) * 0.15
    return finish(place((0, sweep), (0, air), (0.12, shimmer)), -10, wet=0.2, width=0.4)


def menu_close():
    sweep = glide(note("D6"), note("D5"), 0.18, 0.01, 0.18, curve=0.6)
    air = sweep_noise(0.16, 5000, 800, 0.01, 0.12) * 0.15
    return finish(place((0, sweep), (0, air)), -11, wet=0.15, width=0.4)


def toggle_on():
    return finish(place((0, glass(note("F#6"), 0.12, 0.07, 0.5)), (0.045, glass(note("A6"), 0.18, 0.1, 0.5))), -11, wet=0.08)


def toggle_off():
    return finish(lowpass(place((0, glass(note("A6"), 0.12, 0.07, 0.4)), (0.045, glass(note("F#6"), 0.16, 0.09, 0.4))), 5500), -13, wet=0.06)


def key_type():
    click = bandpass(noise(0.02), 1800, 5000) * env(0.02, 0.0005, 0.012)
    body = glass(note("D6"), 0.04, 0.02, 0.3) * 0.5
    return finish(place((0, click), (0, body)), -18)


def notification():
    notes = [("D6", 0.0), ("F#6", 0.09), ("A6", 0.18)]
    parts = [(start, fm_bell(note(n), 1.0, 0.7, index=1.6) * (0.75 + 0.1 * i)) for i, (n, start) in enumerate(notes)]
    return finish(place(*parts), -6, wet=0.22, ir=IR_HALL, width=0.4)


def save_done():
    a = glass(note("A5"), 0.4, 0.25)
    b = glass(note("E6"), 0.6, 0.4)
    sparkle = place(*[(0.12 + 0.03 * i, glass(note(n), 0.25, 0.12, 0.3) * 0.25) for i, n in enumerate(["A6", "D7", "F#7"])])
    return finish(place((0, a * 0.8), (0.07, b), (0, sparkle)), -7, wet=0.2, width=0.3)


def launch_game():
    arp = ["D5", "F#5", "A5", "D6", "F#6", "A6", "D7"]
    parts = [(0.045 * i, glass(note(n), 0.9, 0.55, bright=0.7) * (0.6 + 0.06 * i)) for i, n in enumerate(arp)]
    whoosh = sweep_noise(0.45, 400, 9000, 0.3, 0.2) * 0.35
    swell = glide(note("D3"), note("D4"), 0.6, 0.25, 0.5, curve=0.5) * 0.5
    final = fm_bell(note("D6"), 1.4, 1.1, index=1.2) * 0.7 + fm_bell(note("A6"), 1.4, 1.0, index=1.0) * 0.5
    return finish(place(*parts, (0, whoosh), (0, swell), (0.34, final)), -3, wet=0.28, ir=IR_HALL, width=0.5)


def boot():
    t_pad = 3.2
    t = t_axis(t_pad)
    pad = np.zeros_like(t)
    for n in ["D3", "A3", "E4", "F#4", "C#5"]:  # Dmaj9 voicing
        for detune in (-0.07, 0.0, 0.07):
            f = note(n) * 2 ** (detune / 12)
            pad += signal.sawtooth(2 * np.pi * f * t + RNG.uniform(0, 6.28)) / 3
    sweep_cut = np.geomspace(400, 3500, len(t))
    pad_f = np.zeros_like(pad)
    zi = np.zeros((1, 2))
    for i in range(0, len(t), 512):
        sos = signal.butter(2, sweep_cut[i], btype="low", fs=SR, output="sos")
        pad_f[i:i + 512], zi = signal.sosfilt(sos, pad[i:i + 512], zi=zi)
    pad_env = np.clip(t / 1.1, 0, 1) ** 2 * np.exp(-np.clip(t - 1.6, 0, None) * 2.2)
    pad = pad_f * pad_env * 0.25
    sparkle = [(0.55 + 0.07 * i, glass(note(n), 1.2, 0.8, 0.6) * 0.35) for i, n in enumerate(["A5", "D6", "E6", "F#6", "A6", "D7"])]
    chord = [(1.25, fm_bell(note(n), 2.2, 1.9, index=1.0) * 0.45) for n in ["D5", "F#5", "A5", "E6"]]
    sub = glide(note("D2"), note("D2"), 2.4, 1.0, 1.4) * 0.35
    return finish(place((0, pad), (0, sub), *sparkle, *chord), -2, wet=0.35, ir=IR_HALL, width=0.6)


SOUNDS = {
    "nav_move": (nav_move, "Cursor moves to another item"),
    "nav_scroll": (nav_scroll, "Lighter tick for held/auto-repeat scrolling"),
    "nav_edge": (nav_edge, "Cursor hits the end of a list (can't move)"),
    "confirm": (confirm, "Select / OK / A button"),
    "back": (back, "Back / cancel / B button"),
    "error": (error, "Not allowed / failed action"),
    "tab_switch": (tab_switch, "Switch tab or category (L/R shoulder)"),
    "menu_open": (menu_open, "Open a menu, panel or popup"),
    "menu_close": (menu_close, "Close a menu, panel or popup"),
    "toggle_on": (toggle_on, "Setting switched on"),
    "toggle_off": (toggle_off, "Setting switched off"),
    "key_type": (key_type, "On-screen keyboard key press"),
    "notification": (notification, "Toast / notification appears"),
    "save_done": (save_done, "Save or download finished"),
    "launch_game": (launch_game, "Game starts launching"),
    "boot": (boot, "App startup sting, before menu music"),
}


def main() -> None:
    # WAV only: the handheld's WebKit decodes a WAV in about 60 ms and an OGG
    # in about 1.5 s, so the launcher ships no compressed copies.
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (fn, desc) in SOUNDS.items():
        audio = fn()
        sf.write(OUT / f"{name}.wav", audio, SR, subtype="PCM_16")
        print(f"{name:14s} {len(audio) / SR:5.2f}s  {desc}")


if __name__ == "__main__":
    main()
