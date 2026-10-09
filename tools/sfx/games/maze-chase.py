"""Maze Chase's sound effects: a chiptune arcade set in C minor, to sit with
the music (retro arcade synthwave with a chiptune flavour, C minor, 132 BPM).

Tonal sounds use C minor (C D Eb F G Ab Bb); jingles move in 16ths of the
music's tempo. The dot chirp comes in two halves (dot falls, dot2 rises) that
the game plays in turn for the classic eating chatter; it is the most frequent
sound, so it is short, soft and quiet. The drone eaten bloop is played higher
for every drone eaten during one fright (up C minor with playback rate). The
two loops (fright, home) are whole periods long and fade to silence at every
period's edge, so they repeat without a seam.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/maze-chase.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 132
S16 = 60 / BPM / 4  # a 16th note, s

C3, G3, Ab3, Bb3 = note("C3"), note("G3"), note("G#3"), note("A#3")
C4, D4, Eb4, F4, G4, Ab4, Bb4 = (note(n) for n in ("C4", "D4", "D#4", "F4", "G4", "G#4", "A#4"))
C5, D5, Eb5, F5, G5, Ab5, Bb5 = (note(n) for n in ("C5", "D5", "D#5", "F5", "G5", "G#5", "A#5"))
C6, D6, Eb6, F6, G6, Bb6 = (note(n) for n in ("C6", "D6", "D#6", "F6", "G6", "A#6"))
C7 = note("C7")


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
    """A round triangle bass, kept above 200 Hz or close to it for small speakers."""
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


def mix(*layers):
    """Sums layers of different lengths: (gain, samples)."""
    n = max(len(x) for _, x in layers)
    return sum(g * pad(x, n / SR) for g, x in layers)


def sweeps(period, count, f0, f1, wave="triangle", shape=0.5):
    """A run of identical pitch sweeps f0 -> f1, each `period` long, each
    faded in and out to silence at its edges (so a run loops without a seam)."""
    n = int(round(period * SR))
    i = np.arange(n)
    t = i / n
    edge = np.minimum(1, np.minimum(i, n - 1 - i) / (0.002 * SR))
    pitch = np.tile(f0 * (f1 / f0) ** t, count)
    amp = np.tile(np.sin(np.pi * t) ** shape * edge, count)
    return osc(pitch, n * count / SR, wave) * amp


def loop_lowpass(x, cutoff):
    """A low-pass for a loop: filtered as if it had already been playing, so
    the end runs on into the start."""
    return lowpass(np.concatenate([x, x]), cutoff)[len(x):]


# ---------------------------------------------------------------- play

@sound(SOUNDS, peak=-16)
def dot():
    """A dot, first half of the chatter: a quick soft fall, G5 to Eb5."""
    dur = 0.07
    tone = osc(expramp(dur, G5, Eb5), dur, "triangle") + 0.25 * osc(expramp(dur, G5, Eb5), dur, "square")
    return lowpass(tone * env(dur, 0.002, 0.06), 3800)


@sound(SOUNDS, peak=-16)
def dot2():
    """A dot, second half of the chatter: a quick soft rise, Eb5 to G5."""
    dur = 0.07
    tone = osc(expramp(dur, Eb5, G5), dur, "triangle") + 0.25 * osc(expramp(dur, Eb5, G5), dur, "square")
    return lowpass(tone * env(dur, 0.002, 0.06), 3800)


@sound(SOUNDS, peak=-8)
def core():
    """A power core: a punchy zap rising C4 to C6 and a bright ring on top."""
    dur = 0.32
    zap = osc(expramp(0.16, C4, C6, 0.7), 0.16, "square") * env(0.16, 0.002, 0.15)
    fmz = fm(C5, 1.5, ramp(dur, 4, 0.3), dur) * env(dur, 0.002, 0.25)
    ring = place((0.1, bell(G5, 0.25, 0.2)), (0.14, bell(C6, 0.3, 0.26)))
    return lowpass(mix((0.55, zap), (0.35, fmz), (0.7, ring)), 6000)


@sound(SOUNDS, peak=-14, loop=True)
def fright():
    """Frightened drones: a wobbling rise, G4 up to D5, eight a second (two
    beats of the music in all). The game plays it faster as the fright runs out."""
    count = 8
    period = 2 * 60 / BPM / count
    wob = sweeps(period, count, G4, D5, "triangle", 0.6) + 0.3 * sweeps(period, count, G4, D5, "square", 0.6)
    return loop_lowpass(wob, 3000)


@sound(SOUNDS, peak=-17, loop=True)
def home():
    """Eaten drones flying home: a thin, fast, high whistle falling C6 to G5."""
    count = 16
    period = 2 * 60 / BPM / count
    return loop_lowpass(sweeps(period, count, C6, G5, "sine", 0.4), 5000)


@sound(SOUNDS, peak=-8)
def eat():
    """A drone eaten: a rising bloop, C5 up two octaves, with a sparkle. The
    game raises it for every drone in a row."""
    dur = 0.3
    bloop = osc(expramp(0.2, C5, C7, 0.8), 0.2, "square") * env(0.2, 0.002, 0.18)
    body = osc(expramp(0.2, C4, C6, 0.8), 0.2, "triangle") * env(0.2, 0.002, 0.16)
    sparkle = place((0.12, bell(G6, 0.18, 0.15) * 0.4))
    return lowpass(mix((0.5, bloop), (0.6, body), (1.0, sparkle)), 6500) * env(dur, 0.001, 0.4, hold=0.2)


@sound(SOUNDS, peak=-15)
def revive():
    """An eaten drone gets home and comes back: a soft two-step pop, C5 then G5."""
    return place((0.0, chip(C5, 0.06, 0.5, decay=0.05, cutoff=3000)), (0.05, chip(G5, 0.1, 0.5, decay=0.08, cutoff=3000)))


@sound(SOUNDS, peak=-5)
def death():
    """Caught: a sting at once, then (matching the robot's spin from 0.5 s)
    falling warbles winding down C minor, and a pop at 1.4 s when it bursts."""
    sting = lowpass(osc(expramp(0.12, C6, C5), 0.12, "square") * env(0.12, 0.001, 0.11), 4500)
    sting += pad(bandpass(noise(0.1), 1500, 6000) * env(0.1, 0.001, 0.06), 0.12) * 0.4
    tops = [G5, F5, Eb5, D5, C5, Bb4, Ab4, G4]
    falls = [
        (0.5 + i * 0.11, lowpass(osc(expramp(0.11, f, f / 1.5), 0.11, "triangle") * np.sin(np.pi * t_axis(0.11) / 0.11) ** 0.7, 3500))
        for i, f in enumerate(tops)
    ]
    pop = bandpass(noise(0.25, "pink"), 300, 5000) * env(0.25, 0.001, 0.18)
    thump = np.sin(2 * np.pi * np.cumsum(expramp(0.18, 300, 90)) / SR) * env(0.18, 0.002, 0.15)
    return place((0.0, sting * 0.8), *falls, (1.4, pop * 0.9), (1.4, thump * 0.6))


@sound(SOUNDS, peak=-11)
def gem_on():
    """The bonus pickup appears: a two-note sparkle, G5 to C6."""
    return place((0.0, bell(G5, 0.14, 0.11)), (0.06, bell(C6, 0.22, 0.18)))


@sound(SOUNDS, peak=-7)
def gem():
    """The bonus picked up: a quick bright run C6 Eb6 G6 C7 with a shimmer."""
    run = jingle([(C6, 1), (Eb6, 1), (G6, 1), (C7, 3)], lambda f, d: chip(f, d, 0.25, cutoff=7000), step=0.045)
    shimmer = place((0.13, bell(G6, 0.25, 0.2) * 0.35))
    return reverb(mix((1.0, run), (1.0, shimmer)), 0.12, IR_SMALL)


@sound(SOUNDS, peak=-16)
def tunnel():
    """Through a side tunnel: a soft whoosh, a noise band sweeping down."""
    dur = 0.35
    return sweep_filter(noise(dur), 3500, 500, "band", 1.6) * env(dur, 0.08, 0.27, curve=5)


# ---------------------------------------------------------------- level and game

@sound(SOUNDS, peak=-6)
def ready():
    """A level begins: a one-bar tune in 16ths over a walking bass, ending on G."""
    lead = jingle(
        [(C5, 1), (G4, 1), (C5, 1), (Eb5, 1), (D5, 2), (C5, 2), (Bb4, 1), (C5, 1), (D5, 1), (Eb5, 1), (G5, 4)],
        lambda f, d: chip(f, d, 0.25),
    )
    echo_ = jingle([(None, 12), (D5, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3000) * 0.35)
    low = jingle([(C4, 4), (Ab3, 4), (Bb3, 4), (G3, 4)], lambda f, d: bass(f, d) + bass(f * 2, d) * 0.5)
    return reverb(mix((1.0, lead), (1.0, echo_), (0.5, low)), 0.12, IR_SMALL)


@sound(SOUNDS, peak=-10)
def retry():
    """Back in after losing a life: a short pickup, G4 to C5."""
    return place((0.0, chip(G4, S16, 0.25)), (S16, chip(C5, S16 * 3, 0.25)))


@sound(SOUNDS, peak=-5)
def clear():
    """A maze cleared: a run up C minor and a bright landing on C."""
    lead = jingle(
        [(C5, 1), (Eb5, 1), (G5, 1), (C6, 1), (Bb5, 1), (G5, 1), (Ab5, 1), (Bb5, 1), (C6, 4)],
        lambda f, d: chip(f, d, 0.25),
    )
    harmony = jingle([(None, 8), (G5, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35)
    low = jingle([(C4, 4), (Eb4, 2), (G4, 2), (C4, 4)], bass)
    return reverb(mix((1.0, lead), (1.0, harmony), (0.5, low)), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-6)
def life():
    """Extra life: a quick 1-up arpeggio up to C6 with a sparkle."""
    lead = jingle([(C5, 1), (Eb5, 1), (G5, 1), (C6, 3)], lambda f, d: chip(f, d, 0.25, cutoff=5000), step=0.065)
    sparkle = place((0.2, bell(G6, 0.25, 0.2) * 0.3), (0.26, bell(C7, 0.2, 0.15) * 0.2))
    return reverb(mix((1.0, lead), (1.0, sparkle)), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-5)
def over():
    """Game over: a slow fall down the scale to a low C."""
    def voice(f, d):
        return lowpass(osc(f, d, "square") * adsr(d, 0.006, 0.15, 0.6, 0.06), 1800)
    lead = jingle([(G4, 2), (F4, 2), (Eb4, 2), (D4, 2), (C4, 6)], voice)
    low = jingle([(C4, 4), (Bb3, 4), (C4, 6)], lambda f, d: bass(f, d) + bass(f * 2, d) * 0.5)
    return reverb(mix((1.0, lead), (0.4, low)), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-4)
def record():
    """A new best score: a bright fanfare with a trill on top."""
    lead = jingle(
        [(G4, 1), (C5, 1), (Eb5, 1), (G5, 2), (Eb5, 1), (G5, 1), (C6, 1), (Bb5, 1), (C6, 1), (Bb5, 1), (C6, 4)],
        lambda f, d: chip(f, d, 0.25),
    )
    fifth = jingle([(None, 11), (G5, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35)
    low = jingle([(C4, 5), (G3, 3), (Eb4, 3), (C4, 4)], bass)
    return reverb(mix((1.0, lead), (1.0, fifth), (0.5, low)), 0.2, IR_SMALL)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    """Menu cursor: a short soft blip."""
    dur = 0.05
    return np.sin(2 * np.pi * G5 * t_axis(dur)) * env(dur, 0.001, 0.04) + pad(click(0.004), dur) * 0.2


@sound(SOUNDS, peak=-10)
def select():
    """Menu confirm or switch: two quick notes up, C to G."""
    return place((0.0, bell(C5, 0.08, 0.07)), (0.05, bell(G5, 0.14, 0.12)))


@sound(SOUNDS, peak=-12)
def back():
    """Back or resume: two quick notes down, G to C."""
    return lowpass(place((0.0, bell(G5, 0.08, 0.07)), (0.05, bell(C5, 0.14, 0.12))), 4000)


@sound(SOUNDS, peak=-10)
def pause():
    """The pause menu opens: a soft falling pair, Eb to C."""
    return lowpass(place((0.0, bell(Eb5, 0.14, 0.12, 0.6)), (0.07, bell(C5, 0.26, 0.22, 0.6))), 3500)


@sound(SOUNDS, peak=-6)
def start():
    """A new game: a fast run up C minor."""
    notes = [(C4, 1), (G4, 1), (C5, 1), (Eb5, 1), (G5, 3)]
    lead = jingle(notes, lambda f, d: chip(f, d, 0.25), step=0.05)
    sparkle = place((0.2, bell(C6, 0.3, 0.25) * 0.3))
    return reverb(mix((1.0, lead), (1.0, sparkle)), 0.12, IR_SMALL)


if __name__ == "__main__":
    write_all(SOUNDS, "maze-chase")
