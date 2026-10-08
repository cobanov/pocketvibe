#!/bin/sh
# PocketVibe: play web games (three.js, Phaser, Wasm) on this handheld.
# Shown in EmulationStation under Ports.
#
# Quit from the launcher with B. From a game, hold Start + Select to return to
# the launcher; hold them for 3 seconds to quit the app.

HOME_DIR=/storage/pocketvibe
APP="$HOME_DIR/app"
QUIT_FLAG=/tmp/pocketvibe-quit

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
  sh "$HOME_DIR/debian-chroot.sh" run sh -c "
    export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1 COG_PLATFORM_WL_VIEW_FULLSCREEN=1
    exec cog -P wl --gamepad=manette --enable-write-console-messages-to-stdout=true \
      --bg-color=black http://127.0.0.1:8730/
  " >>/tmp/pocketvibe-cog.log 2>&1
  [ -e "$QUIT_FLAG" ] && break
  if [ $(($(date +%s) - started)) -lt 5 ]; then
    quick=$((quick + 1))
    [ $quick -ge 2 ] && break
  else
    quick=0
  fi
done
