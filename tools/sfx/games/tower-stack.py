"""Sound effects for Tower Stack (games/tower-stack/public/sfx/).

Calm and soft, to sit under dreamy lofi music in F major at 86 BPM: every
tonal effect uses notes of F major, landings are muffled thuds, and the bells
have only harmonic partials so they stay in tune when the game raises their
pitch (the perfect chime climbs the scale with the streak).

Run:
    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/tower-stack.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from synth import *  # noqa: E402,F403

SOUNDS = {}
BEAT = 60 / 86  # one beat of the music
SIXTEENTH = BEAT / 4


# ---------------------------------------------------------------- voices

def bell(freq, dur, decay, bright=1.0):
    """A soft glassy bell: harmonic partials only, the upper ones dying first."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, amp, dk in ((1, 1.0, 1.0), (2, 0.3 * bright, 0.5), (3, 0.1 * bright, 0.3)):
        if freq * ratio < 7000:
            out += amp * np.sin(2 * np.pi * freq * ratio * t) * env(dur, 0.002, decay * dk)
    return out


def epiano(freq, dur, decay, bright=1.0):
    """A lofi electric piano: two-operator FM whose bark fades fast, with a
    slow tremolo, rounded off with a lowpass."""
    idx = 1.1 * bright * env(dur, 0.001, decay * 0.3) + 0.12
    x = fm(freq, 1.0, idx, dur) * env(dur, 0.006, decay)
    x *= 1 - 0.1 * (0.5 + 0.5 * np.sin(2 * np.pi * 4.3 * t_axis(dur)))
    return lowpass(x, 4200)


def pluck(freq, dur, decay):
    """A short rounded pluck for menus."""
    x = osc(freq, dur, "triangle") * env(dur, 0.002, decay)
    return lowpass(x, 5000)


def chord(names, dur, decay, voice=epiano, spread=0.0):
    """Several notes together (spread staggers them like a strum)."""
    return place(*[(i * spread, voice(note(n), dur, decay)) for i, n in enumerate(names)])


# ---------------------------------------------------------------- the drop

@sound(SOUNDS, peak=-11)
def drop():
    """A slab landing: a muffled thud diving to F2 and a woody knock on F3 and
    F4 (the knock is what a handheld's small speaker plays)."""
    d = 0.26
    body = osc(expramp(d, 175, note("F2"), 0.5), d) * env(d, 0.002, 0.17)
    knock = bandpass(noise(d), 350, 1400) * env(d, 0.0005, 0.04)
    tone = (osc(note("F3"), d) * 0.4 + osc(note("F4"), d) * 0.5 + osc(note("C5"), d) * 0.25) * env(d, 0.002, 0.08)
    return lowpass(body * 0.5 + knock * 1.6 + tone, 2600)


@sound(SOUNDS, peak=-13)
def cut():
    """The overhang sliced off: a quick downward swish, a soft chop and a
    crumble."""
    d = 0.28
    swish = sweep_filter(noise(d, "pink"), 3000, 800, "band", q=1.5) * env(d, 0.004, 0.14)
    chop = bandpass(noise(d), 600, 2000) * env(d, 0.0005, 0.02) * 0.6
    crumble = bandpass(crackle(d, 110, 0.003), 400, 2200) * env(d, 0.04, 0.22) * 0.5
    return lowpass(swish + chop + crumble, 4500, order=4)


@sound(SOUNDS, peak=-11)
def perfect():
    """The perfect snap: a click and a bell on F5 (the game raises it along
    F major as the streak grows, up to F6)."""
    d = 0.6
    f = note("F5")
    snap = bandpass(noise(d), 1500, 3500) * env(d, 0.0003, 0.008) * 0.45
    ring = bell(f, d, 0.5)
    shimmer = osc(f * 2, d) * env(d, 0.004, 0.22) * 0.14 * (1 + 0.3 * np.sin(2 * np.pi * 7 * t_axis(d)))
    return lowpass(ring + shimmer + snap, 6000)


@sound(SOUNDS, peak=-14)
def grow():
    """The slab growing back: an airy swell rising an octave, F4 to F5."""
    d = 0.34
    rise = osc(expramp(d, note("F4"), note("F5"), 0.7), d) * env(d, 0.03, 0.26)
    air = sweep_filter(noise(d, "pink"), 700, 2600, "band", q=1.5) * env(d, 0.06, 0.24) * 0.6
    return lowpass(rise + air, 5000)


@sound(SOUNDS, peak=-8)
def streak():
    """Every fifth perfect drop in a row: a harp run up F major."""
    names = ("F5", "G5", "A5", "C6", "D6", "F6")
    run = seq([note(n) for n in names], 0.045, lambda f, i: bell(f, 0.55, 0.5, bright=0.6) * (0.7 + 0.06 * i))
    return reverb(lowpass(run, 6500), 0.22, IR_SMALL)


# ---------------------------------------------------------------- the end of a run

