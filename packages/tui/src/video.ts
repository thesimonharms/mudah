import { encodeHalfBlocks, encodeKittyImage, type PixelFormat } from '@mudah-cli/terminal';
import type { KeyEvent } from '@mudah-cli/terminal';
import { BaseComponent } from './component.js';

const BLOCKS = ' ░▒▓█';

/**
 * Half-block / Kitty frame player with play/pause/seek and an optional
 * audio mixer callback (sample offset = frameIndex / fps).
 */
export interface RgbaFrame {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly format?: PixelFormat;
}

export interface VideoPlayerOptions {
  /** Pre-rendered ASCII/half-block rows. */
  frames?: string[][];
  /** Raw pixel frames (Kitty or half-block). */
  pixels?: RgbaFrame[];
  fps?: number;
  kitty?: boolean;
  /** Called when the playhead moves, with seconds and a PCM sample offset. */
  onAudio?: (seconds: number, sampleOffset: number, sampleRate: number) => void;
  sampleRate?: number;
}

/**
 * ASCII frame list kept for demos. Prefer {@link VideoPlayer} for playback.
 */
export class VideoFrames {
  readonly frames: string[][];

  constructor(frames: string[][]) {
    this.frames = frames;
  }

  play(index: number): string[] {
    if (this.frames.length === 0) return [];
    const i = ((index % this.frames.length) + this.frames.length) % this.frames.length;
    return this.frames[i] ?? [];
  }

  static demo(count = 4): VideoFrames {
    const frames: string[][] = [];
    for (let i = 0; i < count; i++) {
      const ch = BLOCKS[1 + (i % (BLOCKS.length - 1))] ?? '█';
      frames.push([ch + ch + ch + ch, ch + ch + ch + ch]);
    }
    return new VideoFrames(frames);
  }
}

export class VideoPlayer extends BaseComponent {
  readonly focusable = true;
  readonly keys = { space: 'pause', left: 'back', right: 'fwd' };
  paused = false;
  index = 0;
  private elapsed = 0;
  private readonly fps: number;
  private readonly kitty: boolean;
  private readonly ascii: string[][];
  private readonly pixels: RgbaFrame[];
  private readonly onAudio?: VideoPlayerOptions['onAudio'];
  private readonly sampleRate: number;

  constructor(options: VideoPlayerOptions = {}) {
    super();
    this.ascii = options.frames ?? VideoFrames.demo().frames;
    this.pixels = options.pixels ?? [];
    this.fps = Math.max(1, options.fps ?? 12);
    this.kitty = options.kitty === true;
    this.onAudio = options.onAudio;
    this.sampleRate = options.sampleRate ?? 44_100;
  }

  get length(): number {
    return this.pixels.length > 0 ? this.pixels.length : this.ascii.length;
  }

  get seconds(): number {
    return this.index / this.fps;
  }

  tick(dtMs: number): void {
    if (this.paused || this.length === 0) return;
    this.elapsed += dtMs;
    const frameMs = 1000 / this.fps;
    while (this.elapsed >= frameMs) {
      this.elapsed -= frameMs;
      this.seek(this.index + 1);
    }
  }

  seek(index: number): void {
    if (this.length === 0) {
      this.index = 0;
      return;
    }
    this.index = ((index % this.length) + this.length) % this.length;
    this.onAudio?.(this.seconds, Math.floor(this.seconds * this.sampleRate), this.sampleRate);
  }

  toggle(): void {
    this.paused = !this.paused;
  }

  render(): string[] {
    const current = this.pixels[this.index];
    if (current) {
      if (this.kitty) {
        const rows = Math.max(1, Math.ceil(current.height / 2));
        return Array.from({ length: rows }, () => '');
      }
      return encodeHalfBlocks(current.pixels, current.width, current.height, current.format);
    }
    const rows = this.ascii[this.index] ?? this.ascii[0] ?? [];
    const status = this.paused ? 'paused' : 'play';
    return [...rows, `${status}  ${this.index + 1}/${this.length}  ${this.seconds.toFixed(2)}s`];
  }

  paintExtras(stream: { write(data: string): unknown }, x: number, y: number): void {
    const current = this.pixels[this.index];
    if (!this.kitty || !current) return;
    stream.write(`\x1b[${y + 1};${x + 1}H`);
    stream.write(
      encodeKittyImage({
        pixels: current.pixels,
        width: current.width,
        height: current.height,
        format: current.format,
        id: 42,
        placementId: 1,
      }),
    );
  }

  override onKey(event: KeyEvent): boolean {
    switch (event.name) {
      case 'space':
        this.toggle();
        return true;
      case 'left':
        this.seek(this.index - 1);
        this.paused = true;
        return true;
      case 'right':
        this.seek(this.index + 1);
        this.paused = true;
        return true;
      default:
        return false;
    }
  }

  inspect() {
    return {
      role: 'video',
      value: { index: this.index, paused: this.paused, fps: this.fps, seconds: this.seconds },
    };
  }
}
