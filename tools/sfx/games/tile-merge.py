"""Tile Merge's sound effects: a wooden tray, kalimba tines and a soft piano,
to sit with calm minimalist piano and kalimba music in A-flat major at 84 BPM.

Tonal sounds use A-flat major (Ab Bb C Db Eb F G); jingles move in 16ths of
the music's tempo. The sounds of a move (slide, spawn, merge) play every
second or so for a whole game, so they are short, quiet and soft at the top.
The merge is one kalimba note (Ab4, and Ab5 for the big tiles) that the game
raises along A-flat major with playback rate as the merged value grows, so a
2 + 2 is a low tine and a 1024 + 1024 rings high. Its partials are kept few
and short so it still sounds like the same instrument an octave up.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/tile-merge.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 84
BEAT = 60 / BPM
S16 = BEAT / 4  # a 16th note, s

Ab3, Eb4, Ab4, Bb4, C5, Db5, Eb5, F5, G5 = (note(n) for n in ("G#3", "D#4", "G#4", "A#4", "C5", "C#5", "D#5", "F5", "G5"))
Ab5, Bb5, C6, Db6, Eb6, F6, Ab6 = (note(n) for n in ("G#5", "A#5", "C6", "C#6", "D#6", "F6", "G#6"))
Db4, F4, C4 = note("C#4"), note("F4"), note("C4")


# ---------------------------------------------------------------- voices

def kalimba(freq, dur, decay, bright=1.0):
    """A kalimba tine: a round fundamental, a quiet near-third partial and
    the metallic 'tink' high up (an inharmonic partial that dies in a few
    milliseconds), plus a soft thumb attack."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.002, decay)
    out += 0.12 * bright * np.sin(2 * np.pi * freq * 3.02 * t) * env(dur, 0.001, decay * 0.25)
    if freq * 5.9 < 9000:
        out += 0.22 * bright * np.sin(2 * np.pi * freq * 5.9 * t) * env(dur, 0.0005, 0.035)
    thumb = bandpass(noise(dur), freq * 0.8, min(freq * 3, 6000)) * env(dur, 0.0008, 0.012) * 0.25
    return lowpass(out + thumb, 7000)


def piano(freq, dur, decay, bright=1.0):
    """A soft felt piano: harmonic partials with a touch of stretch, the
    upper ones fading first, a gentle hammer and a lowpass that keeps it
    warm."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for k, amp in ((1, 1.0), (2, 0.45), (3, 0.22), (4, 0.1), (5, 0.05)):
        f = freq * k * (1 + 0.0004 * k * k)
        if f < 7000:
            out += amp * bright ** (k - 1) * np.sin(2 * np.pi * f * t) * env(dur, 0.003, decay / (1 + 0.6 * (k - 1)))
    hammer = lowpass(noise(dur), 1800) * env(dur, 0.001, 0.02) * 0.06
    return lowpass(out + hammer, 4000)


def chord(freqs, dur, decay, voice=piano, spread=0.0):
    """Several notes together (spread staggers them like a soft roll)."""
    return place(*[(i * spread, voice(f, dur, decay)) for i, f in enumerate(freqs)])


def run(freqs, step, dur, decay, voice=kalimba, grow=0.0):
    """A quick line of notes, each a little louder by grow."""
    return place(*[(i * step, voice(f, dur, decay) * (1 + grow * i)) for i, f in enumerate(freqs)])


def tock(dur=0.05, lo=900, hi=3200):
    """Two wooden tiles touching: a very short band of noise."""
    return bandpass(noise(dur), lo, hi) * env(dur, 0.0004, 0.012)


# ---------------------------------------------------------------- a move

@sound(SOUNDS, peak=-16)
def slide():
    """The tiles sliding across the tray: a short soft swish of felt on wood
    that rises a little, with the faintest rattle. The game pans it with the
    move and makes it louder when more tiles travel further."""
    d = 0.16
    swish = sweep_filter(noise(d, "pink"), 700, 1900, "band", q=1.6) * env(d, 0.018, 0.12)
    rattle = bandpass(crackle(d, 70, 0.002), 1200, 4000) * env(d, 0.02, 0.1) * 0.25
    return lowpass(swish + rattle, 5000)


@sound(SOUNDS, peak=-11)
def merge():
    """Two tiles merging: a soft wooden tock and a kalimba tine on Ab4. The
    game raises it along A-flat major with the merged value, up to G5."""
    d = 0.55
    return place((0, tock() * 0.35), (0.004, kalimba(Ab4, d, 0.42)))


@sound(SOUNDS, peak=-9)
def merge_hi():
    """A big merge (512 and up): the tine an octave higher, Ab5, with a soft
    octave shimmer and a longer ring. Raised along A-flat major like merge."""
    d = 0.9
    tine = kalimba(Ab5, d, 0.7)
    shimmer = osc(Ab6, d) * env(d, 0.006, 0.3) * 0.12 * (1 + 0.25 * np.sin(2 * np.pi * 6 * t_axis(d)))
    under = piano(Ab4, d, 0.6) * 0.25
    return reverb(place((0, tock() * 0.3), (0.004, tine + shimmer + under)), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-19)
def spawn():
    """A new tile popping up: a tiny rounded blip gliding up to Eb6."""
    d = 0.07
    blip = osc(expramp(d, Eb6 * 0.7, Eb6, 0.4), d) * env(d, 0.002, 0.045)
    return lowpass(blip, 6000)


@sound(SOUNDS, peak=-14)
def bump():
    """A move that goes nowhere: a soft muffled thud of the tiles against the
    rim, kept above 240 Hz so the handheld's small speaker still plays it."""
    d = 0.16
    body = osc(expramp(d, 420, 240, 0.6), d) * env(d, 0.002, 0.09)
    knock = bandpass(noise(d), 400, 1400) * env(d, 0.0006, 0.03)
    return lowpass(body * 0.7 + knock * 1.1, 2000)


