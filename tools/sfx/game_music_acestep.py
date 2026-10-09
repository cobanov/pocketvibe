"""Background music candidates for the PocketVibe default games (ACE-Step 1.5 XL-SFT).

Runs inside an ACE-Step 1.5 checkout on a CUDA machine (copy it there and run it with
ACE-Step's own Python); it writes output/pocketvibe_games/<game>_s<seed>.flac, 90 s at 48 kHz.
tools/sfx/make_music_loop.py then cuts the chosen take into the game's loop.
"""
import json
import shutil
import sys
import time
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from acestep.handler import AceStepHandler
from acestep.inference import GenerationConfig, GenerationParams, generate_music
from acestep.llm_inference import LLMHandler

OUT = ROOT / "output" / "pocketvibe_games"
OUT.mkdir(parents=True, exist_ok=True)
TMP = OUT / "_tmp"

PIECES = {
    "turbo-circuit": ("A Minor", 150,
        "high-energy 1990s arcade racing game soundtrack, eurobeat and synthwave, driving four-on-the-floor drums, "
        "fast octave synth bass, bright supersaw chords, catchy heroic saw lead melody, gated snare, "
        "exciting and fast, instrumental video game music, no vocals"),
    "jet-rush": ("E Minor", 128,
        "upbeat energetic electro funk for an arcade action game, punchy drum machine, slap synth bass, "
        "chiptune square wave lead melody, bright brass stabs, fun and adventurous, catchy loop, "
        "instrumental video game music, no vocals"),
    "brick-breaker": ("D Minor", 118,
        "retro 1980s arcade electro, tight drum machine, bouncy analog synth bass arpeggio, glossy FM bell leads, "
        "neon space vibe, playful and focused, steady groove, instrumental video game music, no vocals"),
    "tower-stack": ("F Major", 86,
        "calm dreamy lofi electronic, soft Rhodes electric piano chords, warm round sub bass, gentle dusty hip hop drums, "
        "airy synth pads, music box melody, relaxing and hopeful, sunset into a starry night, "
        "instrumental video game music, no vocals"),
    "road-hopper": ("C Major", 112,
        "cheerful bouncy cartoon game music, wooden marimba melody, pizzicato strings, ukulele strums, "
        "light hand percussion and shaker, tuba bass, playful and silly countryside farm vibe, "
        "instrumental video game music, no vocals"),
    "block-drop": ("B Minor", 124,
        "energetic but focused electronic puzzle game music, crisp plucked synth arpeggios, punchy tight drums, "
        "warm rolling bass, catchy bright hook, steady and driving, instrumental video game music, no vocals"),
    "cloud-climber": ("D Major", 120,
        "bright airy happy platformer game music, glockenspiel and flute-like synth melody, bouncy bass, "
        "light crisp drums, whimsical and uplifting, pastel sky adventure, instrumental video game music, no vocals"),
    "crate-pusher": ("B♭ Major", 92,
        "cosy relaxed puzzle game music, mellow electric piano chords, soft upright bass, gentle brushed drums, "
        "warm vibraphone melody, thoughtful and calm, instrumental video game music, no vocals"),
    "maze-chase": ("C Minor", 132,
        "retro arcade synthwave with chiptune flavour, tense and playful chase, pulsing octave bass, square wave lead, "
        "punchy drum machine, neon maze, instrumental video game music, no vocals"),
    "mini-golf": ("G Major", 100,
        "sunny relaxed bossa nova lounge, nylon string guitar, soft brushed percussion, warm round bass, "
        "light flute melody, leisurely and cheerful summer afternoon, instrumental video game music, no vocals"),
    "neon-pinball": ("E Minor", 126,
        "glossy neon synth funk, slap bass, bright synth brass stabs, sparkling arpeggios, disco drums, "
        "flashy arcade energy, instrumental video game music, no vocals"),
    "rock-blaster": ("F Minor", 120,
        "dark spacey electronic game music, deep pulsing synth bass, wide sci-fi pads, driving electronic drums, "
        "ominous arpeggios, deep space danger, instrumental video game music, no vocals"),
    "lane-runner": ("F# Minor", 140,
        "high energy electronic dance game music, driving four on the floor kick, plucky synth riff, uplifting chords, "
        "fast running action, instrumental video game music, no vocals"),
    "sky-hopper": ("E♭ Major", 110,
        "light cheerful chiptune pop, bouncy square wave melody, simple bass line, airy pads, soft drums, "
        "carefree flight above the clouds, instrumental video game music, no vocals"),
    "snake": ("G Minor", 116,
        "playful jazzy funk groove, clavinet and muted guitar, groovy bass, tight dry drums, sly and catchy, "
        "toy board game, instrumental video game music, no vocals"),
    "snow-slalom": ("C# Minor", 128,
        "exhilarating winter downhill electronic music, crisp sleigh bell percussion, icy shimmering synths, "
        "driving breakbeat, fresh and fast, instrumental video game music, no vocals"),
    "star-defender": ("A Minor", 118,
        "retro 1980s sci-fi arcade synth march, steady marching drum pattern, heroic analog synth lead, pulsing bass, "
        "space shooter defending earth, instrumental video game music, no vocals"),
    "tank-brigade": ("D Minor", 112,
        "determined military electronic march, snare rolls, heavy synth bass, brass-like synth stabs, "
        "battle theme for a tank game, instrumental video game music, no vocals"),
    "tile-merge": ("A♭ Major", 84,
        "calm minimalist puzzle music, soft piano and kalimba, warm pads, gentle laid back beat, "
        "focused and soothing, instrumental video game music, no vocals"),
}
SEEDS = [7101, 7102, 7103]
DURATION = 90


