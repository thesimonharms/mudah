#!/usr/bin/env node
/**
 * Publish the Mudah monorepo to npm.
 *
 * Bumps every @mudah-cli/* package (and pins internal deps) in lockstep,
 * builds all packages in dependency order, then publishes them to npm in
 * the same order so dependents always resolve on the registry.
 *
 *   npm run release -- minor              # bump minor + build + publish
 *   npm run release -- 0.8.0              # exact version
 *   npm run release -- --dry-run          # preview: bump + build + `npm publish --dry-run` (no upload)
 *   npm run release -- 0.8.0 --skip-build     # publish existing dist, no rebuild
 *   npm run release -- --skip-bump           # build + publish at the current version
 *   npm run release -- --skip-publish        # bump + build only (no npm publish)
 *
 * npm login is expected to be configured beforehand. This script does not
 * store or create credentials. npm itself refuses to publish when CI=true,
 * so this is intended to be run by hand.
 */
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const packagesRoot = join(root, 'packages');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const skipBump = args.includes('--skip-bump');
const skipBuild = args.includes('--skip-build');
const skipPublish = args.includes('--skip-publish');
const target = args.find((a) => !a.startsWith('-'));

// Build / publish order = dependency order (leaves first).
const order = [
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

const current = JSON.parse(
  await readFile(join(packagesRoot, 'mudah', 'package.json'), 'utf8'),
).version;

function bump(kind, from) {
  const [maj, min, pat] = from.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  return null;
}

const version = skipBump
  ? current
  : target && /^\d+\.\d+\.\d+$/.test(target)
    ? target
    : target
      ? bump(target, current)
      : null;

if (!skipBump && !version) {
  console.error(`Usage: npm run release -- <semver|major|minor|patch> [--dry-run] [--skip-build] [--skip-publish] [--skip-bump]
Bump + build + publish @mudah-cli/* in lockstep.
Current: ${current}`);
  process.exit(2);
}

if (dryRun) console.log('\nDRY RUN — no packages will be uploaded.\n');

function pin(deps) {
  if (!deps) return 0;
  let n = 0;
  for (const name of Object.keys(deps)) {
    if (name.startsWith('@mudah-cli/')) {
      deps[name] = `^${version}`;
      n += 1;
    }
  }
  return n;
}

async function writeJson(file, data) {
  if (dryRun) return;
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

// --- 1. Bump versions + pin internal deps ---
for (const name of order) {
  const file = join(packagesRoot, name, 'package.json');
  const pkg = JSON.parse(await readFile(file, 'utf8'));
  if (!skipBump) pkg.version = version;
  pin(pkg.dependencies);
  pin(pkg.devDependencies);
  pin(pkg.peerDependencies);
  await writeJson(file, pkg);
  console.log(`${dryRun ? 'would ' : ''}${skipBump ? 'keep' : 'bump'} ${pkg.name ?? name} -> ${pkg.version}`);
}

const examplesRoot = join(root, 'examples');
for (const entry of await readdir(examplesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = join(examplesRoot, entry.name, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    continue;
  }
  const n = pin(pkg.dependencies) + pin(pkg.devDependencies);
  if (n > 0) {
    await writeJson(file, pkg);
    console.log(`pinned examples/${entry.name} @mudah-cli/* -> ^${version}`);
  }
}

// --- 2. Build (each package emits dist/, which is what `files` ships) ---
if (!skipBuild) {
  console.log('\nBuilding packages…');
  const buildScript = fileURLToPath(new URL('./build.mjs', import.meta.url));
  execFileSync(process.execPath, [buildScript], { cwd: root, stdio: 'inherit' });
} else {
  console.log('\nSkipped build (--skip-build). Publishing existing dist.');
}

// --- 3. Publish in dependency order ---
if (skipPublish) {
  console.log('\nSkipped publish (--skip-publish).');
} else {
  console.log('\nVerifying npm auth…');
  execFileSync('npm', ['whoami'], { stdio: 'inherit' });

  console.log('\nPublishing packages…');
  for (const name of order) {
    const file = join(packagesRoot, name, 'package.json');
    const pkg = JSON.parse(await readFile(file, 'utf8'));
    if (pkg.private === true) continue;

    const publishArgs = ['publish', '--access', 'public'];
    if (dryRun) publishArgs.push('--dry-run');
    console.log(`\n→ ${pkg.name}@${pkg.version}`);

    try {
      execFileSync('npm', publishArgs, { cwd: join(packagesRoot, name), stdio: 'inherit' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\nPublish FAILED for ${pkg.name}. ${msg}`);
      console.error(
        'Packages earlier in the order may already be on the registry at this version.\n' +
          'Verify the registry, then re-run with --skip-bump to publish the rest at the current version.',
      );
      process.exit(1);
    }
  }
  console.log('\nDone.');
}

// --- 4. Next steps (git) ---
if (!dryRun && !skipBump) {
  console.log(`
Next steps:
  git add -A
  git commit -m "release: ${version}"
  git tag v${version} && git push && git push --tags
`);
}
