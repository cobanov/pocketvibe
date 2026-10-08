"""Brick Breaker's sound effects: a bright 1980s arcade set in D minor, to sit
with the music (retro arcade electro, D minor, 118 BPM).

Tonal sounds use D minor (D E F G A Bb C); jingles move in 16ths of the
music's tempo. The brick hit is one note (D5) that the game raises along the
D minor pentatonic scale with playback rate for every brick hit before the
ball touches the paddle again, so it is kept short and soft in the upper
partials (it is played up to an octave and a fifth higher).

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/brick-breaker.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 118
S16 = 60 / BPM / 4  # a 16th note, s

C3, D3, F3, A3 = note("C3"), note("D3"), note("F3"), note("A3")
D4, E4, F4, G4, A4, Bb4, C5 = (note(n) for n in ("D4", "E4", "F4", "G4", "A4", "A#4", "C5"))
D5, E5, F5, G5, A5, Bb5, C6 = (note(n) for n in ("D5", "E5", "F5", "G5", "A5", "A#5", "C6"))
D6, F6, A6 = note("D6"), note("F6"), note("A6")


# ---------------------------------------------------------------- voices

def bell(freq, dur, decay, bright=1.0):
    """Glassy mallet: a sine with soft partials that die faster."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.002, decay)
    out += 0.3 * bright * np.sin(2 * np.pi * freq * 2 * t) * env(dur, 0.001, decay * 0.45)
    out += 0.12 * bright * np.sin(2 * np.pi * freq * 3.01 * t) * env(dur, 0.001, decay * 0.25)
    return out


def chip(freq, dur, duty=0.25, decay=None, cutoff=5000):
    """A pulse-wave note with a short release, the arcade lead."""
    body = osc(freq, dur, "pulse", duty) if duty != 0.5 else osc(freq, dur, "square")
    shape = adsr(dur, 0.003, 0.08, 0.6, min(0.04, dur / 3)) if decay is None else env(dur, 0.003, decay)
    return lowpass(body * shape, cutoff)


def bass(freq, dur):
    return osc(freq, dur, "triangle") * adsr(dur, 0.004, 0.2, 0.7, min(0.06, dur / 3))


def click(dur=0.008, lo=1500, hi=6000):
    return bandpass(noise(dur), lo, hi) * env(dur, 0.0003, dur)


def jingle(notes, voice, step=S16):
    """notes: (freq or None, length in steps); voice(freq, seconds) -> samples."""
    parts, at = [], 0.0
    for f, steps in notes:
        if f:
            parts.append((at, voice(f, steps * step)))
        at += steps * step
    return place(*parts)


# ---------------------------------------------------------------- play

@sound(SOUNDS, peak=-11)
def paddle():
    """The ball on the paddle: a rubbery bop on D4 with a click."""
    dur = 0.14
    body = osc(expramp(dur, A4, D4, 0.25), dur, "triangle") * env(dur, 0.001, 0.12)
    sub = np.sin(2 * np.pi * D4 * t_axis(dur)) * env(dur, 0.001, 0.07) * 0.4
    return lowpass(body + sub, 4000) + pad(click(0.006, 2000, 6000), dur) * 0.35


@sound(SOUNDS, peak=-19)
def wall():
    """A wall bounce: a tiny, quiet tick."""
    dur = 0.04
    tick = np.sin(2 * np.pi * D6 * t_axis(dur)) * env(dur, 0.0005, 0.03)
    return tick + pad(click(0.012, 1200, 4500), dur) * 0.6


@sound(SOUNDS, peak=-12)
def brick():
    """A brick hit, D5: the game raises it along the scale for a chain."""
    dur = 0.28
    lead = bell(D5, dur, 0.22, bright=0.8)
    edge = chip(D5, dur, 0.25, decay=0.06, cutoff=3000) * 0.25
    return lead + edge


@sound(SOUNDS, peak=-11)
def dent():
    """A steel brick taking a hit: a hollow metal thunk."""
    dur = 0.2
    metal = fm(D4, 2.41, ramp(dur, 2.5, 0.2, 0.5), dur) * env(dur, 0.001, 0.14)
    knock = bandpass(noise(dur), 250, 1800) * env(dur, 0.001, 0.04) * 0.9
    return highpass(lowpass(metal + knock, 5000), 180)


@sound(SOUNDS, peak=-12)
def clank():
    """A gold brick, which never breaks: a short bright clang."""
    dur = 0.32
    t = t_axis(dur)
    ring = np.zeros_like(t)
    for ratio, amp, dk in ((1.0, 1.0, 0.26), (2.76, 0.45, 0.12), (5.4, 0.2, 0.06)):
        ring += amp * np.sin(2 * np.pi * F5 * ratio * t) * env(dur, 0.0008, dk)
    return lowpass(ring, 7000) + pad(click(0.01, 2500, 7000), dur) * 0.5


