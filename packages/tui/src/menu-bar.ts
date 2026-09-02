import { BaseComponent } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';

export interface MenuBarItem {
  label: string;
  /** Sub-items revealed on select (optional). */
  items?: Array<{ label: string; onSelect: () => void }>;
}

export interface MenuBarOptions {
  items: MenuBarItem[];
}

/**
 * Horizontal menu bar. Navigate with left/right, open a dropdown with enter/space,
 * navigate sub-items with up/down, and close with escape.
 */
export class MenuBar extends BaseComponent {
  private readonly items: MenuBarItem[];
  private selected = 0;
  private openMenu = -1;
  private openIndex = 0;

  constructor(options: MenuBarOptions) {
    super();
    this.items = options.items;
  }

  render(): string[] {
    const header = this.items
      .map((item, i) => {
        const marked = accessLabel(item.label);
        return i === this.selected ? `[${marked}]` : ` ${marked} `;
      })
      .join('│');
    const lines: string[] = [header];
    if (this.openMenu >= 0) {
      const menu = this.items[this.openMenu];
      if (menu?.items && menu.items.length > 0) {
        for (let i = 0; i < menu.items.length; i++) {
          const prefix = i === this.openIndex ? '▸ ' : '  ';
          lines.push(`${prefix}${menu.items[i]!.label}`);
        }
      }
    }
    return lines;
  }

  inspect(): { role: string; value?: unknown } {
    return { role: 'menuBar', value: this.selected };
  }

  readonly focusable = true;

  override onKey(event: KeyEvent): boolean {
    if (this.openMenu >= 0) {
      const menu = this.items[this.openMenu];
      const count = menu?.items?.length ?? 0;
      switch (event.name) {
        case 'up':
          this.openIndex = Math.max(0, this.openIndex - 1);
          return true;
        case 'down':
          this.openIndex = Math.min(count - 1, this.openIndex + 1);
          return true;
        case 'enter':
          menu?.items?.[this.openIndex]?.onSelect?.();
          this.openMenu = -1;
          return true;
        case 'escape':
          this.openMenu = -1;
          return true;
        default:
          return this.matchAccessKey(event);
      }
    }
    switch (event.name) {
      case 'left':
        this.selected = Math.max(0, this.selected - 1);
        return true;
      case 'right':
        this.selected = Math.min(this.items.length - 1, this.selected + 1);
        return true;
      case 'enter':
      case 'space':
        this.openMenu = this.selected;
        this.openIndex = 0;
        return true;
      case 'escape':
        this.openMenu = -1;
        return true;
      default:
        if (this.matchAccessKey(event)) return true;
        return false;
    }
  }

  private matchAccessKey(event: KeyEvent): boolean {
    if (!event.alt || event.ch === undefined) return false;
    const ch = event.ch.toLowerCase();
    const idx = this.items.findIndex((item) => item.label[0]?.toLowerCase() === ch);
    if (idx < 0) return false;
    this.selected = idx;
    this.openMenu = idx;
    this.openIndex = 0;
    return true;
  }
}

function accessLabel(label: string): string {
  if (label.length === 0) return label;
  return `${label[0] ?? ''}\u0332${label.slice(1)}`;
}
