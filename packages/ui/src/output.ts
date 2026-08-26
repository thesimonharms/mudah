import type { ColorLevel } from '@mudah-cli/terminal';
import { ansi } from '@mudah-cli/terminal';
import { bold, dim, paint, underline, visibleLength } from './colors.js';
import type { Theme } from './theme.js';
import { renderPanel } from './panel.js';
import { renderTable, type TableColumn } from './table.js';
import { renderMarkdown } from './markdown.js';

export interface OutputOptions {
  stream?: { write(data: string): unknown };
  errorStream?: { write(data: string): unknown };
  theme: Theme;
  colorLevel: ColorLevel;
  unicode: boolean;
  /** OSC 9 notifications supported? */
  osc9?: boolean;
}

/**
 * The styled output surface. Every framework message flows through here so
 * theming, color level, unicode, and stream selection stay consistent.
 */
export class Output {
  private out: { write(data: string): unknown };
  private err: { write(data: string): unknown };
  private readonly theme: Theme;
  private readonly level: ColorLevel;
  private readonly unicode: boolean;
  private readonly osc9: boolean;

  constructor(options: OutputOptions) {
    this.out = options.stream ?? process.stdout;
    this.err = options.errorStream ?? process.stderr;
    this.theme = options.theme;
    this.level = options.colorLevel;
    this.unicode = options.unicode;
    this.osc9 = options.osc9 ?? false;
  }

  /** Replace the underlying streams (used by test harnesses). */
  redirect(stream: { write(data: string): unknown }, errorStream: { write(data: string): unknown }): void {
    this.out = stream;
    this.err = errorStream;
  }

  get themeName(): string {
    return this.theme.name;
  }

  get colorLevel(): ColorLevel {
    return this.level;
  }

  raw(message: string): void {
    this.out.write(message + '\n');
  }

  info(message: string): void {
    this.out.write(this.paint('info', message) + '\n');
  }

  success(message: string): void {
    this.out.write(this.mark('success') + ' ' + this.paint('success', message) + '\n');
  }

  error(message: string): void {
    this.err.write(this.mark('error') + ' ' + this.paint('error', message) + '\n');
  }

  warn(message: string): void {
    this.err.write(this.mark('warn') + ' ' + this.paint('warn', message) + '\n');
  }

  muted(message: string): void {
    this.out.write(dim(this.paint('muted', message), this.level) + '\n');
  }

  /** A muted hint line on the error stream (used alongside error output). */
  hint(message: string): void {
    this.err.write(dim(this.paint('muted', `Hint: ${message}`), this.level) + '\n');
  }

  section(title: string): void {
    this.out.write('\n' + underline(bold(this.paint('accent', title), this.level), this.level) + '\n');
  }

  bullet(message: string): void {
    this.out.write(`  ${this.paint('muted', this.unicode ? '•' : '*')} ${message}\n`);
  }

  keyValue(label: string, value: string): void {
    const labelPart = bold(this.paint('muted', label), this.level);
    this.out.write(`  ${labelPart.padEnd(24)} ${value}\n`);
  }

  line(): void {
    const ch = this.unicode ? '─' : '-';
    this.out.write(this.paint('border', ch.repeat(60)) + '\n');
  }

  table(columns: TableColumn[], rows: string[][]): void {
    this.out.write(renderTable(columns, rows, { level: this.level, unicode: this.unicode }) + '\n');
  }

  panel(title: string | undefined, body: string[], width?: number): void {
    this.out.write(renderPanel(title, body, { level: this.level, unicode: this.unicode, width }) + '\n');
  }

  markdown(text: string): void {
    this.out.write(renderMarkdown(text, { level: this.level, theme: this.theme }) + '\n');
  }

  /**
   * Desktop notification via OSC 9 (Ghostty/WezTerm). When unsupported,
   * degrades to a styled status line on stderr.
   */
  notification(title: string, message: string): void {
    if (this.osc9) {
      this.err.write(`\x1b]9;${title}\x1f${message}\x07`);
      this.err.write(`\x1b]777;notify;${title};${message}\x07`);
      return;
    }
    this.err.write(this.paint('highlight', '●') + ' ' + bold(title, this.level) + ' ' + dim(message, this.level) + '\n');
  }

  private mark(kind: 'success' | 'error' | 'warn'): string {
    const glyph = kind === 'success' ? (this.unicode ? '✓' : 'v') : kind === 'error' ? (this.unicode ? '✗' : 'x') : this.unicode ? '⚠' : '!';
    return this.paint(kind, glyph);
  }

  private paint(key: 'accent' | 'success' | 'error' | 'warn' | 'info' | 'muted' | 'border' | 'highlight' | 'text', text: string): string {
    return paint(this.theme.colors[key], text, this.level);
  }

  /** Visible width of the current terminal column, for wrapping decisions. */
  padTo(text: string, width: number): string {
    const visible = visibleLength(text);
    return text + ' '.repeat(Math.max(0, width - visible));
  }

  /** Erase the previous `n` lines and reposition (used by live regions). */
  eraseLines(n: number): void {
    ansi.moveUp(this.out, n);
    ansi.eraseToEnd(this.out);
  }
}