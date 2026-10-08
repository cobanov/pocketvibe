#!/bin/sh
# Debian arm64 environment on the handheld, from the feasibility test. It is
# where PocketVibe's runtime (WPE WebKit + Cog) was built; the app itself runs
# the runtime with app/pocketvibe/runtime.py, not with this chroot.
# It lives in /storage/debian and never touches ROCKNIX's own system.
# Unmount when done: never delete /storage/debian while /dev is bound inside.
#
#   debian-chroot.sh fetch          download Debian (trixie, arm64) into /storage/debian
#   debian-chroot.sh mount          bind /dev, /proc, /sys and the Wayland/Pulse runtime dir
#   debian-chroot.sh run CMD...     run a command inside, with the session's Wayland env
#   debian-chroot.sh umount         undo the bind mounts
#   debian-chroot.sh remove         unmount and delete /storage/debian
set -e

ROOT=/storage/debian
# The session's runtime dir holds the Wayland, Sway and PulseAudio sockets.
RUNTIME=/run/0-runtime-dir
# Inside Debian, /var/run is a symlink to /run. Bind mounts must target real
# paths under $ROOT, so the runtime dir is mounted at $ROOT/run/....
RUNTIME_IN_ROOT="$ROOT/run/0-runtime-dir"

fetch() {
  mkdir -p "$ROOT"
  # Pull the debian:trixie-slim arm64 image layer straight from Docker Hub.
  python3 - "$ROOT.tar.gz" <<'EOF'
import json, sys, urllib.error, urllib.request

repo, tag = 'library/debian', 'trixie-slim'
token = json.load(urllib.request.urlopen(
    f'https://auth.docker.io/token?service=registry.docker.io&scope=repository:{repo}:pull'))['token']

def get(url, accept=None):
    headers = {'Authorization': f'Bearer {token}'}
    if accept:
        headers['Accept'] = accept
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers))

index = json.load(get(f'https://registry-1.docker.io/v2/{repo}/manifests/{tag}',
    'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json'))
entry = next(m for m in index['manifests'] if m['platform']['architecture'] == 'arm64')
manifest = json.load(get(f'https://registry-1.docker.io/v2/{repo}/manifests/{entry["digest"]}', entry['mediaType']))
layer = manifest['layers'][0]

# Blobs redirect to a CDN that must not receive the registry token.
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

request = urllib.request.Request(f'https://registry-1.docker.io/v2/{repo}/blobs/{layer["digest"]}',
                                 headers={'Authorization': f'Bearer {token}'})
try:
    response = urllib.request.build_opener(NoRedirect).open(request)
except urllib.error.HTTPError as e:
    if e.code not in (301, 302, 303, 307, 308):
        raise
    response = urllib.request.urlopen(e.headers['Location'])

with response, open(sys.argv[1], 'wb') as out:
    while chunk := response.read(1 << 20):
        out.write(chunk)
print(f'downloaded {layer["digest"]} ({layer["size"] // 1024} KiB)')
EOF
  tar -xzf "$ROOT.tar.gz" -C "$ROOT"
  rm "$ROOT.tar.gz"
  echo "Debian is in $ROOT"
}

is_mounted() {
  grep -q " $1 " /proc/mounts
}

do_mount() {
  for dir in dev dev/pts proc sys; do
    mkdir -p "$ROOT/$dir"
  done
  mkdir -p "$RUNTIME_IN_ROOT"
  # WebKit's sandbox (bubblewrap) needs / to be a mount point inside the
  # chroot, so bind the root onto itself first; the other mounts go on top.
  is_mounted "$ROOT" || mount --bind "$ROOT" "$ROOT"
  is_mounted "$ROOT/dev" || mount --bind /dev "$ROOT/dev"
  is_mounted "$ROOT/dev/pts" || mount --bind /dev/pts "$ROOT/dev/pts"
  is_mounted "$ROOT/proc" || mount -t proc proc "$ROOT/proc"
  is_mounted "$ROOT/sys" || mount --bind /sys "$ROOT/sys"
  is_mounted "$RUNTIME_IN_ROOT" || mount --bind "$RUNTIME" "$RUNTIME_IN_ROOT"
  # udev's database lets libmanette (WebKit's Gamepad API) find the gamepad.
  mkdir -p "$ROOT/run/udev"
  is_mounted "$ROOT/run/udev" || mount --bind /run/udev "$ROOT/run/udev"
  cp /etc/resolv.conf "$ROOT/etc/resolv.conf"
}

do_umount() {
  for dir in "$ROOT/run/udev" "$RUNTIME_IN_ROOT" "$ROOT/sys" "$ROOT/proc" "$ROOT/dev/pts" "$ROOT/dev" "$ROOT"; do
    if is_mounted "$dir"; then umount "$dir"; fi
  done
}

run() {
  do_mount
  trap do_umount EXIT
  chroot "$ROOT" /usr/bin/env -i \
    HOME=/root \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
    LANG=C.UTF-8 \
    WAYLAND_DISPLAY=wayland-1 \
    XDG_RUNTIME_DIR="$RUNTIME" \
    PULSE_SERVER="unix:$RUNTIME/pulse/native" \
    DBUS_SESSION_BUS_ADDRESS="unix:path=$RUNTIME/bus" \
    "$@"
}

case "$1" in
  fetch) fetch ;;
  mount) do_mount ;;
  run) shift; run "$@" ;;
  umount) do_umount ;;
  remove) do_umount; rm -rf "$ROOT" ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
