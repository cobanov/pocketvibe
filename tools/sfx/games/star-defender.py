"""Star Defender's sound effects: an arcade invader set in A minor, to sit with
the music (a retro 1980s sci-fi synth march, A minor, 118 BPM).

Tonal sounds use A minor (A B C D E F G); jingles move in 16ths of the
music's tempo. The march is one bass note (A3) that the game plays at four
rates, A G F E, one per step of the formation, so it speeds up as the
formation thins like the arcade original. The saucer hum is a seamless loop
(whole cycles of its warble and its tone fit the loop exactly) that the game
plays with sound.loop() while the saucer crosses.

Run: uv run --no-project --with numpy --with scipy --with soundfile python tools/sfx/games/star-defender.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from synth import *  # noqa: E402,F403

SOUNDS = {}
BPM = 118
S16 = 60 / BPM / 4  # a 16th note, s

E3, G3, A3 = note("E3"), note("G3"), note("A3")
C4, D4, E4, F4, G4, A4, B4 = (note(n) for n in ("C4", "D4", "E4", "F4", "G4", "A4", "B4"))
C5, D5, E5, F5, G5, A5, B5 = (note(n) for n in ("C5", "D5", "E5", "F5", "G5", "A5", "B5"))
C6, D6, E6, G6, A6 = note("C6"), note("D6"), note("E6"), note("G6"), note("A6")


def pk(x):
    """Scaled to a peak of 1, so parts can be mixed by their weights."""
    return x / (np.max(np.abs(x)) + 1e-12)


# ---------------------------------------------------------------- voices

def chip(freq, dur, duty=0.25, decay=None, cutoff=5000):
    """A pulse-wave note with a short release, the arcade lead."""
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
    body = osc(freq, dur, "triangle") + 0.25 * lowpass(osc(freq, dur, "pulse", 0.3), 1500)
    return body * adsr(dur, 0.004, 0.2, 0.7, min(0.06, dur / 3))


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
    """Sums parts of different lengths."""
    n = max(len(p) for p in parts)
    return sum(pad(p, n / SR) for p in parts)


# ---------------------------------------------------------------- the ship

@sound(SOUNDS, peak=-14)
def shoot():
    """The ship fires: a quick falling laser 'pew' from E6, with a click."""
    dur = 0.13
    zap = glide(E6, A4, dur, "pulse", 0.25, curve=0.45) * env(dur, 0.001, 0.11)
    body = glide(E5, A4 / 2, dur, "triangle", curve=0.5) * env(dur, 0.001, 0.07) * 0.5
    return lowpass(zap + body, 6000) + pad(click(0.005, 2500, 7000), dur) * 0.3


@sound(SOUNDS, peak=-5)
def boom():
    """The ship blows up: a thump, a roaring blast, debris and a falling wail."""
    dur = 0.95
    thump = glide(190, 55, 0.32, curve=0.6) * env(0.32, 0.002, 0.28)
    blast = sweep_filter(noise(dur, "pink"), 3500, 220) * env(dur, 0.002, 0.75)
    debris = bandpass(crackle(dur, 70, 0.004), 500, 4000) * env(dur, 0.05, 0.85)
    wail = lowpass(glide(A4, A3 / 2, 0.7, "saw", curve=0.7), 1800) * env(0.7, 0.01, 0.6)
    x = mix(pk(thump) * 0.7, highpass(pk(blast), 150) * 1.2, pk(debris) * 0.55, pk(wail) * 0.3)
    return lowpass(reverb(drive(x, 2.2), 0.12, IR_SMALL), 6500, order=4)


# ---------------------------------------------------------------- the aliens

@sound(SOUNDS, peak=-12)
def march():
    """One step of the formation: a bass thump on A3. The game plays it at
    four rates (A G F E) and faster as the aliens thin out."""
    dur = 0.14
    pitch = expramp(dur, semis(A3, 3), A3, 0.12)
    body = lowpass(osc(pitch, dur, "pulse", 0.32), 1900) * env(dur, 0.002, 0.12)
    sub = np.sin(2 * np.pi * A3 * t_axis(dur)) * env(dur, 0.002, 0.09) * 0.5
    return body + sub + pad(click(0.004, 600, 2500), dur) * 0.15


@sound(SOUNDS, peak=-12)
def explode():
    """An alien hit: a crunchy burst with a falling square blip."""
    dur = 0.26
    crunch = sweep_filter(noise(dur) + crackle(dur, 240, 0.003) * 2, 4200, 500, "band", 1.6) * env(dur, 0.001, 0.2)
    blip = lowpass(glide(A5, A4 / 2, 0.11, "square", curve=0.6), 3800) * env(0.11, 0.001, 0.1)
    return lowpass(pk(crunch) + pad(pk(blip), dur) * 0.45, 6000, order=4)


@sound(SOUNDS, peak=-12)
def armor():
    """A shot glancing off silver armor: a short metallic clank on E5."""
    dur = 0.22
    t = t_axis(dur)
    ring = np.zeros_like(t)
    for ratio, amp, dk in ((1.0, 1.0, 0.18), (2.76, 0.5, 0.09), (5.4, 0.25, 0.05)):
        ring += amp * np.sin(2 * np.pi * E5 * ratio * t) * env(dur, 0.0008, dk)
    knock = bandpass(noise(dur), 300, 2000) * env(dur, 0.001, 0.03)
    return lowpass(pk(ring) + pk(knock) * 0.5, 7000)


@sound(SOUNDS, peak=-17)
def bomb():
    """An alien lets a bomb go: a soft falling 'bwip'."""
    dur = 0.16
    tone = glide(A5, E5, dur, "triangle", curve=0.6) * env(dur, 0.002, 0.13)
    return lowpass(tone + 0.2 * glide(A5, E5, dur, "square", curve=0.6) * env(dur, 0.002, 0.06), 4000)


@sound(SOUNDS, peak=-13)
def dive():
    """An alien leaves the formation and swoops: a falling, wavering whistle."""
    dur = 0.6
    pitch = vibrato(expramp(dur, A5, A4, 0.8), dur, 11, 0.5)
    whistle = osc(pitch, dur, "triangle") + 0.2 * osc(pitch * 2, dur)
    return lowpass(whistle * adsr(dur, 0.02, 0.2, 0.8, 0.15), 5000)


@sound(SOUNDS, peak=-15)
def chip_():
    """A block of a bunker crumbles: a short gritty crunch."""
    dur = 0.1
    grit = bandpass(noise(dur) + crackle(dur, 400, 0.002) * 2, 700, 4000) * env(dur, 0.001, 0.07)
    thud = lowpass(noise(dur), 500) * env(dur, 0.001, 0.03)
    return pk(grit) + pk(thud) * 0.4


@sound(SOUNDS, peak=-13)
def cancel():
    """A shot meets a bomb: a bright spark."""
    dur = 0.16
    ping = fm(E6, 1.5, ramp(dur, 3.0, 0.3), dur) * env(dur, 0.001, 0.12)
    flick = bandpass(noise(dur), 2500, 7000) * env(dur, 0.0005, 0.03)
    return lowpass(pk(ping) * 0.8 + pk(flick) * 0.4, 7500)


@sound(SOUNDS, peak=-14, loop=True)
def saucer():
    """The mystery saucer's hum: a whine wavering eight times a second around
    E5. 0.5 s holds whole cycles of the warble (4) and of the tone (330 at
    660 Hz), so the loop has no seam."""
    dur = 0.5
    t = t_axis(dur)
    warble = 2 * np.pi * 8 * t
    pitch = 660 + 70 * np.sin(warble)
    phase = 2 * np.pi * np.cumsum(pitch) / SR
    tone = np.sin(phase) + 0.3 * np.sin(2 * phase) + 0.12 * np.sin(3 * phase)
    return tone * (0.85 + 0.15 * np.cos(warble))


@sound(SOUNDS, peak=-7)
def saucer_hit():
    """The saucer is shot down: a pop and a rising bonus arpeggio to A6."""
    burst = sweep_filter(noise(0.35, "pink"), 4000, 600, "band", 1.5) * env(0.35, 0.001, 0.25)
    run = jingle([(A5, 1), (C6, 1), (E6, 1), (A6, 3)], lambda f, d: chip(f, d, 0.25, cutoff=6000), step=0.055)
    sparkle = place((0.18, bell(E6, 0.3, 0.25) * 0.3), (0.24, bell(A6, 0.3, 0.22) * 0.25))
    x = place((0.0, pk(burst) * 0.6), (0.03, pk(run)), (0.0, sparkle))
    return reverb(x, 0.14, IR_SMALL)


@sound(SOUNDS, peak=-9)
def warn():
    """The formation reaches the bunkers: a two-tone alarm, twice."""
    def beep(f, d):
        return lowpass(osc(f, d, "square"), 3000) * adsr(d, 0.003, 0.05, 0.75, 0.02)
    return jingle([(E5, 0.75), (C5, 0.75), (E5, 0.75), (C5, 1)], beep)


# ---------------------------------------------------------------- waves and game

@sound(SOUNDS, peak=-6)
def life():
    """An extra ship: a quick 1-up arpeggio up to A6 with a sparkle."""
    lead = jingle([(A5, 1), (C6, 1), (E6, 1), (A6, 3)], lambda f, d: chip(f, d, 0.25, cutoff=6000), step=0.065)
    sparkle = place((0.2, bell(E6, 0.25, 0.2) * 0.3), (0.26, bell(A6, 0.2, 0.15) * 0.2))
    return reverb(place((0.0, lead), (0.0, sparkle)), 0.15, IR_SMALL)


@sound(SOUNDS, peak=-9)
def ready():
    """A wave flies in: a 'da-ding' from E to A over a bass A."""
    lead = place((0.0, chip(E5, S16, 0.25)), (S16, chip(A5, S16 * 3, 0.25)))
    under = place((S16, bass(A3, S16 * 3)))
    return reverb(mix(lead, under * 0.6), 0.12, IR_SMALL)


@sound(SOUNDS, peak=-5)
def clear():
    """Wave clear: a run up A minor and a bright landing on A."""
    lead = jingle(
        [(A5, 1), (C6, 1), (E6, 1), (A6, 1), (G6, 1), (E6, 1), (D6, 1), (E6, 1), (A6, 4)],
        lambda f, d: chip(f, d, 0.25, cutoff=6000) if f > 1200 else chip(f, d, 0.25),
    )
    harmony = jingle([(None, 8), (E6, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35)
    low = jingle([(A4, 4), (F4, 2), (G4, 2), (A4, 4)], bass)
    return reverb(mix(lead, harmony, low * 0.45), 0.18, IR_SMALL)


@sound(SOUNDS, peak=-5)
def over():
    """Game over: a slow march down to a low A."""
    def voice(f, d):
        return lowpass(osc(f, d, "square") * adsr(d, 0.006, 0.15, 0.6, 0.06), 1800)
    lead = jingle([(E5, 2), (D5, 2), (C5, 2), (B4, 2), (A4, 6)], voice)
    low = jingle([(A3, 4), (G3, 4), (A3, 6)], lambda f, d: bass(f, d) + bass(f * 2, d) * 0.5)
    return reverb(mix(lead, low * 0.45), 0.2, IR_SMALL)


@sound(SOUNDS, peak=-4)
def record():
    """A new best score: a bright fanfare with a trill on top."""
    lead = jingle(
        [(E5, 1), (A5, 1), (C6, 1), (E6, 2), (C6, 1), (E6, 1), (A6, 1), (G6, 1), (A6, 1), (G6, 1), (A6, 4)],
        lambda f, d: chip(f, d, 0.25, cutoff=6500),
    )
    fifth = jingle([(None, 11), (E6, 4)], lambda f, d: chip(f, d, 0.5, cutoff=3500) * 0.35)
    low = jingle([(A3, 5), (E3 * 2, 3), (C4, 3), (A3, 4)], bass)
    return reverb(mix(lead, fifth, low * 0.5), 0.2, IR_SMALL)


# ---------------------------------------------------------------- menus

@sound(SOUNDS, peak=-15)
def move():
    """Menu cursor: a short soft blip."""
    dur = 0.05
    return np.sin(2 * np.pi * E6 * t_axis(dur)) * env(dur, 0.001, 0.04) + pad(click(0.004), dur) * 0.2


@sound(SOUNDS, peak=-10)
def select():
    """Menu confirm or toggle: two quick notes up, A to E."""
    return place((0.0, bell(A5, 0.08, 0.07)), (0.05, bell(E6, 0.14, 0.12)))


@sound(SOUNDS, peak=-12)
def back():
    """Back or resume: two quick notes down, E to A."""
    return lowpass(place((0.0, bell(E6, 0.08, 0.07)), (0.05, bell(A5, 0.14, 0.12))), 4000)


@sound(SOUNDS, peak=-10)
def pause():
    """The pause menu opens: a soft falling pair, C to A."""
    return lowpass(place((0.0, bell(C6, 0.14, 0.12, 0.6)), (0.07, bell(A5, 0.26, 0.22, 0.6))), 3500)


@sound(SOUNDS, peak=-6)
def start():
    """A new game: a fast run up A minor with a warp whoosh."""
    run = jingle([(A4, 1), (E5, 1), (A5, 1), (C6, 1), (E6, 3)], lambda f, d: chip(f, d, 0.25), step=0.05)
    whoosh = sweep_filter(noise(0.5, "pink"), 300, 3500, "band", 1.6) * env(0.5, 0.05, 0.4)
    sparkle = place((0.2, bell(A6, 0.3, 0.25) * 0.3))
    return reverb(place((0.0, pk(run)), (0.0, pk(whoosh) * 0.3), (0.0, sparkle)), 0.12, IR_SMALL)


# chip is also the name of the pulse voice above; the file is chip.wav.
SOUNDS["chip"] = SOUNDS.pop("chip_")

if __name__ == "__main__":
    write_all(SOUNDS, "star-defender", sys.argv[1:] or None)
