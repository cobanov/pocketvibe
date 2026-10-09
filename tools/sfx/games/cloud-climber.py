"""Sound effects for Cloud Climber (games/cloud-climber/public/sfx/).

Bright and airy, to sit with the happy platformer music (glockenspiel and a
flute synth, D major, 120 BPM): the jingles are glockenspiel bars and soft
flute notes on D major, the clouds are puffs of filtered noise, and the
thumps carry their weight between 200 Hz and 3 kHz for the small speaker.
The bounce is a short D5 boing; the game raises its pitch up the D major
pentatonic while the climber keeps bouncing higher.

Run:
    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/cloud-climber.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import synth  # noqa: E402
from synth import *  # noqa: E402,F403

SOUNDS = {}
BEAT = 60 / 120  # one beat of the music
SIXTEENTH = BEAT / 4


# ---------------------------------------------------------------- voices

def pk(x):
    """Scaled to a peak of 1, so parts can be mixed by their share."""
    return x / (np.max(np.abs(x)) + 1e-9)


def glock(freq, dur=0.6, decay=0.5, bright=1.0):
    """A glockenspiel bar: a strong fundamental and the bar's inharmonic
    partials (2.76 and 5.40 times up) dying fast, with a tiny mallet tick."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.001, decay)
    for ratio, amp, dk in ((2.76, 0.28, 0.25), (5.40, 0.08, 0.1)):
        if freq * ratio < 8000:
            out += amp * bright * np.sin(2 * np.pi * freq * ratio * t) * env(dur, 0.001, decay * dk)
    tick = bandpass(noise(dur), 2000, 6000) * env(dur, 0.0005, 0.006) * 0.08
    return out + tick


def flute(freq, dur, attack=0.03, release=0.12, breath=0.12):
    """A soft flute-like synth note: a sine with a little second and third
    harmonic, a gentle vibrato and some breath."""
    f = vibrato(freq, dur, 5.2, 0.12)
    tone = osc(f, dur) + 0.22 * osc(f * 2, dur) + 0.06 * osc(f * 3, dur)
    air = bandpass(noise(dur), freq * 1.5, min(freq * 5, 7000)) * breath
    return (tone + air) * adsr(dur, attack, 0.2, 0.8, release)


def run(names, step, voice):
    """Notes one after the other, every `step` seconds."""
    return place(*[(i * step, voice(note(n), i)) for i, n in enumerate(names)])


def chirp(f0, f1, dur, curve=0.7):
    """A quick sine sweep with a fast attack: bubbles and pops."""
    return glide(f0, f1, dur, curve=curve) * env(dur, 0.001, dur * 0.9)


def soften(x, cutoff=7000):
    """Takes the edge off noisy sounds above about 8 kHz."""
    return lowpass(x, cutoff, 4)


def _uniform(a, b):
    # synth's seeded noise generator, so every run writes the same files
    return float(synth._rng.uniform(a, b))


# ---------------------------------------------------------------- bouncing

@sound(SOUNDS, peak=-13)
def bounce():
    """Landing on a cloud: a soft springy boing from D5 up to A5 with a
    little wobble, over a puff of air squeezed out of the cloud."""
    d = 0.17
    f = vibrato(expramp(d, note("D5"), note("A5"), 0.35), d, 28, 0.35)
    tone = (osc(f, d) + 0.18 * osc(f, d, "triangle")) * env(d, 0.003, 0.14)
    puff = bandpass(noise(d, "pink"), 350, 1600) * env(d, 0.002, 0.07) * 0.45
    return place((0, tone), (0, puff))


