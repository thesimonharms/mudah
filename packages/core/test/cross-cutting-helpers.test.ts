import { afterEach, describe, expect, it } from 'vitest';
import {
  addMessages,
  createTelemetry,
  formatGraph,
  pluginGraph,
  setLocale,
  t,
  type PluginInfo,
  type TelemetryEvent,
} from '@mudah-cli/core';

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
    expect(t('cache.empty')).toBe('Cache is empty');
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
