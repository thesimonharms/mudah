import { BaseComponent } from './component.js';
import { visibleLength } from '@mudah-cli/ui';

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

  measure(width: number, _height: number): { width: number; height: number } {
    const lines = this.text.split('\n');
    const content = Math.max(0, ...lines.map((line) => visibleLength(line)));
    return { width: Math.min(width, content), height: lines.length };
  }

  readonly focusable = false;
}
