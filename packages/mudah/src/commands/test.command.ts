import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Command } from '@mudah-cli/console';

async function walkTests(dir: string, pattern: string | undefined, acc: string[]): Promise<void> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkTests(full, pattern, acc);
      continue;
    }
    if (!entry.name.endsWith('.test.ts')) continue;
    if (pattern !== undefined && !full.includes(pattern) && !entry.name.includes(pattern)) continue;
    acc.push(full);
  }
}

function runVitest(
  cwd: string,
  pattern: string | undefined,
  flags: { watch: boolean; coverage: boolean },
): Promise<number | undefined> {
  return new Promise((resolve) => {
    const args = ['vitest', flags.watch ? 'watch' : 'run'];
    if (pattern !== undefined) args.push(pattern);
    if (flags.coverage) args.push('--coverage');
    if (process.env['UPDATE_SNAPSHOT'] === '1') args.push('--update');
    const child = spawn('npx', ['--no-install', ...args], {
      cwd,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', () => resolve(undefined));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

/**
 * Built-in `test` command: spawn vitest, or list matching `*.test.ts` files.
 */
export default class TestCommand extends Command {
  signature = 'test {pattern?} [--watch] [--coverage] [--fail-empty] [--update]';
  description = 'Discover *.test.ts files and run vitest';
  static exitCodes = { 1: 'No tests found (--fail-empty) or vitest failed' };

  async handle(): Promise<number> {
    const pattern = this.arg('pattern');
    const base = this.app.basePath;
    const files: string[] = [];
    await walkTests(base, pattern, files);
    this.output.section('Tests');
    this.output.keyValue('files', String(files.length));

    if (this.option('update') === true) {
      process.env['UPDATE_SNAPSHOT'] = '1';
    }

    if (files.length === 0) {
      this.output.warn('No *.test.ts files found.');
      return this.option('fail-empty') === true ? 1 : 0;
    }

    if (process.env['VITEST'] === undefined) {
      const code = await runVitest(base, pattern, {
        watch: this.option('watch') === true,
        coverage: this.option('coverage') === true,
      });
      if (code !== undefined) return code;
    }

    for (const file of files) {
      this.output.raw(`  ${relative(base, file)}\n`);
    }
    this.output.muted(process.env['VITEST'] ? 'listed (already inside vitest)' : 'vitest not available — listed files');
    return 0;
  }
}
