import { bindings, defineConfig } from 'cf/config';

import * as entrypoint from './src/index.ts' with { type: 'cf-worker' };

export default defineConfig({
  worker: {
    name: 'pocketvibe-store',
    entrypoint,
    compatibilityDate: '2026-10-08',
    workersDev: true,
    env: {
      // Catalog, releases and download counts.
      DB: bindings.d1({ id: '7833ebfe-fb8b-48b4-8fe0-ad73287dc3b1', name: 'pocketvibe-store' }),
      // Game zips and covers.
      FILES: bindings.r2({ name: 'pocketvibe-store' }),
      // The GitHub account whose uploads are published without review and
      // who reviews everyone else's.
      ADMIN_LOGIN: bindings.text('cobanov'),
      STORE_NAME: bindings.text('PocketVibe Store'),
    },
  },
});
