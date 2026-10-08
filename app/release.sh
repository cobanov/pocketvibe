#!/bin/sh
# Packages the handheld app as dist/pocketvibe-app-<version>.zip, with the
# version taken from app/pocketvibe/config.json. With --publish it also
# creates the GitHub release that handhelds check for updates.
#
#   app/release.sh             package only
#   app/release.sh --publish   package and publish (NOTES="..." for the notes)
set -e

REPO=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$REPO/app/pocketvibe/config.json")
OUT="$REPO/dist"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

# Layout inside the zip: app/ (pocketvibed and the launcher), the Ports
# script, the runtime helper and the Ports image.
mkdir -p "$STAGE/app" "$STAGE/ports" "$OUT"
rsync -a --exclude __pycache__ --exclude .DS_Store "$REPO/app/pocketvibe/" "$STAGE/app/"
cp "$REPO/app/PocketVibe.sh" "$REPO/device/debian-chroot.sh" "$STAGE/"
cp "$REPO/app/ports/pocketvibe-image.png" "$STAGE/ports/"

ZIP="$OUT/pocketvibe-app-$VERSION.zip"
rm -f "$ZIP"
(cd "$STAGE" && zip -qr "$ZIP" .)
SHA=$(shasum -a 256 "$ZIP" | cut -d' ' -f1)
echo "$ZIP"
echo "sha256: $SHA"

if [ "$1" = "--publish" ]; then
  gh release create "v$VERSION" "$ZIP" --repo cobanov/pocketvibe \
    --title "PocketVibe $VERSION" \
    --notes "${NOTES:-PocketVibe $VERSION}

sha256: $SHA"
fi
