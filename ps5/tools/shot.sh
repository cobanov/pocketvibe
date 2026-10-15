#!/bin/bash
# Takes a screenshot of the running dev app: asks for one through
# /data/pocketvibe-dev/shot-request, fetches shot.rgba and writes a PNG.
# Usage: shot.sh <out.png> [ps5-host]
set -euo pipefail
out=${1:?out.png}
host=${2:-${PS5_HOST:-192.168.8.53}}
dev=ftp://$host:2121/data/pocketvibe-dev
tmp=$(mktemp -d)
date +%s > "$tmp/req"
curl -sS -T "$tmp/req" "$dev/shot-request"
sleep 2
curl -sS -o "$tmp/shot.rgba" "$dev/shot.rgba"
/usr/bin/python3 -I - "$tmp/shot.rgba" "$out" <<'PY'
import struct, sys, zlib
data = open(sys.argv[1], 'rb').read()
w, h = 1920, len(data) // (1920 * 4)
rows = [data[(h - 1 - y) * w * 4:(h - y) * w * 4] for y in range(h)]  # GL rows start at the bottom
raw = b''.join(b'\x00' + r for r in rows)
chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[2], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))
PY
rm -rf "$tmp"
echo "$out"
