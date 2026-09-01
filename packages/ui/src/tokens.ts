import type { ColorLevel } from '@mudah-cli/terminal';
import { paint } from './colors.js';
import type { Theme, ThemeColors } from './theme.js';
import { sleekDark } from './theme.js';

/** Semantic `paint()` token — every key of {@link ThemeColors}. */
export type PaintToken = keyof ThemeColors;

/**
 * Semantic paint() token reference documented per theme. Descriptions are
 * stable; hex values live on `theme.colors[token]`.
 */
export const PAINT_TOKENS: Record<PaintToken, string> = {
  accent: 'Primary brand accent (headings, highlights).',
  success: 'Positive status, added diffs, completed tasks.',
  error: 'Failures, deleted diffs, destructive actions.',
  warn: 'Warnings, modified diffs, caution states.',
  info: 'Informational notes, renamed diffs, links.',
  muted: 'De-emphasized secondary text.',
  border: 'Panel and table chrome.',
  highlight: 'Inline code, selected tokens.',
  text: 'Body copy.',
};

export interface PaintTokenOptions {
  level?: ColorLevel;
  theme?: Theme;
}

/**
 * Paint `text` with the theme color for `token`. Same fallback as `paint()`:
 * level 0 is plain text.
 */
export function paintToken(token: PaintToken, text: string, options: PaintTokenOptions = {}): string {
  const theme = options.theme ?? sleekDark;
  const level = options.level ?? 0;
  return paint(theme.colors[token], text, level);
}
