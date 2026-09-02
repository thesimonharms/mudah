import { BaseComponent } from './component.js';
import { visibleLength } from '@mudah-cli/ui';

export interface ProgressBarOptions {
  label?: string;
  /** Bar width in cells. Default 20. */
  width?: number;
  /** Use unicode blocks. Default true. */
  unicode?: boolean;
  /** Show the percentage. Default true. */
  showPercent?: boolean;
}

/** A display-only progress bar. Update via `setProgress(0..1)`. Not focusable. */
export class ProgressBar extends BaseComponent {
  readonly focusable = false;
  private fraction: number;

  constructor(fraction = 0, private readonly options: ProgressBarOptions = {}) {
    super();
    this.fraction = Math.min(1, Math.max(0, fraction));
  }

  get progress(): number {
    return this.fraction;
  }

  setProgress(fraction: number): void {
    this.fraction = Math.min(1, Math.max(0, fraction));
  }

  render(): string[] {
    const width = this.options.width ?? 20;
    const full = (this.options.unicode ?? true) ? '█' : '#';
    const fill = Math.min(width, Math.max(0, Math.round(this.fraction * width)));
    const bar = full.repeat(fill) + ' '.repeat(Math.max(0, width - fill));
    const label = this.options.label ? `${this.options.label} ` : '';
    const percent = this.options.showPercent === false ? '' : ` ${Math.round(this.fraction * 100)}%`;
    return [`${label}[${bar}]${percent}`];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    const line = this.render()[0] ?? '';
    return { width: visibleLength(line), height: 1 };
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'progress', value: this.fraction };
  }
}
