import { BaseComponent, type Component } from './component.js';
import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { renderPanel, renderTable, visibleLength } from '@mudah-cli/ui';

/** Column definition for the {@link Table} widget. */
export interface TableColumnDef {
  header: string;
  align?: 'left' | 'right';
  /** Fixed width; defaults to the widest cell. */
  width?: number;
}

/** A scrollable grid. Focusable: arrows and the wheel move rows. */
export class Table extends BaseComponent {
  private rows: string[][];
  selectedIndex = 0;
  /** Rows visible at once; defaults to every row plus the header. */
  viewportHeight?: number;

  constructor(
    private columns: TableColumnDef[],
    rows: string[][],
    private onSelect?: (index: number, row: string[]) => void,
  ) {
    super();
    this.rows = rows;
  }

  setRows(rows: string[][]): void {
    this.rows = rows;
    if (this.selectedIndex >= rows.length) this.selectedIndex = Math.max(0, rows.length - 1);
  }

  get rowCount(): number {
    return this.rows.length;
  }

  get selected(): string[] | undefined {
    return this.rows[this.selectedIndex];
  }

  move(delta: number): void {
    const next = Math.min(Math.max(this.selectedIndex + delta, 0), this.rows.length - 1);
    this.selectedIndex = next;
  }

  confirm(): void {
    const row = this.selected;
    if (row !== undefined) this.onSelect?.(this.selectedIndex, row);
  }

  /**
   * Rows of chrome `renderTable` draws around the data: top border, header,
   * the rule under the header, and the bottom border.
   */
  private static readonly CHROME_ROWS = 4;
  /** Height assigned by a parent layout. Distinct from user `viewportHeight`. */
  private allocatedHeight?: number;

  /** How many data rows fit in the current height cap. */
  private get budget(): number {
    const cap = this.allocatedHeight ?? this.viewportHeight;
    if (cap === undefined || cap <= 0) return this.rows.length;
    return Math.max(1, cap - Table.CHROME_ROWS);
  }

  measure(width: number, _height: number): { width: number; height: number } {
    const content = Table.CHROME_ROWS + Math.max(this.rows.length, 1);
    return { width: Math.min(width, 1), height: this.viewportHeight ?? content };
  }

  resize(_width: number, height: number): void {
    this.allocatedHeight = height;
  }

  /** First row drawn, keeping the selection in view. */
  private get scrollTop(): number {
    const budget = this.budget;
    if (this.rows.length <= budget) return 0;
    return Math.min(
      Math.max(0, this.selectedIndex - Math.floor(budget / 2)),
      this.rows.length - budget,
    );
  }

  render(): string[] {
    const start = this.scrollTop;
    const visible = this.rows.slice(start, start + this.budget);
    const rendered = renderTable(
      this.columns.map((column) => ({ header: column.header, align: column.align })),
      visible.map((row, i) => {
        const marker = start + i === this.selectedIndex ? '▸' : ' ';
        const [first = '', ...rest] = row;
        return [`${marker} ${first}`, ...rest];
      }),
      { level: 0, unicode: true },
    );
    return rendered.split('\n');
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'up':
        this.move(-1);
        return true;
      case 'down':
        this.move(1);
        return true;
      case 'enter':
        this.confirm();
        return true;
      default:
        return false;
    }
  }

  override onMouse(event: MouseEvent): boolean {
    if (event.wheel === 'up') {
      this.move(-1);
      return true;
    }
    if (event.wheel === 'down') {
      this.move(1);
      return true;
    }
    if (event.buttons.left) {
      // Row 0 is the top border, 1 the header, 2 the rule under it.
      const rowIndex = this.scrollTop + event.y - 3;
      if (rowIndex >= 0 && rowIndex < this.rows.length) {
        this.selectedIndex = rowIndex;
        return true;
      }
    }
    return false;
  }
}

/** A titled bordered box. Not focusable. */
export class Panel extends BaseComponent {
  private allocated?: { width: number; height: number };

  constructor(
    private title: string | undefined,
    private body: string[],
    private width?: number,
  ) {
    super();
  }

  setBody(body: string[]): void {
    this.body = body;
  }

  measure(width: number, _height: number): { width: number; height: number } {
    const lines = this.draw(this.width);
    const w = visibleLength(lines[0] ?? '');
    return { width: Math.min(width, w), height: lines.length };
  }

  resize(width: number, height: number): void {
    this.allocated = { width, height };
  }

