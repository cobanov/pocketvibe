"""Sound effects for Road Hopper: a bouncy cartoon countryside.

Tonal sounds are in C major, like the music (112 BPM: marimba, pizzicato,
ukulele), so jingles and chimes sit with it. The handheld's speaker is tiny,
so even the low sounds (thuds, engines, rumbles) carry most of their energy
between 200 Hz and 3 kHz.

Run:
    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/road-hopper.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import synth  # noqa: E402
from synth import *  # noqa: E402,F403

SOUNDS = {}


# ---------------------------------------------------------------- instruments

def marimba(freq, dur=0.5, decay=0.35, bright=1.0):
    """A marimba bar: the fundamental, the bar's strong 4th partial (ratio
    3.93) and a faint 10th, the overtones dying fast, and a soft mallet tap."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.002, decay)
    if freq * 3.93 < 8000:
        out += 0.35 * bright * np.sin(2 * np.pi * freq * 3.93 * t) * env(dur, 0.001, decay * 0.25)
    if freq * 9.2 < 8000:
        out += 0.08 * bright * np.sin(2 * np.pi * freq * 9.2 * t) * env(dur, 0.001, decay * 0.08)
    tap = lowpass(noise(dur), 3000) * env(dur, 0.0005, 0.012) * 0.12
    return out + tap


def pluck(freq, dur=0.6, ring=0.5, bright=0.5):
    """Karplus-Strong string: a ukulele (long ring) or a pizzicato (short).
    ring is the time to fall 60 dB; bright opens up the pick's attack."""
    n = int(round(dur * SR))
    p = max(2, int(round(SR / freq - 0.5)))
    y = np.zeros(n)
    burst = lowpass(noise(p / SR + 0.01), 1200 + 5000 * bright)[:p]
    y[:p] = burst / (np.max(np.abs(burst)) + 1e-9)
    g = 10 ** (-3 / (ring * freq))
    for start in range(p, n, p):
        end = min(start + p, n)
        size = end - start
        a = y[start - p: start - p + size]
        if start - p - 1 >= 0:
            b = y[start - p - 1: start - p - 1 + size]
        else:
            b = np.concatenate([[0.0], y[: size - 1]])
        y[start:end] = g * 0.5 * (a + b)
    return lowpass(y, 5000) * env(dur, 0.001, dur * 4)


