/**
 * A rectangular cell grid. Each cell holds a character plus a style tag
 * (a theme color key: `accent`, `error`, …). Two renderings are maintained:
 * a plain string array (for tests and non-color output) and a styled string
 * (escape-sequence wrapped) for the real terminal.
 */
export class ScreenBuffer {
  readonly width: number;
  readonly height: number;
  private cells: (string | undefined)[];
  /** Style tag per cell: theme key or '' for default. */
  private styles: string[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.cells = new Array(width * height).fill(undefined);
    this.styles = new Array(width * height).fill('');
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  setCell(x: number, y: number, char: string, style = ''): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = this.index(x, y);
    this.cells[i] = char;
    this.styles[i] = style;
  }

  clear(): void {
    this.cells.fill(undefined);
    this.styles.fill('');
  }

  getCell(x: number, y: number): { char: string; style: string } {
    const i = this.index(x, y);
    return { char: this.cells[i] ?? ' ', style: this.styles[i] ?? '' };
  }

  /** Overwrite the buffer's cells from an array of line strings. */
  setLines(lines: string[], stylesByKey?: Map<string, (y: number) => string>): void {
    this.clear();
    lines.forEach((line, y) => {
      [...line].forEach((char, x) => {
        this.setCell(x, y, char);
      });
    });
  }

  /** Rows as plain strings (trailing spaces trimmed per row). */
  toLines(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.height; y++) {
      let row = '';
      for (let x = 0; x < this.width; x++) {
        row += this.getCell(x, y).char;
      }
      rows.push(row.replace(/\s+$/, ''));
    }
    return rows;
  }

  /**
   * Render to a single string with cursor homing (`\x1b[H`), per-cell styling,
   * and a final screen clear. Styled runs are merged when the style tag is
   * equal on adjacent cells.
   */
  renderStyled(paint: (text: string, styleKey: string) => string): string {
    let out = '\x1b[H';
    for (let y = 0; y < this.height; y++) {
      let run = '';
      let runStyle = '';
      const flush = (): void => {
        if (run.length > 0) out += runStyle === '' ? run : paint(run, runStyle);
        run = '';
        runStyle = '';
      };
      for (let x = 0; x < this.width; x++) {
        const { char, style } = this.getCell(x, y);
        if (style !== runStyle && run.length > 0) flush();
        run += char;
        runStyle = style;
      }
      flush();
      if (y < this.height - 1) out += '\r\n';
    }
    return out;
  }
}
