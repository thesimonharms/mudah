import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Update nudge: compare the app's version against the npm registry and
 * mention it once in a while.
 *
 * Everything here fails soft. A machine with no network, no writable cache
 * dir, or a firewalled registry gets no nudge and no error — the check runs
 * on the slow path of an already-successful command, so it must never be the
 * reason a command failed.
 */

export interface UpdateCheckOptions {
  /** Package name as published to npm. */
  packageName: string;
  /** The version currently running. */
  currentVersion: string;
  /** Skip the network when a cached answer is younger than this. Default 24h. */
  cacheTtlMs?: number;
  /** Overall deadline for the network call. Default 1500ms. */
  timeoutMs?: number;
  /** Registry base URL. Defaults to `https://registry.npmjs.org`. */
  registry?: string;
  /** Override the cache directory (tests, sandboxes). */
  cacheDir?: string;
  /** Fetch implementation (tests inject a stub). */
  fetch?: typeof fetch;
  /** Dist-tag to compare against. Default `latest`. */
  distTag?: string;
}

export interface UpdateInfo {
  /** A newer version is available. */
  readonly updateAvailable: boolean;
  readonly currentVersion: string;
  /** The newest published version, when one was resolved. */
  readonly latestVersion?: string;
  /** How big the gap is: `major`, `minor`, `patch`, or `prerelease`. */
  readonly kind?: 'major' | 'minor' | 'patch' | 'prerelease';
}

export interface UpdateCheckResult extends UpdateInfo {
  /** False when the check was skipped or failed; never throws. */
  readonly checked: boolean;
  /** Why nothing was resolved, when `checked` is false. */
  readonly reason?: 'disabled' | 'cached-no-update' | 'offline' | 'invalid-version' | 'not-found';
  /** Where the answer came from. */
  readonly source?: 'cache' | 'registry';
}

/** No update. Returned for every non-actionable outcome. */
const NO_UPDATE: UpdateCheckResult = {
  updateAvailable: false,
  currentVersion: '',
  checked: false,
};

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Prerelease identifiers, e.g. `['alpha', '1']`. */
  prerelease: ReadonlyArray<string | number>;
}

/**
 * Parse a semver string. Tolerates a leading `v`/`=` and missing minor/patch
 * (`1` → `1.0.0`). Returns null when the string isn't a version at all.
 */
export function parseSemVer(version: string): SemVer | null {
  const text = version.trim().replace(/^[v=]+/, '');
  const match =
    /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/.exec(text);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? '0'),
    patch: Number(match[3] ?? '0'),
    prerelease: match[4] === undefined ? [] : match[4].split('.').map(identifier),
  };
}

function identifier(part: string): string | number {
  return /^\d+$/.test(part) ? Number(part) : part;
}

/**
 * Compare two versions. Returns -1 when `a` sorts first, 1 when `a` sorts
 * after, 0 when they're equal. Prereleases sort below their release
 * (`1.0.0-alpha` < `1.0.0`).
 */
export function compareSemVer(a: string, b: string): number {
  const left = parseSemVer(a);
  const right = parseSemVer(b);
  if (left === null || right === null) return 0;

  for (const field of ['major', 'minor', 'patch'] as const) {
    if (left[field] !== right[field]) return left[field] < right[field] ? -1 : 1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function comparePrerelease(
  a: ReadonlyArray<string | number>,
  b: ReadonlyArray<string | number>,
): number {
  // A version without a prerelease is newer than one with it.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i];
    const right = b[i];
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    if (left === right) continue;

    const leftIsNumber = typeof left === 'number';
    const rightIsNumber = typeof right === 'number';
    if (leftIsNumber && rightIsNumber) return left < right ? -1 : 1;
    // Numeric identifiers always sort below alphanumeric ones.
    if (leftIsNumber) return -1;
    if (rightIsNumber) return 1;
    return String(left) < String(right) ? -1 : 1;
  }
  return 0;
}

/** Classify the gap between two versions, from the older one's perspective. */
export function updateKind(current: string, latest: string): UpdateInfo['kind'] {
  const from = parseSemVer(current);
  const to = parseSemVer(latest);
  if (from === null || to === null) return undefined;
  if (to.prerelease.length > 0 && from.prerelease.length === 0) return 'prerelease';
  if (to.major !== from.major) return 'major';
  if (to.minor !== from.minor) return 'minor';
  return 'patch';
}

/** True when `latest` is newer than `current`. */
export function isNewer(latest: string, current: string): boolean {
  return compareSemVer(latest, current) > 0;
}

/** The default cache directory: XDG on Unix, `%LOCALAPPDATA%` on Windows. */
export function defaultCacheDir(appName = 'mudah'): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? '';
  if (process.platform === 'win32') {
    return process.env['LOCALAPPDATA'] ?? join(home, 'AppData', 'Local', appName, 'cache');
  }
  const xdg = process.env['XDG_CACHE_HOME'];
  if (xdg !== undefined && xdg.length > 0) return join(xdg, appName);
  return join(home, '.cache', appName);
}

