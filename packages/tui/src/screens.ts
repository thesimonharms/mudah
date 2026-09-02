import type { KeyEvent } from '@mudah-cli/terminal';
import type { Schema } from '@mudah-cli/config';
import { Column, Split, type Layout } from './layout.js';
import { BaseComponent } from './component.js';
import type { Program } from './program.js';
import { HelpFooter } from './chrome.js';
import { keys } from './keymap.js';
import { Label, List, Panel, Table, Viewport, type TableColumnDef } from './widgets.js';
import { Tree, type TreeNodeData } from './extras.js';
import { FuzzyList } from './fuzzy.js';
import { Form } from './form.js';

export interface PickerOptions {
  title?: string;
  items: string[];
}

export interface WizardStep {
  name: string;
  kind: 'pick' | 'multi' | 'text';
  items?: string[];
  label?: string;
}

export interface WizardOptions {
  title?: string;
  steps: WizardStep[];
}

/**
 * A named screen: a layout plus a typed result. Attach to a Program, then
 * read `result()` after `run()` resolves.
 */
export abstract class ScreenHandle<T> {
  abstract readonly root: Layout;
  protected done: (() => void) | undefined;
  protected value: T | undefined;

  result(): T | undefined {
    return this.value;
  }

  /**
   * Called after a successful pick. Use this to pop a Stack. Call before
   * {@link attach} or after; both wrap.
   */
  onComplete(fn: (value: T) => void): this {
    const prior = this.done;
    this.done = () => {
      fn(this.value as T);
      prior?.();
    };
    return this;
  }

  attach(program: Program): void {
    const prior = this.done;
    this.done = () => {
      prior?.();
      program.quit();
    };
    program.mount(this.root);
  }
}

export class PickerScreen extends ScreenHandle<string> {
  readonly root: Column;

  constructor(options: PickerOptions) {
    super();
    const list = new List(options.items, (index) => {
      this.value = options.items[index];
      this.done?.();
    });
    this.root = new Column().add(
      new Label(options.title ?? 'Select'),
      list,
      new HelpFooter(keys.list),
    );
  }
}

class WizardBody extends BaseComponent {
  readonly focusable = true;
  private step = 0;
  private cursor = 0;
  private readonly picked = new Map<number, unknown>();
  private draft = '';

  constructor(
    private title: string,
    private steps: WizardStep[],
    private onFinish: (values: Record<string, unknown>) => void,
  ) {
    super();
  }

  private current(): WizardStep {
    return this.steps[this.step] ?? { name: 'done', kind: 'pick', items: [] };
  }

  override render(): string[] {
    const step = this.current();
    const lines = [`${this.title} — ${step.name} (${this.step + 1}/${this.steps.length})`];
    if (step.kind === 'text') {
      lines.push(`${step.label ?? step.name}: ${this.draft}▏`);
    } else {
      const items = step.items ?? [];
      items.forEach((item, i) => {
        const pointer = i === this.cursor ? '▸ ' : '  ';
        if (step.kind === 'multi') {
          const raw = this.picked.get(this.step);
          const set = raw instanceof Set ? raw : new Set<number>();
          const box = set.has(i) ? '[x] ' : '[ ] ';
          lines.push(`${pointer}${box}${item}`);
        } else {
          lines.push(`${pointer}${item}`);
        }
      });
    }
    lines.push('', 'enter continue · esc quit');
    return lines;
  }

  override onKey(event: KeyEvent): boolean {
    const step = this.current();
    const items = step.items ?? [];
    if (event.name === 'up') {
      this.cursor = Math.max(0, this.cursor - 1);
      return true;
    }
    if (event.name === 'down') {
      this.cursor = Math.min(Math.max(items.length - 1, 0), this.cursor + 1);
      return true;
    }
    if (event.name === 'space' && step.kind === 'multi') {
      const raw = this.picked.get(this.step);
      const set = raw instanceof Set ? raw : new Set<number>();
      if (set.has(this.cursor)) set.delete(this.cursor);
      else set.add(this.cursor);
      this.picked.set(this.step, set);
      return true;
    }
    if (event.name === 'backspace' && step.kind === 'text') {
      this.draft = this.draft.slice(0, -1);
      return true;
    }
    if (event.ch !== undefined && event.ch >= ' ' && step.kind === 'text') {
      this.draft += event.ch;
      return true;
    }
    if (event.name === 'enter') {
      if (step.kind === 'pick') this.picked.set(this.step, items[this.cursor]);
      else if (step.kind === 'text') this.picked.set(this.step, this.draft);
      else if (step.kind === 'multi') {
        const raw = this.picked.get(this.step);
        const set = raw instanceof Set ? raw : new Set<number>();
        this.picked.set(
          this.step,
          [...set].sort((a, b) => a - b).map((i) => items[i]),
        );
      }
      if (this.step + 1 >= this.steps.length) {
        const values: Record<string, unknown> = {};
        this.steps.forEach((s, i) => {
          values[s.name] = this.picked.get(i);
        });
        this.onFinish(values);
      } else {
        this.step += 1;
        this.cursor = 0;
        this.draft = '';
      }
      return true;
    }
    return false;
  }
}

