"""Sound effects for Crate Pusher (games/crate-pusher/public/sfx/).

A cosy toy warehouse, to sit with relaxed electric piano and vibraphone
music in B-flat major at 92 BPM: jingles and chimes are vibraphone and
electric piano on notes of B-flat major (the spot chime is a Bb4 bar the
game raises along the scale as crates find their spots), and the worker's
own sounds (footsteps, the crate scraping over tiles, bumps) are short dry
knocks and scrapes with their energy between 300 Hz and 4 kHz for the
handheld's small speaker. The frequent ones are short and quiet.

Run:
    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/crate-pusher.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import synth  # noqa: E402
from synth import *  # noqa: E402,F403

SOUNDS = {}
BEAT = 60 / 92  # one beat of the music
SIXTEENTH = BEAT / 4


# ---------------------------------------------------------------- voices

def vibes(freq, dur=0.8, decay=0.6, bright=1.0, trem=5.0):
    """A vibraphone bar: the fundamental and the bar's 4th and 10th
    partials, the upper ones fading first, a soft mallet and the motor's
    slow tremolo."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.002, decay)
    if freq * 4 < 8000:
        out += 0.22 * bright * np.sin(2 * np.pi * freq * 4 * t) * env(dur, 0.001, decay * 0.3)
    if freq * 10 < 8000:
        out += 0.05 * bright * np.sin(2 * np.pi * freq * 10 * t) * env(dur, 0.001, decay * 0.08)
    out *= 1 - 0.2 * (0.5 + 0.5 * np.sin(2 * np.pi * trem * t))
    tap = lowpass(noise(dur), 2500) * env(dur, 0.0005, 0.01) * 0.08
    return out + tap


def epiano(freq, dur, decay, bright=1.0):
    """A soft electric piano: two-operator FM whose bark fades fast, a slow
    tremolo, rounded off with a lowpass."""
    idx = 1.1 * bright * env(dur, 0.001, decay * 0.3) + 0.12
    x = fm(freq, 1.0, idx, dur) * env(dur, 0.006, decay)
    x *= 1 - 0.1 * (0.5 + 0.5 * np.sin(2 * np.pi * 4.3 * t_axis(dur)))
    return lowpass(x, 4200)


def bell(freq, dur, decay, bright=1.0):
    """A small glassy bell: harmonic partials only, so it stays in tune."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, amp, dk in ((1, 1.0, 1.0), (2, 0.3 * bright, 0.5), (3, 0.1 * bright, 0.3)):
        if freq * ratio < 7500:
            out += amp * np.sin(2 * np.pi * freq * ratio * t) * env(dur, 0.002, decay * dk)
    return out


def chord(names, dur, decay, voice=epiano, spread=0.0, **kw):
    """Several notes together (spread staggers them like a roll)."""
    return place(*[(i * spread, voice(note(n), dur, decay, **kw)) for i, n in enumerate(names)])


def modes(dur, parts, click=0.4, click_band=(1500, 5000), click_decay=0.006):
    """A struck object: damped sine modes (freq, amp, decay) and a click."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for f, a, dk in parts:
        out += a * np.sin(2 * np.pi * f * t) * env(dur, 0.0005, dk)
    out += bandpass(noise(dur), *click_band) * env(dur, 0.0003, click_decay) * click
    return out


def soften(x, cutoff=7000):
    """Takes the edge off noisy sounds above about 8 kHz."""
    return lowpass(x, cutoff, 4)


# ---------------------------------------------------------------- the worker

def footstep(centre, body):
    # A soft rubber sole on a tile: a short padded tap and a little body.
    d = 0.07
    tap = bandpass(noise(d, "pink"), centre * 0.55, centre * 1.8) * env(d, 0.001, 0.025)
    tap /= np.max(np.abs(tap)) + 1e-9
    thump = osc(expramp(d, body, body * 0.7), d) * env(d, 0.001, 0.03) * 0.3
    return soften(tap + thump, 5000)


@sound(SOUNDS, peak=-16)
def step_a():
    # Left foot: a quiet padded tap (the game alternates the two feet).
    return footstep(1500, 420)


@sound(SOUNDS, peak=-16)
def step_b():
    # Right foot: the same tap a touch lower and duller.
    return footstep(1250, 380)


@sound(SOUNDS, peak=-12)
def push():
    # A wooden crate scraping one tile along: a grainy rasp that sticks and
    # slips, over the crate's hollow creak, and a soft shove at the start.
    d = 0.2
    t = t_axis(d)
    rasp = bandpass(noise(d), 350, 2200)
    grit = 0.55 + 0.45 * np.abs(bandpass(crackle(d, 140, 0.004), 200, 2000))
    grit /= np.max(grit)
    shape = adsr(d, 0.012, 0.05, 0.75, 0.07)
    creak = osc(vibrato(560, d, 23, 0.4), d, "triangle") * env(d, 0.01, 0.12) * 0.25
    shove = modes(d, ((300, 0.6, 0.04), (760, 0.5, 0.03)), click=0.2, click_band=(800, 3000))
    return soften(rasp * grit * shape + creak + shove * 0.6, 5500)