@sound(SOUNDS, peak=-8)
def spring():
    """A spring pad: a twangy boi-oi-oing sliding from D4 up two octaves,
    its wobble dying as it rings, and a metallic snap at the start."""
    d = 0.5
    t = t_axis(d)
    wobble = 0.9 * np.exp(-t * 6)
    base = expramp(d, note("D4"), note("D6"), 0.55)
    f = base * 2 ** (wobble * np.sin(2 * np.pi * 17 * t) / 12)
    tone = osc(f, d) + 0.35 * osc(f, d, "triangle")
    tone += 0.25 * fm(note("A5"), 1.41, 2.5 * env(d, 0.001, 0.08), d) * env(d, 0.001, 0.12)
    snap = bandpass(noise(d), 1500, 5000) * env(d, 0.0005, 0.01) * 0.4
    return soften((tone + snap) * env(d, 0.002, 0.42))


@sound(SOUNDS, peak=-9)
def crumble():
    """A storm cloud giving way: a dull crack, crumbly bits falling apart and
    a short grumble of thunder inside it."""
    d = 0.6
    crack = bandpass(noise(d), 600, 3500) * env(d, 0.0005, 0.03)
    bits = bandpass(crackle(d, 220, 0.003), 500, 2500) * env(d, 0.01, 0.4)
    grumble = highpass(sweep_filter(noise(d, "brown"), 1000, 320, "low"), 220, 4) * env(d, 0.02, 0.45)
    drop = glide(440, 230, 0.25) * env(0.25, 0.002, 0.2)
    return soften(highpass(place((0, pk(crack) * 0.8 + pk(bits) * 0.6 + pk(grumble) * 0.7), (0, drop * 0.35)), 180, 4))


@sound(SOUNDS, peak=-12)
def pop():
    """A lemon cloud vanishing: a bubbly pop and a tiny glockenspiel shine
    on F-sharp 6."""
    blip = chirp(700, 1700, 0.035)
    click = bandpass(noise(0.02), 1500, 5000) * env(0.02, 0.0005, 0.006) * 0.4
    shine = glock(note("F#6"), 0.3, 0.22, 0.6) * 0.35
    return place((0, blip + pad(click, 0.035)), (0.025, shine))


# ---------------------------------------------------------------- pickups

@sound(SOUNDS, peak=-11)
def star():
    """A star: a bright two-note glockenspiel ding, A5 then D6."""
    return place((0, glock(note("A5"), 0.15, 0.1) * 0.7), (0.05, glock(note("D6"), 0.45, 0.35)))


@sound(SOUNDS, peak=-7)
def powerup():
    """The propeller cap: a quick glockenspiel run up D major over a whirr
    winding up."""
    up = run(("D5", "F#5", "A5", "D6", "F#6"), 0.045, lambda f, i: glock(f, 0.35, 0.25) * (0.7 + 0.08 * i))
    d = 0.4
    t = t_axis(d)
    whirr = bandpass(noise(d), 600, 2600) * (0.6 + 0.4 * np.sin(2 * np.pi * expramp(d, 8, 30) * t)) * ramp(d, 0.2, 1)
    whirr *= env(d, 0.05, 0.4, hold=0.15)
    return soften(place((0, up), (0, pk(whirr) * 0.3)))


@sound(SOUNDS, peak=-14, loop=True)
def propeller():
    """Flying under the cap: blades whupping 24 times a second over a small
    motor whine on A4 (whole waves in the 0.5 s loop)."""
    d = 0.55
    t = t_axis(d)
    whup = bandpass(noise(d), 500, 2400) * (0.55 + 0.45 * np.sin(2 * np.pi * 24 * t) ** 2)
    whine = lowpass(osc(440, d, "triangle") * 0.6 + osc(880, d) * 0.2, 2500)
    return loopable(pk(whup) * 0.8 + pk(whine) * 0.25, 0.05)


@sound(SOUNDS, peak=-6)
def rocket():
    """The rocket lighting: a thump, a hiss sweeping up and a roar opening."""
    d = 0.7
    thump = glide(300, 140, 0.15) * env(0.15, 0.002, 0.12)
    hiss = sweep_filter(noise(d), 500, 4500, "band", q=1.8) * env(d, 0.01, 0.6, hold=0.05)
    roar = bandpass(noise(d, "pink"), 250, 1600) * env(d, 0.04, 0.55, hold=0.1)
    return soften(place((0, thump * 0.8), (0.02, pk(hiss) * 0.55 + pk(roar) * 0.8)))