export class WizardScreen extends ScreenHandle<Record<string, unknown>> {
  readonly root: Column;

  constructor(options: WizardOptions) {
    super();
    if (options.steps.length === 0) {
      throw new Error('[tui] Screen.wizard needs at least one step.');
    }
    const body = new WizardBody(options.title ?? 'Wizard', options.steps, (values) => {
      this.value = values;
      this.done?.();
    });
    this.root = new Column().add(body);
  }
}

export interface FormOptions {
  title?: string;
  schema: Schema<unknown>;
}

/** A wizard-style form screen backed by a config schema. */
export class FormScreen extends ScreenHandle<Record<string, unknown>> {
  readonly root: Column;
  private readonly form: Form;

  constructor(options: FormOptions) {
    super();
    this.form = Form.fromSchema(options.schema, options.title ?? 'Form');
    this.root = this.form.root;
    this.form.onComplete((values) => {
      this.value = values;
      this.done?.();
    });
  }
}

export interface DashboardOptions {
  title?: string;
  sidebar?: string[];
  columns: TableColumnDef[];
  rows: string[][];
  ratio?: number;
}

export class DashboardScreen extends ScreenHandle<number> {
  readonly root: Column;
  readonly table: Table;

  constructor(options: DashboardOptions) {
    super();
    this.table = new Table(options.columns, options.rows, (index) => {
      this.value = index;
      this.done?.();
    });
    const sidebar = new Panel(options.title ?? 'Summary', options.sidebar ?? []);
    this.root = new Column().add(
      new Label(options.title ?? 'Dashboard'),
      new Split({ axis: 'horizontal', ratio: options.ratio ?? 0.35 }).add(
        sidebar,
        new Viewport(this.table, 12),
      ),
      new HelpFooter({ ...keys.table, ...keys.split, escape: 'quit' }),
    );
  }
}

export interface TableOptions {
  title?: string;
  columns: TableColumnDef[];
  rows: string[][];
  /** When set, returns the selected row index; otherwise returns the row itself. */
  select?: boolean;
}

/** A selectable table screen. Returns the selected row (or index when `select`). */
export class TableScreen extends ScreenHandle<string[] | number> {
  readonly root: Column;
  readonly table: Table;

  constructor(options: TableOptions) {
    super();
    const onSelect = (index: number): void => {
      this.value = options.select ? index : this.table.getRows()[index] ?? [];
      this.done?.();
    };
    this.table = new Table(options.columns, options.rows, onSelect);
    this.root = new Column().add(
      new Label(options.title ?? 'Table'),
      new Viewport(this.table, 12),
      new HelpFooter({ ...keys.table, escape: 'quit' }),
    );
  }

  /** Current row set after insert/delete/edit. */
  rows(): string[][] {
    return this.table.getRows();
  }
}

export interface TreeOptions {
  title?: string;
  nodes: TreeNodeData[];
}

/** A navigable tree screen. Returns the selected path string on enter. */
export class TreeScreen extends ScreenHandle<string> {
  readonly root: Column;
  readonly tree: Tree;

  constructor(options: TreeOptions) {
    super();
    this.tree = new Tree(options.nodes, (path) => {
      this.value = path;
      this.done?.();
    });
    this.root = new Column().add(
      new Label(options.title ?? 'Tree'),
      this.tree,
      new HelpFooter({ ...keys.table, escape: 'quit' }),
    );
  }
}

export interface MasterDetailOptions {
  title?: string;
  items: string[];
  /** Render the detail view for the selected item. */
  detail: (selected: string) => string[];
  ratio?: number;
}

/** A side-by-side master/detail screen. The left panel lists items; the right
 *  renders detail for the selected item. Returns the selected item on enter. */
export class SplitScreen extends ScreenHandle<string> {
  readonly root: Column;
  readonly detailPanel: Panel;
  readonly list: List;
  private readonly items: string[];

  constructor(options: MasterDetailOptions) {
    super();
    this.items = options.items;
    this.detailPanel = new Panel(options.title ?? 'Detail', options.detail(options.items[0] ?? ''));
    this.list = new List(options.items, (index) => {
      this.value = this.items[index];
      this.done?.();
    });
    // Update detail panel when the cursor moves.
    const origMove = this.list.move.bind(this.list);
    this.list.move = (delta: number): void => {
      origMove(delta);
      this.detailPanel.setBody(options.detail(this.list.selected ?? ''));
    };
    this.root = new Column().add(
      new Label(options.title ?? 'Split'),
      new Split({ axis: 'horizontal', ratio: options.ratio ?? 0.4 }).add(
        this.list,
        this.detailPanel,
      ),
      new HelpFooter({ ...keys.table, ...keys.split, escape: 'quit' }),
    );
  }
}

