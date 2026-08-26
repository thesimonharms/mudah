import { describe, expect, it } from 'vitest';
import {
  BindingResolutionException,
  CircularDependencyException,
  Container,
  isClassLike,
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
});
