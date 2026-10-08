# Get started

PocketVibe has two halves: an app for your handheld, and a starter project for making games
on your computer. You can use either one without the other.

## Put PocketVibe on your handheld

You need a handheld running [ROCKNIX](https://rocknix.org) with a 64-bit Arm chip (such as the
Allwinner H700 or the Rockchip RK3566), 1 GB of RAM or more, Wi-Fi, and about 1 GB free on its
SD card. PocketVibe does not run on muOS or other firmware. It is made on an Anbernic RG34XX
SP and tested on the RG34XX and the two-screen Anbernic RG DS; other ROCKNIX handhelds with
the same chips, such as the RG35XX and RG40XX families, should work too. On a handheld that uses the libmali GPU
driver (the RG DS does by default), PocketVibe offers to switch to Panfrost the first time it
opens: with libmali, games run slowly.

1. Download [PocketVibe.zip](https://pocketvibe.cobanov.dev/download/rocknix) (5 MB).
2. Unzip it into the handheld's `roms/ports` folder. Over the network: turn on Samba in
   ROCKNIX's network settings, then open the handheld's `games-roms` share from your computer
   (`smb://` and the handheld's IP address) and copy the files into `ports`. On a handheld with
   a second SD card for games, you can also copy them onto that card with your computer. (On a
   single card, ROCKNIX keeps `roms` in a partition that Windows and macOS cannot open.)
3. Restart the handheld, open **Ports** and start **PocketVibe**.

The first start downloads PocketVibe's game engine (WPE WebKit, about 150 MB) and installs it,
with a progress bar for each step. Over Wi-Fi this takes about a minute and a half, and it
happens only once; if the connection drops, opening PocketVibe again picks up where it
stopped. Then PocketVibe opens with five games.

<p align="center">
  <img src="screenshots/first-run.png" alt="The first start downloading the game engine, with a progress bar" width="360">
</p>

### On an Android handheld

PocketVibe is also an Android app, made for handhelds such as the Anbernic RG Rotate and the
Retroid Pocket. It needs Android 10 or newer and an up-to-date Android System WebView
(version 94 or later; update it from the Play Store if games do not start).

1. On the handheld, open [pocketvibe.cobanov.dev/download/android](https://pocketvibe.cobanov.dev/download/android)
   in the browser. It downloads the newest `PocketVibe-<version>.apk`.
2. Open the download. When Android asks, allow the browser (or your file manager) to install
   apps, then tap **Install**.
3. Start **PocketVibe** from the app list.

The buttons work as on the other handhelds. Hold **Start + Select**, or press Android's back
button, to leave a game. A newer version installs over the old one and keeps your games and
saves.

### Using it

PocketVibe opens on your **Library**. **L** and **R** switch between Library, **Store** and
**Settings**. The bar along the bottom always shows what each button does on the screen you
are on.

- **A** plays a game in the Library, or opens a game's page in the Store, where **A** downloads it.
- **Y** changes the order: recently played, newest, most downloaded, A to Z or by category.
  **Select** switches between cards and a list.
- In the Store, **X** hides the games you already have.
- **B** goes back, and on the tabs it quits PocketVibe.
- In a game, hold **Start + Select** for a second to go back to the launcher, or for three
  seconds to quit PocketVibe.

PocketVibe checks for a new version of itself every few hours and offers it in
**Settings > App update**. Settings also backs up every game's saves to
`/storage/pocketvibe/backups` and restores them.

### If something goes wrong

- **PocketVibe is not in Ports.** Restart the handheld, or update the game lists from the
  system menu, so it finds the new port.
- **"The download did not finish."** Connect to Wi-Fi in the system settings and start
  PocketVibe again. It starts the download over.
- **A game will not start.** Remove it in its page in the Store (**Y**) and download it again.

## Make your own game

You need [Node.js](https://nodejs.org) 22 or newer and an AI coding tool such as Claude Code or
Cursor.

```sh
npm create pocketvibe@latest my-game
cd my-game
npm install
npm run dev
```

Open the address it prints. The game runs in a 720×480 frame, the handheld's screen (links under it
try the other screen shapes PocketVibe runs on), and your
keyboard stands in for its buttons:

| Handheld | Keyboard |
|---|---|
| D-pad | Arrow keys |
| A, B, X, Y | X, Z, S, A |
| L, R | Q, W |
| Start, Select | Enter, Shift |

**P** shows the performance overlay. It turns red when the game is too heavy for the handheld.

Then describe your game to your AI tool, and give it the brief first:

```text
Read https://pocketvibe.cobanov.dev/agents.md and follow it. Then make me a PocketVibe game: a snowboard race down a mountain, dodging trees.
```

[The brief](https://pocketvibe.cobanov.dev/agents.md) holds the handheld's measured limits, the
rules that keep a game at 60 fps there, and how to try the game on a handheld and publish it.
The project's own `AGENTS.md` (also read through `CLAUDE.md`) has the same rules in detail,
with code. The starter project comes with a small example game to change or replace.
[Make a game](https://pocketvibe.cobanov.dev/make/) on the website walks through it all.

[Making games that run well](performance.md) explains the handheld's measured limits and how
to stay inside them, and how to measure a game on a handheld.

### Play it on your own handheld

With the handheld on the same network as your computer, run this in the game's folder:

```sh
npx pocketvibe serve
```

It builds the game and prints an address such as `http://192.168.1.20:8740`. In PocketVibe on
the handheld, open **Settings > Stores > Add a store** and type it. The game is then in the
**Store** tab as "(dev)", beside the store's copy if there is one, with its own saves: **A**
downloads it. Each change is built again, and the Store offers the new build as an update.
This works on ROCKNIX and Android handhelds; keep `serve` running while you play.
**Settings > Show FPS in games** shows the performance overlay on the handheld.

### Publish it to the store

Fill in `pocketvibe.json`, the game's store listing:

```json
{
  "id": "space-dodge",
  "title": "Space Dodge",
  "author": "your name",
  "version": "1.0.0",
  "description": "One or two sentences about the game.",
  "genre": "Arcade",
  "controls": { "D-pad": "Move", "A": "Shoot", "START": "Pause" }
}
```

The `id` is lowercase letters, digits and dashes, and stays the same for the life of the game.
Add a `cover.png` of 480×270, for example a picture of your title screen. Then:

```sh
npx pocketvibe publish
```

The store works like F-Droid: it is a GitHub repository,
[cobanov/pocketvibe-store](https://github.com/cobanov/pocketvibe-store), where each game is a
file pointing at the game's own public repository and a commit. So first put the game in a
public GitHub repository with a `LICENSE` (MIT is a good default), using the
[GitHub CLI](https://cli.github.com) (`gh auth login` once):

```sh
gh repo create my-game --public --source . --push
```

`npx pocketvibe publish` then checks that the game builds and is committed and pushed, and opens
a pull request to the store. There the game is built from its source and checked, anyone can
play it with `npx pocketvibe review <number>`, and the review happens in the open. Once merged,
it is in the store on every handheld. What review checks is on
[Make a game](https://pocketvibe.cobanov.dev/make/#review). To publish an update, raise
`version`, commit, push and run `publish` again.

### Over SSH, with this repository

On a ROCKNIX handheld you can also copy a built game straight into PocketVibe's Library and
start it, with this repository and SSH access to the handheld:

```sh
npm run build
HANDHELD=root@192.168.1.42 path/to/pocketvibe/device/play.sh dist
```
