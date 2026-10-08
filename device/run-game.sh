#!/bin/sh
# Runs a built web game folder full screen on the handheld.
# Feasibility version: WPE comes from the Debian chroot (debian-chroot.sh).
#
#   run-game.sh <game-dir> [query]
#
# The game is served from 127.0.0.1 (module scripts do not load from file://)
# and opened with ?handheld so handheld.js switches to device mode.
# Start + Select quits. When started over SSH instead of from
# EmulationStation, EmulationStation is paused so it does not react to the
# buttons while the game runs.

GAME=${1:?usage: run-game.sh <game-dir> [query]}
QUERY=${2:-handheld}
PORT=8725
DIR=$(cd "$(dirname "$0")" && pwd)

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$GAME" >/tmp/pocketvibe-http.log 2>&1 &
SERVER=$!

# gptokeyb only provides the Start + Select quit combo here; the exit-only
# config maps no buttons to keys, the game reads the gamepad itself.
SDL_GAMECONTROLLERCONFIG_FILE=/storage/.config/SDL-GameControllerDB/gamecontrollerdb.txt \
  gptokeyb -k cog -c "$DIR/exit-only.gptk" >/tmp/pocketvibe-gptokeyb.log 2>&1 &
KEYS=$!

ES=$(pidof emulationstation)
[ -n "$ES" ] && kill -STOP "$ES"

cleanup() {
  kill "$SERVER" "$KEYS" 2>/dev/null
  [ -n "$ES" ] && kill -CONT "$ES"
}
trap cleanup EXIT INT TERM

sh "$DIR/debian-chroot.sh" run sh -c "
  export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 COG_PLATFORM_WL_VIEW_FULLSCREEN=1
  exec cog -P wl --gamepad=manette --enable-write-console-messages-to-stdout=true \
    --bg-color=black 'http://127.0.0.1:$PORT/?$QUERY'
" >/tmp/pocketvibe-cog.log 2>&1
