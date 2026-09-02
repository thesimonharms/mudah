import { BaseComponent } from './component.js';
import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';
import { visibleLength } from '@mudah-cli/ui';

export interface BreadcrumbItem {
  label: string;
  value?: unknown;
}

export interface BreadcrumbOptions {
  onSelect?: (item: BreadcrumbItem, index: number) => void;
  /** Trailing-ellipsis width cap. Default 40. */
  maxWidth?: number;
}

/** A focusable breadcrumb path. Arrows / clicks select crumbs; overflow uses trailing ellipsis. */
export class Breadcrumb extends BaseComponent {
  selectedIndex = 0;
  private width: number;

  readonly focusable = true;
  readonly keys = { left: 'prev', right: 'next', home: 'first', end: 'last', enter: 'select' };

  constructor(
    private readonly crumbs: BreadcrumbItem[],
    private readonly options: BreadcrumbOptions = {},
  ) {
    super();
    this.width = options.maxWidth ?? 40;
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

  private parts(): string[] {
    return this.crumbs.map((c, i) => (i === this.selectedIndex ? `[${c.label}]` : c.label));
  }

  render(): string[] {
    const parts = this.parts();
    let line = parts.join(' / ');
    if (visibleLength(line) <= this.width) return [line];
    const keep = [parts[this.selectedIndex] ?? ''];
    for (let i = this.crumbs.length - 1; i >= 0; i--) {
      if (i === this.selectedIndex) continue;
      const next = [parts[i] ?? '', ...keep];
      const candidate = `… / ${next.join(' / ')}`;
      if (visibleLength(candidate) > this.width) break;
      keep.unshift(parts[i] ?? '');
    }
    line = keep.length === parts.length ? parts.join(' / ') : `… / ${keep.join(' / ')}`;
    return [line];
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

  override onMouse(event: MouseEvent): boolean {
    if (!event.buttons.left) return false;
    const parts = this.parts();
    let x = 0;
    for (let i = 0; i < parts.length; i++) {
      const token = parts[i] ?? '';
      const end = x + visibleLength(token);
      if (event.x >= x && event.x < end) {
        this.selectedIndex = i;
        this.confirm();
        return true;
      }
      x = end + 3;
    }
    return false;
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return {
      role: 'breadcrumb',
      name: this.crumbs[this.selectedIndex]?.label,
      value: this.crumbs[this.selectedIndex],
    };
  }
}
