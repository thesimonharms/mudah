import { BaseComponent } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';
import { visibleLength } from '@mudah-cli/ui';

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
