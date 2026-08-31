import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, createWatcher, Command } from '@mudah-cli/mudah';

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
  await writeFile(
    join(appDir, 'src', 'commands', 'db-migrate.command.ts'),
    `import { Command } from '@mudah-cli/console';
export default class DbMigrateCommand extends Command {
  signature = 'db:migrate {step?}';
  description = 'Run pending migrations';
  groupDescription = 'Database operations';
  async handle() {
    this.output.success(\`migrated \${this.arg('step') ?? 'all'}\`);
  }
}
`,
  );
  await writeFile(
    join(appDir, 'src', 'commands', 'db-status.command.ts'),
    `import { Command } from '@mudah-cli/console';
export default class DbStatusCommand extends Command {
  signature = 'db:status';
  description = 'Show migration status';
  async handle() {
    this.output.success('up to date');
  }
}
`,
  );
  await mkdir(join(appDir, 'src', 'providers'), { recursive: true });
  await writeFile(
    join(appDir, 'src', 'providers', 'FixtureProvider.ts'),
    `import { ServiceProvider } from '@mudah-cli/core';
export default class FixtureProvider extends ServiceProvider {
  register(): void { this.app.singleton('fixture', () => ({ ready: true })); }
  boot(): void { this.app.config().set('fixture.booted', true); }
}
`,
  );
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
    expect(out).toContain('TUI');
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

  it('scaffolds a TUI picker with make tui', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['make', 'tui', 'picker'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    const file = join(appDir, 'src', 'commands', 'picker.command.ts');
    expect(existsSync(file)).toBe(true);
    const content = await readFile(file, 'utf8');
    expect(content).toContain('Screen.picker');
    expect(content).toContain('screen.attach(program)');
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

  it('accepts a baked manifest (no mudah.json needed)', async () => {
    const s = liveStreams();
    const code = await run({
      argv: ['--version'],
      cwd: '/definitely/not/an/app',
      manifest: { name: 'bundled', version: '9.9.9', bin: 'bundled' },
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(s.text().out).toContain('bundled v9.9.9');
  });

  it('registers explicitly injected commands (bundled apps)', async () => {
    const s = liveStreams();
    const code = await run({
      argv: ['injected'],
      cwd: '/definitely/not/an/app',
      manifest: { name: 'bundled', version: '9.9.9', bin: 'bundled' },
      commands: [{ default: class extends Command {
        signature = 'injected';
        description = 'injected test command';
        override handle(): number { this.output.success('injected ran'); return 0; }
      } }],
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(s.text().out).toContain('injected ran');
  });

  it('injected commands lose to an already-registered name', async () => {
    const s = liveStreams();
    // 'version' is a built-in; the hostile duplicate must not replace it.
    const code = await run({
      argv: ['version'],
      cwd: appDir,
      commands: [{ default: class extends Command {
        signature = 'version';
        description = 'hostile duplicate';
        override handle(): number { this.output.error('hostile ran'); return 0; }
      } }],
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(s.text().out).toContain('fixture-app v0.1.0');
    expect(s.text().out).not.toContain('hostile ran');
    expect(code).toBe(0);
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

describe('output modes', () => {
  it('--json emits a machine-readable envelope with results', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['hello', '--json'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);

    const parsed = JSON.parse(s.text().out.trim().split('\n').at(-1)!) as {
      ok: boolean;
      command?: string;
      exitCode: number;
      results?: Array<{ kind: string; message: string }>;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.command).toBe('hello');
    expect(parsed.exitCode).toBe(0);
    const messages = (parsed.results ?? []).map((r) => r.message).join(' ');
    expect(messages.toLowerCase()).toContain('hello there');
    expect(s.text().out).not.toContain('✓');
  });

  it('--json reports usage errors as structured failures', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['nope', '--json'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(2);
    const parsed = JSON.parse(s.text().out.trim()) as {
      ok: boolean;
      exitCode: number;
      error?: { message: string; hint?: string };
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.exitCode).toBe(2);
    expect(parsed.error?.message).toContain('Unknown command "nope"');
    expect(parsed.error?.hint).toContain('--help');
  });

  it('--plain strips all ANSI from human output', async () => {
    const s = liveStreams();
    const code = await run({ argv: ['hello', '--plain'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(code).toBe(0);
    expect(s.text().out).toContain('hello there');
    expect(s.text().out).not.toContain('\x1b[');
  });
});

describe('--profile', () => {
  it('prints a timing table without disturbing the command', async () => {
    const s = liveStreams();
    const code = await run({
      argv: ['hello', 'world', '--profile'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(s.text().out).toContain('hello world');
    expect(s.text().out).toContain('stage');
    expect(s.text().out).toContain('total');
    expect(s.text().out).toMatch(/\d+ms/);
  });

  it('includes per-provider boot timings', async () => {
    const s = liveStreams();
    await run({
      argv: ['hello', '--profile'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(s.text().out).toContain('FixtureProvider.register');
    expect(s.text().out).toContain('FixtureProvider.boot');
    expect(s.text().out).toContain('command hello');
  });

  it('is stripped before dispatch, so commands never see it', async () => {
    const s = liveStreams();
    const code = await run({
      argv: ['hello', '--profile'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(s.text().out).not.toContain('Unknown option');
  });

  it('adds a boot block to the --json envelope', async () => {
    const s = liveStreams();
    await run({
      argv: ['hello', '--profile', '--json'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    const parsed = JSON.parse(s.text().out.trim().split('\n').at(-1)!) as {
      boot?: { totalMs: number; providers: Array<{ provider: string; hook: string; durationMs: number }> };
    };
    expect(parsed.boot).toBeDefined();
    expect(typeof parsed.boot?.totalMs).toBe('number');
    const names = (parsed.boot?.providers ?? []).map((p) => `${p.provider}.${p.hook}`);
    expect(names).toContain('FixtureProvider.register');
    expect(names).toContain('FixtureProvider.boot');
  });

  it('omits the boot block when not profiling', async () => {
    const s = liveStreams();
    await run({ argv: ['hello', '--json'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    const parsed = JSON.parse(s.text().out.trim().split('\n').at(-1)!) as { boot?: unknown };
    expect(parsed.boot).toBeUndefined();
  });

  it('stays silent without the flag', async () => {
    const s = liveStreams();
    await run({ argv: ['hello'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(s.text().out).not.toContain('stage');
  });
});

describe('command grouping', () => {
  it('dispatches a grouped command by its full name', async () => {
    const s = liveStreams();
    const code = await run({
      argv: ['db:migrate'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(s.text().out).toContain('migrated all');
  });

  it('passes arguments through to grouped commands', async () => {
    const s = liveStreams();
    const code = await run({
      argv: ['db:migrate', '3'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(code).toBe(0);
    expect(s.text().out).toContain('migrated 3');
  });

  it('renders grouped commands under a header', async () => {
    const s = liveStreams();
    await run({ argv: ['--help'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    expect(s.text().out).toContain('db:');
    expect(s.text().out).toContain('db:migrate');
    expect(s.text().out).toContain('db:status');
  });

  it('keeps ungrouped commands in the main list', async () => {
    const s = liveStreams();
    await run({ argv: ['--help'], cwd: appDir, stdout: s.stdout, stderr: s.stderr });
    const out = s.text().out;
    expect(out).toContain('hello');
    expect(out).toContain('Commands:');
  });

  it('shows per-command help for a grouped command', async () => {
    const s = liveStreams();
    await run({
      argv: ['db:migrate', '--help'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
    });
    expect(s.text().out).toContain('db:migrate');
    expect(s.text().out).toContain('Run pending migrations');
  });

  it('rejects a malformed group name at registration', async () => {
    const s = liveStreams();
    const code = await run({
      argv: ['--help'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
      commands: [
        {
          default: class extends Command {
            signature = 'db:';
            description = 'broken';
            async handle(): Promise<void> {}
          },
        },
      ],
    });
    // Registration failure is reported, not fatal to the whole run.
    expect(code).toBe(0);
    expect(s.text().err).toContain('Invalid command name');
  });
});

describe('update nudge', () => {
  const updatesDir = join(testDir, '.fixtures', 'cache');

  afterAll(async () => {
    await rm(updatesDir, { recursive: true, force: true });
  });

  it('stays quiet when no update package is configured', async () => {
    const s = liveStreams();
    await run({
      argv: ['hello'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
      env: { ...process.env, TERM: 'xterm-256color' },
      updatePackage: undefined,
      updateCacheDir: updatesDir,
    });
    expect(s.text().out).not.toContain('Update available');
  });

  it('does not block exit when the registry is unreachable', async () => {
    const s = liveStreams();
    // A closed port on localhost: connection refused, no network needed.
    const started = Date.now();
    const code = await run({
      argv: ['hello'],
      cwd: appDir,
      stdout: s.stdout,
      stderr: s.stderr,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        MUDAH_UPDATE_REGISTRY: 'http://127.0.0.1:9',
      },
      updatePackage: 'demo',
      updateCacheDir: updatesDir,
    });
    expect(code).toBe(0);
    expect(s.text().out).toContain('hello there');
    // The check is bounded by its own timeout, so a dead registry can't hang.
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
