import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Application,
  EventBus,
  isCommandExport,
  loadManifest,
  MudahManifestError,
  ServiceProvider,
  type MudahManifest,
} from '@mudah-cli/core';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = join(testDir, '.fixtures');

const manifest: MudahManifest = { name: 'test-app', version: '0.0.1', bin: 'test-app' };

function freshApp(): Application {
  return new Application('/nonexistent', manifest);
}

beforeAll(async () => {
  await rm(fixturesDir, { recursive: true, force: true });
  await mkdir(join(fixturesDir, 'providers'), { recursive: true });
  await mkdir(join(fixturesDir, 'commands'), { recursive: true });
  await mkdir(join(fixturesDir, 'config'), { recursive: true });
});

afterAll(async () => {
  await rm(fixturesDir, { recursive: true, force: true });
});

describe('Application boot lifecycle', () => {
  it('runs two-phase boot: all register() hooks, then all boot() hooks', async () => {
    const order: string[] = [];
    class Alpha extends ServiceProvider {
      register(): void { order.push('alpha-register'); }
      boot(): void { order.push('alpha-boot'); }
    }
    class Beta extends ServiceProvider {
      register(): void { order.push('beta-register'); }
      boot(): void { order.push('beta-boot'); }
    }

    const app = freshApp();
    app.register(Alpha).register(Beta);
    await app.boot();

    expect(order).toEqual(['alpha-register', 'beta-register', 'alpha-boot', 'beta-boot']);
  });

  it('awaits async register() hooks before boot() runs', async () => {
    const order: string[] = [];
    class Slow extends ServiceProvider {
      async register(): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, 15));
        order.push('slow-register-done');
      }
      boot(): void {
        order.push('slow-boot');
      }
    }
    const app = freshApp();
    app.register(Slow);
    await app.boot();
    expect(order).toEqual(['slow-register-done', 'slow-boot']);
  });

  it('boots exactly once', async () => {
    let boots = 0;
    class Once extends ServiceProvider {
      boot(): void {
        boots += 1;
      }
    }
    const app = freshApp();
    app.register(Once);
    await app.boot();
    await app.boot();
    expect(boots).toBe(1);
  });

  it('emits app.booted with the application', async () => {
    const app = freshApp();
    const seen: unknown[] = [];
    app.events().on('app.booted', (payload) => {
      seen.push(payload.app);
    });
    await app.boot();
    expect(seen).toEqual([app]);
  });

  it('shares a single config repository', () => {
    const app = freshApp();
    expect(app.config()).toBe(app.config());
  });
});

describe('lazy providers', () => {
  it('boots only when a matching command is invoked', async () => {
    class DeployProvider extends ServiceProvider {
      static booted = false;
      register(): void {
        DeployProvider.booted = true;
      }
    }
    const app = freshApp();
    app.registerLazy(DeployProvider, { commands: ['deploy'] });
    await app.boot();
    expect(DeployProvider.booted).toBe(false);

    await app.bootLazyForCommand('hello');
    expect(DeployProvider.booted).toBe(false);

    await app.bootLazyForCommand('deploy');
    expect(DeployProvider.booted).toBe(true);

    await app.bootLazyForCommand('deploy');
    expect(DeployProvider.booted).toBe(true);
  });

  it('boots only when a matching binding is resolved', async () => {
    const key = Symbol.for('mudah:test-db');
    class DbProvider extends ServiceProvider {
      static booted = false;
      register(): void {
        DbProvider.booted = true;
      }
    }
    const app = freshApp();
    app.registerLazy(DbProvider, { bindings: [key] });
    await app.boot();
    expect(DbProvider.booted).toBe(false);

    await app.bootLazyForBinding('other');
    expect(DbProvider.booted).toBe(false);

    await app.bootLazyForBinding(key);
    expect(DbProvider.booted).toBe(true);
  });

  it('supports a bootWhen predicate', async () => {
    class FlagProvider extends ServiceProvider {
      static booted = false;
      register(): void {
        FlagProvider.booted = true;
      }
    }
    const app = freshApp();
    app.registerLazy(FlagProvider, {
      bootWhen: (a) => a.config().get<boolean>('features.flags', false) === true,
    });
    await app.evaluateLazy();
    expect(FlagProvider.booted).toBe(false);

    app.config().set('features.flags', true);
    await app.evaluateLazy();
    expect(FlagProvider.booted).toBe(true);
  });
});

