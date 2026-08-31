import { BindingResolutionException, CircularDependencyException } from './exceptions.js';
import type { Abstract, Constructor, Factory, Injectable } from './types.js';

interface Binding {
  readonly factory: Factory | Constructor;
  readonly shared: boolean;
}

type InjectableConstructor = Constructor<Injectable> & {
  dependencies?: readonly Abstract[];
};

/**
 * True for class declarations and function declarations (values with their
 * own `prototype.constructor`), false for arrow functions and plain objects.
 * This is what separates an injectable class from a factory function.
 */
export function isClassLike(value: unknown): value is Constructor {
  if (typeof value !== 'function') return false;
  const proto = (value as Constructor).prototype;
  return proto !== null && typeof proto === 'object' && Object.prototype.hasOwnProperty.call(proto, 'constructor');
}

/**
 * High-performance IoC service container.
 *
 * - `bind` / `singleton` register factories (arrow functions) or injectable classes.
 * - `instance` registers a pre-built value.
 * - `when` registers contextual bindings: an alternative factory that applies
 *   only when the dependency is injected into a specific context.
 * - Classes declaring `static dependencies` get constructor auto-injection.
 */
export class Container {
  private readonly _bindings = new Map<Abstract, Binding>();
  private readonly _instances = new Map<Abstract, unknown>();
  private readonly contextual = new Map<Constructor, Map<Abstract, Factory | Constructor>>();
  private readonly _tagIndex = new Map<Abstract, Set<string | symbol>>();
  private readonly _scoped = new Map<Abstract, Factory | Constructor>();
  private readonly _scopeStack: Map<Abstract, unknown>[] = [];
  private readonly resolvingStack: Abstract[] = [];

  /** Register a binding. A fresh instance is produced on every `make`. */
  bind<T>(abstract: Abstract<T>, factory: Factory<T> | Constructor<T>): this {
    this._bindings.set(abstract, { factory, shared: false });
    this._instances.delete(abstract);
    return this;
  }

  /** Register a shared binding. The instance is resolved once, then cached. */
  singleton<T>(abstract: Abstract<T>, factory: Factory<T> | Constructor<T>): this {
    this._bindings.set(abstract, { factory, shared: true });
    this._instances.delete(abstract);
    return this;
  }

  /** Register a pre-built value under an abstract. */
  instance<T>(abstract: Abstract<T>, value: T): this {
    this._bindings.set(abstract, { factory: () => value, shared: true });
    this._instances.set(abstract, value);
    return this;
  }

  /** Make `abstract` an alias of `target` (resolves to the same instance). */
  alias(abstract: Abstract, target: Abstract): this {
    this.bind(abstract, (container: Container) => container.make(target));
    return this;
  }

  /**
   * Contextual binding: when `abstract` is injected into `context`, resolve it
   * with `factory` instead of its global binding.
   */
  when<TContext extends object, TDep>(
    context: Constructor<TContext>,
    abstract: Abstract<TDep>,
    factory: Factory<TDep> | Constructor<TDep>,
  ): this {
    let map = this.contextual.get(context);
    if (!map) {
      map = new Map();
      this.contextual.set(context, map);
    }
    map.set(abstract, factory);
    return this;
  }

  /** Whether the abstract is bound, or is a constructible class. */
  has(abstract: Abstract): boolean {
    return this._bindings.has(abstract) || isClassLike(abstract);
  }

  /** Resolve an abstract to an instance. */
  make<T>(abstract: Abstract<T>): T {
    if (this._instances.has(abstract)) {
      return this._instances.get(abstract) as T;
    }

    const scopedFactory = this._scoped.get(abstract);
    if (scopedFactory) {
      const scope = this._scopeStack.at(-1);
      if (scope) {
        if (scope.has(abstract)) return scope.get(abstract) as T;
        return this.withResolving(abstract, () => {
          const value = this.materialize(abstract, scopedFactory, undefined);
          scope.set(abstract, value);
          return value;
        }) as T;
      }
      return this.withResolving(abstract, () => this.materialize(abstract, scopedFactory, undefined)) as T;
    }

    const binding = this._bindings.get(abstract);
    if (binding) {
      return binding.shared
        ? (this.sharedInstance(abstract, () => this.materialize(abstract, binding.factory, undefined)) as T)
        : (this.withResolving(abstract, () => this.materialize(abstract, binding.factory, undefined)) as T);
    }

    if (isClassLike(abstract)) {
      return this.withResolving(abstract, () => this.instantiate(abstract as Constructor<Injectable>, undefined)) as T;
    }

    throw new BindingResolutionException(abstract);
  }

