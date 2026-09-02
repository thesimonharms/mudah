import { BaseComponent } from './component.js';

/**
 * TUI wrapper around a horizontal bar chart. Plain-string rows — the renderer
 * applies theme colors. Drop-in for live metrics inside a Column/Row.
 */
export class BarChart extends BaseComponent {
  private values: number[];
  readonly focusable = false;

  constructor(values: number[]) {
    super();
    this.values = values;
  }

  setValues(values: number[]): void {
    this.values = values;
  }

  render(): string[] {
    if (this.values.length === 0) return ['no data'];
    const max = Math.max(...this.values, 1);
    const width = 16;
    return this.values.map((v) => {
      const len = Math.min(width, Math.round((v / max) * width));
      const bar = '█'.repeat(len) + ' '.repeat(width - len);
      return `${bar} ${v}`;
    });
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    return { width: 20, height: Math.max(1, this.values.length) };
  }

  inspect(): { role: string; value: unknown } {
    return { role: 'bar-chart', value: this.values };
  }
}
