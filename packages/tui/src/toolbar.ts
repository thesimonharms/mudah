import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { visibleLength } from '@mudah-cli/ui';
import { BaseComponent } from './component.js';

export interface ToolbarItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  onSelect?: () => void;
}

export interface ToolbarOptions {
  items: ToolbarItem[];
  /** Fired after an item's own `onSelect`, with the selected id. */
  onSelect?: (id: string) => void;
  /** Optional name reported by `inspect()`. */
  name?: string;
}

/**
 * Iconic one-line command strip. Left/right move the cursor; enter or a
 * click on an item fires `onSelect`.
 */
export class Toolbar extends BaseComponent {
  readonly focusable = true;
  readonly keys = { left: 'prev', right: 'next', enter: 'select' };

  private readonly items: ToolbarItem[];
  private readonly onSelect?: (id: string) => void;
  private readonly toolbarName?: string;
  private selectedIndex = 0;
  private lastSelected: string | undefined;
  private ranges: Array<{ start: number; end: number }> = [];

  constructor(options: ToolbarOptions) {
    super();
    this.items = options.items;
    this.onSelect = options.onSelect;
    this.toolbarName = options.name;
  }

  get selectedId(): string | undefined {
    return this.items[this.selectedIndex]?.id;
  }

  /** Last id confirmed with enter or a click. */
  get result(): string | undefined {
    return this.lastSelected;
  }

  private clamp(index: number): number {
    return Math.min(Math.max(index, 0), Math.max(0, this.items.length - 1));
  }

  private cell(item: ToolbarItem, selected: boolean): string {
    const icon = item.icon ? `${item.icon} ` : '';
    const shortcut = item.shortcut ? ` ${item.shortcut}` : '';
    const inner = `${icon}${item.label}${shortcut}`;
    return selected ? `[▸${inner}]` : `[ ${inner} ]`;
  }

  private fire(index: number): void {
    const item = this.items[index];
    if (!item) return;
    this.selectedIndex = index;
    this.lastSelected = item.id;
    item.onSelect?.();
    this.onSelect?.(item.id);
  }

  render(): string[] {
    const parts: string[] = [];
    this.ranges = [];
    let x = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (i > 0) {
        parts.push(' ');
        x += 1;
      }
      const cell = this.cell(this.items[i]!, i === this.selectedIndex);
      this.ranges.push({ start: x, end: x + visibleLength(cell) });
      parts.push(cell);
      x += visibleLength(cell);
    }
    return [parts.join('')];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const line = this.render()[0] ?? '';
    return { width: visibleLength(line), height: 1 };
  }

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'left':
        this.selectedIndex = this.clamp(this.selectedIndex - 1);
        return true;
      case 'right':
        this.selectedIndex = this.clamp(this.selectedIndex + 1);
        return true;
      case 'enter':
      case 'space':
        this.fire(this.selectedIndex);
        return true;
      default: {
        const ch = event.ch ?? (event.name.length === 1 ? event.name : undefined);
        if (ch) {
          const index = this.items.findIndex((item) => item.shortcut === ch);
          if (index >= 0) {
            this.fire(index);
            return true;
          }
        }
        return false;
      }
    }
  }

  override onMouse(event: MouseEvent): boolean {
    if (!event.buttons.left || event.wheel) return false;
    if (event.y !== 0) return false;
    const index = this.ranges.findIndex((r) => event.x >= r.start && event.x < r.end);
    if (index < 0) return false;
    this.fire(index);
    return true;
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return {
      role: 'toolbar',
      name: this.toolbarName ?? this.items[this.selectedIndex]?.label,
      value: this.selectedId,
    };
  }
}
