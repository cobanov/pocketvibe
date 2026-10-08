"""Turbo Circuit's sound effects: an arcade racer set in A minor, to sit with
the music (eurobeat / synthwave racing, A minor, 150 BPM).

Four loops follow the cars in the game (sound.js loop(), volume and pitch set
every frame): the engine, tyre squeal, the grass rattle and the curb rumble.
They are built from parts that repeat a whole number of times in the loop
(noise is filtered circularly, in the frequency domain), so they loop without
a seam and need no crossfade. The engine's fundamental is A2 (110 Hz) at
rate 1; the game plays it from about 0.6x to 1.8x through a fake gearbox.

Tonal one-shots use A minor (A B C D E F G); the finish jingles move in
8ths and 16ths of the music's tempo and the winner's ends on A major.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/turbo-circuit.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 150
E8 = 60 / BPM / 2  # an 8th note, s
S16 = E8 / 2

A2, E3, A3, C4, E4 = note("A2"), note("E3"), note("A3"), note("C4"), note("E4")
F4, G4, A4, B4 = note("F4"), note("G4"), note("A4"), note("B4")
C5, D5, E5, F5, G5, A5, B5 = (note(n) for n in ("C5", "D5", "E5", "F5", "G5", "A5", "B5"))
C6, Cs6, D6, E6, A6 = note("C6"), note("C#6"), note("D6"), note("E6"), note("A6")
Cs5 = note("C#5")


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


def circular_lowpass(x, cutoff):
    """A lowpass that treats x as one period of a loop."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec / np.sqrt(1 + (f / cutoff) ** 4), len(x))


def bell(freq, dur, decay, index=2.2, ratio=3.5):
    """FM bell: bright attack that mellows as it rings."""
    t = t_axis(dur)
    mod = index * env(dur, 0.001, decay * 0.5) * np.sin(2 * np.pi * freq * ratio * t)
    return np.sin(2 * np.pi * freq * t + mod) * env(dur, 0.002, decay)


def brass(freq, dur, attack=0.012, release=0.08, bright=3000):
    """A synth-brass stab: two detuned saws through a lowpass."""
    x = osc(freq, dur, "saw") + 0.7 * osc(freq * 1.006, dur, "saw")
    x = lowpass(x, bright, order=2)
    return x * adsr(dur, attack, 0.15, 0.7, release)


def pluck(freq, dur, decay=0.25):
    """Bright synth pluck (pulse with a falling filter)."""
    x = osc(freq, dur, "pulse", duty=0.3)
    return sweep_filter(x, 5000, 900) * env(dur, 0.002, decay)


def chord(freqs, dur, voice):
    return sum(voice(f, dur) for f in freqs) / len(freqs)


# ---------------------------------------------------------------- loops

@sound(SOUNDS, peak=-10, loop=True)
def engine():
    # One firing cycle repeats 44 times in 0.4 s (A2, 110 Hz), with a half-
    # speed crank thump under it. Every cycle is a little louder or softer
    # than the last (smoothed, and wrapping around), which gives the growl.
    dur = 0.4
    t = t_axis(dur)
    f = A2
    x = np.zeros_like(t)
    for k in range(1, 22):
        amp = 1.0 / k ** 0.85
        if k % 2 == 0:
            amp *= 1.15  # even harmonics: a fuller, rounder buzz
        x += amp * np.sin(2 * np.pi * f * k * t + k * 0.7)
    x += 0.55 * np.sin(2 * np.pi * f / 2 * t)  # crank
    cycles = int(round(dur * f))
    jitter = 1 + 0.12 * np.random.default_rng(5).standard_normal(cycles)
    jitter = (jitter + np.roll(jitter, 1) + np.roll(jitter, -1)) / 3
    x *= jitter[np.minimum((t * f).astype(int), cycles - 1)]
    # Exhaust breath: noise pulsing with each firing.
    pulse = 0.5 + 0.5 * np.cos(2 * np.pi * f * t)
    x += 0.35 * periodic_noise(dur, 150, 1800, tilt=0.8) * pulse ** 3
    x = circular_lowpass(x, 2400)
    return drive(x / np.max(np.abs(x)), 1.6)


@sound(SOUNDS, peak=-12, loop=True)
def screech():
    # A squealing tone near C6 that wobbles 8 times a second, over a band of
    # hiss: everything repeats whole within 0.5 s.
    dur = 0.5
    t = t_axis(dur)
    whole = lambda f: round(f * dur) / dur  # a whole number of cycles in the loop
    tone = np.sin(2 * np.pi * whole(C6) * t + 9 * np.sin(2 * np.pi * 8 * t))
    tone += 0.45 * np.sin(2 * np.pi * whole(E6) * t + 6 * np.sin(2 * np.pi * 12 * t))
    hiss = periodic_noise(dur, 1200, 4200)
    rough = 0.75 + 0.25 * np.sin(2 * np.pi * 26 * t)
    return (0.6 * tone + 0.5 * hiss) * rough


