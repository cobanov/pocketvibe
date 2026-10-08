#!/bin/sh
# From the computer: packs a runtime built on the handheld with
# device/build-runtime.sh into dist/ for a GitHub release, and prints what
# app/pocketvibe/config.json needs (size and sha256).
#
#   tools/pack-runtime.sh <folder on the handheld> <version>
#
# The handheld's address comes from $HANDHELD (default root@192.168.8.197).
# Caches the runtime made while it ran (shaders, fonts) and the handheld's
# DNS settings are left out. xz runs here, on all of the computer's cores.
set -e

DIR=${1:?usage: pack-runtime.sh <folder on the handheld> <version>}
VERSION=${2:?usage: pack-runtime.sh <folder on the handheld> <version>}
HOST=${HANDHELD:-root@192.168.8.197}
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT="$REPO/dist/pocketvibe-runtime-$VERSION.tar.xz"
mkdir -p "$REPO/dist"

ssh "$HOST" "cd '$DIR' && tar -cf - --exclude ./root/.cache --exclude ./root/.local --exclude ./root/.config \
  --exclude './tmp/*' --exclude ./etc/resolv.conf ." | xz -T0 -9 > "$OUT"

SIZE_MB=$(( $(wc -c < "$OUT") / 1048576 ))
SHA=$(shasum -a 256 "$OUT" | cut -d' ' -f1)
echo "$OUT"
echo "size_mb: $SIZE_MB"
echo "sha256: $SHA"
