import type { ColorLevel } from '@mudah-cli/terminal';
import { paint } from './colors.js';
import type { Theme } from './theme.js';
import { sleekDark } from './theme.js';

export interface BarChartEntry {
  label: string;
  value: number;
}

export interface BarChartOptions {
  level: ColorLevel;
  theme?: Theme;
  /** Bar width in cells. Default 24. */
  width?: number;
  /** Use unicode block characters for bars. Default true. */
  unicode?: boolean;
  /** Show the label column. Default true. */
  labels?: boolean;
}

/**
 * Render a horizontal bar chart scaled to the largest value. Pure and stream-free
 * so it composes into any output path. Bars are painted with the theme accent.
 */
export function renderBarChart(entries: BarChartEntry[], options: BarChartOptions): string {
  const theme = options.theme ?? sleekDark;
  const width = options.width ?? 24;
  const unicode = options.unicode ?? true;
  const showLabels = options.labels ?? true;
  const max = entries.length > 0 ? Math.max(0, ...entries.map((e) => e.value)) : 0;
  const full = unicode ? '█' : '#';

  const lines = entries.map((entry) => {
    const len = max > 0 ? Math.min(width, Math.round((entry.value / max) * width)) : 0;
    const bar = full.repeat(len) + ' '.repeat(width - len);
    const label = showLabels ? `${entry.label.padEnd(10)} ` : '';
    return `${label}${paint(theme.colors.accent, bar, options.level)} ${entry.value}`;
  });
  return lines.join('\n');
}