  render(): string[] {
    const inner =
      this.allocated !== undefined ? Math.max(0, this.allocated.width - 4) : this.width;
    const lines = this.draw(inner);
    const target = this.allocated?.height;
    if (target === undefined) return lines;
    if (lines.length > target) return lines.slice(0, target);
    while (lines.length < target) lines.push('');
    return lines;
  }

  private draw(innerWidth: number | undefined): string[] {
    const rendered = renderPanel(this.title, this.body, {
      level: 0,
      unicode: true,
      ...(innerWidth === undefined ? {} : { width: innerWidth }),
    });
    return rendered.split('\n');
  }

  readonly focusable = false;
}

/**
 * A scrollable window onto content taller than the terminal.
 *
 * The child renders in full; the viewport shows `height` rows of it. Keys
 * (arrows, page up/down, home/end) and the mouse wheel move the window.
 */
export class Viewport extends BaseComponent {
  /** First visible row of the child's output. */
  scrollTop = 0;
  /** Preferred height. `resize()` changes the displayed height only. */
  private preferredHeight: number;
  private viewportHeight: number;

  constructor(
    private child: Component,
    viewportHeight: number,
  ) {
    super();
    this.preferredHeight = viewportHeight;
    this.viewportHeight = viewportHeight;
  }

  measure(width: number, _height: number): { width: number; height: number } {
    return { width: Math.min(width, 1), height: Math.max(1, this.preferredHeight) };
  }

  resize(_width: number, height: number): void {
    this.viewportHeight = Math.max(0, height);
  }

  /** Rows of content available below the current scroll position. */
  private get content(): string[] {
    return this.child.render();
  }

  get maxScroll(): number {
    return Math.max(0, this.content.length - this.viewportHeight);
  }

  /** Change the number of visible rows (e.g. after a terminal resize). */
  setHeight(rows: number): void {
    this.preferredHeight = Math.max(0, rows);
    this.viewportHeight = this.preferredHeight;
    this.scrollTo(this.scrollTop);
  }

  scrollTo(row: number): void {
    this.scrollTop = Math.min(Math.max(row, 0), this.maxScroll);
  }

  scrollBy(delta: number): void {
    this.scrollTo(this.scrollTop + delta);
  }

  render(): string[] {
    const start = Math.min(this.scrollTop, this.maxScroll);
    const slice = this.content.slice(start, start + this.viewportHeight);
    // Pad so the viewport always occupies its declared height.
    while (slice.length < this.viewportHeight) slice.push('');
    return slice;
  }

  override get height(): number {
    return this.viewportHeight;
  }

  get focusable(): boolean {
    return this.child.focusable;
  }

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'up':
        this.scrollBy(-1);
        return true;
      case 'down':
        this.scrollBy(1);
        return true;
      case 'page-up':
        this.scrollBy(-this.viewportHeight);
        return true;
      case 'page-down':
        this.scrollBy(this.viewportHeight);
        return true;
      case 'home':
        this.scrollTo(0);
        return true;
      case 'end':
        this.scrollTo(this.maxScroll);
        return true;
      default:
        return this.child.onKey?.(event) ?? false;
    }
  }

  override onMouse(event: MouseEvent): boolean {
    if (event.wheel === 'up') {
      this.scrollBy(-1);
      return true;
    }
    if (event.wheel === 'down') {
      this.scrollBy(1);
      return true;
    }
    // Offset child coordinates by the scroll position.
    return (
      this.child.onMouse?.({
        ...event,
        y: event.y + this.scrollTop,
      }) ?? false
    );
  }
}

/** Static text block. Not focusable. */
export class Label extends BaseComponent {
  constructor(private text: string) {
    super();
  }

  setText(text: string): void {
    this.text = text;
  }

  render(): string[] {
    return this.text.split('\n');
  }

  measure(width: number, _height: number): { width: number; height: number } {
    const lines = this.text.split('\n');
    const content = Math.max(0, ...lines.map((line) => visibleLength(line)));
    return { width: Math.min(width, content), height: lines.length };
  }

  readonly focusable = false;
}

/** A vertical list with a selected row. Focusable. */
export class List extends BaseComponent {
  selectedIndex = 0;

  constructor(
    private items: string[],
    private onSelect?: (index: number) => void,
  ) {
    super();
  }

  setItems(items: string[]): void {
    this.items = items;
    if (this.selectedIndex >= items.length) this.selectedIndex = Math.max(0, items.length - 1);
  }

