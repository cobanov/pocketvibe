#!/bin/sh
# One-command build of the LG webOS app. Needs: node + npm, python3.
#   ./webos/build.sh                 -> webos/dist/com.pocketvibe.app_<version>_all.ipk
#   ./webos/build.sh --games-dir DIR -> bundle <id>.zip files from DIR instead of downloading them from the store
set -e
cd "$(dirname "$0")"
export ESBUILD_VERSION="${ESBUILD_VERSION:-0.28.2}"
NODE_DIR="$PWD/build/node"
if [ ! -x "$NODE_DIR/node_modules/.bin/esbuild" ] || [ ! -x "$NODE_DIR/node_modules/.bin/ares-package" ]; then
  mkdir -p "$NODE_DIR"
  npm install --silent --no-audit --no-fund --prefix "$NODE_DIR" "esbuild@$ESBUILD_VERSION" @webos-tools/cli
fi
export ESBUILD="$NODE_DIR/node_modules/.bin/esbuild" ARES="$NODE_DIR/node_modules/.bin/ares-package"
exec python3 tools/build.py "$@"
