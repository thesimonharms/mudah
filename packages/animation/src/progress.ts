export interface ProgressBarOptions {
  total: number;
  /** Bar width in cells. Default 30. */
  width?: number;
  stream?: { write(data: string): unknown; isTTY?: boolean };
  unicode?: boolean;
  label?: string;
  showEta?: boolean;
  style?: (text: string) => string;
  /** Master switch — pass false for silent operation. */
  enabled?: boolean;
}

interface EtaState {
  startedAt: number;
}

/**
 * A single-line progress bar. `render()` is pure and stream-free so the UI
 * layer (and tests) can compose it however they like.
 */
export class ProgressBar {
  value = 0;
  private readonly total: number;
  private readonly width: number;
  private readonly stream?: { write(data: string): unknown; isTTY?: boolean };
  private readonly unicode: boolean;
  private readonly label?: string;
  private readonly showEta: boolean;
  private readonly style?: (text: string) => string;
  private readonly enabled: boolean;
  private readonly eta: EtaState;

  constructor(options: ProgressBarOptions) {
    this.total = Math.max(1, options.total);
    this.width = options.width ?? 30;
    this.stream = options.stream;
    this.unicode = options.unicode ?? true;
    this.label = options.label;
    this.showEta = options.showEta ?? false;
    this.style = options.style;
    this.enabled = options.enabled ?? this.stream?.isTTY === true;
    this.eta = { startedAt: performance.now() };
  }

  /** Pure rendering of the current state. */
  render(): string {
    const clamped = Math.min(this.value, this.total);
    const fraction = clamped / this.total;
    const filled = Math.round(this.width * fraction);
    const filledChar = this.unicode ? '█' : '#';
    const emptyChar = this.unicode ? '░' : '-';
    const bar = this.style ? this.style(filledChar.repeat(filled)) + emptyChar.repeat(this.width - filled) : `${filledChar.repeat(filled)}${emptyChar.repeat(this.width - filled)}`;

    const parts = [`[${bar}]`, `${Math.round(fraction * 100)}%`, `${clamped}/${this.total}`];
    if (this.label) parts.push(this.label);
    if (this.showEta) {
      const etaText = this.etaText();
      if (etaText) parts.push(etaText);
    }
    return parts.join(' ');
  }

  /** Advance to an absolute value and repaint. */
  set(value: number): void {
    this.value = Math.max(0, Math.min(value, this.total));
    this.paint();
  }

  /** Advance by a delta and repaint. */
  inc(by = 1): void {
    this.set(this.value + by);
  }

  /** Finish: paint 100% and move to a new line. */
  complete(): void {
    this.set(this.total);
    if (this.enabled && this.stream) {
      this.stream.write('\n');
    }
  }

  private paint(): void {
    if (this.enabled && this.stream) {
      this.stream.write('\r\x1b[2K');
      this.stream.write(this.render());
    }
  }

  private etaText(): string {
    if (this.value <= 0) return '';
    const elapsed = performance.now() - this.eta.startedAt;
    if (elapsed < 250) return '';
    const perItem = elapsed / this.value;
    const remaining = (this.total - this.value) * perItem;
    if (remaining < 1000) return `eta <1s`;
    return `eta ${Math.ceil(remaining / 1000)}s`;
  }
}
