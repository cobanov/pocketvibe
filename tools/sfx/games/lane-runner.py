"""Lane Runner sound effects: footsteps on the road, lane changes, jumps and
slides, coins, vans, near misses, power-ups, the crash and the menus.

Tonal sounds are in F-sharp minor (the music is F-sharp minor at 140 BPM),
and the jingles move in its sixteenths, so they sit with the music. The two
loops (run and wind) are played with sound.loop() and follow the running
speed: run holds two footsteps, so its rate sets the stride.

    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/lane-runner.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}

BEAT = 60 / 140
S16 = BEAT / 4  # a sixteenth note, 0.107 s

Fs3, D4, E4 = note("F#3"), note("D4"), note("E4")
Fs4, A4, Cs5 = note("F#4"), note("A4"), note("C#5")
E5, Fs5, Gs5, A5, B5 = note("E5"), note("F#5"), note("G#5"), note("A5"), note("B5")
Cs6, E6, Fs6, A6 = note("C#6"), note("E6"), note("F#6"), note("A6")


def pk(x):
    """Scaled to a peak of 1, so parts can be mixed by their weights."""
    return x / (np.max(np.abs(x)) + 1e-12)


def chip(freq, dur, decay=None, duty=0.25, tri=0.5):
    """A chiptune note: a narrow pulse with a triangle under it, softened."""
    x = osc(freq, dur, "pulse", duty) + tri * osc(freq, dur, "triangle")
    return lowpass(x, 5200) * env(dur, 0.002, decay or dur)


def melody(notes, voice=chip):
    """notes: (start in sixteenths, freq, length in sixteenths)."""
    return place(*[(start * S16, voice(f, n * S16)) for start, f, n in notes])


def footstep(weight=1.0):
    """A trainer on asphalt: a soft heel tap and a short gritty scuff, kept
    above 200 Hz for the handheld's small speaker."""
    d = 0.11
    thud = glide(300, 150, d) * env(d, 0.002, 0.05)
    tap = bandpass(noise(d), 350, 1300) * env(d, 0.001, 0.04)
    scuff = bandpass(noise(d), 1200, 4200) * env(d, 0.001, 0.035)
    grit = bandpass(crackle(d, 260, 0.0008), 1500, 6000) * env(d, 0.001, 0.05)
    return (pk(thud) * 0.5 + pk(tap) * 0.6 + pk(scuff) * 0.5 + pk(grit) * 0.2) * weight


def whoosh(d, f0, f1, q=1.6, attack=0.02):
    """Air rushing past: pink noise through a band that glides f0 -> f1."""
    return sweep_filter(noise(d, "pink"), f0, f1, "band", q) * env(d, attack, d * 0.85)


# ---------------------------------------------------------------- the runner

@sound(SOUNDS, peak=-11, loop=True)
def run():
    """Running: two footsteps, left a touch heavier than right, 0.4 s apart
    for both (five steps a second at rate 1)."""
    d = 0.4
    return place((0.004, footstep(1.0)), (0.204, footstep(0.85)), (d - 0.001, np.zeros(1)))[: int(d * SR)]


@sound(SOUNDS, peak=-15)
def lane():
    """Changing lanes: a short swish of air."""
    return whoosh(0.14, 700, 2600, 1.5, 0.015)


@sound(SOUNDS, peak=-12)
def jump():
    """A springy take-off: F#4 bouncing up to C#5 over a puff of air."""
    d = 0.14
    tone = glide(Fs4, Cs5, d, "triangle", curve=0.6) + 0.25 * glide(Fs4, Cs5, d, "pulse", 0.3, curve=0.6)
    tone = lowpass(tone, 4000) * env(d, 0.003, 0.13)
    puff = bandpass(noise(0.09, "pink"), 500, 2500) * env(0.09, 0.004, 0.07)
    return place((0, pk(tone) * 0.7), (0, pk(puff) * 0.45))


