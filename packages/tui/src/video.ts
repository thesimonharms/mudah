const BLOCKS = ' ░▒▓█';

/**
 * Half-block-ish ASCII frame player. Not a codec — feed pre-rendered
 * frames and `play(index)` returns that frame (wrapping).
 */
export class VideoFrames {
  readonly frames: string[][];

  constructor(frames: string[][]) {
    this.frames = frames;
  }

  /** Frame at `index`, wrapping. Empty list yields `[]`. */
  play(index: number): string[] {
    if (this.frames.length === 0) return [];
    const i = ((index % this.frames.length) + this.frames.length) % this.frames.length;
    return this.frames[i] ?? [];
  }

  /**
   * A tiny pulsing block used by demos when no real frames exist.
   * Each frame is 4×2 half-block cells.
   */
  static demo(count = 4): VideoFrames {
    const frames: string[][] = [];
    for (let i = 0; i < count; i++) {
      const ch = BLOCKS[1 + (i % (BLOCKS.length - 1))] ?? '█';
      frames.push([ch + ch + ch + ch, ch + ch + ch + ch]);
    }
    return new VideoFrames(frames);
  }
}
