#!/bin/bash
# Builds the PocketVibe PS5 title folder: ps5/app/main.c, QuickJS and the
# runtime scripts, linked with ps5-opengl into a native title the way
# ps5-opengl's own tools/build-native-test-app.sh assembles its test app.
#
# Runs on the Mac and builds inside an x86-64 Ubuntu container (clang-18 and
# its x86-64 compiler-rt), with these dependencies under $DEPS:
#   boilerplate/            ps5-native-app-boilerplate at the commit ps5-opengl pins
#   ps5-opengl-src/         ps5-opengl source at the SDK's tag (native-app glue)
#   ps5-opengl-sdk-1.0.2/   the prebuilt SDK release
# Usage: build-app.sh <games-dir> [title-id]  -> $WORK/app/dist/<title-id>
# <games-dir> is PocketVibe's games/; each game's built dist/assets/index-*.js
# is packaged as games/<name>.js and listed in games.txt.
set -euo pipefail

games=$(cd "$1" && pwd)
title=${2:-PPSA90550}
ps5=$(cd "$(dirname "$0")/.." && pwd)
deps=${DEPS:-$HOME/Developer/ps5-homebrew/deps}
work=${WORK:-$HOME/Developer/ps5-homebrew/work}
mkdir -p "$work"

docker run --rm --platform linux/amd64 -v "$ps5:/ps5:ro" -v "$deps:/deps:ro" -v "$work:/work" \
  -v "$games:/games:ro" -v "$games/../app/pocketvibe/launcher:/launcher:ro" -e TITLE="$title" ps5-build-amd64 bash -euo pipefail -c '
template=/deps/boilerplate
gl=/deps/ps5-opengl-src
prefix=/deps/ps5-opengl-sdk-1.0.2/sdk
app=/work/app
rm -rf "$app" && mkdir -p "$app"

cp "$template/Makefile" "$app/Makefile"
for d in assets runtime sce_sys tooling tools; do mkdir -p "$app/$d" && cp -a "$template/$d/." "$app/$d/"; done
mkdir -p "$app/.deps" && cp -a "$template/.deps/native" "$app/.deps/native"
sdk="$app/.deps/native/ps5-payload-sdk"

# The same changes ps5-opengl makes to the template: a 256 MiB libc heap
# entry, malloc wrapped by its app heap, its link script and symbol map.
sed -i "s/write_u64(result.data, result.heap_size, std::numeric_limits<std::uint64_t>::max());/write_u64(result.data, result.heap_size, 0x10000000ULL);/" \
  "$app/tooling/native/sce_module_writer.cpp"
sed -i "s/--eh-frame-hdr \\\\/--eh-frame-hdr --wrap=malloc --wrap=calloc --wrap=realloc --wrap=free --wrap=posix_memalign --wrap=malloc_usable_size \\\\/" \
  "$app/tools/build.sh"
grep -q -- "--wrap=malloc " "$app/tools/build.sh"
cp "$template/tooling/native/ps5-pie.ld" "$app/tooling/native/ps5-pie-base.ld"
cp "$gl/native-app/ps5-pie.ld" "$gl/native-app/app-symbols.map" "$app/tooling/native/"

rm -rf "$app/src" && mkdir -p "$app/src" "$app/include" "$app/vendor" "$app/build/pv"
cp "$gl/native-app/runtime_shims.c" "$gl/native-app/app_heap.c" "$app/src/"
cp -a "$prefix/include/." "$app/include/"

# Identity: ps5-opengl'"'"'s param.json (it carries the memory settings GL needs).
python3 - "$gl/native-app/param.json" "$app/sce_sys/param.json" "$TITLE" <<PY
import json, sys
p = json.load(open(sys.argv[1]))
t = sys.argv[3]
p["titleId"] = t
p["conceptId"] = t[4:]
p["contentId"] = f"UP9000-{t}_00-POCKETVIBEDEV001"
p["localizedParameters"]["en-US"]["titleName"] = "PocketVibe Dev"
json.dump(p, open(sys.argv[2], "w"), indent=2)
PY

