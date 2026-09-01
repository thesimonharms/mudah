import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addMessages,
  createTelemetry,
  defaultMigrationTable,
  formatGraph,
  MigrationRunner,
  pluginGraph,
  setLocale,
  t,
  type Migration,
  type PluginInfo,
  type TelemetryEvent,
} from '@mudah-cli/core';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const tableDir = join(testDir, '.fixtures', 'migrations');

afterEach(() => {
  setLocale('en');
});

describe('i18n', () => {
  it('returns the default English string and interpolates vars', () => {
    expect(t('plugins.upToDate')).toBe('Plugins are up to date');
    expect(t('plugins.listed', { count: 3 })).toBe('3 plugin(s)');
  });

  it('falls back to en when the locale is missing a key', () => {
    addMessages('fr', { 'prompt.continue': 'Continuer ?' });
    setLocale('fr');
    expect(t('prompt.continue')).toBe('Continuer ?');
    expect(t('audit.clean')).toBe('No plugin issues found');
  });
});

describe('telemetry', () => {
  it('is silent when disabled', () => {
    const events: TelemetryEvent[] = [];
    const telemetry = createTelemetry({ enabled: false, sink: { record: (e) => events.push(e) } });
    telemetry.recordDuration('boot', 12);
    expect(events).toEqual([]);
  });

  it('records boot duration when enabled', () => {
    const events: TelemetryEvent[] = [];
    const telemetry = createTelemetry({ enabled: true, sink: { record: (e) => events.push(e) } });
    telemetry.recordDuration('boot', 18);
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('boot');
    expect(events[0]?.durationMs).toBe(18);
  });
});

describe('MigrationRunner', () => {
  it('is a no-op for an empty table', async () => {
    await rm(tableDir, { recursive: true, force: true });
    await mkdir(tableDir, { recursive: true });
    const file = defaultMigrationTable(tableDir);
    const runner = new MigrationRunner(file, []);
    const result = await runner.run('up');
    expect(result.applied).toEqual([]);
    expect(runner.load().applied).toEqual([]);
  });

  it('applies and rolls back a migration', async () => {
    await rm(tableDir, { recursive: true, force: true });
    const file = join(tableDir, 'migrations.json');
    await mkdir(tableDir, { recursive: true });
    await writeFile(file, '{"applied":[]}\n');
    const log: string[] = [];
    const migrations: Migration[] = [
      {
        id: '001-init',
        up: () => {
          log.push('up');
        },
        down: () => {
          log.push('down');
        },
      },
    ];
    const runner = new MigrationRunner(file, migrations);
    expect((await runner.run('up')).applied).toEqual(['001-init']);
    expect((await runner.run('down')).applied).toEqual(['001-init']);
    expect(log).toEqual(['up', 'down']);
  });
});

describe('pluginGraph', () => {
  it('renders ASCII edges', () => {
    const plugins = [
      { name: 'a', providers: [], commands: [] },
      { name: 'b', providers: [], commands: [], depends: ['a'] },
    ] as PluginInfo[];
    const graph = pluginGraph(plugins);
    expect(formatGraph(graph, 'ascii')).toContain('a -> b');
    expect(formatGraph(graph, 'dot')).toContain('"a" -> "b"');
  });
});
