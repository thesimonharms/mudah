import type { ColorLevel } from '@mudah-cli/terminal';
import { paint, visibleLength } from './colors.js';
import type { Theme } from './theme.js';
import { sleekDark } from './theme.js';

export interface TableColumn {
  header: string;
  /** Alignment within the column. Default left. */
  align?: 'left' | 'right';
}

export interface RenderTableOptions {
  level: ColorLevel;
  unicode: boolean;
  theme?: Theme;
  /** Apply theme colors to the header row. */
  styled?: boolean;
}

function cellWidth(text: string): number {
  return visibleLength(text);
}

function pad(text: string, width: number, align: 'left' | 'right'): string {
  const gap = width - cellWidth(text);
  return align === 'right' ? ' '.repeat(Math.max(0, gap)) + text : text + ' '.repeat(Math.max(0, gap));
}

/**
 * Render a simple grid table. Pure string output — stream-free, so the UI
 * layer and tests both use it directly.
 */
export function renderTable(columns: TableColumn[], rows: string[][], options: RenderTableOptions): string {
  const theme = options.theme ?? sleekDark;
  const styled = options.styled ?? true;

  const widths = columns.map((col, i) =>
    Math.max(cellWidth(col.header), ...rows.map((row) => cellWidth(row[i] ?? ''))),
  );

  const sepUnicode = options.unicode;

  const hRule = (widths: number[]) =>
    (sepUnicode ? '┌' : '+') +
    widths.map((w) => (sepUnicode ? '─' : '-').repeat(w + 2)).join(sepUnicode ? '┬' : '+') +
    (sepUnicode ? '┐' : '+');

  const lines: string[] = [hRule(widths)];

  const header = columns.map((col, i) => {
    const text = pad(col.header, widths[i]!, col.align ?? 'left');
    return styled ? paint(theme.colors.accent, text, options.level) : text;
  });
  lines.push(rowBorder(header));

  if (sepUnicode) {
    lines.push(
      '├' + widths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤',
    );
  } else {
    lines.push('+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+');
  }

  for (const row of rows) {
    lines.push(rowBorder(row.map((cell, i) => pad(cell, widths[i]!, columns[i]?.align ?? 'left'))));
  }

  lines.push(
    (sepUnicode ? '└' : '+') +
      widths.map((w) => (sepUnicode ? '─' : '-').repeat(w + 2)).join(sepUnicode ? '┴' : '+') +
      (sepUnicode ? '┘' : '+'),
  );
  return lines.join('\n');

  function rowBorder(cells: string[]): string {
    return (sepUnicode ? '│' : '|') + cells.map((c) => ` ${c} `).join(sepUnicode ? '│' : '|') + (sepUnicode ? '│' : '|');
  }
}
