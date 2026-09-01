import type { Container } from './container.js';

/** A class constructor that can be bound or resolved. */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** Anything the container can resolve: a string/symbol key or a concrete class. */
export type Abstract<T = unknown> = string | symbol | Constructor<T>;

/**
 * A factory that produces an instance. Receives the container so it can
 * resolve nested dependencies. Use an arrow function for factories —
 * class values are treated as injectable constructors instead.
 */
export type Factory<T = unknown> = (container: Container) => T;

/**
 * Factory that may return a Promise. Resolve these with {@link Container.makeAsync};
 * sync {@link Container.make} throws if the factory yields a Promise.
 */
export type AsyncFactory<T = unknown> = (container: Container) => T | Promise<T>;

/** Filter for {@link Container.bindings} / {@link Container.instances}. */
export interface BindingQuery {
  tag?: string | symbol;
  group?: string;
}

/** Snapshot of container state for deterministic tests. */
export interface ContainerSnapshot {
  readonly bindings: ReadonlyMap<Abstract, { readonly factory: Factory | Constructor; readonly shared: boolean }>;
  readonly instances: ReadonlyMap<Abstract, unknown>;
  readonly contextual: ReadonlyMap<Constructor, ReadonlyMap<Abstract, Factory | Constructor>>;
  readonly tags: ReadonlyMap<Abstract, ReadonlySet<string | symbol>>;
  readonly scoped: ReadonlyMap<Abstract, { readonly factory: Factory | Constructor; readonly group?: string }>;
}

/** Object that can be disposed when the container shuts down. */
export interface Disposable {
  dispose?(): void | Promise<void>;
  close?(): void | Promise<void>;
}

/**
 * Optional contract for classes the container should instantiate with
 * constructor auto-injection. List the abstracts to inject, in order.
 */
export interface Injectable {
  readonly dependencies?: readonly Abstract[];
}
