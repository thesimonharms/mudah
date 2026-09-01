import { describe, expect, it } from 'vitest';
import {
  ServiceProvider,
  discoverPlugins,
  findPluginPackages,
  loadPlugin,
} from '@mudah-cli/core';
import { MockPluginRegistry, createMockPlugin } from '@mudah-cli/testing';

class DemoProvider extends ServiceProvider {
  register(): void {
    this.app.singleton('demo-marker', () => 'ok');
  }
}

class OtherProvider extends ServiceProvider {
  register(): void {}
}

class DemoCommand {
  signature = 'demo:run';
  async handle(): Promise<void> {}
}

describe('createMockPlugin', () => {
  it('returns a PluginInfo-like object with defaults', () => {
    const plugin = createMockPlugin({
      name: 'demo-plugin',
      providers: [DemoProvider],
      commands: [DemoCommand],
    });
    expect(plugin.name).toBe('demo-plugin');
    expect(plugin.keywords).toEqual(['mudah-plugin']);
    expect(plugin.providers).toEqual([DemoProvider]);
    expect(plugin.commands).toHaveLength(1);
    expect(plugin.commands[0]?.default).toBe(DemoCommand);
    expect(plugin.module['providers']).toEqual([DemoProvider]);
    expect(plugin.module['commands']).toEqual([DemoCommand]);
  });

  it('honors custom keywords and CommandModule entries', () => {
    const plugin = createMockPlugin({
      name: 'alt-plugin',
      keywords: ['my-plugin'],
      commands: [{ default: DemoCommand }],
    });
    expect(plugin.keywords).toEqual(['my-plugin']);
    expect(plugin.commands[0]?.default).toBe(DemoCommand);
  });
});

describe('MockPluginRegistry', () => {
  it('registers, lists, and clears plugins', () => {
    const registry = new MockPluginRegistry();
    registry.register({ name: 'alpha-plugin', providers: [DemoProvider] });
    registry.register(createMockPlugin({ name: 'beta-plugin', providers: [OtherProvider] }));
    expect(registry.list().map((plugin) => plugin.name)).toEqual(['alpha-plugin', 'beta-plugin']);
    registry.clear();
    expect(registry.list()).toEqual([]);
  });

  it('supplies injectables that findPluginPackages can use without disk', async () => {
    const registry = new MockPluginRegistry();
    registry.register({ name: 'demo-plugin', providers: [DemoProvider] });
    registry.register({ name: 'plain-dep', keywords: [] });
    const options = registry.asDiscoveryOptions();
    expect(await findPluginPackages('/app', options)).toEqual(['demo-plugin']);
  });

  it('loads providers and commands through discoverPlugins', async () => {
    const registry = new MockPluginRegistry();
    registry.register({
      name: 'demo-plugin',
      providers: [DemoProvider],
      commands: [DemoCommand],
    });
    const plugins = await discoverPlugins('/app', registry.asDiscoveryOptions());
    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.name).toBe('demo-plugin');
    expect(plugins[0]?.providers).toEqual([DemoProvider]);
    expect(plugins[0]?.commands[0]?.default).toBe(DemoCommand);
  });

  it('resolves scoped package names', async () => {
    const registry = new MockPluginRegistry();
    registry.register({ name: '@acme/audit', providers: [DemoProvider] });
    const options = registry.asDiscoveryOptions();
    expect(await findPluginPackages('/app', options)).toEqual(['@acme/audit']);
    const info = await loadPlugin('@acme/audit', '/app', options);
    expect(info.providers).toEqual([DemoProvider]);
  });

  it('honors include / exclude / keyword via the returned options', async () => {
    const registry = new MockPluginRegistry();
    registry.register({ name: 'demo-plugin', keywords: ['custom-kw'] });
    const base = registry.asDiscoveryOptions();
    expect(await findPluginPackages('/app', { ...base, keyword: 'custom-kw' })).toEqual([
      'demo-plugin',
    ]);
    expect(await findPluginPackages('/app', { ...base, keyword: 'mudah-plugin' })).toEqual([]);
    expect(await findPluginPackages('/app', { ...base, include: ['demo-plugin'] })).toEqual([
      'demo-plugin',
    ]);
    expect(
      await findPluginPackages('/app', { ...base, include: ['demo-plugin'], exclude: ['demo-plugin'] }),
    ).toEqual([]);
  });
});
