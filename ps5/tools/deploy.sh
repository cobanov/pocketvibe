#!/bin/bash
# Installs an app folder (eboot.bin, sce_sys/, sce_module/, ...) on the PS5 and
# launches it: closes the running copy, uploads to /data/hb-staging, checks
# every size against the console's own stat, moves the files into
# /data/homebrew/<TITLE>, waits for ShadowMount to register the title, then
# launches it while saving the kernel log.
# Usage: deploy.sh <app-folder> [ps5-host]   (only system curl and nc: macOS's
# local-network permission blocks Homebrew tools). The app's log, if it writes
# one to /data/pocketvibe-dev/app.log, is printed at the end.
set -euo pipefail

app=${1:?app folder}
[ -f "$app/eboot.bin" ] || { echo "no eboot.bin in $app"; exit 1; }
host=${2:-${PS5_HOST:-192.168.8.53}}
title=$(basename "$app")
ftp=ftp://$host:2121
here=$(cd "$(dirname "$0")" && pwd)
ctl=${PVCTL_DIR:-$HOME/Developer/ps5-homebrew/work/ctl}
logdir=${LOG_DIR:-$HOME/Developer/ps5-homebrew/logs}
mkdir -p "$logdir"

shell() { { printf '%s\n' "$@"; sleep 3; printf 'exit\n'; } | nc -w 8 "$host" 2323 | tr -d '\r'; }

close_app() { # loads the close payload through shsrv's hbldr (port 9021 ignored payloads)
  local elf=$ctl/close-$title.elf
  [ -f "$elf" ] || "$PS5_PAYLOAD_SDK/bin/prospero-clang" -O2 -DCLOSE "-DTITLE_ID=\"$title\"" \
    -o "$elf" "$here/pvctl.c" -lSceSystemService -lSceUserService
  curl -sS --ftp-create-dirs -T "$elf" "$ftp/data/pocketvibe-dev/close-$title.elf"
  shell "hbldr /data/pocketvibe-dev/close-$title.elf" >/dev/null
}

echo "== close"
close_app
sleep 2

echo "== upload to /data/hb-staging/$title"
files=$(cd "$app" && find . -type f | sed 's|^\./||' | sort)
for f in $files; do
  curl -sS --ftp-create-dirs -T "$app/$f" "$ftp/data/hb-staging/$title/$f"
done

echo "== verify sizes"
stats=$(shell "$(for f in $files; do echo "stat /data/hb-staging/$title/$f"; done)")
for f in $files; do
  want=$(stat -f %z "$app/$f")
  got=$(awk -v n="/data/hb-staging/$title/$f" '/filename: /{cur=$NF} $1=="size:" && cur==n {print $2}' <<<"$stats")
  [ "$want" = "$got" ] || { echo "SIZE MISMATCH $f: local $want, console ${got:-missing}"; exit 1; }
done
echo "all $(wc -w <<<"$files" | tr -d ' ') files match"

echo "== move into /data/homebrew/$title"
curl -sS -Q "*MKD /data/homebrew/$title" "$ftp/" >/dev/null
for d in $(for f in $files; do dirname "$f"; done | grep -v '^\.$' | sort -u); do
  curl -sS -Q "*MKD /data/homebrew/$title/$d" "$ftp/" >/dev/null
done
for f in $files; do
  curl -sS -Q "RNFR /data/hb-staging/$title/$f" -Q "RNTO /data/homebrew/$title/$f" "$ftp/" >/dev/null
done

echo "== wait for ShadowMount"
for _ in $(seq 30); do
  curl -s "$ftp/user/app/$title/" >/dev/null 2>&1 && break
  sleep 2
done
curl -s "$ftp/user/app/$title/" >/dev/null || { echo "not registered after 60 s"; exit 1; }

log=$logdir/klog-$title-$(date +%Y%m%d-%H%M%S).txt
echo "== launch (kernel log: $log)"
nc "$host" 3232 >"$log" &
klog=$!
sleep 1
shell "launch $title" | grep -av "^Welcome\|^Model\|^S/N\|^S/W\|temp:\|freq:\|^Type\|^$" || true
sleep "${WATCH:-15}"
kill $klog 2>/dev/null || true
grep -aiE 'crash|exception|fault|signal|kill|0x80[0-9a-f]{6}|eboot|'"$title" "$log" | tail -25 || true
echo "== app log"
curl -s "$ftp/data/pocketvibe-dev/app.log" | tail -40
