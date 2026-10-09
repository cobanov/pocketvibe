"""Block Drop's sound effects: clean electronic plucks, glassy bells and
filtered noise, to sit with energetic, focused electronic puzzle music in
B minor at 124 BPM.

Tonal sounds use B natural minor (B C# D E F# G A); jingles move in 16ths of
the music's tempo. The piece sounds (shift, soft, rotate, lock) play many
times a minute, so they are short, quiet and mostly above 300 Hz. Line clears
grow with the rows: one note for a single, two for a double, a triad for a
triple and a full chord with a burst for a quad. The combo blip is one note
(B5) that the game raises along B minor with playback rate for every clear in
a row, so it has only soft harmonic partials (it is played up to a twelfth
higher). The danger heartbeat is a seamless loop the game fades in as the
stack nears the top.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/block-drop.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 124
BEAT = 60 / BPM
S16 = BEAT / 4  # a 16th note, s

B2, F3, B3 = note("B2"), note("F#3"), note("B3")
B4, Cs5, D5, E5, Fs5, G5, A5 = (note(n) for n in ("B4", "C#5", "D5", "E5", "F#5", "G5", "A5"))
B5, Cs6, D6, E6, Fs6, A6, B6 = (note(n) for n in ("B5", "C#6", "D6", "E6", "F#6", "A6", "B6"))
D4, Fs4, A4 = note("D4"), note("F#4"), note("A4")


# ---------------------------------------------------------------- voices

def bell(freq, dur, decay, bright=1.0):
    """A glassy bell: harmonic partials only, the upper ones dying first, so
    it stays in tune when the game raises its pitch."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, amp, dk in ((1, 1.0, 1.0), (2, 0.35 * bright, 0.45), (3, 0.12 * bright, 0.25), (4, 0.05 * bright, 0.15)):
        if freq * ratio < 8000:
            out += amp * np.sin(2 * np.pi * freq * ratio * t) * env(dur, 0.0015, decay * dk)
    return out


def pluck(freq, dur, decay, bright=1.0):
    """The electronic pluck: a saw and a detuned saw through a lowpass that
    snaps shut, like a synth arpeggio."""
    x = osc(freq, dur, "saw") + 0.6 * osc(freq * 1.006, dur, "saw")
    x = sweep_filter(x, min(7000, freq * 8 * bright), max(300, freq * 1.2), "low", block=64)
    return x * env(dur, 0.002, decay)


def chip(freq, dur, decay, duty=0.25):
    """A soft pulse-wave note for the menus."""
    return lowpass(osc(freq, dur, "pulse", duty) * env(dur, 0.002, decay), 5000)


def epiano(freq, dur, decay):
    """A round electric piano: FM whose bark fades quickly."""
    idx = 1.0 * env(dur, 0.001, decay * 0.3) + 0.1
    return lowpass(fm(freq, 1.0, idx, dur) * env(dur, 0.005, decay), 4500)


def click(dur=0.01, lo=1500, hi=6000):
    return bandpass(noise(dur), lo, hi) * env(dur, 0.0003, dur)


def chord(freqs, dur, decay, voice=bell, spread=0.0, **kw):
    """Several notes together (spread staggers them like a strum)."""
    return place(*[(i * spread, voice(f, dur, decay, **kw)) for i, f in enumerate(freqs)])


def run(freqs, step, voice):
    """An arpeggio: voice(freq, index) -> samples, one every step seconds."""
    return seq(freqs, step, voice)


# ---------------------------------------------------------------- the piece

@sound(SOUNDS, peak=-17)
def shift():
    """A sideways move: a tiny dry tick with a hint of B6 (it repeats fast
    while the D-pad is held, so it is very short)."""
    d = 0.03
    tick = click(0.012, 2200, 6500)
    tone = np.sin(2 * np.pi * B6 * t_axis(d)) * env(d, 0.0005, 0.018) * 0.5
    return pad(tick, d) + tone


@sound(SOUNDS, peak=-20)
def soft():
    """Soft drop, a row at a time: a muted low tick."""
    d = 0.03
    body = np.sin(2 * np.pi * Fs5 * t_axis(d)) * env(d, 0.0005, 0.02)
    return lowpass(body + pad(click(0.008, 900, 3000), d) * 0.5, 3500)


@sound(SOUNDS, peak=-14)
def rotate():
    """A turn: a quick upward flick, F#5 to B5, with an airy swish."""
    d = 0.09
    flick = osc(expramp(d, Fs5, B5, 0.4), d, "triangle") * env(d, 0.001, 0.06)
    swish = sweep_filter(noise(d), 1800, 5000, "band", q=1.6) * env(d, 0.004, 0.05) * 0.35
    return lowpass(flick + swish, 7000)


