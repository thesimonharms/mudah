import { BaseComponent } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';

const BLOCKS = ' ▁▂▃▄▅▆▇█';

/** One-line sparkline from numeric samples. */
export class Sparkline extends BaseComponent {
  constructor(private values: number[]) {
    super();
  }

  setValues(values: number[]): void {
    this.values = values;
  }

  render(): string[] {
    if (this.values.length === 0) return [''];
    const max = Math.max(...this.values, 1);
    return [this.values.map((v) => BLOCKS[Math.round((Math.max(v, 0) / max) * (BLOCKS.length - 1))] ?? ' ').join('')];
  }

  inspect(): { role: string; value?: unknown } {
    return { role: 'sparkline', value: this.values };
  }

  readonly focusable = false;
}

export interface TreeNodeData {
  label: string;
  children?: TreeNodeData[];
}

/** Expandable tree. Space toggles. Enter selects the cursor row. */
export class Tree extends BaseComponent {
  selectedIndex = 0;
  private readonly expanded = new Set<string>();
  private onSelect?: (path: string) => void;

  constructor(
    private nodes: TreeNodeData[],
    onSelect?: (path: string) => void,
  ) {
    super();
    this.onSelect = onSelect;
  }

  private flat(): { path: string; label: string; depth: number; expandable: boolean }[] {
    const out: { path: string; label: string; depth: number; expandable: boolean }[] = [];
    const walk = (nodes: TreeNodeData[], prefix: string, depth: number): void => {
      for (const node of nodes) {
        const path = prefix === '' ? node.label : `${prefix}/${node.label}`;
        const expandable = (node.children?.length ?? 0) > 0;
        out.push({ path, label: node.label, depth, expandable });
        if (expandable && this.expanded.has(path)) walk(node.children ?? [], path, depth + 1);
      }
    };
    walk(this.nodes, '', 0);
    return out;
  }

  render(): string[] {
    return this.flat().map((row, i) => {
      const pointer = i === this.selectedIndex ? '▸ ' : '  ';
      const mark = row.expandable ? (this.expanded.has(row.path) ? '▼ ' : '▶ ') : '  ';
      return `${pointer}${'  '.repeat(row.depth)}${mark}${row.label}`;
    });
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'tree', name: this.flat()[this.selectedIndex]?.path, value: this.selectedIndex };
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    const rows = this.flat();
    switch (event.name) {
      case 'up':
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        return true;
      case 'down':
        this.selectedIndex = Math.min(rows.length - 1, this.selectedIndex + 1);
        return true;
      case 'space': {
        const row = rows[this.selectedIndex];
        if (row?.expandable) {
          if (this.expanded.has(row.path)) this.expanded.delete(row.path);
          else this.expanded.add(row.path);
        }
        return true;
      }
      case 'enter': {
        const row = rows[this.selectedIndex];
        if (row) this.onSelect?.(row.path);
        return true;
      }
      default:
        return false;
    }
  }
}

/**
 * Windowed list for large datasets. Only renders visible rows plus a small
 * overscan buffer. Arrow keys move the cursor; page-up/down jump by a page.
 */
export class VirtualList<T> extends BaseComponent {
  selectedIndex = 0;
  private scrollTop = 0;
  private viewHeight: number;
  private readonly onSelect?: (index: number, item: T) => void;

  constructor(
    private items: T[],
    height: number,
    private renderRow: (item: T, selected: boolean) => string,
    onSelect?: (index: number, item: T) => void,
  ) {
    super();
    this.viewHeight = height;
    this.onSelect = onSelect;
  }

  get selected(): T | undefined {
    return this.items[this.selectedIndex];
  }

  setHeight(rows: number): void {
    this.viewHeight = rows;
  }

  render(): string[] {
    const total = this.items.length;
    if (total === 0) return ['(empty)'];
    this.scrollTop = Math.min(this.scrollTop, Math.max(0, total - this.viewHeight));
    const end = Math.min(this.scrollTop + this.viewHeight, total);
    const out: string[] = [];
    for (let i = this.scrollTop; i < end; i++) {
      out.push(this.renderRow(this.items[i]!, i === this.selectedIndex));
    }
    return out;
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'virtuallist', value: this.selectedIndex, name: String(this.items.length) };
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    const total = this.items.length;
    if (total === 0) return false;
    switch (event.name) {
      case 'up':
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.clampScroll();
        return true;
      case 'down':
        this.selectedIndex = Math.min(total - 1, this.selectedIndex + 1);
        this.clampScroll();
        return true;
      case 'page-up':
        this.selectedIndex = Math.max(0, this.selectedIndex - this.viewHeight);
        this.clampScroll();
        return true;
      case 'page-down':
        this.selectedIndex = Math.min(total - 1, this.selectedIndex + this.viewHeight);
        this.clampScroll();
        return true;
      case 'home':
        this.selectedIndex = 0;
        this.scrollTop = 0;
        return true;
      case 'end':
        this.selectedIndex = total - 1;
        this.clampScroll();
        return true;
      case 'enter':
        this.onSelect?.(this.selectedIndex, this.items[this.selectedIndex]!);
        return true;
      default:
        return false;
    }
  }

  private clampScroll(): void {
    if (this.selectedIndex < this.scrollTop) this.scrollTop = this.selectedIndex;
    else if (this.selectedIndex >= this.scrollTop + this.viewHeight) {
      this.scrollTop = this.selectedIndex - this.viewHeight + 1;
    }
  }
}

/**
 * Compact metric gauge. Renders a value (0..1) as a bar + percentage.
 * Use inside a Panel or StatusBar for live metric display.
 */
export class MetricGauge extends BaseComponent {
  constructor(
    private label: string,
    private value: number,
    private width = 20,
  ) {
    super();
    this.value = Math.max(0, Math.min(1, value));
  }

  setValue(value: number): void {
    this.value = Math.max(0, Math.min(1, value));
  }

  render(): string[] {
    const filled = Math.round(this.value * this.width);
    const empty = this.width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const pct = Math.round(this.value * 100);
    const pad = this.label.length > 0 ? this.label + ' ' : '';
    const ring = ['○', '◔', '◑', '◕', '●'][Math.min(4, Math.round(this.value * 4))] ?? '○';
    return [`${pad}${ring} ${bar} ${pct}%`];
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'metric', name: this.label, value: this.value };
  }

  readonly focusable = false;
}
