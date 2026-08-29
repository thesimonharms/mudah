#!/usr/bin/env node
/**
 * Release tooling:
 *   node scripts/release.mjs <semver> [--dry-run]
 *
 * 1. Bumps every publishable package (and internal cross-dependencies) to the version.
 * 2. Builds all packages.
 * 3. Runs an `npm pack --dry-run` for each package to verify the file lists.
 *
 * Publishing itself is a deliberate manual step:
 *   npm publish --workspaces --access public
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const version = args.find((a) => !a.startsWith('-'));

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage: node scripts/release.mjs <semver> [--dry-run]');
  process.exit(2);
}

const packages = [
  'container',
  'config',
  'terminal',
  'animation',
  'ui',
  'core',
  'tui',
  'console',
  'testing',
  'audio',
  'vgpu',
  'mudah',
  'create-mudah',
];

const displayName = (name) => (name === 'mudah' ? '@mudah-cli/mudah' : name === 'create-mudah' ? '@mudah-cli/create-mudah' : `@mudah-cli/${name}`);

// 1. Version bump (packages + internal deps stay in lockstep).
for (const name of packages) {
  const file = join(root, 'packages', name, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  pkg.version = version;
  for (const [dep, current] of Object.entries(pkg.dependencies ?? {})) {
    if (dep.startsWith('@mudah-cli/')) {
      pkg.dependencies[dep] = `^${version}`;
    }
    void current;
  }
  if (dryRun) {
    console.log(`would bump ${displayName(name)} -> ${version}`);
  } else {
    await writeFile(file, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`bumped ${displayName(name)} -> ${version}`);
  }
}

if (dryRun) {
  console.log('\nDry run complete — nothing was written or built.');
  process.exit(0);
}

// 2. Build.
console.log('\nBuilding all packages…');
execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'inherit' });

// 3. Pack checks.
for (const name of packages) {
  console.log(`\n=== pack check: ${displayName(name)} ===`);
  execFileSync('npm', ['pack', '--dry-run', '--loglevel=error'], {
    cwd: join(root, 'packages', name),
    stdio: 'inherit',
  });
}

console.log('\nAll packages bumped, built, and pack-checked.');
console.log('Publish with:  npm publish --workspaces --access public');
