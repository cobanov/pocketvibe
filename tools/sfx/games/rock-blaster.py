"""Rock Blaster's sound effects: a dark, spacey arcade set in F minor, to sit
with the music (dark spacey electronic, F minor, 120 BPM).

Tonal sounds use F minor (F G Ab Bb C Db Eb, and E as the leading tone);
jingles move in 16ths of the music's tempo. Four sounds are loops played with
sound.loop() and shaped by the game: the thrust rumble and the two saucer
sirens (their warble repeats a whole number of times in the loop, and the
tone is retuned so whole waves fill it). The heartbeat is one low thump that
the game alternates with a copy a semitone lower, faster as the rocks thin out.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/rock-blaster.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 120
S16 = 60 / BPM / 4  # a 16th note, 0.125 s

F2, C3, F3, Ab3 = note("F2"), note("C3"), note("F3"), note("G#3")
C4, Db4, Eb4, E4, F4, G4, Ab4, Bb4 = (note(n) for n in ("C4", "C#4", "D#4", "E4", "F4", "G4", "G#4", "A#4"))
C5, Db5, Eb5, E5, F5, G5, Ab5, Bb5 = (note(n) for n in ("C5", "C#5", "D#5", "E5", "F5", "G5", "G#5", "A#5"))
C6, Eb6, F6, Ab6 = note("C6"), note("D#6"), note("F6"), note("G#6")


# ---------------------------------------------------------------- voices

def pk(x):
    """Scaled to a peak of 1, so parts can be mixed by their weights."""
    return x / (np.max(np.abs(x)) + 1e-12)


def chip(freq, dur, duty=0.25, decay=None, cutoff=4800):
    """A pulse-wave note with a short release, the arcade lead."""
    body = osc(freq, dur, "pulse", duty) + 0.4 * osc(freq, dur, "triangle")
    shape = adsr(dur, 0.003, 0.08, 0.6, min(0.04, dur / 3)) if decay is None else env(dur, 0.003, decay)
    return lowpass(body * shape, cutoff)


def bell(freq, dur, decay, bright=1.0):
    """Glassy mallet: a sine with soft partials that die faster."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.002, decay)
    out += 0.3 * bright * np.sin(2 * np.pi * freq * 2 * t) * env(dur, 0.001, decay * 0.45)
    out += 0.12 * bright * np.sin(2 * np.pi * freq * 3.01 * t) * env(dur, 0.001, decay * 0.25)
    return out


def bass(freq, dur):
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


def mix(*parts):
    """Sum parts of different lengths, all starting at 0."""
    return place(*[(0.0, p) for p in parts])


def fm_glide(curve, ratio, index, dur):
    """Two-operator FM on a pitch curve: the modulator follows the carrier."""
    n = int(round(dur * SR))
    phase = 2 * np.pi * np.cumsum(np.asarray(curve)[:n]) / SR
    idx = np.full(n, float(index)) if np.isscalar(index) else np.asarray(index)[:n]
    return np.sin(phase + idx * np.sin(ratio * phase))


def warble(base, dur, rate, depth_semis, wave, duty=0.5, tiles=3):
    """A tone whose pitch swings around base `rate` times a second, for a
    seamless loop of dur seconds: rate * dur must be whole, and the pitch is
    nudged so a whole number of waves fits the loop. It comes back `tiles`
    loops long, so filters can settle before the last loop is kept (see last_loop)."""
    t = t_axis(dur)
    curve = base * 2 ** (depth_semis * np.sin(2 * np.pi * rate * t) / 12)
    cycles = np.sum(curve) / SR
    curve *= round(cycles) / cycles
    return osc(np.tile(curve, tiles), dur * tiles, wave, duty)


def last_loop(x, dur):
    """The last dur seconds of a repeating signal: by then every filter has
    settled, so the end runs on into the start without a click."""
    return x[-int(round(dur * SR)):]


# ---------------------------------------------------------------- the ship

@sound(SOUNDS, peak=-15)
def shot():
    """The ship's gun: a short bright 'pew' falling from C6 to F5."""
    dur = 0.085
    zap = osc(expramp(dur, C6 * 1.4, F5 * 0.9, 0.5), dur, "pulse", 0.3) * env(dur, 0.001, 0.08)
    body = osc(expramp(dur, C6, F5, 0.5), dur, "triangle") * env(dur, 0.001, 0.07)
    return lowpass(pk(zap) * 0.6 + pk(body) * 0.6, 5200) + pad(click(0.004, 2500, 6500), dur) * 0.15


