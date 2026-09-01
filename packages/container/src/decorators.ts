import type { Abstract, Constructor, Injectable } from './types.js';

const SINGLETON_KEY = Symbol.for('mudah.container.singleton');

/**
 * IsolatedModules-safe class decorator: writes `static dependencies` so the
 * container can auto-inject without `emitDecoratorMetadata`.
 *
 * ```ts
 * @inject('logger', 'name')
 * class Service {
 *   constructor(public logger: Logger, public name: string) {}
 * }
 * ```
 */
export function inject(...deps: Abstract[]) {
  return <T extends Constructor>(target: T, _context?: ClassDecoratorContext): T => {
    Object.defineProperty(target, 'dependencies', {
      value: Object.freeze([...deps]),
      configurable: true,
      writable: true,
    });
    return target;
  };
}

/**
 * IsolatedModules-safe class decorator: mark a class as a singleton so
 * {@link Container.registerDecorated} binds it once.
 *
 * Pass an abstract to register under a string/symbol key; omit it to use
 * the class itself as the abstract.
 */
export function singleton(abstract?: Abstract) {
  return <T extends Constructor>(target: T, _context?: ClassDecoratorContext): T => {
    Object.defineProperty(target, SINGLETON_KEY, {
      value: abstract ?? target,
      configurable: true,
    });
    return target;
  };
}

export function decoratedSingletonAbstract(target: Constructor): Abstract | undefined {
  const value = (target as Constructor & { [SINGLETON_KEY]?: Abstract })[SINGLETON_KEY];
  return value;
}

export function decoratedDependencies(target: Constructor): readonly Abstract[] {
  return ((target as Constructor<Injectable> & { dependencies?: readonly Abstract[] }).dependencies ?? []) as readonly Abstract[];
}

export { SINGLETON_KEY };
