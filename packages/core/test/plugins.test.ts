import { describe, expect, it } from 'vitest';
import {
  Application,
  ServiceProvider,
  discoverPlugins,
  findPluginPackages,
  loadPlugin,
  type PluginDiscoveryOptions,
} from '@mudah-cli/core';

/**
 * Build discovery options backed by an in-memory package graph, so the
 * tests never touch a real node_modules.
 */
function fakeRegistry(
  graph: Record<string, { keywords?: string[] }>,
  modules: Record<string, Record<string, unknown>> = {},
  hostDeps: string[] = Object.keys(graph),
): PluginDiscoveryOptions & { imported: string[] } {
  const imported: string[] = [];

  const readPackage = async (path: string): Promise<unknown> => {
    if (path.endsWith('/package.json') && !path.includes('node_modules')) {
      return { name: 'host-app', dependencies: Object.fromEntries(hostDeps.map((d) => [d, '^1.0.0'])) };
    }
    for (const [name, pkg] of Object.entries(graph)) {
      if (path.includes(`/node_modules/${name}/package.json`)) {
        return { name, main: 'index.js', keywords: pkg.keywords ?? [] };
      }
    }
    throw new Error(`no manifest at ${path}`);
  };

  return {
    imported,
    readPackage,
    resolve: async (name: string): Promise<string> =>
      `file:///app/node_modules/${name}/index.js`,
    importModule: async (url: string): Promise<Record<string, unknown>> => {
      imported.push(url);
      const name = /node_modules\/([^/]+)\//.exec(url)?.[1] ?? '';
      const mod = modules[name];
      if (mod === undefined) throw new Error(`cannot import ${name}`);
      return mod;
    },
  };
}

class PluginProvider extends ServiceProvider {
  register(): void {
    this.app.singleton('plugin-marker', () => 'loaded');
  }
}

const withKeyword = { 'demo-plugin': { keywords: ['mudah-plugin'] } };

describe('findPluginPackages', () => {
  it('finds a dependency declaring the plugin keyword', async () => {
    const options = fakeRegistry(withKeyword);
    expect(await findPluginPackages('/app', options)).toEqual(['demo-plugin']);
  });

  it('ignores dependencies without the keyword', async () => {
    const options = fakeRegistry({ 'plain-dep': { keywords: [] } });
    expect(await findPluginPackages('/app', options)).toEqual([]);
  });

  it('ignores packages declaring other keywords', async () => {
    const options = fakeRegistry({ 'demo-plugin': { keywords: ['cli', 'tool'] } });
    expect(await findPluginPackages('/app', options)).toEqual([]);
  });

  it('honors a custom keyword', async () => {
    const options = fakeRegistry({ 'demo-plugin': { keywords: ['my-plugin'] } });
    expect(await findPluginPackages('/app', { ...options, keyword: 'my-plugin' })).toEqual([
      'demo-plugin',
    ]);
  });

  it('honors explicit includes regardless of keyword', async () => {
    const options = fakeRegistry({ 'demo-plugin': { keywords: [] } });
    expect(
      await findPluginPackages('/app', { ...options, include: ['demo-plugin'] }),
    ).toEqual(['demo-plugin']);
  });

  it('honors excludes', async () => {
    const options = fakeRegistry(withKeyword);
    expect(await findPluginPackages('/app', { ...options, exclude: ['demo-plugin'] })).toEqual([]);
  });

  it('returns results sorted and deduplicated', async () => {
    const options = fakeRegistry({
      'zeta-plugin': { keywords: ['mudah-plugin'] },
      'alpha-plugin': { keywords: ['mudah-plugin'] },
    });
    expect(await findPluginPackages('/app', options)).toEqual(['alpha-plugin', 'zeta-plugin']);
  });

  it('finds a workspace package whose resolved path no longer contains the name', async () => {
    const options: PluginDiscoveryOptions = {
      readPackage: async (path: string): Promise<unknown> => {
        if (path === '/app/package.json') {
          return { name: 'host', dependencies: { '@acme/deploy-audit': '1.0.0' } };
        }
        if (path === '/workspace/audit/package.json') {
          return { name: '@acme/deploy-audit', keywords: ['mudah-plugin'] };
        }
        throw new Error(`no manifest at ${path}`);
      },
      resolve: async (): Promise<string> => 'file:///workspace/audit/src/index.js',
    };
    expect(await findPluginPackages('/app', options)).toEqual(['@acme/deploy-audit']);
  });
});

