import { BaseComponent } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';

/** Single-line text input with a moving caret. Focusable. */
export class TextInput extends BaseComponent {
  value = '';
  /** Caret index in `value`. */
  cursor = 0;
  /** Max visible width before horizontal scrolling. */
  width = 30;
  onChange?: (value: string) => void;

  constructor(private onSubmit?: (value: string) => void) {
    super();
  }

  submit(): void {
    this.onSubmit?.(this.value);
  }

  private emitChange(): void {
    this.onChange?.(this.value);
  }

  insert(text: string): void {
    this.value = this.value.slice(0, this.cursor) + text + this.value.slice(this.cursor);
    this.cursor += text.length;
    this.emitChange();
  }

  render(): string[] {
    const caret = Math.min(Math.max(this.cursor, 0), this.value.length);
    const start = Math.max(0, caret - this.width + 1);
    const visible = this.value.slice(start, start + this.width);
    const local = caret - start;
    return [`> ${visible.slice(0, local)}▏${visible.slice(local)}`];
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'input', value: this.value };
  }

  readonly keys = { enter: 'submit', 'left/right': 'caret' };

  measure(width: number, _height: number): { width: number; height: number } {
    return { width: Math.min(width, this.width + 3), height: 1 };
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    if (event.name === 'paste' && event.paste !== undefined) {
      const clean = event.paste.replace(/\r?\n/g, '');
      this.insert(clean);
      return true;
    }
    if (event.name === 'enter') {
      this.submit();
      return true;
    }
    if (event.name === 'left') {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    if (event.name === 'right') {
      this.cursor = Math.min(this.value.length, this.cursor + 1);
      return true;
    }
    if (event.name === 'home') {
      this.cursor = 0;
      return true;
    }
    if (event.name === 'end') {
      this.cursor = this.value.length;
      return true;
    }
    if (event.name === 'backspace') {
      if (this.cursor === 0) return true;
      this.value = this.value.slice(0, this.cursor - 1) + this.value.slice(this.cursor);
      this.cursor -= 1;
      this.emitChange();
      return true;
    }
    if (event.name === 'delete') {
      this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + 1);
      this.emitChange();
      return true;
    }
    if (event.ch !== undefined && event.ch >= ' ') {
      this.insert(event.ch);
      return true;
    }
    return false;
  }
}

/**
 * Multiline text input. Newlines split the buffer into rows; arrow keys move
 * the caret row by row, scrolling follows the caret. Enter inserts a newline;
 * paste preserves embedded newlines. Submit is not bound to enter — callers
 * call `submit()` themselves so forms can own the commit key.
 */
export class TextArea extends BaseComponent {
  /** Caret (line, col) — 0-based, `line` is the row index, `col` is the column within the row. */
  row = 0;
  col = 0;
  /** Lines of text. Always non-empty: an empty text area still has one empty line. */
  lines: string[] = [''];
  /** Visible row count; longer buffers scroll. */
  visibleRows = 6;
  onChange?: (value: string) => void;

  constructor(private onSubmit?: (value: string) => void) {
    super();
  }

  get value(): string {
    return this.lines.join('\n');
  }

  set value(next: string) {
    this.lines = next.split('\n');
    if (this.lines.length === 0) this.lines = [''];
    this.clampCaret();
    this.emitChange();
  }

  private emitChange(): void {
    this.onChange?.(this.value);
  }

  private clampCaret(): void {
    this.row = Math.min(Math.max(this.row, 0), this.lines.length - 1);
    const maxCol = this.lines[this.row]!.length;
    this.col = Math.min(Math.max(this.col, 0), maxCol);
  }

  private insertChar(ch: string): void {
    const line = this.lines[this.row]!;
    this.lines[this.row] = line.slice(0, this.col) + ch + line.slice(this.col);
    this.col += 1;
    this.emitChange();
  }