  get selected(): string | undefined {
    return this.items[this.selectedIndex];
  }

  move(delta: number): void {
    const next = Math.min(Math.max(this.selectedIndex + delta, 0), this.items.length - 1);
    this.selectedIndex = next;
  }

  confirm(): void {
    this.onSelect?.(this.selectedIndex);
  }

  render(): string[] {
    return this.items.map((item, i) => (i === this.selectedIndex ? `▸ ${item}` : `  ${item}`));
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'list', name: this.selected, value: this.selectedIndex };
  }

  readonly keys = { up: 'up', down: 'down', enter: 'select' };

  measure(width: number, _height: number): { width: number; height: number } {
    const content = Math.max(0, ...this.items.map((item) => visibleLength(`▸ ${item}`)));
    return { width: Math.min(width, Math.max(content, 1)), height: this.items.length };
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'up':
        this.move(-1);
        return true;
      case 'down':
        this.move(1);
        return true;
      case 'enter':
        this.confirm();
        return true;
      default:
        return false;
    }
  }

  override onMouse(event: MouseEvent): boolean {
    if (event.wheel === 'up') {
      this.move(-1);
      return true;
    }
    if (event.wheel === 'down') {
      this.move(1);
      return true;
    }
    if (event.buttons.left && event.y >= 0 && event.y < this.items.length) {
      this.selectedIndex = event.y;
      return true;
    }
    return false;
  }
}

/** Checkbox list. Focusable. Space toggles; enter submits the checked set. */
export class MultiList extends BaseComponent {
  readonly checked = new Set<number>();
  selectedIndex = 0;
  private submittedAt: number | null = null;

  constructor(
    private items: string[],
    private onSubmit?: (indices: number[]) => void,
  ) {
    super();
  }

  setItems(items: string[]): void {
    this.items = items;
    for (const index of [...this.checked]) {
      if (index >= items.length) this.checked.delete(index);
    }
    if (this.selectedIndex >= items.length) this.selectedIndex = Math.max(0, items.length - 1);
  }

  toggle(index = this.selectedIndex): void {
    if (this.checked.has(index)) {
      this.checked.delete(index);
    } else {
      this.checked.add(index);
    }
  }

  move(delta: number): void {
    const next = Math.min(Math.max(this.selectedIndex + delta, 0), this.items.length - 1);
    this.selectedIndex = next;
  }

  submit(): void {
    this.onSubmit?.([...this.checked].sort((a, b) => a - b));
  }

  render(): string[] {
    return this.items.map((item, i) => {
      const box = this.checked.has(i) ? '[x]' : '[ ]';
      const cursor = i === this.selectedIndex ? '▸' : ' ';
      return `${cursor} ${box} ${item}`;
    });
  }

  measure(width: number, _height: number): { width: number; height: number } {
    const content = Math.max(0, ...this.items.map((item) => visibleLength(`▸ [x] ${item}`)));
    return { width: Math.min(width, Math.max(content, 1)), height: this.items.length };
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'up':
        this.move(-1);
        return true;
      case 'down':
        this.move(1);
        return true;
      case 'space':
        this.toggle();
        return true;
      case 'enter':
        this.submit();
        return true;
      default:
        return false;
    }
  }

  override onMouse(event: MouseEvent): boolean {
    if (event.wheel === 'up') {
      this.move(-1);
      return true;
    }
    if (event.wheel === 'down') {
      this.move(1);
      return true;
    }
    if (event.buttons.left && event.y >= 0 && event.y < this.items.length) {
      this.selectedIndex = event.y;
      return true;
    }
    return false;
  }
}

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
    return visible;
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

/**
 * TUI wrapper around a horizontal bar chart. Plain-string rows — the renderer
 * applies theme colors. Drop-in for live metrics inside a Column/Row.
 */
export class BarChart extends BaseComponent {
  private values: number[];
  readonly focusable = false;

  constructor(values: number[]) {
    super();
    this.values = values;
  }

  setValues(values: number[]): void {
    this.values = values;
  }

  render(): string[] {
    if (this.values.length === 0) return ['no data'];
    const max = Math.max(...this.values, 1);
    const width = 16;
    return this.values.map((v) => {
      const len = Math.min(width, Math.round((v / max) * width));
      const bar = '█'.repeat(len) + ' '.repeat(width - len);
      return `${bar} ${v}`;
    });
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    return { width: 20, height: Math.max(1, this.values.length) };
  }

