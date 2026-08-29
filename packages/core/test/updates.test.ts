import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkForUpdate,
  clearUpdateCache,
  compareSemVer,
  formatUpdateNudge,
  isNewer,
  parseSemVer,
  updateKind,
} from '@mudah-cli/core';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'mudah-updates-'));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

/** A fetch stub that resolves the given version (or fails). */
function fakeFetch(version: string | null): typeof fetch {
  return (async () => {
    if (version === null) throw new Error('offline');
    return {
      ok: true,
      json: async () => ({ version }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('parseSemVer', () => {
  it('parses a full version', () => {
    expect(parseSemVer('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
  });

  it('tolerates a leading v', () => {
    expect(parseSemVer('v2.0.0')?.major).toBe(2);
  });

  it('fills in missing minor and patch', () => {
    expect(parseSemVer('3')).toEqual({ major: 3, minor: 0, patch: 0, prerelease: [] });
    expect(parseSemVer('3.1')).toEqual({ major: 3, minor: 1, patch: 0, prerelease: [] });
  });

  it('parses prerelease identifiers', () => {
    expect(parseSemVer('1.0.0-alpha.1')?.prerelease).toEqual(['alpha', 1]);
  });

  it('ignores build metadata', () => {
    expect(parseSemVer('1.0.0+build.5')?.patch).toBe(0);
  });

  it('returns null for junk', () => {
    expect(parseSemVer('not-a-version')).toBeNull();
    expect(parseSemVer('')).toBeNull();
  });
});

describe('compareSemVer', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareSemVer('1.0.0', '2.0.0')).toBe(-1);
    expect(compareSemVer('2.0.0', '1.9.9')).toBe(1);
    expect(compareSemVer('1.1.0', '1.2.0')).toBe(-1);
    expect(compareSemVer('1.0.1', '1.0.0')).toBe(1);
    expect(compareSemVer('1.2.3', '1.2.3')).toBe(0);
  });

  it('sorts prereleases below their release', () => {
    expect(compareSemVer('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareSemVer('1.0.0', '1.0.0-alpha')).toBe(1);
  });

  it('orders prerelease identifiers', () => {
    expect(compareSemVer('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1);
    expect(compareSemVer('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
    expect(compareSemVer('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1);
  });

  it('sorts numeric identifiers below alphanumeric ones', () => {
    expect(compareSemVer('1.0.0-1', '1.0.0-alpha')).toBe(-1);
  });

  it('returns 0 for unparseable input', () => {
    expect(compareSemVer('junk', '1.0.0')).toBe(0);
  });
});

describe('isNewer / updateKind', () => {
  it('detects newer versions', () => {
    expect(isNewer('2.0.0', '1.0.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.0', '1.0.0')).toBe(false);
  });

  it('classifies the gap', () => {
    expect(updateKind('1.0.0', '2.0.0')).toBe('major');
    expect(updateKind('1.0.0', '1.1.0')).toBe('minor');
    expect(updateKind('1.0.0', '1.0.1')).toBe('patch');
  });

  it('never nudges a stable install onto a prerelease', () => {
    // Both are prereleases of something newer, so neither is a plain bump.
    expect(updateKind('1.0.0', '1.0.1-alpha.1')).toBe('prerelease');
    expect(updateKind('1.0.0', '2.0.0-beta.1')).toBe('prerelease');
  });

  it('classifies a prerelease-to-prerelease bump', () => {
    expect(updateKind('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe('patch');
  });
});

describe('checkForUpdate', () => {
  it('reports an available update from the registry', async () => {
    const result = await checkForUpdate({
      packageName: 'demo',
      currentVersion: '1.0.0',
      cacheDir,
      fetch: fakeFetch('1.2.0'),
    });
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('1.2.0');
    expect(result.kind).toBe('minor');
    expect(result.source).toBe('registry');
    expect(result.checked).toBe(true);
  });

  it('reports no update when current is newest', async () => {
    const result = await checkForUpdate({
      packageName: 'demo',
      currentVersion: '1.2.0',
      cacheDir,
      fetch: fakeFetch('1.2.0'),
    });
    expect(result.updateAvailable).toBe(false);
    expect(result.checked).toBe(true);
  });

  it('ignores an older published version', async () => {
    const result = await checkForUpdate({
      packageName: 'demo',
      currentVersion: '2.0.0',
      cacheDir,
      fetch: fakeFetch('1.0.0'),
    });
    expect(result.updateAvailable).toBe(false);
  });

  it('fails soft when the network is down', async () => {
    const result = await checkForUpdate({
      packageName: 'demo',
      currentVersion: '1.0.0',
      cacheDir,
      fetch: fakeFetch(null),
    });
    expect(result.checked).toBe(false);
    expect(result.reason).toBe('offline');
    expect(result.updateAvailable).toBe(false);
  });

  it('refuses to check an unparseable current version', async () => {
    const result = await checkForUpdate({
      packageName: 'demo',
      currentVersion: 'nightly',
      cacheDir,
      fetch: fakeFetch('1.0.0'),
    });
    expect(result.reason).toBe('invalid-version');
    expect(result.checked).toBe(false);
  });

  it('reuses a fresh cache entry without fetching', async () => {
    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls++;
      return { ok: true, json: async () => ({ version: '9.9.9' }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const options = { packageName: 'demo', currentVersion: '1.0.0', cacheDir, fetch: counting };
    await checkForUpdate(options);
    const second = await checkForUpdate(options);

    expect(calls).toBe(1);
    expect(second.source).toBe('cache');
    expect(second.latestVersion).toBe('9.9.9');
  });

  it('refetches once the cache is stale', async () => {
    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls++;
      return { ok: true, json: async () => ({ version: '2.0.0' }) } as unknown as typeof fetch;
    }) as unknown as typeof fetch;

    const options = {
      packageName: 'demo',
      currentVersion: '1.0.0',
      cacheDir,
      fetch: counting,
      cacheTtlMs: 0,
    };
    await checkForUpdate(options);
    await checkForUpdate(options);
    expect(calls).toBe(2);
  });

  it('falls back to a stale cache entry when offline', async () => {
    const options = { packageName: 'demo', currentVersion: '1.0.0', cacheDir };
    await checkForUpdate({ ...options, fetch: fakeFetch('3.0.0') });
    const offline = await checkForUpdate({ ...options, fetch: fakeFetch(null), cacheTtlMs: 0 });

    expect(offline.source).toBe('cache');
    expect(offline.updateAvailable).toBe(true);
    expect(offline.latestVersion).toBe('3.0.0');
  });

  it('survives a non-200 registry response', async () => {
    const notFound: typeof fetch = (async () =>
      ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    const result = await checkForUpdate({
      packageName: 'demo',
      currentVersion: '1.0.0',
      cacheDir,
      fetch: notFound,
    });
    expect(result.checked).toBe(false);
  });

  it('survives a malformed registry payload', async () => {
    const junk: typeof fetch = (async () =>
      ({ ok: true, json: async () => ({ nope: true }) }) as unknown as Response) as unknown as typeof fetch;
    const result = await checkForUpdate({
      packageName: 'demo',
      currentVersion: '1.0.0',
      cacheDir,
      fetch: junk,
    });
    expect(result.checked).toBe(false);
  });

  it('clears its cache on request', async () => {
    const options = { packageName: 'demo', currentVersion: '1.0.0', cacheDir };
    await checkForUpdate({ ...options, fetch: fakeFetch('2.0.0') });
    clearUpdateCache('demo', { cacheDir });

    let calls = 0;
    const counting: typeof fetch = (async () => {
      calls++;
      return { ok: true, json: async () => ({ version: '2.0.0' }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await checkForUpdate({ ...options, fetch: counting });
    expect(calls).toBe(1);
  });
});

describe('formatUpdateNudge', () => {
  it('renders a line when an update exists', () => {
    const info = {
      updateAvailable: true,
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      kind: 'minor' as const,
      checked: true,
    };
    expect(formatUpdateNudge(info, 'my-cli')).toContain('1.0.0 → 1.2.0');
  });

  it('returns null when there is nothing to say', () => {
    const info = { updateAvailable: false, currentVersion: '1.0.0', checked: true };
    expect(formatUpdateNudge(info, 'my-cli')).toBeNull();
  });
});
