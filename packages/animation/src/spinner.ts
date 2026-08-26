import { defaultSpinner, spinnerStyles } from './frames.js';

export interface SpinnerOptions {
  /** Where output goes. Defaults to `process.stderr`. */
  stream?: { write(data: string): unknown };
  /** Optional styling applied to the frame glyph (e.g. theme accent color). */
  style?: (text: string) => string;
  /** Frame name from `spinnerStyles`, or explicit frames. */
  styleName?: string;
  frames?: readonly string[];
  /** Milliseconds per frame (overrides the named style's interval). */
  interval?: number;
  /** Render a static glyph instead of animating. */
  reducedMotion?: boolean;
  /** Master switch — pass false to disable all output. */
  enabled?: boolean;
}

/**
 * An animated spinner bound to a stream.
 *
 * - TTY + motion: animated frames, redrawn with `\r` + line clear.
 * - Reduced motion or non-TTY: a single static line, no animation.
 * - `with()` wraps async work: start → run → stop, error-safe.
 */
export class Spinner {
  private readonly stream: { write(data: string): unknown };
  private readonly style?: (text: string) => string;
  private readonly frames: readonly string[];
  private readonly interval: number;
  private readonly reducedMotion: boolean;
  private readonly enabled: boolean;

  private label = '';
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private staticWritten = false;

  constructor(options: SpinnerOptions = {}) {
    const named = options.styleName ? spinnerStyles[options.styleName] : undefined;
    this.stream = options.stream ?? process.stderr;
    this.style = options.style;
    this.frames = options.frames ?? named?.frames ?? defaultSpinner.frames;
    this.interval = options.interval ?? named?.interval ?? defaultSpinner.interval;
    this.reducedMotion = options.reducedMotion ?? false;
    this.enabled = options.enabled ?? (this.stream as { isTTY?: boolean }).isTTY === true;
  }

  start(label: string): void {
    this.label = label;
    this.frame = 0;
    if (!this.enabled) return;

    if (this.reducedMotion) {
      this.writeLine(this.renderFrame());
      this.staticWritten = true;
      return;
    }

    this.writeLine(this.renderFrame());
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % this.frames.length;
      this.stream.write('\r\x1b[2K');
      this.writeLine(this.renderFrame());
    }, this.interval);
  }

  /** Update the label while running (re-renders immediately). */
  setLabel(label: string): void {
    this.label = label;
    if (this.timer) {
      this.stream.write('\r\x1b[2K');
      this.writeLine(this.renderFrame());
    } else if (this.enabled && this.staticWritten) {
      this.stream.write('\r\x1b[2K');
      this.writeLine(this.renderFrame());
    }
  }

  stop(finalLabel?: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (!this.enabled) return;
    this.stream.write('\r\x1b[2K');
    if (finalLabel) {
      this.stream.write(finalLabel + '\n');
    }
    this.staticWritten = false;
  }

  /** Run `fn` under a spinner; always stops, even on error. */
  async with<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    this.start(label);
    try {
      return await fn();
    } finally {
      this.stop();
    }
  }

  private renderFrame(): string {
    const glyph = this.reducedMotion ? '·' : this.frames[this.frame % this.frames.length] ?? '·';
    const frame = this.style ? this.style(glyph) : glyph;
    return `${frame} ${this.label}`;
  }

  private writeLine(line: string): void {
    this.stream.write(line);
  }
}