# Our code: the host and QuickJS, compiled for the PS5 and linked in a group
# with ps5-opengl and the C++ runtime it needs.
q=/ps5/third_party/quickjs-0.17.0
cc() { PS5_PAYLOAD_SDK="$sdk" sh "$app/tooling/prospero-clang18" -std=gnu11 -O2 -w -D_GNU_SOURCE \
  -DGL_GLEXT_PROTOTYPES=1 -ffunction-sections -fdata-sections -I"$app/include" -I"$q" -I/ps5/third_party "$@"; }
objects=()
for f in /ps5/app/main.c /ps5/app/text.c /ps5/app/files.c $q/quickjs.c $q/libregexp.c $q/libunicode.c $q/dtoa.c; do
  o="$app/build/pv/$(basename "${f%.c}").o"
  cc -c "$f" -o "$o" &
  objects+=("$o")
done
wait
builtins=$(clang-18 --print-resource-dir)/lib/linux/libclang_rt.builtins-x86_64.a
{
  printf "SEARCH_DIR(\"%s\")\nSEARCH_DIR(\"%s\")\nEXTERN(ps5_agc_gate2_run)\nGROUP (\n" "$sdk/target/lib" "$prefix/lib"
  printf "  \"%s\"\n" "${objects[@]}" "$prefix/lib/libPS5OpenGL.a" "$sdk/target/lib/libunwind.a" \
    "$sdk/target/lib/libc++abi.a" "$sdk/target/lib/libc++.a" "$builtins"
  printf ")\n"
} > "$app/vendor/libpv_group.a"
printf "APP_INCLUDE_PATHS = include\nAPP_STATIC_ARCHIVES = vendor/libpv_group.a\n" > "$app/.env"

# Import stubs for the GPU libraries, built as ps5-opengl builds them.
mkdir -p "$app/build/native-imports"
for lib in agc_link_stub:libSceAgc agc_driver_link_stub:libSceAgcDriver; do
  PS5_PAYLOAD_SDK="$sdk" sh "$app/tooling/prospero-clang18" -std=c11 -O2 -fPIC -c \
    "$gl/native-app/${lib%%:*}.c" -o "$app/build/native-imports/${lib%%:*}.o"
  "$sdk/bin/prospero-lld" --shared -soname "${lib##*:}.prx" -o "$sdk/target/lib/${lib##*:}.so" \
    "$app/build/native-imports/${lib%%:*}.o"
done

# Scripts the host runs, packaged at /app0/assets/js/.
mkdir -p "$app/assets/js"
cp /ps5/runtime/glconst.js /ps5/runtime/webgl.js /ps5/runtime/canvas2d.js /ps5/runtime/dom.js /ps5/runtime/ps5.js \
  /ps5/runtime/css.js /ps5/runtime/layout.js /ps5/runtime/hud.js /ps5/runtime/ps5hud.js /ps5/runtime/ps5launcher.js "$app/assets/js/"
# The launcher, unchanged.
mkdir -p "$app/assets/js/launcher"
cp /launcher/*.js /launcher/*.css /launcher/index.html "$app/assets/js/launcher/"
mkdir -p "$app/assets/js/games"
for bundle in /games/*/dist/assets/index-*.js; do
  name=$(basename "$(dirname "$(dirname "$(dirname "$bundle")")")")
  cp "$bundle" "$app/assets/js/games/$name.js"
  css=$(ls "$(dirname "$bundle")"/index-*.css 2>/dev/null | head -1)
  [ -z "$css" ] || cp "$css" "$app/assets/js/games/$name.css"
  [ ! -f "/games/$name/cover.png" ] || cp "/games/$name/cover.png" "$app/assets/js/games/$name.png"
  echo "$name" >> "$app/assets/js/games.txt"
done

# The library the launcher lists: the pocketvibe.json of every packaged game.
python3 - "$app/assets/js/games.txt" "$app/assets/js/library.json" <<PY
import json, sys
names = open(sys.argv[1]).read().split()
games = []
for name in names:
    try:
        meta = json.load(open(f"/games/{name}/pocketvibe.json"))
    except (OSError, ValueError):
        meta = {}
    meta.setdefault("id", name)
    meta.setdefault("title", name.replace("-", " ").title())
    meta.setdefault("entry", "index.html")
    games.append(meta)
json.dump(games, open(sys.argv[2], "w"))
PY

make -C "$app" --no-print-directory -j8 app TITLE_ID="$TITLE"
ls -la "$app/dist/$TITLE" "$app/dist/$TITLE/sce_module"
'
