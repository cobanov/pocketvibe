#!/bin/sh
# From the computer: run a file of tools/handheld-pad.py commands on the
# handheld, wait until they are done, and copy its screenshots here.
#
#   tools/handheld-run.sh <commands-file> <out-dir>
#
# The handheld's address comes from $HANDHELD (default root@192.168.8.197).
set -e
HOST=${HANDHELD:-root@192.168.8.197}
mkdir -p "$2"
scp -q "$1" "$HOST:/tmp/vpad.cmds"
ssh "$HOST" 'rm -rf /tmp/shots/* /tmp/vpad.done; { cat /tmp/vpad.cmds; echo mark; } > /tmp/vpad.fifo; n=0; until [ -e /tmp/vpad.done ] || [ $n -ge 1500 ]; do sleep 0.2; n=$((n+1)); done'
scp -q "$HOST:/tmp/shots/*.png" "$2/" 2>/dev/null || true