@sound(SOUNDS, peak=-12)
def undo():
    """Taking a move back: a swish that swells in reverse, then two kalimba
    notes stepping down, Eb5 to Ab4."""
    d = 0.16
    back = sweep_filter(noise(d, "pink"), 2000, 800, "band", q=1.6) * ramp(d, 0.05, 1.0, 2.2)
    notes = run((Eb5, Ab4), 0.07, 0.35, 0.26)
    return lowpass(place((0, back * 0.6), (0.13, notes)), 6000)


# ---------------------------------------------------------------- moments

@sound(SOUNDS, peak=-8)
def milestone():
    """A new big tile on the way to the goal (512 and 1024 on the classic
    board): a kalimba arpeggio up Ab major over a soft piano chord. The game
    plays it a fourth higher for the second step (Db major), still in key."""
    arp = run((Ab5, C6, Eb6), S16 * 0.5, 0.8, 0.6, grow=0.08)
    pad_ = chord((Ab3, Eb4, C5), 1.1, 0.9, spread=0.012) * 0.45
    return reverb(place((0, pad_), (0.01, arp * 0.7)), 0.22, IR_ROOM)


@sound(SOUNDS, peak=-5)
def win():
    """The goal tile made (2048 on the classic board): a rolled Ab major add9
    chord on piano under a kalimba run up to Ab6 and a bell on top."""
    roll = chord((Ab3, Eb4, Ab4, Bb4, C5, Eb5), 2.0, 1.7, spread=0.03)
    line = run((Ab5, Bb5, C6, Eb6, F6, Ab6), S16 * 0.5, 0.9, 0.7, grow=0.05)
    top = kalimba(Ab6, 1.6, 1.3) + osc(Ab6 * 2, 1.6) * env(1.6, 0.004, 0.5) * 0.08
    return reverb(place((0, roll * 0.5), (0.05, line * 0.6), (0.05 + 6 * S16 * 0.5, top * 0.7)), 0.28, IR_ROOM)


@sound(SOUNDS, peak=-9)
def best():
    """Passing the best score during a game: two bright tines, Eb6 and Ab6."""
    return reverb(place((0, kalimba(Eb6, 0.5, 0.4) * 0.8), (S16 * 0.5, kalimba(Ab6, 0.7, 0.55))), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-6)
def gameover():
    """No move left: a gentle falling line on piano (C5 Bb4 G4) that settles
    on a soft Db major seven, wistful rather than sad."""
    line = place(*[(i * S16, piano(f, 0.7, 0.6)) for i, f in enumerate((C5, Bb4, note("G4")))])
    rest = chord((Db4, F4, Ab4, C5), 1.8, 1.5, spread=0.025)
    return reverb(place((0, line * 0.8), (3 * S16, rest * 0.6)), 0.28, IR_ROOM)


@sound(SOUNDS, peak=-5)
def record():
    """A new best at the end of a game: a rising Ab major arpeggio on piano and
    a kalimba chord ringing above it."""
    arp = place(*[(i * S16 * 0.75, piano(f, 0.7, 0.55)) for i, f in enumerate((Ab4, C5, Eb5, Ab5))])
    top = chord((C6, Eb6, Ab6), 1.4, 1.1, voice=kalimba, spread=0.02)
    pad_ = chord((Ab3, Eb4, C5), 1.5, 1.3) * 0.45
    return reverb(place((0, arp * 0.75), (3 * S16, top * 0.55), (3 * S16, pad_)), 0.26, IR_ROOM)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-17)
def move():
    """Menu cursor: a tiny tine on C6."""
    return kalimba(C6, 0.12, 0.07, bright=0.6)


@sound(SOUNDS, peak=-12)
def select():
    """Menu confirm and toggles: Ab5 then Eb6."""
    return place((0, kalimba(Ab5, 0.2, 0.12)), (0.06, kalimba(Eb6, 0.28, 0.18)))


@sound(SOUNDS, peak=-13)
def back():
    """Menu back: Eb5 down to Ab4."""
    return place((0, kalimba(Eb5, 0.2, 0.12)), (0.06, kalimba(Ab4, 0.28, 0.18)))


@sound(SOUNDS, peak=-13)
def pause():
    """The pause menu opens: a soft piano Ab4 and C5 together."""
    return chord((Ab4, C5), 0.5, 0.4)


@sound(SOUNDS, peak=-12)
def board():
    """A different board picked on the title: the tray set down with a soft
    wooden clack and a little rattle of tiles. The game raises it for the
    smaller board and lowers it for the bigger one."""
    d = 0.24
    clack = place((0, tock(0.06, 500, 2200)), (0.045, tock(0.06, 700, 2600) * 0.6))
    body = osc(expramp(d, 330, 220, 0.5), d) * env(d, 0.002, 0.07) * 0.4
    rattle = bandpass(crackle(d, 90, 0.002), 1000, 3500) * env(d, 0.04, 0.14) * 0.3
    return lowpass(place((0, clack), (0, body), (0.03, rattle)), 5000)


@sound(SOUNDS, peak=-8)
def start():
    """A new game: a quick kalimba arpeggio up Ab major, Ab4 to Ab5."""
    return reverb(run((Ab4, C5, Eb5, Ab5), 0.055, 0.5, 0.38, grow=0.06), 0.15, IR_SMALL)


if __name__ == "__main__":
    write_all(SOUNDS, "tile-merge")
