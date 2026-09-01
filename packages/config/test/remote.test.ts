import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadRemoteConfig,
  resolveRemoteUrl,
  REMOTE_CONFIG_CACHE_FILE,
  REMOTE_CONFIG_TTL_MS,
} from '@mudah-cli/config';

let cacheDir: string;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'mudah-remote-'));
});

afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

function fakeFetch(body: unknown | null, ok = true): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    if (body === null) throw new Error(`offline: ${String(input)}`);
    return {
      ok,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('resolveRemoteUrl', () => {
  it('strips the remote: prefix', () => {
    expect(resolveRemoteUrl('remote:https://example.com/c.json')).toBe(
      'https://example.com/c.json',
    );
  });

  it('accepts a { remote } object and option', () => {
    expect(resolveRemoteUrl({ remote: 'https://x.test/a' })).toBe('https://x.test/a');
    expect(resolveRemoteUrl('ignored', { remote: 'https://x.test/b' })).toBe('https://x.test/b');
  });
});

describe('loadRemoteConfig', () => {
  it('fetches and caches on a miss', async () => {
    let calls = 0;
    const fetch = ((async () => {
      calls += 1;
      return { ok: true, json: async () => ({ name: 'remote' }) } as unknown as Response;
    }) as unknown) as typeof fetch;

    const first = await loadRemoteConfig('https://example.com/c.json', {
      cacheDir,
      fetch,
      now: () => 1_000,
    });
    expect(first).toEqual({ name: 'remote' });
    expect(calls).toBe(1);

    const cached = JSON.parse(
      await readFile(join(cacheDir, REMOTE_CONFIG_CACHE_FILE), 'utf8'),
    ) as { checkedAt: number; data: Record<string, unknown> };
    expect(cached.checkedAt).toBe(1_000);
    expect(cached.data).toEqual({ name: 'remote' });
  });

  it('reuses a fresh cache without fetching', async () => {
    let calls = 0;
    const fetch = ((async () => {
      calls += 1;
      return { ok: true, json: async () => ({ n: calls }) } as unknown as Response;
    }) as unknown) as typeof fetch;

    await loadRemoteConfig('https://example.com/c.json', {
      cacheDir,
      fetch,
      now: () => 10_000,
    });
    const hit = await loadRemoteConfig('https://example.com/c.json', {
      cacheDir,
      fetch,
      now: () => 10_000 + 60_000,
    });
    expect(hit).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it('refetches when the cache is stale', async () => {
    let calls = 0;
    const fetch = ((async () => {
      calls += 1;
      return { ok: true, json: async () => ({ n: calls }) } as unknown as Response;
    }) as unknown) as typeof fetch;

    await loadRemoteConfig('https://example.com/c.json', {
      cacheDir,
      fetch,
      now: () => 10_000,
    });
    const stale = await loadRemoteConfig('https://example.com/c.json', {
      cacheDir,
      fetch,
      now: () => 10_000 + REMOTE_CONFIG_TTL_MS + 1,
    });
    expect(stale).toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  it('returns cache when fetch fails after a previous hit', async () => {
    await loadRemoteConfig('https://example.com/c.json', {
      cacheDir,
      fetch: fakeFetch({ name: 'cached' }),
      now: () => 1,
    });
    const offline = await loadRemoteConfig('https://example.com/c.json', {
      cacheDir,
      fetch: fakeFetch(null),
      now: () => 1 + REMOTE_CONFIG_TTL_MS + 1,
    });
    expect(offline).toEqual({ name: 'cached' });
  });

  it('returns {} when fetch fails and nothing is cached', async () => {
    const result = await loadRemoteConfig('https://example.com/c.json', {
      cacheDir,
      fetch: fakeFetch(null),
    });
    expect(result).toEqual({});
  });

  it('strips remote: before fetching', async () => {
    const urls: string[] = [];
    const fetch = ((async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
    }) as unknown) as typeof fetch;

    await loadRemoteConfig('remote:https://example.com/c.json', { cacheDir, fetch });
    expect(urls).toEqual(['https://example.com/c.json']);
  });

  it('accepts { remote: url } as the first argument', async () => {
    const urls: string[] = [];
    const fetch = ((async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return { ok: true, json: async () => ({ from: 'opt' }) } as unknown as Response;
    }) as unknown) as typeof fetch;

    const result = await loadRemoteConfig({
      remote: 'https://example.com/from-opt.json',
      cacheDir,
      fetch,
    });
    expect(result).toEqual({ from: 'opt' });
    expect(urls).toEqual(['https://example.com/from-opt.json']);
  });
});
