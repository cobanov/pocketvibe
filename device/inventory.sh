#!/bin/sh
# Device inventory for the handheld (plan, step 0).
# Run on the device over SSH:  ssh root@<ip> 'sh -s' < device/inventory.sh
# Prints what the browser-engine runtime depends on: OS and libc, GPU driver,
# display stack, input, audio, storage and how EmulationStation is set up.

section() { printf '\n== %s ==\n' "$1"; }

section "System"
uname -a
cat /etc/os-release 2>/dev/null | grep -E '^(NAME|VERSION|BUILD|DEVICE|HW_DEVICE)' || true
grep -m1 -i 'model name\|Hardware' /proc/cpuinfo 2>/dev/null
grep -c ^processor /proc/cpuinfo | sed 's/^/cpu cores: /'
grep -E 'MemTotal|MemAvailable' /proc/meminfo
cat /proc/device-tree/model 2>/dev/null && echo

section "C library"
ls /lib/libc.so.6 /usr/lib/libc.so.6 2>/dev/null
(/lib/libc.so.6 2>/dev/null || /usr/lib/libc.so.6 2>/dev/null || ldd --version 2>&1) | head -1

section "GPU"
ls -la /dev/dri 2>/dev/null || echo "no /dev/dri"
for card in /sys/class/drm/card*/device/driver; do
  [ -e "$card" ] && echo "$card -> $(basename "$(readlink "$card")")"
done
dmesg 2>/dev/null | grep -i -E 'panfrost|mali|drm' | tail -10

section "Graphics libraries"
for lib in libEGL libGLESv2 libgbm libdrm libwayland-client libmali; do
  found=$(find /usr/lib /lib -maxdepth 2 -name "$lib.so*" 2>/dev/null | head -3 | tr '\n' ' ')
  echo "$lib: ${found:-missing}"
done

section "Display stack"
ps -eo comm,args 2>/dev/null | grep -i -E 'sway|weston|cage|Xorg|emulationstation|retroarch' | grep -v grep \
  || ps | grep -i -E 'sway|weston|cage|Xorg|emulationstation' | grep -v grep
echo "WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset} XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-unset}"
ls /run/*wayland* /var/run/*wayland* 2>/dev/null
cat /sys/class/drm/*/modes 2>/dev/null | sort -u

section "Input devices"
grep -E '^(N|H):' /proc/bus/input/devices

section "Audio"
aplay -l 2>/dev/null || cat /proc/asound/cards

section "Storage"
df -h /storage 2>/dev/null || df -h

section "Tools"
for tool in python3 busybox gptokeyb curl wget unzip; do
  printf '%s: %s\n' "$tool" "$(command -v "$tool" || echo missing)"
done
find /storage /usr/bin -maxdepth 4 -name 'gptokeyb*' 2>/dev/null | head -3
ls -d /storage/roms/ports/PortMaster 2>/dev/null

section "EmulationStation config"
find / -xdev -name 'es_systems*.cfg' 2>/dev/null | head -5
ls /storage/roms 2>/dev/null | head -50 | tr '\n' ' '
echo
