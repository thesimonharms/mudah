import { queryTerminalTheme, type OscWriter, type ThemeQueryInput } from '@mudah-cli/terminal';

export interface ThemeColors {
  /** Primary brand accent (headings, highlights). */
  accent: string;
  success: string;
  error: string;
  warn: string;
  info: string;
  muted: string;
  border: string;
  highlight: string;
  text: string;
}

export interface Theme {
  readonly name: string;
  readonly mode: 'dark' | 'light';
  readonly colors: ThemeColors;
}

export const sleekDark: Theme = {
  name: 'sleek-dark',
  mode: 'dark',
  colors: {
    accent: '#7aa2f7',
    success: '#9ece6a',
    error: '#f7768e',
    warn: '#e0af68',
    info: '#7dcfff',
    muted: '#565f89',
    border: '#3b4261',
    highlight: '#bb9af7',
    text: '#a9b1d6',
  },
};

export const sleekLight: Theme = {
  name: 'sleek-light',
  mode: 'light',
  colors: {
    accent: '#4257b2',
    success: '#2e7d32',
    error: '#c62828',
    warn: '#b26a00',
    info: '#0277bd',
    muted: '#8a94a6',
    border: '#c3cdd9',
    highlight: '#6a3fc0',
    text: '#37474f',
  },
};

export const themes: Record<string, Theme> = {
  sleek: sleekDark,
  'sleek-dark': sleekDark,
  'sleek-light': sleekLight,
};

/**
 * Resolve a theme by name. `'auto'` falls back to dark mode (the safe
 * default for CLI tools) — use `detectTheme()` when you want the terminal's
 * real colors to decide.
 */
export function resolveTheme(name: string | undefined): Theme {
  if (name === undefined || name === 'auto') return sleekDark;
  return themes[name] ?? sleekDark;
}

export interface DetectThemeOptions {
  /**
   * Theme name. Only `'auto'` triggers a terminal query — an explicit name
   * (and `undefined`) resolve synchronously, keeping cold start untouched.
   */
  name?: string;
  /**
   * Skip the query entirely (non-interactive runs, tests). Defaults to
   * `process.stdin.isTTY`.
   */
  allowQuery?: boolean;
  /** How long to wait for the terminal's answer. */
  timeoutMs?: number;
  /** Stream the query is written to (default `process.stdout`). */
  stdout?: OscWriter;
  /** Stream the answer is read from (default `process.stdin`). */
  stdin?: ThemeQueryInput;
}

/**
 * Resolve the theme, asking the terminal for its colors when the manifest
 * asks for `'auto'`. Every other name resolves synchronously, and any run
 * that can't answer (no TTY, timeout, silent terminal) falls back to dark.
 * Never throws.
 */
export async function detectTheme(options: DetectThemeOptions = {}): Promise<Theme> {
  const name = options.name;
  if (name !== 'auto') return resolveTheme(name);

  const allowQuery = options.allowQuery ?? process.stdin.isTTY === true;
  if (!allowQuery) return sleekDark;

  try {
    const result = await queryTerminalTheme({
      timeoutMs: options.timeoutMs,
      stdout: options.stdout,
      stdin: options.stdin,
    });
    if (!result.ok) return sleekDark;
    return result.theme === 'light' ? sleekLight : sleekDark;
  } catch {
    return sleekDark;
  }
}