  private insertNewline(): void {
    const line = this.lines[this.row]!;
    const before = line.slice(0, this.col);
    const after = line.slice(this.col);
    this.lines[this.row] = before;
    this.lines.splice(this.row + 1, 0, after);
    this.row += 1;
    this.col = 0;
    this.emitChange();
  }

  private deleteBackward(): void {
    if (this.col === 0 && this.row === 0) return;
    if (this.col > 0) {
      const line = this.lines[this.row]!;
      this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col);
      this.col -= 1;
    } else {
      const prev = this.lines[this.row - 1]!;
      const cur = this.lines[this.row]!;
      this.col = prev.length;
      this.lines[this.row - 1] = prev + cur;
      this.lines.splice(this.row, 1);
      this.row -= 1;
    }
    this.emitChange();
  }

  private deleteForward(): void {
    const line = this.lines[this.row]!;
    if (this.col < line.length) {
      this.lines[this.row] = line.slice(0, this.col) + line.slice(this.col + 1);
    } else if (this.row + 1 < this.lines.length) {
      const next = this.lines[this.row + 1]!;
      this.lines[this.row] = line + next;
      this.lines.splice(this.row + 1, 1);
    }
    this.emitChange();
  }

  /** First visible row — keeps the caret in view. */
  private get scrollTop(): number {
    if (this.visibleRows <= 0) return 0;
    const margin = Math.max(0, this.visibleRows - 1);
    return Math.max(0, Math.min(this.row - margin, this.lines.length - this.visibleRows));
  }

  submit(): void {
    this.onSubmit?.(this.value);
  }

  render(): string[] {
    const top = this.scrollTop;
    const visible = this.lines.slice(top, top + this.visibleRows);
    while (visible.length < this.visibleRows) visible.push('');
    const total = Math.max(this.lines.length, 1);
    const thumb =
      total <= this.visibleRows ? 0 : Math.round((top / Math.max(1, total - this.visibleRows)) * (this.visibleRows - 1));
    return visible.map((line, i) => {
      const bar = total <= this.visibleRows ? '│' : i === thumb ? '█' : '│';
      return `${line}${bar}`;
    });
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    return { width: 30, height: this.visibleRows };
  }

  readonly keys = { enter: 'newline', up: 'line-up', down: 'line-down', 'shift+enter': 'newline', tab: 'tab' };
  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    if (event.name === 'paste' && event.paste !== undefined) {
      for (const ch of event.paste) {
        if (ch === '\n' || ch === '\r') this.insertNewline();
        else this.insertChar(ch);
      }
      this.clampCaret();
      return true;
    }
    if (event.name === 'enter') {
      this.insertNewline();
      return true;
    }
    if (event.name === 'up' && this.row > 0) {
      this.row -= 1;
      this.clampCaret();
      return true;
    }
    if (event.name === 'down' && this.row + 1 < this.lines.length) {
      this.row += 1;
      this.clampCaret();
      return true;
    }
    if (event.name === 'left') {
      if (this.col > 0) this.col -= 1;
      else if (this.row > 0) {
        this.row -= 1;
        this.col = this.lines[this.row]!.length;
      }
      return true;
    }
    if (event.name === 'right') {
      const line = this.lines[this.row]!;
      if (this.col < line.length) this.col += 1;
      else if (this.row + 1 < this.lines.length) {
        this.row += 1;
        this.col = 0;
      }
      return true;
    }
    if (event.name === 'home') {
      this.col = 0;
      return true;
    }
    if (event.name === 'end') {
      this.col = this.lines[this.row]!.length;
      return true;
    }
    if (event.name === 'backspace') {
      this.deleteBackward();
      return true;
    }
    if (event.name === 'delete') {
      this.deleteForward();
      return true;
    }
    if (event.ch !== undefined && event.ch >= ' ') {
      this.insertChar(event.ch);
      return true;
    }
    return false;
  }

  inspect(): { role: string; value: unknown } {
    return { role: 'textarea', value: this.value };
  }
}
