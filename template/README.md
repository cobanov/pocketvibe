<h1 align="center">My handheld game</h1>

<p align="center">
  <strong>A three.js game for ROCKNIX handhelds, made with PocketVibe.</strong><br>
  Describe it to your AI tool, play it in the browser, publish it to the store.
</p>

<p align="center">
  <a href="https://pocketvibe.cobanov.dev"><strong>PocketVibe</strong></a> ·
  <a href="https://github.com/cobanov/pocketvibe/blob/main/docs/getting-started.md">Get started</a> ·
  <a href="https://github.com/cobanov/pocketvibe/blob/main/docs/performance.md">Performance guide</a> ·
  <a href="AGENTS.md">Rules for AI tools</a>
</p>

This project is ready for a game on a handheld's screen (720×480, and the other shapes PocketVibe runs on) and buttons. It starts as
Coin Rush, a small example game; tell your AI coding tool what to make instead.

## Make it yours

- **Describe your game.** `AGENTS.md`, also read through `CLAUDE.md`, tells AI tools the screen, the buttons and the rules that keep the game at 60 fps on the handheld.
- **Use the handheld layer.** `src/handheld.js` gives you the screen, the buttons, the game loop, saving and a performance overlay. Your game goes in `src/main.js` and beside it.
- **Fill in the listing.** `pocketvibe.json` is the game's page in the store, and `cover.png` (480×270) its picture.

## Try it

```sh
npm install
npm run dev
```

Open the address it prints. The game shows at the handheld's size, and the keyboard stands in
for its buttons:

| Handheld | Keyboard |
|---|---|
| D-pad | Arrow keys |
| A | X |
| B | Z |
| X | S |
| Y | A |
| L / R | Q / W |
| Start | Enter |
| Select | Shift |

**P** shows the performance overlay: frame rate, draw calls and triangles. It turns red when the
game is too heavy for the handheld. The
[performance guide](https://github.com/cobanov/pocketvibe/blob/main/docs/performance.md)
explains the handheld's limits and how to stay inside them.

## Put it on the handheld

Give the game its own `id` and a `version` in `pocketvibe.json`, then:

```sh
npx pocketvibe publish
```

You sign in with GitHub. Once the game is reviewed, it is in the PocketVibe store and you can
download it on any handheld with PocketVibe. For a new version, raise `version` and publish
again.
