import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TestApp } from '@mudah-cli/mudah/testing';

const appDir = fileURLToPath(new URL('..', import.meta.url));

describe('welcome', () => {
  it('greets a named person', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['welcome', 'Mudah']);
    result.exit(0).outContains('Hello, Mudah!');
  });

  it('greets the world by default', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['welcome']);
    result.exit(0).outContains('Hello, world!');
  });
});
