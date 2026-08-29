import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigRepository } from '@mudah-cli/config';
import { Container, isClassLike, type Abstract, type Constructor } from '@mudah-cli/container';
import { EventBus } from './events.js';
import { loadManifest, type MudahManifest } from './manifest.js';
import { discoverPlugins, type PluginDiscoveryOptions, type PluginInfo } from './plugins.js';
import { ServiceProvider } from './service-provider.js';
import { installTsJsResolveHook } from './ts-js-hook.js';

export type ProviderClass = new (app: Application) => ServiceProvider;

export interface LazyProviderOptions {
  /** Boot this provider when one of these commands is invoked. */
  commands?: string[];
  /** Boot this provider when one of these bindings is resolved. */
  bindings?: readonly Abstract[];
  /** Boot this provider when the predicate returns true (checked on demand). */
  bootWhen?: (app: Application) => boolean;
}

interface LazyRegistration {
  provider: ProviderClass;
  options: LazyProviderOptions;
}

export interface BootOptions {
  /** Collect per-hook timings (default: honors `MUDAH_BOOT_PROFILE=1`). */
  profile?: boolean;
}

/** One provider hook, timed. */
export interface ProviderTiming {
  /** Provider class name. */
  readonly provider: string;
  /** Which phase of the two-phase boot. */
  readonly hook: 'register' | 'boot';
  readonly durationMs: number;
}

/** Provider boot timings, for `--profile`. */
export interface BootProfile {
  /** Wall-clock time across both phases. */
  readonly totalMs: number;
  /** Timings in execution order: all `register` hooks, then all `boot` hooks. */
  readonly providers: readonly ProviderTiming[];
}

/** A command module: a module whose default export is a command class. */
export interface CommandModule {
  default: CommandClass;
}

export type CommandClass = Constructor<CommandShape>;

export interface CommandShape {
  signature?: string;
  description?: string;
  handle: (...args: unknown[]) => unknown;
}

/** Round to whole milliseconds — sub-ms noise tells us nothing here. */
function round(ms: number): number {
  return Math.round(ms);
}

/** True when the value is a class with a `handle` prototype method. */
export function isCommandExport(value: unknown): value is CommandClass {
  if (typeof value !== 'function' || !isClassLike(value)) return false;
  return typeof (value as { prototype: { handle?: unknown } }).prototype?.handle === 'function';
}

/**
 * The Mudah application kernel.
 *
 * An IoC container with a service-provider boot lifecycle:
 * two-phase provider boot (register → boot), lazy providers keyed on
 * commands/bindings, and auto-discovery of `src/providers` and `src/commands`.
 */
export class Application extends Container {
  readonly basePath: string;
  readonly manifest: MudahManifest;

  private readonly providers: ProviderClass[] = [];
  private readonly lazyProviders: LazyRegistration[] = [];
  private readonly bootedLazy = new Set<ProviderClass>();
  private booted = false;

  constructor(basePath: string = process.cwd(), manifest?: MudahManifest) {
    super();
    installTsJsResolveHook();
    this.basePath = basePath;
    this.manifest = manifest ?? loadManifest(basePath);
    this.singleton('app', () => this);
    this.singleton('config', () => new ConfigRepository());
    this.singleton('events', () => new EventBus());
  }

  config(): ConfigRepository {
    return this.make('config');
  }

  events(): EventBus {
    return this.make('events');
  }

  /** Register a provider that always boots. */
  register(provider: ProviderClass): this {
    this.providers.push(provider);
    return this;
  }

  /**
   * Register a provider that boots lazily — only when a matching command is
   * invoked, a matching binding is resolved, or `bootWhen` returns true.
   */
  registerLazy(provider: ProviderClass, options: LazyProviderOptions = {}): this {
    this.lazyProviders.push({ provider, options });
    return this;
  }

