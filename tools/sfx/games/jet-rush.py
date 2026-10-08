"""Jet Rush sound effects: the jetpack, footsteps on the metal floor, coins,
zappers, missiles, lasers, the crash and the menus.

Tonal sounds are in E minor (the music is E minor at 128 BPM), and the
jingles move in its sixteenths, so they sit with the music. The three loops
(jet, scrape and the two hums) are played with sound.loop() and shaped by the
game; the hums are tuned so a whole number of waves fits the loop.

    uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/jet-rush.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}

BEAT = 60 / 128
S16 = BEAT / 4  # a sixteenth note, 0.117 s

E2, E3, B3 = note("E2"), note("E3"), note("B3")
C4, D4, E4, G4, A4, B4 = note("C4"), note("D4"), note("E4"), note("G4"), note("A4"), note("B4")
E5, Fs5, G5, A5, B5 = note("E5"), note("F#5"), note("G5"), note("A5"), note("B5")
D6, E6 = note("D6"), note("E6")


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


# ---------------------------------------------------------------- the hero

@sound(SOUNDS, peak=-10, loop=True)
def jet():
    """Jetpack thrust: a flame roar with an uneven flutter and a low rumble."""
    d = 0.85
    t = t_axis(d)
    roar = bandpass(noise(d, "pink"), 260, 2100)
    flutter = 1 + 0.2 * np.sin(2 * np.pi * 26 * t) + 0.12 * np.sin(2 * np.pi * 39 * t + 1.3)
    rumble = lowpass(noise(d, "brown"), 200)
    hiss = bandpass(noise(d), 2400, 4800)
    pops = lowpass(crackle(d, 45, 0.002), 2600)
    x = pk(roar * flutter) * 0.85 + pk(rumble) * 0.3 + pk(hiss) * 0.05 + pk(pops) * 0.2
    return loopable(x, 0.05)


@sound(SOUNDS, peak=-11)
def jet_on():
    """Ignition: a short whoosh opening upwards over a soft thump."""
    d = 0.24
    whoosh = sweep_filter(noise(d, "pink"), 300, 2400, "band", 1.6) * env(d, 0.012, 0.2)
    thump = glide(150, 55, 0.12) * env(0.12, 0.002, 0.1)
    return place((0, pk(whoosh) * 0.8), (0, pk(thump) * 0.5))


@sound(SOUNDS, peak=-14)
def step():
    """A boot on a metal floor tile."""
    d = 0.08
    tick = bandpass(noise(d), 1300, 4200) * env(d, 0.0005, 0.03)
    ring = fm(620, 1.41, ramp(d, 2.0, 0.0), d) * env(d, 0.001, 0.04)
    body = osc(140, d) * env(d, 0.001, 0.05)
    return pk(tick) * 0.6 + pk(ring) * 0.2 + pk(body) * 0.5


@sound(SOUNDS, peak=-10)
def land():
    """Back on the floor after a fall: a thud and a short skid."""
    d = 0.24
    thud = glide(140, 60, 0.16) * env(0.16, 0.002, 0.14)
    skid = bandpass(noise(d), 700, 3200) * env(d, 0.006, 0.18)
    clank = fm(380, 1.41, ramp(d, 2.5, 0.0), d) * env(d, 0.001, 0.12)
    return place((0, pk(thud) * 0.8), (0, pk(skid) * 0.4), (0, pk(clank) * 0.25))


@sound(SOUNDS, peak=-12)
def bump():
    """Head against the ceiling: a hollow metal clank."""
    d = 0.18
    clank = fm(520, 1.41, ramp(d, 3.0, 0.2), d) * env(d, 0.001, 0.14)
    ping = fm(1310, 2.0, 1.0, d) * env(d, 0.001, 0.06)
    tick = bandpass(noise(d), 2000, 6000) * env(d, 0.0005, 0.015)
    return pk(clank) * 0.8 + pk(ping) * 0.25 + pk(tick) * 0.3


@sound(SOUNDS, peak=-14, loop=True)
def scrape():
    """Scraping along the ceiling: a grind with sparks crackling in it."""
    d = 0.55
    t = t_axis(d)
    grind = bandpass(noise(d), 1400, 4200) * (1 + 0.45 * np.sin(2 * np.pi * 18 * t))
    sparks = bandpass(crackle(d, 160, 0.0015), 1500, 6000)
    return loopable(lowpass(pk(grind) * 0.5 + pk(sparks) * 0.6, 6000), 0.05)


@sound(SOUNDS, peak=-10)
def thud():
    """The tumbling body bouncing on the floor."""
    d = 0.16
    body = glide(150, 70, d) * env(d, 0.002, 0.13)
    slap = lowpass(noise(d), 1200) * env(d, 0.002, 0.07)
    return pk(body) * 0.8 + pk(slap) * 0.6


# ---------------------------------------------------------------- coins

@sound(SOUNDS, peak=-12)
def coin():
    """B5 then E6, quick and bright. The game raises it along E minor for a
    chain of coins."""
    d1, d2 = 0.05, 0.12
    first = (osc(B5, d1, "triangle") + 0.25 * osc(B5, d1, "square")) * env(d1, 0.001, 0.09, hold=0.03)
    second = (osc(E6, d2, "triangle") + 0.2 * osc(E6, d2, "square")) * env(d2, 0.001, 0.11)
    sparkle = osc(E6 * 2, d2) * env(d2, 0.001, 0.05) * 0.15
    return lowpass(place((0, first * 0.8), (d1, second + sparkle)), 5000)


# ---------------------------------------------------------------- zappers and lasers

@sound(SOUNDS, peak=-12, loop=True)
def zap_hum():
    """A zapper close by: a mains buzz on E with crackles. 82 Hz and its
    octaves, so whole waves fill the 0.5 s loop."""
    d = 0.55
    t = t_axis(d)
    buzz = lowpass(osc(82, d, "saw") * 0.35 + osc(164, d, "saw") * 0.5 + osc(328, d, "square") * 0.15, 2200)
    buzz *= 0.8 + 0.2 * np.sin(2 * np.pi * 30 * t)
    crackles = bandpass(crackle(d, 90, 0.0012), 1800, 6000)
    return loopable(pk(buzz) * 0.7 + pk(crackles) * 0.45, 0.05)


@sound(SOUNDS, peak=-12, loop=True)
def laser_hum():
    """A laser beam: two saws on E3 (164 and 166 Hz, beating twice a second)
    and an octave. The game plays it slow and low while a laser charges."""
    d = 0.55
    t = t_axis(d)
    tone = osc(164, d, "saw") * 0.5 + osc(166, d, "saw") * 0.4 + osc(328, d, "square") * 0.2
    tone = lowpass(tone, 2800) * (1 + 0.25 * np.sin(2 * np.pi * 16 * t))
    fizz = bandpass(noise(d), 3000, 6000)
    return loopable(pk(tone) * 0.85 + pk(fizz) * 0.06, 0.05)


@sound(SOUNDS, peak=-9)
def laser_fire():
    """A laser opening up: a falling zap, a spit of noise and a hum swelling."""
    zap = lowpass(glide(E6, E4, 0.16, "square"), 4000) * env(0.16, 0.001, 0.15)
    spit = bandpass(noise(0.1), 1500, 6000) * env(0.1, 0.0005, 0.06)
    swell = lowpass(osc(E3, 0.36, "saw"), 1500) * env(0.36, 0.01, 0.3)
    return place((0, pk(zap) * 0.6), (0, pk(spit) * 0.4), (0.02, pk(swell) * 0.5))


# ---------------------------------------------------------------- missiles

@sound(SOUNDS, peak=-14)
def warn():
    """Missile warning: one square beep on B5, repeated while it aims."""
    d = 0.09
    return lowpass(osc(B5, d, "square"), 3500) * adsr(d, 0.002, 0.05, 0.7, 0.02)


@sound(SOUNDS, peak=-12)
def lock():
    """Locked on: three fast beeps on E6."""
    beep = lambda f, i: lowpass(osc(f, 0.05, "square"), 3500) * env(0.05, 0.001, 0.05, hold=0.03)
    return seq([E6, E6, E6], 0.07, beep)


@sound(SOUNDS, peak=-10)
def launch():
    """The missile leaves its launcher off screen: a rising hiss and a thump."""
    d = 0.5
    hiss = sweep_filter(noise(d, "pink"), 500, 3200, "band", 1.8) * env(d, 0.02, 0.42)
    thump = glide(160, 60, 0.15) * env(0.15, 0.002, 0.12)
    burn = lowpass(crackle(d, 80, 0.002), 3000) * env(d, 0.005, 0.3)
    return pk(hiss) * 0.7 + pad(pk(thump) * 0.5, d) + pk(burn) * 0.25


@sound(SOUNDS, peak=-8)
def flyby():
    """The missile streaking past: loudest after 0.22 s, as it passes the
    hero, and dropping in pitch as it goes."""
    d = 0.6
    t = t_axis(d)
    shape = np.where(t < 0.22, (t / 0.22) ** 2, np.exp(-(t - 0.22) / 0.11))
    roar = sweep_filter(noise(d, "pink"), 2600, 500, "band", 1.7)
    pitch = 290 + 45 * np.tanh(-(t - 0.22) / 0.05)
    tone = lowpass(osc(pitch, d, "saw"), 1500)
    return (pk(roar) * 0.8 + pk(tone) * 0.3) * shape


@sound(SOUNDS, peak=-4)
def explode():
    """A missile hit: a low boom, a crack and falling debris."""
    d = 1.1
    boom = glide(140, 40, 0.7, curve=0.6) * env(0.7, 0.003, 0.6)
    body = lowpass(noise(d, "pink"), 1600) * env(d, 0.004, 0.8)
    crack = lowpass(noise(0.12), 5000) * env(0.12, 0.0005, 0.08)
    debris = bandpass(crackle(d, 40, 0.004), 400, 4000) * env(d, 0.05, 0.95, hold=0.1)
    x = place((0, pk(boom) * 0.7), (0, pk(body) * 0.9), (0, pk(crack) * 0.5), (0.05, pk(debris) * 0.35))
    return reverb(drive(x, 1.8), 0.12, IR_SMALL)


@sound(SOUNDS, peak=-5)
def zapped():
    """Electrocuted: a choppy buzz on E with sizzle and FM zaps."""
    d = 0.75
    buzz = lowpass(osc(vibrato(E3, d, 9, 0.6), d, "saw") + 0.3 * osc(E2, d, "square"), 2500)
    zaps = fm(E5, 2.01, ramp(d, 6, 1), d)
    sizzle = bandpass(noise(d), 2000, 6500)
    chop = np.abs(lowpass(noise(d), 35))
    chop = 0.3 + 0.7 * pk(chop)
    x = (pk(buzz) * 0.6 + pk(zaps) * 0.25 + pk(sizzle) * 0.25) * chop * env(d, 0.003, 0.7)
    return lowpass(drive(x, 2.0), 7000)


# ---------------------------------------------------------------- jingles

@sound(SOUNDS, peak=-8)
def milestone():
    """Every 250 m: E5 G5 B5 up to E6, in sixteenths."""
    x = melody([(0, E5, 1), (1, G5, 1), (2, B5, 1), (3, E6, 3)])
    return lowpass(echo(x, S16 * 1.5, 0.25, 2), 6000)


@sound(SOUNDS, peak=-7)
def best():
    """Passing the best distance mid-run: a fast run up to E6 that rings."""
    run = melody([(0, B4, 0.75), (0.75, E5, 0.75), (1.5, G5, 0.75), (2.25, B5, 0.75)])
    ring = chip(E6, 0.45, 0.42) + 0.6 * chip(B5, 0.45, 0.42, tri=0.8)
    x = place((0, run), (3 * S16, ring))
    return lowpass(echo(x, S16 * 2, 0.22, 2), 6000)


@sound(SOUNDS, peak=-5)
def record():
    """A new record on the results: Em, C, D, then E with an open fifth."""
    lead = melody([
        (0, B4, 1), (1, E5, 1), (2, G5, 2),
        (4, E5, 1), (5, G5, 1),
        (6, A5, 1), (7, Fs5, 1),
        (8, E6, 6),
    ])
    top = chip(B5, 6 * S16, 6 * S16, tri=0.9) * 0.55
    bass = lambda f, n: osc(f, n * S16, "triangle") * env(n * S16, 0.004, n * S16)
    low = place((0, bass(E3, 4)), (4 * S16, bass(note("C3"), 2)), (6 * S16, bass(note("D3"), 2)), (8 * S16, bass(E3, 6)))
    x = place((0, lead), (8 * S16, top), (0, low * 0.7))
    return lowpass(reverb(x, 0.12, IR_SMALL), 6500)


@sound(SOUNDS, peak=-6)
def gameover():
    """The run is over: B4, G4, E4 falling in eighths, the last one sagging."""
    first = melody([(0, B4, 2), (2, G4, 2)])
    last_d = 0.55
    sag = expramp(last_d, E4, semis(E4, -0.6), curve=2)
    last = lowpass(osc(sag, last_d, "pulse", 0.25) + 0.5 * osc(sag, last_d, "triangle"), 5000)
    last *= env(last_d, 0.003, last_d)
    bass = osc(E2, last_d, "triangle") * env(last_d, 0.004, last_d)
    return lowpass(place((0, first), (4 * S16, last), (4 * S16, bass * 0.6)), 6000)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def menu_move():
    """Cursor tick."""
    d = 0.045
    return osc(B5, d, "triangle") * env(d, 0.001, 0.035) + 0.2 * osc(E6 * 2, d) * env(d, 0.0005, 0.01)


@sound(SOUNDS, peak=-10)
def menu_select():
    """Confirm: E5 up to B5."""
    return seq([E5, B5], 0.055, lambda f, i: chip(f, 0.07 if i == 0 else 0.11, None, 0.5))


@sound(SOUNDS, peak=-12)
def menu_back():
    """Back: B5 down to E5."""
    return seq([B5, E5], 0.055, lambda f, i: chip(f, 0.07 if i == 0 else 0.1, None, 0.5))


@sound(SOUNDS, peak=-10)
def pause():
    """Pause: a soft fall from E5 to E4."""
    d = 0.2
    return glide(E5, E4, d, "triangle") * env(d, 0.003, 0.19)


@sound(SOUNDS, peak=-6)
def start():
    """A run begins: the jetpack lights and a quick E minor run climbs."""
    d = 0.55
    whoosh = sweep_filter(noise(d, "pink"), 250, 3000, "band", 1.5) * env(d, 0.03, 0.45)
    thump = glide(130, 50, 0.16) * env(0.16, 0.002, 0.14)
    run = seq([E5, G5, B5, E6], S16 / 2, lambda f, i: chip(f, 0.1 if i < 3 else 0.28))
    return place((0, pk(whoosh) * 0.45), (0, pk(thump) * 0.45), (0.05, pk(run) * 0.8))


if __name__ == "__main__":
    write_all(SOUNDS, "jet-rush", sys.argv[1:] or None)
