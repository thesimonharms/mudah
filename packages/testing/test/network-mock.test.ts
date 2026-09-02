import { describe, expect, it } from 'vitest';
import { NetworkMock } from '@mudah-cli/testing';

describe('NetworkMock', () => {
  it('returns canned JSON for a registered URL', async () => {
    const net = new NetworkMock();
    net.on('https://example.com/a.json', { ok: true });
    const response = await net.fetch('https://example.com/a.json');
    expect(response.ok).toBe(true);
    expect(await response.json()).toEqual({ ok: true });
    expect(net.calls).toEqual(['https://example.com/a.json']);
  });

  it('returns 404 for an unknown URL', async () => {
    const net = new NetworkMock();
    const response = await net.fetch('https://example.com/missing');
    expect(response.status).toBe(404);
  });

  it('matches a URL with a regular expression', async () => {
    const net = new NetworkMock();
    net.reply(/registry\.npmjs\.org\/.+\/latest$/, { body: { version: '1.2.3' } });
    const response = await net.fetch('https://registry.npmjs.org/demo/latest');
    expect(await response.json()).toEqual({ version: '1.2.3' });
  });
});
