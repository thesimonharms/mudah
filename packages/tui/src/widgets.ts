import { BaseComponent, type Component } from './component.js';
import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { renderPanel, renderTable } from '@mudah-cli/ui';

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

  /** How many data rows fit in `viewportHeight`. */
  private get budget(): number {
    if (this.viewportHeight === undefined || this.viewportHeight <= 0) return this.rows.length;
    return Math.max(1, this.viewportHeight - Table.CHROME_ROWS);
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

  render(): string[] {
    const rendered = renderPanel(this.title, this.body, {
      level: 0,
      unicode: true,
      ...(this.width === undefined ? {} : { width: this.width }),
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

  constructor(
    private child: Component,
    private viewportHeight: number,
  ) {
    super();
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
    this.viewportHeight = Math.max(0, rows);
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
}

/** Single-line text input with a visible caret. Focusable. */
export class TextInput extends BaseComponent {
  value = '';
  /** Max visible width before horizontal scrolling. */
  width = 30;

  constructor(private onSubmit?: (value: string) => void) {
    super();
  }

  submit(): void {
    this.onSubmit?.(this.value);
  }

  render(): string[] {
    const start = Math.max(0, this.value.length - this.width + 1);
    const visible = this.value.slice(start);
    return [`> ${visible}▏`];
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    if (event.name === 'enter') {
      this.submit();
      return true;
    }
    if (event.name === 'backspace') {
      this.value = this.value.slice(0, -1);
      return true;
    }
    if (event.ch !== undefined && event.ch >= ' ') {
      this.value += event.ch;
      return true;
    }
    return false;
  }
}

/** Layout container that owns Tab/Shift+Tab focus cycling and key routing. */
export class Container {
  private children: Component[] = [];
  private focusIndex = -1;

  add(...components: Component[]): this {
    this.children.push(...components);
    if (this.focusIndex === -1) this.focusFirst();
    return this;
  }

  get components(): readonly Component[] {
    return this.children;
  }

  get focused(): Component | undefined {
    return this.children[this.focusIndex];
  }

  private focusFirst(): void {
    const index = this.children.findIndex((c) => c.focusable);
    this.setFocus(index);
  }

  private setFocus(index: number): void {
    const previous = this.children[this.focusIndex];
    previous?.onBlur?.();
    this.focusIndex = index;
    if (index >= 0) {
      const next = this.children[index];
      next?.onFocus?.();
    }
  }

  cycle(direction: 1 | -1): void {
    const count = this.children.length;
    if (count === 0) return;
    for (let step = 1; step <= count; step++) {
      const candidate = (this.focusIndex + direction * step + count * 2) % count;
      if (this.children[candidate]?.focusable) {
        this.setFocus(candidate);
        return;
      }
    }
  }

  /** Route a key: focused widget first, then the container's own handling. */
  handleKey(event: KeyEvent): void {
    if (event.name === 'tab' || event.name === 'shift-tab') {
      this.cycle(event.name === 'tab' ? 1 : -1);
      return;
    }
    if (this.focused?.onKey?.(event)) return;
  }

  /**
   * Route a mouse event to the child that occupies the clicked row.
   * Coordinates are translated into the child's own space; returns true when
   * any child consumed it.
   */
  handleMouse(event: MouseEvent): boolean {
    let row = 0;
    for (const child of this.children) {
      const height = child.height ?? child.render().length;
      if (event.y >= row && event.y < row + height) {
        return child.onMouse?.({ ...event, y: event.y - row }) ?? false;
      }
      row += height;
    }
    return false;
  }

  render(): string[] {
    const rows: string[] = [];
    for (const child of this.children) {
      rows.push(...child.render());
    }
    return rows;
  }
}
