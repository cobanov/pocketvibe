import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the build can be copied to any folder on the device.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
