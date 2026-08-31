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