@sound(SOUNDS, peak=-12, loop=True)
def offroad():
    # Grass and dirt: a low rumble with gravel ticks, bumping 6 times in 0.6 s.
    dur = 0.6
    t = t_axis(dur)
    rumble = periodic_noise(dur, 40, 500, tilt=1.2)
    ticks = periodic_noise(dur, 900, 3200) * (periodic_noise(dur, 4, 30) > 0.35)
    bump = 0.7 + 0.3 * np.sin(2 * np.pi * 10 * t) ** 2
    return (rumble * bump + 0.3 * ticks) / 1.3


@sound(SOUNDS, peak=-12, loop=True)
def rumble():
    # Curbs: 8 thumps in 0.4 s (20 a second at rate 1), each a short low
    # knock with a click; the last one's tail wraps into the start.
    dur = 0.4
    n = int(round(dur * SR))
    out = np.zeros(n)
    hit = 0.045
    tt = t_axis(hit)
    knock = np.sin(2 * np.pi * 78 * tt) * env(hit, 0.001, 0.04) + 0.25 * bandpass(noise(hit), 600, 2400) * env(hit, 0.0005, 0.012)
    for k in range(8):
        i = int(k * n / 8)
        idx = (i + np.arange(len(knock))) % n
        out[idx] += knock * (1.0 if k % 2 == 0 else 0.8)
    return out


# ---------------------------------------------------------------- race

@sound(SOUNDS, peak=-8)
def boost():
    # Turbo: a rising whoosh and a saw sweeping up an octave (A3 to A4).
    dur = 0.75
    whoosh = sweep_filter(noise(dur), 350, 3200, kind="band", q=1.6) * env(dur, 0.04, 0.7)
    tone = glide(A3, A4, dur, "saw", curve=0.6) + 0.5 * glide(E3, E4, dur, "saw", curve=0.6)
    tone = lowpass(tone, 2600) * env(dur, 0.02, 0.6)
    return whoosh + 0.45 * tone


@sound(SOUNDS, peak=-11)
def cone():
    # A plastic cone knocked flying: a hollow bonk and a click.
    dur = 0.2
    bonk = glide(470, 360, dur, "triangle") * env(dur, 0.001, 0.12)
    click = bandpass(noise(dur), 1200, 3500) * env(dur, 0.0005, 0.02)
    return bonk + 0.5 * click


@sound(SOUNDS, peak=-8)
def bump():
    # Car against car: a thud with a short metallic clank.
    dur = 0.32
    thud = glide(120, 55, dur, "sine", curve=0.5) * env(dur, 0.001, 0.18)
    clank = fm(310, 1.41, ramp(dur, 3, 0.5), dur) * env(dur, 0.001, 0.12)
    crunch = lowpass(noise(dur), 2200) * env(dur, 0.001, 0.07)
    return thud + 0.35 * clank + 0.4 * crunch


@sound(SOUNDS, peak=-9)
def wall():
    # Scraping the trackside boards: a dull knock and a short gritty scrape.
    dur = 0.34
    knock = glide(95, 60, dur, "sine") * env(dur, 0.001, 0.14)
    scrape = bandpass(noise(dur), 500, 2600) * env(dur, 0.005, 0.28) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * t_axis(dur)))
    return knock + 0.55 * scrape


@sound(SOUNDS, peak=-8)
def beep():
    # Countdown 3, 2, 1: A4.
    dur = 0.24
    x = osc(A4, dur, "square") * 0.5 + osc(A4 * 2, dur, "sine") * 0.3
    return lowpass(x, 3500) * adsr(dur, 0.004, 0.08, 0.7, 0.05)


@sound(SOUNDS, peak=-6)
def go():
    # GO: A5 over A4, longer and brighter.
    dur = 0.7
    x = osc(A5, dur, "square") * 0.45 + osc(A4, dur, "saw") * 0.35 + osc(E5, dur, "sine") * 0.2
    return lowpass(x, 4200) * adsr(dur, 0.004, 0.2, 0.6, 0.3)


@sound(SOUNDS, peak=-8)
def lap():
    # A lap done: a quick A minor arpeggio of bells.
    return seq([A4, C5, E5, A5], S16 * 0.8, lambda f, i: bell(f, 0.5, 0.4 if i == 3 else 0.2))


@sound(SOUNDS, peak=-6)
def final():
    # Final lap: an urgent brass call, E5 E5 A5 (rising).
    return place(
        (0, brass(E5, S16 * 0.9)),
        (S16, brass(E5, S16 * 0.9)),
        (E8, brass(A5, E8 * 2.2, release=0.2)),
        (E8, 0.5 * brass(E5, E8 * 2.2, release=0.2)),
    )


