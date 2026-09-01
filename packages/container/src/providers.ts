import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readdir } from 'node:fs/promises';
import type { Container } from './container.js';
import type { Abstract, AsyncFactory, Constructor, Factory } from './types.js';
import { decoratedSingletonAbstract } from './decorators.js';

export interface ClassProvider {
  provide: Abstract;
  useClass: Constructor;
  shared?: boolean;
}

export interface FactoryProvider {
  provide: Abstract;
  useFactory: Factory | AsyncFactory;
  shared?: boolean;
}

export interface ValueProvider {
  provide: Abstract;
  useValue: unknown;
}

/** Angular-style provider definition accepted by {@link loadProviders}. */
export type ProviderDef = Constructor | ClassProvider | FactoryProvider | ValueProvider;

export function isClassProvider(value: ProviderDef): value is ClassProvider {
  return typeof value === 'object' && value !== null && 'useClass' in value;
}

export function isFactoryProvider(value: ProviderDef): value is FactoryProvider {
  return typeof value === 'object' && value !== null && 'useFactory' in value;
}

export function isValueProvider(value: ProviderDef): value is ValueProvider {
  return typeof value === 'object' && value !== null && 'useValue' in value;
}

/** Bind an array of provider definitions onto `container`. */
export function loadProviders(container: Container, providers: readonly ProviderDef[]): Container {
  for (const provider of providers) {
    if (typeof provider === 'function') {
      const abstract = decoratedSingletonAbstract(provider) ?? provider;
      const shared = decoratedSingletonAbstract(provider) !== undefined;
      if (shared) container.singleton(abstract, provider);
      else container.bind(abstract, provider);
      continue;
    }
    if (isValueProvider(provider)) {
      container.instance(provider.provide, provider.useValue);
      continue;
    }
    if (isClassProvider(provider)) {
      if (provider.shared === false) container.bind(provider.provide, provider.useClass);
      else container.singleton(provider.provide, provider.useClass);
      continue;
    }
    if (isFactoryProvider(provider)) {
      if (provider.shared === false) container.bind(provider.provide, provider.useFactory as Factory);
      else container.singleton(provider.provide, provider.useFactory as Factory);
    }
  }
  return container;
}

/**
 * Load a `providers.ts` module. Accepts `export const providers = [...]` or
 * a default export array. Missing files yield `[]`.
 */
export async function loadProviderModule(
  path: string,
  importer: (url: string) => Promise<Record<string, unknown>> = defaultImport,
): Promise<ProviderDef[]> {
  try {
    const url = path.startsWith('file:') ? path : pathToFileURL(path).href;
    const mod = await importer(url);
    const declared = mod.providers ?? mod.default;
    if (!Array.isArray(declared)) return [];
    return declared.filter((value): value is ProviderDef => value !== undefined);
  } catch {
    return [];
  }
}

/**
 * Auto-loader: import `providers.ts` / `providers.js` from `dir` (or
 * `dir/providers.ts` when `dir` is a folder). Angular-style single file.
 */
export async function loadProvidersFrom(
  dir: string,
  importer?: (url: string) => Promise<Record<string, unknown>>,
): Promise<ProviderDef[]> {
  const candidates = isAbsolute(dir)
    ? [dir, `${dir}.ts`, `${dir}.js`, join(dir, 'providers.ts'), join(dir, 'providers.js')]
    : [dir];
  for (const candidate of candidates) {
    const loaded = await loadProviderModule(candidate, importer);
    if (loaded.length > 0) return loaded;
  }
  if (!isAbsolute(dir)) return [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const file = entries
      .map((entry) => entry.name)
      .find((name) => /^providers\.(ts|mts|js|mjs)$/.test(name));
    if (!file) return [];
    return loadProviderModule(join(dir, file), importer);
  } catch {
    return [];
  }
}

function defaultImport(url: string): Promise<Record<string, unknown>> {
  return import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>;
}