@sound(SOUNDS, peak=-12)
def land():
    """Back on the road: a thud and a scuff."""
    d = 0.16
    thud = glide(300, 120, 0.12) * env(0.12, 0.002, 0.09)
    tap = bandpass(noise(0.1), 300, 1200) * env(0.1, 0.001, 0.06)
    scuff = bandpass(noise(d), 900, 3600) * env(d, 0.002, 0.09)
    return place((0, pk(thud) * 0.7), (0, pk(tap) * 0.55), (0.004, pk(scuff) * 0.45))


@sound(SOUNDS, peak=-13)
def slide():
    """Sliding on the back: a scraping shhh that fades as it slows."""
    d = 0.5
    t = t_axis(d)
    scrape = bandpass(noise(d), 1300, 4200) * (1 + 0.25 * np.sin(2 * np.pi * 23 * t))
    body = lowpass(noise(d, "brown"), 500)
    grit = bandpass(crackle(d, 180, 0.001), 1500, 5500)
    x = pk(scrape) * 0.6 + pk(body) * 0.35 + pk(grit) * 0.25
    return x * env(d, 0.01, 0.45)


@sound(SOUNDS, peak=-13)
def dive():
    """DOWN in the air: a quick whoosh falling to the ground."""
    return whoosh(0.16, 2600, 600, 1.7, 0.01)


@sound(SOUNDS, peak=-10)
def bump():
    """Running into the side of something: a hollow knock and a stumble."""
    d = 0.22
    knock = glide(230, 120, 0.12) * env(0.12, 0.001, 0.1)
    wood = fm(420, 1.48, ramp(0.12, 3.0, 0.3), 0.12) * env(0.12, 0.001, 0.07)
    shuffle = bandpass(noise(d), 800, 3000) * env(d, 0.03, 0.15)
    return place((0, pk(knock) * 0.8), (0, pk(wood) * 0.35), (0.04, pk(shuffle) * 0.3))


@sound(SOUNDS, peak=-4)
def crash():
    """Running into an obstacle: a heavy thump, a crunch and bits rattling
    down."""
    d = 0.9
    boom = glide(240, 70, 0.45, curve=0.6) * env(0.45, 0.002, 0.4)
    body = bandpass(noise(0.5, "pink"), 250, 1800) * env(0.5, 0.002, 0.35)
    crunch = bandpass(noise(0.2), 500, 3500) * env(0.2, 0.001, 0.15)
    crack = lowpass(noise(0.06), 6000) * env(0.06, 0.0005, 0.04)
    debris = bandpass(crackle(d, 50, 0.004), 500, 4500) * env(d, 0.06, 0.8, hold=0.1)
    x = place((0, pk(boom) * 0.6), (0, pk(body) * 0.6), (0, pk(crunch) * 0.6), (0, pk(crack) * 0.45), (0.04, pk(debris) * 0.35))
    return reverb(drive(x, 1.8), 0.1, IR_SMALL)


# ---------------------------------------------------------------- the road

@sound(SOUNDS, peak=-16, loop=True)
def wind():
    """Air rushing past at speed, swelling and easing a little."""
    d = 1.25
    t = t_axis(d)
    air = bandpass(noise(d, "pink"), 280, 1700)
    swell = 1 + 0.25 * np.sin(2 * np.pi * 0.8 * t) + 0.1 * np.sin(2 * np.pi * 2.4 * t + 1)
    hiss = bandpass(noise(d), 2500, 5000)
    return loopable(pk(air) * swell * 0.9 + pk(hiss) * 0.06, 0.08)


@sound(SOUNDS, peak=-13)
def coin():
    """C#6 then F#6, quick and bright. The game raises it along F-sharp
    minor for a chain of coins."""
    d1, d2 = 0.05, 0.12
    first = (osc(Cs6, d1, "triangle") + 0.25 * osc(Cs6, d1, "square")) * env(d1, 0.001, 0.09, hold=0.03)
    second = (osc(Fs6, d2, "triangle") + 0.2 * osc(Fs6, d2, "square")) * env(d2, 0.001, 0.11)
    sparkle = osc(Fs6 * 2, d2) * env(d2, 0.001, 0.05) * 0.12
    return lowpass(place((0, first * 0.8), (d1, second + sparkle)), 5000)


