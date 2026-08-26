import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConfigRepository } from '@mudah-cli/config';
import { Container, isClassLike, type Abstract, type Constructor } from '@mudah-cli/container';
import { EventBus } from './events.js';
import { loadManifest, type MudahManifest } from './manifest.js';
import { ServiceProvider } from './service-provider.js';

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
   * Set `MUDAH_BOOT_PROFILE=1` to print per-hook timings on stderr.
   */
  async boot(): Promise<void> {
    if (this.booted) return;

    const profile = process.env['MUDAH_BOOT_PROFILE'] === '1';
    const timings: string[] = [];
    const started = performance.now();

    for (const Provider of this.providers) {
      const provider = new Provider(this);
      const t0 = profile ? performance.now() : 0;
      await provider.register?.();
      if (profile) timings.push(`${Provider.name}.register=${Math.round(performance.now() - t0)}ms`);
    }
    for (const Provider of this.providers) {
      const provider = new Provider(this);
      const t0 = profile ? performance.now() : 0;
      await provider.boot?.();
      if (profile) timings.push(`${Provider.name}.boot=${Math.round(performance.now() - t0)}ms`);
    }

    if (profile) {
      console.error(`[boot-profile] total=${Math.round(performance.now() - started)}ms ${timings.join(' ')}`);
    }

    this.booted = true;
    await this.events().emit('app.booted', { app: this });
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