@sound(SOUNDS, peak=-11, loop=True)
def rocket_loop():
    """Riding the rocket: a flame roar with an uneven flutter and crackles."""
    d = 0.65
    t = t_axis(d)
    roar = bandpass(noise(d, "pink"), 240, 2000)
    flutter = 1 + 0.2 * np.sin(2 * np.pi * 22 * t) + 0.1 * np.sin(2 * np.pi * 37 * t + 1.1)
    pops = lowpass(crackle(d, 50, 0.002), 3000)
    hiss = bandpass(noise(d), 2500, 5000)
    return loopable(pk(roar * flutter) * 0.85 + pk(pops) * 0.2 + pk(hiss) * 0.06, 0.05)


# ---------------------------------------------------------------- pests and storms

def squeak(dur, f0, f1, f2=None):
    """A pest's little voice: a nasal pulse wave through a formant."""
    if f2 is None:
        f = expramp(dur, f0, f1, 0.7)
    else:
        half = dur / 2
        f = np.concatenate([expramp(half, f0, f1, 0.6), expramp(dur - half, f1, f2, 1.2)])
    src = osc(f, dur, "pulse", duty=0.3)
    return (bandpass(src, 900, 2200) + 0.4 * bandpass(src, 2400, 3600)) * adsr(dur, 0.005, dur * 0.4, 0.7, dur * 0.3)


@sound(SOUNDS, peak=-9)
def stomp():
    """Landing on a pest: a squelch, its squeak falling away and the springy
    bounce off its head."""
    squelch = lowpass(noise(0.1), 1500) * env(0.1, 0.001, 0.07)
    squish = glide(500, 180, 0.12, curve=0.5) * env(0.12, 0.002, 0.1)
    boing = vibrato(expramp(0.2, note("A4"), note("A5"), 0.4), 0.2, 26, 0.4)
    boing = osc(boing, 0.2) * env(0.2, 0.003, 0.17)
    return place((0, squelch * 0.7 + pad(squish, 0.1) * 0.6), (0.02, squeak(0.16, 1500, 700) * 0.5), (0.06, boing * 0.6))


@sound(SOUNDS, peak=-9)
def bonk():
    """A pest knocked away in flight: a hollow thwack and a squeal."""
    d = 0.2
    t = t_axis(d)
    knock = sum(a * np.sin(2 * np.pi * f * t) * env(d, 0.001, dk) for f, a, dk in ((520, 1.0, 0.1), (1240, 0.5, 0.05), (2050, 0.25, 0.03)))
    slap = bandpass(noise(d), 900, 4000) * env(d, 0.0005, 0.012) * 0.6
    return place((0, knock + slap), (0.04, squeak(0.24, 1300, 2100, 900) * 0.55))


@sound(SOUNDS, peak=-14, loop=True)
def buzz():
    """A pest nearby: wings buzzing at 30 beats a second on a nasal saw,
    on A3 and its octave (whole waves in the 0.5 s loop)."""
    d = 0.55
    t = t_axis(d)
    tone = osc(220, d, "saw") * 0.6 + osc(440, d, "saw") * 0.25
    tone = bandpass(tone, 350, 3000) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 30 * t)))
    return loopable(pk(tone), 0.05)


@sound(SOUNDS, peak=-5)
def hurt():
    """Caught by a pest: a buzzy sting, a cartoon bonk and a squeak of
    surprise from the climber."""
    d = 0.32
    sting = bandpass(osc(expramp(d, 330, 250), d, "saw"), 400, 3000) * env(d, 0.002, 0.2)
    sting *= 0.7 + 0.3 * np.sin(2 * np.pi * 40 * t_axis(d))
    bonk_ = glide(700, 260, 0.14) * env(0.14, 0.001, 0.12)
    yelp = osc(vibrato(expramp(0.2, note("A5"), note("D6"), 0.5), 0.2, 9, 0.3), 0.2, "triangle") * adsr(0.2, 0.01, 0.1, 0.8, 0.06)
    return soften(place((0, pk(sting) * 0.6), (0, bonk_ * 0.8), (0.07, yelp * 0.45)))


