<p align="center">
  <img src="site/public/favicon.svg" alt="PocketVibe icon" width="88">
</p>

<h1 align="center">PocketVibe</h1>

<p align="center">
  <strong>Make a game with AI. Play it on your handheld.</strong><br>
  A launcher, a game store and a starter project for three.js games on ROCKNIX handhelds.
</p>

<p align="center">
  <a href="https://pocketvibe.cobanov.dev/download/rocknix"><strong>Download PocketVibe</strong></a> ·
  <a href="https://pocketvibe.cobanov.dev">Website</a> ·
  <a href="docs/getting-started.md">Get started</a> ·
  <a href="https://github.com/cobanov/pocketvibe/issues">Issues</a>
</p>

PocketVibe is for people who make three.js games with AI coding tools like Claude Code or
Cursor and want to play them on a real handheld. It adds an app to the Ports menu of
ROCKNIX with a store of games made for the handheld's screen and buttons. No Linux, SSH or
porting needed: unzip it once and it keeps itself up to date.

<p align="center">
  <a href="docs/screenshots/library.png"><img src="docs/screenshots/library.png" alt="The Library: game covers in a grid, with the tabs and the handheld's buttons as hints" width="360"></a>
  <a href="docs/screenshots/ready.png"><img src="docs/screenshots/ready.png" alt="A game that just finished downloading, ready to play, with small fireworks" width="360"></a>
  <br>
  <sub>Captured on an Anbernic RG34XX SP at its 720×480. Try the launcher in your browser on the <a href="https://pocketvibe.cobanov.dev">website</a>.</sub>
</p>

## Your game, in your hands.

- **Get games from the store.** PocketVibe starts with five games, and the store has more: pick one, watch it download, and play. Updates show up on their own.
- **Fits every screen.** Games fill 3:2, 4:3, 16:9 and square screens, and on the two-screen Anbernic RG DS a game can use both, like Turbo Circuit's map and standings below the race.
- **Feels like a console.** Menus have their own sounds and music, and everything works with the handheld's buttons.
- **Start from a project that knows the handheld.** `npm create pocketvibe` sets up Vite and three.js with an `AGENTS.md` that teaches your AI tool the screen, the buttons and the performance budget.
- **Keep it at 60 fps.** WPE WebKit draws with the handheld's GPU. Scenes that follow the rules ran at 60 fps on the H700; the same scenes written the usual way stayed under 6.
- **Publish with one command.** `npx pocketvibe publish` builds your game and sends it to the store. You sign in with GitHub.
- **Leave a game any time.** Hold Start + Select to go back to the launcher, or a little longer to quit.
- **Keep your saves.** Every game saves on its own, and Settings backs all saves up to the SD card.

## Try it

Just curious? The [website](https://pocketvibe.cobanov.dev) runs the real launcher with the
store's games in your browser.

On your handheld, with ROCKNIX (PocketVibe does not run on muOS or other firmware), a 64-bit
Arm chip, 1 GB of RAM or more, Wi-Fi and about 1 GB free on the SD card:

1. Download [PocketVibe.zip](https://pocketvibe.cobanov.dev/download/rocknix) (5 MB).
2. Unzip it into the handheld's `roms/ports`. Over the network, turn on Samba in ROCKNIX's
   network settings and open the handheld's `games-roms` share; a second SD card for games can
   also be filled with a card reader.
3. Restart the handheld (or update the game lists) and open **Ports**, then **PocketVibe**.

The first start downloads PocketVibe's game engine (about 150 MB) and installs it, with a
progress bar for each step: about a minute and a half over Wi-Fi, once. Then it opens with
five games, and updates itself from Settings from then on. If the handheld uses the libmali
graphics driver, PocketVibe offers to switch to Panfrost with one press, so games run at
full speed.

On an Android handheld, download the newest APK from
[pocketvibe.cobanov.dev/download/android](https://pocketvibe.cobanov.dev/download/android) and
open it; allow your browser or file manager to install apps when Android asks.

To make your own game, run `npm create pocketvibe@latest my-game`, then tell your AI coding
tool to read [the brief](https://pocketvibe.cobanov.dev/agents.md) and what to make.
`npx pocketvibe serve` puts the game on your own handheld, and `npx pocketvibe publish` sends it
to the store. [Make a game](https://pocketvibe.cobanov.dev/make/) and
[Get started](docs/getting-started.md) walk through it; [Making games that run well](docs/performance.md)
has the handheld's measured limits.

**Made on an Anbernic RG34XX SP** with ROCKNIX, and tested on the RG34XX and the two-screen
Anbernic RG DS. On Android it runs on the Anbernic RG Rotate. Other ROCKNIX handhelds with the
same chips, such as the RG35XX and RG40XX families, should work too, but are not tested yet.

## Want to tinker?

On the handheld, a small Python service and an HTML launcher run WPE WebKit and Cog from a
Debian root. The store is a Cloudflare Worker with D1 and R2; the website is static. The app
and its engine are GitHub releases, downloaded through `pocketvibe.cobanov.dev/download/`, so
where they are hosted can change without a new app.

[Development](docs/development.md) ·
[Rules for AI tools](template/AGENTS.md) ·
[Performance guide](docs/performance.md) ·
[Command line tool](packages/pocketvibe/README.md) ·
[Benchmarks](bench/README.md)

---

[MIT](LICENSE) · DejaVu fonts under the [Bitstream Vera license](site/public/fonts/LICENSE.txt)
