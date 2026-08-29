import {
  KittyGraphics,
  detectCapabilities,
  encodeHalfBlocks,
  type OscWriter,
  type PixelFormat,
  type TerminalCapabilities,
} from '@mudah-cli/terminal';

export type PresentMode = 'auto' | 'kitty' | 'half';

export interface FramePresenterOptions {
  stdout?: OscWriter;
  capabilities?: TerminalCapabilities;
  /** Default `auto`: Kitty graphics when the terminal speaks it. */
  mode?: PresentMode;
  format?: PixelFormat;
  /** Image id reused every frame so the placement replaces in place. */
  id?: number;
}

/**
 * Blit an RGBA/RGB framebuffer to the terminal. Prefers the Kitty graphics
 * protocol; falls back to unicode half-blocks on terminals that cannot
 * place images.
 */
export class FramePresenter {
  private readonly writer: OscWriter;
  readonly mode: Exclude<PresentMode, 'auto'>;
  private readonly format: PixelFormat;
  private readonly gfx: KittyGraphics;

  constructor(options: FramePresenterOptions = {}) {
    this.writer = options.stdout ?? process.stdout;
    const caps = options.capabilities ?? detectCapabilities();
    const requested = options.mode ?? 'auto';
    this.mode =
      requested === 'auto' ? (caps.kittyGraphics ? 'kitty' : 'half') : requested;
    this.format = options.format ?? 'rgba';
    this.gfx = new KittyGraphics(this.writer, { id: options.id ?? 1 });
  }

  /**
   * Draw `pixels` at the current cursor. For Kitty mode, pass `columns` /
   * `rows` to scale the image into the cell grid.
   */
  present(
    pixels: Uint8Array,
    width: number,
    height: number,
    layout: { columns?: number; rows?: number } = {},
  ): void {
    if (this.mode === 'kitty') {
      this.gfx.draw(pixels, width, height, {
        format: this.format,
        columns: layout.columns,
        rows: layout.rows,
      });
      return;
    }
    const lines = encodeHalfBlocks(pixels, width, height, this.format);
    this.writer.write(lines.join('\n'));
    this.writer.write('\n');
  }

  clear(): void {
    if (this.mode === 'kitty') this.gfx.delete(true);
  }
}
