import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TestApp } from '@mudah-cli/mudah/testing';
import {
  Application,
  findPluginPackages,
  formatUpdateNudge,
  run,
} from '@mudah-cli/mudah';
import {
  AuditLastCommand,
  AuditProvider,
} from '@thesimonharms/deploy-audit';

const appDir = fileURLToPath(new URL('..', import.meta.url));

/** Capture a full `run()` invocation into strings. */
async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const state = { out: '', err: '' };
  const code = await run({
    argv,
    cwd: appDir,
    disablePlugins: true,
    allowThemeQuery: false,
    stdout: { write: (data: string) => void (state.out += data) },
    stderr: { write: (data: string) => void (state.err += data) },
  });
  return { code, out: state.out, err: state.err };
}

describe('grouped commands', () => {
  it('runs the group default for a bare namespace', async () => {
    const result = await cli(['deploy']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Deploying staging');
  });

  it('runs a grouped command by its full name', async () => {
    const result = await cli(['deploy:run', 'production']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('production');
  });

  it('rejects an unknown environment', async () => {
    const result = await cli(['deploy:run', 'nowhere']);
    expect(result.code).toBe(2);
    // Output mode is plain here, so errors arrive as data events; the hint
    // carries the same wording either way.
    expect(result.out).toContain('Expected one of: staging, production');
  });

  it('honors --dry-run and --replicas', async () => {
    const result = await cli(['deploy:run', 'staging', '--dry-run', '--replicas=7']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Planning staging');
    expect(result.out).toContain('7');
  });

  it('lists groups under their own headers', async () => {
    const result = await cli(['--help']);
    expect(result.out).toContain('deploy:');
    expect(result.out).toContain('deploy:run');
    expect(result.out).toContain('db:');
    expect(result.out).toContain('db:status');
    expect(result.out).toContain('Commands:');
  });
});

describe('config schema validation', () => {
  it('validates the shipped config on load', async () => {
    const result = await cli(['db:status']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Migrations');
  });

  it('rejects a config value that breaks the schema', async () => {
    const { Application, s } = await import('@mudah-cli/mudah');
    const app = new Application(appDir, { name: 'x', version: '1.0.0', bin: 'x' });
    app.config().set('deploy', { defaultEnvironment: 'nowhere' });
    const result = app.config().validate(
      'deploy',
      s.object({ defaultEnvironment: s.enum(['staging', 'production'] as const) }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.path).toBe('deploy.defaultEnvironment');
  });
});

describe('--profile', () => {
  it('prints boot and command timings', async () => {
    const result = await cli(['db:status', '--profile']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('stage');
    expect(result.out).toContain('DeployProvider.register');
    expect(result.out).toContain('command db:status');
  });

  it('adds a boot block under --json', async () => {
    const result = await cli(['db:status', '--profile', '--json']);
    const envelope = JSON.parse(result.out.trim().split('\n').at(-1) ?? '{}') as {
      boot?: { providers: unknown[] };
    };
    expect(envelope.boot?.providers.length).toBeGreaterThan(0);
  });
});

describe('theme command', () => {
  it('reports the resolved theme', async () => {
    const result = await cli(['theme']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('resolved');
    expect(result.out).toContain('sleek');
  });
});

describe('TUI widgets', () => {
  it('renders a table, panel, and scrolling viewport', async () => {
    const { Container, Label, Panel, Table, Viewport } = await import('@mudah-cli/mudah/tui');

    const table = new Table(
      [{ header: 'service' }, { header: 'status', align: 'right' as const }],
      Array.from({ length: 30 }, (_, i) => [`svc-${i}`, i % 2 === 0 ? 'healthy' : 'degraded']),
    );
    const viewport = new Viewport(table, 10);
    const container = new Container().add(new Label('Deploy Console'), new Panel('Summary', ['x']), viewport);

    const rendered = container.render();
    expect(rendered.length).toBeGreaterThan(10);

    // The viewport clips a 30-row table down to its declared height.
    expect(viewport.render()).toHaveLength(10);
    viewport.onKey({ name: 'down' });
    expect(viewport.scrollTop).toBe(1);
  });

  it('scrolls the table with the mouse wheel', async () => {
    const { Table } = await import('@mudah-cli/mudah/tui');
    const table = new Table([{ header: 'a' }], [['1'], ['2'], ['3']]);
    const wheelDown = {
      x: 0,
      y: 0,
      buttons: { left: false, middle: false, right: false, extra: false },
      hover: false,
      release: false,
      drag: false,
      shift: false,
      alt: false,
      ctrl: false,
      wheel: 'down' as const,
    };
    expect(table.onMouse(wheelDown)).toBe(true);
    expect(table.selectedIndex).toBe(1);
  });
});

describe('update nudge', () => {
  it('formats a one-line notice when a newer version exists', () => {
    const line = formatUpdateNudge(
      {
        updateAvailable: true,
        currentVersion: '0.1.0',
        latestVersion: '0.2.0',
        kind: 'minor',
        checked: true,
        source: 'registry',
      },
      'deploy',
    );
    expect(line).toContain('0.1.0');
    expect(line).toContain('0.2.0');
    expect(line).toContain('deploy');
  });

  it('stays quiet when nothing is newer', () => {
    expect(
      formatUpdateNudge(
        {
          updateAvailable: false,
          currentVersion: '0.1.0',
          latestVersion: '0.1.0',
          checked: true,
          reason: 'cached-no-update',
          source: 'cache',
        },
        'deploy',
      ),
    ).toBeNull();
  });
});

describe('plugin from node_modules', () => {
  it('discovers the audit plugin by its mudah-plugin keyword', async () => {
    const names = await findPluginPackages(appDir);
    expect(names).toContain('@thesimonharms/deploy-audit');
  });

  it('runs a command the plugin ships', async () => {
    const app = new Application(appDir);
    app.register(AuditProvider);

    const state = { out: '', err: '' };
    const code = await run({
      app,
      argv: ['audit:last'],
      cwd: appDir,
      disablePlugins: true,
      allowThemeQuery: false,
      commands: [{ default: AuditLastCommand }],
      stdout: { write: (data: string) => void (state.out += data) },
      stderr: { write: (data: string) => void (state.err += data) },
    });
    expect(code).toBe(0);
    expect(state.out).toContain('production');
    expect(state.out).toContain('@thesimonharms/deploy-audit');
  });
});

describe('TestApp', () => {
  it('dispatches a grouped command in-process', async () => {
    const app = await TestApp.create({ cwd: appDir });
    const result = await app.dispatch(['db:status']);
    result.exit(0).outContains('Migrations');
  });
});
