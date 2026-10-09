"""Sound effects for Sky Hopper (games/sky-hopper/public/sfx/).

Light and bouncy, to sit with cheerful chiptune pop in E-flat major at
110 BPM: the jingles are pulse-wave chip voices and small bells on notes of
E-flat major (written with sharps for synth.note: D# is E-flat, G# is
A-flat, A# is B-flat), the wing and the whooshes are filtered noise, and the
knocks carry their weight between 200 Hz and 3 kHz for the small speaker.

Run:
    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/sky-hopper.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from synth import *  # noqa: E402,F403

SOUNDS = {}
BEAT = 60 / 110  # one beat of the music
SIXTEENTH = BEAT / 4


# ---------------------------------------------------------------- voices

def chip(freq, dur, decay, duty=0.25, cutoff=5500):
    """A chiptune note: a pulse wave with a quick attack, its top harmonics
    rolled off so little is left above 8 kHz."""
    x = osc(freq, dur, "pulse", duty=duty) * env(dur, 0.002, decay)
    return lowpass(x, cutoff, order=4)


def bell(freq, dur, decay, bright=1.0):
    """A small bright bell: harmonic partials only, so it stays in tune."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, amp, dk in ((1, 1.0, 1.0), (2, 0.35 * bright, 0.5), (3, 0.12 * bright, 0.3)):
        if freq * ratio < 7500:
            out += amp * np.sin(2 * np.pi * freq * ratio * t) * env(dur, 0.001, decay * dk)
    return out


def tri(freq, dur, decay):
    """A soft triangle blip for the menus."""
    return lowpass(osc(freq, dur, "triangle") * env(dur, 0.002, decay), 5000)


def run(names, step, voice):
    """Notes one after the other, every `step` seconds."""
    return place(*[(i * step, voice(note(n), i)) for i, n in enumerate(names)])


# ---------------------------------------------------------------- flight

@sound(SOUNDS, peak=-15)
def flap():
    """A wing beat: a short airy fwip rising through the mids, with a faint
    chip chirp on top. The game varies its pitch with every flap."""
    d = 0.13
    air = sweep_filter(noise(d, "pink"), 800, 2600, "band", q=1.7) * env(d, 0.006, 0.085)
    body = bandpass(noise(d), 300, 900) * env(d, 0.002, 0.03) * 0.3
    chirp = osc(expramp(0.06, note("A#4"), note("D#5")), 0.06, "pulse", duty=0.25) * env(0.06, 0.002, 0.045)
    return lowpass(place((0, air + body), (0.004, chirp * 0.18)), 6500)


@sound(SOUNDS, peak=-11)
def point():
    """Through a gap: the coin-like ba-ding, B-flat 5 then E-flat 6, with a
    little bell shine on the second note."""
    a = chip(note("A#5"), 0.07, 0.06, duty=0.5, cutoff=6000)
    b = chip(note("D#6"), 0.34, 0.26, duty=0.5, cutoff=6000) + bell(note("D#6"), 0.34, 0.3, 0.5) * 0.5
    return place((0, a * 0.8), (0.055, b))


@sound(SOUNDS, peak=-6)
def hit():
    """Smacking into a pipe: a hard slap, a hollow knock (the pipe) and a
    short crunchy blip."""
    d = 0.26
    slap = bandpass(noise(d), 700, 4000) * env(d, 0.0004, 0.03)
    knock = osc(expramp(d, 520, 240, 0.6), d) * env(d, 0.001, 0.12)
    ring = (osc(note("G4"), d) * 0.5 + osc(note("D5") * 1.01, d) * 0.3) * env(d, 0.002, 0.09)
    crunch = crush(osc(expramp(0.08, 330, 150), 0.08, "square"), 5, 8000) * env(0.08, 0.001, 0.06)
    return lowpass(place((0, slap * 1.2 + knock + ring * 0.6), (0, crunch * 0.35)), 5000)


@sound(SOUNDS, peak=-10)
def fall():
    """The bird drops after a hit: a chip whistle sliding down from B-flat 5
    to E-flat 4 with a wobble."""
    d = 0.62
    pitch = vibrato(expramp(d, note("A#5"), note("D#4"), 0.8), d, 11, 0.25)
    tone = osc(pitch, d, "pulse", duty=0.25) * adsr(d, 0.01, 0.2, 0.75, 0.12)
    return lowpass(tone, 3500)


@sound(SOUNDS, peak=-7)
def thud():
    """Landing on the grass: a soft thump (pitched high enough for the small
    speaker), a puff and a little rustle."""
    d = 0.32
    thump = osc(expramp(d, 340, 165, 0.5), d) * env(d, 0.002, 0.18)
    knock = osc(expramp(d, 560, 330), d) * env(d, 0.001, 0.05) * 0.7
    puff = bandpass(noise(d), 250, 1500) * env(d, 0.002, 0.07) * 0.9
    rustle = bandpass(crackle(d, 140, 0.002), 1200, 4500) * env(d, 0.01, 0.16) * 0.35
    return highpass(lowpass(thump + knock + puff + rustle, 5000), 140)


