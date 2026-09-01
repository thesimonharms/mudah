import { describe, expect, it } from 'vitest';
import {
  BindingResolutionException,
  CircularDependencyException,
  Container,
  inject,
  isClassLike,
  singleton,
} from '@mudah-cli/container';

class Logger {
  readonly lines: string[] = [];
  log(message: string): void {
    this.lines.push(message);
  }
}

class Repository {
  static readonly dependencies = ['logger'] as const;
  constructor(public readonly logger: Logger) {}
}

class Service {
  static readonly dependencies = ['repository', 'name'] as const;
  constructor(
    public readonly repository: Repository,
    public readonly name: string,
  ) {}
}

describe('Container', () => {
  it('resolves non-shared bindings with a fresh instance each time', () => {
    const c = new Container();
    c.bind('point', () => ({ x: Math.random() }));
    const a = c.make<{ x: number }>('point');
    const b = c.make<{ x: number }>('point');
    expect(a).not.toBe(b);
  });

  it('resolves singleton bindings to a shared instance', () => {
    const c = new Container();
    c.singleton('logger', Logger);
    expect(c.make<Logger>('logger')).toBe(c.make<Logger>('logger'));
  });

  it('instance() returns the exact registered value', () => {
    const c = new Container();
    const value = { frozen: true };
    c.instance('value', value);
    expect(c.make<{ frozen: boolean }>('value')).toBe(value);
  });

  it('factories receive the container for nested resolution', () => {
    const c = new Container();
    c.singleton('logger', () => new Logger());
    c.bind('repository', Repository);
    c.bind('service', (container) => new Service(container.make('repository'), 'wired'));
    const service = c.make<Service>('service');
    expect(service.repository).toBeInstanceOf(Repository);
    expect(service.repository.logger).toBe(c.make('logger'));
    expect(service.name).toBe('wired');
  });

  it('auto-injects constructor dependencies via static dependencies', () => {
    const c = new Container();
    c.singleton('logger', () => new Logger());
    c.bind('repository', Repository);
    c.bind('service', Service);
    c.instance('name', 'injected');
    const service = c.make<Service>('service');
    expect(service.repository).toBeInstanceOf(Repository);
    expect(service.repository.logger).toBe(c.make('logger'));
    expect(service.name).toBe('injected');
  });

  it('applies contextual bindings only within their context', () => {
    const c = new Container();
    c.bind('client', () => ({ channel: 'default' }));
    class Outer {
      static readonly dependencies = ['client'] as const;
      constructor(public readonly client: { channel: string }) {}
    }
    c.when(Outer, 'client', () => ({ channel: 'alt' }));
    c.bind('outer', Outer);

    expect(c.make<{ client: { channel: string } }>('outer').client.channel).toBe('alt');
    expect(c.make<{ channel: string }>('client').channel).toBe('default');
  });

  it('aliases resolve to the same underlying instance', () => {
    const c = new Container();
    c.singleton('logger', () => new Logger());
    c.alias('log', 'logger');
    expect(c.make<Logger>('log')).toBe(c.make<Logger>('logger'));
  });

  it('flush() forgets cached singletons but keeps bindings', () => {
    const c = new Container();
    let builds = 0;
    c.singleton('counter', () => ({ builds: ++builds }));
    c.make<unknown>('counter');
    expect(c.make<unknown>('counter')).toBe(c.make<unknown>('counter'));
    c.flush();
    expect(c.make<{ builds: number }>('counter').builds).toBe(2);
  });

  it('auto-resolves unbound classes without dependencies', () => {
    const c = new Container();
    class Plain {
      value = 42;
    }
    const a = c.make<Plain>(Plain);
    expect(a).toBeInstanceOf(Plain);
    expect(c.make<Plain>(Plain)).not.toBe(a);
  });

  it('has() reports bound abstracts and constructible classes', () => {
    const c = new Container();
    class Bound {}
    c.bind('key', () => Bound);
    expect(c.has('key')).toBe(true);
    expect(c.has(Bound)).toBe(true);
    expect(c.has('missing')).toBe(false);
    expect(isClassLike(() => {})).toBe(false);
    expect(isClassLike(Bound)).toBe(true);
  });

  it('isBound() reports only explicit bindings, not auto-injectable classes', () => {
    const c = new Container();
    class Plain {}
    c.singleton('logger', Logger);
    expect(c.isBound('logger')).toBe(true);
    expect(c.isBound('missing')).toBe(false);
    expect(c.isBound(Plain)).toBe(false);
  });

  it('bindings() lists explicitly registered abstracts', () => {
    const c = new Container();
    const sym = Symbol('svc');
    c.bind('logger', Logger);
    c.singleton(sym, () => 1);
    expect(c.bindings()).toHaveLength(2);
    expect(c.bindings()).toContain('logger');
    expect(c.bindings()).toContain(sym);
  });

  it('instances() lists resolved shared instances after a make()', () => {
    const c = new Container();
    c.singleton('logger', Logger);
    c.instance('name', 'injected');
    // instance() caches immediately; singleton resolves lazily on make()
    expect(c.instances()).toContain('name');
    expect(c.instances()).not.toContain('logger');
    c.make('logger');
    expect(c.instances()).toContain('logger');
  });

  it('throws BindingResolutionException for unknown abstracts', () => {
    const c = new Container();
    expect(() => c.make('never-bound')).toThrow(BindingResolutionException);
    expect(() => c.make('never-bound')).toThrow(/never-bound/);
  });

  it('throws CircularDependencyException with the dependency chain', () => {
    const c = new Container();
    class A {
      static readonly dependencies = ['b'] as const;
      constructor(public b: unknown) {}
    }
    class B {
      static readonly dependencies = ['a'] as const;
      constructor(public a: unknown) {}
    }
    c.bind('a', A);
    c.bind('b', B);
    expect(() => c.make('a')).toThrow(CircularDependencyException);
    expect(() => c.make('a')).toThrow(/a -> b -> a/);
  });

  it('tags resolve every abstraction sharing a tag, in registration order', () => {
    const c = new Container();
    c.bind('a', () => ({ id: 'a' }));
    c.bind('b', () => ({ id: 'b' }));
    c.tag('a', 'admin');
    c.tag('b', 'admin', 'billing');
    expect(c.tagged<{ id: string }>('admin').map((r) => r.id)).toEqual(['a', 'b']);
    expect(c.tagged<{ id: string }>('billing').map((r) => r.id)).toEqual(['b']);
    expect(c.tagged('missing')).toEqual([]);
  });

  it('scoped bindings are transient outside a scope but shared inside one', () => {
    const c = new Container();
    let created = 0;
    c.scoped('conn', () => ({ id: ++created }));
    expect(c.make<{ id: number }>('conn').id).toBe(1);
    expect(c.make<{ id: number }>('conn').id).toBe(2);

    let scopedA: unknown;
    let scopedB: unknown;
    c.runInScope((container) => {
      scopedA = container.make('conn');
      scopedB = container.make('conn');
    });
    expect(scopedA).toBe(scopedB);

    let scopedC: unknown;
    c.runInScope((container) => {
      scopedC = container.make('conn');
    });
    expect(scopedC).not.toBe(scopedA);
  });

  it('runInScope(group) only caches bindings registered for that group', () => {
    const c = new Container();
    let created = 0;
    c.scoped('conn', () => ({ id: ++created }), 'request');
    expect(c.make<{ id: number }>('conn').id).toBe(1);
    let first: { id: number } | undefined;
    let second: { id: number } | undefined;
    c.runInScope('request', (container) => {
      first = container.make('conn');
      second = container.make('conn');
    });
    expect(first).toBe(second);
    expect(first?.id).toBe(2);
    c.runInScope('other', (container) => {
      expect(container.make<{ id: number }>('conn').id).toBe(3);
    });
  });

  it('bindings()/instances() filter by tag and group', () => {
    const c = new Container();
    c.bind('a', () => 1);
    c.bind('b', () => 2);
    c.tag('a', 'admin');
    c.scoped('conn', () => ({}), 'request');
    expect(c.bindings({ tag: 'admin' })).toEqual(['a']);
    expect(c.bindings({ group: 'request' })).toEqual(['conn']);
    c.singleton('shared', () => ({ n: 1 }));
    c.tag('shared', 'admin');
    c.make('shared');
    expect(c.instances({ tag: 'admin' })).toEqual(['shared']);
  });

  it('snapshot() + rollback() restore bindings and instances', () => {
    const c = new Container();
    c.singleton('logger', Logger);
    c.make('logger');
    const snap = c.snapshot();
    c.bind('extra', () => 1);
    c.singleton('logger', () => new Logger());
    expect(c.isBound('extra')).toBe(true);
    c.rollback(snap);
    expect(c.isBound('extra')).toBe(false);
    expect(c.make<Logger>('logger')).toBeInstanceOf(Logger);
    expect(c.instances()).toContain('logger');
  });

  it('dispose() calls dispose() on cached instances then flushes', async () => {
    const c = new Container();
    let disposed = 0;
    c.instance('res', {
      dispose() {
        disposed += 1;
      },
    });
    await c.dispose();
    expect(disposed).toBe(1);
    expect(c.instances()).toEqual([]);
  });

  it('makeAsync() awaits factories that return promises', async () => {
    const c = new Container();
    c.singleton('db', async () => ({ ready: true }));
    await expect(c.makeAsync<{ ready: boolean }>('db')).resolves.toEqual({ ready: true });
    expect(() => c.make('fresh')).toThrow(BindingResolutionException);
    c.bind('fresh', async () => ({ n: 1 }));
    expect(() => c.make('fresh')).toThrow(/makeAsync/);
    await expect(c.makeAsync<{ n: number }>('fresh')).resolves.toEqual({ n: 1 });
  });

  it('@inject and @singleton decorate classes without emitDecoratorMetadata', () => {
    class Decorated {
      constructor(public readonly logger: Logger) {}
    }
    // Apply as functions so tests stay isolatedModules-safe without a decorator transform.
    inject('logger')(Decorated);
    singleton('svc')(Decorated);
    const c = new Container();
    c.singleton('logger', Logger);
    c.registerDecorated(Decorated);
    const a = c.make<Decorated>('svc');
    const b = c.make<Decorated>('svc');
    expect(a).toBe(b);
    expect(a.logger).toBeInstanceOf(Logger);
  });

  it('loadProviders() binds an Angular-style providers array', () => {
    const c = new Container();
    c.loadProviders([
      { provide: 'name', useValue: 'wired' },
      { provide: 'logger', useClass: Logger, shared: true },
      { provide: 'n', useFactory: () => 7, shared: false },
    ]);
    expect(c.make<string>('name')).toBe('wired');
    expect(c.make<Logger>('logger')).toBe(c.make<Logger>('logger'));
    expect(c.make<number>('n')).toBe(7);
  });

  it('when(context).use(abstract, factory) is the fluent contextual form', () => {
    const c = new Container();
    c.bind('client', () => ({ channel: 'default' }));
    class Outer {
      static readonly dependencies = ['client'] as const;
      constructor(public readonly client: { channel: string }) {}
    }
    c.when(Outer).use('client', () => ({ channel: 'fluent' }));
    c.bind('outer', Outer);
    expect(c.make<Outer>('outer').client.channel).toBe('fluent');
  });
});
