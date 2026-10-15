#!/bin/bash
# Runs a game bundle in the installed dev app without reinstalling it: uploads
# the bundle and a config.js to /data/pocketvibe-dev/ (the app prefers scripts
# there), relaunches the title, waits, and prints the app's PERF lines.
# Usage: run-game.sh <game.js> [seconds] [config lines...]
#   e.g. run-game.sh dist.js 30 "globalThis.PV_VSYNC = false;"
set -euo pipefail

game=$1
seconds=${2:-30}
shift 2 || shift $#
host=${PS5_HOST:-192.168.8.53}
title=${TITLE:-PPSA90550}
ftp=ftp://$host:2121
shell() { { printf '%s\n' "$@"; sleep 3; printf 'exit\n'; } | nc -w 8 "$host" 2323 | tr -d '\r'; }

config=$(mktemp)
{
  echo "globalThis.PV_SEARCH = '${PV_SEARCH:-?handheld&screen=854x480}';"
  echo "globalThis.PV_AUTOPLAY = true;"
  echo "globalThis.PV_SECONDS = $seconds;"
  for line in "$@"; do echo "$line"; done
} >"$config"
curl -sS -T "$config" "$ftp/data/pocketvibe-dev/config.js"
curl -sS -T "$game" "$ftp/data/pocketvibe-dev/game.js"
rm -f "$config"

shell "hbldr /data/pocketvibe-dev/close-$title.elf" >/dev/null
sleep 3
shell "launch $title" >/dev/null
sleep $((seconds + 15))
curl -s "$ftp/data/pocketvibe-dev/app.log" | grep -aE '^(PERF|script|canvas|vsync|webgl|missing|GL entry)|Error|error' | grep -av '^\[ps5' | tail -"${LINES_SHOWN:-12}"
