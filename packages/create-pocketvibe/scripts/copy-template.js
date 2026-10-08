// Copies the repo's starter project into this package before it is packed.
// npm drops .gitignore files from packages, so it ships as _gitignore.

import { cpSync, existsSync, renameSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const here = resolve(import.meta.dirname, '..');
const source = resolve(here, '../../template');
const target = resolve(here, 'template');
const skip = new Set(['node_modules', 'dist', 'package-lock.json', 'cover.png', 'pocketvibe.json']);

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true, filter: (path) => !skip.has(basename(path)) });
if (existsSync(resolve(target, '.gitignore'))) {
  renameSync(resolve(target, '.gitignore'), resolve(target, '_gitignore'));
}
console.log(`Copied the template from ${source}`);
