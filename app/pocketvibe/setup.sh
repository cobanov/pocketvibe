#!/bin/sh
# First-run setup: downloads and installs PocketVibe's browser runtime (WPE
# WebKit in a small Debian root) into /storage/pocketvibe/runtime.
# PocketVibe.sh runs it in a full-screen terminal; it draws with dialog.

HOME_DIR=/storage/pocketvibe
APP="$HOME_DIR/app"
RUNTIME="$HOME_DIR/runtime"
DOWNLOAD="$HOME_DIR/.runtime.tar.xz"
STAGING="$HOME_DIR/.runtime-new"
TITLE="PocketVibe"

setting() {
  python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['runtime'][sys.argv[2]])" "$APP/config.json" "$1"
}
URL=$(setting url)
SHA=$(setting sha256)
SIZE_MB=$(setting size_mb)

fail() {
  dialog --title "$TITLE" --msgbox "$1" 10 60
  rm -rf "$DOWNLOAD" "$STAGING"
  exit 1
}

dialog --title "$TITLE" --infobox "Getting PocketVibe ready..." 5 50

if ! curl -s -m 8 -o /dev/null https://github.com; then
  fail "PocketVibe downloads its game engine (about $SIZE_MB MB) the first time it starts.\n\nConnect to Wi-Fi in the system settings, then open PocketVibe again."
fi

# Download, printing whole percents for the progress bar.
python3 - "$URL" "$DOWNLOAD" <<'EOF' | dialog --title "$TITLE" --gauge "\nDownloading the game engine (about $SIZE_MB MB).\nThis happens only once." 10 60 0
import sys, urllib.request
url, target = sys.argv[1:3]
request = urllib.request.Request(url, headers={'User-Agent': 'PocketVibe-setup'})
with urllib.request.urlopen(request, timeout=30) as response, open(target, 'wb') as out:
    total = int(response.headers.get('Content-Length') or 0)
    done, shown = 0, -1
    while chunk := response.read(1 << 16):
        out.write(chunk)
        done += len(chunk)
        percent = done * 100 // total if total else 0
        if percent != shown:
            print(percent, flush=True)
            shown = percent
EOF

[ -s "$DOWNLOAD" ] || fail "The download did not finish.\n\nCheck the Wi-Fi connection and open PocketVibe again."
dialog --title "$TITLE" --infobox "Checking the download..." 5 50
[ "$(sha256sum "$DOWNLOAD" | cut -d' ' -f1)" = "$SHA" ] || fail "The download is damaged.\n\nOpen PocketVibe again to retry."

dialog --title "$TITLE" --infobox "\nInstalling the game engine.\nThis takes a minute or two..." 7 50
rm -rf "$STAGING"
mkdir -p "$STAGING"
tar -xJf "$DOWNLOAD" -C "$STAGING" || fail "Installing failed. There may not be enough free space on the card."
rm -rf "$RUNTIME"
mv "$STAGING" "$RUNTIME"
rm -f "$DOWNLOAD"

dialog --title "$TITLE" --infobox "Ready. Starting PocketVibe..." 5 50
sleep 1
