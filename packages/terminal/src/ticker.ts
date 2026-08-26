/**
 * Frame ticker. Uses a 30fps interval (or `fps`) — deterministic enough for
 * spinners and progress bars, and trivially testable with fake timers.
 */
export interface TickerOptions {
  fps?: number;
}

export class Ticker {
  private readonly fps: number;
  private readonly listeners = new Set<(dtMs: number) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private frame = 0;

  constructor(options: TickerOptions = {}) {
    this.fps = options.fps ?? 30;
  }

  onFrame(fn: (dtMs: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  get frameIndex(): number {
    return this.frame;
  }

  start(): void {
    if (this.timer) return;
    this.lastTick = performance.now();
    this.timer = setInterval(() => this.tick(), Math.round(1000 / this.fps));
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    this.frame += 1;
    for (const listener of this.listeners) {
      listener(dt);
    }
  }
}
