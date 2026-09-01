import { join } from 'node:path';
import { watch, existsSync, type FSWatcher } from 'node:fs';

export interface WatcherOptions {
  /** Debounce window in milliseconds. Default 150. */
  debounceMs?: number;
  /** Path fragments to ignore (e.g. `node_modules`). */
  ignore?: string[];
}

function ignored(path: string, ignore: readonly string[]): boolean {
  return ignore.some((fragment) => fragment !== '' && path.includes(fragment));
}

/**
 * Watch a set of files or directories (recursively where the platform
 * supports it) and invoke `onChange` after a quiet debounce period.
 * Returns a stop function. Missing paths are skipped silently.
 */
export function createWatcher(
  paths: string[],
  onChange: (filename?: string) => void,
  options: WatcherOptions = {},
): () => void {
  const debounceMs = options.debounceMs ?? 150;
  const ignore = options.ignore ?? ['node_modules', '.git', 'dist'];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFile: string | undefined;

  const emit = (filename?: string): void => {
    if (filename !== undefined && ignored(filename, ignore)) return;
    lastFile = filename;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange(lastFile);
    }, debounceMs);
  };

  const watchers: FSWatcher[] = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      watchers.push(
        watch(path, { recursive: true }, (_event, filename) => {
          emit(typeof filename === 'string' ? filename : undefined);
        }),
      );
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

/**
 * Watch a plugin directory (typically `node_modules` or a local plugin
 * folder) and invoke `onReload` after a quiet debounce. Uses
 * {@link createWatcher}.
 */
export function watchPlugins(dir: string, onReload: (filename?: string) => void, options: WatcherOptions = {}): () => void {
  return createWatcher([dir], onReload, { ignore: ['dist'], ...options });
}

/** Directories `mudah watch` should observe for a glob like `src/**`. */
export function pathsFromGlob(base: string, glob: string): string[] {
  const stripped = glob.replace(/\/\*\*.*$/, '').replace(/\/\*$/, '').replace(/\/$/, '');
  const dir = stripped === '' || stripped === '**' ? 'src' : stripped;
  return [join(base, dir), join(base, 'src'), join(base, 'config'), join(base, 'mudah.json')];
}

/**
 * Watch `node_modules` (or `dir`) and re-import providers via `reloadPlugins`.
 */
export function hotReloadPlugins(
  app: { basePath: string; reloadPlugins: () => Promise<unknown> },
  onReload?: (filename?: string) => void,
  options: WatcherOptions & { dir?: string } = {},
): () => void {
  const dir = options.dir ?? join(app.basePath, 'node_modules');
  return watchPlugins(
    dir,
    (filename) => {
      void app.reloadPlugins().then(() => onReload?.(filename));
    },
    options,
  );
}