def chime(freq, dur=0.4, decay=0.3):
    """A small bright bell: fundamental and a couple of soft harmonics."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.001, decay)
    out += 0.3 * np.sin(2 * np.pi * freq * 2 * t) * env(dur, 0.001, decay * 0.5)
    if freq * 3 < 8000:
        out += 0.12 * np.sin(2 * np.pi * freq * 3 * t) * env(dur, 0.001, decay * 0.3)
    return out


def squawk(dur, f0, f1, f2=None):
    """A chicken's voice: a nasal pulse wave through two formants, pitch
    gliding f0 -> f1 (-> f2)."""
    if f2 is None:
        f = expramp(dur, f0, f1, 0.7)
    else:
        half = dur / 2
        f = np.concatenate([expramp(half, f0, f1, 0.6), expramp(dur - half, f1, f2, 1.2)])
    src = osc(f, dur, "pulse", duty=0.28)
    voice = bandpass(src, 700, 1300) + 0.6 * bandpass(src, 2000, 3200)
    return voice * adsr(dur, 0.006, dur * 0.4, 0.7, dur * 0.35)


def blips(dur, count, lo, hi, length=0.03):
    """Bubbles: short sine chirps rising in pitch, at random times."""
    out = np.zeros(int(round(dur * SR)))
    for _ in range(count):
        start = _rng_uniform(0, dur - length)
        f = _rng_uniform(lo, hi)
        b = glide(f, f * 1.8, length, curve=0.7) * env(length, 0.002, length * 0.8) * _rng_uniform(0.3, 1.0)
        i = int(start * SR)
        out[i: i + len(b)] += b[: len(out) - i]
    return out


def _rng_uniform(a, b):
    # synth's seeded noise generator, so every run writes the same bubbles
    return float(synth._rng.uniform(a, b))


def swell(dur, peak_at, rise, fall):
    """An envelope that swells to 1 at peak_at and dies away: a pass-by."""
    t = t_axis(dur)
    return np.where(t < peak_at, np.exp(-(((t - peak_at) / rise) ** 2)), np.exp(-(((t - peak_at) / fall) ** 2)))


def soften(x, cutoff=7000):
    """Takes the edge off noisy sounds above about 8 kHz."""
    return lowpass(x, cutoff, 4)


# ---------------------------------------------------------------- the chicken

@sound(SOUNDS, peak=-13)
def hop():
    # A light boing: a quick flick up from C5 to G5 with a springy wobble,
    # and the faint scuff of feet pushing off.
    d = 0.11
    f = vibrato(expramp(d, note("C5"), note("G5"), 0.5), d, 36, 0.5)
    tone = (osc(f, d) + 0.25 * osc(f, d, "triangle")) * env(d, 0.003, 0.09)
    push = bandpass(noise(0.02), 1500, 4000) * env(0.02, 0.0005, 0.012) * 0.25
    return place((0, tone), (0, push))


@sound(SOUNDS, peak=-14)
def bump():
    # Hopping into a tree or a rock: a soft knock and a rustle of leaves.
    d = 0.16
    thud = glide(260, 130, d) * env(d, 0.002, 0.08)
    knock = bandpass(noise(d), 300, 900) * env(d, 0.001, 0.035) * 0.8
    rustle = bandpass(noise(d), 2500, 6000) * env(d, 0.01, 0.12) * 0.12
    return thud + knock + rustle


@sound(SOUNDS, peak=-12)
def log():
    # Landing on a log: hollow wood, a few damped modes around G4, and a knock.
    d = 0.16
    t = t_axis(d)
    out = np.zeros_like(t)
    for f, a, dk in ((note("G4"), 1.0, 0.12), (note("G4") * 2.37, 0.45, 0.06), (note("G4") * 3.9, 0.2, 0.035)):
        out += a * np.sin(2 * np.pi * f * t) * env(d, 0.001, dk)
    knock = bandpass(noise(d), 800, 3000) * env(d, 0.0005, 0.015) * 0.5
    return out + knock


@sound(SOUNDS, peak=-13)
def lily():
    # Landing on a lily pad: a wet little bloop and a splish.
    d = 0.14
    bloop = pad(glide(1100, 380, 0.07, curve=0.7) * env(0.07, 0.002, 0.06), d)
    splish = soften(highpass(noise(d), 2500)) * env(d, 0.002, 0.05) * 0.25
    return bloop + splish


@sound(SOUNDS, peak=-10)
def coin():
    # A bright two-note ding, C6 then G6.
    return place((0, chime(note("C6"), 0.12, 0.08)), (0.06, chime(note("G6"), 0.32, 0.26)))


@sound(SOUNDS, peak=-12)
def cluck():
    # "Buk-buk": two short nasal clucks falling in pitch.
    return place((0, squawk(0.06, 560, 430)), (0.1, squawk(0.09, 620, 440)))


# ---------------------------------------------------------------- traffic

@sound(SOUNDS, peak=-14)
def car():
    # A car whooshing past in the next lane: filtered noise swelling and
    # darkening (the Doppler drop) over an engine hum.
    d = 0.4
    shape = swell(d, 0.15, 0.07, 0.12)
    rush = sweep_filter(noise(d, "pink"), 2200, 650, "band", q=1.8)
    hum = lowpass(osc(expramp(d, 260, 180), d, "saw"), 1200) * 0.35
    return highpass((rush + hum) * shape, 200, 4)


@sound(SOUNDS, peak=-12)
def truck():
    # A truck: heavier and slower, a diesel rumble that throbs as it passes.
    d = 0.6
    t = t_axis(d)
    shape = swell(d, 0.24, 0.1, 0.2)
    rush = sweep_filter(noise(d, "pink"), 1400, 380, "band", q=1.6)
    throb = 0.75 + 0.25 * np.sin(2 * np.pi * 17 * t)
    engine = lowpass(osc(expramp(d, 150, 105), d, "saw"), 1000) * throb * 0.6
    return highpass((rush + engine) * shape, 180, 4)


@sound(SOUNDS, peak=-11)
def horn():
    # A cartoon car horn, "meep meep": G4 and B4 together, reedy.
    def beep(d):
        x = osc(note("G4"), d, "square") * 0.6 + osc(note("B4"), d, "square") * 0.5
        x = drive(lowpass(x, 2400, 4), 1.5)
        return x * adsr(d, 0.006, 0.05, 0.85, 0.02)

    return place((0, beep(0.11)), (0.16, beep(0.2)))


@sound(SOUNDS, peak=-12, loop=True)
def tractor():
    # A diesel tractor putt-putting along: four putts in half a second over a
    # steady drone built from harmonics of 110 Hz (so it loops seamlessly;
    # the 110 Hz itself is left out, too low for the handheld's speaker).
    cell = 0.125
    parts = []
    for i in range(4):
        t = t_axis(cell)
        putt = osc(110, cell, "pulse", duty=0.2) * env(cell, 0.002, 0.07)
        putt = bandpass(putt, 200, 1400)
        chug = bandpass(noise(cell), 300, 1200) * env(cell, 0.001, 0.05) * 0.9
        rattle = bandpass(noise(cell), 1500, 3500) * env(cell, 0.001, 0.02) * 0.15
        parts.append((putt + chug + rattle) * (1.0 if i % 2 == 0 else 0.8))
    x = np.concatenate(parts)
    t = t_axis(0.5)
    drone = sum(np.sin(2 * np.pi * 110 * k * t) / k for k in range(2, 9)) * 0.15
    return x + drone


@sound(SOUNDS, peak=-16, loop=True)
def river():
    # The river murmuring: soft band-limited noise and the odd bubble.
    d = 1.25
    flow = bandpass(noise(d, "pink"), 300, 1800)
    flow /= np.max(np.abs(flow))
    bub = blips(d, 14, 500, 900)
    return loopable(flow * 0.6 + bub * 0.5, 0.15)


# ---------------------------------------------------------------- railway

@sound(SOUNDS, peak=-10)
def bell():
    # A level crossing bell: one metallic ding on G5 (rung three or four
    # times a second while the lamps flash).
    d = 0.32
    t = t_axis(d)
    f = note("G5")
    ding = fm(f, 1.41, 2.2 * env(d, 0.001, 0.12), d) * env(d, 0.001, 0.28)
    ding += 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * env(d, 0.001, 0.1)
    clang = bandpass(noise(d), 2000, 5000) * env(d, 0.0005, 0.008) * 0.3
    return ding + clang


@sound(SOUNDS, peak=-5)
def train():
    # A train: a cheerful horn chord (C4 E4 G4) far off, then the rush swells
    # to its loudest as the train passes (0.9 s in), wheels clacking over the
    # rail joints, and it is gone.
    d = 1.6
    hd = 0.55
    horn = sum(osc(vibrato(note(n), hd, 5, 0.08), hd, "saw") * a for n, a in (("C4", 1.0), ("E4", 0.8), ("G4", 0.7)))
    horn = lowpass(horn, 1600, 4) * adsr(hd, 0.03, 0.1, 0.9, 0.12) * 0.45
    shape = swell(d, 0.88, 0.28, 0.33)
    rush = sweep_filter(noise(d, "pink"), 2600, 700, "low") * shape
    rumble = bandpass(noise(d, "brown"), 120, 500) * shape * 1.5
    clacks = np.zeros(int(round(d * SR)))
    for k, at in enumerate(np.arange(0.5, 1.3, 0.115)):
        for off in (0.0, 0.035):
            c = bandpass(noise(0.03), 900, 3000) * env(0.03, 0.0005, 0.02)
            i = int((at + off) * SR)
            clacks[i: i + len(c)] += c
    clacks *= shape * 0.9
    return soften(place((0, horn), (0, rush + rumble + clacks)))


# ---------------------------------------------------------------- endings

@sound(SOUNDS, peak=-5)
def squash():
    # Flattened: a wet splat, a cartoon "bwomp" falling away, a startled
    # squawk and a poof of feathers.
    splat = lowpass(noise(0.12), 1800) * env(0.12, 0.001, 0.09)
    bwomp = glide(420, 110, 0.26, curve=0.5)
    bwomp = (bwomp + 0.3 * glide(420, 110, 0.26, "triangle", curve=0.5)) * env(0.26, 0.002, 0.22)
    poof = bandpass(noise(0.32), 1000, 5000) * env(0.32, 0.01, 0.26) * 0.25
    return place((0, splat), (0, bwomp * 0.8), (0.03, squawk(0.17, 950, 1350, 700) * 0.55), (0.05, poof))


@sound(SOUNDS, peak=-6)
def splash():
    # Into the river: a deep bloop, a spray of water, bubbles rising after.
    bloop = glide(700, 170, 0.12, curve=0.6) * env(0.12, 0.002, 0.11)
    spray = sweep_filter(noise(0.5), 5000, 900, "low") * env(0.5, 0.004, 0.4)
    bub = blips(0.6, 9, 400, 800, 0.035)
    return soften(place((0, bloop), (0, spray * 0.8), (0.12, bub * 0.45)))


@sound(SOUNDS, peak=-7)
def hawk():
    # The hawk's cry: "kee-eeer", high and falling, with a fast flutter and a
    # raspy edge.
    d = 0.7
    f = vibrato(expramp(d, 2200, 1300, 1.6), d, 28, 0.35)
    tone = osc(f, d) + 0.35 * osc(f, d, "saw")
    tone = bandpass(tone, 900, 5000)
    rasp = bandpass(noise(d), 1500, 4500) * 0.2 * (0.6 + 0.4 * np.sin(2 * np.pi * 28 * t_axis(d)))
    return soften((tone + rasp) * adsr(d, 0.04, 0.2, 0.75, 0.25), 6000)


@sound(SOUNDS, peak=-7)
def snatch():
    # Caught: wing beats whooshing and the chicken squawking as it is lifted.
    flaps = place(*[(i * 0.12, lowpass(noise(0.12), 1400) * env(0.12, 0.03, 0.08)) for i in range(4)])
    return place((0, flaps * 0.8), (0.02, squawk(0.24, 900, 1450, 1100) * 0.7))


# ---------------------------------------------------------------- cheers

@sound(SOUNDS, peak=-9)
def start():
    # Off we go: a quick ukulele strum up a C major chord.
    notes = ["C4", "E4", "G4", "C5"]
    return place(*[(i * 0.018, pluck(note(n), 0.6, 0.6, 0.55) * (0.8 + 0.07 * i)) for i, n in enumerate(notes)])


@sound(SOUNDS, peak=-7)
def best():
    # Past the best run: a rising marimba run G5 C6 E6 G6 and a sparkle.
    notes = ["G5", "C6", "E6", "G6"]
    run = seq([note(n) for n in notes], 0.07, lambda f, i: marimba(f, 0.4, 0.3))
    return place((0, run), (0.3, chime(note("C7"), 0.35, 0.25) * 0.3))


@sound(SOUNDS, peak=-11)
def milestone():
    # Every 25 rows: a soft two-note chime, E6 and G6.
    return place((0, marimba(note("E6"), 0.3, 0.22)), (0.07, marimba(note("G6"), 0.35, 0.26)))


@sound(SOUNDS, peak=-5)
def record():
    # Game over with a new best: a ukulele strum under a marimba fanfare
    # C5 E5 G5 C6, ending on a ringing C major chord.
    melody = seq([note(n) for n in ("C5", "E5", "G5")], 0.11, lambda f, i: marimba(f, 0.35, 0.25))
    chord = sum(marimba(note(n), 0.8, 0.6) for n in ("C6", "E6", "G6")) * 0.5
    strum = place(*[(i * 0.02, pluck(note(n), 0.9, 0.8, 0.5)) for i, n in enumerate(["C4", "G4", "C5", "E5"])])
    return place((0, melody), (0.33, chord), (0.33, strum * 0.6))


@sound(SOUNDS, peak=-7)
def over():
    # Game over: a playful marimba fall G5 E5 C5 and a pizzicato "bum-bum".
    fall = seq([note(n) for n in ("G5", "E5", "C5")], 0.12, lambda f, i: marimba(f, 0.35, 0.25))
    bum = place((0, pluck(note("G3"), 0.35, 0.25, 0.3)), (0.16, pluck(note("C3"), 0.45, 0.35, 0.3)))
    return place((0, fall), (0.4, bum * 0.9))


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    # Menu cursor: a tiny wooden tick on E6.
    return marimba(note("E6"), 0.08, 0.05, 0.6)


@sound(SOUNDS, peak=-10)
def select():
    # Menu confirm: C6 up to G6.
    return place((0, marimba(note("C6"), 0.2, 0.12)), (0.06, marimba(note("G6"), 0.25, 0.18)))


@sound(SOUNDS, peak=-12)
def back():
    # Menu back: G5 down to C5.
    return place((0, marimba(note("G5"), 0.2, 0.12)), (0.06, marimba(note("C5"), 0.25, 0.18)))


@sound(SOUNDS, peak=-10)
def pause():
    # Pause: two pizzicato plucks, C5 down to G4.
    return place((0, pluck(note("C5"), 0.25, 0.2, 0.4)), (0.09, pluck(note("G4"), 0.3, 0.25, 0.4)))


if __name__ == "__main__":
    write_all(SOUNDS, "road-hopper")
