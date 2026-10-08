#!/bin/sh
# Packages the handheld app (version from app/pocketvibe/config.json) into
# dist/:
#
#   PocketVibe.zip                   for people installing it: unzip into
#                                     roms/ports on the handheld's SD card. No
#                                     version in the name, so the website can
#                                     link to the latest release's copy.
#   pocketvibe-app-<version>.zip     for updates: what installed apps download
#
# With --publish it also creates the GitHub release (NOTES="..." for notes).
set -e

REPO=$(cd "$(dirname "$0")/.." && pwd)
VERSION=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$REPO/app/pocketvibe/config.json")
OUT="$REPO/dist"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT"

copy_app() {
  mkdir -p "$1"
  rsync -a --exclude __pycache__ --exclude .DS_Store "$REPO/app/pocketvibe/" "$1/"
}

# Update package: app/, the Ports script and the Ports image.
copy_app "$STAGE/update/app"
cp "$REPO/app/PocketVibe.sh" "$STAGE/update/"
mkdir -p "$STAGE/update/ports"
cp "$REPO/app/ports/pocketvibe-image.png" "$STAGE/update/ports/"
UPDATE="$OUT/pocketvibe-app-$VERSION.zip"
rm -f "$UPDATE"
(cd "$STAGE/update" && zip -qr "$UPDATE" .)

# Install package: laid out like roms/ports, with a few games from the
# store that a new install starts with (the app unpacks them once).
copy_app "$STAGE/install/pocketvibe"
mkdir -p "$STAGE/install/pocketvibe/bundled"
python3 "$REPO/tools/bundled-games.py" "$STAGE/install/pocketvibe/bundled"
cp "$REPO/app/PocketVibe.sh" "$STAGE/install/"
mkdir -p "$STAGE/install/images"
cp "$REPO/app/ports/pocketvibe-image.png" "$STAGE/install/images/"
INSTALL="$OUT/PocketVibe.zip"
rm -f "$INSTALL"
(cd "$STAGE/install" && zip -qr "$INSTALL" .)

SHA=$(shasum -a 256 "$UPDATE" | cut -d' ' -f1)
echo "$INSTALL"
echo "$UPDATE"
echo "sha256: $SHA"

if [ "$1" = "--publish" ]; then
  gh release create "v$VERSION" "$INSTALL" "$UPDATE" --repo cobanov/pocketvibe \
    --title "PocketVibe $VERSION" \
    --notes "${NOTES:-PocketVibe $VERSION}

sha256: $SHA"
fi
