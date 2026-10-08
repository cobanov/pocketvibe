<p align="center">
  <img src="https://raw.githubusercontent.com/cobanov/pocketvibe/main/site/public/favicon.svg" alt="PocketVibe icon" width="72">
</p>

<h1 align="center">pocketvibe</h1>

<p align="center">
  <strong>Publish your handheld game to the PocketVibe store.</strong><br>
  The command line tool for games made with <code>npm create pocketvibe</code>.
</p>

<p align="center">
  <a href="https://pocketvibe.cobanov.dev"><strong>PocketVibe</strong></a> ·
  <a href="https://github.com/cobanov/pocketvibe/blob/main/docs/getting-started.md">Get started</a> ·
  <a href="https://github.com/cobanov/pocketvibe/issues">Issues</a>
</p>

PocketVibe runs three.js games on handhelds with ROCKNIX, and its store is where those
handhelds get them. This tool builds your game, packs it with its store listing and cover, and
uploads it. You sign in with your GitHub account; nothing else to set up.

## Commands

- **`pocketvibe publish [folder]`** builds the game in the folder (the current one by default) with Vite and uploads it. Your project's own `dist/` is left alone.
- **`pocketvibe status`** lists your games with their download counts, and your uploads with where they are: waiting for review, published or turned down.

A new game or version appears in the store once it is reviewed. To publish an update, raise
`version` in `pocketvibe.json` and publish again; the store does not take the same version twice.

## Try it

1. Sign in to GitHub once with the [GitHub CLI](https://cli.github.com): `gh auth login`. Or set `GITHUB_TOKEN`.
2. In your game's folder, check `pocketvibe.json`: a lowercase `id`, a `title`, a `version` like `1.0.0`, a `description`, a `genre` and the `controls`. Add a `cover.png` of 480×270.
3. Run `npx pocketvibe publish`.

`POCKETVIBE_STORE` points the tool at another store.

---

[MIT](https://github.com/cobanov/pocketvibe/blob/main/LICENSE)
