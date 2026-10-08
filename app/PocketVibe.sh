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

# The browser runtime is downloaded on the first run.
if [ ! -x "$RUNTIME/usr/bin/cog" ]; then
  # ROCKNIX has terminfo for xterm only, which dialog needs. The palette
  # gives setup.dialogrc PocketVibe's colors.
  LC_ALL=en_US.UTF-8 foot --fullscreen --term=xterm -o font=monospace:size=13 \
    -o colors-dark.background=0f1016 -o colors-dark.foreground=f2f2f5 -o colors-dark.regular0=0f1016 \
    -o colors-dark.regular4=1a1c26 -o colors-dark.regular3=ffc83d -o colors-dark.bright3=ffc83d \
    -o colors-dark.regular7=f2f2f5 -o colors-dark.bright7=ffffff \
    sh "$APP/setup.sh"
  [ -x "$RUNTIME/usr/bin/cog" ] || exit 1
fi

# One launch's browser console; /tmp is in memory.
: >/tmp/pocketvibe-cog.log

python3 "$APP/pocketvibed.py" >/tmp/pocketvibed.log 2>&1 &
DAEMON=$!
# On a handheld with two screens, PocketVibe turns the second one on while it
# runs (see screens.py); it goes off again on the way out.
SCREENS="python3 $APP/screens.py restore"
trap 'kill $DAEMON 2>/dev/null; $SCREENS 2>/dev/null' EXIT
trap 'exit 1' INT TERM

# Wait until the local service answers, up to 15 s on a slow card.
i=0
until curl -sf -o /dev/null http://127.0.0.1:8730/; do
  i=$((i + 1))
  if [ $i -ge 150 ] || ! kill -0 $DAEMON 2>/dev/null; then
    # A new version that does not start: go back to the one before it.
    if [ -e "$HOME_DIR/update-pending" ] && [ -d "$HOME_DIR/app.old" ]; then
      kill $DAEMON 2>/dev/null
      rm -rf "$HOME_DIR/app.failed" "$HOME_DIR/update-pending" "$HOME_DIR/notice"
      mv "$APP" "$HOME_DIR/app.failed" && mv "$HOME_DIR/app.old" "$APP"
      trap - EXIT
      exec sh /storage/roms/ports/PocketVibe.sh
    fi
    exit 1
  fi
  sleep 0.1
done

# Without the service there is no way back from a game, so if it stops, the
# browser goes too. This also keeps the console log small.
(
  while kill -0 $DAEMON 2>/dev/null; do
    [ "$(wc -c </tmp/pocketvibe-cog.log)" -gt 5000000 ] && : >/tmp/pocketvibe-cog.log
    sleep 2
  done
  pkill -KILL -x cog
) &
WATCH=$!
trap 'kill $DAEMON $WATCH 2>/dev/null; $SCREENS 2>/dev/null' EXIT

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
    kill $WATCH $DAEMON 2>/dev/null
    trap - EXIT
    exec sh /storage/roms/ports/PocketVibe.sh
  fi
  [ -e "$QUIT_FLAG" ] && break
  kill -0 $DAEMON 2>/dev/null || break
  # pocketvibed may close the browser to restore saved data; wait for it.
  while [ -e /tmp/pocketvibe-busy ]; do sleep 0.2; done
  if [ $(($(date +%s) - started)) -lt 5 ]; then
    quick=$((quick + 1))
    [ $quick -ge 2 ] && break
  else
    quick=0
  fi
done
