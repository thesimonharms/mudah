import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPlainObject } from './paths.js';

/** Default cache lifetime — same 24h window as the update nudge. */
export const REMOTE_CONFIG_TTL_MS = 24 * 60 * 60 * 1000;

/** Filename written under `cacheDir` (or `.mudah/cache`). */
export const REMOTE_CONFIG_CACHE_FILE = 'remote-config.json';

export interface LoadRemoteConfigOptions {
  /** Directory that holds `remote-config.json`. Default `.mudah/cache`. */
  cacheDir?: string;
  /** Cache lifetime in milliseconds. Default 24h. */
  ttlMs?: number;
  /** Fetch implementation (tests inject a stub). */
  fetch?: typeof fetch;
  /** Clock used for cache freshness (tests inject a stub). */
  now?: () => number;
  /** Exact cache file path; wins over `cacheDir`. */
  cachePath?: string;
  /** Alternate URL (`{ remote: url }` form). Wins over the first argument. */
  remote?: string;
}

interface RemoteCacheEntry {
  checkedAt: number;
  data: Record<string, unknown>;
}

/**
 * Resolve a `remote:` URL. Accepts a bare URL, a `remote:`-prefixed URL, or
 * an options object with `{ remote }`.
 */
export function resolveRemoteUrl(
  url: string | { remote: string },
  options: Pick<LoadRemoteConfigOptions, 'remote'> = {},
): string {
  const raw = options.remote ?? (typeof url === 'string' ? url : url.remote);
  return raw.replace(/^remote:/i, '').trim();
}

function defaultCacheDir(): string {
  return join(process.cwd(), '.mudah', 'cache');
}

function cacheFile(options: LoadRemoteConfigOptions): string {
  if (options.cachePath !== undefined && options.cachePath.length > 0) {
    return options.cachePath;
  }
  return join(options.cacheDir ?? defaultCacheDir(), REMOTE_CONFIG_CACHE_FILE);
}

function readCache(file: string): RemoteCacheEntry | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (!isPlainObject(parsed)) return null;
    const checkedAt = parsed['checkedAt'];
    const data = parsed['data'];
    if (typeof checkedAt !== 'number' || !isPlainObject(data)) return null;
    return { checkedAt, data };
  } catch {
    return null;
  }
}

function writeCache(file: string, entry: RemoteCacheEntry): void {
  try {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, JSON.stringify(entry), 'utf8');
  } catch {
    // A read-only filesystem just means no caching next time.
  }
}

async function fetchConfig(
  url: string,
  doFetch: typeof fetch,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await doFetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    return isPlainObject(body) ? body : null;
  } catch {
    return null;
  }
}

/**
 * Load configuration from a remote URL.
 *
 * Fresh cache (younger than `ttlMs`, default 24h) is reused without hitting
 * the network. A failed fetch returns the last cache entry when one exists,
 * otherwise `{}` — so a machine that has cached once keeps working offline.
 *
 * The `remote:` prefix is stripped (`remote:https://…` and `{ remote: url }`
 * are equivalent to the bare URL).
 */
export async function loadRemoteConfig(
  url: string | (LoadRemoteConfigOptions & { remote: string }),
  options: LoadRemoteConfigOptions = {},
): Promise<Record<string, unknown>> {
  const opts: LoadRemoteConfigOptions =
    typeof url === 'object' ? { ...options, ...url } : options;
  const resolved = resolveRemoteUrl(typeof url === 'string' ? url : url.remote, opts);
  const ttlMs = opts.ttlMs ?? REMOTE_CONFIG_TTL_MS;
  const now = opts.now ?? Date.now;
  const file = cacheFile(opts);
  const cached = readCache(file);

  if (cached !== null && now() - cached.checkedAt < ttlMs) {
    return cached.data;
  }

  const doFetch = opts.fetch ?? fetch;
  const data = resolved.length === 0 ? null : await fetchConfig(resolved, doFetch);
  if (data !== null) {
    writeCache(file, { checkedAt: now(), data });
    return data;
  }

  return cached !== null ? cached.data : {};
}
