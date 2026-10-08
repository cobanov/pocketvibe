<p align="center">
  <img src="https://raw.githubusercontent.com/cobanov/pocketvibe/main/site/public/favicon.svg" alt="PocketVibe icon" width="72">
</p>

<h1 align="center">pocketvibe</h1>

<p align="center">
  <strong>Play your handheld game on your handheld, then publish it to the PocketVibe store.</strong><br>
  The command line tool for games made with <code>npm create pocketvibe</code>.
</p>

<p align="center">
  <a href="https://pocketvibe.cobanov.dev"><strong>PocketVibe</strong></a> ·
  <a href="https://github.com/cobanov/pocketvibe/blob/main/docs/getting-started.md">Get started</a> ·
  <a href="https://github.com/cobanov/pocketvibe/issues">Issues</a>
</p>

PocketVibe runs three.js games on handhelds with ROCKNIX or Android, and its store is where
those handhelds get them. This tool puts your game on your own handheld while you make it,
then builds it, packs it with its store listing and cover, and uploads it. You sign in with your
GitHub account; nothing else to set up.

## Commands

- **`pocketvibe serve [folder]`** plays the game on your own handheld before you publish it. It builds the game and serves it as a small store on your computer; add the address it prints in PocketVibe's **Settings > Stores > Add a store**, and the game is in the Store tab as "(dev)". Each change is built again and offered as an update. `--port` picks another port than 8740.
- **`pocketvibe publish [folder]`** sends the game to the store, like F-Droid: it checks that the game builds and is committed and pushed to a public GitHub repository, then opens a pull request to [cobanov/pocketvibe-store](https://github.com/cobanov/pocketvibe-store) pointing at that commit. The store builds it from source there; merged means published.
- **`pocketvibe status`** lists your games with their download counts, and your pull requests to the store.
- **`pocketvibe review <number>`** plays a store pull request's games on your handheld, like `serve` does: anyone can try a game before it is merged.

A new game or version appears in the store once it is reviewed. To publish an update, raise
`version` in `pocketvibe.json` and publish again; the store does not take the same version twice.

## Try it

1. Sign in to GitHub once with the [GitHub CLI](https://cli.github.com): `gh auth login`.
2. In your game's folder, check `pocketvibe.json`: a lowercase `id`, a `title`, a `version` like `1.0.0`, a `description`, a `genre` and the `controls`. Add a `cover.png` of 480×270.
3. Put it in a public GitHub repository: `gh repo create my-game --public --source . --push`.
4. Run `npx pocketvibe publish` and follow the pull request it opens.

`POCKETVIBE_STORE` points the tool at another store.

---

[MIT](https://github.com/cobanov/pocketvibe/blob/main/LICENSE)
