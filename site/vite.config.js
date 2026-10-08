import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

// Two pages: the home page and the game-making guide (/make/).
export default defineConfig({
  plugins: [cloudflare()],
  build: {
    rollupOptions: {
      input: { main: 'index.html', make: 'make/index.html' },
    },
  },
});
