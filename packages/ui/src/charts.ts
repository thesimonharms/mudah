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

export interface LineChartEntry {
  label: string;
  value: number;
}

export interface LineChartOptions {
  level: ColorLevel;
  theme?: Theme;
  /** Sampled points across the plot. Default: min(entries.length, 24). */
  width?: number;
  /** Plot height in rows. Default 4. */
  height?: number;
  /** Use unicode point/axis glyphs. Default true. */
  unicode?: boolean;
  /** Show the max-axis line and sampled labels. Default true. */
  labels?: boolean;
}

/**
 * Render an ASCII/Unicode line chart scaled to the largest value. Pure and
 * stream-free, like `renderBarChart`, so it composes into any output path.
 * Each column is a sampled data point; consecutive points are joined with a
 * vertical connector when they differ in height.
 */
export function renderLineChart(entries: LineChartEntry[], options: LineChartOptions): string {
  const level = options.level;
  const theme = options.theme ?? sleekDark;
  const unicode = options.unicode ?? true;
  const showLabels = options.labels ?? true;
  const width = Math.max(1, options.width ?? Math.min(entries.length, 24));
  const height = Math.max(1, options.height ?? 4);

  if (entries.length === 0) {
    return unicode ? '┈ no data ┈' : '  no data  ';
  }

  const max = Math.max(0, ...entries.map((e) => e.value));

  // Sample `width` points across the entries via even interpolation.
  const samples: number[] = [];
  const labels: string[] = [];
  for (let c = 0; c < width; c++) {
    const frac = width <= 1 ? 0 : c / (width - 1);
    const idx = Math.round(frac * (entries.length - 1));
    const entry = entries[idx];
    const value = entry ? entry.value : 0;
    const label = entry ? entry.label : '';
    samples.push(value);
    labels.push(label);
  }

  const cap = max > 0 ? max : 1;
  const rowOf = (v: number): number => {
    const r = Math.round(((max - v) / cap) * (height - 1));
    return Math.min(height - 1, Math.max(0, r));
  };

  const point = unicode ? '●' : '*';
  const vert = unicode ? '│' : '|';
  const axis = unicode ? '─' : '-';

  const grid: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill(' '));
  for (let c = 0; c < width; c++) {
    const r = rowOf(samples[c] ?? 0);
    const line = grid[r];
    if (line) line[c] = point;
  }
  for (let c = 0; c < width - 1; c++) {
    const r1 = rowOf(samples[c] ?? 0);
    const r2 = rowOf(samples[c + 1] ?? 0);
    const lo = Math.min(r1, r2);
    const hi = Math.max(r1, r2);
    for (let r = lo; r <= hi; r++) {
      const line = grid[r];
      if (line && line[c + 1] === ' ') line[c + 1] = vert;
    }
  }

  const lines = grid.map((row) => row.join(''));
  lines.unshift(`${axis.repeat(width)}  max: ${max}`);
  if (showLabels) {
    const first = labels[0] ?? '';
    const last = labels[labels.length - 1] ?? '';
    lines.push(`${first.padEnd(width)} ${last}`);
  }
  return lines.map((line) => paint(theme.colors.accent, line, level)).join('\n');
}