@sound(SOUNDS, peak=-14)
def bump():
    # Walking into a wall: a soft padded thud.
    d = 0.13
    body = osc(expramp(d, 440, 230, 0.6), d) * env(d, 0.002, 0.07)
    pad = bandpass(noise(d, "pink"), 400, 1800) * env(d, 0.001, 0.03)
    pad /= np.max(np.abs(pad)) + 1e-9
    return lowpass(body + pad * 0.7, 3500)


@sound(SOUNDS, peak=-13)
def block():
    # Shoving a crate that will not budge: a dull hollow knock on wood.
    d = 0.14
    knock = modes(d, ((410, 1.0, 0.05), (980, 0.55, 0.035), (2150, 0.2, 0.015)), click=0.35, click_band=(900, 3500), click_decay=0.008)
    thump = osc(expramp(d, 260, 160), d) * env(d, 0.001, 0.05) * 0.4
    return soften(knock + thump, 5000)


@sound(SOUNDS, peak=-13)
def drop():
    # A crate landing on a fresh board: a woody tock with a light thump.
    d = 0.12
    tock = modes(d, ((620, 1.0, 0.04), (1460, 0.45, 0.025), (300, 0.6, 0.05)), click=0.4, click_band=(1000, 4000))
    return soften(tock, 5500)


# ---------------------------------------------------------------- spots

@sound(SOUNDS, peak=-10)
def home():
    # A crate settles on its spot: a vibraphone bar on Bb4 with a glassy
    # bell an octave up. The game raises it along B-flat major (Bb C D F G)
    # as more crates find their spots.
    d = 0.75
    f = note("A#4")
    bar = vibes(f, d, 0.55)
    ring = bell(f * 2, d, 0.35, 0.5) * 0.35
    return place((0, bar + ring))


@sound(SOUNDS, peak=-15)
def off():
    # A crate pushed off its spot: a muted electric piano falling F5 to D5.
    a = epiano(note("F5"), 0.18, 0.12, 0.6)
    b = epiano(note("D5"), 0.3, 0.2, 0.6)
    return place((0, a), (0.07, b))


@sound(SOUNDS, peak=-11)
def stuck():
    # A crate shoved where it can never get out: a soft "uh-oh", C5 sliding
    # down to A4 on a woody marimba tone.
    def mallet(f, d):
        t = t_axis(d)
        return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 4 * t) * env(d, 0.001, 0.05)) * env(d, 0.002, 0.22)

    return lowpass(place((0, mallet(note("C5"), 0.22)), (0.13, mallet(note("A4"), 0.4))), 5000)


# ---------------------------------------------------------------- undo and restart

@sound(SOUNDS, peak=-15)
def undo():
    # One move taken back: a short reversed whoosh that swells and stops,
    # with a faint rising blip.
    d = 0.13
    t = t_axis(d)
    swell = (t / d) ** 2.5
    air = sweep_filter(noise(d, "pink"), 700, 2600, "band", q=1.6) * swell
    blip = osc(expramp(d, 520, 880, 1.5), d) * swell * 0.25
    x = air + blip
    x[-int(0.006 * SR):] *= np.linspace(1, 0, int(0.006 * SR))
    return soften(x, 5000)


@sound(SOUNDS, peak=-10)
def restart():
    # The level set back: a quick tape-rewind chirp running down, a whoosh
    # and a soft poof as the crates vanish.
    d = 0.42
    chirp = osc(expramp(0.26, 1500, 380, 0.8), 0.26, "triangle") * env(0.26, 0.004, 0.22) * 0.35
    whoosh = sweep_filter(noise(d, "pink"), 2600, 500, "band", q=1.5) * env(d, 0.02, 0.32)
    poof = bandpass(noise(0.2), 300, 1500) * env(0.2, 0.004, 0.12) * 0.6
    return soften(place((0, whoosh), (0, lowpass(chirp, 4000)), (0.18, poof)), 5000)


@sound(SOUNDS, peak=-11)
def restore():
    # B right after a restart brings the moves back: the rewind running
    # forwards, a quick upward glissando Bb4 D5 F5 Bb5 on vibraphone.
    run = seq([note(n) for n in ("A#4", "D5", "F5", "A#5")], 0.04, lambda f, i: vibes(f, 0.35, 0.22, 0.7))
    air = sweep_filter(noise(0.25, "pink"), 600, 2400, "band", q=1.5) * env(0.25, 0.08, 0.12) * 0.4
    return soften(place((0, air), (0.02, run)), 6000)