@sound(SOUNDS, peak=-10)
def horn():
    """A van far ahead: two honks on A4 and C#5 together, a little out of
    tune like a real horn."""
    def honk(dur):
        x = osc(A4, dur, "saw") + osc(A4 * 1.004, dur, "square") * 0.5 + osc(Cs5, dur, "saw") * 0.8
        return lowpass(x, 2600) * adsr(dur, 0.008, 0.05, 0.85, 0.03)
    return place((0, honk(0.13)), (0.19, honk(0.24)))


@sound(SOUNDS, peak=-9)
def vanby():
    """A van rushing past: an engine roar loudest as it passes, dropping
    in pitch as it goes."""
    d = 0.6
    t = t_axis(d)
    shape = np.where(t < 0.16, (t / 0.16) ** 2, np.exp(-(t - 0.16) / 0.13))
    roar = sweep_filter(noise(d, "pink"), 2200, 450, "band", 1.7)
    pitch = 200 + 45 * np.tanh(-(t - 0.16) / 0.05)
    engine = lowpass(osc(pitch, d, "saw") + 0.5 * osc(pitch * 2, d, "square"), 1300)
    return (pk(roar) * 0.75 + pk(engine) * 0.35) * shape


@sound(SOUNDS, peak=-11)
def near():
    """A near miss: a wall or van swishing past close, and a bright C#6 F#6
    blip that says well done."""
    d = 0.3
    t = t_axis(d)
    shape = np.where(t < 0.07, t / 0.07, np.exp(-(t - 0.07) / 0.07))
    swish = sweep_filter(noise(d, "pink"), 3000, 700, "band", 1.8) * shape
    blip = seq([Cs6, Fs6], 0.05, lambda f, i: lowpass(osc(f, 0.08, "triangle") + 0.2 * osc(f, 0.08, "square"), 5000) * env(0.08, 0.001, 0.07))
    return place((0, pk(swish) * 0.8), (0.06, pk(blip) * 0.45))


# ---------------------------------------------------------------- power-ups and jingles

@sound(SOUNDS, peak=-8)
def pickup():
    """A power-up: a sparkling run up F-sharp minor with a shimmer on top."""
    run = seq([Fs5, A5, Cs6, Fs6, A6], S16 / 2, lambda f, i: chip(f, 0.12 if i < 4 else 0.35, None, 0.25, 0.7))
    shimmer = fm(Fs6, 3.01, ramp(0.5, 2.5, 0.2), 0.5) * env(0.5, 0.01, 0.45)
    return lowpass(place((0, run), (0.08, shimmer * 0.25)), 7000)


@sound(SOUNDS, peak=-6)
def shield_break():
    """The shield takes a hit: glass bursting, with bright falling chimes."""
    d = 0.7
    burst = highpass(noise(0.12), 2500) * env(0.12, 0.0005, 0.1)
    shards = bandpass(crackle(d, 90, 0.0015), 2500, 7500) * env(d, 0.01, 0.6)
    chimes = place(*[(i * 0.045, fm(f, 2.76, ramp(0.35, 3.0, 0.5), 0.35) * env(0.35, 0.001, 0.3)) for i, f in enumerate([Fs6, Cs6, A5, Fs5])])
    thump = glide(220, 90, 0.12) * env(0.12, 0.001, 0.1)
    x = place((0, pk(burst) * 0.6), (0, pk(shards) * 0.4), (0.01, pk(chimes) * 0.5), (0, pk(thump) * 0.5))
    return lowpass(x, 7500)


@sound(SOUNDS, peak=-12)
def power_end():
    """A power-up runs out: C#6 dropping to F#5, softly."""
    return seq([Cs6, Fs5], 0.08, lambda f, i: chip(f, 0.09 if i == 0 else 0.16, None, 0.5, 0.8))


@sound(SOUNDS, peak=-7)
def speedup():
    """A new stage: air rushing up and C#5 F#5 A5 to a ringing C#6."""
    d = 0.5
    rush = sweep_filter(noise(d, "pink"), 300, 3500, "band", 1.6) * env(d, 0.25, 0.25, hold=0.05)
    notes = melody([(0, Cs5, 0.5), (0.5, Fs5, 0.5), (1, A5, 0.5), (1.5, Cs6, 3)])
    return place((0, pk(rush) * 0.5), (0.12, pk(notes) * 0.8))