@sound(SOUNDS, peak=-12, loop=True)
def thrust():
    """The engine: a rocket rumble with an uneven flutter. The game plays it
    while UP is held, a little higher as the ship speeds up."""
    d = 0.7
    t = t_axis(d)
    roar = bandpass(noise(d, "pink"), 220, 1500)
    flutter = 1 + 0.22 * np.sin(2 * np.pi * 20 * t) + 0.12 * np.sin(2 * np.pi * 33 * t + 0.8)
    body = lowpass(noise(d, "brown"), 300)
    hiss = bandpass(noise(d), 1800, 3800)
    x = pk(roar * flutter) * 0.85 + pk(body) * 0.35 + pk(hiss) * 0.06
    return loopable(x, 0.06)


@sound(SOUNDS, peak=-4)
def explode():
    """The ship is lost: a heavy blast, a crack, a falling engine whine and
    debris raining down."""
    d = 1.3
    boom = glide(190, 60, 0.6, curve=0.6) * env(0.6, 0.003, 0.5)
    blast = highpass(sweep_filter(noise(d, "pink"), 3600, 300), 170) * env(d, 0.003, 1.0)
    crack = lowpass(noise(0.1), 5000) * env(0.1, 0.0005, 0.07)
    whine = lowpass(osc(expramp(0.9, C5, F3, 0.7), 0.9, "saw"), 2400) * env(0.9, 0.01, 0.8)
    debris = bandpass(crackle(d, 50, 0.004), 500, 4200) * env(d, 0.06, 1.1, hold=0.1)
    x = place((0, pk(boom) * 0.5), (0, pk(blast) * 1.0), (0, pk(crack) * 0.5), (0.04, pk(whine) * 0.25), (0.05, pk(debris) * 0.4))
    return highpass(lowpass(reverb(drive(x, 2.0), 0.12, IR_SMALL), 7000, order=4), 80)


@sound(SOUNDS, peak=-9)
def hyper_in():
    """Hyperspace: the ship folds away, a sweep up from F4 to F6 with a
    shimmer of noise that closes into the distance."""
    dur = 0.34
    sweep = osc(vibrato(expramp(dur, F4, F6, 0.8), dur, 30, 0.5), dur, "saw")
    swoosh = sweep_filter(noise(dur, "pink"), 600, 5000, "band", 1.6)
    shape = env(dur, 0.14, 0.2)
    return lowpass((pk(sweep_filter(sweep, 900, 6000)) * 0.7 + pk(swoosh) * 0.35) * shape, 7000)


@sound(SOUNDS, peak=-10)
def hyper_out():
    """Out of hyperspace: a quick drop from F6 to C5 that lands with a soft pop."""
    dur = 0.26
    drop = osc(expramp(dur, F6, C5, 0.4), dur, "triangle") * env(dur, 0.002, 0.24)
    swoosh = sweep_filter(noise(dur, "pink"), 4500, 700, "band", 1.6) * env(dur, 0.002, 0.2)
    pop = bell(F5, 0.2, 0.15, 0.6)
    return lowpass(place((0, pk(drop) * 0.7), (0, pk(swoosh) * 0.3), (0.06, pk(pop) * 0.45)), 6500)


@sound(SOUNDS, peak=-10)
def respawn():
    """A new ship appears in its shield: a rising shimmer, F5 Ab5 C6 F6."""
    run = jingle([(F5, 1), (Ab5, 1), (C6, 1), (F6, 3)], lambda f, d: bell(f, d, d * 0.9, 0.7), step=0.055)
    rise = sweep_filter(noise(0.35, "pink"), 800, 5000, "band", 2.0) * env(0.35, 0.15, 0.2)
    return lowpass(reverb(place((0, pk(run) * 0.8), (0, pk(rise) * 0.2)), 0.15, IR_SMALL), 7000)


# ---------------------------------------------------------------- rocks

@sound(SOUNDS, peak=-7)
def break_l():
    """A large rock bursts: a deep thump, a gravelly blast and falling debris."""
    d = 0.6
    thump = glide(220, 80, 0.3, curve=0.6) * env(0.3, 0.002, 0.24)
    blast = highpass(sweep_filter(noise(d, "pink"), 2600, 350), 180) * env(d, 0.002, 0.45)
    grit = bandpass(crackle(d, 140, 0.004), 400, 3200) * env(d, 0.02, 0.5)
    x = place((0, pk(thump) * 0.45), (0, pk(blast) * 1.0), (0.02, pk(grit) * 0.6))
    return highpass(lowpass(drive(x, 1.8), 5500, order=4), 90)


@sound(SOUNDS, peak=-9)
def break_m():
    """A medium rock cracks apart: a crunch over a short knock."""
    d = 0.36
    knock = glide(260, 110, 0.16, curve=0.6) * env(0.16, 0.001, 0.13)
    crunch = sweep_filter(noise(d, "pink"), 3200, 500) * env(d, 0.001, 0.26)
    grit = bandpass(crackle(d, 200, 0.003), 700, 4000) * env(d, 0.01, 0.28)
    x = place((0, pk(knock) * 0.6), (0, pk(crunch) * 1.0), (0.01, pk(grit) * 0.5))
    return lowpass(drive(x, 1.6), 6000, order=4)


