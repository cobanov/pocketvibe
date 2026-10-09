#!/bin/sh
# Builds PocketVibe for the App Store and uploads it to TestFlight, signed
# with an App Store Connect API key (no Apple ID or 2FA).
#
#   ASC_KEY_ID=... ASC_ISSUER_ID=... APPLE_TEAM_ID=... sh ios/scripts/testflight.sh
#   ... sh ios/scripts/testflight.sh --no-upload    # stop at the .ipa
#
# Signing is manual: the Apple Distribution certificate ASC_SIGNING_CERT
# (SHA-1) and the "PocketVibe App Store" profile (swift scripts/asc.swift
# profile <sha1> makes it). SIGNING_KEYCHAIN, with its password in
# SIGNING_KEYCHAIN_PASSWORD_FILE, is unlocked first, so this also works
# where no one can type the login keychain's password (SSH, an agent).
#
# The build number counts the repository's commits (scripts/generate.sh), and
# App Store Connect takes each number once: commit before uploading again.
set -e

IOS=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(dirname "$IOS")
: "${ASC_KEY_ID:?set ASC_KEY_ID}" "${ASC_ISSUER_ID:?set ASC_ISSUER_ID}" "${APPLE_TEAM_ID:?set APPLE_TEAM_ID}"
CERT=${ASC_SIGNING_CERT:-2632468CDF18C5FAFC4A6C2CC26EC610EAE84922}
KEYCHAIN=${SIGNING_KEYCHAIN:-$HOME/Library/Keychains/cobanov-signing.keychain-db}
KEYCHAIN_PASSWORD_FILE=${SIGNING_KEYCHAIN_PASSWORD_FILE:-$HOME/.cobanov-signing/.kcpass}
BUILD="$IOS/build"
ARCHIVE="$BUILD/PocketVibe.xcarchive"
EXPORT="$BUILD/export"

[ -f "$KEYCHAIN_PASSWORD_FILE" ] && security unlock-keychain -p "$(cat "$KEYCHAIN_PASSWORD_FILE")" "$KEYCHAIN"

# The games a new install starts with go into the app (see copy-web.sh).
rm -rf "$BUILD/bundled" "$ARCHIVE" "$EXPORT"
mkdir -p "$BUILD/bundled"
python3 "$REPO/tools/bundled-games.py" "$BUILD/bundled"

sh "$IOS/scripts/generate.sh"
xcodebuild archive -quiet \
  -project "$IOS/PocketVibe.xcodeproj" -scheme PocketVibe -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  CODE_SIGN_IDENTITY="$CERT" OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" COMPILER_INDEX_STORE_ENABLE=NO

cat > "$BUILD/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>$APPLE_TEAM_ID</string>
  <key>signingStyle</key><string>manual</string>
  <key>signingCertificate</key><string>$CERT</string>
  <key>provisioningProfiles</key>
  <dict><key>dev.cobanov.pocketvibe</key><string>PocketVibe App Store</string></dict>
  <key>destination</key><string>export</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
EOF
# No API key here: with one, export takes the cloud signing path, which this key may not be allowed.
xcodebuild -exportArchive -quiet -archivePath "$ARCHIVE" -exportPath "$EXPORT" -exportOptionsPlist "$BUILD/ExportOptions.plist"
IPA="$EXPORT/PocketVibe.ipa"

# What testers would get: the version, and the launcher and games inside.
CHECK=$(mktemp -d)
trap 'rm -rf "$CHECK"' EXIT
unzip -q "$IPA" -d "$CHECK"
APP="$CHECK/Payload/PocketVibe.app"
[ -f "$APP/web/launcher/index.html" ] || { echo "the launcher is not in the app"; exit 1; }
echo "$(ls "$APP/web/bundled" | wc -l | tr -d ' ') bundled games"
echo "PocketVibe $(plutil -extract CFBundleShortVersionString raw "$APP/Info.plist") ($(plutil -extract CFBundleVersion raw "$APP/Info.plist")): $IPA"

[ "$1" = "--no-upload" ] && exit 0
xcrun altool --upload-app -f "$IPA" -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
echo "Uploaded. It shows in TestFlight once App Store Connect has processed it (a few minutes)."
