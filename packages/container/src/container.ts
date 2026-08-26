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
  private readonly bindings = new Map<Abstract, Binding>();
  private readonly instances = new Map<Abstract, unknown>();
  private readonly contextual = new Map<Constructor, Map<Abstract, Factory | Constructor>>();
  private readonly resolvingStack: Abstract[] = [];

  /** Register a binding. A fresh instance is produced on every `make`. */
  bind<T>(abstract: Abstract<T>, factory: Factory<T> | Constructor<T>): this {
    this.bindings.set(abstract, { factory, shared: false });
    this.instances.delete(abstract);
    return this;
  }

  /** Register a shared binding. The instance is resolved once, then cached. */
  singleton<T>(abstract: Abstract<T>, factory: Factory<T> | Constructor<T>): this {
    this.bindings.set(abstract, { factory, shared: true });
    this.instances.delete(abstract);
    return this;
  }

  /** Register a pre-built value under an abstract. */
  instance<T>(abstract: Abstract<T>, value: T): this {
    this.bindings.set(abstract, { factory: () => value, shared: true });
    this.instances.set(abstract, value);
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
    return this.bindings.has(abstract) || isClassLike(abstract);
  }

  /** Resolve an abstract to an instance. */
  make<T>(abstract: Abstract<T>): T {
    if (this.instances.has(abstract)) {
      return this.instances.get(abstract) as T;
    }

    const binding = this.bindings.get(abstract);
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
    this.instances.clear();
  }

  private sharedInstance(abstract: Abstract, producer: () => unknown): unknown {
    if (this.instances.has(abstract)) {
      return this.instances.get(abstract);
    }
    return this.withResolving(abstract, () => {
      const value = producer();
      this.instances.set(abstract, value);
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
