import { BaseComponent } from './component.js';
import { visibleLength } from '@mudah-cli/ui';

export interface PopoverOptions {
  /** Column offset from the left of the parent. */
  x?: number;
  /** Row offset from the top of the parent. */
  y?: number;
  width?: number;
}

/**
 * Anchored floating box. Pads with spaces so the body sits at `(x, y)`.
 */
export class Popover extends BaseComponent {
  readonly focusable = false;

  constructor(
    private readonly body: string[],
    private readonly options: PopoverOptions = {},
  ) {
    super();
  }

  render(): string[] {
    const x = Math.max(0, this.options.x ?? 0);
    const y = Math.max(0, this.options.y ?? 0);
    const width = this.options.width ?? Math.max(0, ...this.body.map((line) => visibleLength(line)));
    const pad = ' '.repeat(x);
    const lines: string[] = [];
    for (let i = 0; i < y; i++) lines.push('');
    const top = `${pad}╭${'─'.repeat(Math.max(width, 1))}╮`;
    const bottom = `${pad}╰${'─'.repeat(Math.max(width, 1))}╯`;
    lines.push(top);
    for (const row of this.body) {
      const inner = row + ' '.repeat(Math.max(0, width - visibleLength(row)));
      lines.push(`${pad}│${inner}│`);
    }
    lines.push(bottom);
    return lines;
  }

  inspect(): { role: string; value?: unknown } {
    return { role: 'popover', value: { x: this.options.x ?? 0, y: this.options.y ?? 0 } };
  }
}