@sound(SOUNDS, peak=-13)
def twist():
    """The T is in a T-spin slot: a short metallic tink on F#6."""
    d = 0.18
    tink = fm(Fs6, 3.5, 2.2 * env(d, 0.0005, 0.05), d) * env(d, 0.001, 0.13)
    return lowpass(tink + bell(B6, d, 0.08, 0.3) * 0.4, 7500)


@sound(SOUNDS, peak=-14)
def lock():
    """A piece settles: a soft click and a short woody knock on B4 and F#5."""
    d = 0.12
    knock = bandpass(noise(d), 500, 2400) * env(d, 0.0004, 0.025)
    tone = (np.sin(2 * np.pi * B4 * t_axis(d)) * 0.6 + np.sin(2 * np.pi * Fs5 * t_axis(d)) * 0.3) * env(d, 0.001, 0.06)
    return lowpass(knock * 1.2 + tone, 5000)


@sound(SOUNDS, peak=-8)
def drop():
    """Hard drop: a fast falling whoosh slammed into a thud (B2 body for big
    speakers, a B3 knock and a crack for the handheld's small one)."""
    w = 0.06
    whoosh = sweep_filter(noise(w, "pink"), 5000, 900, "band", q=1.5) * ramp(w, 0.2, 1.0, 1.5)
    d = 0.32
    body = osc(expramp(d, 220, B2, 0.35), d) * env(d, 0.001, 0.18)
    knock = osc(expramp(d, B3 * 1.5, B3, 0.2), d, "triangle") * env(d, 0.001, 0.1)
    knock += np.sin(2 * np.pi * B4 * t_axis(d)) * env(d, 0.001, 0.05) * 0.5
    thock = bandpass(noise(d), 250, 900) * env(d, 0.0005, 0.06)
    crack = bandpass(noise(d), 900, 3500) * env(d, 0.0003, 0.03)
    slam = lowpass(body * 0.35 + knock * 1.0 + thock * 0.8 + crack * 0.9, 4000)
    return place((0, whoosh * 0.5), (w, slam))


@sound(SOUNDS, peak=-13)
def hold():
    """Hold: a quick swap, a breath of air down and up with D5 then F#5."""
    d = 0.22
    air = sweep_filter(noise(d, "pink"), 3000, 900, "band", q=1.5) * env(d, 0.01, 0.12) * 0.5
    a = pluck(D5, 0.12, 0.08, 0.6)
    b = pluck(Fs5, 0.16, 0.1, 0.6)
    return lowpass(place((0, air), (0.01, a * 0.8), (0.06, b * 0.8)), 6500)


@sound(SOUNDS, peak=-14)
def deny():
    """Hold already used for this piece: a dull double buzz."""
    d = 0.07
    buzz = lowpass(osc(F3 * 2, d, "square") * env(d, 0.002, 0.05), 1400)
    return place((0, buzz), (0.08, buzz * 0.8))


# ---------------------------------------------------------------- line clears

def sweep(d, lo, hi, gain):
    """A rising shimmer of filtered noise under a clear."""
    return sweep_filter(noise(d, "pink"), lo, hi, "band", q=1.8) * env(d, 0.02, d * 0.8) * gain


@sound(SOUNDS, peak=-11)
def clear1():
    """One row: a bright pluck and bell on B5 over a short shimmer."""
    d = 0.45
    tone = pluck(B5, d, 0.3) * 0.6 + bell(B5, d, 0.35, 0.6) * 0.7
    return lowpass(place((0, tone), (0, sweep(0.25, 1500, 5000, 0.25))), 7500)


@sound(SOUNDS, peak=-10)
def clear2():
    """Two rows: B5 then D6, a 16th apart."""
    d = 0.5
    notes = place((0, pluck(B5, d, 0.3) * 0.6 + bell(B5, d, 0.35, 0.6) * 0.6),
                  (S16 / 2, pluck(D6, d, 0.32) * 0.6 + bell(D6, d, 0.38, 0.6) * 0.7))
    return lowpass(place((0, notes), (0, sweep(0.3, 1400, 5500, 0.3))), 7500)


@sound(SOUNDS, peak=-8)
def clear3():
    """Three rows: a quick B minor triad, B5 D6 F#6, with a lower octave."""
    d = 0.6
    arp = run([B5, D6, Fs6], S16 / 2, lambda f, i: pluck(f, d, 0.36) * 0.55 + bell(f, d, 0.42, 0.6) * (0.6 + 0.1 * i))
    low = pluck(B4, 0.5, 0.3, 0.7) * 0.4
    shimmer = sweep(0.4, 1200, 6000, 0.35)
    return reverb(lowpass(place((0, arp), (0, low), (0, shimmer)), 7500), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-5)
