#!/bin/sh
# Build phase: the launcher and the game shell are the handheld app's own
# files, copied into the app as web/ (as android/app/build.gradle.kts does);
# the site's DejaVu fonts stand in for the handheld's. The games a new install
# starts with come from build/bundled, which scripts/testflight.sh fills
# (tools/bundled-games.py); without it the Library starts empty.
set -e
REPO="$SRCROOT/.."
OUT="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/web"
rm -rf "$OUT"
mkdir -p "$OUT/fonts" "$OUT/bundled"
cp -R "$REPO/app/pocketvibe/launcher" "$OUT/launcher"
cp "$REPO/app/pocketvibe/config.json" "$OUT/"
cp "$REPO/site/public/fonts/DejaVuSans.woff2" "$REPO/site/public/fonts/DejaVuSans-Bold.woff2" "$OUT/fonts/"
if ls "$SRCROOT/build/bundled/"*.zip >/dev/null 2>&1; then cp "$SRCROOT/build/bundled/"*.zip "$OUT/bundled/"; fi
