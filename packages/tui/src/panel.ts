import { BaseComponent } from './component.js';
import { renderPanel, visibleLength } from '@mudah-cli/ui';

/** A titled bordered box. Not focusable. */
export class Panel extends BaseComponent {
  private allocated?: { width: number; height: number };

  constructor(
    private title: string | undefined,
    private body: string[],
    private width?: number,
  ) {
    super();
  }

  setBody(body: string[]): void {
    this.body = body;
  }

  measure(width: number, _height: number): { width: number; height: number } {
    const lines = this.draw(this.width);
    const w = visibleLength(lines[0] ?? '');
    return { width: Math.min(width, w), height: lines.length };
  }

  resize(width: number, height: number): void {
    this.allocated = { width, height };
  }

  render(): string[] {
    const inner =
      this.allocated !== undefined ? Math.max(0, this.allocated.width - 4) : this.width;
    const lines = this.draw(inner);
    const target = this.allocated?.height;
    if (target === undefined) return lines;
    if (lines.length > target) return lines.slice(0, target);
    while (lines.length < target) lines.push('');
    return lines;
  }

  private draw(innerWidth: number | undefined): string[] {
    const rendered = renderPanel(this.title, this.body, {
      level: 0,
      unicode: true,
      ...(innerWidth === undefined ? {} : { width: innerWidth }),
    });
    return rendered.split('\n');
  }

  readonly focusable = false;
}
