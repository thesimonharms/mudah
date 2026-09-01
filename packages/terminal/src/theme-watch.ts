import { queryTerminalTheme, type Rgb, type ThemeQueryResult } from './theme-query.js';

/** Minimal process surface used to subscribe to SIGWINCH. */
export interface WatchThemeProcess {
  on(event: string, listener: () => void): unknown;
  off(event: string, listener: () => void): unknown;
}

export interface WatchThemeOptions {
  /** Theme query. Defaults to `queryTerminalTheme`. Injectable in tests. */
  query?: typeof queryTerminalTheme;
  /** Called when a query reports different foreground/background colors. */
  onChange: (theme: ThemeQueryResult) => void;
  /** Process to listen on (default `process`). Injectable in tests. */
  process?: WatchThemeProcess;
}

function rgbEqual(a: Rgb | undefined, b: Rgb | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

/** True when `next` has colors that differ from `previous`. */
function colorsChanged(previous: ThemeQueryResult | undefined, next: ThemeQueryResult): boolean {
  if (!next.ok) return false;
  if (previous === undefined) return true;
  return !rgbEqual(previous.background, next.background) || !rgbEqual(previous.foreground, next.foreground);
}

/**
 * Re-query OSC 10/11 whenever the terminal is resized (SIGWINCH). Many
 * terminals only restyle on a window change, so this is the practical
 * hook for a live theme listener. Returns an unsubscribe function.
 */
export function watchTheme(options: WatchThemeOptions): () => void {
  const query = options.query ?? queryTerminalTheme;
  const proc = options.process ?? process;
  let previous: ThemeQueryResult | undefined;
  let inflight = false;

  const onWinch = (): void => {
    if (inflight) return;
    inflight = true;
    void Promise.resolve(query()).then(
      (result) => {
        if (colorsChanged(previous, result)) {
          options.onChange(result);
        }
        previous = result;
        inflight = false;
      },
      () => {
        inflight = false;
      },
    );
  };

  proc.on('SIGWINCH', onWinch);
  return () => {
    proc.off('SIGWINCH', onWinch);
  };
}
