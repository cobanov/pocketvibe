#!/bin/bash
# Plays every game of the installed dev app for a while (autoplay presses A)
# and prints one line per game: frame rate, worst frame, JavaScript time and
# memory, from the app's PERF lines (the first one, with startup, is skipped).
# Usage: sweep.sh [seconds-per-game] [screen]   e.g. sweep.sh 20 1280x720
set -euo pipefail

seconds=${1:-20}
screen=${2:-1280x720}
host=${PS5_HOST:-192.168.8.53}
title=${TITLE:-PPSA90550}
ftp=ftp://$host:2121
dev=$ftp/data/pocketvibe-dev
shell() { { printf '%s\n' "$@"; sleep 3; printf 'exit\n'; } | nc -w 8 "$host" 2323 | tr -d '\r'; }
tmp=$(mktemp -d)

printf "globalThis.PV_SEARCH = '?handheld&screen=%s';\nglobalThis.PV_AUTOPLAY = true;\nglobalThis.PV_SECONDS = %d;\n" \
  "$screen" "$seconds" >"$tmp/config.js"
curl -sS -T "$tmp/config.js" "$dev/config.js"
count=$(curl -s "$ftp/data/homebrew/$title/assets/js/games.txt" | grep -c .)

printf '%-14s %6s %8s %8s %8s %8s %7s %s\n' game fps worstMs jsMs worstJs heapMB jsMB notes
for ((i = 0; i < count; i++)); do
  echo "$i" >"$tmp/index"
  curl -sS -T "$tmp/index" "$dev/game-index.txt"
  shell "hbldr /data/pocketvibe-dev/close-$title.elf" >/dev/null
  sleep 3
  shell "launch $title" >/dev/null
  sleep $((seconds + 12))
  curl -s "$dev/app.log" >"$tmp/log"
  cp "$tmp/log" "${LOG_DIR:-$HOME/Developer/ps5-homebrew/logs}/sweep-$screen-$i.log"
  name=$(sed -n 's/^game [0-9]*: //p' "$tmp/log")
  notes=$(grep -aE 'FAILED|Error|missing' "$tmp/log" | head -1 | cut -c1-60)
  grep -a '^PERF' "$tmp/log" | tail -n +2 | sed 's/^PERF //' >"$tmp/perf"
  if [ -s "$tmp/perf" ]; then
    python3 -c '
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1])]
avg = lambda k: sum(r[k] for r in rows) / len(rows)
print("%-14s %6.1f %8.1f %8.2f %8.1f %8.1f %7.1f %s" % (sys.argv[2], avg("fps"), max(r["worstFrameMs"] for r in rows),
  avg("jsMs"), max(r["worstJsMs"] for r in rows), max(r["heapMB"] for r in rows), max(r["jsHeapMB"] for r in rows), sys.argv[3]))
' "$tmp/perf" "$name" "$notes"
  else
    printf '%-14s %6s %s\n' "$name" "-" "no frames: $notes"
  fi
done
rm -rf "$tmp"
