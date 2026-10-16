#!/bin/sh
# Fallback for a rooted TV: run the daemon without the Luna bus.
cd "$(dirname "$0")" && exec node pocketvibed.js