@sound(SOUNDS, peak=-9)
def fall():
    """Falling off the bottom: a slide whistle wobbling down from A5 to D4."""
    d = 0.8
    pitch = vibrato(expramp(d, note("A5"), note("D4"), 0.9), d, 7, 0.3)
    tone = osc(pitch, d) + 0.15 * osc(pitch, d, "triangle")
    air = bandpass(noise(d), 1500, 4000) * 0.05
    return (tone + air) * adsr(d, 0.03, 0.3, 0.85, 0.2)


@sound(SOUNDS, peak=-12)
def charge():
    """A thundercloud charging: static crackling faster and faster over a
    buzz that swells and rises."""
    d = 0.7
    t = t_axis(d)
    rate = expramp(d, 8, 40)
    flick = 0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(rate) / SR) ** 2
    hum = bandpass(osc(expramp(d, 140, 210), d, "saw"), 300, 2400) * flick
    sparks = bandpass(crackle(d, 140, 0.0012), 1500, 6000) * ramp(d, 0.3, 1)
    x = (pk(hum) * 0.6 + pk(sparks) * 0.55) * ramp(d, 0.15, 1, 1.5) * env(d, 0.01, 2, hold=0.65)
    return soften(highpass(x, 260, 4))


@sound(SOUNDS, peak=-6)
def zap():
    """Lightning: a sharp crack, an electric buzz frying for a moment and a
    low rumble of thunder after."""
    d = 0.65
    crack = bandpass(noise(d), 1200, 6500) * env(d, 0.0003, 0.025)
    fry = drive(osc(233, d, "saw") + 0.5 * osc(311, d, "square"), 3)
    fry = bandpass(fry, 400, 4000) * (0.7 + 0.3 * np.sign(np.sin(2 * np.pi * 45 * t_axis(d)))) * env(d, 0.002, 0.3)
    rumble = bandpass(noise(d, "brown"), 240, 800) * env(d, 0.05, 0.5, hold=0.06)
    return soften(highpass(place((0, pk(crack) * 0.9 + pk(fry) * 0.5), (0.04, pk(rumble) * 0.6)), 200, 4))


# ---------------------------------------------------------------- air

@sound(SOUNDS, peak=-12, loop=True)
def wind():
    """The wind up high: soft pink noise in a band that drifts slowly up and
    down, with a breathy whistle on top. The game turns it up with height."""
    d = 2.0
    t = t_axis(d)
    base = noise(d, "pink")
    low = bandpass(base, 250, 900)
    mid = bandpass(base, 700, 2200)
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / (d - 0.3) * 2)
    body = low * (0.8 - 0.3 * swell) + mid * (0.4 + 0.4 * swell)
    whistle = bandpass(noise(d), 1400, 1700) * (0.3 + 0.7 * swell) * 0.4
    return loopable(pk(body) * 0.85 + pk(whistle) * 0.15, 0.3)


# ---------------------------------------------------------------- moments

@sound(SOUNDS, peak=-10)
def milestone():
    """Every 100 m: two glockenspiel notes, F-sharp 6 and A6."""
    return place((0, glock(note("F#6"), 0.35, 0.28)), (0.08, glock(note("A6"), 0.5, 0.4)))


@sound(SOUNDS, peak=-7)
def phase():
    """The sky changing (sunset, night, space): a flute note under a
    glockenspiel arpeggio up D major, on the beat of the music."""
    arp = run(("D5", "F#5", "A5", "D6", "F#6", "A6"), SIXTEENTH * 0.5, lambda f, i: glock(f, 0.6, 0.45) * (0.6 + 0.07 * i))
    lead = flute(note("A5"), 0.8, 0.04, 0.35) * 0.35 + flute(note("D5"), 0.8, 0.04, 0.35) * 0.25
    return reverb(soften(place((0, arp), (0.05, lead))), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-8)
