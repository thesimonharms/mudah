import { BaseComponent, type Component } from './component.js';
import type { KeyEvent } from '@mudah-cli/terminal';

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

  render(): string[] {
    const rows: string[] = [];
    for (const child of this.children) {
      rows.push(...child.render());
    }
    return rows;
  }
}
