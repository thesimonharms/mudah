import type { KeyEvent } from '@mudah-cli/terminal';
import type { Component } from './component.js';
import { Layout } from './layout.js';

function reducedMotion(): boolean {
  return process.env.MUDAH_REDUCED_MOTION === '1' || process.env.CI === 'true' || process.env.CI === '1';
}

/**
 * Push/pop screens. Only the top child fills the box. A short slide plays
 * on push unless reduced-motion is set.
 */
export class Stack extends Layout {
  private screens: Component[] = [];
  private slide = 0;

  get depth(): number {
    return this.screens.length;
  }

  get top(): Component | undefined {
    return this.screens[this.screens.length - 1];
  }

  push(screen: Component): void {
    this.screens.push(screen);
    this.slide = reducedMotion() ? 0 : 6;
    this.sync();
  }

  pop(): Component | undefined {
    const gone = this.screens.pop();
    this.sync();
    return gone;
  }

  override handleKey(event: KeyEvent): boolean {
    if (super.handleKey(event)) return true;
    if (event.name === 'escape' && this.depth > 1) {
      this.pop();
      return true;
    }
    return false;
  }

  private sync(): void {
    this.children = this.top ? [this.top] : [];
    this.refocus();
  }

  protected measureAlong(width: number, height: number): { width: number; height: number } {
    return { width: Math.min(width, 1), height: Math.min(height, 1) };
  }

  protected place(width: number, height: number | undefined): void {
    const h = height ?? 1;
    const offset = this.slide > 0 ? Math.floor((width * this.slide) / 6) : 0;
    if (this.slide > 0) this.slide -= 1;
    const child = this.top;
    this.bounds = [];
    if (!child) return;
    this.bounds.push({ child, x: offset, y: 0, width: Math.max(1, width - offset), height: h });
    child.resize?.(Math.max(1, width - offset), h);
  }

  inspect(): { role: string; value?: unknown } {
    return { role: 'stack', value: this.depth };
  }
}
