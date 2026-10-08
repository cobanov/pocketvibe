"""Turns a generated track into a game's seamless music loop.

The games' music comes from ACE-Step 1.5 XL-SFT (text to music, run on a GPU
machine with tools/sfx/game_music_acestep.py, which holds the prompts). This script takes one of its
48 kHz FLACs and writes public/music/theme.ogg for a game:

1. Finds the beats, and the downbeats among them (where the bass and the
   harmony change).
2. Cuts a whole number of bars from after the intro, the length measured from
   the beats themselves, so a track that drifts a little from its BPM still
   loops on the beat; the cut is then nudged to the sample where the audio
   after its end matches its start best.
3. Crossfades the audio that follows the cut into its first beat, so the end
   runs straight into the start.
4. Loudness to -16 LUFS (sound.js plays music at 0.55, about -21 LUFS, under
   the effects), peaks under -1 dBFS, Ogg Vorbis.

    uv run --no-project --with numpy --with scipy --with soundfile --with librosa --with pyloudnorm \
        python tools/sfx/make_music_loop.py <in.flac> <bpm> <bars> <game-id> [--skip-bars N]
"""
import argparse
from pathlib import Path

import librosa
import numpy as np
import pyloudnorm
import soundfile as sf

REPO = Path(__file__).resolve().parents[2]
TARGET_LUFS = -16.0
PEAK = 10 ** (-1.0 / 20)


def downbeat_phase(y: np.ndarray, sr: int, beats: np.ndarray) -> int:
    """Which of every four beats is the downbeat: the one where the low end
    hits hardest and the harmony changes most."""
    low = librosa.onset.onset_strength(y=y, sr=sr, fmax=200, n_mels=32)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    change = np.concatenate([[0], np.linalg.norm(np.diff(chroma, axis=1), axis=0)])
    frames = librosa.time_to_frames(beats, sr=sr)
    frames = frames[frames < len(low)]
    score = np.zeros(4)
    for i, f in enumerate(frames):
        score[i % 4] += low[f] / (low.max() + 1e-9) + change[min(f, len(change) - 1)] / (change.max() + 1e-9)
    return int(np.argmax(score))


def best_offset(x: np.ndarray, a: int, end: int, search: int, window: int) -> int:
    """The end (near `end`) whose following audio best matches the audio at a."""
    ref = x[a: a + window].mean(axis=1)
    best, best_score = end, -np.inf
    for e in range(end - search, end + search + 1, 4):
        seg = x[e: e + window].mean(axis=1)
        if len(seg) < window:
            continue
        score = np.dot(ref, seg) / (np.linalg.norm(ref) * np.linalg.norm(seg) + 1e-9)
        if score > best_score:
            best, best_score = e, score
    return best


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("bpm", type=float)
    ap.add_argument("bars", type=int)
    ap.add_argument("game")
    ap.add_argument("--skip-bars", type=int, default=4, help="bars of intro to leave out")
    ap.add_argument("--out", help="write here instead of the game's public/music/theme.ogg")
    args = ap.parse_args()

    x, sr = sf.read(args.src, always_2d=True)
    mono = x.mean(axis=1)
    tempo, beat_frames = librosa.beat.beat_track(y=mono, sr=sr, start_bpm=args.bpm, tightness=400, units="frames")
    beats = librosa.frames_to_time(beat_frames, sr=sr)
    intervals = np.diff(beats)
    measured = 60 / np.median(intervals)
    if abs(measured - args.bpm) / args.bpm > 0.04 and abs(measured * 2 - args.bpm) / args.bpm > 0.04 and abs(measured / 2 - args.bpm) / args.bpm > 0.04:
        print(f"warning: measured {measured:.1f} BPM, asked for {args.bpm}")
    phase = downbeat_phase(mono, sr, beats)
    beats_per_bar = 4
    span = args.bars * beats_per_bar

    start_i = phase + args.skip_bars * beats_per_bar
    if start_i + span >= len(beats):
        raise SystemExit(f"track too short: {len(beats)} beats, need {start_i + span + 1}")
    a = int(round(beats[start_i] * sr))
    end = int(round(beats[start_i + span] * sr))
    beat_len = int(round(np.median(intervals) * sr))
    end = best_offset(x, a, end, search=int(0.03 * sr), window=beat_len)
    length = end - a
    fade = beat_len
    if end + fade > len(x):
        raise SystemExit("not enough audio after the loop for the crossfade")

    loop = x[a:end].copy()
    w = np.sin(np.linspace(0, np.pi / 2, fade))[:, None]
    loop[:fade] = x[a: a + fade] * w + x[end: end + fade] * np.cos(np.linspace(0, np.pi / 2, fade))[:, None]

    meter = pyloudnorm.Meter(sr)
    loudness = meter.integrated_loudness(loop)
    loop *= 10 ** ((TARGET_LUFS - loudness) / 20)
    peak = np.max(np.abs(loop))
    if peak > PEAK:
        # A gentle soft clip above -3 dBFS instead of turning the whole loop down.
        knee = 10 ** (-3 / 20)
        over = np.abs(loop) > knee
        loop[over] = np.sign(loop[over]) * (knee + (PEAK - knee) * np.tanh((np.abs(loop[over]) - knee) / (PEAK - knee)))

    out = Path(args.out) if args.out else REPO / "games" / args.game / "public" / "music" / "theme.ogg"
    out.parent.mkdir(parents=True, exist_ok=True)
    # In blocks: libsndfile's Vorbis encoder can crash on one long write.
    with sf.SoundFile(out, "w", sr, loop.shape[1], format="OGG", subtype="VORBIS") as f:
        for i in range(0, len(loop), 8192):
            f.write(loop[i: i + 8192].astype(np.float32))
    stability = np.std(intervals[start_i: start_i + span]) / np.median(intervals) * 100
    print(f"{out.relative_to(REPO) if out.is_relative_to(REPO) else out}: {length / sr:.2f} s from {a / sr:.2f} s, "
          f"{measured:.1f} BPM measured (beat spread {stability:.1f} %), downbeat phase {phase}, "
          f"{loudness:.1f} -> {meter.integrated_loudness(loop):.1f} LUFS, peak {20 * np.log10(np.max(np.abs(loop))):.1f} dBFS, "
          f"{out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