def clear4():
    """A quad: a burst and a full B minor chord stab (B4 D5 F#5 B5) under a
    bell arpeggio up to B6, with a deep thump."""
    d = 1.0
    burst = bandpass(noise(0.3), 800, 6000) * env(0.3, 0.001, 0.18) * 0.4
    thump = osc(expramp(0.4, 180, B2, 0.3), 0.4) * env(0.4, 0.001, 0.25) * 0.7
    stab = chord([B4, D5, Fs5, B5], d, 0.6, voice=pluck) * 0.35
    arp = run([B5, D6, Fs6, B6], S16 / 2, lambda f, i: bell(f, 0.7, 0.55, 0.7) * (0.5 + 0.08 * i))
    rise = sweep(0.35, 1000, 7000, 0.3)
    mix = place((0, burst), (0, thump), (0, stab), (0.02, arp), (0, rise))
    return reverb(lowpass(mix, 7500), 0.22, IR_ROOM)


@sound(SOUNDS, peak=-11)
def combo():
    """A combo step: a round bell blip on B5 (the game raises it along B
    minor with the combo)."""
    d = 0.28
    t = t_axis(d)
    blip = np.sin(2 * np.pi * B5 * t) * env(d, 0.001, 0.22) + 0.25 * np.sin(2 * np.pi * B5 * 2 * t) * env(d, 0.001, 0.08)
    return blip + pad(click(0.006, 2500, 6000), d) * 0.2


@sound(SOUNDS, peak=-8)
def tspin():
    """A T-spin: a swirling whoosh and a fast spiral up B minor to B6."""
    d = 0.5
    swirl = sweep_filter(noise(d, "pink"), 800, 5000, "band", q=2.2) * env(d, 0.03, 0.35) * 0.4
    swirl *= 1 + 0.4 * np.sin(2 * np.pi * 14 * t_axis(d))
    spiral = run([Fs5, B5, D6, Fs6, B6], 0.035, lambda f, i: bell(f, 0.4, 0.3, 0.5) * (0.5 + 0.1 * i))
    return reverb(lowpass(place((0, swirl), (0.02, spiral)), 7500), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-10)
def b2b():
    """Back to back: two bright notes, F#6 then B6, with a little echo."""
    a = bell(Fs6, 0.3, 0.22, 0.5)
    b = bell(B6, 0.4, 0.3, 0.5)
    return lowpass(echo(place((0, a), (0.06, b)), S16, 0.3, 2), 7500)


@sound(SOUNDS, peak=-5)
def allclear():
    """All clear: a sparkling run up two octaves of B minor and a bright
    D major chord (the key's relative major) on top."""
    names = [B4, D5, Fs5, B5, D6, Fs6]
    up = run(names, S16 / 2, lambda f, i: pluck(f, 0.5, 0.25, 0.8) * 0.5 + bell(f, 0.5, 0.35, 0.5) * 0.5)
    top = chord([D5, Fs5, A5, D6], 1.2, 1.0, spread=0.015) * 0.5
    shimmer = sweep(0.9, 2000, 7000, 0.18)
    return reverb(lowpass(place((0, up), (6 * S16 / 2, top), (0.2, shimmer)), 7500), 0.25, IR_ROOM)


@sound(SOUNDS, peak=-7)
def levelup():
    """Level up: four rising 16ths, F#5 A5 B5 D6, and a bell on F#6."""
    line = run([Fs5, A5, B5, D6], S16, lambda f, i: pluck(f, 0.3, 0.2, 0.8) * (0.7 + 0.08 * i))
    ding = bell(Fs6, 0.7, 0.55, 0.6) * 0.6
    return reverb(lowpass(place((0, line), (4 * S16, ding)), 7500), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-9, loop=True)
def danger():
    """The stack nears the top: a heartbeat (lub dub) once every two beats,
    a seamless loop. A low thump with a knock on B3 so small speakers hear it."""
    length = 2 * BEAT
    out = np.zeros(int(round(length * SR)))

    def beat(gain):
        d = 0.2
        body = osc(expramp(d, 140, B2, 0.3), d) * env(d, 0.003, 0.14)
        knock = osc(B3, d, "triangle") * env(d, 0.002, 0.07)
        knock += np.sin(2 * np.pi * Fs4 * t_axis(d)) * env(d, 0.002, 0.04) * 0.5
        thud = bandpass(noise(d), 220, 700) * env(d, 0.002, 0.04) * 0.5
        return lowpass(body * 0.4 + knock + thud, 1500) * gain

    for start, gain in ((0.0, 1.0), (0.17, 0.7)):
        b = beat(gain)
        i = int(start * SR)
        out[i: i + len(b)] += b[: len(out) - i]
    return out


