import type { Abstract } from './types.js';

function describe(abstract: Abstract): string {
  if (typeof abstract === 'string') return abstract;
  if (typeof abstract === 'symbol') return abstract.description ?? String(abstract);
  return abstract.name || '<anonymous class>';
}

/** Thrown when an abstract has no binding and is not a constructible class. */
export class BindingResolutionException extends Error {
  constructor(abstract: Abstract, detail?: string) {
    super(
      detail
        ? `[container] Unable to resolve "${describe(abstract)}": ${detail}`
        : `[container] Unable to resolve "${describe(abstract)}": no binding is registered and it is not a constructible class.`,
    );
    this.name = 'BindingResolutionException';
  }
}

/** Thrown when resolving a binding requires itself, directly or transitively. */
export class CircularDependencyException extends Error {
  constructor(abstract: Abstract, chain: readonly Abstract[]) {
    super(`[container] Circular dependency detected: ${[...chain, abstract].map(describe).join(' -> ')}`);
    this.name = 'CircularDependencyException';
  }
}
