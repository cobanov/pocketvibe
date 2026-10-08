#!/bin/sh
# First-run setup: downloads and installs PocketVibe's browser runtime (WPE
# WebKit in a small Debian root) into /storage/pocketvibe/runtime.
# PocketVibe.sh runs it in a full-screen terminal; it draws with dialog.
#
# The download comes from pocketvibe.cobanov.dev (which points at the GitHub
# release, so where it is hosted can change without a new app), or straight
# from GitHub if that does not answer. A download cut off by the Wi-Fi or by
# closing the app goes on from where it stopped, also on the next start.

HOME_DIR=/storage/pocketvibe
APP="$HOME_DIR/app"
RUNTIME="$HOME_DIR/runtime"
DOWNLOAD="$HOME_DIR/.runtime.tar.xz"
STAGING="$HOME_DIR/.runtime-new"
TITLE="PocketVibe"
# dialog needs terminfo, and ROCKNIX only has it for xterm.
export TERM=xterm
export DIALOGRC="$APP/setup.dialogrc"

setting() {
  python3 -c "import json,sys; v=json.load(open(sys.argv[1]))['runtime'].get(sys.argv[2], ''); print(' '.join(v) if isinstance(v, list) else v)" "$APP/config.json" "$1"
}
URLS=$(setting urls)
[ -n "$URLS" ] || URLS=$(setting url)
SHA=$(setting sha256)
SIZE_MB=$(setting size_mb)
UNPACKED_MB=$(setting unpacked_mb)
[ -n "$UNPACKED_MB" ] || UNPACKED_MB=700

# A message that stays up while the next step runs. dialog shows the
# terminal's cursor again when it ends, so hide it each time.
say() {
  dialog --title "$TITLE" --infobox "$1" "$2" 50
  printf '\033[?25l'
}

# A message that closes by itself after a countdown: the handheld has no
# keyboard to press OK. What was downloaded is kept for the next try.
fail() {
  dialog --title "$TITLE" --pause "$1" 13 50 25
  rm -rf "$STAGING"
  exit 1
}

say "\nGetting PocketVibe ready..." 5

# Room for the download and the unpacked engine (a part already downloaded
# counts as done).
HAVE_MB=$(( $( [ -f "$DOWNLOAD" ] && wc -c < "$DOWNLOAD" || echo 0 ) / 1048576 ))
NEED_MB=$(( SIZE_MB - HAVE_MB + UNPACKED_MB + 50 ))
FREE_MB=$(df -m "$HOME_DIR" 2>/dev/null | awk 'NR == 2 { print $4 }')
if [ -n "$FREE_MB" ] && [ "$FREE_MB" -lt "$NEED_MB" ]; then
  fail "PocketVibe needs about $NEED_MB MB free on the SD card to install its game engine, and there are $FREE_MB MB.\n\nDelete something you don't need, then open PocketVibe again."
fi

online=no
for url in $URLS; do
  host=$(echo "$url" | cut -d/ -f1-3)
  if curl -s -m 8 -o /dev/null "$host"; then online=yes; break; fi
done
if [ $online = no ]; then
  fail "PocketVibe downloads its game engine (about $SIZE_MB MB) the first time it starts.\n\nConnect to Wi-Fi in the system settings, then open PocketVibe again."
fi

# Download, feeding dialog's gauge its percent and a line on how far it is.
# Each address is tried in turn, a few times, going on from where the last
# try stopped. If the gauge goes away, the download carries on without it.
python3 - "$DOWNLOAD" $URLS <<'EOF' | dialog --title "$TITLE" --gauge "\nDownloading the game engine..." 12 50 0
import os, sys, time, urllib.error, urllib.request
target, urls = sys.argv[1], sys.argv[2:]
gauge = True

def show(percent, text):
    global gauge
    if not gauge:
        return
    try:
        print(f'XXX\n{percent}\n\\nDownloading the game engine.\\nThis happens only once.\\n\\n{text}\nXXX', flush=True)
    except BrokenPipeError:
        sys.stdout = open(os.devnull, 'w')
        gauge = False

