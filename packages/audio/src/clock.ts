export interface BpmClockOptions {
  bpm?: number;
  /** Clock source in milliseconds. Used only as a fallback when `tick` is not driven. */
  now?: () => number;
}

/**
 * Beat/tempo clock. `tick(dtMs)` advances time; `now()` is the phase inside
 * the current beat (0..1). `onBeat` fires each time the integer beat increases.
 */
export class BpmClock {
  bpm: number;
  private elapsedMs = 0;
  private lastBeat = -1;
  private readonly listeners = new Set<(beat: number) => void>();

  constructor(options: BpmClockOptions = {}) {
    this.bpm = options.bpm ?? 120;
  }

  /** Phase of the current beat, 0 inclusive to 1 exclusive. */
  now(): number {
    const beat = this.beatPosition();
    const frac = beat - Math.floor(beat);
    return frac < 0 ? 0 : frac;
  }

  /** Whole beats elapsed since start (0-based). */
  get beat(): number {
    return Math.floor(this.beatPosition());
  }

  onBeat(fn: (beat: number) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Advance the clock and fire beat listeners when a new beat starts. */
  tick(dtMs: number): void {
    this.elapsedMs += dtMs;
    this.flushBeats();
  }

  reset(): void {
    this.elapsedMs = 0;
    this.lastBeat = -1;
  }

  private beatPosition(): number {
    const beatMs = 60_000 / Math.max(this.bpm, 1e-6);
    return this.elapsedMs / beatMs;
  }

  private flushBeats(): void {
    const current = Math.floor(this.beatPosition());
    while (this.lastBeat < current) {
      this.lastBeat += 1;
      for (const listener of this.listeners) listener(this.lastBeat);
    }
  }
}