  /**
   * Boot all registered providers in two phases, each in registration order:
   * 1. `register()` — container bindings
   * 2. `boot()` — everything else
   *
   * Returns per-hook timings when profiling is on (`{ profile: true }`, or
   * `MUDAH_BOOT_PROFILE=1`). The env var also prints the old one-line report
   * to stderr for anyone scripting against it.
   */
  async boot(options: BootOptions = {}): Promise<BootProfile | undefined> {
    // Boot is idempotent: providers already ran, so there is nothing to time.
    if (this.booted) return undefined;

    const profile = options.profile ?? process.env['MUDAH_BOOT_PROFILE'] === '1';
    const hooks: ProviderTiming[] = [];
    const started = performance.now();

    for (const Provider of this.providers) {
      const provider = new Provider(this);
      const t0 = profile ? performance.now() : 0;
      await provider.register?.();
      if (profile) {
        hooks.push({ provider: Provider.name, hook: 'register', durationMs: round(performance.now() - t0) });
      }
    }
    for (const Provider of this.providers) {
      const provider = new Provider(this);
      const t0 = profile ? performance.now() : 0;
      await provider.boot?.();
      if (profile) {
        hooks.push({ provider: Provider.name, hook: 'boot', durationMs: round(performance.now() - t0) });
      }
    }

    this.booted = true;
    await this.events().emit('app.booted', { app: this });

    if (!profile) return undefined;

    const result: BootProfile = {
      totalMs: round(performance.now() - started),
      providers: hooks,
    };
    if (process.env['MUDAH_BOOT_PROFILE'] === '1') {
      console.error(
        `[boot-profile] total=${result.totalMs}ms ${hooks
          .map((h) => `${h.provider}.${h.hook}=${h.durationMs}ms`)
          .join(' ')}`,
      );
    }
    return result;
  }

  /** Boot lazy providers that declared an interest in `command`. */
  async bootLazyForCommand(command: string): Promise<void> {
    for (const entry of this.lazyProviders) {
      if (this.bootedLazy.has(entry.provider)) continue;
      if (entry.options.commands?.includes(command)) {
        await this.bootLazy(entry.provider);
      }
    }
  }

  /** Boot lazy providers that declared an interest in `abstract`. */
  async bootLazyForBinding(abstract: Abstract): Promise<void> {
    for (const entry of this.lazyProviders) {
      if (this.bootedLazy.has(entry.provider)) continue;
      if (entry.options.bindings?.some((binding) => binding === abstract)) {
        await this.bootLazy(entry.provider);
      }
    }
  }

  /** Boot lazy providers whose `bootWhen` predicate currently returns true. */
  async evaluateLazy(): Promise<void> {
    for (const entry of this.lazyProviders) {
      if (this.bootedLazy.has(entry.provider)) continue;
      if (entry.options.bootWhen?.(this)) {
        await this.bootLazy(entry.provider);
      }
    }
  }

  private async bootLazy(provider: ProviderClass): Promise<void> {
    if (this.bootedLazy.has(provider)) return;
    this.bootedLazy.add(provider);
    const instance = new provider(this);
    await instance.register?.();
    await instance.boot?.();
  }

  /**
   * Discover and register every `*.provider.{ts,js}` in the given directory
   * (sorted for determinism). Exports whose name ends in `Provider` win.
   */
  async discoverProviders(dir: string = join(this.basePath, 'src', 'providers')): Promise<this> {
    for (const file of await this.listFiles(dir)) {
      const mod = await this.importFile(file);
      for (const value of Object.values(mod)) {
        if (typeof value === 'function' && /Provider$/.test((value as { name?: string }).name ?? '')) {
          this.register(value as ProviderClass);
          break;
        }
      }
    }
    return this;
  }

  /**
   * Discover plugins among installed packages and register what they
   * provide. A plugin is any dependency declaring the `mudah-plugin`
   * keyword; see {@link discoverPlugins}.
   *
   * Broken plugins are skipped rather than fatal — a third-party package
   * must never be able to take down the host app at boot.
   */
  async discoverPlugins(options: PluginDiscoveryOptions = {}): Promise<PluginInfo[]> {
    const plugins = await discoverPlugins(this.basePath, options);
    for (const plugin of plugins) {
      for (const provider of plugin.providers) this.register(provider);
    }
    return plugins;
  }

  /**
   * Discover command modules in the given directory (sorted). A command
   * module is any file whose default export is a class with `handle`.
   */
  async discoverCommandModules(dir: string = join(this.basePath, 'src', 'commands')): Promise<CommandModule[]> {
    const modules: CommandModule[] = [];
    for (const file of await this.listFiles(dir)) {
      const mod = await this.importFile(file);
      if (isCommandExport(mod.default)) {
        modules.push(mod as unknown as CommandModule);
      }
    }
    return modules;
  }

  /** Load an app-root-relative (or absolute) file as an ES module. */
  async importModule(path: string): Promise<Record<string, unknown>> {
    const resolved = path.startsWith('/') ? path : join(this.basePath, path);
    return this.importFile(resolved);
  }

  private async listFiles(dir: string): Promise<string[]> {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isFile() && /\.(ts|mts|js|mjs)$/.test(entry.name))
      .map((entry) => join(dir, entry.name))
      .sort();
  }

  private async importFile(file: string): Promise<Record<string, unknown>> {
    const mod = await import(pathToFileURL(file).href);
    return mod as Record<string, unknown>;
  }
}