@sound(SOUNDS, peak=-12)
def overtake():
    # Gained a place: a quick upward blip, E5 to A5.
    return seq([E5, A5], 0.055, lambda f, i: pluck(f, 0.1, 0.07))


@sound(SOUNDS, peak=-9)
def warn():
    # WRONG WAY: two low buzzes.
    one = lambda f, i: lowpass(osc(f, 0.13, "square"), 1800) * adsr(0.13, 0.004, 0.05, 0.8, 0.03)
    return seq([A3, A3], 0.17, one)


@sound(SOUNDS, peak=-12)
def tick():
    # FINISH IN ...: a short tick, E5.
    dur = 0.08
    return (osc(E5, dur, "triangle") + 0.3 * osc(E5 * 2, dur, "sine")) * env(dur, 0.001, 0.06)


# ---------------------------------------------------------------- finish

@sound(SOUNDS, peak=-4)
def win():
    # First place: F and G brass stabs up to a big A major chord, with a
    # rising lead (C6 D6 C#6) and a final bell.
    stab = lambda freqs, dur: chord(freqs, dur, lambda f, d: brass(f, d, release=0.05))
    parts = [
        (0, stab([F4, A4, C5], E8 * 0.9)),
        (E8, stab([G4, B4, D5], E8 * 0.9)),
        (E8 * 2, stab([A4, Cs5, E5], E8 * 5)),
        (0, 0.6 * brass(C6, E8 * 0.9, bright=4000)),
        (E8, 0.6 * brass(D6, E8 * 0.9, bright=4000)),
        (E8 * 2, 0.6 * brass(Cs6, E8 * 5, release=0.4, bright=4000)),
        (E8 * 2, 0.5 * bell(A5, 1.4, 1.2)),
        (E8 * 2, 0.4 * osc(A2, E8 * 5, "saw") * env(E8 * 5, 0.01, 1.2)),
    ]
    return reverb(place(*parts), 0.18, IR_ROOM)


@sound(SOUNDS, peak=-5)
def podium():
    # Second or third: an A minor arpeggio, then G resolving up to A.
    notes = seq([A4, C5, E5, A5], S16, lambda f, i: pluck(f, 0.3, 0.22))
    tail = place((0, 0.8 * brass(G5, E8 * 0.9)), (E8, brass(A5, E8 * 3, release=0.3)), (E8, 0.6 * brass(E5, E8 * 3, release=0.3)))
    return reverb(place((0, notes), (S16 * 4, tail)), 0.15, IR_ROOM)


@sound(SOUNDS, peak=-6)
def lose():
    # Last, or time up: a slow fall down A minor, E5 D5 C5 B4 to A4.
    notes = [E5, D5, C5, B4, A4]
    voice = lambda f, i: lowpass(osc(f, 0.6 if i == 4 else 0.24, "triangle") + 0.3 * osc(f / 2, 0.6 if i == 4 else 0.24, "saw"), 2000) * env(0.6 if i == 4 else 0.24, 0.01, 0.55 if i == 4 else 0.2)
    return reverb(seq(notes, E8, voice), 0.15, IR_ROOM)


@sound(SOUNDS, peak=-7)
def record():
    # A new record: a sparkling run of bells up to A6.
    return reverb(seq([A5, C6, E6, A6, E6, A6], S16 * 0.7, lambda f, i: bell(f, 0.6, 0.45, index=1.6)), 0.2, IR_ROOM)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-14)
def move():
    dur = 0.06
    return osc(E5 * 2, dur, "triangle") * env(dur, 0.001, 0.05)


@sound(SOUNDS, peak=-10)
def select():
    return seq([A5, E6], 0.06, lambda f, i: osc(f, 0.12, "triangle") * env(0.12, 0.001, 0.1))


@sound(SOUNDS, peak=-12)
def back():
    return seq([E5, A4], 0.06, lambda f, i: osc(f, 0.12, "triangle") * env(0.12, 0.001, 0.1))


@sound(SOUNDS, peak=-11)
def shift():
    # A different circuit: a short swish and a blip on C6.
    dur = 0.22
    swish = sweep_filter(noise(dur), 600, 2800, kind="band", q=1.5) * env(dur, 0.02, 0.18)
    blip = osc(C6, 0.1, "triangle") * env(0.1, 0.001, 0.08)
    return place((0, 0.6 * swish), (0.03, blip))


@sound(SOUNDS, peak=-10)
def pause():
    return seq([A5, E5], 0.07, lambda f, i: bell(f, 0.3, 0.22, index=1.2))


if __name__ == "__main__":
    write_all(SOUNDS, "turbo-circuit", only=sys.argv[1:] or None)
