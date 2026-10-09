import { existsSync, readdirSync } from 'node:fs';
import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

// The pages: the home page, how it works (/how/), the game-making guide
// (/make/), privacy and support, and a page for every game in the store
// (/game/<id>/, written by scripts/prepare.mjs).
const games = existsSync('game') ? readdirSync('game').filter((id) => existsSync(`game/${id}/index.html`)) : [];

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        how: 'how/index.html',
        make: 'make/index.html',
        privacy: 'privacy/index.html',
        support: 'support/index.html',
        ...Object.fromEntries(games.map((id) => [`game-${id}`, `game/${id}/index.html`])),
      },
    },
  },
});
