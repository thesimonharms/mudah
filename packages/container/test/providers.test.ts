import { describe, expect, it } from 'vitest';
import { Container, loadProviderModule, loadProviders, loadProvidersFrom } from '@mudah-cli/container';

describe('provider modules', () => {
  it('loadProviders binds useValue / useClass / useFactory', () => {
    const c = new Container();
    loadProviders(c, [
      { provide: 'x', useValue: 3 },
      { provide: 'y', useFactory: () => 4, shared: false },
    ]);
    expect(c.make<number>('x')).toBe(3);
    expect(c.make<number>('y')).toBe(4);
  });

  it('loadProviderModule reads export const providers', async () => {
    const providers = await loadProviderModule('virtual', async () => ({
      providers: [{ provide: 'k', useValue: 'v' }],
    }));
    expect(providers).toEqual([{ provide: 'k', useValue: 'v' }]);
  });

  it('loadProvidersFrom tries providers.ts then folder', async () => {
    const loaded = await loadProvidersFrom('/no/such/dir', async () => {
      throw new Error('missing');
    });
    expect(loaded).toEqual([]);
  });
});
