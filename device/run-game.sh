#!/bin/sh
# On the handheld: open an installed game in the PocketVibe app.
#
#   run-game.sh <game-id> [extra]
#
# The game lives in /storage/pocketvibe/games/<game-id>. The app is started
# first if it is not running. Hold Start + Select to go back to the launcher.
# extra is added to the game's address, e.g. "&perflog" to log the frame rate
# to /tmp/pocketvibe-browser.log as PERF lines.

ID=${1:?usage: run-game.sh <game-id> [extra]}
EXTRA=$2
API=http://127.0.0.1:8730

wait_for() {
  i=0
  until eval "$1" >/dev/null 2>&1; do
    i=$((i + 1))
    [ $i -ge 150 ] && return 1
    sleep 0.2
  done
}

case $ID in
  [a-z0-9]*) ;;
  *) echo "Not a game id: $ID"; exit 1 ;;
esac

if ! curl -sf -o /dev/null "$API/"; then
  # Start it the way the Ports menu does, through EmulationStation, and give
  # the launcher time to load.
  curl -s -d /storage/roms/ports/PocketVibe.sh http://127.0.0.1:1234/launch >/dev/null
  wait_for "curl -sf -o /dev/null $API/" || { echo "PocketVibe did not start."; exit 1; }
  sleep 4
fi

URL=$(curl -s -X POST -H 'X-PocketVibe: 1' "$API/api/launch/$ID" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("url", ""))')
[ -n "$URL" ] || { echo "PocketVibe has no game called $ID."; exit 1; }
# The page on screen takes the address and opens it (pocketvibed's navigate).
OPENED=$(curl -s -X POST -H 'X-PocketVibe: 1' -H 'Content-Type: application/json' \
  -d "{\"url\": \"$URL$EXTRA\"}" "$API/api/navigate" | python3 -c 'import json, sys; print(json.load(sys.stdin).get("ok", False))')
[ "$OPENED" = True ] || { echo "PocketVibe's browser did not open $ID."; exit 1; }
echo "Opened $ID. Hold Start + Select on the handheld to go back to the launcher."
