import { BaseComponent } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';
import { visibleLength } from '@mudah-cli/ui';

export interface CheckboxOptions {
  label?: string;
  checked?: boolean;
  onSelect?: (checked: boolean) => void;
}

/** A single on/off toggle. Space or enter toggles it. */
export class Checkbox extends BaseComponent {
  readonly focusable = true;
  readonly keys = { space: 'toggle', enter: 'toggle' };

  constructor(private readonly options: CheckboxOptions = {}) {
    super();
  }

  get checked(): boolean {
    return this.options.checked ?? false;
  }

  set checked(value: boolean) {
    this.options.checked = value;
  }

  toggle(): void {
    const next = !this.checked;
    this.options.checked = next;
    this.options.onSelect?.(next);
  }

  confirm(): void {
    this.toggle();
  }

  render(): string[] {
    const box = this.options.checked ? '[x]' : '[ ]';
    const label = this.options.label ?? '';
    return [`${box} ${label}`];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const line = this.render()[0] ?? '';
    return { width: visibleLength(line), height: 1 };
  }

  override onKey(event: KeyEvent): boolean {
    if (event.name === 'space' || event.name === 'enter') {
      this.toggle();
      return true;
    }
    return false;
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'checkbox', name: this.options.label, value: this.options.checked };
  }
}

export interface RadioItem {
  label: string;
  value: string | number;
}

/** A vertical single-select list. Arrows move, enter selects. */
export class Radio extends BaseComponent {
  selectedIndex = 0;

  readonly focusable = true;
  readonly keys = { up: 'prev', down: 'next', enter: 'select', space: 'select' };

  constructor(
    private readonly items: RadioItem[],
    private readonly onSelect?: (value: string | number) => void,
  ) {
    super();
  }

  get selected(): RadioItem | undefined {
    return this.items[this.selectedIndex];
  }

  move(delta: number): void {
    this.selectedIndex = Math.min(
      Math.max(this.selectedIndex + delta, 0),
      Math.max(0, this.items.length - 1),
    );
  }

  confirm(): void {
    const item = this.selected;
    if (item) this.onSelect?.(item.value);
  }

  render(): string[] {
    return this.items.map((item, i) => `${i === this.selectedIndex ? '●' : '○'} ${item.label}`);
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const lines = this.render();
    const content = Math.max(0, ...lines.map((line) => visibleLength(line)));
    return { width: content, height: lines.length };
  }

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'up':
        this.move(-1);
        return true;
      case 'down':
        this.move(1);
        return true;
      case 'space':
      case 'enter':
        this.confirm();
        return true;
      default:
        return false;
    }
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'radio', name: this.selected?.label, value: this.selected?.value };
  }
}
