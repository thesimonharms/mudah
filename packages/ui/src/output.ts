import type { ColorLevel } from '@mudah-cli/terminal';
import { ansi } from '@mudah-cli/terminal';
import { bold, dim, paint, underline, visibleLength } from './colors.js';
import type { Theme } from './theme.js';
import { renderPanel } from './panel.js';
import { renderTable, type TableColumn } from './table.js';
import { renderMarkdown } from './markdown.js';

export type OutputMode = 'styled' | 'plain' | 'json';

export interface OutputOptions {
  stream?: { write(data: string): unknown };
  errorStream?: { write(data: string): unknown };
  theme: Theme;
  colorLevel: ColorLevel;
  unicode: boolean;
  /** OSC 9 notifications supported? */
  osc9?: boolean;
  /** Rendering mode. Default `styled` (colors when level > 0). */
  mode?: OutputMode;
}

/** A structured result event (used by JSON mode and the result envelope). */
export interface OutputEvent {
  readonly kind: 'info' | 'success' | 'error' | 'warn' | 'data';
  readonly message: string;
  readonly data?: unknown;
}

/**
 * The styled output surface. Every framework message flows through here so
 * theming, color level, unicode, stream selection — and output *mode* — stay
 * consistent.
 *
 * Modes:
 * - `styled`: colors/glyphs when the terminal allows; default.
 * - `plain`: no ANSI at all (still human-readable). Good for logs.
 * - `json`: every primitive becomes one machine-readable JSON line on
 *   stdout; use {@link emit} for structured payloads and
 *   {@link jsonEnvelope} for a single `{ok, results|error}` document.
 */
export class Output {
  private out: { write(data: string): unknown };
  private err: { write(data: string): unknown };
  private readonly theme: Theme;
  private readonly level: ColorLevel;
  private readonly unicode: boolean;
  private readonly osc9: boolean;
  private modeInternal: OutputMode;
  private readonly events: OutputEvent[] = [];

  constructor(options: OutputOptions) {
    this.out = options.stream ?? process.stdout;
    this.err = options.errorStream ?? process.stderr;
    this.theme = options.theme;
    this.level = options.colorLevel;
    this.unicode = options.unicode;
    this.osc9 = options.osc9 ?? false;
    this.modeInternal = options.mode ?? 'styled';
  }

  /** Replace the underlying streams (used by test harnesses). */
  redirect(stream: { write(data: string): unknown }, errorStream: { write(data: string): unknown }): void {
    this.out = stream;
    this.err = errorStream;
  }

  get mode(): OutputMode {
    return this.modeInternal;
  }

  get isMachineReadable(): boolean {
    return this.modeInternal === 'json';
  }

  /** Switch rendering mode mid-run (e.g. after parsing global flags). */
  setMode(mode: OutputMode): void {
    this.modeInternal = mode;
    if (mode !== 'styled') {
      // Plain/json ignore color levels entirely.
      this.levelForcedZero = true;
    } else {
      this.levelForcedZero = false;
    }
  }

  private levelForcedZero = false;

  private effectiveLevel(): ColorLevel {
    return this.levelForcedZero ? 0 : this.level;
  }

  get themeName(): string {
    return this.theme.name;
  }

  get colorLevel(): ColorLevel {
    return this.effectiveLevel();
  }

  /** Record + (in json mode) write a structured data payload. */
  emit(kind: OutputEvent['kind'], message: string, data?: unknown): void {
    const event: OutputEvent = kind === 'data' && data !== undefined ? { kind, message, data } : { kind, message };
    this.events.push(event);
    if (this.isMachineReadable) {
      this.out.write(JSON.stringify(event) + '\n');
    }
  }

  /** All events recorded this run (for envelopes/tests). */
  takeEvents(): OutputEvent[] {
    return this.events.splice(0);
  }

  /**
   * The full-run JSON envelope: `{ ok, results }` or
   * `{ ok: false, error: {...} }`. Extra contextual fields (command, help,
   * version, commands, duration) are merged at the top level.
   */
  jsonEnvelope(
    options: {
      ok: boolean;
      exitCode: number;
      error?: { message: string; hint?: string; usage?: string };
    } & Record<string, unknown>,
  ): string {
    const { ok, exitCode, error, ...extra } = options;
    if (ok) {
      return JSON.stringify({
        ok: true,
        exitCode,
        ...extra,
        ...(this.events.length > 0 ? { results: this.events } : {}),
      });
    }
    return JSON.stringify({
      ok: false,
      exitCode,
      ...extra,
      error: error ?? { message: 'Unknown error' },
    });
  }

  raw(message: string): void {
    this.out.write(message + '\n');
  }

  /** Write bytes with no extra newline. Used when piping a child command. */
  write(data: string): void {
    this.out.write(data);
  }

  info(message: string): void {
    if (this.isMachineReadable) {
      this.writeJsonLine('info', message);
      return;
    }
    this.out.write(this.paint('info', message) + '\n');
  }

