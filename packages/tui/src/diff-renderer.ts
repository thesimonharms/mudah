import type { ColorLevel } from '@mudah-cli/terminal';
import { paint, type Theme } from '@mudah-cli/ui';
import type { ScreenBuffer } from './screen-buffer.js';

interface Cell {
  char: string;
  style: string;
}

const BLANK: Cell = { char: ' ', style: '' };

/**
 * Minimal-repaint renderer. Compares cells and emits `ESC[y;xH` for changed
 * runs only. An unchanged frame produces zero output.
 */
export class DiffRenderer {
  private prev: Cell[][] = [];

  paint(
    stream: { write(data: string): unknown },
    buffer: ScreenBuffer,
    theme?: Theme,
    colorLevel: ColorLevel = 0,
  ): number {
    let out = '';
    const next: Cell[][] = [];

    for (let y = 0; y < buffer.height; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < buffer.width; x++) row.push(buffer.getCell(x, y));
      next.push(row);

      let x = 0;
      while (x < buffer.width) {
        const prevCell = this.prev[y]?.[x];
        if (sameCell(prevCell, row[x])) {
          x += 1;
          continue;
        }
        const start = x;
        const runStyle = row[x]?.style ?? '';
        let run = '';
        while (x < buffer.width && !sameCell(this.prev[y]?.[x], row[x]) && (row[x]?.style ?? '') === runStyle) {
          const ch = row[x]?.char ?? '';
          if (ch !== '') run += ch;
          x += 1;
        }
        if (run.length > 0) {
          out += `\x1b[${y + 1};${start + 1}H${colorize(run, runStyle, theme, colorLevel)}`;
        }
      }
    }

    if (out.length > 0) stream.write(out);
    this.prev = next;
    return out.length;
  }

  reset(): void {
    this.prev = [];
  }
}

function sameCell(a: Cell | undefined, b: Cell | undefined): boolean {
  const left = a ?? BLANK;
  const right = b ?? BLANK;
  const lc = left.char === '' ? ' ' : left.char;
  const rc = right.char === '' ? ' ' : right.char;
  return lc === rc && left.style === right.style;
}

function colorize(text: string, style: string, theme: Theme | undefined, level: ColorLevel): string {
  if (!theme || style === '' || level === 0) return text;
  const hex = theme.colors[style as keyof Theme['colors']];
  if (!hex) return text;
  return paint(hex, text, level);
}
