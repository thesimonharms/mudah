import { BaseComponent } from './component.js';
import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { renderTable } from '@mudah-cli/ui';

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
  /** Column currently being edited. */
  selectedColumn = 0;
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

  setColumns(columns: TableColumnDef[]): void {
    this.columns = columns;
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

  inspect(): { role: string; name?: string; value?: unknown } {
    return {
      role: 'table',
      name: this.selected?.[this.selectedColumn] ?? this.selected?.[0],
      value: { row: this.selectedIndex, column: this.selectedColumn },
    };
  }

  private clampColumn(): void {
    this.selectedColumn = Math.min(
      Math.max(this.selectedColumn, 0),
      Math.max(0, this.columns.length - 1),
    );
  }

  insertRow(row?: string[]): number {
    const next = row ?? this.columns.map(() => '');
    this.rows.splice(this.selectedIndex + 1, 0, next);
    this.selectedIndex += 1;
    return this.selectedIndex;
  }

  deleteRow(): string[] | undefined {
    if (this.rows.length === 0) return undefined;
    const removed = this.rows.splice(this.selectedIndex, 1)[0];
    if (this.selectedIndex >= this.rows.length) this.selectedIndex = Math.max(0, this.rows.length - 1);
    return removed;
  }

  updateCell(column: number, value: string): void {
    const row = this.rows[this.selectedIndex];
    if (!row) return;
    while (row.length <= column) row.push('');
    row[column] = value;
  }

  getRows(): string[][] {
    return this.rows.map((row) => [...row]);
  }

  render(): string[] {
    const start = this.scrollTop;
    const visible = this.rows.slice(start, start + this.budget);
    const rendered = renderTable(
      this.columns.map((column) => ({ header: column.header, align: column.align })),
      visible.map((row, i) => {
        const isRow = start + i === this.selectedIndex;
        return row.map((cell, c) => {
          const marked = isRow && c === this.selectedColumn ? `[${cell}]` : cell;
          if (c === 0) return `${isRow ? '▸' : ' '} ${marked}`;
          return marked;
        });
      }),
      { level: 0, unicode: true },
    );
    return rendered.split('\n');
  }

  readonly focusable = true;
  readonly keys = {
    up: 'up',
    down: 'down',
    left: 'cell',
    right: 'cell',
    tab: 'cell',
    enter: 'select',
    insert: 'insert',
    delete: 'delete',
    backspace: 'edit',
  };

  override onKey(event: KeyEvent): boolean {
    if (event.name === 'up') {
      this.move(-1);
      return true;
    }
    if (event.name === 'down') {
      this.move(1);
      return true;
    }
    if (event.name === 'left') {
      this.selectedColumn -= 1;
      this.clampColumn();
      return true;
    }
    if (event.name === 'right') {
      this.selectedColumn += 1;
      this.clampColumn();
      return true;
    }
    if (event.name === 'tab') {
      if (this.columns.length === 0) return true;
      this.selectedColumn = (this.selectedColumn + 1) % this.columns.length;
      return true;
    }
    if (event.name === 'shift-tab') {
      if (this.columns.length === 0) return true;
      this.selectedColumn = (this.selectedColumn - 1 + this.columns.length) % this.columns.length;
      return true;
    }
    if (event.name === 'enter') {
      this.confirm();
      return true;
    }
    if (event.name === 'insert' || event.name === 'ctrl+n' || (event.name === 'n' && (event.ctrl === true || event.ch === undefined))) {
      this.insertRow();
      return true;
    }
    if (
      event.name === 'delete' ||
      event.name === 'ctrl+d' ||
      (event.name === 'd' && (event.ctrl === true || event.ch === undefined))
    ) {
      this.deleteRow();
      return true;
    }
    if (event.name === 'backspace') {
      const row = this.rows[this.selectedIndex];
      if (!row) return true;
      this.clampColumn();
      const current = row[this.selectedColumn] ?? '';
      this.updateCell(this.selectedColumn, current.slice(0, -1));
      return true;
    }
    if (event.ch !== undefined && event.ch >= ' ' && event.name.length === 1 && event.ctrl !== true) {
      const row = this.rows[this.selectedIndex];
      if (!row) return false;
      this.clampColumn();
      this.updateCell(this.selectedColumn, `${row[this.selectedColumn] ?? ''}${event.ch}`);
      return true;
    }
    return false;
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
