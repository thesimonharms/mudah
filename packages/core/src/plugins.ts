import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isCommandExport, type CommandModule, type ProviderClass } from './application.js';

/**
 * Plugin discovery: register providers and commands shipped by other
 * packages rather than by the app itself.
 *
 * A plugin is any installed package that declares the `mudah-plugin`
 * keyword in its `package.json`. Its entry point may export:
 *
 * - a `default` export that is a provider class, or
 * - a named export whose name ends in `Provider`, or
 * - a named `providers` array, and/or
 * - a named `commands` array of command modules.
 *
 * Discovery is best-effort: a plugin that fails to import is reported and
 * skipped rather than taking the host app down with it.
 */

export interface PluginInfo {
  /** Package name, as installed. */
  readonly name: string;
  /** Provider classes found in the package. */
  readonly providers: readonly ProviderClass[];
  /** Command modules found in the package. */
  readonly commands: readonly CommandModule[];
  /** Other plugin names this plugin must boot after. */
  readonly depends?: readonly string[];
  /** Declared peer range (e.g. `@mudah-cli/core`: `^0.8.0`) for compatibility gates. */
  readonly peers?: Readonly<Record<string, string>>;
  /** Runtime feature flags the host must satisfy. */
  readonly features?: readonly string[];
  /** When set, the plugin is deprecated (string is the reason). */
  readonly deprecated?: boolean | string;
}

export interface PluginDiscoveryOptions {
  /**
   * Package keyword that marks a plugin. Default `mudah-plugin`.
   */
  keyword?: string;
  /**
   * Extra package names to treat as plugins regardless of keyword. Handy for
   * bundled apps that can't rely on a published manifest.
   */
  include?: readonly string[];
  /** Package names to skip even if they declare the keyword. */
  exclude?: readonly string[];
  /** Resolve a package name to a module URL. Injectable for tests. */
  resolve?: (name: string, from: string) => string | Promise<string>;
  /** Read a package's manifest. Injectable for tests. */
  readPackage?: (path: string) => Promise<unknown>;
  /** Import a resolved module URL. Injectable for tests. */
  importModule?: (url: string) => Promise<Record<string, unknown>>;
  /** Host `@mudah-cli/core` version used by compatibility gates. */
  coreVersion?: string;
  /** Runtime feature flags the host currently provides. */
  features?: readonly string[];
}

interface PackageJson {
  name?: string;
  keywords?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const DEFAULT_KEYWORD = 'mudah-plugin';

/**
 * Find installed plugin packages: dependencies of `basePath` that declare
 * the keyword (or are listed in `include`), minus anything excluded.
 */
export async function findPluginPackages(
  basePath: string,
  options: PluginDiscoveryOptions = {},
): Promise<string[]> {
  const keyword = options.keyword ?? DEFAULT_KEYWORD;
  const exclude = new Set(options.exclude ?? []);
  const readPackage = options.readPackage ?? readJson;
  const resolve = options.resolve ?? defaultResolve;

  // No manifest means no dependency graph to scan — an app run straight from
  // a directory (tests, single-file tools) simply has no plugins.
  let manifest: PackageJson;
  try {
    manifest = (await readPackage(join(basePath, 'package.json'))) as PackageJson;
  } catch {
    return explicitlyIncludedNames(options.include, exclude);
  }

  const candidates = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...(options.include ?? []),
  ];

  // devDependencies are deliberately excluded: a plugin used only for
  // development shouldn't ship in a production install.

  const unique = [...new Set(candidates)].filter((name) => !exclude.has(name)).sort();
  const plugins: string[] = [];

  for (const name of unique) {
    if (explicitlyIncluded(name, options.include)) {
      plugins.push(name);
      continue;
    }
    const entry = await readPluginManifest(basePath, name, readPackage, resolve);
    if (entry !== null && declaresKeyword(entry, keyword)) plugins.push(name);
  }

  return plugins;
}

function explicitlyIncluded(name: string, include: readonly string[] | undefined): boolean {
  return include !== undefined && include.includes(name);
}

/** Explicit includes still apply when there is no manifest to scan. */
function explicitlyIncludedNames(
  include: readonly string[] | undefined,
  exclude: ReadonlySet<string>,
): string[] {
  return (include ?? []).filter((name) => !exclude.has(name));
}

