import { visibleLength } from '@mudah-cli/ui';
import type { ScreenBuffer } from './screen-buffer.js';

const BOX = new Set([... '─│╭╮╰╯┌┐└┘├┤┬┴┼━┃║═╔╗╚╝']);

/** Theme key for a cell, from the glyph. */
export function styleForChar(char: string): string {
  if (char === '▸' || char === '❯' || char === '▏') return 'accent';
  if (BOX.has(char)) return 'border';
  return 'text';
}

/**
 * Write a row into the buffer honoring display width (CJK = 2 cells).
 * ANSI in `text` is treated as characters; strip before calling when needed.
 */
export function blitLine(buffer: ScreenBuffer, y: number, text: string, baseStyle?: string): void {
  let x = 0;
  for (const char of text) {
    if (x >= buffer.width) break;
    const width = visibleLength(char) || 1;
    const style = baseStyle ?? styleForChar(char);
    buffer.setCell(x, y, char, style);
    if (width === 2 && x + 1 < buffer.width) {
      buffer.setCell(x + 1, y, '', style);
    }
    x += width;
  }
}

export function blitLines(buffer: ScreenBuffer, lines: string[]): void {
  buffer.clear();
  for (let y = 0; y < lines.length && y < buffer.height; y++) {
    blitLine(buffer, y, lines[y] ?? '');
  }
}