export interface PivotOptions {
  title?: string;
  columns: TableColumnDef[];
  rows: string[][];
  /** Column index to group by. Defaults to 0. */
  groupBy?: number;
}

/** A pivot-table screen. Groups rows by a column and shows per-group counts.
 *  Arrow keys cycle through groupBy columns; enter returns the grouped view. */
export class PivotScreen extends ScreenHandle<string[][]> {
  readonly root: Column;
  readonly table: Table;
  private readonly columns: TableColumnDef[];
  private readonly rows: string[][];
  private groupIndex: number;

  constructor(options: PivotOptions) {
    super();
    this.columns = options.columns;
    this.rows = options.rows;
    this.groupIndex = options.groupBy ?? 0;
    this.table = new Table(this.buildColumns(), this.buildRows(), (_index) => {
      this.value = this.buildRows();
      this.done?.();
    });
    const origKey = this.table.onKey.bind(this.table);
    this.table.onKey = (event: KeyEvent): boolean => {
      if (event.name === 'left' || event.name === 'right') {
        this.cycle(event.name === 'right' ? 1 : -1);
        return true;
      }
      return origKey(event);
    };
    this.root = new Column().add(
      new Label(options.title ?? 'Pivot'),
      this.table,
      new HelpFooter({ ...keys.table, escape: 'quit' }),
    );
  }

  private cycle(delta: number): void {
    if (this.columns.length === 0) return;
    this.groupIndex = (this.groupIndex + delta + this.columns.length) % this.columns.length;
    this.table.setColumns(this.buildColumns());
    this.table.setRows(this.buildRows());
  }

  get groupBy(): number {
    return this.groupIndex;
  }

  private buildColumns(): TableColumnDef[] {
    const groupLabel = this.columns[this.groupIndex]?.header ?? `col${this.groupIndex}`;
    return [{ header: groupLabel }, { header: 'count' }];
  }

  private buildRows(): string[][] {
    const counts = new Map<string, number>();
    for (const row of this.rows) {
      const key = row[this.groupIndex] ?? '';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => [key, String(count)]);
  }
}

export interface NotificationEntry {
  type: 'success' | 'error' | 'info' | 'warn';
  label: string;
  message?: string;
  time?: string;
}

export interface NotificationsOptions {
  title?: string;
  entries: NotificationEntry[];
}

/** A scrollable notification log center. Escape to dismiss. */
export class NotificationsScreen extends ScreenHandle<void> {
  readonly root: Column;
  readonly list: List;

  constructor(options: NotificationsOptions) {
    super();
    const items = options.entries.map((e) => {
      const icon = e.type === 'success' ? '✓' : e.type === 'error' ? '✗' : e.type === 'warn' ? '⚠' : 'ℹ';
      const message = e.message ? ` — ${e.message}` : '';
      const time = e.time ? `  ${e.time}` : '';
      return `${icon} ${e.label}${message}${time}`;
    });
    this.list = new List(items.length > 0 ? items : ['(no notifications)']);
    this.root = new Column().add(
      new Label(options.title ?? 'Notifications'),
      this.list,
      new HelpFooter({ ...keys.list, escape: 'quit' }),
    );
  }
}

export interface MenuOptions {
  title?: string;
  items: string[];
}

/** A command palette screen. Type to filter (via FuzzyList), enter to select. */
export class MenuScreen extends ScreenHandle<string> {
  readonly root: Column;
  readonly fuzzy: FuzzyList;

  constructor(options: MenuOptions) {
    super();
    this.fuzzy = new FuzzyList(options.items, (item) => {
      this.value = item;
      this.done?.();
    });
    this.root = new Column().add(
      new Label(options.title ?? 'Menu'),
      this.fuzzy,
      new HelpFooter(keys.list),
    );
  }
}

export const Screen = {
  picker: (options: PickerOptions): PickerScreen => new PickerScreen(options),
  wizard: (options: WizardOptions): WizardScreen => new WizardScreen(options),
  form: (options: FormOptions): FormScreen => new FormScreen(options),
  table: (options: TableOptions): TableScreen => new TableScreen(options),
  tree: (options: TreeOptions): TreeScreen => new TreeScreen(options),
  split: (options: MasterDetailOptions): SplitScreen => new SplitScreen(options),
  pivot: (options: PivotOptions): PivotScreen => new PivotScreen(options),
  notifications: (options: NotificationsOptions): NotificationsScreen => new NotificationsScreen(options),
  menu: (options: MenuOptions): MenuScreen => new MenuScreen(options),
  dashboard: (options: DashboardOptions): DashboardScreen => new DashboardScreen(options),
};