# ---------------------------------------------------------------- moments

@sound(SOUNDS, peak=-6)
def medal():
    """A medal: a chip arpeggio up E-flat major into a ringing bell chord
    with a sparkle on top."""
    up = run(("D#5", "G5", "A#5", "D#6", "G6"), 0.07, lambda f, i: chip(f, 0.22, 0.16) * (0.7 + 0.06 * i))
    ring = (bell(note("D#6"), 1.0, 0.85, 0.7) + bell(note("A#6"), 1.0, 0.7, 0.4) * 0.5) * 0.8
    sparkle = run(("A#6", "D#7", "G6", "D#7"), 0.06, lambda f, i: bell(f, 0.25, 0.18, 0.2) * 0.25)
    return reverb(lowpass(place((0, up), (0.34, ring), (0.4, sparkle)), 7000), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-8)
def best():
    """Flying past the best score: three quick bright bells, G5 B-flat 5 E-flat 6."""
    notes = run(("G5", "A#5", "D#6"), 0.06, lambda f, i: bell(f, 0.45, 0.32 + 0.1 * i, 0.6))
    return reverb(lowpass(notes, 7000), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-5)
def record():
    """A new best on the results: a short chip fanfare on the beat of the
    music that lands on a bright E-flat major chord."""
    lead_notes = (("A#4", 0, 1), ("D#5", 1, 1), ("G5", 2, 1), ("A#5", 3, 2), ("G5", 5, 1), ("A#5", 6, 1), ("D#6", 7, 6))
    lead = place(*[(at * SIXTEENTH, chip(note(n), length * SIXTEENTH + 0.08, length * SIXTEENTH * 1.4)) for n, at, length in lead_notes])
    harmony = place(
        (3 * SIXTEENTH, chip(note("D#5"), 2 * SIXTEENTH + 0.06, 2 * SIXTEENTH, duty=0.5)),
        (7 * SIXTEENTH, chip(note("G5"), 6 * SIXTEENTH, 6 * SIXTEENTH * 1.2, duty=0.5)),
    )
    chord = (bell(note("D#6"), 1.0, 0.8, 0.6) + bell(note("G6"), 1.0, 0.7, 0.4) * 0.5) * 0.6
    return reverb(lowpass(place((0, lead), (0, harmony * 0.45), (7 * SIXTEENTH, chord)), 6500), 0.22, IR_ROOM)


@sound(SOUNDS, peak=-8)
def gameover():
    """The results without a record: a soft triangle line falling G5 F5 D5
    that settles on E-flat 5 over a low E-flat."""
    line = run(("G5", "F5", "D5"), SIXTEENTH, lambda f, i: tri(f, 0.3, 0.22))
    rest = tri(note("D#5"), 0.9, 0.7) + tri(note("A#4"), 0.9, 0.65) * 0.5 + tri(note("D#4"), 0.9, 0.7) * 0.6
    return reverb(place((0, line), (3 * SIXTEENTH, rest * 0.8)), 0.2, IR_ROOM)


@sound(SOUNDS, peak=-12)
def swoosh():
    """The results panel slides in: a quick rising whoosh."""
    d = 0.36
    air = sweep_filter(noise(d, "pink"), 450, 3200, "band", q=1.5) * env(d, 0.12, 0.2)
    return lowpass(air, 6500)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-16)
def move():
    """Menu cursor: a tiny blip on B-flat 5."""
    return tri(note("A#5"), 0.07, 0.05)


@sound(SOUNDS, peak=-11)
def select():
    """Menu confirm and toggles: E-flat 5 then B-flat 5."""
    return place((0, chip(note("D#5"), 0.09, 0.07, duty=0.5)), (0.05, chip(note("A#5"), 0.14, 0.11, duty=0.5)))


@sound(SOUNDS, peak=-13)
def back():
    """Menu back: B-flat 5 down to E-flat 5."""
    return place((0, chip(note("A#5"), 0.09, 0.07, duty=0.5)), (0.05, chip(note("D#5"), 0.14, 0.11, duty=0.5)))


@sound(SOUNDS, peak=-12)
def pause():
    """The pause menu opens: a soft E-flat and G together, falling away."""
    return tri(note("D#5"), 0.4, 0.32) + tri(note("G5"), 0.4, 0.3) * 0.8


@sound(SOUNDS, peak=-8)
def start():
    """A new run (get ready): a quick chip run up E-flat major over a rising
    breath of air."""
    up = run(("D#5", "G5", "A#5", "D#6"), 0.045, lambda f, i: chip(f, 0.2, 0.14 + 0.04 * i))
    d = 0.4
    air = sweep_filter(noise(d, "pink"), 500, 2600, "band", q=1.6) * env(d, 0.1, 0.18) * 0.3
    return lowpass(place((0, air), (0.02, up)), 6500)


if __name__ == "__main__":
    write_all(SOUNDS, "sky-hopper")
