import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

// Three pages: the home page, how it works (/how/) and the game-making guide (/make/).
export default defineConfig({
  plugins: [cloudflare()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', how: 'how/index.html', make: 'make/index.html' },
    },
  },
});