@sound(SOUNDS, peak=-11)
def break_s():
    """A small rock shatters: a dry crack with a few chips."""
    d = 0.2
    crack = bandpass(noise(d), 700, 4200) * env(d, 0.0008, 0.11)
    chips = bandpass(crackle(d, 260, 0.002), 1200, 5000) * env(d, 0.005, 0.16)
    tick = osc(expramp(0.05, 900, 380), 0.05, "triangle") * env(0.05, 0.001, 0.045)
    return lowpass(pk(crack) * 0.9 + pk(chips) * 0.5 + pad(pk(tick), d) * 0.4, 6500)


@sound(SOUNDS, peak=-11)
def beat():
    """The heartbeat: a low thump on F2 that reads on a small speaker through
    its harmonics (the fundamental is filtered away, the ear fills it in).
    The game alternates it with a copy a semitone lower."""
    dur = 0.2
    pitch = expramp(dur, F2 * 1.12, F2, 0.3)
    body = drive(osc(pitch, dur, "square"), 1.5) * env(dur, 0.002, 0.16)
    body = highpass(lowpass(body, 1100, order=4), 190, order=2)
    knock = np.sin(2 * np.pi * np.cumsum(expramp(0.08, F4, F3 * 1.5, 0.5)) / SR) * env(0.08, 0.001, 0.07)
    return pk(body) + pad(pk(knock), dur) * 0.35 + pad(click(0.004, 600, 2400), dur) * 0.08


# ---------------------------------------------------------------- saucers

@sound(SOUNDS, peak=-13, loop=True)
def siren_big():
    """The big saucer: a slow, low warble around Ab4, four swings a second."""
    d = 0.5
    tone = warble(Ab4, d, 4, 3.0, "square")
    under = warble(Ab4 / 2, d, 4, 3.0, "triangle")
    return last_loop(lowpass(pk(tone) * 0.6 + pk(under) * 0.5, 2200, order=4), d)


@sound(SOUNDS, peak=-13, loop=True)
def siren_small():
    """The small saucer: a fast, high, nervous warble around C6."""
    d = 0.5
    tone = warble(C6, d, 10, 2.0, "pulse", 0.3)
    under = warble(C5, d, 10, 2.0, "triangle")
    return last_loop(lowpass(pk(tone) * 0.55 + pk(under) * 0.5, 4200, order=4), d)


@sound(SOUNDS, peak=-13)
def ufo_shot():
    """A saucer fires: a buzzy metallic zap, lower and rounder than the ship's."""
    dur = 0.13
    pitch = expramp(dur, Eb5, Ab4, 0.5)
    zap = fm_glide(pitch, 1.5, ramp(dur, 4.0, 0.5), dur)
    tone = osc(pitch, dur, "square") * 0.5
    return lowpass((pk(zap) * 0.6 + pk(tone) * 0.5) * env(dur, 0.001, 0.12), 4500)


@sound(SOUNDS, peak=-6)
def ufo_boom():
    """A saucer is shot down: a metal clang, a blast and its siren dying away."""
    d = 0.8
    t = t_axis(d)
    clang = np.zeros_like(t)
    for ratio, amp, dk in ((1.0, 1.0, 0.35), (2.76, 0.5, 0.18), (5.4, 0.25, 0.08)):
        clang += amp * np.sin(2 * np.pi * C5 * ratio * t) * env(d, 0.0008, dk)
    blast = sweep_filter(noise(d, "pink"), 3000, 300) * env(d, 0.002, 0.55)
    dying = lowpass(osc(vibrato(expramp(0.6, Ab5, F3, 0.6), 0.6, 9, 0.8), 0.6, "square"), 2500) * env(0.6, 0.005, 0.55)
    x = place((0, pk(clang) * 0.45), (0, pk(blast) * 0.9), (0.03, pk(dying) * 0.35))
    return lowpass(drive(x, 1.6), 7000, order=4)


# ---------------------------------------------------------------- waves and score

@sound(SOUNDS, peak=-9)
def wave():
    """A new wave of rocks: a low pulse swelling from C4 to F4 under a radar ping."""
    d = 0.7
    low = place((0, bass(C4, S16 * 2)), (S16 * 2, bass(F4, S16 * 3.6)))
    ping = place((S16 * 2, bell(F5, 0.45, 0.4, 0.5)))
    swell = sweep_filter(noise(d, "pink"), 300, 1800, "band", 1.6) * env(d, 0.2, 0.4)
    x = mix(pk(low) * 0.6, pk(ping) * 0.55, pk(swell) * 0.15)
    return lowpass(echo(x, S16 * 1.5, 0.22, 2), 6000)


