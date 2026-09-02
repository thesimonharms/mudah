import { BaseComponent, type Component } from './component.js';
import type { KeyEvent, MouseEvent } from '@mudah-cli/terminal';

/**
 * A scrollable window onto content taller than the terminal.
 *
 * The child renders in full; the viewport shows `height` rows of it. Keys
 * (arrows, page up/down, home/end) and the mouse wheel move the window.
 */
export class Viewport extends BaseComponent {
  /** First visible row of the child's output. */
  scrollTop = 0;
  /** Preferred height. `resize()` changes the displayed height only. */
  private preferredHeight: number;
  private viewportHeight: number;

  constructor(
    private child: Component,
    viewportHeight: number,
  ) {
    super();
    this.preferredHeight = viewportHeight;
    this.viewportHeight = viewportHeight;
  }

  measure(width: number, _height: number): { width: number; height: number } {
    return { width: Math.min(width, 1), height: Math.max(1, this.preferredHeight) };
  }

  resize(_width: number, height: number): void {
    this.viewportHeight = Math.max(0, height);
  }

  /** Rows of content available below the current scroll position. */
  private get content(): string[] {
    return this.child.render();
  }

  get maxScroll(): number {
    return Math.max(0, this.content.length - this.viewportHeight);
  }

  /** Change the number of visible rows (e.g. after a terminal resize). */
  setHeight(rows: number): void {
    this.preferredHeight = Math.max(0, rows);
    this.viewportHeight = this.preferredHeight;
    this.scrollTo(this.scrollTop);
  }

  scrollTo(row: number): void {
    this.scrollTop = Math.min(Math.max(row, 0), this.maxScroll);
  }

  scrollBy(delta: number): void {
    this.scrollTo(this.scrollTop + delta);
  }

  render(): string[] {
    const start = Math.min(this.scrollTop, this.maxScroll);
    const slice = this.content.slice(start, start + this.viewportHeight);
    // Pad so the viewport always occupies its declared height.
    while (slice.length < this.viewportHeight) slice.push('');
    return slice;
  }

  override get height(): number {
    return this.viewportHeight;
  }

  get focusable(): boolean {
    return this.child.focusable;
  }

  override onKey(event: KeyEvent): boolean {
    if (this.child.onKey?.(event)) return true;
    switch (event.name) {
      case 'up':
        this.scrollBy(-1);
        return true;
      case 'down':
        this.scrollBy(1);
        return true;
      case 'page-up':
        this.scrollBy(-this.viewportHeight);
        return true;
      case 'page-down':
        this.scrollBy(this.viewportHeight);
        return true;
      case 'home':
        this.scrollTo(0);
        return true;
      case 'end':
        this.scrollTo(this.maxScroll);
        return true;
      default:
        return false;
    }
  }

  tick(dtMs: number): void {
    this.child.tick?.(dtMs);
  }

  override onMouse(event: MouseEvent): boolean {
    if (event.wheel === 'up') {
      this.scrollBy(-1);
      return true;
    }
    if (event.wheel === 'down') {
      this.scrollBy(1);
      return true;
    }
    // Offset child coordinates by the scroll position.
    return (
      this.child.onMouse?.({
        ...event,
        y: event.y + this.scrollTop,
      }) ?? false
    );
  }
}