# ---------------------------------------------------------------- moments

@sound(SOUNDS, peak=-7)
def start():
    """A game begins (READY): a rising breath under a quick B minor
    arpeggio."""
    d = 0.5
    air = sweep_filter(noise(d, "pink"), 500, 3000, "band", q=1.6) * env(d, 0.15, 0.25) * 0.35
    arp = run([B4, D5, Fs5, B5], S16 / 2, lambda f, i: pluck(f, 0.3, 0.2, 0.8) * (0.6 + 0.05 * i))
    return lowpass(place((0, air), (0.02, arp)), 7000)


@sound(SOUNDS, peak=-7)
def go():
    """GO: a bright stab, B5 and F#6 over B4, with a click."""
    d = 0.4
    stab = chord([B4, Fs5, B5, Fs6], d, 0.28, voice=pluck) * 0.4
    return lowpass(stab + pad(click(0.01, 2000, 6500), d) * 0.4, 7500)


@sound(SOUNDS, peak=-6)
def topout():
    """The stack tops out: a power-down sweep falling two octaves while the
    blocks crumble grey."""
    d = 0.85
    fall = osc(expramp(d, B5, B3, 1.4), d, "saw")
    fall = sweep_filter(fall, 4000, 400, "low") * env(d, 0.01, 0.75) * 0.5
    crumble = bandpass(crackle(d, 160, 0.003), 400, 3000) * env(d, 0.05, 0.7) * 0.6
    thud = osc(expramp(0.4, 150, B2), 0.4) * env(0.4, 0.002, 0.3) * 0.5
    return lowpass(place((0, fall), (0, crumble), (0.05, thud)), 6000)


@sound(SOUNDS, peak=-6)
def gameover():
    """Game over: a falling line on electric piano (F#5 E5 D5 C#5) that
    settles on a soft B minor chord."""
    line = run([Fs5, E5, D5, Cs5], S16, lambda f, i: epiano(f, 0.45, 0.4))
    rest = chord([B3, Fs4, D5, Fs5], 1.5, 1.3, voice=epiano, spread=0.012)
    return reverb(place((0, line * 0.8), (4 * S16, rest * 0.6)), 0.25, IR_ROOM)


@sound(SOUNDS, peak=-5)
def finish():
    """Sprint or Dig done: a quick run up to a bright D major chord, the
    relative major of B minor, with a bell on top."""
    up = run([B4, D5, Fs5, A5], S16 / 2, lambda f, i: pluck(f, 0.3, 0.2, 0.8) * (0.6 + 0.05 * i))
    hit = chord([D5, Fs5, A5, D6], 1.2, 0.9, voice=pluck) * 0.35 + chord([Fs6, A6], 1.2, 0.9) * 0.35
    thump = osc(expramp(0.3, 200, B2 * 1.19), 0.3) * env(0.3, 0.001, 0.2) * 0.5
    return reverb(lowpass(place((0, up), (4 * S16 / 2, hit), (4 * S16 / 2, thump)), 7500), 0.25, IR_ROOM)


@sound(SOUNDS, peak=-5)
def record():
    """A new best: a rising B minor arpeggio and a ringing bell chord."""
    arp = run([B4, D5, Fs5, B5, D6], S16, lambda f, i: pluck(f, 0.35, 0.25, 0.9) * (0.6 + 0.05 * i))
    bells = chord([D6, Fs6, B6], 1.3, 1.1, spread=0.02, bright=0.6) * 0.5
    pad_ = chord([B3, Fs4, D5], 1.3, 1.1, voice=epiano) * 0.4
    return reverb(lowpass(place((0, arp), (5 * S16, bells), (5 * S16, pad_)), 7500), 0.25, IR_ROOM)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-16)
def move():
    """Menu cursor: a tiny pluck on B5."""
    return chip(B5, 0.07, 0.045)


@sound(SOUNDS, peak=-11)
def select():
    """Menu confirm and toggles: F#5 then B5."""
    return place((0, chip(Fs5, 0.14, 0.09)), (0.05, chip(B5, 0.18, 0.12)))


@sound(SOUNDS, peak=-13)
def back():
    """Menu back: B5 down to F#5."""
    return place((0, chip(B5, 0.14, 0.08)), (0.05, chip(Fs5, 0.18, 0.11)))


@sound(SOUNDS, peak=-12)
def pause():
    """The pause menu opens: a soft electric piano D5 and F#5 together."""
    return chord([D5, Fs5], 0.4, 0.32, voice=epiano)


if __name__ == "__main__":
    write_all(SOUNDS, "block-drop")
