#!/bin/sh
# Builds the signed Android app (version from app/pocketvibe/config.json)
# into android/build/dist/PocketVibe-<version>.apk.
#
# The release key is ~/.config/pocketvibe/android-release.keystore (or
# $POCKETVIBE_KEYSTORE), its password in the macOS Keychain as
# "pocketvibe-android-keystore". Keep a copy of both: an app signed with
# another key cannot update one already installed.
#
# With --publish it also creates the GitHub release android-v<version>
# (NOTES="..." or NOTES_FILE=<file> for notes). It is never marked latest, so the handhelds'
# releases/latest/download/PocketVibe.zip keeps pointing at the handheld app.
set -e

ANDROID=$(cd "$(dirname "$0")" && pwd)
REPO=$(dirname "$ANDROID")
VERSION=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$REPO/app/pocketvibe/config.json")
# Gradle 8.11 needs JDK 17 to 21; Homebrew's own openjdk is newer.
[ -x "$JAVA_HOME/bin/java" ] || JAVA_HOME=/opt/homebrew/opt/openjdk@21
export JAVA_HOME
export POCKETVIBE_KEYSTORE=${POCKETVIBE_KEYSTORE:-$HOME/.config/pocketvibe/android-release.keystore}
[ -f "$POCKETVIBE_KEYSTORE" ] || { echo "No release key at $POCKETVIBE_KEYSTORE"; exit 1; }
POCKETVIBE_KEYSTORE_PASSWORD=${POCKETVIBE_KEYSTORE_PASSWORD:-$(security find-generic-password -s pocketvibe-android-keystore -w)}
export POCKETVIBE_KEYSTORE_PASSWORD

# The games a new install starts with go into the APK (see build.gradle.kts).
POCKETVIBE_BUNDLED=$(mktemp -d)
trap 'rm -rf "$POCKETVIBE_BUNDLED"' EXIT
python3 "$REPO/tools/bundled-games.py" "$POCKETVIBE_BUNDLED"
export POCKETVIBE_BUNDLED

(cd "$ANDROID" && ./gradlew --quiet clean assembleRelease)
OUT="$ANDROID/build/dist"
APK="$OUT/PocketVibe-$VERSION.apk"
mkdir -p "$OUT"
cp "$ANDROID/app/build/outputs/apk/release/app-release.apk" "$APK"
SHA=$(shasum -a 256 "$APK" | cut -d' ' -f1)
echo "$APK"
echo "sha256: $SHA"

if [ "$1" = "--publish" ]; then
  [ -n "$NOTES_FILE" ] && NOTES=$(cat "$NOTES_FILE")
  gh release create "android-v$VERSION" "$APK" --repo cobanov/pocketvibe \
    --target "$(git -C "$REPO" rev-parse HEAD)" --latest=false \
    --title "PocketVibe $VERSION for Android" \
    --notes "${NOTES:-PocketVibe $VERSION for Android}

sha256: $SHA"
fi
