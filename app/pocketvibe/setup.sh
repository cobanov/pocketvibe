#!/bin/sh
# First-run setup: downloads and installs PocketVibe's browser runtime (WPE
# WebKit in a small Debian root) into the folder config.json names, under
# /storage/pocketvibe. A new runtime version gets a new folder, and the old
# one stays for the app version before it.
# PocketVibe.sh runs it in a full-screen terminal; it draws with dialog.

HOME_DIR=/storage/pocketvibe
APP="$HOME_DIR/app"
DOWNLOAD="$HOME_DIR/.runtime.tar.xz"
STAGING="$HOME_DIR/.runtime-new"
TITLE="PocketVibe"
# dialog needs terminfo, and ROCKNIX only has it for xterm.
export TERM=xterm
export DIALOGRC="$APP/setup.dialogrc"

setting() {
  python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['runtime'][sys.argv[2]])" "$APP/config.json" "$1"
}
RUNTIME="$HOME_DIR/$(setting dir)"
URL=$(setting url)
SHA=$(setting sha256)
SIZE_MB=$(setting size_mb)

# A message that stays up while the next step runs. dialog shows the
# terminal's cursor again when it ends, so hide it each time.
say() {
  dialog --title "$TITLE" --infobox "$1" "$2" 50
  printf '\033[?25l'
}

fail() {
  # A countdown that closes by itself: the handheld has no keyboard to press OK.
  dialog --title "$TITLE" --pause "$1" 12 50 20
  rm -rf "$DOWNLOAD" "$STAGING"
  exit 1
}

say "\nGetting PocketVibe ready..." 5

if ! curl -s -m 8 -o /dev/null https://github.com; then
  fail "PocketVibe downloads its game engine (about $SIZE_MB MB) the first time it starts.\n\nConnect to Wi-Fi in the system settings, then open PocketVibe again."
fi

# Download, printing whole percents for the progress bar. If the bar goes
# away, the download carries on without it.
python3 - "$URL" "$DOWNLOAD" <<'EOF' | dialog --title "$TITLE" --gauge "\nDownloading the game engine (about $SIZE_MB MB).\nThis happens only once." 10 50 0
import os, sys, urllib.request
url, target = sys.argv[1:3]
request = urllib.request.Request(url, headers={'User-Agent': 'PocketVibe-setup'})
with urllib.request.urlopen(request, timeout=30) as response, open(target, 'wb') as out:
    total = int(response.headers.get('Content-Length') or 0)
    done, shown = 0, -1
    while chunk := response.read(1 << 16):
        out.write(chunk)
        done += len(chunk)
        percent = done * 100 // total if total else 0
        if percent != shown and shown != 101:
            try:
                print(percent, flush=True)
                shown = percent
            except BrokenPipeError:
                sys.stdout = open(os.devnull, 'w')
                shown = 101
EOF

[ -s "$DOWNLOAD" ] || fail "The download did not finish.\n\nCheck the Wi-Fi connection and open PocketVibe again."
say "\nChecking the download..." 5
[ "$(sha256sum "$DOWNLOAD" | cut -d' ' -f1)" = "$SHA" ] || fail "The download is damaged.\n\nOpen PocketVibe again to retry."

say "\nInstalling the game engine.\nThis takes a minute or two..." 7
rm -rf "$STAGING"
mkdir -p "$STAGING"
tar -xJf "$DOWNLOAD" -C "$STAGING" || fail "Installing failed. There may not be enough free space on the card."
# Never delete through a mount: an old test setup could have bound /dev or
# /proc inside, and rm would follow it into the system's own files.
if awk -v dir="$RUNTIME" '$2 == dir || index($2, dir "/") == 1 { found = 1 } END { exit !found }' /proc/mounts; then
  fail "Something is mounted inside $RUNTIME.\n\nRestart the handheld and open PocketVibe again."
fi
rm -rf "$RUNTIME"
mv "$STAGING" "$RUNTIME"
rm -f "$DOWNLOAD"

say "\nReady. Starting PocketVibe..." 5
sleep 1
