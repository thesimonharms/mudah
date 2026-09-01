export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface PollTerminalSizeOptions {
  /** Injectable `process.stdout.columns`. */
  columns?: number;
  /** Injectable `process.stdout.rows`. */
  rows?: number;
  /** Optional ioctl(TIOCGWINSZ)-style probe. Return null/undefined to skip. */
  ioctl?: () => TerminalSize | null | undefined;
  /**
   * Optional `tput` probe. Called with `cols` and `lines`. Return a positive
   * number (or numeric string) for each; null/undefined skips this source.
   */
  tput?: (name: 'cols' | 'lines') => number | string | null | undefined;
  /** Environment map used for `COLUMNS` / `LINES` (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
}

function positive(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function pair(cols: unknown, rows: unknown): TerminalSize | undefined {
  const c = positive(cols);
  const r = positive(rows);
  if (c === undefined || r === undefined) return undefined;
  return { cols: c, rows: r };
}

/**
 * Best-effort terminal size. Tries (in order):
 * explicit / `process.stdout` columns+rows, an injectable ioctl, an injectable
 * `tput cols` / `tput lines`, `COLUMNS`/`LINES` in `env`, then 80×24.
 */
export function pollTerminalSize(options: PollTerminalSizeOptions = {}): TerminalSize {
  const stdout = pair(options.columns ?? process.stdout.columns, options.rows ?? process.stdout.rows);
  if (stdout) return stdout;

  if (options.ioctl) {
    try {
      const size = options.ioctl();
      const fromIoctl = pair(size?.cols, size?.rows);
      if (fromIoctl) return fromIoctl;
    } catch {
      // ioctl is best-effort
    }
  }

  if (options.tput) {
    try {
      const fromTput = pair(options.tput('cols'), options.tput('lines'));
      if (fromTput) return fromTput;
    } catch {
      // tput is best-effort
    }
  }

  const env = options.env ?? process.env;
  const fromEnv = pair(env['COLUMNS'], env['LINES']);
  if (fromEnv) return fromEnv;

  return { cols: 80, rows: 24 };
}
