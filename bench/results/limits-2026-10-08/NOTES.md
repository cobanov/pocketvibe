# Limits run, 2026-10-08 (raw data)

Anbernic RG34XX SP, ROCKNIX 20261007, WPE WebKit 2.48.3 + Cog 0.18.4, Mesa 25.0.7 (runtime-v1), in the
PocketVibe app. Made with `limits.html` and `tools/collector.py`; `tools/limits-report.mjs` prints tables.

- `run1.jsonl`: the whole suite in one browser. Valid from `info` to `calls-unique`; after that free memory
  fell under 120 MB (WebKit keeps the GPU memory of earlier pages) and the numbers are wrong.
- `run2.jsonl`: the rest, again in one browser. Valid from `calls-unique` to `shadows` and `textures` up to 512.
- `run3.jsonl`: every remaining test in a freshly started browser (`pv-each.sh`). Valid throughout, except
  `audio` (the AudioContext stayed suspended without a button press, so nothing played) and the first
  `memory textures` line (it ran after `memory js` in the same browser); the last lines are reruns in fresh
  browsers.
- `*-samples.jsonl`: temperatures, clocks and free memory every two seconds.
