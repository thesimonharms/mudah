export type ProgressBarMode = 'determinate' | 'indeterminate';

export interface ProgressBarOptions {
  /** Required for determinate bars. Ignored by the indeterminate renderer. */
  total?: number;
  /** Default `determinate`. Indeterminate draws a bouncing block, no %. */
  mode?: ProgressBarMode;
  /** Bar width in cells. Default 30. */
  width?: number;
  stream?: { write(data: string): unknown; isTTY?: boolean };
  unicode?: boolean;
  label?: string;
  showEta?: boolean;
  style?: (text: string) => string;
  /** Master switch — pass false for silent operation. */
  enabled?: boolean;
  /** Fired once on the first `set` / `inc` / `tick`. */
  onStart?: () => void;
  /** Fired on every `set` / `inc` / `tick` (and on `complete`). */
  onProgress?: (value: number, total: number) => void;
  /** Fired once from `complete()`. */
  onComplete?: () => void;
}

interface EtaState {
  startedAt: number;
}

/**
 * A single-line progress bar. `render()` is pure and stream-free so the UI
 * layer (and tests) can compose it however they like.
 *
 * Determinate: filled fraction + percentage + `value/total`.
 * Indeterminate: a bouncing block; call `tick()` to advance it.
 */
export class ProgressBar {
  value = 0;
  readonly mode: ProgressBarMode;
  private readonly total: number;
  private readonly width: number;
  private readonly stream?: { write(data: string): unknown; isTTY?: boolean };
  private readonly unicode: boolean;
  private readonly label?: string;
  private readonly showEta: boolean;
  private readonly style?: (text: string) => string;
  private readonly enabled: boolean;
  private readonly eta: EtaState;
  private readonly onStartHook?: () => void;
  private readonly onProgressHook?: (value: number, total: number) => void;
  private readonly onCompleteHook?: () => void;
  private started = false;
  private finished = false;
  private phase = 0;

  constructor(options: ProgressBarOptions) {
    this.mode = options.mode ?? 'determinate';
    this.total = Math.max(1, options.total ?? 1);
    this.width = options.width ?? 30;
    this.stream = options.stream;
    this.unicode = options.unicode ?? true;
    this.label = options.label;
    this.showEta = options.showEta ?? false;
    this.style = options.style;
    this.enabled = options.enabled ?? this.stream?.isTTY === true;
    this.eta = { startedAt: performance.now() };
    this.onStartHook = options.onStart;
    this.onProgressHook = options.onProgress;
    this.onCompleteHook = options.onComplete;
  }

  /** Pure rendering of the current state. */
  render(): string {
    if (this.mode === 'indeterminate') return this.renderIndeterminate();

    const clamped = Math.min(this.value, this.total);
    const fraction = clamped / this.total;
    const filled = Math.round(this.width * fraction);
    const filledChar = this.unicode ? '█' : '#';
    const emptyChar = this.unicode ? '░' : '-';
    const bar = this.style
      ? this.style(filledChar.repeat(filled)) + emptyChar.repeat(this.width - filled)
      : `${filledChar.repeat(filled)}${emptyChar.repeat(this.width - filled)}`;

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
    this.noteStart();
    this.value = Math.max(0, Math.min(value, this.total));
    this.noteProgress();
    this.paint();
  }

  /** Advance by a delta and repaint. */
  inc(by = 1): void {
    this.set(this.value + by);
  }

  /**
   * Advance the indeterminate bounce (or repaint a determinate bar).
   * First call fires `onStart`.
   */
  tick(): void {
    this.noteStart();
    if (this.mode === 'indeterminate') {
      this.phase += 1;
      this.value = this.phase;
    }
    this.noteProgress();
    this.paint();
  }

  /** Finish: paint 100% (determinate) and move to a new line. */
  complete(): void {
    this.noteStart();
    if (this.mode === 'determinate') {
      this.value = this.total;
    }
    this.noteProgress();
    this.paint();
    if (!this.finished) {
      this.finished = true;
      this.onCompleteHook?.();
    }
    if (this.enabled && this.stream) {
      this.stream.write('\n');
    }
  }

  private renderIndeterminate(): string {
    const filledChar = this.unicode ? '█' : '#';
    const emptyChar = this.unicode ? '░' : '-';
    const block = Math.max(1, Math.round(this.width / 4));
    const travel = Math.max(0, this.width - block);
    const cycle = travel === 0 ? 1 : travel * 2;
    const step = this.phase % cycle;
    const pos = travel === 0 ? 0 : step <= travel ? step : cycle - step;

    const left = emptyChar.repeat(pos);
    const mid = filledChar.repeat(Math.min(block, this.width));
    const right = emptyChar.repeat(Math.max(0, this.width - pos - block));
    const raw = `${left}${mid}${right}`.slice(0, this.width);
    const bar = this.style ? this.style(raw) : raw;

    const parts = [`[${bar}]`];
    if (this.label) parts.push(this.label);
    return parts.join(' ');
  }

  private noteStart(): void {
    if (this.started) return;
    this.started = true;
    this.onStartHook?.();
  }

  private noteProgress(): void {
    const total = this.mode === 'indeterminate' ? 0 : this.total;
    this.onProgressHook?.(this.value, total);
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
