import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from '@mudah-cli/console';
import { TestApp, TestResult } from '@mudah-cli/testing';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(testDir, '.fixtures', 'app');

class SevenCommand extends Command {
  signature = 'seven';
  description = 'Returns exit code 7';
  async handle() {
    return 7;
  }
}

beforeAll(async () => {
  await rm(appDir, { recursive: true, force: true });
  await mkdir(join(appDir, 'src', 'commands'), { recursive: true });
  await mkdir(join(appDir, 'src', 'providers'), { recursive: true });
  await writeFile(
    join(appDir, 'mudah.json'),
    JSON.stringify({ name: 'test-app', version: '9.9.9', bin: 'test-app' }),
  );
  await writeFile(
    join(appDir, 'src', 'providers', 'GreetingProvider.ts'),
    `import { ServiceProvider } from '@mudah-cli/core';
export default class GreetingProvider extends ServiceProvider {
  register(): void {
    this.app.config().set('greeting.prefix', 'hi-');
  }
}
`,
  );
  await writeFile(
    join(appDir, 'src', 'commands', 'hello.command.ts'),
    `import { Command } from '@mudah-cli/console';
export default class HelloCommand extends Command {
  signature = 'hello {name}';
  description = 'Greets with the configured prefix';
  async handle() {
    const prefix = this.app.config().get<string>('greeting.prefix', '');
    this.output.success(\`\${prefix}\${this.arg('name')}\`);
  }
}
`,
  );
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

describe('TestApp', () => {
  it('dispatches commands and captures output', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['hello', 'world']);
    expect(result.code).toBe(0);
    result.outContains('hi-world');
  });

  it('boots providers before commands run', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['hello', 'ada']);
    // The prefix comes from the provider's register() hook.
    expect(app.app.config().get('greeting.prefix')).toBe('hi-');
    result.exit(0).outContains('hi-ada');
  });

  it('registers extra command modules', async () => {
    const app = await TestApp.create({ cwd: appDir, commands: [{ default: SevenCommand }] });
    const result = await app.dispatch(['seven']);
    result.exit(7);
  });

  it('maps unknown commands to exit code 2 with a stderr message', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['missing']);
    result.exit(2).errContains('Unknown command "missing"');
  });

  it('cleans captured output between dispatches', async () => {
    const app = await TestApp.create({ cwd: appDir });
    await app.dispatch(['hello', 'first']);
    const second = await app.dispatch(['hello', 'second']);
    second.outContains('hi-second').outNotContains('hi-first');
  });

  it('chainable assertions throw with full output on failure', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result: TestResult = await app.dispatch(['hello', 'x']);
    expect(() => result.exit(1)).toThrow(/Expected exit code 1, got 0/);
    expect(() => result.outContains('not-there')).toThrow(/stdout missing/);
  });
});
