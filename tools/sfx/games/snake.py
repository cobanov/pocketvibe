"""Snake's sound effects: a playful jazzy funk set in G minor, to sit with the
music (jazzy funk groove, G minor, 116 BPM).

The voices are a band's: a Rhodes-like electric piano, a funky clavinet,
vibraphone, a muted trumpet and a woodblock. Tonal sounds use G minor
(G A Bb C D Eb F); jingles move in 16ths of the music's tempo. The apple's
"pop" is one note (G4) that the game raises along the G minor pentatonic
scale with playback rate as the snake grows (up to an octave and a sixth),
so it is short and soft in its upper partials. The turn tick is the most
frequent sound of all and is kept very quiet.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/snake.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import synth  # noqa: E402
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 116
S16 = 60 / BPM / 4  # a 16th note, s

G3, Bb3, D4, F4 = note("G3"), note("A#3"), note("D4"), note("F4")
G4, A4, Ab4, Bb4, C5, D5, Eb5, F5 = (note(n) for n in ("G4", "A4", "G#4", "A#4", "C5", "D5", "D#5", "F5"))
G5, A5, Bb5, C6, D6, F6, G6, A6 = (note(n) for n in ("G5", "A5", "A#5", "C6", "D6", "F6", "G6", "A6"))


# ---------------------------------------------------------------- voices

def rhodes(freq, dur=0.5, decay=0.4, bark=1.0):
    """Electric piano: FM with a 1:1 modulator whose index dies fast (the
    bark of the hammer), a faint high tine ping, and a soft body."""
    t = t_axis(dur)
    index = 0.35 + 1.6 * bark * env(dur, 0.001, decay * 0.3)
    body = fm(freq, 1.0, index, dur) * env(dur, 0.002, decay)
    if freq * 7 < 8000:
        body += 0.12 * np.sin(2 * np.pi * freq * 7 * t) * env(dur, 0.0005, 0.035)
    return body


def clav(freq, dur=0.2, decay=0.12, wah=None):
    """Clavinet: a thin pulse wave, plucked and bright. wah=(f0, f1) sweeps a
    band-pass across it, the funk guitar's pedal."""
    x = osc(freq, dur, "pulse", duty=0.2)
    if wah:
        x = sweep_filter(x, wah[0], wah[1], "band", q=1.6)
    else:
        x = bandpass(x, 350, 3800)
    return x * env(dur, 0.001, decay)