@sound(SOUNDS, peak=-7)
def best():
    """Passing the best distance mid-run: a fast run up to F#6 that rings."""
    run = melody([(0, Cs5, 0.75), (0.75, Fs5, 0.75), (1.5, A5, 0.75), (2.25, Cs6, 0.75)])
    ring = chip(Fs6, 0.45, 0.42) + 0.6 * chip(Cs6, 0.45, 0.42, tri=0.8)
    x = place((0, run), (3 * S16, ring))
    return lowpass(echo(x, S16 * 2, 0.22, 2), 6000)


@sound(SOUNDS, peak=-5)
def record():
    """A new record on the results: F#m, D, E, then F# with an open fifth."""
    lead = melody([
        (0, Cs5, 1), (1, Fs5, 1), (2, A5, 2),
        (4, Fs5, 1), (5, A5, 1),
        (6, B5, 1), (7, Gs5, 1),
        (8, Fs6, 6),
    ])
    top = chip(Cs6, 6 * S16, 6 * S16, tri=0.9) * 0.55
    bass = lambda f, n: osc(f, n * S16, "triangle") * env(n * S16, 0.004, n * S16)
    low = place((0, bass(Fs4, 4)), (4 * S16, bass(D4, 2)), (6 * S16, bass(E4, 2)), (8 * S16, bass(Fs4, 6)))
    x = place((0, lead), (8 * S16, top), (0, low * 0.7))
    return lowpass(reverb(x, 0.12, IR_SMALL), 6500)


@sound(SOUNDS, peak=-6)
def gameover():
    """The run is over: C#5, A4, F#4 falling in eighths, the last one sagging."""
    first = melody([(0, Cs5, 2), (2, A4, 2)])
    last_d = 0.55
    sag = expramp(last_d, Fs4, semis(Fs4, -0.6), curve=2)
    last = lowpass(osc(sag, last_d, "pulse", 0.25) + 0.5 * osc(sag, last_d, "triangle"), 5000)
    last *= env(last_d, 0.003, last_d)
    low = osc(Fs3, last_d, "triangle") * env(last_d, 0.004, last_d)
    return lowpass(place((0, first), (4 * S16, last), (4 * S16, low * 0.6)), 6000)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def menu_move():
    """Cursor tick."""
    d = 0.045
    return osc(Cs6, d, "triangle") * env(d, 0.001, 0.035) + 0.2 * osc(Fs6 * 2, d) * env(d, 0.0005, 0.01)


@sound(SOUNDS, peak=-10)
def menu_select():
    """Confirm: F#5 up to C#6."""
    return seq([Fs5, Cs6], 0.055, lambda f, i: chip(f, 0.07 if i == 0 else 0.11, None, 0.5))


@sound(SOUNDS, peak=-12)
def menu_back():
    """Back: C#6 down to F#5."""
    return seq([Cs6, Fs5], 0.055, lambda f, i: chip(f, 0.07 if i == 0 else 0.1, None, 0.5))


@sound(SOUNDS, peak=-10)
def pause():
    """Pause: a soft fall from F#5 to F#4."""
    d = 0.2
    return glide(Fs5, Fs4, d, "triangle") * env(d, 0.003, 0.19)


@sound(SOUNDS, peak=-6)
def start():
    """A run begins: a rush of air and a quick F-sharp minor run upwards."""
    d = 0.55
    rush = sweep_filter(noise(d, "pink"), 250, 3000, "band", 1.5) * env(d, 0.03, 0.45)
    thump = glide(130, 55, 0.14) * env(0.14, 0.002, 0.12)
    up = seq([Fs5, A5, Cs6, Fs6], S16 / 2, lambda f, i: chip(f, 0.1 if i < 3 else 0.28))
    return place((0, pk(rush) * 0.45), (0, pk(thump) * 0.4), (0.05, pk(up) * 0.8))


if __name__ == "__main__":
    write_all(SOUNDS, "runner", sys.argv[1:] or None)
