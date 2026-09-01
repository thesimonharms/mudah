import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Application } from './application.js';

/**
 * Base class for Mudah service providers.
 *
 * - Override {@link register} to bind services into the container. Runs for
 *   every provider before any `boot()`.
 * - Override {@link boot} for work that depends on other providers having
 *   registered (subscribing events, registering commands, …).
 *
 * Both hooks are async-first: use `async register()` when doing I/O — the
 * kernel always awaits each hook in registration order.
 */
export abstract class ServiceProvider {
  constructor(protected readonly app: Application) {}

  register(): void | Promise<void> {}

  boot(): void | Promise<void> {}

  /**
   * Called when the application is shutting down.
   * Use this to release resources (close DB connections, stop timers, etc.).
   */
  onShutdown(): void | Promise<void> {}

  /**
   * Called when a config value is mutated.
   * @param key The dotted key that changed.
   */
  onConfigChanged(key: string): void | Promise<void> {}

  /**
   * Import a config file and merge it as defaults under `key`
   * (existing values win).
   */
  protected async mergeConfigFrom(path: string, key: string): Promise<void> {
    const resolved = isAbsolute(path) ? path : join(this.app.basePath, path);
    const mod = await import(pathToFileURL(resolved).href);
    const defaults = mod.default ?? mod;
    this.app.config().merge(key, defaults as Record<string, unknown>);
  }
}
