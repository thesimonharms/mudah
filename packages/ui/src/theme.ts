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
 * default for CLI tools); a runtime OSC 10 query can refine this in v0.2.
 */
export function resolveTheme(name: string | undefined): Theme {
  if (name === undefined || name === 'auto') return sleekDark;
  return themes[name] ?? sleekDark;
}
