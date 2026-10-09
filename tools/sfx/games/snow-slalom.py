"""Snow Slalom's sound effects: a downhill slalom in C-sharp minor, to sit with
the music (exhilarating winter downhill electronic, C-sharp minor, 128 BPM).

Three loops follow the skier (sound.js loop(), volume and pitch set every
frame): the skis carving the snow, the wind of speed and the scrape of skis
on ice. They are built from parts that repeat a whole number of times in the
loop (noise is filtered circularly, in the frequency domain), so they loop
without a seam and need no crossfade.

Tonal one-shots use C-sharp minor (C# D# E F# G# A B). The gate chime is
played a step higher up the scale for every gate of the combo (the game sets
its rate), so it is short and starts on C#5; the jingles move in 8ths and
16ths of the music's tempo. Alpine finish lines ring with cowbells, so the
finish has some.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/snow-slalom.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 128
E8 = 60 / BPM / 2  # an 8th note, s
S16 = E8 / 2

Cs4, Ds4, E4, Fs4, Gs4, A4, B4 = (note(n) for n in ("C#4", "D#4", "E4", "F#4", "G#4", "A4", "B4"))
Cs5, Ds5, E5, Fs5, Gs5, A5, B5 = (note(n) for n in ("C#5", "D#5", "E5", "F#5", "G#5", "A5", "B5"))
Cs6, Ds6, E6, Fs6, Gs6 = (note(n) for n in ("C#6", "D#6", "E6", "F#6", "G#6"))
Cs3, Gs3, F5 = note("C#3"), note("G#3"), note("F5")


# ---------------------------------------------------------------- helpers

def periodic_noise(dur, lo, hi, tilt=0.0):
    """Noise band-limited to lo..hi Hz that repeats exactly every dur seconds
    (filtered in the frequency domain, so it wraps around without a seam).
    tilt > 0 leans the band towards its low end."""
    n = int(round(dur * SR))
    spec = np.fft.rfft(noise(dur))
    f = np.fft.rfftfreq(n, 1 / SR)
    band = ((f >= lo) & (f <= hi)).astype(float)
    if tilt:
        band *= (np.maximum(f, lo) / lo) ** -tilt
    out = np.fft.irfft(spec * band, n)
    return out / (np.max(np.abs(out)) + 1e-9)


def whole(f, dur):
    """The nearest frequency with a whole number of cycles in dur."""
    return round(f * dur) / dur


def bell(freq, dur, decay, index=2.2, ratio=3.5):
    """FM bell: bright attack that mellows as it rings."""
    t = t_axis(dur)
    mod = index * env(dur, 0.001, decay * 0.5) * np.sin(2 * np.pi * freq * ratio * t)
    return np.sin(2 * np.pi * freq * t + mod) * env(dur, 0.002, decay)


def pluck(freq, dur, decay=0.25):
    """Bright synth pluck (pulse with a falling filter)."""
    x = osc(freq, dur, "pulse", duty=0.3)
    return sweep_filter(x, 5000, 900) * env(dur, 0.002, decay)


def brass(freq, dur, attack=0.012, release=0.08, bright=3000):
    """A synth-brass stab: two detuned saws through a lowpass."""
    x = osc(freq, dur, "saw") + 0.7 * osc(freq * 1.006, dur, "saw")
    x = lowpass(x, bright, order=2)
    return x * adsr(dur, attack, 0.15, 0.7, release)


def chord(freqs, dur, voice):
    return sum(voice(f, dur) for f in freqs) / len(freqs)


def thud(dur, f0=150, f1=80, decay=0.18):
    """A body thump, falling in pitch: a low sine for weight and a burst of
    low-mid noise, which is what a small speaker can actually play."""
    tone = glide(f0, f1, dur, "sine", curve=0.5) * env(dur, 0.001, decay)
    body = bandpass(noise(dur), 220, 1100) * env(dur, 0.001, decay * 0.45)
    return 0.6 * tone + 0.7 * body


def snow(dur, cutoff=2600, decay=0.2, attack=0.002):
    """A crunch of packed snow: noise through a lowpass, quickly gone."""
    return lowpass(noise(dur), cutoff) * env(dur, attack, decay)


def cowbell(freq, dur, decay=0.35):
    """An alpine cowbell: a few inharmonic partials and a clank."""
    t = t_axis(dur)
    parts = [(1.0, 1.0, 1.0), (1.47, 0.6, 0.7), (2.09, 0.35, 0.5), (2.56, 0.25, 0.35)]
    x = sum(a * np.sin(2 * np.pi * freq * r * t) * env(dur, 0.001, decay * d) for r, a, d in parts)
    clank = bandpass(noise(dur), 1500, 4500) * env(dur, 0.0005, 0.015)
    return x + 0.4 * clank


# ---------------------------------------------------------------- loops

@sound(SOUNDS, peak=-12, loop=True)
def carve():
    # The skis on edge: a band of hiss that crunches unevenly (the grain of
    # the snow, 6 to 40 times a second) over a soft low rush.
    dur = 0.8
    hiss = periodic_noise(dur, 900, 5200, tilt=0.6)
    grain = periodic_noise(dur, 6, 40)
    grain = 0.62 + 0.38 * grain
    body = periodic_noise(dur, 220, 900, tilt=1.0)
    return hiss * grain + 0.45 * body


@sound(SOUNDS, peak=-13, loop=True)
def wind():
    # Air rushing past: low broadband noise swelling slowly, with a faint
    # whistle on G#5 and C#6 that comes and goes. Everything repeats whole
    # within 1.2 s.
    dur = 1.2
    t = t_axis(dur)
    rush = periodic_noise(dur, 260, 2400, tilt=0.9)
    swell = 0.7 + 0.3 * periodic_noise(dur, 0.6, 2.5)
    whistle = np.sin(2 * np.pi * whole(Gs5, dur) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * t / dur))
    whistle += 0.6 * np.sin(2 * np.pi * whole(Cs6, dur) * t) * (0.5 - 0.5 * np.sin(2 * np.pi * t / dur))
    return rush * swell + 0.06 * whistle


@sound(SOUNDS, peak=-14, loop=True)
def ice():
    # Steel edges skittering on ice: a thin, bright hiss that chatters
    # 30 to 70 times a second, with a glassy ring around 2.2 and 3.3 kHz.
    dur = 0.6
    t = t_axis(dur)
    hiss = periodic_noise(dur, 1800, 6500)
    chatter = periodic_noise(dur, 30, 70)
    chatter = np.clip(0.55 + 0.6 * chatter, 0.1, 1)
    ring = np.sin(2 * np.pi * whole(2217, dur) * t) + 0.6 * np.sin(2 * np.pi * whole(3322, dur) * t)
    ring *= 0.5 + 0.5 * np.sin(2 * np.pi * 5 / dur * t)
    return hiss * chatter + 0.12 * ring


# ---------------------------------------------------------------- gates

@sound(SOUNDS, peak=-11)
def gate():
    # Through a gate: a short bell on C#5 with its fifth, and the slap of
    # the flag. The game raises it a scale step per gate of the combo.
    dur = 0.32
    ding = bell(Cs5, dur, 0.24, index=1.6) + 0.45 * bell(Gs5, dur, 0.18, index=1.2)
    slap = bandpass(noise(0.03), 1200, 4000) * env(0.03, 0.0005, 0.01)
    return place((0, 0.35 * slap), (0.004, ding))


@sound(SOUNDS, peak=-13)
def brush():
    # A pole knocked aside by the shin: a hollow plastic thwack.
    dur = 0.14
    knock = glide(420, 260, dur, "triangle") * env(dur, 0.0005, 0.07)
    slap = bandpass(noise(dur), 700, 3200) * env(dur, 0.0005, 0.03)
    return knock + 0.7 * slap


@sound(SOUNDS, peak=-9)
def miss():
    # A gate missed: a dull drop from G#4 to C#4, and a soft thud.
    one = lambda f, i: lowpass(osc(f, 0.18, "square") * 0.6 + osc(f / 2, 0.18, "triangle"), 1400) * env(0.18, 0.004, 0.16)
    return place((0, seq([Gs4, Cs4], 0.11, one)), (0, 0.4 * thud(0.2, 160, 90, 0.12)))


# ---------------------------------------------------------------- air

@sound(SOUNDS, peak=-10)
def takeoff():
    # Off the lip of a kicker: a whoosh opening upwards and a crunch of snow.
    dur = 0.38
    whoosh = sweep_filter(noise(dur), 380, 2600, kind="band", q=1.6) * env(dur, 0.03, 0.33)
    return place((0, whoosh), (0, 0.5 * snow(0.1, 2400, 0.06)))


@sound(SOUNDS, peak=-9)
def land():
    # Back on the snow: a thump and a short crunch.
    dur = 0.28
    x = 0.6 * thud(dur, 150, 80, 0.14) + snow(dur, 3200, 0.11)
    return drive(x / np.max(np.abs(x)), 1.8)


@sound(SOUNDS, peak=-12)
def spin():
    # A spin in the air: a whoosh that swings round twice.
    dur = 0.5
    t = t_axis(dur)
    sweep = sweep_filter(noise(dur), 650, 2200, kind="band", q=1.8)
    swing = 0.55 + 0.45 * np.sin(2 * np.pi * 4 * t - np.pi / 2)
    return sweep * swing * env(dur, 0.04, 0.45)


@sound(SOUNDS, peak=-7)
def trick():
    # A spin landed: a quick C#m arpeggio of plucks up to C#6, with a bell.
    notes = seq([Cs5, E5, Gs5, Cs6], S16 * 0.55, lambda f, i: pluck(f, 0.22, 0.16))
    return reverb(place((0, notes), (S16 * 1.65, 0.6 * bell(Cs6, 0.5, 0.4, index=1.5))), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-9)
def air():
    # A big air: two rising chimes, G#5 to C#6.
    return seq([Gs5, Cs6], S16 * 0.6, lambda f, i: bell(f, 0.35 if i else 0.2, 0.28 if i else 0.14, index=1.4))


@sound(SOUNDS, peak=-8)
def bonus():
    # A gold flag taken: a sparkling B5-E6-G#6 with a shimmer on top.
    notes = seq([B5, E6, Gs6], 0.045, lambda f, i: bell(f, 0.3, 0.24 if i == 2 else 0.1, index=2.4, ratio=2.0))
    shimmer = bandpass(noise(0.35), 4000, 7500) * env(0.35, 0.02, 0.25) * 0.15
    return place((0, notes), (0.05, shimmer))


# ---------------------------------------------------------------- crashes

@sound(SOUNDS, peak=-6)
def crash_tree():
    # Into a pine: a heavy thump, the branches thrashing and snow pouring
    # off them.
    dur = 0.8
    rustle = lowpass(crackle(dur, 260, 0.004), 4200) * env(dur, 0.005, 0.45)
    fall = lowpass(noise(dur, "pink"), 1500) * env(dur, 0.06, 0.7)
    x = place((0, 0.55 * thud(dur, 140, 70, 0.22) + rustle + 0.5 * fall), (0, 0.8 * snow(0.2, 2800, 0.09)))
    return drive(x / np.max(np.abs(x)), 2.5)


@sound(SOUNDS, peak=-6)
def crash_rock():
    # Onto a rock: a hard knock, the clank of the skis and gravel.
    dur = 0.6
    knock = 0.6 * thud(dur, 260, 110, 0.12)
    click = bandpass(noise(dur), 1500, 5000) * env(dur, 0.0003, 0.012)
    clank = fm(620, 1.41, ramp(dur, 4, 0.5), dur) * env(dur, 0.001, 0.16)
    gravel = bandpass(crackle(dur, 90, 0.003), 600, 4500) * env(dur, 0.01, 0.4)
    x = knock + 0.4 * click + 0.35 * clank + 0.9 * gravel
    return drive(x / np.max(np.abs(x)), 2.5)


@sound(SOUNDS, peak=-6)
def crash_fence():
    # Into the safety net: a stretchy boing as it gives, the posts rattling.
    dur = 0.65
    t = t_axis(dur)
    stretch = np.concatenate([expramp(0.12, 220, 330), expramp(dur - 0.12, 330, 180, 0.6)])
    boing = osc(stretch * 2 ** (0.4 * np.sin(2 * np.pi * 11 * t) / 12), dur, "square")
    boing = lowpass(boing, 1800) * env(dur, 0.004, 0.45)
    rattle = bandpass(crackle(dur, 70, 0.003), 900, 4000) * env(dur, 0.01, 0.3)
    x = place((0, 0.7 * boing + 0.8 * rattle), (0, 0.5 * thud(0.3, 150, 80, 0.14)))
    return drive(x / np.max(np.abs(x)), 2)


@sound(SOUNDS, peak=-7)
def wipeout():
    # Landed sideways: three tumbling whumps into the snow, each softer.
    one = lambda i: 0.5 * thud(0.22, 140 - i * 10, 75, 0.14) + snow(0.22, 2600 - i * 300, 0.13, 0.004)
    x = place((0, one(0)), (0.16, 0.7 * one(1)), (0.34, 0.45 * one(2)))
    return drive(x / np.max(np.abs(x)), 2)


@sound(SOUNDS, peak=-10)
def warn():
    # One strike left: two short low buzzes on C#4.
    one = lambda f, i: lowpass(osc(f, 0.12, "square"), 1600) * adsr(0.12, 0.004, 0.05, 0.8, 0.03)
    return seq([Cs4, Cs4], 0.16, one)


# ---------------------------------------------------------------- the run

@sound(SOUNDS, peak=-10)
def milestone():
    # Another 500 metres: two soft bells, E5 and B5.
    return seq([E5, B5], S16, lambda f, i: bell(f, 0.4, 0.3 if i else 0.15, index=1.3))


@sound(SOUNDS, peak=-7)
def best():
    # Past the best score mid-run: bells running up C#m to C#6, shimmering.
    notes = seq([Cs5, E5, Gs5, B5, Cs6], S16 * 0.6, lambda f, i: bell(f, 0.45, 0.35 if i == 4 else 0.15, index=1.8))
    return reverb(notes, 0.18, IR_SMALL)


@sound(SOUNDS, peak=-9)
def beep():
    # Countdown 3, 2, 1: G#4.
    dur = 0.22
    x = osc(Gs4, dur, "square") * 0.5 + osc(Gs4 * 2, dur, "sine") * 0.3
    return lowpass(x, 3200) * adsr(dur, 0.004, 0.08, 0.7, 0.05)


@sound(SOUNDS, peak=-6)
def go():
    # GO: G#5 over C#5, longer and brighter.
    dur = 0.6
    x = osc(Gs5, dur, "square") * 0.45 + osc(Cs5, dur, "saw") * 0.35 + osc(E5, dur, "sine") * 0.2
    return lowpass(x, 4000) * adsr(dur, 0.004, 0.2, 0.6, 0.25)


@sound(SOUNDS, peak=-10)
def split():
    # A split time: two quick notes, E5 and B5 (higher when ahead).
    return seq([E5, B5], 0.07, lambda f, i: pluck(f, 0.18, 0.14) + 0.4 * bell(f, 0.18, 0.12, index=1))


@sound(SOUNDS, peak=-5)
def finish():
    # Over the line: cowbells shaking and a brass call, A to B to C# major.
    bells = [(i * 0.11 + (0.02 if i % 2 else 0), cowbell(Cs5 if i % 3 else Gs4, 0.3, 0.25) * (1 - i * 0.08)) for i in range(6)]
    stab = lambda freqs, dur: chord(freqs, dur, lambda f, d: brass(f, d, release=0.06))
    call = [
        (0.0, stab([A4, Cs5, E5], E8 * 0.9)),
        (E8, stab([B4, Ds5, Fs5], E8 * 0.9)),
        (E8 * 2, stab([Cs5, F5, Gs5], E8 * 3.5)),
    ]
    return reverb(place(*[(t, 0.45 * b) for t, b in bells], *call), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-5)
def record():
    # A new record: bells running up to G#6, then a C# major chord.
    run = seq([Cs5, E5, Gs5, Cs6, E6, Gs6], S16 * 0.6, lambda f, i: bell(f, 0.5, 0.2, index=1.6))
    stab = chord([Cs5, F5, Gs5, Cs6], E8 * 4, lambda f, d: brass(f, d, attack=0.02, release=0.35, bright=3600))
    return reverb(place((0, run), (S16 * 3.6, 0.8 * stab), (S16 * 3.6, 0.4 * bell(Cs6, 1.2, 1.0))), 0.2, IR_ROOM)


@sound(SOUNDS, peak=-6)
def over():
    # Game over: a slow fall down C# minor, G#4 F#4 E4 D#4 to C#4.
    notes = [Gs4, Fs4, E4, Ds4, Cs4]

    def voice(f, i):
        d = 0.6 if i == 4 else 0.24
        x = osc(f, d, "triangle") + 0.3 * osc(f / 2, d, "saw")
        return lowpass(x, 1800) * env(d, 0.01, 0.55 if i == 4 else 0.2)

    return reverb(seq(notes, E8, voice), 0.15, IR_ROOM)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-14)
def move():
    dur = 0.06
    return osc(E6, dur, "triangle") * env(dur, 0.001, 0.05)


@sound(SOUNDS, peak=-10)
def select():
    return seq([Gs5, Cs6], 0.06, lambda f, i: osc(f, 0.12, "triangle") * env(0.12, 0.001, 0.1))


@sound(SOUNDS, peak=-12)
def back():
    return seq([Cs6, Gs5], 0.06, lambda f, i: osc(f, 0.12, "triangle") * env(0.12, 0.001, 0.1))


@sound(SOUNDS, peak=-10)
def pause():
    return seq([Cs6, Gs5], 0.07, lambda f, i: bell(f, 0.3, 0.22, index=1.2))


if __name__ == "__main__":
    write_all(SOUNDS, "snow-slalom", only=sys.argv[1:] or None)
