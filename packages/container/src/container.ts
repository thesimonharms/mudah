import { BindingResolutionException, CircularDependencyException } from './exceptions.js';
import { decoratedSingletonAbstract } from './decorators.js';
import { loadProviders, type ProviderDef } from './providers.js';
import type {
  Abstract,
  AsyncFactory,
  BindingQuery,
  Constructor,
  ContainerSnapshot,
  Disposable,
  Factory,
  Injectable,
} from './types.js';

interface Binding {
  readonly factory: Factory | AsyncFactory | Constructor;
  readonly shared: boolean;
}

interface ScopedBinding {
  readonly factory: Factory | AsyncFactory | Constructor;
  readonly group?: string;
}

type InjectableConstructor = Constructor<Injectable> & {
  dependencies?: readonly Abstract[];
};

export interface ContextualBinder<TContext extends object> {
  use<TDep>(abstract: Abstract<TDep>, factory: Factory<TDep> | Constructor<TDep>): Container;
}

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
 * - Classes declaring `static dependencies` (or `@inject(...)`) get constructor auto-injection.
 */
export class Container {
  private readonly _bindings = new Map<Abstract, Binding>();
  private readonly _instances = new Map<Abstract, unknown>();
  private readonly contextual = new Map<Constructor, Map<Abstract, Factory | Constructor>>();
  private readonly _tagIndex = new Map<Abstract, Set<string | symbol>>();
  private readonly _scoped = new Map<Abstract, ScopedBinding>();
  private readonly _scopeStack: Array<{ group?: string; values: Map<Abstract, unknown> }> = [];
  private readonly resolvingStack: Abstract[] = [];
  private readonly _groups = new Map<Abstract, string>();

  /** Register a binding. A fresh instance is produced on every `make`. */
  bind<T>(abstract: Abstract<T>, factory: Factory<T> | AsyncFactory<T> | Constructor<T>): this {
    this._bindings.set(abstract, { factory, shared: false });
    this._instances.delete(abstract);
    return this;
  }