@sound(SOUNDS, peak=-12)
def break_():
    """A brick shattering: a crunchy burst with a falling blip."""
    dur = 0.18
    crunch = bandpass(noise(dur) + crackle(dur, 260, 0.003) * 2, 500, 3500) * env(dur, 0.001, 0.12)
    blip = osc(expramp(0.07, 900, 300), 0.07, "square") * env(0.07, 0.001, 0.06)
    return lowpass(crunch + pad(lowpass(blip, 3500), dur) * 0.3, 5000, order=4)


@sound(SOUNDS, peak=-5)
def boom():
    """A bomb brick: a punchy explosion that still reads on small speakers."""
    dur = 0.7
    thump = np.sin(2 * np.pi * np.cumsum(expramp(0.3, 220, 70)) / SR) * env(0.3, 0.002, 0.25)
    blast = sweep_filter(noise(dur, "pink"), 3000, 250) * env(dur, 0.002, 0.55)
    debris = bandpass(crackle(dur, 90, 0.004), 600, 4000) * env(dur, 0.05, 0.6) * 0.8
    mix = drive(pad(thump, dur) * 0.6 + highpass(blast, 160) * 1.4 + debris, 2.5)
    return lowpass(mix, 6000, order=4)


@sound(SOUNDS, peak=-13)
def fall():
    """One of several balls falling off the edge: a falling whistle."""
    dur = 0.36
    return osc(expramp(dur, A5, A4, 0.7), dur, "sine") * env(dur, 0.005, 0.3)


@sound(SOUNDS, peak=-6)
def lose():
    """The last ball lost: a falling minor 'wah wah' ending on D."""
    def wah(f0, f1, dur):
        return lowpass(osc(expramp(dur, f0, f1), dur, "square") * adsr(dur, 0.005, 0.1, 0.7, 0.04), 2200)
    phrase = place(
        (0.0, wah(A4, A4 * 0.98, 0.15)),
        (0.17, wah(F4, F4 * 0.98, 0.15)),
        (0.34, wah(D4, D4 * 0.5, 0.5)),
    )
    thud = lowpass(noise(0.2), 400) * env(0.2, 0.002, 0.15)
    return place((0.0, phrase), (0.34, thud * 0.6))


@sound(SOUNDS, peak=-11)
def launch():
    """The ball leaves the paddle: a quick rising zip."""
    dur = 0.15
    zip_ = osc(expramp(dur, D5, A5, 0.6), dur, "triangle") * env(dur, 0.002, 0.12)
    swish = highpass(noise(dur), 2500) * env(dur, 0.01, 0.08) * 0.12
    return lowpass(zip_ + swish, 7000)


# ---------------------------------------------------------------- power-ups

@sound(SOUNDS, peak=-14)
def pill():
    """A power-up pill drops out of a brick: a two-note sparkle."""
    return place((0.0, bell(A5, 0.12, 0.1)), (0.035, bell(D6, 0.16, 0.13)))


@sound(SOUNDS, peak=-10)
def catch():
    """The paddle catches a pill: a bright pluck."""
    dur = 0.11
    return chip(D6, dur, 0.5, decay=0.08, cutoff=4500) * 0.6 + bell(A5, dur, 0.09)


@sound(SOUNDS, peak=-9)
def wide():
    """Wide paddle: a stretchy rising 'woop' with an opening filter."""
    dur = 0.42
    tone = osc(vibrato(expramp(dur, D4, D5, 0.6), dur, 9, 0.25), dur, "saw")
    return sweep_filter(tone, 500, 4000) * adsr(dur, 0.01, 0.2, 0.8, 0.12)


@sound(SOUNDS, peak=-8)
def multi():
    """Multi ball: three quick blips spreading upward, D F A."""
    def blip(f, dur):
        return chip(f, dur, 0.25, decay=0.09, cutoff=5000) + chip(f * 1.006, dur, 0.5, decay=0.09, cutoff=3000) * 0.4
    return place((0.0, blip(D5, 0.12)), (0.055, blip(F5, 0.12)), (0.11, blip(A5, 0.2)))


@sound(SOUNDS, peak=-9)
def slow():
    """Slow ball: a sinking, wobbling glide, A down to D."""
    dur = 0.5
    t = t_axis(dur)
    pitch = expramp(dur, A4, D4, 0.8) * 2 ** (0.3 * np.sin(2 * np.pi * (7 - 8 * t) * t) / 12)
    tone = osc(pitch, dur, "saw")
    return sweep_filter(tone, 2500, 500) * adsr(dur, 0.01, 0.2, 0.8, 0.15)


@sound(SOUNDS, peak=-6)
def life():
    """Extra life: a quick 1-up arpeggio up to D6 with a sparkle."""
    notes = [(D5, 1), (F5, 1), (A5, 1), (D6, 3)]
    lead = jingle(notes, lambda f, d: chip(f, d, 0.25, cutoff=5000), step=0.065)
    sparkle = place((0.2, bell(A6, 0.25, 0.2) * 0.3), (0.26, bell(D6 * 2, 0.2, 0.15) * 0.2))
    return reverb(place((0.0, lead), (0.0, sparkle)), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-12)
