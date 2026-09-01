import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  installConfigReloadSignal,
  watchConfig,
  type ConfigWatchFn,
} from '@mudah-cli/config';

describe('watchConfig', () => {
  it('invokes onReload when the injected watcher fires', () => {
    const listeners: Array<(eventType: string, filename: string | null) => void> = [];
    let closed = 0;
    const watch: ConfigWatchFn = (_path, listener) => {
      listeners.push(listener);
      return {
        close(): void {
          closed += 1;
        },
      };
    };

    const seen: string[] = [];
    const dispose = watchConfig(['a.json', 'b.json'], (path) => seen.push(path), { watch });
    expect(listeners).toHaveLength(2);

    listeners[0]!('change', 'a.json');
    listeners[1]!('change', 'b.json');
    expect(seen).toEqual(['a.json', 'b.json']);

    dispose();
    expect(closed).toBe(2);
  });

  it('disposes when the abort signal fires', () => {
    let closed = 0;
    const watch: ConfigWatchFn = () => ({
      close(): void {
        closed += 1;
      },
    });
    const controller = new AbortController();
    watchConfig('cfg.json', () => undefined, { watch, signal: controller.signal });
    controller.abort();
    expect(closed).toBe(1);
  });
});

describe('installConfigReloadSignal', () => {
  it('runs reload on SIGUSR1 and the disposer unsubscribes', () => {
    const proc = new EventEmitter();
    let calls = 0;
    const dispose = installConfigReloadSignal(() => {
      calls += 1;
    }, { process: proc });

    proc.emit('SIGUSR1');
    expect(calls).toBe(1);
    dispose();
    proc.emit('SIGUSR1');
    expect(calls).toBe(1);
  });
});
