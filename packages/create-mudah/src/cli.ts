#!/usr/bin/env node
import { chmod, mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { detectCapabilities } from '@mudah-cli/terminal';
import { Output, resolveTheme } from '@mudah-cli/ui';
import { appTemplates, slugify } from './templates.js';

export interface ScaffoldResult {
  dir: string;
  name: string;
  files: string[];
}

/**
 * Scaffold a fresh Mudah app into `targetDir` (created if missing).
 * The app name is derived from the directory's basename.
 */
export async function scaffold(targetDir: string): Promise<ScaffoldResult> {
  const dir = resolve(targetDir);
  const name = slugify(basename(dir));
  const files: string[] = [];

  await mkdir(dir, { recursive: true });
  for (const [rel, content] of appTemplates(name)) {
    const path = join(dir, rel);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, content, 'utf8');
    files.push(rel);
  }

  // Bin stubs must be executable for direct `./bin/<name>` invocation.
  await chmod(join(dir, 'bin', `${name}.js`), 0o755).catch(() => {});
  return { dir, name, files };
}

const USAGE = `create-mudah — scaffold a new Mudah CLI app

Usage:
  npm create @mudah-cli/mudah <directory>
  npx create-mudah <directory> [options]

Options:
  -h, --help      Show this help
  --force         Scaffold into a non-empty directory (files are not
                  overwritten unless missing)

The app name is the directory's basename (kebab-cased). After scaffolding:
  cd <directory>
  npm install
  npm run start
`;

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const caps = detectCapabilities();
  const output = new Output({
    theme: resolveTheme('auto'),
    colorLevel: caps.colorLevel,
    unicode: caps.unicode,
  });

  if (args.includes('-h') || args.includes('--help')) {
    output.raw(USAGE);
    return 0;
  }

  const force = args.includes('--force');
  const target = args.find((a) => !a.startsWith('-'));
  if (!target) {
    output.error('Missing directory argument.');
    output.hint('Run "npm create @mudah-cli/mudah my-app" to scaffold "my-app".');
    return 2;
  }

  const dir = isAbsolute(target) ? target : resolve(process.cwd(), target);
  if (existsSync(dir)) {
    const entries = await readdir(dir);
    if (entries.length > 0 && !force) {
      output.error(`Directory "${target}" is not empty.`);
      output.hint('Use --force to scaffold into it anyway.');
      return 1;
    }
  }

  output.info(`Scaffolding Mudah app into ${dir}`);
  try {
    const result = await scaffold(dir);
    output.success(`Created ${result.files.length} files for "${result.name}".`);
    output.raw('');
    output.section('Next steps');
    output.bullet(`cd ${isAbsolute(dir) ? dir : basename(dir)}`);
    output.bullet('npm install');
    output.bullet('npm run start');
    return 0;
  } catch (error) {
    output.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

// Run the CLI only when executed directly (not when imported as a module).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => {
    process.exitCode = code;
  });
}