def expire():
    """A timed power-up wears off: two short notes down, A to D."""
    return place((0.0, chip(A4, 0.09, 0.5, decay=0.08, cutoff=2500)), (0.1, chip(D4, 0.14, 0.5, decay=0.12, cutoff=2500)))


@sound(SOUNDS, peak=-10)
def combo():
    """Every fifth brick in a chain: a rising bell sparkle."""
    return place((0.0, bell(A5, 0.15, 0.12)), (0.045, bell(D6, 0.15, 0.12)), (0.09, bell(F6, 0.26, 0.22)))


# ---------------------------------------------------------------- level and game

@sound(SOUNDS, peak=-9)
def ready():
    """A level begins: a 'da-ding' from A to D."""
    lead = place((0.0, chip(A4, S16, 0.25)), (S16, chip(D5, S16 * 3, 0.25)))
    under = place((S16, bass(D4, S16 * 3)))
    return reverb(lead + pad(under, len(lead) / SR) * 0.6, 0.12, IR_SMALL)


@sound(SOUNDS, peak=-4)
def clear():
    """Level clear: a run up D minor and a bright landing on D."""
    lead = jingle(
        [(D5, 1), (F5, 1), (A5, 1), (D6, 1), (C6, 1), (A5, 1), (Bb5, 1), (C6, 1), (D6, 4)],
        lambda f, d: chip(f, d, 0.25),
    )
    harmony = jingle([(None, 8), (A5, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35)
    low = jingle([(D4, 4), (F4, 2), (A4, 2), (D4, 4)], bass)
    n = max(len(lead), len(harmony), len(low))
    mix = pad(lead, n / SR) + pad(harmony, n / SR) + pad(low, n / SR) * 0.5
    return reverb(mix, 0.18, IR_SMALL)


@sound(SOUNDS, peak=-5)
def over():
    """Game over: a slow fall down the scale to a low D."""
    def voice(f, d):
        return lowpass(osc(f, d, "square") * adsr(d, 0.006, 0.15, 0.6, 0.06), 1800)
    lead = jingle([(A4, 2), (G4, 2), (F4, 2), (E4, 2), (D4, 6)], voice)
    low = jingle([(D3, 4), (C3, 4), (D3, 6)], lambda f, d: bass(f, d) + bass(f * 2, d) * 0.6)
    n = max(len(lead), len(low))
    return reverb(pad(lead, n / SR) + pad(low, n / SR) * 0.4, 0.2, IR_SMALL)


@sound(SOUNDS, peak=-4)
def record():
    """A new best score: a bright fanfare with a trill on top."""
    lead = jingle(
        [(A4, 1), (D5, 1), (F5, 1), (A5, 2), (F5, 1), (A5, 1), (D6, 1), (C6, 1), (D6, 1), (C6, 1), (D6, 4)],
        lambda f, d: chip(f, d, 0.25),
    )
    fifth = jingle([(None, 11), (A5, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35)
    low = jingle([(D4, 5), (A3, 3), (F4, 3), (D4, 4)], bass)
    n = max(len(lead), len(fifth), len(low))
    mix = pad(lead, n / SR) + pad(fifth, n / SR) + pad(low, n / SR) * 0.5
    return reverb(mix, 0.2, IR_SMALL)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    """Menu cursor: a short soft blip."""
    dur = 0.05
    return np.sin(2 * np.pi * A5 * t_axis(dur)) * env(dur, 0.001, 0.04) + pad(click(0.004), dur) * 0.2


@sound(SOUNDS, peak=-10)
def select():
    """Menu confirm or toggle: two quick notes up, D to A."""
    return place((0.0, bell(D5, 0.08, 0.07)), (0.05, bell(A5, 0.14, 0.12)))


@sound(SOUNDS, peak=-12)
def back():
    """Back or resume: two quick notes down, A to D."""
    return lowpass(place((0.0, bell(A5, 0.08, 0.07)), (0.05, bell(D5, 0.14, 0.12))), 4000)


@sound(SOUNDS, peak=-10)
def pause():
    """The pause menu opens: a soft falling pair, F to D."""
    return lowpass(place((0.0, bell(F5, 0.14, 0.12, 0.6)), (0.07, bell(D5, 0.26, 0.22, 0.6))), 3500)


@sound(SOUNDS, peak=-6)
def start():
    """A new game: a fast run up D minor."""
    notes = [(D4, 1), (A4, 1), (D5, 1), (F5, 1), (A5, 3)]
    lead = jingle(notes, lambda f, d: chip(f, d, 0.25), step=0.05)
    sparkle = place((0.2, bell(D6, 0.3, 0.25) * 0.3))
    return reverb(place((0.0, lead), (0.0, sparkle)), 0.12, IR_SMALL)


# break is a Python keyword; the file is break.wav.
SOUNDS["break"] = SOUNDS.pop("break_")

if __name__ == "__main__":
    write_all(SOUNDS, "brick-breaker")
