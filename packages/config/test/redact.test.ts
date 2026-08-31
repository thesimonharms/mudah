import { describe, expect, it } from 'vitest';
import { redactSecrets, REDACT_KEYS, type RedactOptions } from '@mudah-cli/config';

describe('redactSecrets', () => {
  it('leaves non-sensitive scalars and objects untouched', () => {
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets({ name: 'app', count: 3 })).toEqual({ name: 'app', count: 3 });
  });

  it('masks values under sensitive keys', () => {
    expect(redactSecrets({ app: { password: 'hunter2', name: 'app' } })).toEqual({
      app: { password: '[redacted]', name: 'app' },
    });
  });

  it('masks nested secrets by key name at any depth', () => {
    expect(redactSecrets({ db: { url: 'postgres://u:p@h/db' } })).toEqual({
      db: { url: '[redacted]' },
    });
  });

  it('recurses into arrays', () => {
    expect(redactSecrets([{ token: 'x' }, { name: 'y' }])).toEqual([
      { token: '[redacted]' },
      { name: 'y' },
    ]);
  });

  it('honors an empty keys list (no redaction)', () => {
    const opts: RedactOptions = { keys: [] };
    expect(redactSecrets({ password: 'x' }, opts)).toEqual({ password: 'x' });
  });

  it('uses a custom mask', () => {
    expect(redactSecrets({ token: 'abc' }, { mask: '••••••••' })).toEqual({ token: '••••••••' });
  });

  it('ships a non-empty default pattern set', () => {
    expect(REDACT_KEYS.length).toBeGreaterThan(0);
  });
});