  inspect(): { role: string; value: unknown } {
    return { role: 'bar-chart', value: this.values };
  }
}

/**
 * An inline spinner that advances one frame per render. Pairs with a Program
 * that calls `tick(deltaMs)` on every paint. The frames are inlined so this
 * package stays independent of `@mudah-cli/animation`.
 */
const DEFAULT_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DEFAULT_SPINNER_INTERVAL = 80;

export class Spinner extends BaseComponent {
  private elapsed = 0;
  private frame = 0;
  readonly focusable = false;
  private label = '';

  constructor(
    private readonly frames: readonly string[] = DEFAULT_SPINNER_FRAMES,
    private readonly interval = DEFAULT_SPINNER_INTERVAL,
  ) {
    super();
  }

  setLabel(label: string): void {
    this.label = label;
  }

  /** Advance the animation; call from the render loop. */
  tick(deltaMs: number): void {
    this.elapsed += deltaMs;
    while (this.elapsed >= this.interval) {
      this.frame = (this.frame + 1) % this.frames.length;
      this.elapsed -= this.interval;
    }
  }

  render(): string[] {
    const glyph = this.frames[this.frame] ?? '·';
    return this.label ? [`${glyph} ${this.label}`] : [glyph];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    return { width: this.label.length + 2, height: 1 };
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'spinner', name: this.label, value: this.frame };
  }
}

/**
 * Anchored hint text. Not focusable: rendered as a 1-line box, or as plain
 * text when no title is set. Useful for "what is this?" hover-style hints in
 * a TUI.
 */
export class Tooltip extends BaseComponent {
  readonly focusable = false;

  constructor(private title: string, private text: string) {
    super();
  }

  setText(text: string): void {
    this.text = text;
  }

  render(): string[] {
    if (this.text.length === 0) return [this.title];
    return [this.title ? `${this.title} — ${this.text}` : this.text];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    return { width: Math.max(this.title.length, this.text.length), height: 1 };
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'tooltip', name: this.title, value: this.text };
  }
}

/**
 * A set of tab panels. Left/right (and home/end) move focus; enter confirms.
 * The active tab's content is rendered beneath a one-line header of all tabs.
 */
export class Tabs extends BaseComponent {
  selectedIndex = 0;

  constructor(
    private tabs: { label: string; content: string[] }[],
    private onSelect?: (index: number) => void,
  ) {
    super();
  }

  setTabs(tabs: { label: string; content: string[] }[]): void {
    this.tabs = tabs;
    if (this.selectedIndex >= tabs.length) this.selectedIndex = Math.max(0, tabs.length - 1);
  }

  get selected(): number {
    return this.selectedIndex;
  }

  move(delta: number): void {
    this.selectedIndex = Math.min(Math.max(this.selectedIndex + delta, 0), Math.max(0, this.tabs.length - 1));
  }

  confirm(): void {
    this.onSelect?.(this.selectedIndex);
  }

  render(): string[] {
    const header = this.tabs
      .map((tab, i) => (i === this.selectedIndex ? `[${tab.label}]` : `[ ${tab.label} ]`))
      .join('');
    const content = this.tabs[this.selectedIndex]?.content ?? [];
    return [header, ...content];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const active = this.tabs[this.selectedIndex];
    const content = active?.content ?? [];
    const contentWidth =
      content.length > 0 ? Math.max(0, ...content.map((line) => visibleLength(line))) : 0;
    const headerWidth = this.tabs.length > 0 ? visibleLength(this.render()[0] ?? '') : 0;
    return { width: Math.max(headerWidth, contentWidth), height: 1 + content.length };
  }

  readonly focusable = true;
  readonly keys = { left: 'prev', right: 'next', enter: 'select', home: 'first', end: 'last' };

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'left':
        this.move(-1);
        return true;
      case 'right':
        this.move(1);
        return true;
      case 'home':
        this.selectedIndex = 0;
        return true;
      case 'end':
        this.selectedIndex = Math.max(0, this.tabs.length - 1);
        return true;
      case 'enter':
        this.confirm();
        return true;
      default:
        return false;
    }
  }
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export interface CalendarOptions {
  date?: Date;
  onSelect?: (date: Date) => void;
}

/** A navigable month calendar. Focusable: arrows move the cursor day, enter selects. */
export class Calendar extends BaseComponent {
  cursor: Date;
  selected: Date;
  private readonly onSelect?: (date: Date) => void;

