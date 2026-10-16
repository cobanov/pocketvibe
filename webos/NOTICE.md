# Notices

The webOS port lives inside a fork of [cobanov/pocketvibe](https://github.com/cobanov/pocketvibe), © 2026 Mert Cobanov, MIT License (see `LICENSE` at the repository root).
The launcher, the games' store and the PocketVibe logo are upstream's. The additions in `webos/` are released under the same MIT license.

Bundled or downloaded by the build:

| Component | Used for | License |
|---|---|---|
| [esbuild](https://github.com/evanw/esbuild) (host build and the ARM binary in the `.ipk`) | rewriting JavaScript/CSS for Chromium 68 | MIT |
| [`@webos-tools/cli`](https://github.com/webosose/ares-cli) | packaging (`ares-package`), build time only | Apache-2.0 |
| CA certificate list from [curl.se/ca](https://curl.se/ca/) (derived from Mozilla's) | HTTPS fallback on the TV | MPL-2.0 |

Store games are by their authors; each carries its own author name in the store.
