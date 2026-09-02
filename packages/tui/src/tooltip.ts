import { BaseComponent } from './component.js';

/**
 * Anchored hint text. Not focusable: rendered as a 1-line box, or as plain
 * text when no title is set. Useful for "what is this?" hover-style hints in
 * a TUI.
 */
export class Tooltip extends BaseComponent {
  readonly focusable = false;
  private readonly anchorX: number;
  private readonly anchorY: number;

  constructor(
    private title: string,
    private text: string,
    options: { x?: number; y?: number } = {},
  ) {
    super();
    this.anchorX = options.x ?? 0;
    this.anchorY = options.y ?? 0;
  }

  setText(text: string): void {
    this.text = text;
  }

  render(): string[] {
    const body = this.text.length === 0 ? this.title : this.title ? `${this.title} — ${this.text}` : this.text;
    const pad = ' '.repeat(this.anchorX);
    const lines: string[] = [];
    for (let i = 0; i < this.anchorY; i++) lines.push('');
    lines.push(`${pad}${body}`);
    return lines;
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    return { width: Math.max(this.title.length, this.text.length), height: 1 };
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'tooltip', name: this.title, value: this.text };
  }
}