  /** Register a shared binding. The instance is resolved once, then cached. */
  singleton<T>(abstract: Abstract<T>, factory: Factory<T> | AsyncFactory<T> | Constructor<T>): this {
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
   * Contextual binding. Two forms:
   * - `when(Context, abstract, factory)` — existing 3-arg form
   * - `when(Context).use(abstract, factory)` — fluent ROADMAP form
   */
  when<TContext extends object>(context: Constructor<TContext>): ContextualBinder<TContext>;
  when<TContext extends object, TDep>(
    context: Constructor<TContext>,
    abstract: Abstract<TDep>,
    factory: Factory<TDep> | Constructor<TDep>,
  ): this;
  when<TContext extends object, TDep>(
    context: Constructor<TContext>,
    abstract?: Abstract<TDep>,
    factory?: Factory<TDep> | Constructor<TDep>,
  ): this | ContextualBinder<TContext> {
    if (abstract === undefined || factory === undefined) {
      return {
        use: <TInner>(innerAbstract: Abstract<TInner>, innerFactory: Factory<TInner> | Constructor<TInner>) =>
          this.setContextual(context, innerAbstract, innerFactory),
      };
    }
    return this.setContextual(context, abstract, factory);
  }

  private setContextual<TContext extends object, TDep>(
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
    const value = this.resolveSync(abstract);
    if (isThenable(value)) {
      throw new BindingResolutionException(
        abstract,
        `factory for "${describeAbstract(abstract)}" returned a Promise; use makeAsync()`,
      );
    }
    return value as T;
  }

  /**
   * Resolve an abstract, awaiting async factories / promises in the graph.
   */
  async makeAsync<T>(abstract: Abstract<T>): Promise<T> {
    return (await this.resolveAsync(abstract)) as T;
  }

  /** Alias for {@link make}. */
  get<T>(abstract: Abstract<T>): T {
    return this.make(abstract);
  }

  /** Forget all cached singleton instances (bindings are kept). */
  flush(): void {
    this._instances.clear();
  }

  /**
   * Call `dispose()` (or `close()`) on every cached instance, then flush.
   * Used on application shutdown.
   */
  async dispose(): Promise<void> {
    const seen = new Set<unknown>();
    const victims = [...this._instances.values(), ...this._scopeStack.flatMap((scope) => [...scope.values.values()])];
    for (const value of victims) {
      if (value === null || value === undefined || seen.has(value)) continue;
      seen.add(value);
      const disposable = value as Disposable;
      if (typeof disposable.dispose === 'function') {
        await disposable.dispose();
      } else if (typeof disposable.close === 'function') {
        await disposable.close();
      }
    }
    this._instances.clear();
    this._scopeStack.length = 0;
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
   * Pass `group` to only cache inside `runInScope(group, fn)`.
   */
  scoped<T>(abstract: Abstract<T>, factory: Factory<T> | Constructor<T>, group?: string): this {
    this._scoped.set(abstract, { factory: factory as Factory | Constructor, group });
    this._instances.delete(abstract);
    this._bindings.delete(abstract);
    if (group) this._groups.set(abstract, group);
    else this._groups.delete(abstract);
    return this;
  }

  /** Run `fn` within a fresh scope; scoped bindings cache per-scope. */
  runInScope<T>(fn: (container: Container) => T): T;
  runInScope<T>(group: string, fn: (container: Container) => T): T;
  runInScope<T>(groupOrFn: string | ((container: Container) => T), maybeFn?: (container: Container) => T): T {
    const group = typeof groupOrFn === 'string' ? groupOrFn : undefined;
    const fn = typeof groupOrFn === 'function' ? groupOrFn : maybeFn;
    if (!fn) throw new TypeError('[container] runInScope requires a callback');
    const scope = { group, values: new Map<Abstract, unknown>() };
    this._scopeStack.push(scope);
    try {
      return fn(this);
    } finally {
      this._scopeStack.pop();
    }
  }

  /** Registered abstracts, optionally filtered by tag or scoped group. */
  bindings(query?: BindingQuery): Abstract[] {
    const keys = [...this._bindings.keys(), ...this._scoped.keys()].filter((key, index, all) => all.indexOf(key) === index);
    return this.filterAbstracts(keys, query);
  }

  /** Abstracts whose shared instance has been resolved and cached. */
  instances(query?: BindingQuery): Abstract[] {
    return this.filterAbstracts([...this._instances.keys()], query);
  }

  /** True only if `abstract` has an explicit binding registered (not auto-injection). */
  isBound(abstract: Abstract): boolean {
    return this._bindings.has(abstract) || this._scoped.has(abstract);
  }

  /**
   * Capture bindings and cached instances so tests can {@link rollback}.
   */
  snapshot(): ContainerSnapshot {
    const contextual = new Map<Constructor, Map<Abstract, Factory | Constructor>>();
    for (const [ctor, map] of this.contextual) contextual.set(ctor, new Map(map));
    const tags = new Map<Abstract, Set<string | symbol>>();
    for (const [abstract, set] of this._tagIndex) tags.set(abstract, new Set(set));
    const scoped = new Map<Abstract, { factory: Factory | Constructor; group?: string }>();
    for (const [abstract, binding] of this._scoped) scoped.set(abstract, { ...binding });
    return {
      bindings: new Map(this._bindings),
      instances: new Map(this._instances),
      contextual,
      tags,
      scoped,
    };
  }

  /** Restore a {@link snapshot}. Bindings registered after the snapshot are dropped. */
  rollback(snapshot: ContainerSnapshot): void {
    this._bindings.clear();
    for (const [abstract, binding] of snapshot.bindings) this._bindings.set(abstract, { ...binding });
    this._instances.clear();
    for (const [abstract, value] of snapshot.instances) this._instances.set(abstract, value);
    this.contextual.clear();
    for (const [ctor, map] of snapshot.contextual) this.contextual.set(ctor, new Map(map));
    this._tagIndex.clear();
    for (const [abstract, set] of snapshot.tags) this._tagIndex.set(abstract, new Set(set));
    this._scoped.clear();
    this._groups.clear();
    for (const [abstract, binding] of snapshot.scoped) {
      this._scoped.set(abstract, { ...binding });
      if (binding.group) this._groups.set(abstract, binding.group);
    }
  }

  /** Bind `@singleton` / `@inject` decorated classes (or a provider array). */
  registerDecorated(...ctors: Constructor[]): this {
    for (const ctor of ctors) {
      const abstract = decoratedSingletonAbstract(ctor) ?? ctor;
      if (decoratedSingletonAbstract(ctor) !== undefined) this.singleton(abstract, ctor);
      else this.bind(abstract, ctor);
    }
    return this;
  }

  /** Bind an Angular-style `providers` array. */
  loadProviders(providers: readonly ProviderDef[]): this {
    loadProviders(this, providers);
    return this;
  }

  private filterAbstracts(keys: Abstract[], query?: BindingQuery): Abstract[] {
    if (!query) return keys;
    return keys.filter((abstract) => {
      if (query.tag !== undefined) {
        const tags = this._tagIndex.get(abstract);
        if (!tags?.has(query.tag)) return false;
      }
      if (query.group !== undefined && this._groups.get(abstract) !== query.group) return false;
      return true;
    });
  }

  private currentScope(group?: string): Map<Abstract, unknown> | undefined {
    for (let i = this._scopeStack.length - 1; i >= 0; i--) {
      const frame = this._scopeStack[i];
      if (!frame) continue;
      if (group === undefined) return frame.values;
      if (frame.group === group) return frame.values;
    }
    return undefined;
  }

  private resolveSync(abstract: Abstract): unknown {
    if (this._instances.has(abstract)) {
      return this._instances.get(abstract);
    }

    const scoped = this._scoped.get(abstract);
    if (scoped) {
      const scope = this.currentScope(scoped.group);
      if (scope) {
        if (scope.has(abstract)) return scope.get(abstract);
        return this.withResolving(abstract, () => {
          const value = this.materialize(abstract, scoped.factory, undefined);
          this.assertSync(abstract, value);
          scope.set(abstract, value);
          return value;
        });
      }
      return this.withResolving(abstract, () => this.materialize(abstract, scoped.factory, undefined));
    }

    const binding = this._bindings.get(abstract);
    if (binding) {
      return binding.shared
        ? this.sharedInstance(abstract, () => this.materialize(abstract, binding.factory, undefined))
        : this.withResolving(abstract, () => this.materialize(abstract, binding.factory, undefined));
    }

    if (isClassLike(abstract)) {
      return this.withResolving(abstract, () => this.instantiate(abstract as Constructor<Injectable>, undefined));
    }

    throw new BindingResolutionException(abstract);
  }

  private async resolveAsync(abstract: Abstract): Promise<unknown> {
    if (this._instances.has(abstract)) {
      return this._instances.get(abstract);
    }

    const scoped = this._scoped.get(abstract);
    if (scoped) {
      const scope = this.currentScope(scoped.group);
      if (scope?.has(abstract)) return scope.get(abstract);
      return this.withResolvingAsync(abstract, async () => {
        const value = await this.materializeAsync(abstract, scoped.factory, undefined);
        if (scope) scope.set(abstract, value);
        return value;
      });
    }

    const binding = this._bindings.get(abstract);
    if (binding) {
      if (binding.shared && this._instances.has(abstract)) return this._instances.get(abstract);
      return this.withResolvingAsync(abstract, async () => {
        const value = await this.materializeAsync(abstract, binding.factory, undefined);
        if (binding.shared) this._instances.set(abstract, value);
        return value;
      });
    }

    if (isClassLike(abstract)) {
      return this.withResolvingAsync(abstract, () => this.instantiateAsync(abstract as Constructor<Injectable>, undefined));
    }

    throw new BindingResolutionException(abstract);
  }

  private sharedInstance(abstract: Abstract, producer: () => unknown): unknown {
    if (this._instances.has(abstract)) {
      return this._instances.get(abstract);
    }
    return this.withResolving(abstract, () => {
      const value = producer();
      this.assertSync(abstract, value);
      this._instances.set(abstract, value);
      return value;
    });
  }

  private materialize(abstract: Abstract, factory: Factory | AsyncFactory | Constructor, context: Constructor | undefined): unknown {
    if (isClassLike(factory)) {
      return this.instantiate(factory as Constructor<Injectable>, context);
    }
    return (factory as Factory)(this);
  }

  private async materializeAsync(
    abstract: Abstract,
    factory: Factory | AsyncFactory | Constructor,
    context: Constructor | undefined,
  ): Promise<unknown> {
    if (isClassLike(factory)) {
      return this.instantiateAsync(factory as Constructor<Injectable>, context);
    }
    return (factory as AsyncFactory)(this);
  }

  private instantiate(ctor: Constructor<Injectable>, context: Constructor | undefined): unknown {
    const immediate = context ?? ctor;
    const deps = (ctor as InjectableConstructor).dependencies ?? [];
    const args = deps.map((dep) => this.resolveDependency(dep, immediate));
    return new (ctor as Constructor)(...args);
  }

  private async instantiateAsync(ctor: Constructor<Injectable>, context: Constructor | undefined): Promise<unknown> {
    const immediate = context ?? ctor;
    const deps = (ctor as InjectableConstructor).dependencies ?? [];
    const args: unknown[] = [];
    for (const dep of deps) args.push(await this.resolveDependencyAsync(dep, immediate));
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

  private async resolveDependencyAsync(dep: Abstract, context: Constructor | undefined): Promise<unknown> {
    if (context) {
      const override = this.contextual.get(context)?.get(dep);
      if (override !== undefined) {
        return this.withResolvingAsync(dep, () => this.materializeAsync(dep, override, context));
      }
    }
    return this.makeAsync(dep);
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

  private async withResolvingAsync(abstract: Abstract, fn: () => Promise<unknown>): Promise<unknown> {
    if (this.resolvingStack.includes(abstract)) {
      throw new CircularDependencyException(abstract, this.resolvingStack);
    }
    this.resolvingStack.push(abstract);
    try {
      return await fn();
    } finally {
      this.resolvingStack.pop();
    }
  }

  private assertSync(abstract: Abstract, value: unknown): void {
    if (isThenable(value)) {
      throw new BindingResolutionException(
        abstract,
        `factory for "${describeAbstract(abstract)}" returned a Promise; use makeAsync()`,
      );
    }
  }
}

function isThenable(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Promise<unknown>).then === 'function';
}

function describeAbstract(abstract: Abstract): string {
  if (typeof abstract === 'string') return abstract;
  if (typeof abstract === 'symbol') return abstract.description ?? String(abstract);
  return abstract.name || '<anonymous class>';
}
