import type { OscWriter } from './osc.js';

/** ANSI cursor/screen helpers shared by the animation and UI layers. */
export const ansi = {
  /** Erase the current line. */
  clearLine(stream: OscWriter): void {
    stream.write('\x1b[2K');
  },
  /** Erase from the cursor to the end of the line. */
  eraseEol(stream: OscWriter): void {
    stream.write('\x1b[K');
  },
  /** Move the cursor up `n` lines (clamped at the top). */
  moveUp(stream: OscWriter, n: number): void {
    if (n > 0) stream.write(`\x1b[${n}A`);
  },
  /** Move to the start of the line. */
  toLineStart(stream: OscWriter): void {
    stream.write('\x1b[0G');
  },
  /** Clear the whole screen and home the cursor. */
  clearScreen(stream: OscWriter): void {
    stream.write('\x1b[2J\x1b[H');
  },
  /** Erase from the cursor to the end of the screen. */
  eraseToEnd(stream: OscWriter): void {
    stream.write('\x1b[J');
  },
  hideCursor(stream: OscWriter): void {
    stream.write('\x1b[?25l');
  },
  showCursor(stream: OscWriter): void {
    stream.write('\x1b[?25h');
  },
  /** Wrap `text` in dim styling. */
  dim(text: string): string {
    return `\x1b[2m${text}\x1b[22m`;
  },
  bold(text: string): string {
    return `\x1b[1m${text}\x1b[22m`;
  },
  underline(text: string): string {
    return `\x1b[4m${text}\x1b[24m`;
  },
};
