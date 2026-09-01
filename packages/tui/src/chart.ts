import { renderBarChart, renderLineChart, visibleLength, type BarChartEntry } from '@mudah-cli/ui';
import { BaseComponent } from './component.js';

export type ChartKind = 'bar' | 'line';

export type ChartEntry = BarChartEntry;

export interface ChartOptions {
  kind: ChartKind;
  entries: ChartEntry[];
  /** Bar width, or sampled columns for a line chart. */
  width?: number;
  /** Line-chart plot height in rows. Ignored for bars. */
  height?: number;
}

/**
 * TUI wrapper around `@mudah-cli/ui` {@link renderBarChart} / {@link renderLineChart}.
 * Renders at color level 0 so the Program paint pass owns theme colors.
 */
export class Chart extends BaseComponent {
  readonly focusable = false;

  constructor(private readonly options: ChartOptions) {
    super();
  }

  render(): string[] {
    const { kind, entries, width, height } = this.options;
    const text =
      kind === 'line'
        ? renderLineChart(entries, { level: 0, width, height, unicode: true })
        : renderBarChart(entries, { level: 0, width, unicode: true });
    return text.split('\n');
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const lines = this.render();
    const content = Math.max(0, ...lines.map((line) => visibleLength(line)));
    return { width: content, height: lines.length };
  }

  inspect(): { role: string; value?: unknown } {
    return { role: 'chart', value: this.options.kind };
  }
}