@sound(SOUNDS, peak=-7)
def clear():
    """A wave cleared: a run up F minor that lands on F with an open fifth."""
    lead = jingle([(C5, 1), (F5, 1), (Ab5, 1), (C6, 1), (Bb5, 1), (C6, 1), (F6, 4)], lambda f, d: chip(f, d, 0.25))
    fifth = jingle([(None, 6), (C6, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3200) * 0.35)
    low = jingle([(F3, 2), (Ab3, 2), (C4, 2), (F3, 4)], bass)
    return reverb(mix(lead, fifth, low * 0.5), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-6)
def life():
    """An extra ship: the classic quick 1-up beeps, F5 C6 F6, then a sparkle."""
    beeps = jingle([(F5, 0.6), (C6, 0.6), (F6, 0.6), (C6, 0.6), (F6, 2)], lambda f, d: chip(f, d, 0.25, cutoff=5200), step=S16)
    sparkle = place((0.3, bell(Ab6, 0.25, 0.2) * 0.25), (0.36, bell(C6 * 2, 0.22, 0.16) * 0.18))
    return reverb(mix(beeps, sparkle), 0.12, IR_SMALL)


@sound(SOUNDS, peak=-8)
def best():
    """Passing the best score mid-game: a fast bright run up to F6 that rings."""
    run = jingle([(C5, 0.5), (F5, 0.5), (Ab5, 0.5), (C6, 0.5)], lambda f, d: chip(f, d, 0.25))
    ring = chip(F6, 0.5, 0.25, decay=0.45) + 0.5 * chip(C6, 0.5, 0.5, decay=0.45, cutoff=3500)
    return lowpass(echo(place((0, run), (2 * S16, ring)), S16 * 2, 0.22, 2), 6500)


@sound(SOUNDS, peak=-5)
def over():
    """Game over: a slow fall down F minor to a low F."""
    def voice(f, d):
        return lowpass(osc(f, d, "square") * adsr(d, 0.006, 0.15, 0.6, 0.06), 1800)
    lead = jingle([(C5, 2), (Ab4, 2), (G4, 2), (E4, 2), (F4, 6)], voice)
    low = jingle([(F3, 4), (Db4 / 2, 4), (F3, 6)], lambda f, d: bass(f, d) + bass(f * 2, d) * 0.6)
    return reverb(mix(lead, low * 0.4), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-4)
def record():
    """A new best score at game over: a bright fanfare with a trill on top."""
    lead = jingle(
        [(C5, 1), (F5, 1), (Ab5, 1), (C6, 2), (Ab5, 1), (C6, 1), (F6, 1), (Eb6, 1), (F6, 1), (Eb6, 1), (F6, 4)],
        lambda f, d: chip(f, d, 0.25),
    )
    fifth = jingle([(None, 11), (C6, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35)
    low = jingle([(F3, 5), (C4, 3), (Ab3, 3), (F3, 4)], bass)
    return reverb(mix(lead, fifth, low * 0.5), 0.18, IR_SMALL)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-16)
def move():
    """Menu cursor: a short soft blip on C6."""
    dur = 0.05
    return np.sin(2 * np.pi * C6 * t_axis(dur)) * env(dur, 0.001, 0.04) + pad(click(0.004), dur) * 0.2


@sound(SOUNDS, peak=-11)
def select():
    """Menu confirm or toggle: two quick notes up, F5 to C6."""
    return place((0.0, bell(F5, 0.08, 0.07)), (0.05, bell(C6, 0.14, 0.12)))


@sound(SOUNDS, peak=-13)
def back():
    """Back or resume: two quick notes down, C6 to F5."""
    return lowpass(place((0.0, bell(C6, 0.08, 0.07)), (0.05, bell(F5, 0.14, 0.12))), 4000)


@sound(SOUNDS, peak=-11)
def pause():
    """The pause menu opens: a soft falling pair, Ab5 to F5."""
    return lowpass(place((0.0, bell(Ab5, 0.14, 0.12, 0.6)), (0.07, bell(F5, 0.26, 0.22, 0.6))), 3500)


@sound(SOUNDS, peak=-6)
def start():
    """A new game: the engine lights and a fast run climbs F minor."""
    d = 0.6
    whoosh = sweep_filter(noise(d, "pink"), 250, 3000, "band", 1.5) * env(d, 0.03, 0.45)
    run = jingle([(F4, 1), (C5, 1), (F5, 1), (Ab5, 1), (C6, 3)], lambda f, dd: chip(f, dd, 0.25), step=0.05)
    sparkle = place((0.22, bell(F6, 0.3, 0.25) * 0.3))
    return reverb(place((0, pk(whoosh) * 0.35), (0.04, pk(mix(run, sparkle)) * 0.85)), 0.12, IR_SMALL)


if __name__ == "__main__":
    write_all(SOUNDS, "rock-blaster", sys.argv[1:] or None)
