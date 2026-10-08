#!/bin/sh
# From the computer: install or update the PocketVibe app on the handheld.
# The handheld's address comes from $HANDHELD (default root@192.168.8.197).
set -e

HOST=${HANDHELD:-root@192.168.8.197}
REPO=$(cd "$(dirname "$0")/.." && pwd)

ssh "$HOST" 'mkdir -p /storage/pocketvibe/app'
scp -q -r "$REPO/app/pocketvibe/." "$HOST:/storage/pocketvibe/app/"
scp -q "$REPO/device/debian-chroot.sh" "$HOST:/storage/pocketvibe/"
scp -q "$REPO/app/PocketVibe.sh" "$HOST:/storage/roms/ports/PocketVibe.sh"
ssh "$HOST" 'chmod +x /storage/roms/ports/PocketVibe.sh'
echo "Installed. On the handheld: Ports > PocketVibe."