def vibes(freq, dur=0.6, decay=0.45, trem=6.0):
    """Vibraphone: a pure bar tone with its 4th partial, the motor's
    tremolo and a soft mallet tap."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.001, decay)
    if freq * 4 < 8000:
        out += 0.22 * np.sin(2 * np.pi * freq * 4 * t) * env(dur, 0.001, decay * 0.18)
    out *= 1 - 0.22 * (0.5 - 0.5 * np.cos(2 * np.pi * trem * t))
    tap = lowpass(noise(dur), 2500) * env(dur, 0.0005, 0.008) * 0.12
    return out + tap


def trumpet(freq, dur, wah=True, vib=0.0):
    """Muted trumpet: a saw through a closed, then opening, band-pass (the
    plunger's "wah"), with an optional vibrato on long notes."""
    f = vibrato(freq, dur, 5.5, vib) if vib else freq
    x = osc(f, dur, "saw")
    x = sweep_filter(x, 500, 1700, "band", q=1.8) if wah else bandpass(x, 600, 2200)
    return drive(x * adsr(dur, 0.025, 0.12, 0.8, min(0.08, dur / 3)), 1.4)


def woodblock(freq=1200, dur=0.07, decay=0.04):
    """A small woodblock: a damped tone a little above freq and a click."""
    t = t_axis(dur)
    tone = np.sin(2 * np.pi * freq * t) * env(dur, 0.0005, decay)
    tone += 0.4 * np.sin(2 * np.pi * freq * 2.7 * t) * env(dur, 0.0005, decay * 0.4)
    knock = bandpass(noise(dur), 1200, 5000) * env(dur, 0.0003, 0.006) * 0.5
    return tone + knock


def hat(dur=0.12, decay=0.08):
    """A hi-hat, kept under 8 kHz for the small speaker."""
    return lowpass(highpass(noise(dur), 5000), 7800, 4) * env(dur, 0.001, decay)


def chord(freqs, dur, voice, spread=0.0):
    """Several notes together; spread > 0 rolls them like a strum."""
    return place(*[(i * spread, voice(f, dur)) for i, f in enumerate(freqs)])


def jingle(notes, voice, step=S16):
    """notes: (freq or None, length in 16ths); voice(freq, seconds) -> samples."""
    parts, at = [], 0.0
    for f, steps in notes:
        if f:
            parts.append((at, voice(f, steps * step)))
        at += steps * step
    return place(*parts)


def _uniform(a, b):
    # synth's seeded noise generator, so every run writes the same file
    return float(synth._rng.uniform(a, b))


# ---------------------------------------------------------------- moving and eating

@sound(SOUNDS, peak=-21)
def turn():
    # The snake turning: a very quiet, short wooden tick, felt more than heard.
    click = bandpass(noise(0.02), 2000, 5000) * env(0.02, 0.0003, 0.004)
    return place((0, woodblock(2100, 0.04, 0.025) * 0.8), (0, click * 0.3))


@sound(SOUNDS, peak=-12)
def eat():
    # Chomp: a crisp bite (sparse crackle through a bright band) over a
    # little "gulp" falling from 420 to 200 Hz.
    d = 0.13
    bite = bandpass(crackle(d, 420, 0.002), 1400, 5200) * env(d, 0.001, 0.07)
    snap = bandpass(noise(0.03), 1500, 4500) * env(0.03, 0.0003, 0.012)
    gulp = glide(560, 260, 0.09, curve=0.6) * env(0.09, 0.003, 0.08)
    return place((0, bite * 1.6), (0, snap * 1.0), (0.02, gulp * 0.5))


@sound(SOUNDS, peak=-12)
def pop():
    # The apple's note: G4 on a round electric piano with a quick flick up
    # into the note. The game plays it higher along the scale as the snake
    # grows, so its partials die fast; the 2nd and 3rd carry it on the
    # handheld's small speaker, which hardly plays G4 itself.
    d = 0.3
    t = t_axis(d)
    flick = expramp(0.018, G4 * 0.89, G4)
    f = np.concatenate([flick, np.full(len(t) - len(flick), G4)])
    tone = osc(f, d) * env(d, 0.002, 0.24)
    tone += 0.55 * osc(f * 2, d) * env(d, 0.001, 0.12)
    tone += 0.25 * osc(f * 3, d) * env(d, 0.001, 0.06)
    return tone + 0.6 * rhodes(G4, d, 0.2, 1.0)


# ---------------------------------------------------------------- the star

@sound(SOUNDS, peak=-10)
def star():
    # A golden star shows up: a quick vibraphone run up G minor (G A# D G)
    # and a shimmer on top.
    run = jingle([(G5, 1), (Bb5, 1), (D6, 1), (G6, 4)], lambda f, s: vibes(f, s + 0.3, 0.35), S16 * 0.5)
    shimmer = bandpass(noise(0.5), 4000, 7500) * env(0.5, 0.05, 0.4) * 0.12
    return place((0, run), (0.1, shimmer))


@sound(SOUNDS, peak=-14)
def hurry():
    # The star is about to vanish: a woodblock "tock" on D6.
    return woodblock(D6, 0.08, 0.05)


@sound(SOUNDS, peak=-7)
def grab():
    # The star caught: a bright Rhodes and vibes arpeggio up a G minor 9
    # chord (G A# D F A) landing on a rolled chord, with a hi-hat splash.
    notes = [G5, Bb5, D6, F6, A6]
    run = place(*[(i * S16 * 0.5, place((0, vibes(f, 0.5, 0.3) * 0.8), (0, rhodes(f, 0.3, 0.2) * 0.5))) for i, f in enumerate(notes)])
    ring = chord([D6, F6, A6], 0.7, lambda f, s: vibes(f, s, 0.55), spread=0.012) * 0.6
    return place((0, run), (S16 * 2.5, ring), (S16 * 2.5, hat(0.25, 0.18) * 0.25))


@sound(SOUNDS, peak=-12)
def vanish():
    # The star runs out: soft vibes falling D6 A#5 G5 and a puff of air.
    fall = jingle([(D6, 1), (Bb5, 1), (G5, 3)], lambda f, s: vibes(f, s + 0.25, 0.25), S16 * 0.7)
    puff = sweep_filter(noise(0.35), 5000, 900, "low") * env(0.35, 0.01, 0.3) * 0.25
    return place((0, fall), (0, puff))


# ---------------------------------------------------------------- speed and records

@sound(SOUNDS, peak=-10)
def faster():
    # A notch faster: a clavinet slide up an octave (G4 to G5) through a
    # wah opening up, two funky clav chops and an open hi-hat.
    d = 0.24
    slide = osc(expramp(d, G4, G5, 1.4), d, "pulse", duty=0.2)
    slide = sweep_filter(slide, 500, 3200, "band", q=1.5) * adsr(d, 0.01, 0.1, 0.8, 0.05)
    chops = place((0, clav(G5, 0.08, 0.05)), (S16, clav(D5 * 2, 0.1, 0.06)))
    return place((0, slide), (d + 0.01, chops * 0.8), (d + 0.01, hat(0.22, 0.16) * 0.3))


@sound(SOUNDS, peak=-8)
def best():
    # Past the best score: a quick vibraphone run up G minor and a Rhodes stab.
    run = jingle([(G5, 1), (A5, 1), (Bb5, 1), (D6, 1), (G6, 3)], lambda f, s: vibes(f, s + 0.3, 0.3), S16 * 0.6)
    stab = chord([G4, Bb4, D5, F5], 0.35, lambda f, s: rhodes(f, s, 0.25), spread=0.008) * 0.45
    return place((0, run), (S16 * 2.4, stab))


@sound(SOUNDS, peak=-6)
def crash():
    # Into a wall or its own tail: a hollow wooden bonk on the toy board, a
    # cartoon boing wobbling down and a little rattle.
    d = 0.18
    t = t_axis(d)
    bonk = np.zeros_like(t)
    for f, a, dk in ((330, 1.0, 0.1), (330 * 2.3, 0.5, 0.05), (330 * 3.9, 0.25, 0.03)):
        bonk += a * np.sin(2 * np.pi * f * t) * env(d, 0.0008, dk)
    knock = bandpass(noise(d), 500, 2500) * env(d, 0.0005, 0.02) * 0.7
    bd = 0.42
    boing = osc(vibrato(expramp(bd, 520, 210, 0.8), bd, 16, 1.2), bd, "triangle") * env(bd, 0.005, 0.38)
    rattle = bandpass(crackle(0.25, 60, 0.004), 1000, 4000) * env(0.25, 0.01, 0.2)
    return place((0, bonk + knock), (0.03, boing * 0.45), (0.05, rattle * 0.35))


@sound(SOUNDS, peak=-10)
def over():
    # Game over: a muted trumpet's "wah wah wah waaah" sliding down to G
    # (A#4 A4 G#4 G4), the last note held with a wobble.
    beat = 60 / BPM * 0.75
    notes = [(Bb4, 0.0, 0.34), (A4, beat * 1.0, 0.34), (Ab4, beat * 2.0, 0.34)]
    parts = [(at, trumpet(f, d)) for f, at, d in notes]
    parts.append((beat * 3.0, trumpet(G4, 0.9, vib=0.35)))
    return place(*parts)


@sound(SOUNDS, peak=-5)
def record():
    # Game over with a new best: two funky Rhodes stabs on G minor 9, a
    # vibraphone run up and a ringing chord on top, with a hi-hat.
    stab = lambda: chord([G4, Bb4, D5, F5, A5], 0.22, lambda f, s: rhodes(f, s, 0.16), spread=0.006)
    run = jingle([(D5, 1), (G5, 1), (Bb5, 1), (D6, 1)], lambda f, s: vibes(f, s + 0.25, 0.25), S16 * 0.8)
    top = chord([G5, Bb5, D6, F6, A6], 1.0, lambda f, s: vibes(f, s, 0.7), spread=0.015) * 0.55
    pad_ = chord([G4, Bb4, D5, F5, A5], 0.9, lambda f, s: rhodes(f, s, 0.6, 0.6), spread=0.01) * 0.5
    return place(
        (0, stab() * 0.8),
        (S16 * 2, stab() * 0.8),
        (S16 * 4, run * 0.8),
        (S16 * 8, top),
        (S16 * 8, pad_),
        (S16 * 8, hat(0.3, 0.22) * 0.25),
    )


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    # Menu cursor: a soft electric piano tick on D6.
    return rhodes(D6, 0.12, 0.07, 0.5)


@sound(SOUNDS, peak=-10)
def select():
    # Menu confirm: G5 up to D6.
    return place((0, rhodes(G5, 0.18, 0.12)), (S16 * 0.6, rhodes(D6, 0.28, 0.2)))


@sound(SOUNDS, peak=-12)
def back():
    # Menu back: D6 down to G5.
    return place((0, rhodes(D6, 0.18, 0.12)), (S16 * 0.6, rhodes(G5, 0.28, 0.2)))


@sound(SOUNDS, peak=-10)
def pause():
    # Pause: two clavinet plucks, D5 down to G4.
    return place((0, clav(D5, 0.16, 0.1)), (S16, clav(G4, 0.22, 0.14)))


@sound(SOUNDS, peak=-8)
def start():
    # Off we go: a funky clavinet pickup (G4 A#4 D5) into a Rhodes stab on
    # G minor 7, with a hi-hat.
    pickup = jingle([(G4, 1), (Bb4, 1), (D5, 1)], lambda f, s: clav(f, s + 0.05, 0.07), S16 * 0.8)
    stab = chord([G4, Bb4, D5, F5], 0.4, lambda f, s: rhodes(f, s, 0.3), spread=0.006)
    return place((0, pickup * 0.8), (S16 * 2.4, stab * 0.7), (S16 * 2.4, hat(0.15, 0.1) * 0.25))


if __name__ == "__main__":
    write_all(SOUNDS, "snake")