def main() -> None:
    only = sys.argv[1:]
    t0 = time.time()
    dit = AceStepHandler()
    msg, ok = dit.initialize_service(project_root=str(ROOT), config_path="acestep-v15-xl-sft", device="cuda", offload_to_cpu=False)
    if not ok:
        sys.exit(f"DiT init failed: {msg}")
    llm = LLMHandler()
    msg, ok = llm.initialize(checkpoint_dir=str(ROOT / "checkpoints"), lm_model_path="acestep-5Hz-lm-4B", backend="vllm", device="cuda", offload_to_cpu=False, dtype=None)
    if not ok:
        sys.exit(f"LM init failed: {msg}")
    print(f"READY {time.time() - t0:.1f}s", flush=True)

    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    for name, (key, bpm, caption) in PIECES.items():
        if only and name not in only:
            continue
        for seed in SEEDS:
            tag = f"{name}_s{seed}"
            if (OUT / f"{tag}.flac").exists():
                continue
            started = time.time()
            params = GenerationParams(
                task_type="text2music", caption=caption, lyrics="[Instrumental]", instrumental=True,
                bpm=bpm, keyscale=key, timesignature="4", duration=DURATION, seed=seed,
                inference_steps=50, guidance_scale=7.0, thinking=True,
                use_cot_caption=False, use_cot_metas=False, use_cot_language=False,
            )
            config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[seed], audio_format="flac")
            shutil.rmtree(TMP, ignore_errors=True)
            result = generate_music(dit, llm, params, config, save_dir=str(TMP))
            if not result.success:
                print(f"FAIL {tag}: {result.error}", flush=True)
                continue
            src = Path(result.audios[0]["path"])
            dst = OUT / f"{tag}.flac"
            shutil.move(src, dst)
            meta[tag] = {"caption": caption, "key": key, "bpm": bpm, "seed": seed}
            meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False))
            print(f"DONE {tag} {time.time() - started:.1f}s -> {dst}", flush=True)
    shutil.rmtree(TMP, ignore_errors=True)
    print("ALL DONE", flush=True)


if __name__ == "__main__":
    main()
