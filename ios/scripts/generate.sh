#!/bin/sh
# Generates PocketVibe.xcodeproj from project.yml. The version is the handheld
# app's (app/pocketvibe/config.json), so every PocketVibe ships as the same
# version; the build number counts the repository's commits, so it only grows.
set -e
IOS=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(dirname "$IOS")
POCKETVIBE_VERSION=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['version'])" "$REPO/app/pocketvibe/config.json")
POCKETVIBE_BUILD=$(git -C "$REPO" rev-list --count HEAD)
export POCKETVIBE_VERSION POCKETVIBE_BUILD
cd "$IOS" && xcodegen generate --quiet
echo "PocketVibe $POCKETVIBE_VERSION ($POCKETVIBE_BUILD)"
