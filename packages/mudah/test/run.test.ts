import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, createWatcher } from '@mudah-cli/mudah';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const appDir = join(testDir, '.fixtures', 'app');

function liveStreams(): { stdout: { write(data: string): void }; stderr: { write(data: string): void }; text: () => { out: string; err: string } } {
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
  await mkdir(join(appDir, 'bin'), { recursive: true });
  await writeFile(
    join(appDir, 'mudah.json'),
    JSON.stringify({ name: 'fixture-app', version: '0.1.0', bin: 'fixture' }),
  );
  await writeFile(
    join(appDir, 'src', 'commands', 'hello.command.ts'),
    `import { Command } from '@mudah-cli/console';
export default class HelloCommand extends Command {
  signature = 'hello {name?}';
  description = 'Say hello';
  async handle() {
    this.output.success(\`hello \${this.arg('name') ?? 'there'}\`);
  }
}
`,
  );
  await writeFile(join(appDir, 'bin', 'fixture'), '#!/usr/bin/env node\nconsole.log("stub");\n');
});

afterAll(async () => {
  await rm(appDir, { recursive: true, force: true });
});

describe('run()', () => {
  it('dispatches to a discovered app command', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['hello', 'world'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('hello world');
  });

  it('applies optional argument defaults', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['hello'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('hello there');
  });

  it('lists all commands for --help (including built-ins)', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['--help'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    const out = s.text().out;
    expect(out).toContain('fixture-app v0.1.0');
    expect(out).toContain('hello');
    expect(out).toContain('doctor');
    expect(out).toContain('make');
    expect(out).toContain('dev');
  });

  it('renders per-command help', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['hello', '--help'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('Usage: fixture-app hello {name?}');
  });

  it('runs the version command', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['version'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('fixture-app v0.1.0');
  });

  it('runs doctor and reports the environment', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['doctor'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    const out = s.text().out;
    expect(out).toContain('Runtime');
    expect(out).toContain('Application');
    expect(out).toContain('Terminal');
  });

  it('scaffolds new commands with make', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['make', 'command', 'ping'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    const file = join(appDir, 'src', 'commands', 'ping.command.ts');
    expect(existsSync(file)).toBe(true);
    const content = await readFile(file, 'utf8');
    expect(content).toContain('class Ping');
    expect(content).toContain("signature = 'ping {target?}'");
  });

  it('rejects invalid make input with a usage error', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['make', 'widget', 'x'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(2);
    expect(s.text().err).toContain('Unknown make type');
  });

  it('returns 2 with a hint for unknown commands', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['nope'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(2);
    expect(s.text().err).toContain('Unknown command "nope"');
    expect(s.text().err).toContain('Hint:');
  });

  it('returns 1 with a friendly message when the manifest is missing', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['hello'], cwd: '/nonexistent-app', stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(1);
    expect(s.text().err).toContain('manifest');
  });

  it('exposes the global --version flag', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['--version'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('fixture-app v0.1.0');
  });
});

describe('createWatcher', () => {
  it('emits debounced change events', async () => {
    const dir = join(testDir, '.fixtures', 'watch');
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'a.txt'), '1');

    let changes = 0;
    const stop = createWatcher([dir], () => {
      changes++;
    }, { debounceMs: 50 });

    await new Promise((r) => setTimeout(r, 100));
    await writeFile(join(dir, 'a.txt'), '2');
    await writeFile(join(dir, 'b.txt'), '3');

    const deadline = Date.now() + 3000;
    while (changes === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    stop();
    expect(changes).toBeGreaterThanOrEqual(1);
    await rm(dir, { recursive: true, force: true });
  });
});