def best():
    """Climbing past the best height: three quick bright bells, F-sharp 6,
    A6 and D7."""
    notes = run(("F#6", "A6", "D7"), 0.06, lambda f, i: glock(f, 0.45, 0.32 + 0.1 * i, 0.5))
    return reverb(soften(notes), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-8)
def start():
    """Off we go: a springy boing and a glockenspiel hop D5 A5 D6."""
    boing = vibrato(expramp(0.2, note("D4"), note("D5"), 0.4), 0.2, 24, 0.5)
    boing = osc(boing, 0.2) * env(0.2, 0.003, 0.17)
    hop = run(("D5", "A5", "D6"), SIXTEENTH * 0.6, lambda f, i: glock(f, 0.45, 0.32))
    return soften(place((0, boing * 0.6), (0.05, hop)))


@sound(SOUNDS, peak=-8)
def gameover():
    """The results without a record: a soft glockenspiel line falling A5 F#5
    E5 that comes to rest on D5 with a flute below."""
    line = run(("A5", "F#5", "E5"), SIXTEENTH, lambda f, i: glock(f, 0.4, 0.3))
    rest = place((0, glock(note("D5"), 0.8, 0.65)), (0, flute(note("D4"), 0.7, 0.05, 0.35) * 0.4), (0, flute(note("A4"), 0.7, 0.05, 0.35) * 0.25))
    return reverb(soften(place((0, line), (3 * SIXTEENTH, rest * 0.8))), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-5)
def record():
    """A new best on the results: a glockenspiel fanfare on the beat of the
    music, up D major to a ringing D chord with a flute on top."""
    lead_notes = (("A4", 0, 1), ("D5", 1, 1), ("F#5", 2, 1), ("A5", 3, 2), ("F#5", 5, 1), ("A5", 6, 1), ("D6", 7, 6))
    lead = place(*[(at * SIXTEENTH, glock(note(n), length * SIXTEENTH + 0.3, length * SIXTEENTH * 2)) for n, at, length in lead_notes])
    chord = (glock(note("D6"), 0.9, 0.8) + glock(note("F#6"), 0.9, 0.65) * 0.6 + glock(note("A6"), 0.9, 0.55) * 0.4) * 0.6
    tune = flute(note("A5"), 0.75, 0.03, 0.3) * 0.3 + flute(note("D5"), 0.75, 0.03, 0.3) * 0.25
    sparkle = run(("A6", "D7", "F#6", "D7"), 0.06, lambda f, i: glock(f, 0.25, 0.18, 0.3) * 0.25)
    return reverb(soften(place((0, lead), (7 * SIXTEENTH, chord), (7 * SIXTEENTH, tune), (7 * SIXTEENTH + 0.08, sparkle))), 0.2, IR_SMALL)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    """Menu cursor: a tiny glockenspiel tick on E6."""
    return glock(note("E6"), 0.1, 0.06, 0.5)


@sound(SOUNDS, peak=-10)
def select():
    """Menu confirm: D6 up to A6."""
    return place((0, glock(note("D6"), 0.18, 0.12)), (0.06, glock(note("A6"), 0.3, 0.22)))


@sound(SOUNDS, peak=-12)
def back():
    """Menu back: A5 down to D5."""
    return place((0, glock(note("A5"), 0.18, 0.12)), (0.06, glock(note("D5"), 0.3, 0.22)))


@sound(SOUNDS, peak=-10)
def pause():
    """Pause: two soft flute notes, F-sharp 5 down to D5."""
    return place((0, flute(note("F#5"), 0.14, 0.01, 0.05, 0.08)), (0.11, flute(note("D5"), 0.24, 0.01, 0.12, 0.08)))


if __name__ == "__main__":
    write_all(SOUNDS, "cloud-climber")
