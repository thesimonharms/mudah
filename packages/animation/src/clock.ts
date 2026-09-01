/**
 * Frame-rate independent animation clock. Callers animate from `dtMs`
 * rather than assuming a fixed interval. `now` is injectable so tests
 * can drive time without fake timers.
 */
export interface AnimationClockOptions {
  /** Clock source. Defaults to `performance.now`. */
  now?: () => number;
  /** Interval used by `start()` / `stop()`. Default 60. */
  fps?: number;
}

export class AnimationClock {
  private readonly nowFn: () => number;
  private readonly fps: number;
  private readonly listeners = new Set<(dtMs: number) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;

  constructor(options: AnimationClockOptions = {}) {
    this.nowFn = options.now ?? (() => performance.now());
    this.fps = options.fps ?? 60;
  }

  /** Current time from the injected (or real) clock. */
  now(): number {
    return this.nowFn();
  }

  onFrame(fn: (dtMs: number) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Deliver a delta-time frame. Safe to call from tests without `start()`. */
  tick(dtMs: number): void {
    for (const listener of this.listeners) {
      listener(dtMs);
    }
  }

  start(): void {
    if (this.timer) return;
    this.lastTick = this.nowFn();
    this.timer = setInterval(() => {
      const current = this.nowFn();
      const dt = current - this.lastTick;
      this.lastTick = current;
      this.tick(dt);
    }, Math.round(1000 / this.fps));
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
