import { watch as fsWatch } from 'node:fs';

/**
 * Minimal `fs.watch` surface. Tests inject a fake so they never touch the
 * real filesystem or need a live file.
 */
export type ConfigWatchFn = (
  path: string,
  listener: (eventType: string, filename: string | Buffer | null) => void,
) => { close(): void };

export interface WatchConfigOptions {
  /** Aborting this signal disposes the watchers. */
  signal?: AbortSignal;
  /** Watch implementation (default `fs.watch`). */
  watch?: ConfigWatchFn;
}

/**
 * Watch config files and invoke `onReload` when any of them change.
 * Returns a disposer. Missing paths are skipped; `signal` abort is equivalent
 * to calling the disposer.
 */
export function watchConfig(
  paths: string | readonly string[],
  onReload: (path: string) => void,
  options: WatchConfigOptions = {},
): () => void {
  const list = typeof paths === 'string' ? [paths] : [...paths];
  const watchFn = options.watch ?? defaultWatch;
  const watchers: Array<{ close(): void }> = [];

  const dispose = (): void => {
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
        // already closed
      }
    }
    watchers.length = 0;
  };

  if (options.signal?.aborted) return dispose;

  for (const path of list) {
    try {
      watchers.push(
        watchFn(path, () => {
          onReload(path);
        }),
      );
    } catch {
      // Missing path, or the platform rejected the watch.
    }
  }

  options.signal?.addEventListener('abort', dispose, { once: true });
  return dispose;
}

function defaultWatch(
  path: string,
  listener: (eventType: string, filename: string | Buffer | null) => void,
): { close(): void } {
  return fsWatch(path, listener);
}

/**
 * Enough of `process` to subscribe to SIGUSR1. Tests inject an EventEmitter
 * so they never signal the real process.
 */
export interface SignalProcess {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(event: string, listener: (...args: unknown[]) => void): unknown;
  off?(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface ConfigReloadSignalOptions {
  process?: SignalProcess;
}

/**
 * Call `reload` when the process receives SIGUSR1. Returns a disposer that
 * removes the handler.
 */
export function installConfigReloadSignal(
  reload: () => void | Promise<void>,
  options: ConfigReloadSignalOptions = {},
): () => void {
  const proc = options.process ?? process;
  const handler = (): void => {
    void reload();
  };
  proc.on('SIGUSR1', handler);
  return () => {
    if (typeof proc.removeListener === 'function') proc.removeListener('SIGUSR1', handler);
    else proc.off?.('SIGUSR1', handler);
  };
}
