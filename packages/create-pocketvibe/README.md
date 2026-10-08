<p align="center">
  <img src="https://raw.githubusercontent.com/cobanov/pocketvibe/main/site/public/favicon.svg" alt="PocketVibe icon" width="72">
</p>

<h1 align="center">create-pocketvibe</h1>

<p align="center">
  <strong>Start a three.js game for your handheld.</strong><br>
  A project that already knows the screen, the buttons and the performance budget.
</p>

<p align="center">
  <a href="https://pocketvibe.cobanov.dev"><strong>PocketVibe</strong></a> ·
  <a href="https://github.com/cobanov/pocketvibe/blob/main/docs/getting-started.md">Get started</a> ·
  <a href="https://github.com/cobanov/pocketvibe/issues">Issues</a>
</p>

```sh
npm create pocketvibe@latest my-game
cd my-game
npm install
npm run dev
```

Then open the folder in your AI coding tool, such as Claude Code or Cursor, and describe your
game. The project is made for handhelds running ROCKNIX with the
[PocketVibe](https://pocketvibe.cobanov.dev) app.

## What you get

- **Rules your AI tool reads.** `AGENTS.md`, also read through `CLAUDE.md`, teaches it the 720×480 screen, the buttons, and how to keep a three.js game at 60 fps on the handheld's GPU.
- **A device layer.** `src/handheld.js` handles the screen, the buttons (gamepad on the handheld, keyboard in the browser), the game loop, saving, and a performance overlay that turns red when the game is too heavy.
- **An example to start from.** Coin Rush, a small game that follows every rule.
- **A store listing.** `pocketvibe.json`, ready for `npx pocketvibe publish`.

---

[MIT](https://github.com/cobanov/pocketvibe/blob/main/LICENSE)