  readonly focusable = true;
  readonly keys = {
    left: 'prev-day',
    right: 'next-day',
    up: 'prev-week',
    down: 'next-week',
    home: 'first-of-month',
    end: 'last-of-month',
    enter: 'select',
    'page-up': 'prev-month',
    'page-down': 'next-month',
  };

  constructor(options: CalendarOptions = {}) {
    super();
    const now = options.date ?? new Date();
    this.cursor = new Date(now);
    this.selected = new Date(now);
    this.onSelect = options.onSelect;
  }

  private daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  }

  private moveDays(days: number): void {
    const d = new Date(this.cursor);
    d.setUTCDate(d.getUTCDate() + days);
    this.cursor = d;
  }

  private moveMonths(months: number): void {
    const d = new Date(this.cursor);
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + months);
    if (d.getUTCDate() < day) d.setUTCDate(0);
    this.cursor = d;
  }

  confirm(): void {
    this.selected = new Date(this.cursor);
    this.onSelect?.(new Date(this.cursor));
  }

  render(): string[] {
    const year = this.cursor.getUTCFullYear();
    const month = this.cursor.getUTCMonth();
    const day = this.cursor.getUTCDate();
    const start = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const days = this.daysInMonth(year, month);

    const out: string[] = [`${MONTHS[month] ?? '???'} ${year}`, DAYS.map((d) => d.padEnd(3)).join('')];
    const cells: string[] = [];
    for (let i = 0; i < start; i++) cells.push('   ');
    for (let d = 1; d <= days; d++) {
      const num = d.toString().padStart(2);
      cells.push(d === day ? `▸${num}` : ` ${num}`);
    }
    while (cells.length > 0) {
      out.push(cells.splice(0, 7).join(''));
    }
    return out;
  }

  measure(width: number, _height: number): { width: number; height: number } {
    const lines = this.render();
    const content = Math.max(0, ...lines.map((line) => visibleLength(line)));
    return { width: Math.min(width, Math.max(content, 1)), height: lines.length };
  }

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'left':
        this.moveDays(-1);
        return true;
      case 'right':
        this.moveDays(1);
        return true;
      case 'up':
        this.moveDays(-7);
        return true;
      case 'down':
        this.moveDays(7);
        return true;
      case 'page-up':
        this.moveMonths(-1);
        return true;
      case 'page-down':
        this.moveMonths(1);
        return true;
      case 'home': {
        const d = new Date(this.cursor);
        d.setUTCDate(1);
        this.cursor = d;
        return true;
      }
      case 'end': {
        const d = new Date(this.cursor);
        d.setUTCDate(this.daysInMonth(d.getUTCFullYear(), d.getUTCMonth()));
        this.cursor = d;
        return true;
      }
      case 'enter':
        this.confirm();
        return true;
      default:
        return false;
    }
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return {
      role: 'calendar',
      name: `${this.cursor.getUTCFullYear()}-${this.cursor.getUTCMonth() + 1}`,
      value: this.cursor.toISOString(),
    };
  }
}

export interface CheckboxOptions {
  label?: string;
  checked?: boolean;
  onSelect?: (checked: boolean) => void;
}

/** A single on/off toggle. Space or enter toggles it. */
export class Checkbox extends BaseComponent {
  readonly focusable = true;
  readonly keys = { space: 'toggle', enter: 'toggle' };

  constructor(private readonly options: CheckboxOptions = {}) {
    super();
  }

  get checked(): boolean {
    return this.options.checked ?? false;
  }

  set checked(value: boolean) {
    this.options.checked = value;
  }

  toggle(): void {
    const next = !this.checked;
    this.options.checked = next;
    this.options.onSelect?.(next);
  }

  confirm(): void {
    this.toggle();
  }

  render(): string[] {
    const box = this.options.checked ? '[x]' : '[ ]';
    const label = this.options.label ?? '';
    return [`${box} ${label}`];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const line = this.render()[0] ?? '';
    return { width: visibleLength(line), height: 1 };
  }

  override onKey(event: KeyEvent): boolean {
    if (event.name === 'space' || event.name === 'enter') {
      this.toggle();
      return true;
    }
    return false;
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'checkbox', name: this.options.label, value: this.options.checked };
  }
}

export interface RadioItem {
  label: string;
  value: string | number;
}

/** A vertical single-select list. Arrows move, enter selects. */
export class Radio extends BaseComponent {
  selectedIndex = 0;

