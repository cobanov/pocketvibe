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
