# create-pocketvibe

Start a three.js game for PocketVibe: web games on handheld consoles running ROCKNIX (first target: Anbernic RG SP).

```sh
npm create pocketvibe@latest my-game
cd my-game
npm install
npm run dev
```

The project comes with:

- `src/handheld.js`: the device layer (720×480 screen, buttons, game loop, saving, performance overlay).
- `AGENTS.md` / `CLAUDE.md`: rules that teach AI coding tools how to write fast code for the handheld.
- An example game to start from.

Describe your game to your AI coding tool and it will follow the handheld's rules.
