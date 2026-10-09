"""Neon Pinball's sound effects: the table's mechanics (flippers, bumpers,
slingshots, drop targets, rollovers, the spinner, the plunger) and glossy
synth jingles for its moments, to sit with the music (neon synth funk,
E minor, 126 BPM).

Tonal sounds use E minor (E F# G A B C D); jingles move in 16ths of the
music's tempo. The bumper is one note (E5) that the game plays at three
rates (E, G and B, one per bumper); the target, rollover and bonus notes are
raised along E minor pentatonic for a chain, so they are kept short and soft
in their upper partials. The two loops (the ball rolling, the plunger's
spring) are played with sound.loop() and follow the ball and the pull.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/neon-pinball.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 126
S16 = 60 / BPM / 4  # a 16th note, 0.119 s

E3, B3 = note("E3"), note("B3")
E4, Fs4, G4, A4, As4, B4 = (note(n) for n in ("E4", "F#4", "G4", "A4", "A#4", "B4"))
D5, E5, Fs5, G5, A5, B5 = (note(n) for n in ("D5", "E5", "F#5", "G5", "A5", "B5"))
D6, E6, G6, B6 = note("D6"), note("E6"), note("G6"), note("B6")


def pk(x):
    """Scaled to a peak of 1, so parts can be mixed by their weights."""
    return x / (np.max(np.abs(x)) + 1e-12)


# ---------------------------------------------------------------- voices

def bell(freq, dur, decay, bright=1.0):
    """Glassy mallet: a sine with soft partials that die faster."""
    t = t_axis(dur)
    out = np.sin(2 * np.pi * freq * t) * env(dur, 0.002, decay)
    out += 0.3 * bright * np.sin(2 * np.pi * freq * 2 * t) * env(dur, 0.001, decay * 0.45)
    out += 0.12 * bright * np.sin(2 * np.pi * freq * 3.01 * t) * env(dur, 0.001, decay * 0.25)
    return out


def chip(freq, dur, duty=0.25, decay=None, cutoff=5000):
    """A pulse-wave note with a short release, the glossy lead."""
    body = osc(freq, dur, "pulse", duty) + 0.4 * osc(freq * 1.004, dur, "pulse", 0.5)
    shape = adsr(dur, 0.003, 0.08, 0.6, min(0.04, dur / 3)) if decay is None else env(dur, 0.003, decay)
    return lowpass(body * shape, cutoff)


def pluck(freq, dur, decay=0.08):
    """A soft triangle pluck with a little pulse edge (for fast chains)."""
    x = osc(freq, dur, "triangle") + 0.25 * osc(freq, dur, "pulse", 0.25)
    return lowpass(x * env(dur, 0.002, decay), 4500)


def bass(freq, dur):
    """Funk bass: a saw through a closing filter (its harmonics carry it on
    a small speaker)."""
    x = osc(freq, dur, "saw")
    return sweep_filter(x, 2200, 500) * adsr(dur, 0.004, 0.15, 0.7, min(0.05, dur / 3))


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
    """Sum parts of different lengths."""
    n = max(len(p) for p in parts)
    return sum(pad(p, n / SR) for p in parts)


# ---------------------------------------------------------------- flippers and contacts

@sound(SOUNDS, peak=-12)
def flip_up():
    """A flipper firing: a solenoid clack, a woody knock with a sharp tick."""
    dur = 0.09
    knock = osc(expramp(dur, 520, 210, 0.4), dur, "triangle") * env(dur, 0.001, 0.05)
    body = bandpass(noise(dur), 250, 1400) * env(dur, 0.0005, 0.03)
    tick = pad(click(0.006, 2500, 7000), dur)
    return lowpass(pk(knock) * 0.8 + pk(body) * 0.6 + tick * 0.35, 7000)


@sound(SOUNDS, peak=-19)
def flip_down():
    """A flipper falling back: a soft, short thunk."""
    dur = 0.06
    knock = osc(expramp(dur, 380, 200, 0.5), dur, "triangle") * env(dur, 0.001, 0.035)
    body = bandpass(noise(dur), 250, 1000) * env(dur, 0.0005, 0.02)
    return lowpass(pk(knock) * 0.8 + pk(body) * 0.4, 4000)


@sound(SOUNDS, peak=-15)
def rubber():
    """The ball hitting a flipper's rubber: a dull thock."""
    dur = 0.07
    tone = np.sin(2 * np.pi * np.cumsum(expramp(dur, 420, 300)) / SR) * env(dur, 0.001, 0.05)
    thock = bandpass(noise(dur), 300, 1300) * env(dur, 0.0005, 0.025)
    return pk(tone) * 0.7 + pk(thock) * 0.6