# ---------------------------------------------------------------- levels

@sound(SOUNDS, peak=-9)
def start():
    # A level begins: a rolled electric piano chord, Bb major with an added
    # ninth (Bb3 F4 C5 D5).
    return chord(("A#3", "F4", "C5", "D5"), 0.8, 0.6, spread=0.025)


@sound(SOUNDS, peak=-6)
def clear():
    # Level solved: a vibraphone figure F5 G5 Bb5 over a warm Bb major chord.
    fig = seq([note(n) for n in ("F5", "G5", "A#5")], SIXTEENTH, lambda f, i: vibes(f, 0.6, 0.45))
    pad = chord(("A#3", "D4", "F4", "A#4"), 1.2, 1.0, spread=0.015) * 0.5
    return reverb(place((0, fig), (2 * SIXTEENTH, pad)), 0.18, IR_ROOM)


@sound(SOUNDS, peak=-4)
def perfect():
    # Solved within par: a vibraphone run up Bb major (Bb4 D5 F5 Bb5 D6),
    # landing on a ringing Bbmaj9 with the electric piano and a sparkle of
    # little bells on top.
    run = seq([note(n) for n in ("A#4", "D5", "F5", "A#5", "D6")], 0.06, lambda f, i: vibes(f, 0.5, 0.35))
    top = sum(vibes(note(n), 1.4, 1.1) for n in ("A#5", "D6", "F6", "C6")) * 0.3
    pad = chord(("A#3", "F4", "A4", "D5", "C5"), 1.5, 1.3, spread=0.02) * 0.5
    sparkle = seq([note(n) for n in ("F7", "D7", "A#6", "F6")], 0.05, lambda f, i: bell(f, 0.35, 0.25, 0.3)) * 0.16
    return reverb(place((0, run), (0.3, top), (0.3, pad), (0.45, sparkle)), 0.2, IR_ROOM)


@sound(SOUNDS, peak=-7)
def best():
    # A new best for the level: three bright bells D6 F6 Bb6 with a shimmer.
    names = ("D6", "F6", "A#6")
    bells = place(*[(i * 0.09, bell(note(n), 0.7, 0.55, 0.6) * (0.8 + 0.1 * i)) for i, n in enumerate(names)])
    shimmer = osc(note("A#6"), 0.6) * env(0.6, 0.05, 0.4) * 0.12 * (1 + 0.4 * np.sin(2 * np.pi * 8 * t_axis(0.6)))
    return reverb(lowpass(place((0, bells), (0.18, shimmer)), 7000), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-9)
def unlock():
    # The next level opens: a little latch click, then F5 rising to Bb5.
    click = modes(0.05, ((2400, 0.8, 0.01), (3700, 0.4, 0.006)), click=0.5, click_band=(2000, 6000), click_decay=0.003)
    a = vibes(note("F5"), 0.35, 0.25)
    b = vibes(note("A#5"), 0.6, 0.45)
    return soften(place((0, click * 0.5), (0.06, a), (0.16, b)), 7000)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    # Menu cursor: a tiny woodblock tick on F6.
    d = 0.06
    return modes(d, ((note("F6"), 1.0, 0.025), (note("F6") * 2.7, 0.2, 0.01)), click=0.25, click_band=(1500, 5000), click_decay=0.003)


@sound(SOUNDS, peak=-10)
def select():
    # Menu confirm: electric piano Bb5 up to F6.
    return place((0, epiano(note("A#5"), 0.22, 0.15)), (0.06, epiano(note("F6"), 0.3, 0.2)))


@sound(SOUNDS, peak=-12)
def back():
    # Menu back: electric piano F6 down to Bb5.
    return place((0, epiano(note("F6"), 0.22, 0.15)), (0.06, epiano(note("A#5"), 0.3, 0.2)))


@sound(SOUNDS, peak=-10)
def pause():
    # Pause: two soft electric piano notes, D5 down to Bb4.
    return place((0, epiano(note("D5"), 0.3, 0.22)), (0.1, epiano(note("A#4"), 0.45, 0.35)))


@sound(SOUNDS, peak=-12)
def deny():
    # Not possible (a locked level, nothing to undo): two dull buzzy knocks
    # on Bb3, their overtones carrying them on a small speaker.
    def knock():
        d = 0.09
        tone = osc(note("A#3"), d, "pulse", 0.3) * env(d, 0.002, 0.06)
        return lowpass(tone, 2200)

    return place((0, knock()), (0.1, knock() * 0.8))


if __name__ == "__main__":
    write_all(SOUNDS, "crate-pusher")