@sound(SOUNDS, peak=-6)
def miss():
    """The slab misses and tumbles away: a falling whoosh and tone, a far thump."""
    d = 1.0
    whoosh = sweep_filter(noise(d, "pink"), 2200, 240, "band", q=1.8) * env(d, 0.05, 0.75)
    fall = osc(expramp(d, note("C5"), note("F3"), 1.3), d, "triangle") * env(d, 0.01, 0.75) * 0.3
    thump = osc(expramp(0.4, 160, note("F2")), 0.4) * env(0.4, 0.002, 0.3) + bandpass(noise(0.4), 250, 900) * env(0.4, 0.001, 0.05) * 0.5
    return lowpass(place((0, whoosh + lowpass(fall, 2500)), (0.62, thump * 0.9)), 5000)


@sound(SOUNDS, peak=-6)
def gameover():
    """Game over: a gentle falling line on electric piano (Bb A G) that settles
    on F major seven."""
    line = place(*[(i * SIXTEENTH, epiano(note(n), 0.5, 0.45)) for i, n in enumerate(("A#4", "A4", "G4"))])
    rest = chord(("F3", "C4", "A4", "E5"), 1.4, 1.2, spread=0.012)
    return reverb(place((0, line * 0.8), (3 * SIXTEENTH, rest * 0.7)), 0.25, IR_ROOM)


@sound(SOUNDS, peak=-5)
def record():
    """A new best at the end of a run: a rising F major arpeggio and a bright
    bell chord."""
    run = place(*[(i * SIXTEENTH, epiano(note(n), 0.5, 0.4, 1.2)) for i, n in enumerate(("F4", "A4", "C5", "F5"))])
    top = chord(("A5", "C6", "F6"), 1.2, 1.0, voice=lambda f, dur, dec: bell(f, dur, dec, 0.7), spread=0.02)
    pad_ = chord(("F3", "C4", "A4"), 1.2, 1.1)
    return reverb(place((0, run * 0.8), (4 * SIXTEENTH, top * 0.6), (4 * SIXTEENTH, pad_ * 0.5)), 0.25, IR_ROOM)


# ---------------------------------------------------------------- moments while climbing

@sound(SOUNDS, peak=-8)
def best():
    """Climbing past the best run: two quick bright bells, C6 and F6."""
    a = bell(note("C6"), 0.5, 0.4, 0.6)
    b = bell(note("F6"), 0.6, 0.5, 0.6)
    return reverb(lowpass(place((0, a * 0.8), (0.09, b)), 6500), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-6)
def milestone():
    """A new sky (golden hour, sunset, starry night...): a soft F major chord
    swelling under a bell arpeggio."""
    d = 1.4
    swell = chord(("F3", "C4", "F4", "A4"), d, 1.3) * ramp(d, 0.4, 1.0, 0.4)
    arp = place(*[(i * SIXTEENTH / 2, bell(note(n), 0.9, 0.8, 0.5)) for i, n in enumerate(("C5", "F5", "A5", "C6"))])
    return reverb(place((0, swell * 0.55), (0.04, arp * 0.6)), 0.25, IR_ROOM)


@sound(SOUNDS, peak=-9, loop=True)
def wind():
    """Soft wind high above the clouds, a seamless 2.4 s loop: two noise bands
    gusting at speeds that repeat exactly once per loop. The game raises its
    volume and pitch with the height of the tower."""
    length, fade, lead = 2.4, 0.12, 0.4
    raw = noise(lead + length + fade, "pink")
    low = bandpass(raw, 160, 650)[int(lead * SR):]
    high = bandpass(raw, 650, 2000)[int(lead * SR):]
    t = t_axis(length + fade)
    gust = 0.62 + 0.25 * np.sin(2 * np.pi * t / length + 0.6) + 0.13 * np.sin(2 * np.pi * 3 * t / length + 2.1)
    whistle = 0.5 + 0.5 * np.sin(2 * np.pi * 2 * t / length + 1.3)
    return loopable(low * gust + high * 0.45 * gust * whistle, fade)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-16)
def move():
    """Menu cursor: a tiny pluck on C6."""
    return pluck(note("C6"), 0.08, 0.05)


@sound(SOUNDS, peak=-11)
def select():
    """Menu confirm and toggles: F5 then C6."""
    return place((0, pluck(note("F5"), 0.16, 0.1)), (0.055, pluck(note("C6"), 0.2, 0.14)))


@sound(SOUNDS, peak=-13)
def back():
    """Menu back: C5 down to F4."""
    return place((0, pluck(note("C5"), 0.15, 0.09)), (0.055, pluck(note("F4"), 0.2, 0.13)))


@sound(SOUNDS, peak=-12)
def pause():
    """The pause menu opens: a soft electric piano A4 and F4 together."""
    return chord(("F4", "A4"), 0.4, 0.32) * env(0.4, 0.004, 0.32)


@sound(SOUNDS, peak=-7)
def start():
    """A run begins: a quick F major arpeggio over a rising breath of air."""
    arp = place(*[(i * 0.05, bell(note(n), 0.45, 0.38, 0.8)) for i, n in enumerate(("F4", "C5", "F5", "A5"))])
    d = 0.45
    air = sweep_filter(noise(d, "pink"), 500, 2400, "band", q=1.6) * env(d, 0.12, 0.2) * 0.35
    return lowpass(place((0, air), (0.02, arp)), 6500)


if __name__ == "__main__":
    write_all(SOUNDS, "tower-stack")
