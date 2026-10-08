#!/bin/sh
# From the computer: copy a built game to the handheld and open it there.
#
#   device/play.sh <dist-dir> [game-id]
#
# The game goes into PocketVibe's Library. Its id comes from the
# pocketvibe.json next to the dist folder, else from the project's folder
# name; that pocketvibe.json and cover.png are copied along, so the Library
# shows its title and cover. The handheld's address comes from $HANDHELD
# (default root@192.168.8.197).
set -e

DIST=${1:?usage: play.sh <dist-dir> [game-id]}
PROJECT=$(cd "$DIST/.." && pwd)
ID=${2:-$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["id"])' "$PROJECT/pocketvibe.json" 2>/dev/null || basename "$PROJECT")}
if ! printf '%s' "$ID" | grep -Eq '^[a-z0-9][a-z0-9-]{0,63}$'; then
  echo "Game ids are lowercase letters, digits and dashes, not \"$ID\"."
  exit 1
fi
HOST=${HANDHELD:-root@192.168.8.197}
HERE=$(cd "$(dirname "$0")" && pwd)
GAMES=/storage/pocketvibe/games

ssh "$HOST" "rm -rf '$GAMES/$ID' && mkdir -p '$GAMES/$ID'"
scp -q -r "$DIST"/. "$HOST:$GAMES/$ID/"
for file in pocketvibe.json cover.png; do
  [ -f "$PROJECT/$file" ] && scp -q "$PROJECT/$file" "$HOST:$GAMES/$ID/"
done
scp -q "$HERE/run-game.sh" "$HOST:/storage/pocketvibe/run-game.sh"
ssh "$HOST" "sh /storage/pocketvibe/run-game.sh $ID"
