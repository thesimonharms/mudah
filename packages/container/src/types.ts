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
 * Optional contract for classes the container should instantiate with
 * constructor auto-injection. List the abstracts to inject, in order.
 */
export interface Injectable {
  readonly dependencies?: readonly Abstract[];
}