describe('loadPlugin', () => {
  it('collects a provider class exported by name', async () => {
    const options = fakeRegistry(withKeyword, {
      'demo-plugin': { PluginProvider },
    });
    const info = await loadPlugin('demo-plugin', '/app', options);
    expect(info.name).toBe('demo-plugin');
    expect(info.providers).toEqual([PluginProvider]);
  });

  it('collects a providers array', async () => {
    class Other extends ServiceProvider {}
    const options = fakeRegistry(withKeyword, {
      'demo-plugin': { providers: [PluginProvider, Other] },
    });
    const info = await loadPlugin('demo-plugin', '/app', options);
    expect(info.providers).toEqual([PluginProvider, Other]);
  });

  it('falls back to a default export that is a provider', async () => {
    const options = fakeRegistry(withKeyword, {
      'demo-plugin': { default: PluginProvider },
    });
    const info = await loadPlugin('demo-plugin', '/app', options);
    expect(info.providers).toEqual([PluginProvider]);
  });

  it('ignores non-provider exports', async () => {
    const options = fakeRegistry(withKeyword, {
      'demo-plugin': { notAProvider: 42, helper: (): void => {} },
    });
    const info = await loadPlugin('demo-plugin', '/app', options);
    expect(info.providers).toEqual([]);
  });

  it('collects command modules from a commands array', async () => {
    class DemoCommand {
      signature = 'demo:run';
      async handle(): Promise<void> {}
    }
    const options = fakeRegistry(withKeyword, {
      'demo-plugin': { commands: [DemoCommand] },
    });
    const info = await loadPlugin('demo-plugin', '/app', options);
    expect(info.commands).toHaveLength(1);
    expect(info.commands[0]?.default).toBe(DemoCommand);
  });

  it('falls back to a default export that is a command', async () => {
    class DemoCommand {
      signature = 'demo:run';
      async handle(): Promise<void> {}
    }
    const options = fakeRegistry(withKeyword, { 'demo-plugin': { default: DemoCommand } });
    const info = await loadPlugin('demo-plugin', '/app', options);
    expect(info.commands).toHaveLength(1);
  });

  it('imports by the URL the resolver returned', async () => {
    const options = fakeRegistry(withKeyword, { 'demo-plugin': { PluginProvider } });
    await loadPlugin('demo-plugin', '/app', options);
    expect(options.imported).toEqual(['file:///app/node_modules/demo-plugin/index.js']);
  });
});

describe('discoverPlugins', () => {
  it('loads every discovered plugin', async () => {
    const options = fakeRegistry(
      {
        'alpha-plugin': { keywords: ['mudah-plugin'] },
        'beta-plugin': { keywords: ['mudah-plugin'] },
      },
      {
        'alpha-plugin': { AlphaPluginProvider: PluginProvider },
        'beta-plugin': { BetaPluginProvider: PluginProvider },
      },
    );
    const plugins = await discoverPlugins('/app', options);
    expect(plugins.map((p) => p.name)).toEqual(['alpha-plugin', 'beta-plugin']);
  });

  it('skips a plugin that fails to import', async () => {
    const options = fakeRegistry(
      {
        'good-plugin': { keywords: ['mudah-plugin'] },
        'broken-plugin': { keywords: ['mudah-plugin'] },
      },
      { 'good-plugin': { PluginProvider } },
    );
    const plugins = await discoverPlugins('/app', options);
    expect(plugins.map((p) => p.name)).toEqual(['good-plugin']);
  });

  it('returns nothing when there are no plugins', async () => {
    const options = fakeRegistry({ 'plain-dep': { keywords: [] } });
    expect(await discoverPlugins('/app', options)).toEqual([]);
  });
});

describe('Application.discoverPlugins', () => {
  it('registers each plugin provider so it boots', async () => {
    const app = new Application('/app', {
      name: 'host',
      version: '1.0.0',
      bin: 'host',
    });
    const options = fakeRegistry(withKeyword, {
      'demo-plugin': { PluginProvider },
    });

    const plugins = await app.discoverPlugins(options);
    expect(plugins).toHaveLength(1);

    await app.boot();
    expect(app.make<string>('plugin-marker')).toBe('loaded');
  });

  it('is a no-op when nothing declares the keyword', async () => {
    const app = new Application('/app', { name: 'host', version: '1.0.0', bin: 'host' });
    const plugins = await app.discoverPlugins(fakeRegistry({ 'plain-dep': { keywords: [] } }));
    expect(plugins).toEqual([]);
  });
});
