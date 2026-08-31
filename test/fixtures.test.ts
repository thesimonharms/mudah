import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TestApp } from '@mudah-cli/mudah/testing';

const fixturesRoot = fileURLToPath(new URL('./.fixtures', import.meta.url));

describe('fixture: minimal', () => {
  it('welcomes a named person', async () => {
    const app = await TestApp.create({ cwd: join(fixturesRoot, 'minimal') });
    const result = await app.dispatch(['welcome', 'Mudah']);
    result.exit(0).outContains('Hello, Mudah!');
  });

  it('greets the world by default', async () => {
    const app = await TestApp.create({ cwd: join(fixturesRoot, 'minimal') });
    const result = await app.dispatch(['welcome']);
    result.exit(0).outContains('Hello, world!');
  });

  it('runs a grouped command', async () => {
    const app = await TestApp.create({ cwd: join(fixturesRoot, 'minimal') });
    const result = await app.dispatch(['db:status']);
    result.exit(0).outContains('Database is up.');
  });
});
