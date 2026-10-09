"""Sound effects for Mini Golf (games/mini-golf/public/sfx/).

A sunny afternoon on the putting green, to sit with relaxed bossa nova in
G major at 100 BPM: jingles are vibraphone, nylon guitar and claves, every
tonal effect uses notes of G major (bumpers are tuned to G so the game can
play them on the notes of a G chord), and the ball's own sounds (putter,
boards, the cup) are short knocks with most of their energy between 300 Hz
and 4 kHz for the handheld's small speaker.

Run:
    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/mini-golf.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import synth  # noqa: E402
from synth import *  # noqa: E402,F403

SOUNDS = {}
BEAT = 60 / 100  # one beat of the music
EIGHTH = BEAT / 2


# ---------------------------------------------------------------- voices

def vibes(freq, dur=0.8, decay=0.6, bright=1.0, trem=5.5):
    """A vibraphone bar: the fundamental and the bar's 4th and 10th
    partials, the upper ones fading first, a soft mallet and the motor's
    slow tremolo."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.002, decay)
    if freq * 4 < 8000:
        out += 0.22 * bright * np.sin(2 * np.pi * freq * 4 * t) * env(dur, 0.001, decay * 0.3)
    if freq * 10 < 8000:
        out += 0.05 * bright * np.sin(2 * np.pi * freq * 10 * t) * env(dur, 0.001, decay * 0.08)
    out *= 1 - 0.22 * (0.5 + 0.5 * np.sin(2 * np.pi * trem * t))
    tap = lowpass(noise(dur), 2500) * env(dur, 0.0005, 0.01) * 0.08
    return out + tap


def nylon(freq, dur=0.7, ring=0.6, bright=0.4):
    """A nylon-string guitar: Karplus-Strong with a soft thumb pluck."""
    n = int(round(dur * SR))
    p = max(2, int(round(SR / freq - 0.5)))
    y = np.zeros(n)
    burst = lowpass(noise(p / SR + 0.01), 900 + 3500 * bright)[:p]
    y[:p] = burst / (np.max(np.abs(burst)) + 1e-9)
    g = 10 ** (-3 / (ring * freq))
    for start in range(p, n, p):
        end = min(start + p, n)
        size = end - start
        a = y[start - p: start - p + size]
        b = y[start - p - 1: start - p - 1 + size] if start - p - 1 >= 0 else np.concatenate([[0.0], y[: size - 1]])
        y[start:end] = g * 0.5 * (a + b)
    return lowpass(y, 4200) * env(dur, 0.001, dur * 4)


def strum(names, gap=0.022, dur=1.0, ring=0.8):
    """A thumb strum across nylon strings, low to high."""
    return place(*[(i * gap, nylon(note(n), dur, ring) * (0.75 + 0.06 * i)) for i, n in enumerate(names)])


def clave(freq=2500, dur=0.07):
    """A wooden clave click: a pitched, very short resonance."""
    t = t_axis(dur)
    tone = np.sin(2 * np.pi * freq * t) * env(dur, 0.0005, 0.035)
    click = bandpass(noise(dur), freq * 0.8, freq * 1.6) * env(dur, 0.0003, 0.006) * 0.4
    return tone + click


