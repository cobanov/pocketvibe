#!/bin/sh
# From the computer: install or update the PocketVibe app on the handheld.
# The handheld's address comes from $HANDHELD (default root@192.168.8.197).
set -e

HOST=${HANDHELD:-root@192.168.8.197}
REPO=$(cd "$(dirname "$0")/.." && pwd)

ssh "$HOST" 'mkdir -p /storage/pocketvibe/app'
scp -q -r "$REPO/app/pocketvibe/." "$HOST:/storage/pocketvibe/app/"
scp -q "$REPO/app/PocketVibe.sh" "$HOST:/storage/roms/ports/PocketVibe.sh"
ssh "$HOST" 'chmod +x /storage/roms/ports/PocketVibe.sh && mkdir -p /storage/roms/ports/images'
scp -q "$REPO/app/ports/pocketvibe-image.png" "$HOST:/storage/roms/ports/images/"
ssh "$HOST" 'python3 /storage/pocketvibe/app/add-to-gamelist.py'
# Ask EmulationStation (its local API) to rescan, so Ports > PocketVibe shows up.
ssh "$HOST" 'curl -s -m 5 http://127.0.0.1:1234/reloadgames >/dev/null || true'
echo "Installed. On the handheld: Ports > PocketVibe."
