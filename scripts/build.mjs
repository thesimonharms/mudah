#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));

// Build order = dependency order.
const order = [
  'container',
  'config',
  'terminal',
  'animation',
  'ui',
  'core',
  'console',
  'testing',
  'mudah',
  'create-mudah',
];

const noEmit = process.argv.includes('--no-emit');
const only = process.argv
  .map((arg, i) => (arg === '--only' ? process.argv[i + 1] : undefined))
  .find(Boolean);

const started = performance.now();
let built = 0;

for (const name of order) {
  if (only && name !== only) continue;
  const dir = `${root}/packages/${name}`;
  if (!existsSync(dir)) continue;
  const args = ['-p', 'tsconfig.json', '--pretty', 'false'];
  if (noEmit) args.push('--noEmit');
  const label = name === 'mudah' ? '@mudah-cli/mudah' : name === 'create-mudah' ? '@mudah-cli/create-mudah' : `@mudah-cli/${name}`;
  process.stdout.write(`  ${noEmit ? 'checking' : 'building'}  ${label}\n`);
  execFileSync(process.execPath, [tsc, ...args], { cwd: dir, stdio: 'inherit' });
  built += 1;
}

const elapsed = Math.round(performance.now() - started);
console.log(`\n${noEmit ? 'Type-checked' : 'Built'} ${built} package${built === 1 ? '' : 's'} in ${elapsed}ms`);