async function readPluginManifest(
  basePath: string,
  name: string,
  readPackage: (path: string) => Promise<unknown>,
  resolve: (specifier: string, from: string) => string | Promise<string>,
): Promise<PackageJson | null> {
  try {
    // Resolve to the package's entry file, then find its manifest.
    const entryUrl = await resolve(name, basePath);
    const entryPath = entryUrl.startsWith('file:')
      ? new URL(entryUrl).pathname
      : entryUrl;
    const packageRoot = await packageRootFromEntry(entryPath, name, readPackage);
    if (packageRoot === null) return null;
    return (await readPackage(join(packageRoot, 'package.json'))) as PackageJson;
  } catch {
    return null;
  }
}

/**
 * Prefer the `node_modules/<name>/` segment when it is present. Workspace
 * and `file:` installs often resolve to a real path that no longer contains
 * the package name, so fall back to walking up until a package.json exists.
 */
async function packageRootFromEntry(
  entryPath: string,
  name: string,
  readPackage: (path: string) => Promise<unknown>,
): Promise<string | null> {
  const marker = `/${name}/`;
  const named = entryPath.lastIndexOf(marker);
  if (named !== -1) return entryPath.slice(0, named + marker.length - 1);

  let dir = dirname(entryPath);
  for (let i = 0; i < 8; i++) {
    try {
      await readPackage(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }
  return null;
}

function declaresKeyword(pkg: PackageJson, keyword: string): boolean {
  return Array.isArray(pkg.keywords) && pkg.keywords.includes(keyword);
}

/**
 * Load a plugin package and pull the providers and commands out of it.
 * Returns empty arrays (not an error) when the package exports neither.
 */
export async function loadPlugin(
  name: string,
  basePath: string,
  options: PluginDiscoveryOptions = {},
): Promise<PluginInfo> {
  const resolve = options.resolve ?? defaultResolve;
  const importModule = options.importModule ?? defaultImport;

  const url = await resolve(name, basePath);
  const mod = await importModule(url);

  const providers: ProviderClass[] = [];
  const commands: CommandModule[] = [];

  for (const value of Object.values(mod)) {
    if (typeof value === 'function' && /Provider$/.test((value as { name?: string }).name ?? '')) {
      providers.push(value as unknown as ProviderClass);
    }
  }
  if (mod.default !== undefined && providers.length === 0) {
    const fallback = mod.default;
    if (typeof fallback === 'function' && /Provider$/.test((fallback as { name?: string }).name ?? '')) {
      providers.push(fallback as unknown as ProviderClass);
    }
  }

  const declaredProviders = mod.providers;
  if (Array.isArray(declaredProviders)) {
    for (const value of declaredProviders) {
      if (typeof value === 'function' && !providers.includes(value as ProviderClass)) {
        providers.push(value as unknown as ProviderClass);
      }
    }
  }

  const declaredCommands = mod.commands;
  if (Array.isArray(declaredCommands)) {
    for (const value of declaredCommands) {
      if (isCommandExport(value)) commands.push({ default: value });
    }
  }
  if (isCommandExport(mod.default) && commands.length === 0) {
    commands.push({ default: mod.default });
  }

  const depends = Array.isArray(mod.depends) ? mod.depends.filter((v): v is string => typeof v === 'string') : [];
  const peers =
    mod.peers && typeof mod.peers === 'object' && !Array.isArray(mod.peers)
      ? (mod.peers as Record<string, string>)
      : {};
  const features = Array.isArray(mod.features) ? mod.features.filter((v): v is string => typeof v === 'string') : [];
  const deprecated =
    typeof mod.deprecated === 'string' || mod.deprecated === true ? (mod.deprecated as boolean | string) : undefined;

  return { name, providers, commands, depends, peers, features, deprecated };
}

/**
 * Topological sort of plugins by `depends`. Unknown edges are ignored.
 * Cycles fall back to original order for the remaining nodes.
 */
export function sortPluginsByDependency(plugins: readonly PluginInfo[]): PluginInfo[] {
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  const incoming = new Map<string, number>();
  const edges = new Map<string, string[]>();
  for (const plugin of plugins) {
    incoming.set(plugin.name, incoming.get(plugin.name) ?? 0);
    for (const dep of plugin.depends ?? []) {
      if (!byName.has(dep)) continue;
      edges.set(dep, [...(edges.get(dep) ?? []), plugin.name]);
      incoming.set(plugin.name, (incoming.get(plugin.name) ?? 0) + 1);
    }
  }
  const queue = [...incoming.entries()].filter(([, n]) => n === 0).map(([name]) => name);
  const ordered: PluginInfo[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    const plugin = byName.get(name);
    if (plugin) ordered.push(plugin);
    for (const next of edges.get(name) ?? []) {
      const left = (incoming.get(next) ?? 1) - 1;
      incoming.set(next, left);
      if (left === 0) queue.push(next);
    }
  }
  if (ordered.length === plugins.length) return ordered;
  const seen = new Set(ordered.map((p) => p.name));
  return [...ordered, ...plugins.filter((p) => !seen.has(p.name))];
}

/** Semver-lite: `^1.2.3` / `>=1.0.0` / `1.2.3` satisfied by `actual`. */
export function satisfiesPeerRange(actual: string, range: string): boolean {
  const clean = actual.replace(/^v/, '');
  const [maj = 0, min = 0, pat = 0] = clean.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const value = maj * 1_000_000 + min * 1_000 + pat;
  const match = /^(>=|>|\^|~|=)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range.trim());
  if (!match) return true;
  const op = match[1] ?? '=';
  const rMaj = Number(match[2]);
  const rMin = Number(match[3] ?? 0);
  const rPat = Number(match[4] ?? 0);
  const required = rMaj * 1_000_000 + rMin * 1_000 + rPat;
  if (op === '>') return value > required;
  if (op === '>=') return value >= required;
  if (op === '^') return maj === rMaj && value >= required;
  if (op === '~') return maj === rMaj && min === rMin && value >= required;
  return value === required;
}

/** Host core version used by compatibility gates. */
export const CORE_VERSION: string = (() => {
  try {
    const pkg = createRequire(import.meta.url)('../package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.8.0';
  } catch {
    return '0.8.0';
  }
})();

export interface PluginGateContext {
  /** Installed `@mudah-cli/core` version. */
  coreVersion: string;
  /** Runtime feature flags the host currently provides. */
  features?: readonly string[];
}

export interface PluginGateResult {
  readonly ok: boolean;
  readonly reason?: string;
}

const CORE_PEER_KEYS = new Set(['@mudah-cli/core', 'core', '@mudah-cli/mudah']);

/**
 * Compatibility gate: skip a plugin when its declared peer range or
 * required feature flags are not satisfied by the host.
 */
export function gatePlugin(plugin: PluginInfo, context: PluginGateContext): PluginGateResult {
  const peers = plugin.peers ?? {};
  for (const [pkg, range] of Object.entries(peers)) {
    if (!CORE_PEER_KEYS.has(pkg)) continue;
    if (!satisfiesPeerRange(context.coreVersion, range)) {
      return {
        ok: false,
        reason: `${plugin.name} requires ${pkg} ${range} (have ${context.coreVersion})`,
      };
    }
  }
  const required = plugin.features ?? [];
  if (required.length > 0) {
    const have = new Set(context.features ?? []);
    const missing = required.filter((flag) => !have.has(flag));
    if (missing.length > 0) {
      return { ok: false, reason: `${plugin.name} requires features: ${missing.join(', ')}` };
    }
  }
  return { ok: true };
}

/**
 * Discover every installed plugin and collect what it provides. Individual
 * failures are skipped: one broken plugin must not break the host app.
 */
export async function discoverPlugins(
  basePath: string,
  options: PluginDiscoveryOptions = {},
): Promise<PluginInfo[]> {
  const loaded: PluginInfo[] = [];
  let names: string[];
  try {
    names = await findPluginPackages(basePath, options);
  } catch {
    // A malformed host manifest shouldn't stop the app from booting.
    return loaded;
  }
  for (const name of names) {
    try {
      loaded.push(await loadPlugin(name, basePath, options));
    } catch {
      // Unresolvable or unimportable: skip it.
    }
  }
  return sortPluginsByDependency(loaded);
}

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  return JSON.parse(text) as unknown;
}

function defaultResolve(specifier: string, from: string): string {
  // Resolve as the app would: from its own package.json, not from this
  // module. Workspace and nested `node_modules` then match a real install.
  const require = createRequire(join(from, 'package.json'));
  return pathToFileURL(require.resolve(specifier)).href;
}

function defaultImport(url: string): Promise<Record<string, unknown>> {
  return import(/* @vite-ignore */ url) as Promise<Record<string, unknown>>;
}
