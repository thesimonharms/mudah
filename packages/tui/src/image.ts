import { encodeHalfBlocks, encodeKittyImage, type PixelFormat } from '@mudah-cli/terminal';
import { BaseComponent } from './component.js';

export interface ImageOptions {
  pixels: Uint8Array;
  width: number;
  height: number;
  format?: PixelFormat;
  columns?: number;
  rows?: number;
  /** Use Kitty graphics. False (default) draws half-blocks so every terminal works. */
  kitty?: boolean;
}

/** Pixel image. Kitty APC when `kitty` is true, half-blocks otherwise. */
export class Image extends BaseComponent {
  constructor(private options: ImageOptions) {
    super();
  }

  render(): string[] {
    if (this.options.kitty) {
      const rows = this.options.rows ?? Math.ceil(this.options.height / 2);
      return Array.from({ length: rows }, () => '');
    }
    return encodeHalfBlocks(this.options.pixels, this.options.width, this.options.height, this.options.format);
  }

  paintExtras(stream: { write(data: string): unknown }, x: number, y: number): void {
    if (!this.options.kitty) return;
    stream.write(`\x1b[${y + 1};${x + 1}H`);
    stream.write(
      encodeKittyImage({
        pixels: this.options.pixels,
        width: this.options.width,
        height: this.options.height,
        format: this.options.format,
        columns: this.options.columns,
        rows: this.options.rows,
      }),
    );
  }

  inspect(): { role: string } {
    return { role: 'image' };
  }

  readonly focusable = false;
}