  success(message: string): void {
    if (this.isMachineReadable) {
      this.writeJsonLine('success', message);
      return;
    }
    this.out.write(this.mark('success') + ' ' + this.paint('success', message) + '\n');
  }

  error(message: string): void {
    if (this.isMachineReadable) {
      this.err.write(JSON.stringify({ kind: 'error', message }) + '\n');
      this.events.push({ kind: 'error', message });
      return;
    }
    this.err.write(this.mark('error') + ' ' + this.paint('error', message) + '\n');
  }

  warn(message: string): void {
    if (this.isMachineReadable) {
      this.err.write(JSON.stringify({ kind: 'warn', message }) + '\n');
      this.events.push({ kind: 'warn', message });
      return;
    }
    this.err.write(this.mark('warn') + ' ' + this.paint('warn', message) + '\n');
  }

  muted(message: string): void {
    if (this.isMachineReadable) return; // human-only decoration
    this.out.write(dim(this.paint('muted', message), this.effectiveLevel()) + '\n');
  }

  /** A muted hint line on the error stream (used alongside error output). */
  hint(message: string): void {
    if (this.isMachineReadable) return;
    this.err.write(dim(this.paint('muted', `Hint: ${message}`), this.effectiveLevel()) + '\n');
  }

  section(title: string): void {
    if (this.isMachineReadable) return;
    this.out.write('\n' + underline(bold(this.paint('accent', title), this.effectiveLevel()), this.effectiveLevel()) + '\n');
  }

  bullet(message: string): void {
    if (this.isMachineReadable) return;
    this.out.write(`  ${this.paint('muted', this.unicode ? '•' : '*')} ${message}\n`);
  }

  keyValue(label: string, value: string): void {
    if (this.isMachineReadable) {
      this.emit('data', label, value);
      return;
    }
    const labelPart = bold(this.paint('muted', label), this.effectiveLevel());
    this.out.write(`  ${labelPart.padEnd(24)} ${value}\n`);
  }

  line(): void {
    if (this.isMachineReadable) return;
    const ch = this.unicode ? '─' : '-';
    this.out.write(this.paint('border', ch.repeat(60)) + '\n');
  }

  table(columns: TableColumn[], rows: string[][]): void {
    if (this.isMachineReadable) {
      // Render rows as data events keyed by header.
      const headers = columns.map((c) => c.header);
      for (const row of rows) {
        const record: Record<string, string> = {};
        headers.forEach((header, i) => {
          record[header] = row[i] ?? '';
        });
        this.emit('data', 'table-row', record);
      }
      return;
    }
    this.out.write(renderTable(columns, rows, { level: this.effectiveLevel(), unicode: this.unicode }) + '\n');
  }

  panel(title: string | undefined, body: string[], width?: number): void {
    if (this.isMachineReadable) return;
    this.out.write(renderPanel(title, body, { level: this.effectiveLevel(), unicode: this.unicode, width }) + '\n');
  }

  markdown(text: string): void {
    if (this.isMachineReadable) {
      this.emit('data', 'markdown', text);
      return;
    }
    this.out.write(renderMarkdown(text, { level: this.effectiveLevel(), theme: this.theme, unicode: this.unicode }) + '\n');
  }

  /** Record an event and stream it as a JSON line (json mode only). */
  private writeJsonLine(kind: OutputEvent['kind'], message: string, data?: unknown): void {
    const event: OutputEvent = data !== undefined ? { kind, message, data } : { kind, message };
    this.events.push(event);
    this.out.write(JSON.stringify(event) + '\n');
  }

  /**
   * Desktop notification via OSC 9 (Ghostty/WezTerm). When unsupported,
   * degrades to a styled status line on stderr. In json mode, becomes a
   * data event.
   */
  notification(title: string, message: string): void {
    if (this.isMachineReadable) {
      this.emit('data', 'notification', { title, message });
      return;
    }
    if (this.osc9) {
      this.err.write(`\x1b]9;${title}\x1f${message}\x07`);
      this.err.write(`\x1b]777;notify;${title};${message}\x07`);
      return;
    }
    this.err.write(
      this.paint('highlight', '●') + ' ' + bold(title, this.effectiveLevel()) + ' ' + dim(message, this.effectiveLevel()) + '\n',
    );
  }

  private mark(kind: 'success' | 'error' | 'warn'): string {
    const glyph = kind === 'success' ? (this.unicode ? '✓' : 'v') : kind === 'error' ? (this.unicode ? '✗' : 'x') : this.unicode ? '⚠' : '!';
    return this.paint(kind, glyph);
  }

  private paint(key: 'accent' | 'success' | 'error' | 'warn' | 'info' | 'muted' | 'border' | 'highlight' | 'text', text: string): string {
    return paint(this.theme.colors[key], text, this.effectiveLevel());
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