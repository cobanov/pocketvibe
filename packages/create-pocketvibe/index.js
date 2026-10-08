#!/usr/bin/env node
// npm create pocketvibe@latest [folder]
// Creates a three.js game project set up for PocketVibe handhelds.

import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const folder = process.argv[2] ?? 'my-pocketvibe-game';
const target = resolve(folder);
const name = basename(target);

if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`${folder} already exists and is not empty. Pick another folder name.`);
  process.exit(1);
}

cpSync(resolve(import.meta.dirname, 'template'), target, { recursive: true });
renameSync(resolve(target, '_gitignore'), resolve(target, '.gitignore'));

const id = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'my-game';
const title = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const pkgPath = resolve(target, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = id;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
const readmePath = resolve(target, 'README.md');
writeFileSync(readmePath, readFileSync(readmePath, 'utf8').replace('My handheld game', title));
writeFileSync(
  resolve(target, 'pocketvibe.json'),
  JSON.stringify({ id, title, author: '', version: '0.1.0', description: '', responsive: true }, null, 2) + '\n',
);

console.log(`
Created ${title} in ${folder}

  cd ${folder}
  npm install
  npm run dev

Then open the folder in your AI coding tool (Claude Code, Cursor, ...) and
describe your game. AGENTS.md tells it how to write code for the handheld.
`);
