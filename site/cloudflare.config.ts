import { defineConfig } from 'cf/config';

// The PocketVibe website: static files only, served on pocketvibe.cobanov.dev and pocketvibe.dev.
export default defineConfig({
  worker: {
    name: 'pocketvibe-site',
    compatibilityDate: '2026-10-08',
    workersDev: true,
    // pocketvibe.cobanov.dev stays: links already shared, and installed apps
    // download the game engine from it.
    domains: ['pocketvibe.cobanov.dev', 'pocketvibe.dev', 'www.pocketvibe.dev'],
    assets: { htmlHandling: 'auto-trailing-slash', notFoundHandling: '404-page' },
  },
});