  readonly focusable = true;
  readonly keys = { up: 'prev', down: 'next', enter: 'select', space: 'select' };

  constructor(
    private readonly items: RadioItem[],
    private readonly onSelect?: (value: string | number) => void,
  ) {
    super();
  }

  get selected(): RadioItem | undefined {
    return this.items[this.selectedIndex];
  }

  move(delta: number): void {
    this.selectedIndex = Math.min(
      Math.max(this.selectedIndex + delta, 0),
      Math.max(0, this.items.length - 1),
    );
  }

  confirm(): void {
    const item = this.selected;
    if (item) this.onSelect?.(item.value);
  }

  render(): string[] {
    return this.items.map((item, i) => `${i === this.selectedIndex ? '●' : '○'} ${item.label}`);
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const lines = this.render();
    const content = Math.max(0, ...lines.map((line) => visibleLength(line)));
    return { width: content, height: lines.length };
  }

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'up':
        this.move(-1);
        return true;
      case 'down':
        this.move(1);
        return true;
      case 'space':
      case 'enter':
        this.confirm();
        return true;
      default:
        return false;
    }
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'radio', name: this.selected?.label, value: this.selected?.value };
  }
}

export interface ProgressBarOptions {
  label?: string;
  /** Bar width in cells. Default 20. */
  width?: number;
  /** Use unicode blocks. Default true. */
  unicode?: boolean;
  /** Show the percentage. Default true. */
  showPercent?: boolean;
}

/** A display-only progress bar. Update via `setProgress(0..1)`. Not focusable. */
export class ProgressBar extends BaseComponent {
  readonly focusable = false;
  private fraction: number;

  constructor(fraction = 0, private readonly options: ProgressBarOptions = {}) {
    super();
    this.fraction = Math.min(1, Math.max(0, fraction));
  }

  get progress(): number {
    return this.fraction;
  }

  setProgress(fraction: number): void {
    this.fraction = Math.min(1, Math.max(0, fraction));
  }

  render(): string[] {
    const width = this.options.width ?? 20;
    const full = (this.options.unicode ?? true) ? '█' : '#';
    const fill = Math.min(width, Math.max(0, Math.round(this.fraction * width)));
    const bar = full.repeat(fill) + ' '.repeat(Math.max(0, width - fill));
    const label = this.options.label ? `${this.options.label} ` : '';
    const percent = this.options.showPercent === false ? '' : ` ${Math.round(this.fraction * 100)}%`;
    return [`${label}[${bar}]${percent}`];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const line = this.render()[0] ?? '';
    return { width: visibleLength(line), height: 1 };
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'progress', value: this.fraction };
  }
}

export interface BreadcrumbItem {
  label: string;
  value?: unknown;
}

export interface BreadcrumbOptions {
  onSelect?: (item: BreadcrumbItem, index: number) => void;
}

/** A focusable breadcrumb path. Arrows move between crumbs, enter selects. */
export class Breadcrumb extends BaseComponent {
  selectedIndex = 0;

  readonly focusable = true;
  readonly keys = { left: 'prev', right: 'next', home: 'first', end: 'last', enter: 'select' };

  constructor(
    private readonly crumbs: BreadcrumbItem[],
    private readonly options: BreadcrumbOptions = {},
  ) {
    super();
  }

  private clamp(i: number): number {
    return Math.min(Math.max(i, 0), Math.max(0, this.crumbs.length - 1));
  }

  move(delta: number): void {
    this.selectedIndex = this.clamp(this.selectedIndex + delta);
  }

  confirm(): void {
    const item = this.crumbs[this.selectedIndex];
    if (item) this.options.onSelect?.(item, this.selectedIndex);
  }

  render(): string[] {
    return [this.crumbs.map((c) => c.label).join(' / ')];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const line = this.render()[0] ?? '';
    return { width: visibleLength(line), height: 1 };
  }

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'left':
        this.move(-1);
        return true;
      case 'right':
        this.move(1);
        return true;
      case 'home':
        this.selectedIndex = 0;
        return true;
      case 'end':
        this.selectedIndex = this.clamp(this.crumbs.length - 1);
        return true;
      case 'enter':
        this.confirm();
        return true;
      default:
        return false;
    }
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return {
      role: 'breadcrumb',
      name: this.crumbs[this.selectedIndex]?.label,
      value: this.crumbs[this.selectedIndex],
    };
  }
}

