import type { ScreenBuffer } from './screen-buffer.js';

/**
 * Minimal-repaint renderer: keeps the previously painted frame and emits
 * position-addressed updates (`ESC[y;xH`) for changed rows only. An
 * unchanged frame produces zero output.
 */
export class DiffRenderer {
  private prevLines: string[] = [];

  /**
   * Paint the buffer to the stream, writing only what changed since the
   * previous call. Returns the number of characters emitted (0 when the
   * frame is identical to the last).
   */
  paint(stream: { write(data: string): unknown }, buffer: ScreenBuffer): number {
    const lines = buffer.toLines();
    let out = '';

    for (let y = 0; y < lines.length; y++) {
      const current = lines[y] ?? '';
      const previous = y < this.prevLines.length ? this.prevLines[y] : undefined;
      if (current === previous) continue;
      // Clear to end of line (handles shrinkage) then write at column 1.
      out += `\x1b[${y + 1};1H\x1b[2K${current}`;
    }

    if (out.length > 0) {
      stream.write(out);
    }
    this.prevLines = lines;
    return out.length;
  }

  /** Forget the previous frame (next paint is full). */
  reset(): void {
    this.prevLines = [];
  }
}