@sound(SOUNDS, peak=-20)
def wall():
    """The ball against a steel rail or a post: a tiny metallic tink."""
    dur = 0.05
    metal = fm(2350, 1.41, ramp(dur, 1.6, 0.2, 0.5), dur) * env(dur, 0.0005, 0.035)
    return lowpass(pk(metal) * 0.7 + pad(click(0.006, 1500, 5000), dur) * 0.5, 7000)


# ---------------------------------------------------------------- table toys

@sound(SOUNDS, peak=-11)
def bumper():
    """A pop bumper on E5 (the game also plays it on G and B): a punchy
    pitch-dropping pop over a bright mallet, with a snap."""
    dur = 0.22
    pop = osc(expramp(0.05, E5 * 2, E5, 0.3), 0.05, "square") * env(0.05, 0.001, 0.04)
    body = bell(E5, dur, 0.17, bright=0.7)
    snap = bandpass(noise(0.02), 900, 4000) * env(0.02, 0.0005, 0.015)
    return lowpass(mix(pk(lowpass(pop, 3500)) * 0.55, pk(body), pk(snap) * 0.4), 6500)


@sound(SOUNDS, peak=-12)
def sling():
    """A slingshot kicking: a rubbery thwack with a short falling blip."""
    dur = 0.13
    thwack = bandpass(noise(dur), 500, 2800) * env(dur, 0.0005, 0.05)
    blip = osc(expramp(0.08, B4 * 1.5, B4 * 0.75), 0.08, "pulse", 0.3) * env(0.08, 0.001, 0.07)
    knock = osc(expramp(dur, 300, 200), dur, "triangle") * env(dur, 0.001, 0.06)
    return lowpass(mix(pk(thwack) * 0.7, pk(lowpass(blip, 3000)) * 0.45, pk(knock) * 0.5), 6000)


@sound(SOUNDS, peak=-11)
def target():
    """A drop target falling: a clunk and a ding on E5 (raised for the
    second and third target of a bank)."""
    dur = 0.24
    clunk = bandpass(noise(0.04), 300, 1500) * env(0.04, 0.0005, 0.03)
    ding = bell(E5, dur, 0.18, bright=0.6) + chip(E5, dur, 0.25, decay=0.05, cutoff=2800) * 0.2
    return mix(pk(clunk) * 0.6, pk(ding))


@sound(SOUNDS, peak=-8)
def bank():
    """A whole bank of targets down: a quick sparkle up E minor."""
    notes = [(E5, 1), (G5, 1), (B5, 1), (E6, 3)]
    lead = jingle(notes, lambda f, d: chip(f, d, 0.25, cutoff=5000) * 0.7 + bell(f, d, d * 0.8) * 0.6, step=S16 / 2)
    return reverb(lead, 0.15, IR_SMALL)


@sound(SOUNDS, peak=-5)
def jackpot():
    """A jackpot during multiball: two big E minor stabs ('jack-pot') and a
    quick run up to a high E."""
    def stab(d):
        return mix(*[chip(f, d, 0.25, decay=d * 0.8) for f in (E5, G5, B5)], bass(E4, d) * 0.8)
    run = jingle([(B5, 1), (D6, 1), (E6, 4)], lambda f, d: chip(f, d, 0.25), step=S16 / 2)
    sparkle = place((0.0, bell(B6, 0.3, 0.25) * 0.3), (0.06, bell(E6 * 2, 0.25, 0.2) * 0.2))
    return reverb(place((0.0, stab(S16 * 1.5)), (S16 * 2, stab(S16 * 1.5)), (S16 * 4, mix(run, sparkle))), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-13)
