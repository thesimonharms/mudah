import { describe, expect, it, vi } from 'vitest';
import { watchTheme, type ThemeQueryResult } from '@mudah-cli/terminal';

function fakeProcess(): {
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
  emit(event: string): void;
} {
  const listeners = new Map<string, Set<() => void>>();
  return {
    on(event: string, listener: () => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return this;
    },
    off(event: string, listener: () => void) {
      listeners.get(event)?.delete(listener);
      return this;
    },
    emit(event: string) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener();
    },
  };
}

const dark: ThemeQueryResult = {
  ok: true,
  theme: 'dark',
  background: { r: 0, g: 0, b: 0 },
  foreground: { r: 255, g: 255, b: 255 },
};

const light: ThemeQueryResult = {
  ok: true,
  theme: 'light',
  background: { r: 255, g: 255, b: 255 },
  foreground: { r: 0, g: 0, b: 0 },
};

describe('watchTheme', () => {
  it('re-queries OSC 10/11 on SIGWINCH and notifies when colors change', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(dark)
      .mockResolvedValueOnce(light)
      .mockResolvedValueOnce(light);

    const seen: ThemeQueryResult[] = [];
    const proc = fakeProcess();
    const stop = watchTheme({
      query,
      onChange: (theme) => seen.push(theme),
      process: proc,
    });

    proc.emit('SIGWINCH');
    await query.mock.results[0]!.value;
    await Promise.resolve();
    proc.emit('SIGWINCH');
    await query.mock.results[1]!.value;
    await Promise.resolve();
    proc.emit('SIGWINCH');
    await query.mock.results[2]!.value;
    await Promise.resolve();

    expect(query).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([dark, light]);

    stop();
    proc.emit('SIGWINCH');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('does not notify when a query fails', async () => {
    const query = vi.fn().mockResolvedValue({ ok: false, theme: 'unknown', reason: 'timeout' });
    const seen: ThemeQueryResult[] = [];
    const proc = fakeProcess();
    const stop = watchTheme({ query, onChange: (theme) => seen.push(theme), process: proc });

    proc.emit('SIGWINCH');
    await query.mock.results[0]!.value;
    expect(seen).toEqual([]);
    stop();
  });
});
