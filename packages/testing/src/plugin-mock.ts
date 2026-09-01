import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  CommandClass,
  CommandModule,
  PluginDiscoveryOptions,
  PluginInfo,
  ProviderClass,
} from '@mudah-cli/core';

export interface MockPluginOptions {
  name: string;
  providers?: readonly ProviderClass[];
  commands?: readonly CommandModule[] | readonly CommandClass[];
  keywords?: readonly string[];
}

/**
 * A {@link PluginInfo}-shaped plugin plus the extras the mock registry
 * needs to serve `resolve` / `readPackage` / `importModule`.
 */
export interface MockPlugin extends PluginInfo {
  readonly keywords: readonly string[];
  /** Module object returned by the injectable `importModule`. */
  readonly module: Record<string, unknown>;
}

/**
 * Build a plugin fixture that `discoverPlugins` / `loadPlugin` can load
 * through {@link MockPluginRegistry.asDiscoveryOptions}.
 */
export function createMockPlugin(options: MockPluginOptions): MockPlugin {
  const providers = options.providers ?? [];
  const commandClasses = (options.commands ?? []).map((entry) =>
    isCommandModule(entry) ? entry.default : entry,
  );
  const commands: CommandModule[] = commandClasses.map((ctor) => ({ default: ctor }));
  const keywords = options.keywords ?? ['mudah-plugin'];

  const module: Record<string, unknown> = {};
  if (providers.length > 0) module['providers'] = [...providers];
  if (commandClasses.length > 0) module['commands'] = [...commandClasses];
  for (const provider of providers) {
    if (provider.name) module[provider.name] = provider;
  }

  return { name: options.name, providers, commands, keywords, module };
}

/**
 * In-memory plugin graph for kernel tests. Supplies the three injectables
 * on {@link PluginDiscoveryOptions} so discovery never touches disk.
 *
 * ```ts
 * const registry = new MockPluginRegistry();
 * registry.register(createMockPlugin({ name: 'demo-plugin', providers: [DemoProvider] }));
 * const plugins = await discoverPlugins('/app', registry.asDiscoveryOptions());
 * ```
 */
export class MockPluginRegistry {
  private readonly plugins = new Map<string, MockPlugin>();

  register(plugin: MockPlugin | MockPluginOptions): this {
    const mock = isMockPlugin(plugin) ? plugin : createMockPlugin(plugin);
    this.plugins.set(mock.name, mock);
    return this;
  }

  list(): MockPlugin[] {
    return [...this.plugins.values()];
  }

  clear(): void {
    this.plugins.clear();
  }

  /**
   * Injectable discovery options matching `packages/core/src/plugins.ts`
   * {@link PluginDiscoveryOptions}: `resolve`, `readPackage`, `importModule`.
   */
  asDiscoveryOptions(): PluginDiscoveryOptions {
    return {
      resolve: (name: string, from: string): string => this.resolve(name, from),
      readPackage: (path: string): Promise<unknown> => this.readPackage(path),
      importModule: (url: string): Promise<Record<string, unknown>> => this.importModule(url),
    };
  }

  private resolve(name: string, from: string): string {
    return pathToFileURL(join(from, 'node_modules', name, 'index.js')).href;
  }

  private async readPackage(path: string): Promise<unknown> {
    const normalized = path.replace(/\\/g, '/');
    const plugin = this.pluginForManifest(normalized);
    if (plugin !== undefined) {
      return {
        name: plugin.name,
        main: 'index.js',
        keywords: [...plugin.keywords],
      };
    }
    if (normalized.endsWith('/package.json') && !normalized.includes('/node_modules/')) {
      return {
        name: 'mock-host',
        dependencies: Object.fromEntries([...this.plugins.keys()].map((name) => [name, '0.0.0'])),
      };
    }
    throw new Error(`[testing] no mock manifest at ${path}`);
  }

  private async importModule(url: string): Promise<Record<string, unknown>> {
    const name = this.pluginNameFromUrl(url);
    const plugin = name === undefined ? undefined : this.plugins.get(name);
    if (plugin === undefined) throw new Error(`[testing] cannot import ${url}`);
    return { ...plugin.module };
  }

  private pluginForManifest(normalizedPath: string): MockPlugin | undefined {
    for (const plugin of this.plugins.values()) {
      if (normalizedPath.includes(`/node_modules/${plugin.name}/package.json`)) return plugin;
    }
    return undefined;
  }

  private pluginNameFromUrl(url: string): string | undefined {
    const path = url.startsWith('file:') ? new URL(url).pathname : url;
    const normalized = path.replace(/\\/g, '/');
    for (const name of this.plugins.keys()) {
      if (normalized.includes(`/node_modules/${name}/`)) return name;
    }
    const match = /\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(normalized);
    return match?.[1];
  }
}

function isCommandModule(value: CommandModule | CommandClass): value is CommandModule {
  return typeof value === 'object' && value !== null && 'default' in value;
}

function isMockPlugin(value: MockPlugin | MockPluginOptions): value is MockPlugin {
  return 'module' in value && 'keywords' in value && 'providers' in value && 'commands' in value;
}