interface CacheEntry {
  latestVersion: string;
  checkedAt: number;
}

function cacheFile(cacheDir: string, packageName: string): string {
  return join(cacheDir, `${packageName.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
}

function readCache(file: string): CacheEntry | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const entry = parsed as Partial<CacheEntry>;
    if (typeof entry.latestVersion !== 'string' || typeof entry.checkedAt !== 'number') {
      return null;
    }
    return { latestVersion: entry.latestVersion, checkedAt: entry.checkedAt };
  } catch {
    return null;
  }
}

function writeCache(file: string, entry: CacheEntry): void {
  try {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, JSON.stringify(entry), 'utf8');
  } catch {
    // A read-only filesystem just means no caching next time.
  }
}

/** Clear a cached answer. Used by `--no-update-check`-style tooling and tests. */
export function clearUpdateCache(
  packageName: string,
  options: { cacheDir?: string } = {},
): void {
  try {
    rmSync(cacheFile(options.cacheDir ?? defaultCacheDir(), packageName), { force: true });
  } catch {
    // Nothing cached, or not removable — either way, mission accomplished.
  }
}

/**
 * Check npm for a newer version. Resolves `checked: false` rather than
 * throwing, so callers can fire-and-forget it.
 */
export async function checkForUpdate(
  options: UpdateCheckOptions,
): Promise<UpdateCheckResult> {
  const current = options.currentVersion;
  if (parseSemVer(current) === null) {
    return { ...NO_UPDATE, currentVersion: current, reason: 'invalid-version' };
  }

  const ttlMs = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
  const file = cacheFile(options.cacheDir ?? defaultCacheDir(), options.packageName);

  // A fresh cache hit answers without touching the network.
  const cached = readCache(file);
  if (cached !== null && Date.now() - cached.checkedAt < ttlMs) {
    return resolve(current, cached.latestVersion, 'cache');
  }

  const latest = await fetchLatest(options);
  if (latest === null) {
    // Offline: fall back to a stale cache entry rather than saying nothing.
    if (cached !== null) return resolve(current, cached.latestVersion, 'cache');
    return { ...NO_UPDATE, currentVersion: current, reason: 'offline' };
  }

  writeCache(file, { latestVersion: latest, checkedAt: Date.now() });
  return resolve(current, latest, 'registry');
}

function resolve(
  current: string,
  latest: string,
  source: 'cache' | 'registry',
): UpdateCheckResult {
  if (!isNewer(latest, current)) {
    return {
      updateAvailable: false,
      currentVersion: current,
      latestVersion: latest,
      checked: true,
      reason: 'cached-no-update',
      source,
    };
  }
  return {
    updateAvailable: true,
    currentVersion: current,
    latestVersion: latest,
    kind: updateKind(current, latest),
    checked: true,
    source,
  };
}

async function fetchLatest(options: UpdateCheckOptions): Promise<string | null> {
  const doFetch = options.fetch ?? fetch;
  const registry = (
    options.registry ??
    process.env['MUDAH_UPDATE_REGISTRY'] ??
    'https://registry.npmjs.org'
  ).replace(/\/+$/, '');
  const name = options.packageName.replace(/^\//, '').replace(/\//g, '%2f');
  const tag = options.distTag ?? 'latest';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 1500);
  try {
    const response = await doFetch(`${registry}/${name}/${tag}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;

    const body = (await response.json()) as unknown;
    if (typeof body !== 'object' || body === null) return null;
    const version = (body as { version?: unknown }).version;
    if (typeof version !== 'string' || parseSemVer(version) === null) return null;
    return version;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Format a one-line nudge. Returns null when there's nothing to say, so
 * callers can `if (line) output.muted(line)`.
 */
export function formatUpdateNudge(
  info: UpdateCheckResult,
  binName: string,
): string | null {
  if (!info.updateAvailable || info.latestVersion === undefined) return null;
  return `Update available: ${info.currentVersion} → ${info.latestVersion} (npm i -g ${binName})`;
}
