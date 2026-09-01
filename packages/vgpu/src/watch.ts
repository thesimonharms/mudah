import { watch as fsWatch, readFileSync } from 'node:fs';

/**
 * Minimal `fs.watch` surface. Tests inject a fake so they never touch the
 * real filesystem or need a live file.
 */
export type ShaderWatchFn = (
  path: string,
  listener: (eventType: string, filename: string | Buffer | null) => void,
) => { close(): void };

export interface WatchShaderOptions {
  /** Aborting this signal disposes the watcher. */
  signal?: AbortSignal;
  /** Watch implementation (default `fs.watch`). */
  watch?: ShaderWatchFn;
  /** File reader invoked when the watcher fires (default `readFileSync`). */
  readFile?: (path: string) => string;
}

/**
 * Watch a WGSL file and invoke `onChange` with the new source on every
 * filesystem event. Returns a disposer. `signal` abort is equivalent to
 * calling the disposer.
 */
export function watchShader(
  path: string,
  onChange: (source: string) => void,
  options: WatchShaderOptions = {},
): () => void {
  const watchFn = options.watch ?? defaultWatch;
  const read = options.readFile ?? defaultRead;
  let watcher: { close(): void } | undefined;

  const dispose = (): void => {
    if (watcher === undefined) return;
    try {
      watcher.close();
    } catch {
      // already closed
    }
    watcher = undefined;
  };

  if (options.signal?.aborted) return dispose;

  const fire = (): void => {
    try {
      onChange(read(path));
    } catch {
      // Missing file or the reader rejected the path.
    }
  };

  try {
    watcher = watchFn(path, () => {
      fire();
    });
  } catch {
    return dispose;
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

function defaultRead(path: string): string {
  return readFileSync(path, 'utf8');
}

/** True when `argv` contains `--watch` or `-w`. */
export function parseWatchFlag(argv: readonly string[] = process.argv): boolean {
  return argv.includes('--watch') || argv.includes('-w');
}
