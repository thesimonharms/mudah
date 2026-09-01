import type { ColorLevel } from '@mudah-cli/terminal';
import { paint } from './colors.js';
import type { Theme } from './theme.js';
import { sleekDark } from './theme.js';

export type DiffKind = 'added' | 'modified' | 'deleted' | 'renamed';

/** ASCII / default diff markers (`config:diff` uses the same set). */
export const diffGlyphs = {
  added: '+',
  modified: '~',
  deleted: '-',
  renamed: '→',
} as const;

/** Unicode variants of {@link diffGlyphs}. */
export const diffGlyphsUnicode = {
  added: '✚',
  modified: '●',
  deleted: '✖',
  renamed: '→',
} as const;

export interface FormatDiffLineOptions {
  unicode?: boolean;
  level?: ColorLevel;
  theme?: Theme;
}

const KIND_TOKEN: Record<DiffKind, keyof Theme['colors']> = {
  added: 'success',
  modified: 'warn',
  deleted: 'error',
  renamed: 'info',
};

/**
 * Prefix `text` with the glyph for `kind`. When `level` is above 0 the line
 * is painted with the matching theme token (added→success, deleted→error).
 */
export function formatDiffLine(kind: DiffKind, text: string, options: FormatDiffLineOptions = {}): string {
  const glyphs = options.unicode === true ? diffGlyphsUnicode : diffGlyphs;
  const line = `${glyphs[kind]} ${text}`;
  const level = options.level ?? 0;
  if (level === 0) return line;
  const theme = options.theme ?? sleekDark;
  return paint(theme.colors[KIND_TOKEN[kind]], line, level);
}