def lane():
    """A rollover lane: a switch tick and a soft ding on E5, raised along the
    scale as the lanes light up."""
    dur = 0.18
    ding = bell(E5, dur, 0.13, bright=0.5)
    return mix(pk(ding), pad(click(0.005, 2000, 6000), dur) * 0.25)


@sound(SOUNDS, peak=-7)
def lanes():
    """All three lanes lit, the multiplier goes up: a rising arpeggio."""
    notes = [(E5, 1), (G5, 1), (B5, 1), (D6, 1), (E6, 4)]
    lead = jingle(notes, lambda f, d: chip(f, d, 0.25), step=S16 / 2)
    under = jingle([(None, 4), (B5, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3000) * 0.3, step=S16 / 2)
    sparkle = place((0.3, bell(B6, 0.25, 0.2) * 0.25))
    return reverb(mix(lead, under, sparkle), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-15)
def spinner():
    """One half turn of the spinner: a short ticking blip (it repeats as
    fast as the spinner turns)."""
    dur = 0.04
    tick = fm(E6, 2.0, ramp(dur, 1.2, 0.1), dur) * env(dur, 0.0005, 0.025)
    return lowpass(pk(tick) * 0.8 + pad(click(0.004, 2000, 6000), dur) * 0.4, 7000)


@sound(SOUNDS, peak=-17, loop=True)
def pull():
    """The plunger being pulled, a seamless 0.5 s loop: a ratchet clicking
    over a faint spring hum. The game raises its rate with the pull."""
    length = 0.5
    t = t_axis(length)
    hum = np.sin(2 * np.pi * 494 * t) * 0.5 + np.sin(2 * np.pi * 988 * t) * 0.2  # whole waves in the loop
    hum *= 0.6 + 0.4 * np.sin(2 * np.pi * 4 * t)  # four swells per loop
    clicks = np.zeros(len(t))
    for i in range(8):
        c = bandpass(noise(0.012), 1200, 4200) * env(0.012, 0.0003, 0.01)
        at = int(i * len(t) / 8)
        clicks[at: at + len(c)] += c
    return pk(hum) * 0.35 + pk(clicks) * 0.8


@sound(SOUNDS, peak=-8)
def launch():
    """The plunger letting go: a thump, a spring twang and the ball's whoosh."""
    dur = 0.38
    thump = osc(expramp(0.07, 420, 160), 0.07, "triangle") * env(0.07, 0.001, 0.06)
    twang = fm(E4, 1.5, ramp(0.25, 2.5, 0.3), 0.25) * env(0.25, 0.002, 0.2)
    twang = osc(vibrato(E4, 0.25, 22, 0.4), 0.25, "sine") * env(0.25, 0.002, 0.2) * 0.5 + twang * 0.5
    whoosh = sweep_filter(noise(dur), 700, 3500, kind="band", q=1.6) * env(dur, 0.06, 0.3)
    return lowpass(mix(pk(thump) * 0.8, pk(twang) * 0.5, pk(whoosh) * 0.45), 7000)


@sound(SOUNDS, peak=-15, loop=True)
def roll():
    """The ball rolling on the playfield, a seamless 0.8 s loop: a soft
    grainy rumble with a slow wobble. The game shapes it with the speed."""
    length, fade, lead = 0.8, 0.08, 0.3
    raw = noise(lead + length + fade, "pink")
    body = bandpass(raw, 260, 1100)[int(lead * SR):]
    grit = bandpass(crackle(lead + length + fade, 260, 0.0015), 900, 3000)[int(lead * SR):]
    t = t_axis(length + fade)
    wob = 0.8 + 0.2 * np.sin(2 * np.pi * 5 * t / length)
    return loopable(pk(body) * wob + pk(grit) * 0.15, fade)


# ---------------------------------------------------------------- moments

@sound(SOUNDS, peak=-6)
def skill():
    """A skill shot: a fast run up E minor and a held E with its fifth."""
    lead = jingle([(E5, 1), (G5, 1), (B5, 1), (E6, 1), (B5, 1), (E6, 5)], lambda f, d: chip(f, d, 0.25), step=S16 * 0.6)
    fifth = jingle([(None, 5), (B5, 5)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35, step=S16 * 0.6)
    low = jingle([(E4, 4), (B3, 6)], bass, step=S16 * 0.6)
    sparkle = place((0.4, bell(B6, 0.3, 0.25) * 0.3), (0.46, bell(E6 * 2, 0.25, 0.2) * 0.2))
    return reverb(mix(lead, fifth, low * 0.45, sparkle), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-7)
def drain():
    """The ball gone down the drain: a falling 'wahhh' to a low E and a thud."""
    dur = 0.65
    wah = osc(expramp(dur, B4, E3, 0.8), dur, "square") * adsr(dur, 0.005, 0.2, 0.75, 0.15)
    wah = sweep_filter(wah, 2400, 400)
    thud = lowpass(noise(0.18), 500) * env(0.18, 0.002, 0.14)
    return mix(pk(wah), place((0.08, pk(thud) * 0.5)))


@sound(SOUNDS, peak=-8)
def save():
    """Ball saved: a quick lift, B to E to B, with a shimmer."""
    lead = place((0.0, chip(B4, 0.08, 0.25, decay=0.07)), (0.06, chip(E5, 0.08, 0.25, decay=0.07)), (0.12, chip(B5, 0.25, 0.25, decay=0.2)))
    shimmer = place((0.12, bell(E6, 0.3, 0.25) * 0.35), (0.16, bell(B6, 0.25, 0.2) * 0.2))
    return reverb(mix(lead, shimmer), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-4)
def multiball():
    """Multiball: a run up two octaves of E minor, a trill on top and the
    bass driving under it."""
    lead = jingle(
        [(E4, 1), (G4, 1), (B4, 1), (E5, 1), (G5, 1), (B5, 1), (D6, 1), (E6, 2), (D6, 1), (E6, 1), (D6, 1), (E6, 1), (B5, 1), (E6, 4)],
        lambda f, d: chip(f, d, 0.25),
        step=S16 * 0.75,
    )
    harmony = jingle([(None, 7), (B5, 5), (G5, 2), (B5, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35, step=S16 * 0.75)
    low = jingle([(E3 * 2, 2), (E3 * 2, 2), (G4, 2), (E3 * 2, 2), (B3, 2), (E3 * 2, 2), (B3, 2), (E3 * 2, 4)], bass, step=S16 * 0.75)
    sparkle = place((1.05, bell(B6, 0.35, 0.3) * 0.3), (1.12, bell(E6 * 2, 0.3, 0.25) * 0.2))
    return reverb(mix(lead, harmony, low * 0.5, sparkle), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-13)
def bonus():
    """One step of the bonus count: a soft pluck on E5, raised as it counts."""
    return pluck(E5, 0.08, 0.06)


@sound(SOUNDS, peak=-8)
def total():
    """The bonus lands on the score: a bright 'ka-ching' on E."""
    hit = place((0.0, chip(B5, 0.06, 0.25, decay=0.05)), (0.05, mix(bell(E6, 0.4, 0.32), bell(B6, 0.35, 0.25) * 0.5)))
    coins = place((0.05, bandpass(crackle(0.12, 120, 0.002), 3000, 7000) * 0.3))
    return reverb(mix(hit, coins), 0.12, IR_SMALL)


@sound(SOUNDS, peak=-10)
def ready():
    """The next ball on the plunger: a 'da-ding' from B to E."""
    lead = place((0.0, chip(B4, S16, 0.25)), (S16, chip(E5, S16 * 2.5, 0.25)))
    under = place((S16, bass(E4, S16 * 2.5)))
    return reverb(mix(lead, under * 0.5), 0.12, IR_SMALL)


@sound(SOUNDS, peak=-10)
def nudge():
    """The cabinet bumped: a hollow thud with the glass rattling."""
    dur = 0.22
    thud = bandpass(noise(dur), 200, 900) * env(dur, 0.002, 0.08)
    knock = osc(expramp(0.08, 260, 200), 0.08, "triangle") * env(0.08, 0.001, 0.07)
    rattle = bandpass(crackle(dur, 180, 0.002), 1200, 4000) * env(dur, 0.01, 0.2)
    return mix(pk(thud) * 0.8, pk(knock) * 0.6, pk(rattle) * 0.35)


@sound(SOUNDS, peak=-9)
def warning():
    """Tilt danger: two buzzing beeps on A# (a tritone off E: alarming)."""
    def beep(d):
        x = osc(As4, d, "square") + 0.5 * osc(As4 * 1.01, d, "saw")
        return lowpass(x * adsr(d, 0.004, 0.05, 0.85, 0.02), 2600)
    return place((0.0, beep(0.11)), (0.16, beep(0.11)))


@sound(SOUNDS, peak=-6)
def tilt():
    """Tilt: a long low buzzer, E against F, shaking."""
    dur = 0.8
    t = t_axis(dur)
    x = osc(note("E3") * 2, dur, "saw") + osc(note("F3") * 2, dur, "saw") * 0.8
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 14 * t)
    return lowpass(x, 2200) * adsr(dur, 0.01, 0.2, 0.85, 0.15)


# ---------------------------------------------------------------- game

@sound(SOUNDS, peak=-6)
def start():
    """A new game: a fast run up E minor."""
    notes = [(E4, 1), (B4, 1), (E5, 1), (G5, 1), (B5, 3)]
    lead = jingle(notes, lambda f, d: chip(f, d, 0.25), step=0.055)
    sparkle = place((0.22, bell(E6, 0.3, 0.25) * 0.3))
    return reverb(mix(lead, sparkle), 0.12, IR_SMALL)


@sound(SOUNDS, peak=-5)
def over():
    """Game over: a slow fall down E minor to a low E."""
    def voice(f, d):
        return lowpass(osc(f, d, "square") * adsr(d, 0.006, 0.15, 0.6, 0.06), 1800)
    lead = jingle([(B4, 2), (A4, 2), (G4, 2), (Fs4, 2), (E4, 6)], voice)
    low = jingle([(E3 * 2, 4), (note("D4"), 4), (E3 * 2, 6)], lambda f, d: bass(f, d) * 0.8)
    return reverb(mix(lead, low * 0.45), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-4)
def record():
    """A new best score: a bright fanfare with a trill on top."""
    lead = jingle(
        [(B4, 1), (E5, 1), (G5, 1), (B5, 2), (G5, 1), (B5, 1), (E6, 1), (D6, 1), (E6, 1), (D6, 1), (E6, 4)],
        lambda f, d: chip(f, d, 0.25),
    )
    fifth = jingle([(None, 11), (B5, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35)
    low = jingle([(E4, 5), (B3, 3), (G4, 3), (E4, 4)], bass)
    return reverb(mix(lead, fifth, low * 0.5), 0.2, IR_SMALL)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    """Menu cursor: a short soft blip."""
    dur = 0.05
    return np.sin(2 * np.pi * B5 * t_axis(dur)) * env(dur, 0.001, 0.04) + pad(click(0.004), dur) * 0.2


@sound(SOUNDS, peak=-10)
def select():
    """Menu confirm or toggle: two quick notes up, E to B."""
    return place((0.0, bell(E5, 0.08, 0.07)), (0.05, bell(B5, 0.14, 0.12)))


@sound(SOUNDS, peak=-12)
def back():
    """Back or resume: two quick notes down, B to E."""
    return lowpass(place((0.0, bell(B5, 0.08, 0.07)), (0.05, bell(E5, 0.14, 0.12))), 4000)


@sound(SOUNDS, peak=-10)
def pause():
    """The pause menu opens: a soft falling pair, G to E."""
    return lowpass(place((0.0, bell(G5, 0.14, 0.12, 0.6)), (0.07, bell(E5, 0.26, 0.22, 0.6))), 3500)


if __name__ == "__main__":
    write_all(SOUNDS, "neon-pinball")
