#!/bin/sh
# On the handheld: builds PocketVibe's runtime from scratch, a Debian root
# with WPE WebKit and Mesa, into a new folder.
#
#   build-runtime.sh <dir>
#
# Version 2 is Debian forky: WPE WebKit 2.54 with its MiniBrowser, and Mesa
# 26, whose Panfrost driver draws geometry 10 to 18 times faster than the
# Mesa 25.0 of version 1 (bench/results/2026-10-08-limits.md). From the
# computer, tools/pack-runtime.sh packs the folder for a release.
#
# It starts from the debian:forky-slim image on Docker Hub and installs the
# packages through runtime.py, which needs PocketVibe installed in
# /storage/pocketvibe/app.
set -e

ROOT=${1:?usage: build-runtime.sh <dir>}
SUITE=forky
VERSION=2
PACKAGES="libwpewebkit-2.0-1 libwpebackend-fdo-1.0-1 mesa-libgallium libegl-mesa0 libgbm1 libgl1-mesa-dri libgles2
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-pulseaudio
  fonts-dejavu-core ca-certificates"
RUNTIME_PY=/storage/pocketvibe/app/runtime.py

[ -e "$ROOT" ] && { echo "$ROOT already exists."; exit 1; }
mkdir -p "$ROOT"

# The image's single layer, straight from Docker Hub (as debian-chroot.sh).
python3 - "$ROOT.tar.gz" "$SUITE-slim" <<'EOF'
import json, sys, urllib.error, urllib.request
repo, tag = 'library/debian', sys.argv[2]
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
print(f'debian:{tag} {layer["digest"]} ({layer["size"] // 1024} KiB)')
EOF
tar -xzf "$ROOT.tar.gz" -C "$ROOT"
rm "$ROOT.tar.gz"

python3 "$RUNTIME_PY" --root "$ROOT" -- sh -c "
  set -e
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $(echo $PACKAGES)
  apt-get clean
  rm -rf /var/lib/apt/lists/* /var/cache/debconf/*-old /var/log/*.log
"
echo "$VERSION" > "$ROOT/etc/pocketvibe-runtime"
du -sh "$ROOT"
echo "Runtime $VERSION is in $ROOT."
