import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built game runs from any folder on the device.
  base: './',
  build: {
    target: 'es2022',
    // Keep assets as separate files instead of inlining them into the JS.
    assetsInlineLimit: 0,
    // three.js alone is over 500 kB; that is fine for a game loaded from disk.
    chunkSizeWarningLimit: 1500,
  },
});
