#!/bin/sh
# On the handheld: open an installed game in the PocketVibe app.
#
#   run-game.sh <game-id>
#
# The game lives in /storage/pocketvibe/games/<game-id>. The app is started
# first if it is not running. Hold Start + Select to go back to the launcher.

ID=${1:?usage: run-game.sh <game-id>}
API=http://127.0.0.1:8730
COGCTL="python3 /storage/pocketvibe/app/runtime.py --root /storage/pocketvibe/runtime -- cogctl"

wait_for() {
  i=0
  until eval "$1" >/dev/null 2>&1; do
    i=$((i + 1))
    [ $i -ge 150 ] && return 1
    sleep 0.2
  done
}

if ! curl -s -o /dev/null "$API/api/status"; then
  # Start it the way the Ports menu does, through EmulationStation, and wait
  # for the launcher: it tells the app that no game is running as it loads.
  LOG=/tmp/pocketvibe-cog.log
  START=$(($(wc -c <"$LOG" 2>/dev/null || echo 0) + 1))
  curl -s -d /storage/roms/ports/PocketVibe.sh http://127.0.0.1:1234/launch >/dev/null
  wait_for "tail -c +$START $LOG | grep -q '8730/> Loaded successfully'" || { echo "PocketVibe did not start."; exit 1; }
  sleep 2
fi

URL=$(curl -s -X POST "$API/api/launch/$ID" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("url", ""))')
[ -n "$URL" ] || { echo "PocketVibe has no game called $ID."; exit 1; }
$COGCTL open "$URL" || { echo "PocketVibe's browser did not open $ID."; exit 1; }
echo "Opened $ID. Hold Start + Select on the handheld to go back to the launcher."