def modes(dur, parts, click=0.4, click_band=(1500, 5000), click_decay=0.006):
    """A struck object: damped sine modes (freq, amp, decay) and a click."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for f, a, dk in parts:
        out += a * np.sin(2 * np.pi * f * t) * env(dur, 0.0005, dk)
    out += bandpass(noise(dur), *click_band) * env(dur, 0.0003, click_decay) * click
    return out


def blips(dur, count, lo, hi, length=0.03):
    """Bubbles: short sine chirps rising in pitch, at random times."""
    out = np.zeros(int(round(dur * SR)))
    for _ in range(count):
        start = float(synth._rng.uniform(0, dur - length))
        f = float(synth._rng.uniform(lo, hi))
        b = glide(f, f * 1.8, length, curve=0.7) * env(length, 0.002, length * 0.8) * float(synth._rng.uniform(0.3, 1.0))
        i = int(start * SR)
        out[i: i + len(b)] += b[: len(out) - i]
    return out


def soften(x, cutoff=7000):
    """Takes the edge off noisy sounds above about 8 kHz."""
    return lowpass(x, cutoff, 4)


# ---------------------------------------------------------------- the ball

@sound(SOUNDS, peak=-11)
def putt():
    # The putter face meeting the ball: a crisp "tok" with a hollow body
    # around 1.6 kHz and a light thump. The game plays it softer and higher
    # for short putts.
    d = 0.11
    tok = modes(d, ((1650, 1.0, 0.035), (2900, 0.45, 0.02), (620, 0.35, 0.03)), click=0.6, click_band=(2000, 6000))
    thump = glide(380, 220, d) * env(d, 0.001, 0.03) * 0.4
    return soften(tok + thump)


@sound(SOUNDS, peak=-9)
def putt_hard():
    # A long putt: a firmer, lower "thwock" and the swish of the swing,
    # layered over putt for strong shots.
    d = 0.2
    swish = sweep_filter(noise(d, "pink"), 900, 2600, "band", q=1.6) * env(d, 0.03, 0.08) * 0.35
    thwock = modes(d, ((980, 1.0, 0.05), (1750, 0.5, 0.03), (430, 0.5, 0.05)), click=0.8, click_band=(1500, 5000))
    return soften(place((0, swish), (0.03, thwock)))


@sound(SOUNDS, peak=-15, loop=True)
def roll():
    # The ball rolling over turf: a soft low rumble that bumps along with the
    # grass, and a faint tick of blades. The game sets its volume and pitch
    # from the ball's speed.
    d = 0.9
    t = t_axis(d)
    rumble = bandpass(noise(d, "pink"), 330, 1500)
    rumble /= np.max(np.abs(rumble)) + 1e-9
    # Bumps at 10 per second, a whole number of them across the loop.
    bumps = 0.75 + 0.25 * np.sin(2 * np.pi * 10 * t) * np.sin(2 * np.pi * 3.333 * t + 1)
    grass = bandpass(crackle(d, 60, 0.002), 1500, 4000) * 0.25
    return loopable(rumble * bumps + grass, 0.12)


@sound(SOUNDS, peak=-11)
def wall():
    # Off a wooden border: a dry woody knock, damped modes and a click.
    d = 0.12
    return modes(d, ((420, 0.8, 0.05), (1130, 1.0, 0.035), (2350, 0.4, 0.018)), click=0.5, click_band=(1200, 4500))


@sound(SOUNDS, peak=-11)
def stone():
    # Off a painted block: a harder, higher tick.
    d = 0.09
    return modes(d, ((1850, 1.0, 0.025), (3150, 0.5, 0.015), (900, 0.3, 0.02)), click=0.7, click_band=(2500, 6500), click_decay=0.004)


@sound(SOUNDS, peak=-9)
def bumper():
    # A rubber bumper: "boing" on G4 with a springy wobble and a rubbery
    # thump. The game raises it to B, D or high G per bumper.
    d = 0.32
    f = vibrato(expramp(d, semis(note("G4"), 5), note("G4"), 0.25), d, 22, 0.35 * env(d, 0.001, 0.25))
    tone = (osc(f, d) + 0.3 * osc(f, d, "triangle") + 0.12 * osc(f * 2, d)) * env(d, 0.002, 0.26)
    thump = bandpass(noise(0.04), 300, 1200) * env(0.04, 0.0005, 0.02) * 0.5
    return place((0, tone), (0, thump))


@sound(SOUNDS, peak=-11)
def mover():
    # Knocked by a spinner, a sliding gate or a windmill sail: a hollow
    # wooden clonk.
    d = 0.16
    return modes(d, ((560, 1.0, 0.07), (1420, 0.6, 0.04), (2650, 0.25, 0.02)), click=0.6, click_band=(800, 3500), click_decay=0.01)


@sound(SOUNDS, peak=-14)
def ramp():
    # Onto a ramp or a hill: a quick airy whoosh that rises (the game plays
    # it lower going downhill).
    d = 0.32
    w = sweep_filter(noise(d, "pink"), 500, 2200, "band", q=1.7)
    t = t_axis(d)
    shape = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    return soften(w * shape, 5000)


@sound(SOUNDS, peak=-14)
def sand():
    # Into a sand trap: a soft gritty "fff" and scattered grains.
    d = 0.24
    hiss = bandpass(noise(d), 1500, 5500) * env(d, 0.004, 0.16)
    grains = bandpass(crackle(d, 160, 0.0015), 2000, 6000) * env(d, 0.01, 0.2) * 0.6
    return soften(hiss + grains, 6000)


@sound(SOUNDS, peak=-6)
def splash():
    # Into the water: a round bloop, a spray, and bubbles rising after.
    bloop = glide(720, 180, 0.12, curve=0.6) * env(0.12, 0.002, 0.11)
    spray = sweep_filter(noise(0.45), 5000, 900, "low") * env(0.45, 0.004, 0.36)
    bub = blips(0.55, 9, 420, 820, 0.035)
    return soften(place((0, bloop), (0, spray * 0.75), (0.12, bub * 0.45)))


@sound(SOUNDS, peak=-13)
def fall():
    # Off an open edge: a little slide whistle down from D6 to G4.
    d = 0.42
    f = vibrato(expramp(d, note("D6"), note("G4"), 1.3), d, 7, 0.15)
    tone = (osc(f, d) + 0.15 * osc(f * 2, d)) * adsr(d, 0.02, 0.1, 0.85, 0.12)
    breath = bandpass(noise(d), 1500, 4000) * 0.06 * adsr(d, 0.02, 0.1, 0.8, 0.12)
    return tone + breath


@sound(SOUNDS, peak=-10)
def thud():
    # The ball landing on the meadow below: a soft thump and a rustle.
    d = 0.2
    body = glide(320, 150, d, curve=0.5) * env(d, 0.002, 0.09)
    rustle = bandpass(noise(d), 1200, 4000) * env(d, 0.005, 0.12) * 0.25
    return body + rustle


@sound(SOUNDS, peak=-7)
def cup():
    # Into the cup: a hollow plastic clunk, then the ball rattling round the
    # bottom, three knocks coming faster and softer.
    def knock(amp, pitch):
        d = 0.09
        return modes(d, ((880 * pitch, 1.0, 0.04), (1960 * pitch, 0.55, 0.025), (420 * pitch, 0.5, 0.04)), click=0.4) * amp

    return soften(place((0, knock(1.0, 1.0)), (0.11, knock(0.55, 1.04)), (0.18, knock(0.35, 0.98)), (0.225, knock(0.2, 1.03))))


@sound(SOUNDS, peak=-11)
def lip():
    # A lip-out: the ball rings the cup's rim, a bright tink and a buzz.
    d = 0.22
    tink = modes(d, ((2350, 1.0, 0.09), (3900, 0.35, 0.05), (1170, 0.3, 0.06)), click=0.3, click_band=(2500, 6000))
    buzz = bandpass(noise(d), 1800, 3200) * env(d, 0.002, 0.07) * 0.15
    return soften(tink + buzz)


# ---------------------------------------------------------------- results

@sound(SOUNDS, peak=-4)
def ace():
    # A hole in one: a vibraphone run up G major (G B D G B D) over a nylon
    # strum, landing on a ringing Gmaj9 with a sparkle on top.
    run = seq([note(n) for n in ("G4", "B4", "D5", "G5", "B5", "D6")], 0.065, lambda f, i: vibes(f, 0.5, 0.35))
    chord = sum(vibes(note(n), 1.2, 1.0) for n in ("G5", "B5", "D6", "F#6")) * 0.32
    guitar = strum(["G3", "D4", "F#4", "A4", "B4"], 0.03, 1.2, 1.0)
    sparkle = seq([note(n) for n in ("G7", "D7", "B6")], 0.05, lambda f, i: vibes(f, 0.3, 0.2, 0.3)) * 0.18
    return place((0, run), (0.39, chord), (0.39, guitar * 0.55), (0.5, sparkle))


@sound(SOUNDS, peak=-6)
def under():
    # Under par: a bright rising vibraphone figure D5 G5 B5 and a soft strum.
    fig = seq([note(n) for n in ("D5", "G5", "B5")], 0.09, lambda f, i: vibes(f, 0.6, 0.45))
    guitar = strum(["G3", "B3", "D4", "G4"], 0.025, 0.9, 0.7)
    return place((0, fig), (0.18, guitar * 0.5))


@sound(SOUNDS, peak=-9)
def par():
    # Par: a calm two-note vibraphone answer, D5 settling on G5.
    return place((0, vibes(note("D5"), 0.5, 0.4)), (EIGHTH * 0.5, vibes(note("G5"), 0.8, 0.6)))


@sound(SOUNDS, peak=-9)
def over():
    # Over par: a gentle, rounded "aw" falling B4 A4 G4 on muted nylon.
    return seq([note(n) for n in ("B4", "A4", "G4")], 0.14, lambda f, i: nylon(f, 0.45 if i < 2 else 0.7, 0.25 if i < 2 else 0.45, 0.25))


@sound(SOUNDS, peak=-9)
def pickup():
    # Picked up after eight strokes: a soft shrug, G4 down to D4.
    return place((0, nylon(note("G4"), 0.35, 0.25, 0.3)), (0.15, nylon(note("E4"), 0.35, 0.25, 0.3)), (0.3, nylon(note("D4"), 0.6, 0.45, 0.3)))


@sound(SOUNDS, peak=-14)
def place_ball():
    # The ball set down again after a penalty: a soft plip.
    d = 0.1
    return glide(note("G5"), note("D6"), d, curve=0.5) * env(d, 0.002, 0.07)


@sound(SOUNDS, peak=-10)
def intro():
    # A new hole: a vibraphone "ding-dong", B5 then G5.
    return place((0, vibes(note("B5"), 0.5, 0.4)), (0.16, vibes(note("G5"), 0.7, 0.55)))


@sound(SOUNDS, peak=-4)
def record():
    # A new best round: a nylon strum and a vibraphone melody G5 A5 B5 D6,
    # ending on a ringing G major chord.
    melody = seq([note(n) for n in ("G5", "A5", "B5", "D6")], 0.12, lambda f, i: vibes(f, 0.5, 0.35))
    chord = sum(vibes(note(n), 1.3, 1.1) for n in ("G5", "B5", "D6", "G6")) * 0.35
    guitar = place((0, strum(["G3", "D4", "G4", "B4"], 0.025, 0.6, 0.5)), (0.48, strum(["G3", "D4", "G4", "B4", "D5"], 0.025, 1.3, 1.0)))
    return place((0, melody), (0.48, chord), (0, guitar * 0.55))


@sound(SOUNDS, peak=-7)
def final():
    # The round is done: a friendly cadence D5 C5 A4 landing on G4 and B4,
    # with a strum.
    fig = seq([note(n) for n in ("D5", "C5", "A4")], 0.12, lambda f, i: vibes(f, 0.45, 0.3))
    end = vibes(note("G4"), 0.9, 0.7) + vibes(note("B4"), 0.9, 0.7) * 0.6
    guitar = strum(["G3", "B3", "D4", "G4"], 0.025, 1.0, 0.8)
    return place((0, fig), (0.36, end), (0.36, guitar * 0.5))


@sound(SOUNDS, peak=-8)
def start():
    # Tee off: a bossa thumb strum up G major 7 and a clave.
    return place((0, strum(["G3", "B3", "D4", "F#4", "B4"], 0.024, 0.9, 0.7)), (0.02, clave(2500) * 0.3))


# ---------------------------------------------------------------- meter and menus

@sound(SOUNDS, peak=-18, loop=True)
def charge():
    # The power meter's tone: a soft hum on G4 with a little shimmer, a
    # whole number of cycles long so it loops cleanly; the game raises its
    # pitch with the meter.
    d = 0.5
    t = t_axis(d)
    f = note("G4")
    f = round(f * d) / d  # whole cycles in the loop
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    return x * (0.85 + 0.15 * np.sin(2 * np.pi * 6 * t))


@sound(SOUNDS, peak=-12)
def range_():
    # The putting range switched: a double clave tick, D6 then G6.
    return place((0, clave(note("D6"), 0.06)), (0.06, clave(note("G6"), 0.06)))


@sound(SOUNDS, peak=-15)
def move():
    # Menu cursor: a tiny clave tick on D6.
    return clave(note("D6"), 0.06)


@sound(SOUNDS, peak=-10)
def select():
    # Menu confirm: vibraphone G5 up to D6.
    return place((0, vibes(note("G5"), 0.25, 0.15)), (0.06, vibes(note("D6"), 0.3, 0.2)))


@sound(SOUNDS, peak=-12)
def back():
    # Menu back: vibraphone D6 down to G5.
    return place((0, vibes(note("D6"), 0.25, 0.15)), (0.06, vibes(note("G5"), 0.3, 0.2)))


@sound(SOUNDS, peak=-10)
def pause():
    # Pause: two nylon plucks, D5 down to G4.
    return place((0, nylon(note("D5"), 0.3, 0.25)), (0.1, nylon(note("G4"), 0.4, 0.35)))


# Two names Python keeps for itself.
SOUNDS["place"] = SOUNDS.pop("place_ball")
SOUNDS["range"] = SOUNDS.pop("range_")

if __name__ == "__main__":
    write_all(SOUNDS, "mini-golf")