def fetch(url):
    have = os.path.getsize(target) if os.path.exists(target) else 0
    headers = {'User-Agent': 'PocketVibe-setup'}
    if have:
        headers['Range'] = f'bytes={have}-'
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
        if r.status != 206:
            have = 0  # the server sent the whole file
        total = have + int(r.headers.get('Content-Length') or 0)
        done, start, shown = have, time.monotonic(), None
        with open(target, 'ab' if have else 'wb') as out:
            while chunk := r.read(1 << 16):
                out.write(chunk)
                done += len(chunk)
                mb = done // 1000000
                if total and mb != shown:
                    shown = mb
                    rate = (done - have) / max(time.monotonic() - start, 0.5)
                    left = (total - done) / rate if rate > 0 else 0
                    eta = 'Less than a minute left' if left < 60 else f'About {round(left / 60)} min left'
                    show(done * 100 // total, f'{mb} of {total // 1000000} MB at {rate / 1e6:.1f} MB/s\\n{eta}')
        return total and done >= total

for attempt in range(5):
    for url in urls:
        try:
            if fetch(url):
                sys.exit(0)
        except urllib.error.HTTPError as e:
            if e.code == 416:  # asked for bytes past the end: it is all here
                sys.exit(0)
        except Exception:
            pass
    show(0, 'The connection dropped. Trying again...')
    time.sleep(3 + attempt * 3)
sys.exit(1)
EOF

[ -s "$DOWNLOAD" ] || fail "The download did not finish.\n\nCheck the Wi-Fi connection and open PocketVibe again. It goes on from where it stopped."
say "\nChecking the download..." 5
if [ "$(sha256sum "$DOWNLOAD" | cut -d' ' -f1)" != "$SHA" ]; then
  # A part that never finished looks the same as a damaged file here; open
  # again to finish it, or to start over if it was damaged.
  if [ "$(wc -c < "$DOWNLOAD")" -ge $(( SIZE_MB * 1048576 )) ]; then rm -f "$DOWNLOAD"; fi
  fail "The download did not finish or is damaged.\n\nOpen PocketVibe again to go on."
fi

rm -rf "$STAGING"
mkdir -p "$STAGING"
# Unpack, feeding tar the archive while the gauge shows how much is done:
# tar takes it only as fast as it can unpack it, so the bar follows the work.
python3 - "$DOWNLOAD" "$STAGING" <<'EOF' | dialog --title "$TITLE" --gauge "\nInstalling the game engine..." 12 50 0
import os, subprocess, sys, time
source, staging = sys.argv[1:3]
total = os.path.getsize(source)
tar = subprocess.Popen(['tar', '-xJf', '-', '-C', staging], stdin=subprocess.PIPE)
gauge = True
done, start, shown = 0, time.monotonic(), -1
try:
    with open(source, 'rb') as f:
        while chunk := f.read(1 << 18):
            tar.stdin.write(chunk)
            done += len(chunk)
            percent = done * 100 // total
            if percent != shown and gauge:
                shown = percent
                elapsed = time.monotonic() - start
                left = elapsed * (total - done) / done if done else 0
                eta = 'Less than a minute left' if left < 60 else f'About {round(left / 60)} min left'
                try:
                    print(f'XXX\n{percent}\n\\nInstalling the game engine on the SD card.\\n\\n{eta}\nXXX', flush=True)
                except BrokenPipeError:
                    sys.stdout = open(os.devnull, 'w')
                    gauge = False
    tar.stdin.close()
except BrokenPipeError:
    pass  # tar stopped early; its exit status says why
if tar.wait() == 0:
    open(os.path.join(staging, '.unpacked'), 'w').close()  # the pipe to dialog hides the exit status
EOF
[ -e "$STAGING/.unpacked" ] && rm -f "$STAGING/.unpacked" || fail "Installing failed. The SD card may be full: PocketVibe needs about $UNPACKED_MB MB for its game engine.\n\nFree some space and open PocketVibe again."
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
