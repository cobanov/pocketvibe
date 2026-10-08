import { defineConfig } from 'cf/config';

// The PocketVibe website: static files only, served on pocketvibe.cobanov.dev.
export default defineConfig({
  worker: {
    name: 'pocketvibe-site',
    compatibilityDate: '2026-10-08',
    workersDev: true,
    domains: ['pocketvibe.cobanov.dev'],
    assets: { htmlHandling: 'auto-trailing-slash', notFoundHandling: '404-page' },
  },
});