  /** Alias for {@link make}. */
  get<T>(abstract: Abstract<T>): T {
    return this.make(abstract);
  }

  /** Forget all cached singleton instances (bindings are kept). */
  flush(): void {
    this._instances.clear();
  }

  /** Tags a binding so it can be resolved as a group via {@link tagged}. */
  tag(abstract: Abstract, ...tags: Array<string | symbol>): this {
    let set = this._tagIndex.get(abstract);
    if (!set) {
      set = new Set();
      this._tagIndex.set(abstract, set);
    }
    for (const tag of tags) set.add(tag);
    return this;
  }

  /** Resolve every binding tagged with `tag`, in registration order. */
  tagged<T = unknown>(tag: string | symbol): T[] {
    const result: T[] = [];
    for (const [abstract, tags] of this._tagIndex) {
      if (tags.has(tag)) result.push(this.make<T>(abstract as Abstract<T>));
    }
    return result;
  }

  /**
   * Register a binding whose instance is cached for the duration of a scope
   * started by {@link runInScope}. Outside any scope it behaves as transient.
   */
  scoped<T>(abstract: Abstract<T>, factory: Factory<T> | Constructor<T>): this {
    this._scoped.set(abstract, factory as Factory | Constructor);
    this._instances.delete(abstract);
    this._bindings.delete(abstract);
    return this;
  }

  /** Run `fn` within a fresh scope; scoped bindings cache per-scope. */
  runInScope<T>(fn: (container: Container) => T): T {
    const scope = new Map<Abstract, unknown>();
    this._scopeStack.push(scope);
    try {
      return fn(this);
    } finally {
      this._scopeStack.pop();
    }
  }

  /** Registered abstracts (strings, symbols, or classes) with an explicit binding. */
  bindings(): Abstract[] {
    return [...this._bindings.keys()];
  }

  /** Abstracts whose shared instance has been resolved and cached. */
  instances(): Abstract[] {
    return [...this._instances.keys()];
  }

  /** True only if `abstract` has an explicit binding registered (not auto-injection). */
  isBound(abstract: Abstract): boolean {
    return this._bindings.has(abstract);
  }

  private sharedInstance(abstract: Abstract, producer: () => unknown): unknown {
    if (this._instances.has(abstract)) {
      return this._instances.get(abstract);
    }
    return this.withResolving(abstract, () => {
      const value = producer();
      this._instances.set(abstract, value);
      return value;
    });
  }

  private materialize(abstract: Abstract, factory: Factory | Constructor, context: Constructor | undefined): unknown {
    if (isClassLike(factory)) {
      return this.instantiate(factory as Constructor<Injectable>, context);
    }
    return (factory as Factory)(this);
  }

  private instantiate(ctor: Constructor<Injectable>, context: Constructor | undefined): unknown {
    // Contextual bindings resolve against the class currently being
    // constructed (the immediate context), matching standard merge semantics.
    const immediate = context ?? ctor;
    const deps = (ctor as InjectableConstructor).dependencies ?? [];
    const args = deps.map((dep) => this.resolveDependency(dep, immediate));
    return new (ctor as Constructor)(...args);
  }

  private resolveDependency(dep: Abstract, context: Constructor | undefined): unknown {
    if (context) {
      const override = this.contextual.get(context)?.get(dep);
      if (override !== undefined) {
        return this.withResolving(dep, () => this.materialize(dep, override, context));
      }
    }
    return this.make(dep);
  }

  private withResolving(abstract: Abstract, fn: () => unknown): unknown {
    if (this.resolvingStack.includes(abstract)) {
      throw new CircularDependencyException(abstract, this.resolvingStack);
    }
    this.resolvingStack.push(abstract);
    try {
      return fn();
    } finally {
      this.resolvingStack.pop();
    }
  }
}
