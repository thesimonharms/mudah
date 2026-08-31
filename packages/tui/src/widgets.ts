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

