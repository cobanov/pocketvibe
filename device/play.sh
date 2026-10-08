#!/bin/sh
# From the computer: copy a built game to the handheld and run it there.
#
#   device/play.sh <dist-dir> [name] [query]
#
# The handheld's address comes from $HANDHELD (default root@192.168.8.197).
# Start + Select on the handheld quits the game and returns here.
set -e

DIST=${1:?usage: play.sh <dist-dir> [name] [query]}
NAME=${2:-$(basename "$(cd "$DIST/.." && pwd)")}
QUERY=${3:-handheld}
HOST=${HANDHELD:-root@192.168.8.197}
HERE=$(cd "$(dirname "$0")" && pwd)
REMOTE=/storage/pocketvibe

scp -q "$HERE/run-game.sh" "$HERE/exit-only.gptk" "$HERE/debian-chroot.sh" "$HOST:$REMOTE/"
ssh "$HOST" "rm -rf $REMOTE/games/$NAME && mkdir -p $REMOTE/games/$NAME"
scp -q -r "$DIST"/. "$HOST:$REMOTE/games/$NAME/"
echo "Running $NAME on $HOST. Start + Select on the handheld quits."
ssh "$HOST" "sh $REMOTE/run-game.sh $REMOTE/games/$NAME '$QUERY'"
