"""Tank Brigade's sound effects: a tank battle set in D minor, to sit with the
music (a determined electronic military march, D minor, 112 BPM).

Tonal sounds use D minor (D E F G A Bb C); jingles move in 16ths of the
music's tempo and are played by a synth brass over a snare, like the march.
The engine is a seamless loop (whole chugs and track clanks fit it exactly)
that the game plays with sound.loop() and revs while the tank drives.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/tank-brigade.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 112
S16 = 60 / BPM / 4  # a 16th note, s

D3, F3, G3, A3, Bb3, C4 = (note(n) for n in ("D3", "F3", "G3", "A3", "A#3", "C4"))
D4, E4, F4, G4, A4, Bb4 = (note(n) for n in ("D4", "E4", "F4", "G4", "A4", "A#4"))
C5, D5, E5, F5, G5, A5, Bb5 = (note(n) for n in ("C5", "D5", "E5", "F5", "G5", "A5", "A#5"))
C6, D6, E6, F6, G6, A6, D7 = (note(n) for n in ("C6", "D6", "E6", "F6", "G6", "A6", "D7"))


def pk(x):
    """Scaled to a peak of 1, so parts can be mixed by their weights."""
    return x / (np.max(np.abs(x)) + 1e-12)


def mix(*parts):
    """Sums parts of different lengths."""
    n = max(len(p) for p in parts)
    return sum(pad(p, n / SR) for p in parts)


def jingle(notes, voice, step=S16):
    """notes: (freq or None, length in steps); voice(freq, seconds) -> samples."""
    parts, at = [], 0.0
    for f, steps in notes:
        if f:
            parts.append((at, voice(f, steps * step)))
        at += steps * step
    return place(*parts)


def circular(dur, events, tail=0.08):
    """A loop of dur seconds: events are (start, samples), and whatever runs
    past the end wraps round to the start, so the loop has no seam."""
    n = int(round(dur * SR))
    out = np.zeros(n + int(tail * SR) + 1)
    for start, p in events:
        i = int(round(start * SR))
        out[i: i + len(p)] += p[: len(out) - i]
    body = out[:n].copy()
    over = out[n:]
    body[: len(over)] += over
    return body


def tight(x, floor_db=-50, fade=0.04):
    """Cuts a long tail where it falls below floor_db under the peak (too
    quiet for a handheld's speaker over the music) and fades it out."""
    level = np.abs(x)
    above = np.nonzero(level > np.max(level) * 10 ** (floor_db / 20))[0]
    end = above[-1] + 1 if len(above) else len(x)
    x = x[:end].copy()
    f = min(len(x) // 4, int(fade * SR))
    if f:
        x[-f:] *= np.linspace(1, 0, f) ** 2
    return x


def loop_filter(x, fn):
    """Filters a loop without a seam: the filter runs over three copies and
    the middle one is kept."""
    n = len(x)
    return fn(np.concatenate([x, x, x]))[n: 2 * n]


# ---------------------------------------------------------------- voices

def brass(freq, dur, bright=1.0):
    """A synth brass note: two detuned saws whose lowpass opens on the attack."""
    body = osc(freq, dur, "saw") + 0.7 * osc(freq * 1.004, dur, "saw")
    e = env(dur, 0.012, 0.16)
    tone = lowpass(body, 1100 * bright) * (1 - e) + lowpass(body, 3600 * bright) * e
    return tone * adsr(dur, 0.012, 0.12, 0.75, min(0.05, dur / 3))


def chip(freq, dur, duty=0.25, decay=None, cutoff=5000):
    """A pulse-wave note, for blips and quick runs."""
    body = osc(freq, dur, "pulse", duty) if duty != 0.5 else osc(freq, dur, "square")
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
    """A triangle bass with a little pulse in it, so small speakers hear it."""
    body = osc(freq, dur, "triangle") + 0.3 * lowpass(osc(freq, dur, "pulse", 0.3), 1500)
    return body * adsr(dur, 0.004, 0.2, 0.7, min(0.06, dur / 3))


def snare(dur=0.16, tone=230):
    """A marching snare: a bright rattle over a short drum body."""
    rattle = bandpass(noise(dur), 1500, 7000) * env(dur, 0.001, dur * 0.8)
    body = np.sin(2 * np.pi * tone * t_axis(dur)) * env(dur, 0.001, 0.05)
    return pk(rattle) * 0.8 + pk(body) * 0.45


def roll(dur, hits=None, rise=True):
    """A snare roll that swells (or fades)."""
    hits = hits or int(dur / 0.045)
    parts = []
    for i in range(hits):
        level = (0.35 + 0.65 * i / max(1, hits - 1)) if rise else (1 - 0.6 * i / max(1, hits - 1))
        parts.append((i * dur / hits, snare(0.09) * level))
    return place(*parts)


def metal(freq, dur, decay, ratios=((1.0, 1.0, 1.0), (2.76, 0.5, 0.5), (5.4, 0.25, 0.28), (8.9, 0.12, 0.16))):
    """A struck piece of steel: inharmonic partials (ratio, level, decay share)."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for ratio, amp, dk in ratios:
        if freq * ratio < SR / 2.3:
            out += amp * np.sin(2 * np.pi * freq * ratio * t) * env(dur, 0.0008, decay * dk)
    return out


def click(dur=0.008, lo=1500, hi=6000):
    return bandpass(noise(dur), lo, hi) * env(dur, 0.0003, dur)


def blast(dur, top=3500, bottom=250, thump=(170, 50), weight=1.0):
    """An explosion: a falling thump, a roaring noise blast and debris."""
    th = glide(thump[0], thump[1], min(dur, 0.35), curve=0.6) * env(min(dur, 0.35), 0.002, 0.3)
    roar = sweep_filter(noise(dur, "pink"), top, bottom) * env(dur, 0.002, dur * 0.8)
    debris = bandpass(crackle(dur, 80, 0.004), 500, 4500) * env(dur, 0.04, dur * 0.85)
    return mix(pk(th) * 0.55 * weight, highpass(pk(roar), 160) * 1.2, pk(debris) * 0.5)


# ---------------------------------------------------------------- the player's tank

@sound(SOUNDS, peak=-10, loop=True)
def engine():
    """The player's diesel: 12 chugs (24 a second) and 6 track clanks in a
    0.5 s loop. Each chug is a short thump on a 120 Hz series, so a small
    speaker hears its harmonics; the game revs it with the playback rate."""
    dur = 0.5
    period = dur / 12
    levels = [1.0, 0.78, 0.92, 0.7, 0.98, 0.8, 0.88, 0.72, 1.0, 0.76, 0.9, 0.74]
    events = []
    for i in range(12):
        d = 0.06
        t = t_axis(d)
        thump = sum(np.sin(2 * np.pi * 120 * k * t + k) / k for k in range(2, 10)) * env(d, 0.002, 0.035)
        puff = lowpass(noise(d), 1100) * env(d, 0.001, 0.025) * 0.6
        events.append((i * period, (pk(thump) + pk(puff) * 0.5) * levels[i]))
        if i % 2 == 0:
            events.append((i * period + period * 0.5, click(0.012, 1800, 4800) * 0.22))
    x = circular(dur, events)
    return loop_filter(x, lambda y: lowpass(highpass(y, 150), 4500))


@sound(SOUNDS, peak=-11)
def shot():
    """Your cannon: a punchy thump falling from 420 Hz with a sharp crack."""
    dur = 0.24
    body = glide(520, 170, 0.14, "triangle", curve=0.5) * env(0.14, 0.001, 0.12)
    crack = bandpass(noise(0.04), 1400, 6000) * env(0.04, 0.0005, 0.03)
    smoke = bandpass(noise(dur), 250, 1800) * env(dur, 0.002, 0.18)
    return highpass(lowpass(mix(pk(body) * 0.9, pk(crack) * 0.7, pk(smoke) * 0.4), 7000), 170)


@sound(SOUNDS, peak=-14)
def enemy_shot():
    """An enemy fires: a duller, shorter thump."""
    dur = 0.18
    body = glide(400, 200, 0.12, "triangle", curve=0.5) * env(0.12, 0.001, 0.1)
    crack = bandpass(noise(0.03), 900, 3500) * env(0.03, 0.0005, 0.025)
    smoke = bandpass(noise(dur), 250, 1200) * env(dur, 0.002, 0.13)
    return highpass(lowpass(mix(pk(body), pk(crack) * 0.6, pk(smoke) * 0.4), 4500), 190)


@sound(SOUNDS, peak=-5)
def player_boom():
    """Your tank is destroyed: a big blast and a falling wail down to D."""
    dur = 0.9
    x = blast(dur, 3800, 200, (190, 45), 1.1)
    wail = lowpass(glide(A4, D4 / 2, 0.7, "saw", curve=0.7), 1600) * env(0.7, 0.01, 0.6)
    x = mix(x, pk(wail) * 0.28)
    return tight(highpass(lowpass(reverb(drive(x, 2.0), 0.12, IR_SMALL), 6500, order=4), 140))


@sound(SOUNDS, peak=-12)
def deflect():
    """A shell glances off your shield: a bright rising zing."""
    dur = 0.26
    zing = fm(D6, 1.41, ramp(dur, 4.0, 0.4), dur) * env(dur, 0.001, 0.2)
    rise = glide(A5, D6 * 1.5, dur, "triangle", curve=0.5) * env(dur, 0.002, 0.16)
    return lowpass(pk(zing) * 0.7 + pk(rise) * 0.45, 7500)


# ---------------------------------------------------------------- shells

@sound(SOUNDS, peak=-13)
def brick():
    """A shell knocks out a brick: a short gritty crunch over a thud."""
    dur = 0.2
    grit = bandpass(noise(dur) + crackle(dur, 420, 0.002) * 2, 600, 4200) * env(dur, 0.001, 0.13)
    thud = bandpass(noise(dur), 200, 700) * env(dur, 0.001, 0.05)
    return pk(grit) + pk(thud) * 0.55


@sound(SOUNDS, peak=-13)
def steel():
    """A shell bounces off steel: a hard metallic ping on D6, with a knock."""
    dur = 0.24
    ring = metal(D6, dur, 0.2)
    knock = bandpass(noise(dur), 400, 2500) * env(dur, 0.001, 0.025)
    return lowpass(pk(ring) * 0.8 + pk(knock) * 0.6, 7500)


@sound(SOUNDS, peak=-10)
def smash():
    """A full-power shell breaks steel: a clang and a crash of plate."""
    dur = 0.36
    clang = metal(A5, dur, 0.3)
    crash = sweep_filter(noise(dur) + crackle(dur, 300, 0.003) * 2, 6000, 900, "band", 1.6) * env(dur, 0.001, 0.26)
    thud = glide(220, 90, 0.12) * env(0.12, 0.001, 0.1)
    return lowpass(mix(pk(clang) * 0.7, pk(crash) * 0.8, pk(thud) * 0.4), 7500)


@sound(SOUNDS, peak=-16)
def edge():
    """A shell hits the field's rim: a dull concrete thunk."""
    dur = 0.12
    thunk = bandpass(noise(dur), 220, 1200) * env(dur, 0.001, 0.06)
    body = glide(260, 180, dur) * env(dur, 0.001, 0.05)
    return pk(thunk) + pk(body) * 0.5


@sound(SOUNDS, peak=-13)
def clash():
    """Two shells meet: a bright spark."""
    dur = 0.18
    ping = fm(A6, 1.5, ramp(dur, 3.0, 0.3), dur) * env(dur, 0.001, 0.12)
    flick = bandpass(noise(dur), 2500, 7000) * env(dur, 0.0005, 0.03)
    return lowpass(pk(ping) * 0.8 + pk(flick) * 0.45, 7500)


# ---------------------------------------------------------------- enemies

@sound(SOUNDS, peak=-11)
def armor():
    """A shell cracks an armoured tank: a heavy clank on D5 with a rattle.
    The game plays it lower as the armour wears down."""
    dur = 0.26
    clank = metal(D5, dur, 0.18, ((1.0, 1.0, 1.0), (2.4, 0.6, 0.6), (4.1, 0.35, 0.35), (6.7, 0.18, 0.2)))
    knock = bandpass(noise(dur), 250, 1800) * env(dur, 0.001, 0.035)
    rattle = bandpass(crackle(dur, 160, 0.002), 1500, 5000) * env(dur, 0.01, 0.15)
    return lowpass(pk(clank) * 0.8 + pk(knock) * 0.6 + pk(rattle) * 0.25, 7000)


@sound(SOUNDS, peak=-9)
def explode():
    """An enemy tank blows up: a thump, a roaring blast and flying debris."""
    dur = 0.62
    x = blast(dur, 3200, 260, (190, 75))
    return tight(highpass(lowpass(reverb(drive(x, 1.8), 0.08, IR_SMALL), 6500, order=4), 150))


@sound(SOUNDS, peak=-17)
def spawn():
    """An enemy twinkles in: a soft rising sparkle, D F A D."""
    notes = [D6, F6, A6, D7]
    x = place(*[(i * 0.07, bell(f, 0.3, 0.22, 0.5) * (0.6 + 0.12 * i)) for i, f in enumerate(notes)])
    shimmer = bandpass(noise(0.5), 4000, 8000) * env(0.5, 0.15, 0.3) * 0.05
    t = t_axis(len(x) / SR)
    return lowpass(mix(x * (0.75 + 0.25 * np.sin(2 * np.pi * 18 * t)), shimmer), 8000)


# ---------------------------------------------------------------- power-ups

@sound(SOUNDS, peak=-9)
def appear():
    """A power-up appears: a quick chime up D minor to D7 with a sparkle."""
    run = jingle([(D6, 1), (F6, 1), (A6, 1), (D7, 3)], lambda f, d: bell(f, d + 0.25, 0.3), step=0.06)
    sparkle = bandpass(noise(0.45), 5000, 9000) * env(0.45, 0.05, 0.3) * 0.08
    return reverb(mix(run, sparkle), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-7)
def star():
    """GUN UP: a brass run up D minor to a ringing D, with a cocking clack."""
    clack = place((0.0, click(0.01, 1000, 4000)), (0.06, click(0.014, 700, 3000)))
    run = jingle([(D5, 1), (F5, 1), (A5, 1), (D6, 4)], lambda f, d: brass(f, d, 1.2), step=0.055)
    top = place((0.17, bell(D7, 0.4, 0.3) * 0.25))
    return reverb(mix(pk(clack) * 0.4, place((0.08, pk(run))), top), 0.14, IR_SMALL)


@sound(SOUNDS, peak=-7)
def helmet():
    """SHIELD: a rising whoosh into a shimmering chord, A D F."""
    dur = 0.55
    whoosh = sweep_filter(noise(0.4, "pink"), 400, 5000, "band", 1.8) * env(0.4, 0.1, 0.3)
    t = t_axis(dur)
    chord = sum(np.sin(2 * np.pi * f * t) * (0.8 + 0.2 * np.sin(2 * np.pi * 9 * t + i)) for i, f in enumerate((A5, D6, F6)))
    chord *= adsr(dur, 0.12, 0.2, 0.7, 0.3)
    return tight(reverb(mix(pk(whoosh) * 0.5, place((0.12, pk(chord) * 0.7))), 0.18, IR_SMALL))


@sound(SOUNDS, peak=-7)
def clock():
    """FREEZE: tick-tock, then an icy glass sweep falling from D7."""
    tick = lambda f: bandpass(noise(0.03), f, f * 2.5) * env(0.03, 0.0005, 0.02)
    ticks = place((0.0, tick(3000)), (0.13, tick(2000)), (0.26, tick(3000)))
    sweep = place(*[(0.3 + i * 0.05, bell(f, 0.35, 0.25)) for i, f in enumerate((D7, A6, F6, D6, A5))])
    frost = bandpass(noise(0.5), 5000, 9000) * env(0.5, 0.05, 0.4) * 0.12
    return tight(reverb(mix(pk(ticks) * 0.6, pk(sweep) * 0.8, place((0.3, frost))), 0.2, IR_SMALL))


@sound(SOUNDS, peak=-5)
def bomb():
    """BOMB: a whoosh, then one huge blast that takes every enemy."""
    whoosh = sweep_filter(noise(0.25, "pink"), 300, 3000, "band", 1.6) * env(0.25, 0.15, 0.1)
    boom = blast(0.9, 4200, 220, (230, 90), 1.2)
    x = place((0.0, pk(whoosh) * 0.35), (0.16, pk(boom)))
    return tight(highpass(lowpass(reverb(drive(x, 2.2), 0.15, IR_ROOM), 6500, order=4), 140))


@sound(SOUNDS, peak=-7)
def shovel():
    """STEEL WALL: three quick clangs up D F A as the plates go up."""
    hits = [(i * 0.12, mix(pk(metal(f, 0.3, 0.22)), pk(click(0.012, 800, 3000)) * 0.5)) for i, f in enumerate((D5, F5, A5))]
    return lowpass(reverb(place(*hits), 0.12, IR_SMALL), 7500)


@sound(SOUNDS, peak=-6)
def extra():
    """EXTRA TANK: a bright 1-up brass call, D F A D with a high ring."""
    lead = jingle([(D5, 1), (F5, 1), (A5, 1), (D6, 2), (A5, 1), (D6, 3)], lambda f, d: brass(f, d, 1.3), step=0.06)
    ring = place((0.32, bell(D7, 0.35, 0.28) * 0.3))
    return tight(reverb(mix(lead, ring), 0.15, IR_SMALL))


# ---------------------------------------------------------------- the core

@sound(SOUNDS, peak=-4)
def core():
    """The core is destroyed: glass shattering down from D7 in a huge blast."""
    boom = blast(1.2, 4500, 160, (210, 38), 1.3)
    shards = place(*[(0.02 + i * 0.045, bell(f, 0.4, 0.3) * (1 - i * 0.1)) for i, f in enumerate((D7, A6, F6, D6, A5, F5, D5))])
    glass = bandpass(crackle(0.6, 300, 0.002), 3000, 8000) * env(0.6, 0.002, 0.4)
    drone = lowpass(osc(D3, 1.2, "saw") + osc(D3 * 1.006, 1.2, "saw"), 700) * env(1.2, 0.05, 1.0)
    x = mix(pk(boom), pk(shards) * 0.45, pk(glass) * 0.35, pk(drone) * 0.3)
    return tight(highpass(lowpass(reverb(drive(x, 1.8), 0.15, IR_ROOM), 6500, order=4), 140))


@sound(SOUNDS, peak=-11)
def alarm():
    """An enemy breaks into the core's wall: a two-tone alarm, twice."""
    def beep(f, d):
        return lowpass(osc(f, d, "square"), 2800) * adsr(d, 0.003, 0.05, 0.75, 0.02)
    return jingle([(A5, 0.75), (F5, 0.75), (A5, 0.75), (F5, 1)], beep)


# ---------------------------------------------------------------- stages and game

@sound(SOUNDS, peak=-6)
def stage():
    """A stage starts: a snare roll into a brass call, D D A | D."""
    drums = place((0.0, roll(0.3)), (0.3 + S16 * 4, snare(0.2)))
    lead = jingle([(D5, 1), (D5, 1), (A5, 2), (D6, 3)], lambda f, d: brass(f, d))
    low = jingle([(None, 4), (D4, 3)], lambda f, d: brass(f, d, 0.7))
    x = mix(pk(drums) * 0.45, place((0.3, pk(mix(lead, low * 0.5)))))
    return tight(reverb(x, 0.14, IR_SMALL))


@sound(SOUNDS, peak=-5)
def clear():
    """A stage is cleared: a march up D minor, landing on a bright D chord."""
    lead = jingle([(A4, 1), (D5, 1), (F5, 1), (A5, 1), (C6, 1), (D6, 4)], lambda f, d: brass(f, d, 1.2))
    harmony = jingle([(None, 5), (A5, 4)], lambda f, d: brass(f, d, 0.9) * 0.5)
    low = jingle([(D4, 2), (F4, 1), (C4, 2), (D4, 4)], lambda f, d: brass(f, d, 0.6))
    drums = place((0.0, snare(0.14)), (S16 * 2, snare(0.1) * 0.6), (S16 * 3, roll(S16 * 2)), (S16 * 5, snare(0.25)))
    return tight(reverb(mix(lead, harmony, low * 0.45, pk(drums) * 0.3), 0.18, IR_SMALL))


@sound(SOUNDS, peak=-16)
def tick():
    """The tally counts a tank: a short blip on A5."""
    dur = 0.05
    return chip(A5, dur, 0.25, decay=0.04, cutoff=4500) + pad(click(0.004), dur) * 0.2


@sound(SOUNDS, peak=-8)
def bonus():
    """No hits taken: a bright run up to D7 with a ring."""
    run = jingle([(A5, 1), (D6, 1), (F6, 1), (A6, 1), (D7, 4)], lambda f, d: chip(f, d, 0.25, cutoff=6500), step=0.05)
    ring = place((0.2, bell(D7, 0.4, 0.3) * 0.3))
    return reverb(mix(run, ring), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-5)
def over():
    """Game over: a slow brass march down to a low D, with muffled drums."""
    lead = jingle([(A4, 2), (F4, 2), (E4, 2), (D4, 5)], lambda f, d: brass(f, d, 0.8))
    low = jingle([(D3 * 2, 4), (Bb3, 2), (D3 * 2, 5)], lambda f, d: brass(f, d, 0.5))
    drums = place((0.0, snare(0.2) * 0.7), (S16 * 4, snare(0.2) * 0.5), (S16 * 6, snare(0.3) * 0.6))
    return tight(reverb(mix(lead, low * 0.5, lowpass(pk(drums), 2500) * 0.25), 0.2, IR_SMALL))


@sound(SOUNDS, peak=-4)
def record():
    """A new best score: a brass fanfare with a trill on top."""
    lead = jingle(
        [(D5, 1), (A5, 1), (D6, 1), (F6, 2), (A6, 1), (G6, 1), (A6, 4)],
        lambda f, d: brass(f, d, 1.2),
    )
    fifth = jingle([(None, 7), (D6, 4)], lambda f, d: brass(f, d, 0.9) * 0.4)
    low = jingle([(D4, 3), (A3, 2), (F4, 2), (D4, 4)], bass)
    drums = place((0.0, roll(S16 * 3)), (S16 * 7, snare(0.25)))
    return tight(reverb(mix(lead, fifth, low * 0.5, pk(drums) * 0.25), 0.2, IR_SMALL))


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    """Menu cursor: a short soft blip."""
    dur = 0.05
    return np.sin(2 * np.pi * A5 * t_axis(dur)) * env(dur, 0.001, 0.04) + pad(click(0.004), dur) * 0.2


@sound(SOUNDS, peak=-10)
def select():
    """Menu confirm or toggle: two quick notes up, D to A."""
    return place((0.0, bell(D6, 0.08, 0.07)), (0.05, bell(A6, 0.14, 0.12)))


@sound(SOUNDS, peak=-12)
def back():
    """Back or resume: two quick notes down, A to D."""
    return lowpass(place((0.0, bell(A6, 0.08, 0.07)), (0.05, bell(D6, 0.14, 0.12))), 4000)


@sound(SOUNDS, peak=-10)
def pause():
    """The pause menu opens: a soft falling pair, F to D."""
    return lowpass(place((0.0, bell(F6, 0.14, 0.12, 0.6)), (0.07, bell(D6, 0.26, 0.22, 0.6))), 3500)


if __name__ == "__main__":
    write_all(SOUNDS, "tank-brigade", sys.argv[1:] or None)
