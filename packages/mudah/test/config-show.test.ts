import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, Command } from '@mudah-cli/mudah';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(testDir, '.fixtures', 'config-show');

function liveStreams(): {
  stdout: { write(data: string): void };
  stderr: { write(data: string): void };
  text: () => { out: string; err: string };
} {
  const state = { out: '', err: '' };
  return {
    stdout: { write(data: string): void { state.out += data; } },
    stderr: { write(data: string): void { state.err += data; } },
    text: () => state,
  };
}

beforeAll(async () => {
  await rm(appDir, { recursive: true, force: true });
  await mkdir(join(appDir, 'src', 'commands'), { recursive: true });
  await mkdir(join(appDir, 'src', 'providers'), { recursive: true });
  await writeFile(
    join(appDir, 'mudah.json'),
    JSON.stringify({ name: 'cs', version: '0.1.0', bin: 'cs' }),
  );
  await writeFile(
    join(appDir, 'src', 'providers', 'SecretProvider.ts'),
    `import { ServiceProvider } from '@mudah-cli/core';
export default class SecretProvider extends ServiceProvider {
  register(): void {
    this.app.config().set('app.greeting', 'hi');
    this.app.config().set('app.secret', 's3cr3t');
    this.app.config().set('db.url', 'postgres://u:p@h/db');
  }
}
`,
  );
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

describe('config:show', () => {
  it('reads a non-sensitive value', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:show', 'app.greeting'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('hi');
  });

  it('redacts a sensitive value by key', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:show', 'app.secret'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('[redacted]');
    expect(s.text().out).not.toContain('s3cr3t');
  });

  it('redacts a sensitive url value', async () => {
    const s = liveStreams();
    await run({ argv: ['config:show', 'db.url'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(s.text().out).toContain('[redacted]');
    expect(s.text().out).not.toContain('postgres://');
  });

  it('redacts the whole tree when no key is given', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:show'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('app');
    expect(s.text().out).not.toContain('s3cr3t');
    expect(s.text().out).not.toContain('postgres://u:p@h');
  });

  it('errors with exit 1 for a missing key', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:show', 'nope'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(1);
    expect(s.text().err).toContain('No configuration');
  });
});

describe('config:diff', () => {
  it('dumps the redacted config as additions without a baseline', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:diff'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    const out = s.text().out;
    expect(out).toContain('+ app.greeting = hi');
    expect(out).toContain('[redacted]');
    expect(out).not.toContain('s3cr3t');
    expect(out).not.toContain('postgres://u:p@h');
  });

  it('diffs against a baseline file, redacting secrets', async () => {
    await writeFile(
      join(appDir, 'baseline.json'),
      JSON.stringify({ app: { greeting: 'old', gone: 'x' } }),
    );
    const s = liveStreams();
    const code = await run({
      argv: ['config:diff', 'baseline.json'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    const out = s.text().out;
    expect(out).toContain('~ app.greeting: old -> hi');
    expect(out).toContain('+ app.secret = [redacted]');
    expect(out).toContain('- app.gone = x');
    expect(out).toContain('+ db.url = [redacted]');
    expect(out).not.toContain('s3cr3t');
  });

  it('emits a machine-readable diff under --json', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:diff', '--json'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('"added"');
  });
});

describe('config:set', () => {
  it('sets a string value and echoes it', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:set', 'app.greeting', 'hola'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('hola');
  });

  it('coerces numeric and boolean literals', async () => {
    const s = liveStreams();
    await run({ argv: ['config:set', 'app.port', '8080'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    // Numeric literal is the number 8080, JSON-encoded as "8080" (no quotes).
    expect(s.text().out).toContain('Set app.port = 8080');
    const t = liveStreams();
    await run({ argv: ['config:set', 'app.live', 'true'], cwd: appDir, stdout: t.stdout, stderr: t.stderr });
    expect(t.text().out).toContain('Set app.live = true');
  });

  it('emits a JSON envelope under --json', async () => {
    const s = liveStreams();
    await run({ argv: ['config:set', 'app.count', '3', '--json'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(s.text().out).toContain('"app.count"');
  });
});

describe('config:validate', () => {
  it('reports a healthy config when nothing is wrong', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:validate'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('healthy');
  });

  it('scopes validation to a key', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['config:validate', 'app'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
  });
});
