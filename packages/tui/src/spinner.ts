import { BaseComponent } from './component.js';

/**
 * An inline spinner that advances one frame per render. Pairs with a Program
 * that calls `tick(deltaMs)` on every paint. The frames are inlined so this
 * package stays independent of `@mudah-cli/animation`.
 */
const DEFAULT_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const DEFAULT_SPINNER_INTERVAL = 80;

export class Spinner extends BaseComponent {
  private elapsed = 0;
  private frame = 0;
  readonly focusable = false;
  private label = '';

  constructor(
    private readonly frames: readonly string[] = DEFAULT_SPINNER_FRAMES,
    private readonly interval = DEFAULT_SPINNER_INTERVAL,
  ) {
    super();
  }

  setLabel(label: string): void {
    this.label = label;
  }

  /** Advance the animation; call from the render loop. */
  tick(deltaMs: number): void {
    this.elapsed += deltaMs;
    while (this.elapsed >= this.interval) {
      this.frame = (this.frame + 1) % this.frames.length;
      this.elapsed -= this.interval;
    }
  }

  render(): string[] {
    const glyph = this.frames[this.frame] ?? '·';
    return this.label ? [`${glyph} ${this.label}`] : [glyph];
  }

  measure(_width: number, _height: number): { width: number; height: number } {
    return { width: this.label.length + 2, height: 1 };
  }

  inspect(): { role: string; name?: string; value?: unknown } {
    return { role: 'spinner', name: this.label, value: this.frame };
  }
}
