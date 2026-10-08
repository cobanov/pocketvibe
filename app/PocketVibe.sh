#!/bin/sh
# PocketVibe: play web games (three.js, Phaser, Wasm) on this handheld.
# Shown in EmulationStation under Ports.
#
# Quit from the launcher with B. From a game, hold Start + Select to return to
# the launcher; hold them for 3 seconds to quit the app.

HOME_DIR=/storage/pocketvibe
APP="$HOME_DIR/app"
RUNTIME="$HOME_DIR/runtime"
QUIT_FLAG=/tmp/pocketvibe-quit
# The install zip puts the app next to this script; on the first run it moves
# to its home, where updates also go.
SEED="$(cd "$(dirname "$0")" && pwd)/pocketvibe"

if [ -f "$SEED/pocketvibed.py" ]; then
  mkdir -p "$HOME_DIR"
  rm -rf "$APP"
  mv "$SEED" "$APP"
  python3 "$APP/add-to-gamelist.py" >/dev/null 2>&1
fi

# Early test setups kept the runtime in /storage/debian.
if [ ! -d "$RUNTIME" ] && [ -x /storage/debian/usr/bin/cog ]; then
  mv /storage/debian "$RUNTIME"
fi

# The browser runtime is downloaded on the first run.
if [ ! -x "$RUNTIME/usr/bin/cog" ]; then
  foot --fullscreen --term=xterm-256color sh "$APP/setup.sh"
  [ -x "$RUNTIME/usr/bin/cog" ] || exit 1
fi

python3 "$APP/pocketvibed.py" >/tmp/pocketvibed.log 2>&1 &
DAEMON=$!
trap 'kill $DAEMON 2>/dev/null' EXIT INT TERM

# Wait until the local service answers.
i=0
until curl -s -o /dev/null http://127.0.0.1:8730/api/library || [ $i -ge 50 ]; do
  sleep 0.1
  i=$((i + 1))
done

# The browser is reopened on the launcher whenever it closes, unless the app
# was quit on purpose: pocketvibed closes it to leave a game it cannot reach,
# and a game can crash it. Two quick failures in a row stop the loop.
quick=0
while :; do
  started=$(date +%s)
  COG_PLATFORM_WL_VIEW_FULLSCREEN=1 python3 "$APP/runtime.py" --root "$RUNTIME" -- \
    cog -P wl --gamepad=manette --enable-write-console-messages-to-stdout=true \
    --media-playback-requires-user-gesture=false --bg-color=black http://127.0.0.1:8730/ \
    >>/tmp/pocketvibe-cog.log 2>&1
  if [ -e /tmp/pocketvibe-restart ]; then
    # pocketvibed installed a new version: start again with the new files.
    rm -f /tmp/pocketvibe-restart
    kill $DAEMON 2>/dev/null
    trap - EXIT INT TERM
    exec sh /storage/roms/ports/PocketVibe.sh
  fi
  [ -e "$QUIT_FLAG" ] && break
  # pocketvibed may close the browser to restore saved data; wait for it.
  while [ -e /tmp/pocketvibe-busy ]; do sleep 0.2; done
  if [ $(($(date +%s) - started)) -lt 5 ]; then
    quick=$((quick + 1))
    [ $quick -ge 2 ] && break
  else
    quick=0
  fi
done
