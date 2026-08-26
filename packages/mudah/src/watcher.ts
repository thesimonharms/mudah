import { watch, existsSync, type FSWatcher } from 'node:fs';

export interface WatcherOptions {
  /** Debounce window in milliseconds. Default 150. */
  debounceMs?: number;
}

/**
 * Watch a set of files or directories (recursively where the platform
 * supports it) and invoke `onChange` after a quiet debounce period.
 * Returns a stop function. Missing paths are skipped silently.
 */
export function createWatcher(paths: string[], onChange: () => void, options: WatcherOptions = {}): () => void {
  const debounceMs = options.debounceMs ?? 150;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };

  const watchers: FSWatcher[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      watchers.push(watch(path, { recursive: true }, emit));
    } catch {
      // Some platforms don't support recursive watch; skip that path.
    }
  }

  return () => {
    if (timer) clearTimeout(timer);
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}
