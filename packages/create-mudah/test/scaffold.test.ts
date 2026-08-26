import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffold, slugify } from '@mudah-cli/create-mudah';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = join(testDir, '.fixtures', 'out');

beforeAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('slugify', () => {
  it('normalizes names to kebab-case', () => {
    expect(slugify('My App')).toBe('my-app');
    expect(slugify('hello_cli')).toBe('hello-cli');
    expect(slugify('  --weird--  ')).toBe('weird');
    expect(slugify('???')).toBe('mudah-app');
  });
});

describe('scaffold', () => {
  it('creates a complete app skeleton', async () => {
    const result = await scaffold(join(outDir, 'demo-app'));
    expect(result.name).toBe('demo-app');
    expect(result.files.length).toBeGreaterThanOrEqual(10);

    const dir = result.dir;
    for (const file of [
      'package.json',
      'mudah.json',
      'tsconfig.json',
      'vitest.config.ts',
      'README.md',
      '.gitignore',
      'bin/demo-app.js',
      'src/commands/welcome.command.ts',
      'src/providers/AppProvider.ts',
      'config/app.ts',
      'test/welcome.test.ts',
    ]) {
      expect(existsSync(join(dir, file)), `missing ${file}`).toBe(true);
    }

    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as {
      bin: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.bin['demo-app']).toBe('./bin/demo-app.js');
    expect(pkg.dependencies['@mudah-cli/mudah']).toBe('^0.1.0');

    const manifest = JSON.parse(await readFile(join(dir, 'mudah.json'), 'utf8')) as {
      name: string;
      bin: string;
    };
    expect(manifest.name).toBe('demo-app');
    expect(manifest.bin).toBe('demo-app');

    const welcome = await readFile(join(dir, 'src', 'commands', 'welcome.command.ts'), 'utf8');
    expect(welcome).toContain("import { Command } from '@mudah-cli/mudah'");
    expect(welcome).toContain("signature = 'welcome {name?}'");

    const binStub = await readFile(join(dir, 'bin', 'demo-app.js'), 'utf8');
    expect(binStub).toContain('#!/usr/bin/env node');
    expect(binStub).toContain("import { run } from '@mudah-cli/mudah'");

    const mode = (await stat(join(dir, 'bin', 'demo-app.js'))).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  it('names the provider class after the app', async () => {
    await scaffold(join(outDir, 'my-cool-cli'));
    const provider = await readFile(join(outDir, 'my-cool-cli', 'src', 'providers', 'AppProvider.ts'), 'utf8');
    expect(provider).toContain('class MyCoolCliProvider extends ServiceProvider');
  });
});