describe('discovery', () => {
  it('discovers and boots *.provider.ts files from a directory', async () => {
    const file = join(fixturesDir, 'providers', 'OrderProvider.ts');
    await writeFile(
      file,
      `import { ServiceProvider } from '@mudah-cli/core';
export class OrderProvider extends ServiceProvider {
  register(): void { (globalThis as Record<string, unknown>).__mudah_order = true; }
}
`,
    );

    const app = freshApp();
    await app.discoverProviders(join(fixturesDir, 'providers'));
    await app.boot();

    expect((globalThis as Record<string, unknown>).__mudah_order).toBe(true);
    delete (globalThis as Record<string, unknown>).__mudah_order;
  });

  it('discovers command modules and skips non-commands', async () => {
    await writeFile(
      join(fixturesDir, 'commands', 'greet.command.ts'),
      `export default class Greet {
  signature = 'greet {name?}';
  async handle(): Promise<number> { return 0; }
}
`,
    );
    await writeFile(
      join(fixturesDir, 'commands', 'not-a-command.ts'),
      `export default { isNot: 'a command' };
`,
    );
    await writeFile(
      join(fixturesDir, 'commands', 'no-handle.ts'),
      `export default class NoHandle {
  signature = 'no-handle';
}
`,
    );

    const app = freshApp();
    const modules = await app.discoverCommandModules(join(fixturesDir, 'commands'));
    expect(modules).toHaveLength(1);
    expect(isCommandExport(modules[0]!.default)).toBe(true);
  });
});

describe('ServiceProvider helpers', () => {
  it('mergeConfigFrom merges file defaults under a key', async () => {
    const file = join(fixturesDir, 'config', 'feature.ts');
    await writeFile(file, `export default { enabled: true, retries: 3 };`);

    class FeatureProvider extends ServiceProvider {
      async register(): Promise<void> {
        await this.mergeConfigFrom(join(fixturesDir, 'config', 'feature.ts'), 'features');
      }
    }

    const app = freshApp();
    app.config().set('features.enabled', false);
    app.register(FeatureProvider);
    await app.boot();

    // Existing value wins, missing key is filled in.
    expect(app.config().get('features.enabled')).toBe(false);
    expect(app.config().get('features.retries')).toBe(3);
  });
});

describe('loadManifest', () => {
  it('loads a valid manifest', async () => {
    const dir = join(fixturesDir, 'manifest-ok');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'mudah.json'),
      JSON.stringify({ name: 'x', version: '1.0.0', bin: 'x', ui: { theme: 'sleek' } }),
    );
    const m = loadManifest(dir);
    expect(m.name).toBe('x');
    expect(m.ui?.theme).toBe('sleek');
  });

  it('throws for a missing manifest', () => {
    expect(() => loadManifest('/nonexistent')).toThrow(MudahManifestError);
  });

  it('throws for incomplete manifests', async () => {
    const dir = join(fixturesDir, 'manifest-bad');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'mudah.json'), JSON.stringify({ name: 'x' }));
    expect(() => loadManifest(dir)).toThrow(/version/);
  });
});

describe('EventBus', () => {
  it('emits to listeners in order and supports unsubscribe', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    const off = bus.on('app.booted', () => {
      seen.push('one');
    });
    bus.on('app.booted', () => {
      seen.push('two');
    });
    off();
    await bus.emit('app.booted', { app: freshApp() });
    expect(seen).toEqual(['two']);
  });

  it('trace() logs every emit', async () => {
    const bus = new EventBus();
    const traced: string[] = [];
    bus.trace((event) => {
      traced.push(event);
    });
    await bus.emit('config.changed', { key: 'app.name' });
    expect(traced).toEqual(['config.changed']);
  });
});

describe('Application remaining APIs', () => {
  it('awaits an async bootWhen predicate', async () => {
    class AsyncFlag extends ServiceProvider {
      static booted = false;
      register(): void {
        AsyncFlag.booted = true;
      }
    }
    const app = freshApp();
    app.registerLazy(AsyncFlag, {
      bootWhen: async (a) => {
        await Promise.resolve();
        return a.config().get<boolean>('ok', false) === true;
      },
    });
    await app.evaluateLazy();
    expect(AsyncFlag.booted).toBe(false);
    app.config().set('ok', true);
    await app.evaluateLazy();
    expect(AsyncFlag.booted).toBe(true);
  });

  it('redirects streams and reports provider health', async () => {
    class Healthy extends ServiceProvider {
      health() {
        return { status: 'ok' as const, detail: 'ready' };
      }
    }
    const app = freshApp();
    const chunks: string[] = [];
    app.redirect({ stdout: { write: (data) => chunks.push(data) } });
    app.register(Healthy);
    await app.boot();
    expect(app.streams().stdout).toBeDefined();
    const report = await app.health();
    expect(report[0]?.provider).toBe('Healthy');
    expect(report[0]?.status).toBe('ok');
    expect(report[0]?.detail).toBe('ready');
  });
});
